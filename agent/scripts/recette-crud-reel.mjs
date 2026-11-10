/**
 * Recette CRUD réelle : CREATE → READ → UPDATE → READ → ARCHIVE → READ,
 * par le chemin HTTP exact de l'agent, contre la BASE DE TEST.
 *
 * CE QUI EST RÉEL ICI
 * --------------------
 * Le backend Next.js, ses routes, son guard, ses actions métier, ses
 * transactions, son audit, et la base PostgreSQL de test (`br-calm-art`). Seul
 * le modèle de langage est absent : les opérations sont appelées directement,
 * comme l'agent les appellerait après confirmation.
 *
 * Chaque opération est vérifiée DEUX fois : par la réponse de l'API, puis par
 * une requête SQL INDÉPENDANTE sur l'état persisté — et par la ligne d'audit.
 * Un HTTP 200 ne vaut rien tant que la base ne le confirme pas.
 *
 * LES VERROUS — LE SCRIPT REFUSE DE TOUCHER LA PRODUCTION
 * --------------------------------------------------------
 *   1. La base de vérification doit être la branche de TEST
 *      (`web/.env.development.local`) et JAMAIS `br-red-waterfall`.
 *   2. Le backend appelé doit annoncer la MÊME année courante que cette
 *      branche. La production annonce 2026-2027, la branche de test 2025-2026 :
 *      un backend branché sur la production est donc détecté et refusé.
 *   3. Les notifications en attente sont comptées avant et après : aucune ne
 *      doit être partie. Le backend doit tourner SANS identifiants SMS ni push.
 *
 * LES DONNÉES DE SYNTHÈSE
 * ------------------------
 * Identifiables (« RECETTE-AGENT »), sur un téléphone de la plage réservée à la
 * fiction (+33 1 99 00 xx xx, ARCEP), vérifié inexistant avant usage. Aucun
 * élève authentique n'est touché. Les identifiants créés sont consignés dans un
 * fichier, et le nettoyage ne procède QUE par ces identifiants :
 *
 *   node scripts/recette-crud-reel.mjs                       la recette
 *   node scripts/recette-crud-reel.mjs --nettoyer <fichier>  le nettoyage
 *
 * Le journal d'audit n'a pas de clé étrangère vers `eleves` : ses lignes
 * survivent au nettoyage. La trace de la recette reste donc entière.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { GuergneHttpClient } from "../src/guergne-client.js";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const depot = resolve(racine, "..");
const BACKEND = process.env.RECETTE_BACKEND ?? "http://localhost:3100";
const BRANCHE_PRODUCTION = "br-red-waterfall-b1ajf6iu";
const TELEPHONE_FICTIF = "+33199001234";
const MARQUE = "RECETTE-AGENT";

const bleu = (s) => console.log(`\x1b[1;34m${s}\x1b[0m`);
const vert = (s) => console.log(`\x1b[1;32m${s}\x1b[0m`);
const rouge = (s) => console.error(`\x1b[1;31m${s}\x1b[0m`);
const gris = (s) => console.log(`\x1b[0;90m${s}\x1b[0m`);

function lire(fichier, nom) {
  if (!existsSync(fichier)) return null;
  for (const ligne of readFileSync(fichier, "utf8").split(/\r?\n/)) {
    const m = ligne.match(/^([A-Z_0-9]+)\s*=\s*(.*)$/);
    if (m && m[1] === nom) return m[2].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

const resultats = [];
function constater(nom, ok, detail = "") {
  resultats.push({ nom, ok, detail });
  (ok ? vert : rouge)(`  ${ok ? "OK   " : "ECHEC"}  ${nom}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

async function ouvrirBaseDeTest() {
  const fichier = join(depot, "web", ".env.development.local");
  const url = lire(fichier, "DATABASE_URL_DIRECT") ?? lire(fichier, "DATABASE_URL");
  if (!url) throw new Error("web/.env.development.local sans URL de base");
  const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const [{ branche }] = (await db.query("SELECT current_setting('neon.branch_id', true) AS branche")).rows;
  // VERROU 1.
  if (!branche || branche === BRANCHE_PRODUCTION) {
    await db.end();
    throw new Error(`VERROU : la base de verification est ${branche ?? "inconnue"} — refus de toute ecriture`);
  }
  return { db, branche };
}

// ---------------------------------------------------------------------------
// Nettoyage — uniquement par identifiants consignés
// ---------------------------------------------------------------------------
async function nettoyer(fichierIds) {
  const ids = JSON.parse(readFileSync(fichierIds, "utf8"));
  const { db, branche } = await ouvrirBaseDeTest();
  if (ids.branche !== branche) throw new Error(`VERROU : identifiants releves sur ${ids.branche}, base ouverte ${branche}`);
  bleu(`== Nettoyage sur ${branche}, par identifiants seulement ==`);
  try {
    await db.query("BEGIN");
    const compte = async (sql, p) => (await db.query(sql, p)).rowCount;
    // Les notifications produites pour l'eleve de synthese, AVANT de supprimer
    // l'eleve : la cle passerait a NULL et on ne les retrouverait plus.
    const n0 = ids.eleveId ? await compte("DELETE FROM notifications WHERE eleve_id = $1", [ids.eleveId]) : 0;
    const n1 = ids.eleveId ? await compte("DELETE FROM eleves WHERE id = $1 AND nom LIKE $2", [ids.eleveId, `%${MARQUE}%`]) : 0;
    // Le tuteur de synthese seulement s'il n'est rattache a PERSONNE d'autre.
    const n2 = ids.tuteurId
      ? await compte("DELETE FROM tuteurs t WHERE t.id = $1 AND t.telephone = $2 AND NOT EXISTS (SELECT 1 FROM eleve_tuteur et WHERE et.tuteur_id = t.id)", [ids.tuteurId, TELEPHONE_FICTIF])
      : 0;
    let n3 = 0;
    for (const id of ids.classes ?? []) n3 += await compte("DELETE FROM classes WHERE id = $1 AND libelle LIKE $2", [id, `%${MARQUE}%`]);
    await db.query("COMMIT");
    vert(`  notifications ${n0}, eleve ${n1}, tuteur ${n2}, classes ${n3} — audit conserve`);
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await db.end();
  }
}

// ---------------------------------------------------------------------------
// La recette
// ---------------------------------------------------------------------------
async function recette() {
  const jeton = lire(join(racine, ".env"), "AGENT_SERVICE_TOKEN");
  if (!jeton) throw new Error("agent/.env sans AGENT_SERVICE_TOKEN");
  const client = new GuergneHttpClient({ baseUrl: BACKEND, serviceToken: jeton });
  const { db, branche } = await ouvrirBaseDeTest();
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const ids = { branche, classes: [], eleveId: null, tuteurId: null, inscriptionId: null };
  const fichierIds = join(process.env.TEMP ?? racine, `recette-crud-${Date.now()}.json`);
  const consigner = () => writeFileSync(fichierIds, JSON.stringify(ids, null, 2));

  try {
    await db.query("SET default_transaction_read_only = on");
    gris(`  base de test : ${branche}   backend : ${BACKEND}`);

    // VERROU 2 : le backend doit lire la MEME branche.
    const [{ courante }] = await q("SELECT (SELECT libelle FROM annees_scolaires WHERE est_courante) AS courante");
    const [admin] = await q("SELECT id::text FROM utilisateurs WHERE NOT donnees_semees AND role = 'SUPER_ADMIN' AND actif ORDER BY cree_le LIMIT 1");
    const ctx = { actorId: admin.id };
    const ra = await client.anneeCourante({}, ctx);
    if (ra?.data?.libelle !== courante) {
      throw new Error(`VERROU : le backend annonce « ${ra?.data?.libelle} », la base de test « ${courante} » — refus`);
    }
    vert(`  verrous : base ${branche}, backend sur la meme annee courante (${courante})`);

    // VERROU 3 : etat de la file de notifications.
    const fileAvant = await q("SELECT statut::text s, count(*)::int n FROM notifications GROUP BY 1");
    const [{ dejaPris }] = await q("SELECT count(*)::int AS \"dejaPris\" FROM tuteurs WHERE telephone = $1", [TELEPHONE_FICTIF]);
    if (dejaPris > 0) throw new Error(`VERROU : le telephone fictif existe deja (${dejaPris}) — refus`);

    const audit = async (action, entiteId) =>
      (await q("SELECT count(*)::int n FROM journal_audit WHERE action = $1 AND entite_id::text = $2 AND utilisateur_id::text = $3", [action, entiteId, admin.id]))[0].n;
    const suffixe = String(Date.now()).slice(-4);
    const [niveau] = await q("SELECT id::text, libelle FROM niveaux ORDER BY ordre LIMIT 1");

    // ===== CREATE : deux classes =====
    bleu("\n== CREATE — classes ==");
    for (const [i, code] of [[1, `RA${suffixe}`], [2, `RB${suffixe}`]]) {
      const r = await client.creerClasse({ libelle: `${MARQUE} classe ${i}`, code, niveauId: niveau.id, capaciteMax: 30 }, ctx);
      const [ligne] = await q("SELECT c.id::text, c.active, a.libelle annee FROM classes c JOIN annees_scolaires a ON a.id = c.annee_id WHERE c.code = $1", [code]);
      if (ligne) ids.classes.push(ligne.id);
      consigner();
      constater(`creerClasse ${code} : API`, r?.ok === true, r?.message ?? "");
      constater(`creerClasse ${code} : en base, annee courante, active`, ligne?.annee === courante && ligne?.active === true, ligne ? `${ligne.annee}, active=${ligne.active}` : "absente");
      constater(`creerClasse ${code} : audit au nom de l'acteur`, ligne ? (await audit("classe.creee", ligne.id)) === 1 : false);
    }
    const [classe1, classe2] = ids.classes;

    // ===== CREATE : refus d'un code de classe deja pris =====
    {
      const r = await client.creerClasse({ libelle: `${MARQUE} doublon`, code: `RA${suffixe}`, niveauId: niveau.id, capaciteMax: 30 }, ctx);
      const [{ n }] = await q("SELECT count(*)::int n FROM classes WHERE code = $1", [`RA${suffixe}`]);
      // Le message est verifie, pas seulement le refus : une premiere version
      // passait avec « La creation de la classe a echoue », parce que la
      // detection de l'unicite ne voyait jamais le code 23505 (enveloppe par
      // Drizzle dans `cause`).
      constater("creerClasse en doublon : refusee, POUR CETTE RAISON", r?.ok === false && n === 1 && /existe déjà/.test(r?.message ?? ""), r?.message ?? "");
    }

    // ===== UPDATE : classe =====
    bleu("\n== UPDATE — classe ==");
    {
      const r = await client.modifierClasse({ classeId: classe1, modifications: { capaciteMax: 35, libelle: `${MARQUE} classe 1 bis` } }, ctx);
      const [l] = await q("SELECT libelle, capacite_max FROM classes WHERE id = $1", [classe1]);
      constater("modifierClasse : API", r?.ok === true, r?.message ?? "");
      constater("modifierClasse : persiste", l?.capacite_max === 35 && l?.libelle === `${MARQUE} classe 1 bis`, `${l?.libelle}, ${l?.capacite_max}`);
      constater("modifierClasse : audit", (await audit("classe.modifiee", classe1)) === 1);
      const interdit = await client.modifierClasse({ classeId: classe1, modifications: { anneeId: "00000000-0000-0000-0000-000000000000" } }, ctx);
      constater("modifierClasse d'un champ interdit (anneeId) : refusee", interdit?.ok === false, interdit?.message ?? "");
    }

    // ===== CREATE : eleve + inscription + tuteur, en une transaction =====
    bleu("\n== CREATE — eleve ==");
    const identite = { nom: `${MARQUE}`, prenom: `Fictif${suffixe}`, sexe: "M", dateNaissance: "2013-04-15" };
    {
      const r = await client.inscrireEleve(
        {
          ...identite,
          classeId: classe1,
          tuteurs: [{ nom: `${MARQUE}`, prenom: "Tuteur", telephone: TELEPHONE_FICTIF, lien: "PERE", estPrincipal: true, estTuteurLegal: true }],
        },
        ctx,
      );
      ids.eleveId = r?.data?.id ?? null;
      const [l] = ids.eleveId
        ? await q(
            `SELECT e.matricule, e.statut::text, i.id::text inscription, i.classe_id::text classe, et.tuteur_id::text tuteur,
                    (SELECT count(*)::int FROM historique_statuts h WHERE h.eleve_id = e.id) historique
               FROM eleves e JOIN inscriptions i ON i.eleve_id = e.id JOIN eleve_tuteur et ON et.eleve_id = e.id WHERE e.id = $1`,
            [ids.eleveId],
          )
        : [];
      ids.inscriptionId = l?.inscription ?? null;
      ids.tuteurId = l?.tuteur ?? null;
      consigner();
      constater("inscrireEleve : API", r?.ok === true && Boolean(ids.eleveId), r?.message ?? "");
      constater("inscrireEleve : eleve, inscription, tuteur, historique en base", Boolean(l?.matricule) && l?.classe === classe1 && l?.historique === 1, l ? `matricule ${l.matricule}, statut ${l.statut}` : "absent");
      constater("inscrireEleve : audit", ids.eleveId ? (await audit("eleve.inscrit", ids.eleveId)) === 1 : false);
    }

    // ===== CREATE : refus — homonyme, donnee manquante, classe inexistante =====
    {
      const homonyme = await client.inscrireEleve(
        { ...identite, classeId: classe1, tuteurs: [{ nom: MARQUE, prenom: "Tuteur", telephone: TELEPHONE_FICTIF, lien: "PERE", estPrincipal: true }] },
        ctx,
      );
      const [{ n }] = await q("SELECT count(*)::int n FROM eleves WHERE nom = $1 AND prenom = $2", [identite.nom, identite.prenom]);
      constater("inscription d'un homonyme : refusee, aucun second dossier", homonyme?.ok === false && n === 1, homonyme?.message?.slice(0, 80) ?? "");
      const incomplete = await client.inscrireEleve({ nom: MARQUE, prenom: "SansDate", sexe: "F", classeId: classe1, tuteurs: [] }, ctx);
      constater("inscription incomplete : refusee", incomplete?.ok === false, incomplete?.message?.slice(0, 80) ?? "");
      // Le tuteur doit etre VALIDE, sinon le refus vient de lui et non de la
      // classe. Une premiere version utilisait le prenom « T » — invalide —, et
      // le test passait sur « Prenom requis » sans avoir rien teste de la classe.
      const sansClasse = await client.inscrireEleve(
        { ...identite, prenom: `Autre${suffixe}`, classeId: "00000000-0000-4000-8000-000000000000", tuteurs: [{ nom: MARQUE, prenom: "Tuteur", telephone: TELEPHONE_FICTIF, lien: "PERE", estPrincipal: true }] },
        ctx,
      );
      constater("inscription dans une classe inexistante : refusee, POUR CETTE RAISON", sansClasse?.ok === false && /classe/i.test(sansClasse?.message ?? ""), sansClasse?.message?.slice(0, 90) ?? "");
    }

    // ===== READ =====
    bleu("\n== READ ==");
    {
      const d = await client.consulterEleve({ eleveId: ids.eleveId }, ctx);
      constater("consulterEleve : dossier relu", d?.data?.eleve?.prenom === identite.prenom && d?.data?.inscription?.classeId === classe1);
      const s = await client.rechercherEleves({ recherche: identite.prenom }, ctx);
      const lignes = Array.isArray(s?.data) ? s.data : s?.data?.lignes ?? [];
      constater("rechercherEleves par nom : trouve", lignes.some((e) => e.id === ids.eleveId), `${lignes.length} resultat(s)`);
      const c = await client.listerElevesClasse({ classeId: classe1 }, ctx);
      constater("listerElevesClasse : l'eleve y figure", (c?.data ?? []).some((e) => e.eleveId === ids.eleveId));
    }

    // ===== UPDATE : eleve =====
    bleu("\n== UPDATE — eleve ==");
    {
      const r = await client.modifierEleve({ eleveId: ids.eleveId, modifications: { lieuNaissance: "Abéché" } }, ctx);
      const [l] = await q("SELECT lieu_naissance FROM eleves WHERE id = $1", [ids.eleveId]);
      constater("modifierEleve : API", r?.ok === true, r?.message ?? "");
      constater("modifierEleve : persiste", l?.lieu_naissance === "Abéché", l?.lieu_naissance ?? "");
      constater("modifierEleve : audit", (await audit("eleve.dossier_modifie", ids.eleveId)) === 1);
      const interdit = await client.modifierEleve({ eleveId: ids.eleveId, modifications: { statut: "DIPLOME" } }, ctx);
      const [s] = await q("SELECT statut::text FROM eleves WHERE id = $1", [ids.eleveId]);
      constater("modifierEleve d'un champ interdit (statut) : refusee, inchangee", interdit?.ok === false && s?.statut === "INSCRIT", interdit?.message ?? "");
    }
    {
      const r = await client.changerClasseEleve({ inscriptionId: ids.inscriptionId, classeId: classe2, motif: "recette agent" }, ctx);
      const [l] = await q("SELECT classe_id::text FROM inscriptions WHERE id = $1", [ids.inscriptionId]);
      const [{ trace }] = await q("SELECT count(*)::int trace FROM changements_classe WHERE inscription_id = $1", [ids.inscriptionId]);
      constater("changerClasseEleve : API", r?.ok === true, r?.message ?? "");
      constater("changerClasseEleve : persiste + trace", l?.classe_id === classe2 && trace === 1);
      constater("changerClasseEleve : audit", (await audit("eleve.classe_changee", ids.inscriptionId)) === 1);
      const memeClasse = await client.changerClasseEleve({ inscriptionId: ids.inscriptionId, classeId: classe2, motif: "recette agent" }, ctx);
      constater("changerClasseEleve vers la meme classe : refusee, message lisible", memeClasse?.ok === false && /déjà dans cette classe/.test(memeClasse?.message ?? ""), memeClasse?.message ?? "");
    }

    // ===== ARCHIVE =====
    bleu("\n== ARCHIVE ==");
    {
      const pleine = await client.archiverClasse({ classeId: classe2, motif: "recette agent : fermeture" }, ctx);
      const [l2] = await q("SELECT active FROM classes WHERE id = $1", [classe2]);
      constater("archiverClasse avec un eleve : refusee, reste active", pleine?.ok === false && l2?.active === true, pleine?.message ?? "");
      const r = await client.archiverClasse({ classeId: classe1, motif: "recette agent : fermeture" }, ctx);
      const [l1] = await q("SELECT active FROM classes WHERE id = $1", [classe1]);
      constater("archiverClasse vide : API", r?.ok === true, r?.message ?? "");
      constater("archiverClasse vide : active=false, ligne conservee", l1?.active === false);
      constater("archiverClasse : audit", (await audit("classe.archivee", classe1)) === 1);
      const versArchivee = await client.changerClasseEleve({ inscriptionId: ids.inscriptionId, classeId: classe1, motif: "recette agent" }, ctx);
      constater("changerClasse vers une classe archivee : refusee", versArchivee?.ok === false && /archivée/.test(versArchivee?.message ?? ""), versArchivee?.message ?? "");
    }
    {
      const r = await client.archiverEleve({ eleveId: ids.eleveId, motif: "recette agent : archivage" }, ctx);
      const [l] = await q("SELECT statut::text, (SELECT count(*)::int FROM historique_statuts h WHERE h.eleve_id = e.id) historique FROM eleves e WHERE e.id = $1", [ids.eleveId]);
      constater("archiverEleve : API", r?.ok === true, r?.message ?? "");
      constater("archiverEleve : statut ARCHIVE, dossier conserve, historique +1", l?.statut === "ARCHIVE" && l?.historique === 2, l ? `${l.statut}, ${l.historique} statut(s)` : "absent");
      constater("archiverEleve : audit", (await audit("eleve.archive", ids.eleveId)) === 1);
    }

    // ===== SECURITE =====
    bleu("\n== SECURITE ==");
    {
      const faux = await new GuergneHttpClient({ baseUrl: BACKEND, serviceToken: "faux" }).creerClasse({}, ctx);
      constater("faux jeton : refuse", faux?.ok === false && faux?.status === 401, String(faux?.status));
      const inconnu = await client.creerClasse({}, { actorId: "00000000-0000-4000-8000-000000000000" });
      constater("acteur inexistant : refuse", inconnu?.ok === false && inconnu?.status === 403, String(inconnu?.status));
      const malforme = await client.creerClasse({}, { actorId: "pas-un-uuid" });
      constater("acteur malforme : refuse", malforme?.ok === false && malforme?.status === 400, String(malforme?.status));
      const [parent] = await q("SELECT id::text FROM utilisateurs WHERE NOT donnees_semees AND role = 'PARENT' LIMIT 1");
      const avant = (await q("SELECT count(*)::int n FROM classes"))[0].n;
      const rp = await client.creerClasse({ libelle: `${MARQUE} parent`, code: `RP${suffixe}`, niveauId: niveau.id, capaciteMax: 10 }, { actorId: parent.id });
      const apres = (await q("SELECT count(*)::int n FROM classes"))[0].n;
      constater("PARENT qui cree une classe : refuse, rien d'ecrit", rp?.ok === false && apres === avant, String(rp?.status));
      // UN COMPTE DESACTIVE. Sur la base de test, les quatre surveillants
      // authentiques sont inactifs : on eprouve donc ce cas-la, qui est reel.
      // Un test sautant en silence faute de compte actif ne prouverait rien.
      const [inactif] = await q("SELECT id::text FROM utilisateurs WHERE NOT donnees_semees AND role = 'SURVEILLANT' AND NOT actif LIMIT 1");
      if (inactif) {
        const ri = await client.consulterEleve({ eleveId: ids.eleveId }, { actorId: inactif.id });
        constater("compte DESACTIVE : refuse meme en lecture", ri?.ok === false && ri?.status === 403, String(ri?.status));
      } else {
        constater("compte DESACTIVE : NON EXECUTE (aucun compte inactif)", false);
      }
      // UN ROLE ACTIF SANS LA PERMISSION. La matrice reelle (table
      // `permissions`) ne donne PAS `eleve:inscrire` a la DIRECTION : c'est le
      // refus de role le plus probant disponible ici.
      const [direction] = await q("SELECT id::text FROM utilisateurs WHERE NOT donnees_semees AND role = 'DIRECTION' AND actif LIMIT 1");
      if (direction) {
        const avantEleves = (await q("SELECT count(*)::int n FROM eleves"))[0].n;
        const rd = await client.inscrireEleve(
          { ...identite, prenom: `Direction${suffixe}`, classeId: classe2, tuteurs: [{ nom: MARQUE, prenom: "Tuteur", telephone: TELEPHONE_FICTIF, lien: "PERE", estPrincipal: true }] },
          { actorId: direction.id },
        );
        const apresEleves = (await q("SELECT count(*)::int n FROM eleves"))[0].n;
        constater("DIRECTION (sans eleve:inscrire) qui inscrit : refuse, rien d'ecrit", rd?.ok === false && rd?.status === 403 && apresEleves === avantEleves, String(rd?.status));
      } else {
        constater("refus de role DIRECTION : NON EXECUTE (aucun compte actif)", false);
      }
      const brut = await fetch(`${BACKEND}/api/agent/creerClasse`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${jeton}`, "x-acteur-id": admin.id },
        body: "{pas du json",
      });
      constater("corps JSON malforme : refuse", brut.status === 400, String(brut.status));
      const inconnue = await client._call("supprimerClasse", { classeId: classe1 }, ctx);
      constater("supprimerClasse (DELETE) n'est PAS exposee a l'agent", inconnue?.ok === false && inconnue?.status === 404, String(inconnue?.status));
    }

    // ===== VERROU 3 : aucune notification n'est partie =====
    bleu("\n== Notifications ==");
    {
      const fileApres = await q("SELECT statut::text s, count(*)::int n FROM notifications GROUP BY 1");
      const nb = (f, s) => f.find((x) => x.s === s)?.n ?? 0;
      constater("aucune notification envoyee pendant la recette", nb(fileApres, "ENVOYE") === nb(fileAvant, "ENVOYE"), `ENVOYE ${nb(fileAvant, "ENVOYE")} -> ${nb(fileApres, "ENVOYE")}`);
    }
  } finally {
    consigner();
    await db.end();
  }

  const echecs = resultats.filter((r) => !r.ok);
  bleu(`\n== ${resultats.length - echecs.length}/${resultats.length} verifications reussies ==`);
  gris(`  identifiants crees : ${fichierIds}`);
  gris(`  nettoyage : node scripts/recette-crud-reel.mjs --nettoyer "${fichierIds}"`);
  if (echecs.length) process.exitCode = 1;
}

const i = process.argv.indexOf("--nettoyer");
(i >= 0 ? nettoyer(process.argv[i + 1]) : recette()).catch((e) => {
  rouge(`Arret : ${String(e?.message ?? e).slice(0, 300)}`);
  process.exit(1);
});
