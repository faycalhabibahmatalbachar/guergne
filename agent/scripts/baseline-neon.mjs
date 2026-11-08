/**
 * Photographie de référence de la base scolaire — LECTURE SEULE.
 *
 * POURQUOI CE SCRIPT EXISTE
 * --------------------------
 * Les campagnes précédentes ont été démontrées sur un dos scolaire SIMULÉ. La
 * direction demande maintenant des chiffres réels. Avant toute fonctionnalité,
 * il faut donc savoir ce que la base contient vraiment — et ne pas reprendre
 * d'anciens chiffres comme s'ils étaient encore actuels.
 *
 * CE QU'IL NE FAIT PAS
 * ---------------------
 * Aucune écriture, aucun `CREATE`, aucun `UPDATE`, aucun `DELETE`. La session
 * est ouverte en lecture seule au niveau de PostgreSQL lui-même
 * (`default_transaction_read_only`), pour que ce ne soit pas qu'une promesse.
 *
 * La chaîne de connexion n'est NI affichée, NI journalisée, NI copiée. Seuls
 * l'hôte masqué, la base et le rôle le sont — de quoi prouver qu'on parle à la
 * bonne base sans divulguer de quoi y accéder.
 *
 *   node scripts/baseline-neon.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const depot = resolve(racine, "..");

const bleu = (s) => console.log(`\x1b[1;34m${s}\x1b[0m`);
const vert = (s) => console.log(`\x1b[1;32m${s}\x1b[0m`);
const rouge = (s) => console.error(`\x1b[1;31m${s}\x1b[0m`);
const gris = (s) => console.log(`\x1b[0;90m${s}\x1b[0m`);

/** Lit une variable dans un fichier d'environnement, sans jamais la rendre visible. */
function lireVariable(chemin, nom) {
  const texte = readFileSync(chemin, "utf8");
  for (const ligne of texte.split(/\r?\n/)) {
    const m = ligne.match(/^([A-Z_0-9]+)\s*=\s*(.*)$/);
    if (m && m[1] === nom) return m[2].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

/** L'hôte, masqué : assez pour reconnaître la base, pas assez pour y entrer. */
function hoteMasque(url) {
  try {
    const u = new URL(url);
    const h = u.hostname;
    const points = h.split(".");
    const tete = points[0] ?? "";
    return `${tete.slice(0, 4)}…${tete.slice(-4)}.${points.slice(1).join(".")}`;
  } catch {
    return "hote illisible";
  }
}

async function principal() {
  const chemin = join(depot, "web", ".env.local");
  const url = lireVariable(chemin, "DATABASE_URL");
  if (!url) {
    rouge(`DATABASE_URL absente de ${chemin}`);
    process.exit(2);
  }

  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    // LA LECTURE SEULE EST IMPOSEE PAR LA BASE, PAS PAR MA PRUDENCE.
    await client.query("SET default_transaction_read_only = on");

    bleu("== A qui parle-t-on ==");
    const { rows: ident } = await client.query(
      `SELECT current_database() AS base,
              current_user       AS role,
              version()          AS version,
              current_setting('server_version') AS pg,
              now()              AS mesure_le`,
    );
    const i = ident[0];
    gris(`  hote          ${hoteMasque(url)}`);
    vert(`  base          ${i.base}`);
    vert(`  role          ${i.role}`);
    vert(`  PostgreSQL    ${i.pg}`);
    vert(`  mesure le     ${new Date(i.mesure_le).toISOString()}`);
    gris(`  (chaine de connexion jamais affichee)`);

    bleu("\n== Schemas et volumetrie des tables ==");
    const { rows: tables } = await client.query(
      `SELECT c.relname AS table, n.nspname AS schema, c.reltuples::bigint AS lignes_estimees
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' AND n.nspname NOT IN ('pg_catalog','information_schema')
        ORDER BY c.reltuples DESC NULLS LAST, c.relname`,
    );
    console.log(`  ${tables.length} table(s)`);
    for (const t of tables.slice(0, 40)) {
      console.log(`    ${t.schema}.${t.table}`.padEnd(46) + `${t.lignes_estimees ?? "?"} (estime)`);
    }

    // LES COMPTES EXACTS, SUR LES TABLES QUI EXISTENT VRAIMENT.
    //
    // On ne devine aucun nom : on cherche les tables metier parmi celles que la
    // base declare, et on ne compte que celles qu'on a trouvees.
    bleu("\n== Comptes exacts (tables metier trouvees) ==");
    const presentes = new Map(tables.map((t) => [t.table.toLowerCase(), `${t.schema}."${t.table}"`]));
    const cibles = [
      "eleves", "eleve", "students",
      "classes", "classe",
      "inscriptions", "inscription",
      "parents", "parent", "tuteurs",
      "absences", "absence",
      "retards", "retard",
      "emploi_du_temps", "emplois_du_temps", "cours", "seances", "creneaux",
      "personnels", "personnel", "enseignants", "utilisateurs", "users",
      "matieres", "matiere",
      "periodes", "periodes_scolaires", "annees_scolaires",
      "communications", "messages", "notifications",
      "audit", "audit_log", "journal_audit", "audits",
    ];
    const trouvees = [];
    for (const nom of cibles) {
      const ref = presentes.get(nom);
      if (!ref || trouvees.some((t) => t.ref === ref)) continue;
      const { rows } = await client.query(`SELECT count(*)::bigint AS n FROM ${ref}`);
      trouvees.push({ nom, ref, n: Number(rows[0].n) });
    }
    if (trouvees.length === 0) rouge("  aucune table metier reconnue parmi les noms cherches");
    for (const t of trouvees) vert(`  ${t.nom.padEnd(24)} ${t.n}`);

    // LA PROVENANCE : y a-t-il de quoi la determiner ?
    //
    // Une ligne presente en base n'est pas pour autant une donnee scolaire
    // reelle. On cherche donc les colonnes qui pourraient en dire la source.
    bleu("\n== De quoi etablir la provenance ==");
    const { rows: colonnes } = await client.query(
      `SELECT table_name, column_name, data_type
         FROM information_schema.columns
        WHERE table_schema NOT IN ('pg_catalog','information_schema')
          AND (column_name ~* '(provenance|source|origine|import|seed|test|fictif|demo|cree_par|created_by|createdby)')
        ORDER BY table_name, column_name`,
    );
    if (colonnes.length === 0) {
      rouge("  AUCUNE colonne de provenance : la provenance des lignes n'est pas determinable");
      rouge("  => statut a retenir pour les donnees existantes : PROVENANCE_NON_VERIFIEE");
    } else {
      for (const c of colonnes) console.log(`    ${c.table_name}.${c.column_name} (${c.data_type})`);
    }

    bleu("\n== Periodes et annees scolaires ==");
    for (const nom of ["periodes", "periodes_scolaires", "annees_scolaires"]) {
      const ref = presentes.get(nom);
      if (!ref) continue;
      const { rows } = await client.query(`SELECT * FROM ${ref} ORDER BY 1 LIMIT 10`);
      console.log(`  ${nom} : ${rows.length} ligne(s) lues`);
      for (const r of rows) {
        const lisible = Object.entries(r)
          .filter(([k]) => !/id$/i.test(k))
          .slice(0, 6)
          .map(([k, v]) => `${k}=${v instanceof Date ? v.toISOString().slice(0, 10) : v}`)
          .join("  ");
        console.log(`    ${lisible}`);
      }
    }

    bleu("\n== Migrations appliquees ==");
    for (const nom of ["__drizzle_migrations", "drizzle_migrations", "_prisma_migrations"]) {
      const ref = presentes.get(nom);
      if (!ref) continue;
      const { rows } = await client.query(`SELECT count(*)::bigint AS n FROM ${ref}`);
      vert(`  ${nom} : ${rows[0].n} migration(s)`);
    }
    const { rows: drizzle } = await client.query(
      `SELECT count(*)::bigint AS n FROM information_schema.tables WHERE table_schema = 'drizzle'`,
    );
    if (Number(drizzle[0].n) > 0) gris(`  schema drizzle present (${drizzle[0].n} table(s))`);
  } finally {
    await client.end();
    bleu("\n== Connexion fermee ==");
  }
}

principal().catch((e) => {
  rouge(`Echec : ${String(e?.message ?? e).slice(0, 300)}`);
  process.exit(1);
});
