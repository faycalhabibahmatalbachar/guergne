/**
 * Recette des lectures RÉELLES, par le chemin exact de l'agent.
 *
 * POURQUOI CE SCRIPT
 * -------------------
 * Jusqu'ici l'agent n'avait jamais parlé au backend de l'école : `agent/.env`
 * n'existait pas, et le backend n'était même pas installé en local. Toutes les
 * démonstrations passaient par un dos scolaire SIMULÉ.
 *
 * Ce script emprunte le chemin de production, et lui seul :
 *
 *     GuergneHttpClient  ->  POST /api/agent/{action}  ->  guard  ->  Neon
 *
 * avec le jeton de service ET l'identité d'un acteur réel. Il ne lit jamais la
 * base lui-même pour produire ses réponses : quand il interroge Neon, c'est
 * uniquement pour VÉRIFIER, par une requête indépendante, que ce que le
 * backend a rendu est exact.
 *
 * Il n'écrit RIEN. Les écritures du backend restent éteintes
 * (`AGENT_ECRITURES_ACTIVES` n'est pas posée), et ce script n'en tente aucune.
 *
 *   node scripts/recette-backend-reel.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { GuergneHttpClient } from "../src/guergne-client.js";
import { ASSIDUITE_TOOLS } from "../src/tools.js";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const depot = resolve(racine, "..");

const bleu = (s) => console.log(`\x1b[1;34m${s}\x1b[0m`);
const vert = (s) => console.log(`\x1b[1;32m${s}\x1b[0m`);
const rouge = (s) => console.error(`\x1b[1;31m${s}\x1b[0m`);
const gris = (s) => console.log(`\x1b[0;90m${s}\x1b[0m`);

function lire(chemin, nom) {
  for (const ligne of readFileSync(chemin, "utf8").split(/\r?\n/)) {
    const m = ligne.match(/^([A-Z_0-9]+)\s*=\s*(.*)$/);
    if (m && m[1] === nom) return m[2].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

const resultats = [];
const consigner = (nom, ok, detail) => {
  resultats.push({ nom, ok, detail });
  (ok ? vert : rouge)(`  ${ok ? "OK  " : "ECHEC"}  ${nom}${detail ? ` — ${detail}` : ""}`);
};

async function principal() {
  const base = lire(join(racine, ".env"), "SCHOOL_API_BASE_URL");
  const jeton = lire(join(racine, ".env"), "AGENT_SERVICE_TOKEN");
  if (!base || !jeton) {
    rouge("agent/.env incomplet : SCHOOL_API_BASE_URL et AGENT_SERVICE_TOKEN requis");
    process.exit(2);
  }
  const client = new GuergneHttpClient({ baseUrl: base, serviceToken: jeton });

  // LA BASE DE VÉRIFICATION DOIT ÊTRE CELLE QUE LE BACKEND LIT.
  //
  // Première exécution : 2 « échecs » sur 13, le backend annonçant 2025-2026
  // quand la base disait 2026-2027. Ce n'était pas un défaut du backend : il
  // existe DEUX branches Neon, et `next dev` charge `.env.development.local`
  // AVANT `.env.local` (ordre de priorité documenté de Next.js). Le backend
  // lisait `br-calm-art…`, ce script vérifiait contre `br-red-waterfall…`.
  //
  // On reproduit donc exactement la priorité de Next en développement. Comparer
  // deux bases différentes ne prouve rien, dans un sens comme dans l'autre.
  const webDir = join(depot, "web");
  const cheminsEnv = [".env.development.local", ".env.local"].map((f) => join(webDir, f));
  let urlVerif = null;
  let source = null;
  for (const f of cheminsEnv) {
    try {
      urlVerif = lire(f, "DATABASE_URL_DIRECT") ?? lire(f, "DATABASE_URL");
    } catch {
      urlVerif = null;
    }
    if (urlVerif) {
      source = f.split(/[\\/]/).pop();
      break;
    }
  }
  if (!urlVerif) throw new Error("aucune URL de base dans web/.env.development.local ni web/.env.local");
  // La base, en lecture seule, UNIQUEMENT pour vérifier — jamais pour répondre.
  const db = new pg.Client({ connectionString: urlVerif, ssl: { rejectUnauthorized: false } });
  await db.connect();
  await db.query("SET default_transaction_read_only = on");
  const q = async (s, p) => (await db.query(s, p)).rows;
  const [{ branche }] = await q("SELECT current_setting('neon.branch_id', true) AS branche");
  gris(`  base de verification : ${source} -> branche Neon ${branche ?? "inconnue"}`);

  try {
    const [superAdmin] = await q("SELECT id::text FROM utilisateurs WHERE donnees_semees = false AND role = 'SUPER_ADMIN' AND actif ORDER BY cree_le LIMIT 1").catch(
      async () => q("SELECT id::text FROM utilisateurs WHERE donnees_semees = false AND role = 'SUPER_ADMIN' ORDER BY cree_le LIMIT 1"),
    );
    const [parent] = await q("SELECT id::text FROM utilisateurs WHERE donnees_semees = false AND role = 'PARENT' ORDER BY cree_le LIMIT 1");
    if (!superAdmin) throw new Error("aucun SUPER_ADMIN authentique");
    const ctxAdmin = { actorId: superAdmin.id };
    gris(`  acteur : un SUPER_ADMIN authentique (donnees_semees = false)`);

    bleu("\n== 1. Annee courante ==");
    {
      const t0 = Date.now();
      const r = await client.anneeCourante({}, ctxAdmin);
      const ms = Date.now() - t0;
      const [verite] = await q("SELECT libelle FROM annees_scolaires WHERE est_courante");
      consigner("anneeCourante repond", r?.ok === true, `${ms} ms`);
      consigner("anneeCourante = Neon", r?.data?.libelle === verite?.libelle, `backend « ${r?.data?.libelle} », Neon « ${verite?.libelle} »`);
      gris(`  rendu agent : ${ASSIDUITE_TOOLS.find((o) => o.name === "etablissement.annee_courante").rendre(r?.data)}`);
    }

    bleu("\n== 2. Periodes ==");
    {
      const r = await client.listerPeriodes({}, ctxAdmin);
      const [verite] = await q("SELECT count(*)::int n, count(*) FILTER (WHERE saisie_ouverte)::int ouvertes FROM periodes p JOIN annees_scolaires a ON a.id = p.annee_id WHERE a.est_courante");
      const lignes = Array.isArray(r?.data) ? r.data : [];
      consigner("listerPeriodes repond", r?.ok === true);
      consigner("listerPeriodes = Neon", lignes.length === verite.n, `backend ${lignes.length}, Neon ${verite.n} (dont ${verite.ouvertes} ouverte)`);
    }

    bleu("\n== 3. Classes de l'annee courante ==");
    {
      const r = await client.listerClasses({}, ctxAdmin);
      const [verite] = await q("SELECT count(*)::int n FROM classes c JOIN annees_scolaires a ON a.id = c.annee_id WHERE a.est_courante AND c.active");
      const lignes = Array.isArray(r?.data) ? r.data : [];
      consigner("listerClasses repond", r?.ok === true);
      consigner("listerClasses = Neon", lignes.length === verite.n, `backend ${lignes.length}, Neon ${verite.n}`);
      gris(`  rendu agent : ${ASSIDUITE_TOOLS.find((o) => o.name === "classes.lister").rendre(lignes)}`);
    }

    bleu("\n== 4. Classes de 2025-2026, par l'annee explicite ==");
    {
      const [annee] = await q("SELECT id::text FROM annees_scolaires WHERE libelle = '2025-2026'");
      const r = await client.listerClasses({ anneeId: annee.id }, ctxAdmin);
      const lignes = Array.isArray(r?.data) ? r.data : [];
      const [verite] = await q("SELECT count(*)::int n FROM classes WHERE annee_id = $1", [annee.id]);
      // Avant correction, l'operation ignorait `anneeId` : elle rendait
      // toujours l'annee courante, donc 0 ligne ici.
      consigner("listerClasses honore anneeId", lignes.length === verite.n, `backend ${lignes.length}, Neon ${verite.n}`);
    }

    bleu("\n== 5. Emploi du temps reel (2025-2026, une classe) ==");
    {
      const [cl] = await q("SELECT c.id::text, c.libelle, a.id::text annee FROM classes c JOIN annees_scolaires a ON a.id = c.annee_id WHERE a.libelle = '2025-2026' AND EXISTS (SELECT 1 FROM emploi_du_temps e WHERE e.classe_id = c.id) ORDER BY c.code LIMIT 1");
      const r = await client.chargerEmploiDuTemps({ classeId: cl.id, anneeId: cl.annee }, ctxAdmin);
      const lignes = Array.isArray(r?.data) ? r.data : [];
      const [verite] = await q("SELECT count(*)::int n FROM emploi_du_temps WHERE classe_id = $1 AND annee_id = $2", [cl.id, cl.annee]);
      consigner("chargerEmploiDuTemps repond", r?.ok === true);
      consigner("chargerEmploiDuTemps = Neon", lignes.length === verite.n, `backend ${lignes.length}, Neon ${verite.n} pour ${cl.libelle}`);
      consigner("les heures sont rendues", lignes.length > 0 && lignes.every((x) => /^\d{2}:\d{2}/.test(String(x.heureDebut ?? ""))), "heureDebut present sur chaque ligne");
      const rendu = ASSIDUITE_TOOLS.find((o) => o.name === "emploi_du_temps.consulter").rendre(lignes, { jour: "lundi" });
      gris(`  rendu agent (lundi) :\n${rendu.split("\n").slice(0, 6).map((l) => `    ${l}`).join("\n")}`);
    }

    bleu("\n== 6. Le guard refuse ce qu'un parent n'a pas le droit de voir ==");
    if (parent) {
      const r = await client.listerAbsences({ limite: 5 }, { actorId: parent.id });
      consigner("un PARENT ne liste pas toutes les absences", r?.ok !== true, r?.ok ? "ACCORDE — anomalie" : `refuse : ${String(r?.message ?? "").slice(0, 90)}`);
    } else {
      gris("  aucun parent authentique pour tester le refus");
    }

    bleu("\n== 7. Les ecritures sont eteintes ==");
    {
      const r = await client.enregistrerAppel({ periodeId: "00000000-0000-0000-0000-000000000000", dateAbsence: "2026-11-10", nbHeures: 1, absents: [] }, ctxAdmin);
      consigner("une ecriture est refusee tant que AGENT_ECRITURES_ACTIVES n'est pas posee", r?.ok !== true, `${String(r?.message ?? "").slice(0, 100)}`);
    }

    bleu("\n== 8. Un jeton faux est refuse ==");
    {
      const faux = new GuergneHttpClient({ baseUrl: base, serviceToken: "faux-jeton" });
      const r = await faux.anneeCourante({}, ctxAdmin);
      consigner("jeton invalide refuse", r?.ok !== true, String(r?.message ?? "").slice(0, 80));
    }
  } finally {
    await db.end();
  }

  const echecs = resultats.filter((r) => !r.ok);
  bleu(`\n== ${resultats.length - echecs.length}/${resultats.length} verifications reussies ==`);
  if (echecs.length) process.exitCode = 1;
}

principal().catch((e) => {
  rouge(`Echec : ${String(e?.message ?? e).slice(0, 300)}`);
  process.exit(1);
});
