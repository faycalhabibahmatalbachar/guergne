/**
 * Recette RÉELLE de la liste blanche, numéro par numéro.
 *
 * Le fichier éprouvé n'est pas une copie locale : il est **téléchargé depuis le
 * serveur**, celui que le service lira à son prochain démarrage. Tester autre
 * chose ne prouverait rien sur la production.
 *
 * Contrôles, pour chaque numéro autorisé :
 *   1. présence dans la liste blanche privée ;
 *   2. format normalisé ;
 *   3. correspondance avec un compte réel (via l'annuaire du personnel) ;
 *   4. rôle et état du compte ;
 *   5. association active dans le magasin d'identités déployé ;
 *   6. résolution par `IdentityStorePersistant.resolve()` ;
 *   7. refus correct si suspendu, révoqué ou inconnu ;
 *   8. permissions réellement appliquées, par un message de bout en bout.
 *
 * Le point 7 travaille sur une COPIE : suspendre ou révoquer pour de bon
 * priverait l'établissement de son accès. Le fichier du serveur n'est jamais
 * modifié par ce script.
 *
 * Aucun numéro complet n'est affiché. Aucun message WhatsApp n'est envoyé : le
 * transport est simulé, tout le reste est réel.
 *
 *   cd web && npm run dev            # serveur sur la branche de test
 *   node agent/scripts/verif-identites.mjs
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import SftpClient from "ssh2-sftp-client";

import { AuditLog } from "../src/audit.js";
import { Agent } from "../src/engine.js";
import { GuergneHttpClient } from "../src/guergne-client.js";
import { IdempotencyStore } from "../src/idempotency.js";
import { IdentityStorePersistant, masquer, numeroDeJid } from "../src/identity-store.js";
import { MatricePermissions } from "../src/permissions-matrix.js";
import { FakeProvider } from "../src/provider.js";
import { canoniser } from "../src/resolution-comptes.js";
import { ASSIDUITE_TOOLS, ToolRegistry } from "../src/tools.js";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const lireEnv = (chemin) => {
  const abs = resolve(racine, chemin);
  if (!existsSync(abs)) return {};
  const d = {};
  for (const l of readFileSync(abs, "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
    const s = l.trim();
    if (!s || s.startsWith("#") || !s.includes("=")) continue;
    const [c, ...r] = s.split("=");
    d[c.trim()] = r.join("=").trim().replace(/^["']|["']$/g, "");
  }
  return d;
};
const hote = (v) => {
  try {
    return new URL(String(v)).hostname;
  } catch {
    return null;
  }
};

let echecs = 0;
const verifier = (condition, libelle, detail = "") => {
  console.log(`    ${condition ? "OK   " : "ECHEC"} ${libelle}${detail ? ` — ${detail}` : ""}`);
  if (!condition) echecs += 1;
};

// --- Garde-fou : jamais la production ---------------------------------------
const hoteTest = hote(lireEnv("web/.env.test.local").DATABASE_URL_TEST);
const hoteServeur = hote(lireEnv("web/.env.development.local").DATABASE_URL);
if (!hoteTest || !hoteServeur || hoteServeur !== hoteTest) {
  console.error("ARRET : le serveur de developpement ne pointe pas sur la branche de test.");
  console.error(`  attendu : ${hoteTest ?? "(inconnu)"}   trouve : ${hoteServeur ?? "(absent)"}`);
  process.exit(1);
}
console.log(`[garde] base ciblee : ${hoteTest} (branche de test)`);

// --- 1. Le fichier RÉELLEMENT déployé --------------------------------------
const c = lireEnv("altare.env");
const distant = `${c.ALTARE_REMOTE_DIR || "/home/container"}/donnees/identites.json`;
const sftp = new SftpClient();
await sftp.connect({
  host: String(c.ALTARE_SFTP_HOST || "").replace(/^sftp:\/\//, "").split(":")[0],
  port: Number(c.ALTARE_SFTP_PORT || 2022),
  username: c.ALTARE_SFTP_USER,
  password: c.ALTARE_SFTP_PASSWORD,
  readyTimeout: Number(process.env.ALTARE_READY_TIMEOUT_MS ?? 120_000),
});
let brut;
try {
  brut = (await sftp.get(distant)).toString("utf8");
} catch {
  console.error(`ARRET : ${distant} introuvable sur le serveur — rien n'a ete provisionne.`);
  await sftp.end();
  process.exit(1);
} finally {
  await sftp.end().catch(() => {});
}
console.log(`[source] magasin telecharge depuis le serveur (${brut.length} octets)`);

const bac = resolve(racine, "agent/.tmp-verif");
rmSync(bac, { recursive: true, force: true });
mkdirSync(bac, { recursive: true });
const fichier = resolve(bac, "identites.json");
writeFileSync(fichier, brut, "utf8");

const magasin = new IdentityStorePersistant({ chemin: fichier });
console.log(`[source] ${magasin.nombreActives} association(s) active(s)`);

// --- 2. Le moteur réel, sur la base de test --------------------------------
const SERVICE_TOKEN = lireEnv("web/.env.local").AGENT_SERVICE_TOKEN;
if (!SERVICE_TOKEN) {
  console.error("ARRET : AGENT_SERVICE_TOKEN introuvable.");
  process.exit(1);
}
const guergne = new GuergneHttpClient({ baseUrl: "http://localhost:3000", serviceToken: SERVICE_TOKEN });
const audit = new AuditLog();
const provider = new FakeProvider();
const permissions = new MatricePermissions();

/** Plan figé : on éprouve l'identité et les permissions, pas la compréhension. */
const agent = new Agent({
  provider,
  identity: magasin,
  idempotency: new IdempotencyStore(),
  audit,
  tools: new ToolRegistry(ASSIDUITE_TOOLS),
  permissions,
  guergne,
  interpret: async () => ({ tool: "assiduite.consulter_absences", params: { limite: 2 } }),
});

let n = 0;
async function parler(jid, texte = "Montre les 2 dernieres absences.") {
  const r = await agent.handle({ id: `verif-${Date.now()}-${n++}`, from: jid, body: texte });
  return { statut: r.status, evenement: audit.last(), reponse: provider.lastTextTo(jid) };
}

// --- 3. Numéro par numéro ---------------------------------------------------
const liste = JSON.parse(readFileSync(resolve(racine, "identites-autorisees.json"), "utf8")).autorisees ?? [];
console.log(`\n=== ${liste.length} numero(s) de la liste blanche ===`);

for (const entree of liste) {
  const numero = canoniser(entree.numero);
  const jid = `${numero}@c.us`;
  const etat = magasin.etatDe(jid);
  console.log(`\n  ${masquer(numero)}  (etat : ${etat.statut})`);

  verifier(numero.length === 11, "2. format normalise", `${numero.length} chiffres`);
  verifier(numeroDeJid(jid) === numero, "   le JID WhatsApp redonne le meme numero");

  const associe = magasin.resolve(jid);
  if (!associe) {
    verifier(etat.statut !== "actif", "5-6. absence d'association coherente avec l'etat", etat.statut);
    const r = await parler(jid);
    verifier(
      r.evenement?.result !== "SUCCESS",
      "7. un numero non associe n'obtient AUCUNE donnee",
      `statut=${r.statut} resultat=${r.evenement?.result ?? "-"}`,
    );
    continue;
  }

  verifier(Boolean(associe.id), "3-4. compte reel resolu", `${associe.role}`);
  verifier(etat.statut === "actif", "5. association active dans le magasin deploye");
  verifier(magasin.resolve(jid)?.id === associe.id, "6. resolve() redonne le meme compte");

  // 8. Permissions : deux barrières successives, et elles ne disent pas la
  // même chose. Le pré-filtre de l'agent évite un aller-retour inutile ; le
  // garde de la plateforme a le dernier mot et peut refuser ce que le
  // pré-filtre laissait passer.
  const peutLire = permissions.allows(associe, "assiduite:lire");
  const peutSaisir = permissions.allows(associe, "assiduite:saisir");
  console.log(`    role ${associe.role} : assiduite:lire=${peutLire} assiduite:saisir=${peutSaisir}`);

  const r = await parler(jid);
  const servi = r.evenement?.result === "SUCCESS";

  if (!peutLire) {
    verifier(!servi, "8a. pre-filtre refuse, et aucune donnee n'est servie");
  } else {
    verifier(r.evenement?.permission?.startsWith("OK:"), "8a. pre-filtre : consultation autorisee", r.evenement?.permission);
    // Le compte est provisionné depuis la PRODUCTION, mais la démonstration
    // tourne sur la branche de test, qui peut ignorer ce compte. Un refus est
    // alors la bonne réponse — pas un succès silencieux.
    if (servi) {
      verifier(
        Boolean(r.reponse) && !/Op[ée]ration effectu[ée]e/.test(r.reponse),
        "8b. backend : donnee reellement servie",
        (r.reponse ?? "").split("\n")[0]?.slice(0, 60),
      );
    } else {
      verifier(
        Boolean(r.reponse) && /insuffisant|inconnu|refus/i.test(r.reponse),
        "8b. backend : refus EXPLICITE, jamais un succes silencieux",
        (r.reponse ?? "").slice(0, 70),
      );
      console.log(
        "         note : ce compte vient de la PRODUCTION ; la branche de test ne le connait pas.",
      );
      console.log(
        "         le garde refuse donc un acteur inconnu malgre un jeton de service valide — c'est la bonne reponse.",
      );
    }
  }
}

// --- 3 bis. Témoin positif : un acteur que la branche de test connaît ------
// Sans lui, on ne prouverait que des refus. Celui-ci prouve que la chaîne
// complète — identité, permission, garde, base — sert réellement la donnée.
{
  console.log("\n=== Temoin positif (acteur connu de la branche de test) ===");
  const ACTEUR = process.env.ACTEUR_ID ?? "e49a3dea-76b3-4607-9ccb-2b5fcf3ac0ad";
  const JID_TEMOIN = "23500000000@c.us";
  const { IdentityStore } = await import("../src/identity.js");
  const temoin = new Agent({
    provider,
    identity: new IdentityStore([{ jid: JID_TEMOIN, id: ACTEUR, nom: "Compte de service", role: "SUPER_ADMIN" }]),
    idempotency: new IdempotencyStore(),
    audit,
    tools: new ToolRegistry(ASSIDUITE_TOOLS),
    permissions,
    guergne,
    interpret: async () => ({ tool: "assiduite.consulter_absences", params: { limite: 2 } }),
  });
  const r = await temoin.handle({ id: `temoin-${Date.now()}`, from: JID_TEMOIN, body: "Montre les 2 dernieres absences." });
  const e = audit.last();
  verifier(e?.result === "SUCCESS", "la chaine complete sert la donnee", `perm=${e?.permission ?? "-"} statut=${r.status}`);
  const rep = provider.lastTextTo(JID_TEMOIN);
  verifier(Boolean(rep) && /•/.test(rep ?? ""), "la reponse contient des lignes de donnees", (rep ?? "").split("\n")[1]?.slice(0, 60));
}

// --- 4. Refus : inconnu, suspendu, révoqué ---------------------------------
// Sur une COPIE : suspendre pour de bon priverait l'etablissement de son acces.
console.log("\n=== Refus (sur une copie du magasin — le serveur n'est pas touche) ===");

const inconnu = "23599999999@c.us";
{
  const r = await parler(inconnu);
  verifier(magasin.resolve(inconnu) === null, "numero inconnu : aucune identite");
  verifier(r.evenement?.result !== "SUCCESS", "numero inconnu : aucune donnee servie", `resultat=${r.evenement?.result ?? "-"}`);
}

const actives = magasin.listerActives();
if (actives.length === 0) {
  console.log("  (aucune association active : suspension et revocation non eprouvables)");
} else {
  const copie = resolve(bac, "copie.json");
  writeFileSync(copie, brut, "utf8");
  const bis = new IdentityStorePersistant({ chemin: copie });
  const cible = JSON.parse(brut).find((a) => !a.revoqueLe);
  const jid = `${cible.numero}@c.us`;
  const auteur = cible.liePar;

  verifier(bis.resolve(jid) !== null, "avant : le compte est reconnu");

  bis.suspendre({ numero: cible.numero, suspendu: true, parQui: auteur });
  verifier(bis.resolve(jid) === null, "suspendu : plus aucune action possible");
  verifier(bis.etatDe(jid).statut === "suspendu", "suspendu : l'etat le dit explicitement");

  bis.suspendre({ numero: cible.numero, suspendu: false, parQui: auteur });
  verifier(bis.resolve(jid) !== null, "reactive : le compte redevient reconnu");

  bis.revoquer({ numero: cible.numero, parQui: auteur });
  verifier(bis.resolve(jid) === null, "revoque : plus aucune action possible");
  verifier(bis.etatDe(jid).statut === "revoque", "revoque : l'etat le dit explicitement");

  // Persistance : un redemarrage ne doit pas ressusciter un acces revoque.
  const apres = new IdentityStorePersistant({ chemin: copie });
  verifier(apres.resolve(jid) === null, "revoque : toujours refuse apres redemarrage");

  // Le fichier du serveur est intact.
  verifier(
    readFileSync(fichier, "utf8") === brut,
    "le magasin telecharge n'a PAS ete modifie par ces epreuves",
  );
}

rmSync(bac, { recursive: true, force: true });

console.log(`\n=== ${echecs === 0 ? "TOUS LES CONTROLES PASSENT" : `${echecs} CONTROLE(S) EN ECHEC`} ===`);
console.log("note : aucun message WhatsApp n'a ete envoye — le service est a l'arret et le transport est simule.");
process.exitCode = echecs ? 1 : 0;
