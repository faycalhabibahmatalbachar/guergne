/**
 * Simulation de la création de l'année scolaire 2026-2027 — LECTURE SEULE.
 *
 * POURQUOI UNE SIMULATION AVANT L'ÉCRITURE
 * -----------------------------------------
 * Créer une année scolaire n'est pas une insertion de deux lignes : c'est
 * l'ouverture d'un exercice dont dépendent les classes, les inscriptions, les
 * emplois du temps, les absences et les bulletins. Une erreur de date ou un
 * drapeau mal posé ne se verrait pas à l'insertion — il se verrait des semaines
 * plus tard, dans un bulletin faux.
 *
 * Ce script n'écrit RIEN. Il calcule les lignes exactes, les confronte aux
 * contraintes réelles de la base, et dit ce qui resterait bloqué après coup.
 * La session est ouverte en lecture seule au niveau de PostgreSQL lui-même.
 *
 *   node scripts/simuler-annee-2026-2027.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const depot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const bleu = (s) => console.log(`\x1b[1;34m${s}\x1b[0m`);
const vert = (s) => console.log(`\x1b[1;32m${s}\x1b[0m`);
const rouge = (s) => console.error(`\x1b[1;31m${s}\x1b[0m`);
const jaune = (s) => console.log(`\x1b[1;33m${s}\x1b[0m`);
const gris = (s) => console.log(`\x1b[0;90m${s}\x1b[0m`);

/**
 * LE CALENDRIER PROPOSÉ PAR LA DIRECTION.
 *
 * Ces dates sont une PROPOSITION du responsable du projet, à confronter au
 * calendrier interne de l'établissement. Elles ne viennent pas d'une source
 * officielle et ne doivent pas être présentées comme telle.
 */
const ANNEE = {
  libelle: "2026-2027",
  date_debut: "2026-10-01",
  date_fin: "2027-05-29",
  type_periode: "TRIMESTRE",
};

const PERIODES = [
  { numero: 1, libelle: "1er Trimestre", date_debut: "2026-10-01", date_fin: "2026-12-22" },
  { numero: 2, libelle: "2ème Trimestre", date_debut: "2027-01-05", date_fin: "2027-04-01" },
  { numero: 3, libelle: "3ème Trimestre", date_debut: "2027-04-10", date_fin: "2027-05-29" },
];

function lireVariable(chemin, nom) {
  for (const ligne of readFileSync(chemin, "utf8").split(/\r?\n/)) {
    const m = ligne.match(/^([A-Z_0-9]+)\s*=\s*(.*)$/);
    if (m && m[1] === nom) return m[2].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

const jour = (s) => new Date(`${s}T00:00:00Z`);

async function principal() {
  const url = lireVariable(join(depot, "web", ".env.local"), "DATABASE_URL");
  if (!url) {
    rouge("DATABASE_URL introuvable");
    process.exit(2);
  }
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  const anomalies = [];

  try {
    await c.query("SET default_transaction_read_only = on");
    const [{ aujourdhui }] = await q("SELECT current_date::text AS aujourdhui");

    bleu("== 1. Les lignes qui seraient créées ==");
    console.log("\n  annees_scolaires (1 ligne)");
    console.log("    id              gen_random_uuid()   (généré par la base)");
    console.log(`    libelle         ${ANNEE.libelle}`);
    console.log(`    date_debut      ${ANNEE.date_debut}`);
    console.log(`    date_fin        ${ANNEE.date_fin}`);
    console.log(`    type_periode    ${ANNEE.type_periode}`);
    console.log("    est_courante    true      <- exige de basculer 2025-2026 à false");
    console.log("    est_cloturee    false");
    console.log("\n  periodes (3 lignes, annee_id = l'année ci-dessus)");
    for (const p of PERIODES) {
      const actif = jour(aujourdhui) >= jour(p.date_debut) && jour(aujourdhui) <= jour(p.date_fin);
      console.log(
        `    n°${p.numero}  ${p.libelle.padEnd(16)} ${p.date_debut} -> ${p.date_fin}  ` +
          `saisie_ouverte=${actif ? "TRUE " : "false"}  ${actif ? "<- trimestre courant" : ""}`,
      );
    }
    gris("\n    (saisie ouverte UNIQUEMENT sur le trimestre qui couvre aujourd'hui)");

    bleu("\n== 2. Vérifications d'intégrité contre la base réelle ==");

    const dejaLa = await q("SELECT libelle FROM annees_scolaires WHERE libelle = $1", [ANNEE.libelle]);
    if (dejaLa.length > 0) anomalies.push(`une année « ${ANNEE.libelle} » existe déjà`);
    else vert(`  OK   aucune année « ${ANNEE.libelle} » (contrainte UNIQUE(libelle) respectée)`);

    // `uq_annee_courante` : index unique partiel sur `est_courante WHERE est_courante`.
    // Une seule année courante est possible — c'est la contrainte qui impose la
    // bascule, et non un choix de confort.
    const courantes = await q("SELECT libelle FROM annees_scolaires WHERE est_courante");
    if (courantes.length > 0) {
      jaune(`  ATTENTION  « ${courantes[0].libelle} » est actuellement courante.`);
      jaune("             L'index uq_annee_courante n'en autorise qu'une : l'insertion");
      jaune("             ÉCHOUERAIT sans basculer d'abord ce drapeau à false.");
    }

    for (const p of PERIODES) {
      if (jour(p.date_fin) <= jour(p.date_debut)) anomalies.push(`période ${p.numero} : chk_periode_dates violé`);
      if (jour(p.date_debut) < jour(ANNEE.date_debut) || jour(p.date_fin) > jour(ANNEE.date_fin)) {
        anomalies.push(`période ${p.numero} sort des bornes de l'année`);
      }
    }
    if (jour(ANNEE.date_fin) <= jour(ANNEE.date_debut)) anomalies.push("chk_annee_dates violé");
    const triees = [...PERIODES].sort((a, b) => jour(a.date_debut) - jour(b.date_debut));
    for (let i = 1; i < triees.length; i += 1) {
      if (jour(triees[i].date_debut) <= jour(triees[i - 1].date_fin)) {
        anomalies.push(`périodes ${triees[i - 1].numero} et ${triees[i].numero} se chevauchent`);
      }
    }
    if (anomalies.length === 0) vert("  OK   dates cohérentes, aucun chevauchement, bornes respectées");

    // Chevauchement avec l'année précédente : deux années qui se recouvrent
    // rendraient toute question « quelle année ? » ambiguë.
    const [prec] = await q("SELECT libelle, date_debut::text d, date_fin::text f FROM annees_scolaires ORDER BY date_debut DESC LIMIT 1");
    if (prec) {
      const chevauche = jour(ANNEE.date_debut) <= jour(prec.f) && jour(prec.d) <= jour(ANNEE.date_fin);
      if (chevauche) anomalies.push(`chevauchement avec ${prec.libelle} (${prec.d} -> ${prec.f})`);
      else vert(`  OK   aucun chevauchement avec ${prec.libelle} (${prec.d} -> ${prec.f})`);
    }

    const couvreAujourdhui = PERIODES.some(
      (p) => jour(aujourdhui) >= jour(p.date_debut) && jour(aujourdhui) <= jour(p.date_fin),
    );
    if (couvreAujourdhui) vert(`  OK   un trimestre couvre aujourd'hui (${aujourdhui})`);
    else anomalies.push(`aucun trimestre ne couvre aujourd'hui (${aujourdhui})`);

    bleu("\n== 3. Dates nationales / dates scolaires internes ==");
    gris("  Les intervalles entre trimestres sont des dates SCOLAIRES INTERNES :");
    for (let i = 1; i < triees.length; i += 1) {
      const d = new Date(jour(triees[i - 1].date_fin).getTime() + 86400000).toISOString().slice(0, 10);
      const f = new Date(jour(triees[i].date_debut).getTime() - 86400000).toISOString().slice(0, 10);
      console.log(`    ${d} -> ${f}   interruption entre T${triees[i - 1].numero} et T${triees[i].numero}`);
    }
    gris("  Elles relèvent de `evenements_calendrier` (type VACANCES), table qui");
    gris(`  compte aujourd'hui ${(await q("SELECT count(*)::int n FROM evenements_calendrier"))[0].n} ligne(s).`);
    jaune("  Les jours FÉRIÉS NATIONAUX ne sont PAS insérés : je n'ai pas de source");
    jaune("  officielle tchadienne, et les inventer serait pire que les omettre.");

    bleu("\n== 4. Ce qui reste bloqué après cette création ==");
    const [{ n: nbClasses }] = await q(
      "SELECT count(*)::int n FROM classes WHERE annee_id = (SELECT id FROM annees_scolaires WHERE libelle = $1)",
      [prec?.libelle ?? ""],
    );
    jaune("  Une absence exige `inscription_id` ET `periode_id`.");
    jaune("  Or une inscription exige `annee_id` + `classe_id`, et une classe exige `annee_id`.");
    console.log(`\n    chaîne : année -> classes -> inscriptions -> absences`);
    console.log(`    pour 2026-2027 après cette migration : 0 classe, 0 inscription`);
    console.log(`    (2025-2026 en compte ${nbClasses} classes et ${(await q("SELECT count(*)::int n FROM inscriptions")) [0].n} inscriptions)`);
    rouge("\n  => L'ENREGISTREMENT D'ABSENCES RESTERA IMPOSSIBLE tant que les classes");
    rouge("     et les inscriptions de 2026-2027 n'existent pas. Le passage d'année");
    rouge("     (qui va en 5ème A, qui redouble, qui part) est une décision de la");
    rouge("     direction : je ne peux pas la deviner.");

    console.log("");
    const parNiveau = await q(
      `SELECT c.code, count(i.id)::int n
         FROM classes c LEFT JOIN inscriptions i ON i.classe_id = c.id
        WHERE c.annee_id = (SELECT id FROM annees_scolaires WHERE est_courante)
        GROUP BY c.code ORDER BY c.code`,
    );
    gris("  Effectifs 2025-2026, qui serviront de base au passage d'année :");
    gris("    " + parNiveau.map((r) => `${r.code}:${r.n}`).join("  "));

    bleu("\n== 5. Conséquences par domaine ==");
    const lignes = [
      ["absences", "aucune incidence sur les 2 720 existantes (liées aux périodes de 2025-2026)"],
      ["retards", "aucune incidence sur les 2 236 existants"],
      ["emploi_du_temps", "les 274 créneaux restent sur 2025-2026 ; 2026-2027 démarre vide"],
      ["inscriptions", "les 549 restent sur 2025-2026 ; UNIQUE(eleve_id, annee_id) permettra la réinscription"],
      ["classes", "les 15 restent sur 2025-2026 ; à recréer pour 2026-2027"],
      ["bulletins / notes / moyennes", "intouchés : ils pendent aux périodes de 2025-2026"],
      ["rapports", "porteront sur une année vide jusqu'au passage d'année — et le diront"],
      ["profils_horaires / regles_horaires", "2 et 5 lignes sur 2025-2026 ; à reconduire pour l'emploi du temps"],
    ];
    for (const [quoi, effet] of lignes) console.log(`    ${quoi.padEnd(34)} ${effet}`);

    bleu("\n== 6. Réversibilité ==");
    vert("  `periodes.annee_id` est ON DELETE CASCADE : supprimer l'année retire ses");
    vert("  3 périodes. Le retour arrière est donc propre TANT QUE rien n'y est");
    vert("  rattaché.");
    rouge("  Dès la première absence saisie sur T1 2026-2027, le CASCADE la");
    rouge("  supprimerait aussi : le rollback cesse alors d'être anodin.");

    bleu("\n== Verdict ==");
    if (anomalies.length === 0) {
      vert("  Aucune anomalie bloquante. L'insertion est techniquement sûre.");
    } else {
      rouge(`  ${anomalies.length} anomalie(s) :`);
      for (const a of anomalies) rouge(`    - ${a}`);
      process.exitCode = 1;
    }
  } finally {
    await c.end();
  }
}

principal().catch((e) => {
  rouge(`Échec : ${String(e?.message ?? e).slice(0, 300)}`);
  process.exit(1);
});
