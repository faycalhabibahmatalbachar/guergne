/**
 * Provisionnement de la liste blanche : numéro autorisé → compte guergné réel.
 *
 * CE QUE FAIT CE SCRIPT
 * ----------------------
 *   1. lit la liste blanche PRIVÉE (`identites-autorisees.json`, hors Git) ;
 *   2. cherche chaque numéro dans la source faisant autorité — la base de la
 *      plateforme — en LECTURE SEULE ;
 *   3. tranche avec `resolution-comptes.js` : inconnu, ambigu, inactif,
 *      rôle refusé, ou bon ;
 *   4. construit les liaisons avec `IdentityStorePersistant.lier()`, donc avec
 *      un auteur réel et une trace ;
 *   5. avec `--ecrire`, dépose le fichier sur le volume persistant du serveur.
 *
 * CE QU'IL NE FAIT JAMAIS
 * ------------------------
 *   - inventer un compte, un rôle ou un identifiant ;
 *   - écrire quoi que ce soit dans la base de la plateforme ;
 *   - afficher un numéro complet, ici ou dans un journal ;
 *   - écraser une liaison active vers un autre compte ;
 *   - bloquer toute la liste parce qu'une entrée ne se résout pas.
 *
 *   node agent/scripts/resoudre-identites.mjs                      # rapport seul
 *   node agent/scripts/resoudre-identites.mjs --auteur <email>     # choisit l'auteur
 *   node agent/scripts/resoudre-identites.mjs --ecrire             # depose sur le serveur
 */
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import SftpClient from "ssh2-sftp-client";

import { IdentityStorePersistant, masquer } from "../src/identity-store.js";
import {
  ROLES_PILOTES,
  canoniser,
  resoudreCompteAutorise,
  resoudreViaPersonnel,
  verifierAuteur,
} from "../src/resolution-comptes.js";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ECRIRE = process.argv.includes("--ecrire");
// `indexOf` rend -1 quand l'option est absente, et `argv[0]` est le chemin de
// Node : sans ce garde, le script cherchait un compte nomme « node.exe ».
const iAuteur = process.argv.indexOf("--auteur");
const auteurDemande = iAuteur === -1 ? "" : (process.argv[iAuteur + 1] || "").trim();

function lireEnv(chemin) {
  const abs = resolve(racine, chemin);
  if (!existsSync(abs)) return {};
  const d = {};
  for (const ligne of readFileSync(abs, "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
    const s = ligne.trim();
    if (!s || s.startsWith("#") || !s.includes("=")) continue;
    const [c, ...r] = s.split("=");
    d[c.trim()] = r.join("=").trim().replace(/^["']|["']$/g, "");
  }
  return d;
}

// --- 1. Liste blanche privée ----------------------------------------------
const fichierListe = resolve(racine, "identites-autorisees.json");
if (!existsSync(fichierListe)) {
  console.error("[liste] identites-autorisees.json introuvable.");
  console.error("[liste] ce fichier est PRIVE et hors Git : il doit etre cree a la main.");
  process.exit(1);
}
const liste = JSON.parse(readFileSync(fichierListe, "utf8")).autorisees ?? [];
console.log(`[liste] ${liste.length} numero(s) autorise(s) — source privee, hors Git`);

// Doublons : deux entrées pour un même abonné rendraient la liste ambiguë.
const vus = new Map();
for (const e of liste) {
  const n = canoniser(e.numero);
  if (vus.has(n)) console.warn(`[liste] DOUBLON : ${masquer(n)} apparait plusieurs fois`);
  vus.set(n, e);
}

// --- 2. Source faisant autorité, en lecture seule -------------------------
const url = lireEnv("web/.env.local").DATABASE_URL;
if (!url) {
  console.error("[base] DATABASE_URL introuvable dans web/.env.local.");
  process.exit(1);
}
let hote = "?";
try {
  hote = new URL(url).hostname;
} catch {
  /* laissé tel quel */
}
console.log(`[base] source autoritaire : ${hote} — LECTURE SEULE`);

const client = new pg.Client({ connectionString: url });
await client.connect();

/**
 * Comptes dont le téléphone correspond, toutes tables confondues.
 *
 * La comparaison porte sur les 8 derniers chiffres : la base peut stocker
 * « +235 68 ... » quand WhatsApp présente « 23568... ». Comparer les chaînes
 * brutes ferait passer pour inconnu un numéro pourtant présent.
 */
/**
 * Compte DÉSIGNÉ explicitement dans la liste blanche (`"compte": "email"` ou
 * un identifiant).
 *
 * C'est le chemin normal dès que le numéro WhatsApp d'un personnel n'est pas
 * celui inscrit sur sa fiche : le numéro est un moyen de joindre l'agent,
 * l'administrateur dit au nom de quel compte il parle. On vérifie quand même
 * que ce compte existe vraiment, qu'il est actif et que son rôle convient —
 * la désignation ne dispense d'aucun contrôle.
 */
async function compteDesigne(designation) {
  const { rows } = await client.query(
    `select id, nom, prenom, role::text as role, actif, telephone, 'utilisateurs' as source
       from utilisateurs
      where lower(coalesce(email,'')) = lower($1)
         or id::text = $1`,
    [String(designation).trim()],
  );
  return rows;
}

/**
 * Fiches de personnel portant ce numéro, avec le compte que l'établissement y a
 * rattaché.
 *
 * Les deux annuaires sont interrogés : `personnels_non_enseignants`
 * (administratif et technique) et `enseignants`. C'est la source faisant
 * autorité pour un agent de l'établissement — pas la table des comptes, dont
 * les numéros se sont révélés en collision avec ceux de l'annuaire.
 */
async function personnelsPour(numero) {
  const fin = canoniser(numero).slice(-8);
  const { rows } = await client.query(
    `select p.id, p.nom, p.prenom, p.fonction, p.actif, p.utilisateur_id,
            u.role::text as role, u.actif as compte_actif, 'administratif' as source
       from personnels_non_enseignants p
       left join utilisateurs u on u.id = p.utilisateur_id
      where right(regexp_replace(coalesce(p.telephone,''), '\\D', '', 'g'), 8) = $1
      union all
     select e.id, e.nom, e.prenom, 'ENSEIGNANT' as fonction, e.actif, e.utilisateur_id,
            u.role::text as role, u.actif as compte_actif, 'enseignant' as source
       from enseignants e
       left join utilisateurs u on u.id = e.utilisateur_id
      where right(regexp_replace(coalesce(e.telephone,''), '\\D', '', 'g'), 8) = $1`,
    [fin],
  );
  return rows.map((r) => ({
    id: r.id,
    nom: r.nom,
    prenom: r.prenom,
    fonction: r.fonction,
    actif: r.actif,
    source: r.source,
    compte: r.utilisateur_id ? { id: r.utilisateur_id, role: r.role, actif: r.compte_actif } : null,
  }));
}

/**
 * Comptes portant ce numéro SANS être le compte rattaché à la fiche.
 *
 * Ils ne servent jamais à résoudre : seulement à signaler qu'un même numéro
 * désigne deux personnes dans la plateforme — une anomalie à corriger.
 */
async function collisionsPour(numero, compteRetenu) {
  const fin = canoniser(numero).slice(-8);
  const { rows } = await client.query(
    `select id, nom, prenom, role::text as role, actif
       from utilisateurs
      where telephone is not null
        and right(regexp_replace(telephone, '\\D', '', 'g'), 8) = $1`,
    [fin],
  );
  return rows.filter((r) => r.id !== compteRetenu);
}

// --- 3. Auteur du provisionnement -----------------------------------------
// `lier()` exige un auteur, et « system » ne répond de rien devant personne.
let auteur = null;
if (auteurDemande) {
  const { rows } = await client.query(
    `select id, nom, prenom, role::text as role, actif from utilisateurs
      where lower(email) = lower($1)
         or right(regexp_replace(coalesce(telephone,''), '\\D', '', 'g'), 8) = right($1, 8)`,
    [auteurDemande],
  );
  auteur = rows[0] ?? null;
} else {
  // À défaut, le compte d'administration de l'établissement.
  const { rows } = await client.query(
    `select id, nom, prenom, role::text as role, actif from utilisateurs
      where role in ('SUPER_ADMIN','DIRECTION') and actif order by role, cree_le limit 5`,
  );
  auteur = rows[0] ?? null;
  if (rows.length > 1) {
    console.log(`[auteur] ${rows.length} comptes autorisants possibles ; precisez avec --auteur <email>`);
    for (const r of rows) console.log(`           ${r.role.padEnd(12)} ${r.prenom} ${r.nom}`);
  }
}

const verdictAuteur = verifierAuteur(auteur);
if (!verdictAuteur.ok) {
  console.error(`[auteur] ARRET : ${verdictAuteur.raison}`);
  console.error("[auteur] aucune liaison ne sera creee : une liaison sans auteur reel n'est pas auditable.");
  await client.end();
  process.exit(1);
}
console.log(`[auteur] ${auteur.role} ${auteur.prenom} ${auteur.nom} (${auteur.id})`);

// --- 4. Résolution, entrée par entrée -------------------------------------
console.log(`\n[resolution] roles autorises a piloter l'agent : ${ROLES_PILOTES.join(", ")}`);
const resultats = [];
for (const entree of liste) {
  const n = canoniser(entree.numero);
  const designe = entree.compte ? String(entree.compte).trim() : null;
  let r;
  try {
    if (designe) {
      // Désignation explicite : l'administrateur dit au nom de quel compte ce
      // numéro parle. Les contrôles restent entiers.
      const candidats = await compteDesigne(designe);
      if (candidats.length === 0) {
        console.log(`  ${masquer(n)}  INCONNU            le compte designe « ${designe} » n'existe pas`);
        resultats.push({ numero: n, statut: "inconnu", raison: `compte designe introuvable : ${designe}` });
        continue;
      }
      r = resoudreCompteAutorise({ numero: n, candidats });
    } else {
      const personnels = await personnelsPour(n);
      const pre = resoudreViaPersonnel({ numero: n, personnels });
      r = { ...pre, collisions: await collisionsPour(n, pre.compte?.id) };
    }
  } catch (e) {
    console.log(`  ${masquer(n)}  ECHEC DE LECTURE — ${e.message.slice(0, 80)}`);
    resultats.push({ numero: n, statut: "erreur_lecture", raison: e.message });
    continue; // une entrée impossible à lire ne bloque pas les autres
  }

  resultats.push({ numero: n, ...r, designe });
  const compte = r.compte ? `${r.compte.role} ${r.compte.prenom ?? ""} ${r.compte.nom ?? ""}`.trim() : "-";
  console.log(`  ${masquer(n)}  ${r.statut.toUpperCase().padEnd(22)} ${compte.padEnd(30)} ${r.raison}`);
  for (const col of r.collisions ?? []) {
    // Deux personnes derriere un meme numero : anomalie a corriger dans la
    // plateforme, et raison pour laquelle on ne resout jamais par telephone.
    console.log(`  ${" ".repeat(11)}  COLLISION : un compte ${col.role} (${col.prenom} ${col.nom}) porte aussi ce numero`);
  }
}

await client.end();

// --- 5. Construction des liaisons ------------------------------------------
// On passe par le vrai magasin : le format du fichier ne peut pas diverger de
// ce que le service lira, et chaque liaison est tracée comme en production.
const dossierTmp = resolve(racine, "agent/.tmp-identites");
rmSync(dossierTmp, { recursive: true, force: true });
mkdirSync(dossierTmp, { recursive: true });
const fichierLocal = resolve(dossierTmp, "identites.json");

const journal = [];
const magasin = new IdentityStorePersistant({ chemin: fichierLocal, journal: (e) => journal.push(e) });

let liees = 0;
for (const r of resultats) {
  if (r.statut !== "ok") continue;
  const res = magasin.lier({
    numero: r.numero,
    utilisateurId: r.compte.id,
    nom: `${r.compte.prenom} ${r.compte.nom}`,
    role: r.compte.role,
    parQui: auteur.id,
  });
  if (res.ok) liees += 1;
  else console.log(`  ${masquer(r.numero)}  NON LIE — ${res.raison}`);
}

const parStatut = {};
for (const r of resultats) parStatut[r.statut] = (parStatut[r.statut] ?? 0) + 1;

console.log("\n=== SYNTHESE (aucun numero complet) ===");
console.log(`  entrees              : ${resultats.length}`);
console.log(`  numeros valides      : ${resultats.filter((r) => r.statut !== "numero_invalide").length}`);
console.log(`  comptes resolus      : ${resultats.filter((r) => r.compte).length}`);
console.log(`  liaisons actives     : ${magasin.nombreActives}`);
console.log(`  en attente           : ${resultats.length - liees}`);
console.log(`  detail par statut    : ${JSON.stringify(parStatut)}`);
console.log(`  journal d'audit      : ${journal.length} evenement(s), numeros masques`);

if (!ECRIRE) {
  console.log(`\n[plan] ${liees} liaison(s) seraient deposees dans donnees/identites.json`);
  console.log("[plan] relancer avec --ecrire pour deposer reellement.");
  process.exit(0);
}

if (liees === 0) {
  console.error("\n[depot] rien a deposer : aucune liaison resolue.");
  process.exit(1);
}

// --- 6. Dépôt sur le volume persistant ------------------------------------
const c = lireEnv("altare.env");
const sftp = new SftpClient();
const distant = `${c.ALTARE_REMOTE_DIR || "/home/container"}/donnees/identites.json`;
try {
  await sftp.connect({
    host: String(c.ALTARE_SFTP_HOST || "").replace(/^sftp:\/\//, "").split(":")[0],
    port: Number(c.ALTARE_SFTP_PORT || 2022),
    username: c.ALTARE_SFTP_USER,
    password: c.ALTARE_SFTP_PASSWORD,
    readyTimeout: Number(process.env.ALTARE_READY_TIMEOUT_MS ?? 120_000),
  });

  // Sauvegarde avant toute modification des données persistantes, et refus
  // d'écraser des liaisons actives que nous n'aurions pas reconstituées.
  const ancien = await sftp
    .get(distant)
    .then((b) => b.toString("utf8"))
    .catch(() => null);
  if (ancien) {
    const actives = JSON.parse(ancien).filter((a) => !a.revoqueLe);
    console.log(`[depot] fichier distant existant : ${actives.length} liaison(s) active(s)`);
    const sauvegarde = `${distant}.sauvegarde-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    await sftp.put(Buffer.from(ancien, "utf8"), sauvegarde);
    console.log(`[depot] sauvegarde : ${sauvegarde}`);
    const nouvelles = new Set([...Array(0)].concat(resultats.filter((r) => r.statut === "ok").map((r) => r.numero)));
    const perdues = actives.filter((a) => !nouvelles.has(a.numero));
    if (perdues.length) {
      console.error(`[depot] ARRET : ${perdues.length} liaison(s) active(s) disparaitraient.`);
      console.error("[depot] ajoutez-les a la liste blanche, ou revoquez-les explicitement.");
      process.exitCode = 3;
      await sftp.end().catch(() => {});
      process.exit(3);
    }
  }

  await sftp.put(fichierLocal, distant);
  await sftp.chmod(distant, 0o600).catch(() => {});
  const info = await sftp.stat(distant);
  console.log(`[depot] depose : ${distant} (${info.size} octets, mode ${(info.mode & 0o777).toString(8)})`);
  console.log("[depot] prise en compte au PROCHAIN demarrage du service.");
} catch (e) {
  console.error(`[depot] echec : ${e.message ?? "erreur inconnue"}`);
  process.exitCode = 2;
} finally {
  await sftp.end().catch(() => {});
  rmSync(dossierTmp, { recursive: true, force: true });
}
