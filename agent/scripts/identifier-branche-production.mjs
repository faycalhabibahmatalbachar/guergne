/**
 * Quelle branche Neon sert la production ? Preuve par divergence, LECTURE SEULE.
 *
 * LE CHEMIN DIRECT N'EST PAS DISPONIBLE
 * --------------------------------------
 * La preuve idéale serait de lire `DATABASE_URL` dans les variables du
 * déploiement Production sur Vercel. Aucun accès Vercel n'existe sur ce poste
 * (ni CLI, ni jeton) — et la route publique `/api/sante` ne dit rien de la
 * base, à dessein.
 *
 * UNE PREMIÈRE MÉTHODE A ÉTÉ ESSAYÉE, PUIS ÉCARTÉE
 * -------------------------------------------------
 * Compter les transactions (`pg_stat_database.xact_commit`) de chaque branche
 * pendant des appels à la sonde de production. Elle concluait à une « troisième
 * base ». Un CONTRÔLE l'a invalidée : 40 `SELECT 1` passés soi-même par le
 * pooler de la même branche ne produisaient qu'un excédent de 1. Le compteur,
 * lu sur le compute direct, ne voit pas fiablement le trafic du pooler. Sa
 * conclusion ne valait donc rien.
 *
 * LA MÉTHODE RETENUE : CE QUI S'EST PASSÉ APRÈS LA BIFURCATION
 * -------------------------------------------------------------
 * Deux branches Neon créées l'une de l'autre partagent tout leur passé. Leur
 * point de bifurcation est la ligne d'audit la plus récente présente sur les
 * deux. Tout ce qui est écrit APRÈS n'existe que sur la branche qui l'a reçu.
 *
 * Il suffit alors de regarder D'OÙ venaient ces écritures. Le journal d'audit
 * et les sessions enregistrent l'adresse du client :
 *   - `local`   : boucle locale (127.0.0.1, ::1) — un serveur lancé sur un poste ;
 *   - `distant` : toute autre adresse — un client passé par un déploiement.
 *
 * Aucune adresse n'est affichée : seulement des comptes par catégorie.
 * Aucune écriture : sessions en `default_transaction_read_only`.
 *
 *   node scripts/identifier-branche-production.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const depot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const bleu = (s) => console.log(`\x1b[1;34m${s}\x1b[0m`);
const vert = (s) => console.log(`\x1b[1;32m${s}\x1b[0m`);
const rouge = (s) => console.error(`\x1b[1;31m${s}\x1b[0m`);
const gris = (s) => console.log(`\x1b[0;90m${s}\x1b[0m`);

function lire(fichier, nom) {
  for (const ligne of readFileSync(fichier, "utf8").split(/\r?\n/)) {
    const m = ligne.match(/^([A-Z_0-9]+)\s*=\s*(.*)$/);
    if (m && m[1] === nom) return m[2].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

/** La catégorie d'origine, calculée par la base : aucune adresse ne sort. */
const IP = "split_part(adresse_ip::text, '/', 1)";
const ORIGINE = `CASE
  WHEN adresse_ip IS NULL THEN 'sans adresse'
  WHEN ${IP} ~ '^(127\\.|::1$|::ffff:127\\.)' THEN 'local'
  ELSE 'distant' END`;

async function principal() {
  const branches = [];
  for (const f of [".env.local", ".env.development.local"]) {
    const chemin = join(depot, "web", f);
    const url = lire(chemin, "DATABASE_URL_DIRECT") ?? lire(chemin, "DATABASE_URL");
    const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
    await c.connect();
    await c.query("SET default_transaction_read_only = on");
    const q = async (s, p) => (await c.query(s, p)).rows;
    const [{ branche }] = await q("SELECT current_setting('neon.branch_id', true) AS branche");
    const [{ courante }] = await q("SELECT (SELECT libelle FROM annees_scolaires WHERE est_courante) AS courante");
    const [{ m0040 }] = await q("SELECT EXISTS (SELECT 1 FROM _migrations WHERE nom LIKE '0040%') AS m0040");
    branches.push({ fichier: f, branche, courante, m0040, c, q });
  }

  try {
    bleu("== Branches candidates ==");
    for (const b of branches) {
      gris(`  ${b.branche.padEnd(28)} ${b.fichier.padEnd(24)} annee courante ${b.courante}   0040 ${b.m0040 ? "presente" : "absente"}`);
    }

    // Le point de bifurcation : la ligne d'audit la plus récente commune aux deux.
    const [a, b] = branches;
    const idsA = new Set((await a.q("SELECT id::text FROM journal_audit")).map((r) => r.id));
    const communes = (await b.q("SELECT id::text, cree_le FROM journal_audit ORDER BY cree_le DESC")).filter((r) => idsA.has(r.id));
    if (communes.length === 0) {
      rouge("Aucune ligne d'audit commune : ces branches ne descendent pas l'une de l'autre.");
      process.exitCode = 1;
      return;
    }
    const bifurcation = communes[0].cree_le;
    bleu(`\n== Bifurcation : ${bifurcation.toISOString()} (${communes.length} lignes d'audit communes) ==`);

    const bilan = [];
    for (const br of branches) {
      const audit = await br.q(
        `SELECT ${ORIGINE} AS origine, count(*)::int n, max(cree_le) AS fin FROM journal_audit WHERE cree_le > $1 GROUP BY 1`,
        [bifurcation],
      );
      const sessions = await br.q(
        `SELECT ${ORIGINE} AS origine, count(*)::int n, max(cree_le) AS fin FROM sessions WHERE cree_le > $1 GROUP BY 1`,
        [bifurcation],
      );
      const compte = (lignes, o) => lignes.find((l) => l.origine === o)?.n ?? 0;
      const fin = (lignes, o) => lignes.find((l) => l.origine === o)?.fin ?? null;
      const ligne = {
        branche: br.branche,
        fichier: br.fichier,
        auditDistant: compte(audit, "distant"),
        auditLocal: compte(audit, "local"),
        sessionsDistantes: compte(sessions, "distant"),
        derniereDistante: fin(audit, "distant") ?? fin(sessions, "distant"),
      };
      bilan.push(ligne);
      console.log(
        `  ${ligne.branche.padEnd(28)} audit distant ${String(ligne.auditDistant).padStart(3)}   audit local ${String(ligne.auditLocal).padStart(3)}   sessions distantes ${String(ligne.sessionsDistantes).padStart(3)}` +
          (ligne.derniereDistante ? `   derniere activite distante ${new Date(ligne.derniereDistante).toISOString().slice(0, 16)}` : ""),
      );
    }

    bleu("\n== Verdict ==");
    const distantes = bilan.filter((l) => l.auditDistant + l.sessionsDistantes > 0);
    if (distantes.length === 1) {
      const p = distantes[0];
      vert(`  Depuis la bifurcation, TOUTE l'activite de clients distants est sur ${p.branche} (${p.fichier}).`);
      vert("  C'est la branche servie par un deploiement public : la production.");
      gris("  Limite : cette preuve montre qu'un deploiement public ecrit sur cette branche.");
      gris("  Elle ne lit pas DATABASE_URL dans Vercel, faute d'acces.");
    } else if (distantes.length === 0) {
      rouge("  Aucune activite distante depuis la bifurcation : impossible de conclure.");
    } else {
      rouge("  Les deux branches recoivent des clients distants : deux deploiements publics ?");
    }
  } finally {
    for (const br of branches) await br.c.end().catch(() => {});
  }
}

principal().catch((e) => {
  rouge(`Echec : ${String(e?.message ?? e).slice(0, 300)}`);
  process.exit(1);
});
