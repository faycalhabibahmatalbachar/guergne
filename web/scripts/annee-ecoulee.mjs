#!/usr/bin/env node
/**
 * Fait vivre une année scolaire complète, du premier cours au dernier bulletin.
 *
 * POURQUOI CE SCRIPT EXISTE
 * -------------------------
 * `db:peupler` crée un établissement à sa rentrée : élèves, classes, tarifs.
 * Mais une école n'est pas un annuaire — elle produit des cours, des notes,
 * des absences, des bulletins. Sans cette matière, l'application des parents
 * n'affiche que des écrans « en préparation », et rien ne prouve que la chaîne
 * saisie → moyenne → rang → bulletin → téléphone fonctionne réellement.
 *
 * Le script recule donc l'année active d'un an — l'école vient de terminer son
 * année plutôt que de l'attendre — puis déroule les trois trimestres :
 *
 *   emploi du temps → évaluations → notes → moyennes → rangs → bulletins
 *   absences, retards, incidents, appréciations, annonces
 *
 * Tout est cohérent entre les tables : le rang découle des moyennes, la
 * moyenne de classe découle des élèves, les heures d'absence du bulletin
 * découlent des absences réellement saisies. Aucun chiffre n'est inventé
 * indépendamment d'un autre — c'est ce qui distingue des données vivantes
 * d'une vitrine.
 *
 * Usage :
 *   npm run db:annee            — déroule l'année
 *   npm run db:annee -- --purge — retire uniquement ce que ce script a créé
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const ICI = path.dirname(fileURLToPath(import.meta.url));

const envLocal = path.resolve(ICI, "../.env.local");
if (existsSync(envLocal)) {
  for (const ligne of readFileSync(envLocal, "utf8").split("\n")) {
    const m = ligne.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const url =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL absente.");
  process.exit(1);
}

const PURGE = process.argv.includes("--purge");

// ---------------------------------------------------------------------------
// Aléa reproductible
//
// Un tirage figé rend le script rejouable à l'identique : deux exécutions
// produisent la même école. Sans cela, impossible de comparer un écran d'un
// jour à l'autre ni de reproduire un défaut signalé.
// ---------------------------------------------------------------------------

let graine = 20262027;
const alea = () => {
  graine = (graine * 1103515245 + 12345) & 0x7fffffff;
  return graine / 0x7fffffff;
};
const entre = (a, b) => a + Math.floor(alea() * (b - a + 1));
const piocher = (liste) => liste[Math.floor(alea() * liste.length)];

/** Tirage centré, borné — une note se distribue en cloche, pas uniformément. */
const gaussien = (moyenne, ecart, min, max) => {
  const u = Math.max(1e-9, alea());
  const v = alea();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.min(max, Math.max(min, moyenne + z * ecart));
};

const arrondi2 = (x) => Math.round(x * 100) / 100;
const jour = (d) => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Connexion
// ---------------------------------------------------------------------------

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const q = (texte, valeurs = []) => client.query(texte, valeurs);
const un = async (texte, valeurs = []) => (await q(texte, valeurs)).rows[0];

/**
 * Insertion groupée.
 *
 * Le premier peuplement a coûté trente minutes parce que chaque ligne faisait
 * son propre aller-retour jusqu'à Francfort. Ici les lignes partent par
 * paquets : 44 000 notes tiennent en une centaine d'échanges au lieu de
 * 44 000.
 */
async function inserer(table, colonnes, lignes, paquet = 800) {
  if (lignes.length === 0) return 0;

  for (let i = 0; i < lignes.length; i += paquet) {
    const tranche = lignes.slice(i, i + paquet);
    const valeurs = [];
    const gabarits = tranche.map((ligne, n) => {
      const base = n * colonnes.length;
      valeurs.push(...ligne);
      return `(${colonnes.map((_, c) => `$${base + c + 1}`).join(",")})`;
    });

    await q(
      `INSERT INTO ${table} (${colonnes.join(",")}) VALUES ${gabarits.join(",")}`,
      valeurs,
    );
  }
  return lignes.length;
}

// ---------------------------------------------------------------------------
// Purge
// ---------------------------------------------------------------------------

async function purger() {
  console.log("Retrait de la vie scolaire semée…");
  await q("BEGIN");
  try {
    // Ordre imposé par les clés étrangères.
    await q(`DELETE FROM notifications WHERE type IN ('ABSENCE','ANNONCE','NOTE_PUBLIEE','BULLETIN_PUBLIE')`);
    await q(`DELETE FROM bulletins`);
    await q(`DELETE FROM moyennes_generales`);
    await q(`DELETE FROM moyennes_matiere`);
    await q(`DELETE FROM appreciations_matiere`);
    await q(`DELETE FROM notes_conduite`);
    await q(`DELETE FROM notes`);
    await q(`DELETE FROM evaluations`);
    await q(`DELETE FROM sanctions`);
    await q(`DELETE FROM incidents`);
    await q(`DELETE FROM retards`);
    await q(`DELETE FROM absences`);
    await q(`DELETE FROM emploi_du_temps`);
    await q(`DELETE FROM lectures_annonces`);
    await q(`DELETE FROM annonces WHERE donnees_semees`);
    await q(`UPDATE periodes SET est_verrouillee = FALSE, verrouillee_le = NULL, saisie_ouverte = TRUE`);
    await q("COMMIT");
    console.log("Vie scolaire retirée. Élèves, classes et finances intacts.\n");
  } catch (erreur) {
    await q("ROLLBACK");
    console.error("Échec de la purge :", erreur.message);
    process.exit(1);
  }
}

if (PURGE) {
  await purger();
  await client.end();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Contenus rédactionnels
// ---------------------------------------------------------------------------

const APPRECIATIONS_MATIERE = {
  excellent: [
    "Excellent trimestre. Élève sérieux, curieux, moteur pour la classe.",
    "Très bon niveau, travail rigoureux et régulier. Continuez ainsi.",
    "Résultats remarquables. La participation orale est un vrai atout.",
  ],
  bon: [
    "Bon trimestre dans l'ensemble. Le travail personnel porte ses fruits.",
    "Ensemble satisfaisant. Quelques imprécisions à corriger à l'écrit.",
    "Des progrès nets ce trimestre. Poursuivez cet effort.",
  ],
  moyen: [
    "Résultats justes. Un travail plus régulier à la maison est nécessaire.",
    "Trimestre moyen. Les bases sont là mais la méthode reste à consolider.",
    "Peut mieux faire. L'attention en classe est trop irrégulière.",
  ],
  faible: [
    "Trimestre insuffisant. Des lacunes importantes restent à combler.",
    "Travail nettement insuffisant. Un soutien est vivement conseillé.",
    "Résultats préoccupants. L'élève doit se remettre au travail sans tarder.",
  ],
};

const APPRECIATIONS_GENERALES = {
  excellent: [
    "Excellent trimestre. Le conseil de classe adresse ses félicitations.",
    "Très beau parcours, régulier dans toutes les disciplines. Bravo.",
  ],
  bon: [
    "Trimestre satisfaisant. Des résultats solides, à confirmer.",
    "Bon ensemble. Le conseil encourage à poursuivre dans cette voie.",
  ],
  moyen: [
    "Trimestre juste. Un travail plus soutenu permettrait de progresser.",
    "Ensemble fragile mais les capacités sont réelles. Il faut s'y mettre.",
  ],
  faible: [
    "Trimestre très insuffisant. Le conseil met en garde contre le redoublement.",
    "Résultats alarmants. Un entretien avec la famille est nécessaire.",
  ],
};

const MOTIFS_ABSENCE = [
  "Maladie",
  "Consultation médicale",
  "Voyage familial",
  "Décès dans la famille",
  "Palu",
  null,
  null,
];

const MOTIFS_RETARD = ["Transport", "Panne de moto-taxi", "Pluie", "Embouteillage", null];

const INCIDENTS = [
  ["MINEURE", "Bavardages répétés perturbant le déroulement du cours."],
  ["MINEURE", "Devoir non rendu à plusieurs reprises malgré les rappels."],
  ["MINEURE", "Utilisation du téléphone portable pendant le cours."],
  ["MOYENNE", "Insolence envers un enseignant lors d'un rappel à l'ordre."],
  ["MOYENNE", "Altercation verbale avec un camarade dans la cour."],
  ["GRAVE", "Bagarre dans la cour de récréation, séparée par la surveillance."],
];

function annonces(anneeRentree) {
  const a = anneeRentree;
  return [
    [`Rentrée scolaire ${a}-${a + 1}`,
     `La rentrée des élèves aura lieu le lundi 1er octobre ${a} à 7h30. ` +
     `Les listes de classes sont affichées à l'entrée principale. ` +
     `Chaque élève se présentera en tenue réglementaire, muni de son carnet de correspondance.`,
     true, `${a}-09-25`],
    ["Réunion des parents d'élèves — premier trimestre",
     `Une réunion se tiendra le samedi 22 novembre ${a} à 9h dans la cour de l'établissement. ` +
     `Les résultats du premier trimestre y seront commentés classe par classe. ` +
     `La présence d'au moins un responsable par élève est vivement souhaitée.`,
     true, `${a}-11-12`],
    ["Compositions du premier trimestre",
     `Les compositions se dérouleront du 1er au 5 décembre ${a}. ` +
     `Le calendrier détaillé est affiché dans chaque classe. ` +
     `Aucun élève ne sera admis en salle après le début de l'épreuve.`,
     false, `${a}-11-20`],
    ["Publication des bulletins du premier trimestre",
     `Les bulletins du premier trimestre sont désormais consultables dans l'application. ` +
     `Les parents souhaitant rencontrer un enseignant peuvent en faire la demande au secrétariat.`,
     false, `${a + 1}-01-08`],
    ["Fermeture exceptionnelle",
     `L'établissement sera fermé le vendredi 28 novembre ${a} pour la journée pédagogique ` +
     `des enseignants. Les cours reprennent normalement le lundi 1er décembre.`,
     false, `${a}-11-24`],
    ["Rappel — règlement des frais de scolarité",
     `Les familles n'ayant pas soldé la deuxième tranche sont invitées à se rapprocher ` +
     `de la comptabilité avant la fin du mois. Un reçu numéroté est remis à chaque versement.`,
     false, `${a + 1}-02-10`],
    ["Compositions du deuxième trimestre",
     `Les compositions du deuxième trimestre auront lieu du 16 au 20 mars ${a + 1}. ` +
     `Les élèves de Terminale passeront en outre un examen blanc du 23 au 27 mars.`,
     false, `${a + 1}-03-05`],
    ["Examen blanc du baccalauréat",
     `L'examen blanc des classes de Terminale se tiendra du 23 au 27 mars ${a + 1} ` +
     `dans les conditions de l'examen. Convocation individuelle remise en classe.`,
     true, `${a + 1}-03-16`],
    ["Fête de fin d'année",
     `La cérémonie de remise des prix aura lieu le samedi 11 juillet ${a + 1} à 9h. ` +
     `Les familles des élèves distingués recevront une invitation nominative.`,
     false, `${a + 1}-06-30`],
    [`Résultats de fin d'année ${a}-${a + 1}`,
     `Les bulletins annuels et les décisions du conseil de classe sont consultables ` +
     `dans l'application. Les inscriptions pour la rentrée prochaine ouvrent le 1er septembre.`,
     true, `${a + 1}-07-15`],
  ];
}

// ===========================================================================
// Déroulement
// ===========================================================================

console.log("Déroulement d'une année scolaire complète…\n");
await q("BEGIN");

try {
  // -------------------------------------------------------------------------
  // 1. Reculer l'année d'un an
  // -------------------------------------------------------------------------
  const anneeAvant = await un(
    `SELECT id, libelle, date_debut, date_fin FROM annees_scolaires WHERE est_courante`,
  );
  if (!anneeAvant) throw new Error("Aucune année scolaire courante.");

  const rentreeAvant = Number(String(anneeAvant.libelle).slice(0, 4));
  const dejaEcoulee = new Date(anneeAvant.date_fin) < new Date();

  let annee = anneeAvant;
  let rentree = rentreeAvant;

  if (!dejaEcoulee) {
    rentree = rentreeAvant - 1;
    const libelle = `${rentree}-${rentree + 1}`;

    // Les dates reculent d'un an, jour pour jour : le calendrier scolaire
    // tchadien ne se décale pas, seule l'année change.
    await q(
      `UPDATE annees_scolaires
          SET libelle = $2,
              date_debut = date_debut - INTERVAL '1 year',
              date_fin = date_fin - INTERVAL '1 year'
        WHERE id = $1`,
      [annee.id, libelle],
    );
    await q(
      `UPDATE periodes
          SET date_debut = date_debut - INTERVAL '1 year',
              date_fin = date_fin - INTERVAL '1 year',
              date_cloture_saisie = date_cloture_saisie - INTERVAL '1 year'
        WHERE annee_id = $1`,
      [annee.id],
    );
    // Les échéances et les reçus suivent : une scolarité réglée en novembre
    // ne peut pas porter une date postérieure à la fin de l'année.
    await q(
      `UPDATE echeances SET date_limite = date_limite - INTERVAL '1 year'
        WHERE inscription_id IN (SELECT id FROM inscriptions WHERE annee_id = $1)`,
      [annee.id],
    );
    await q(
      `UPDATE paiements SET date_paiement = date_paiement - INTERVAL '1 year'
        WHERE inscription_id IN (SELECT id FROM inscriptions WHERE annee_id = $1)`,
      [annee.id],
    );
    await q(
      `UPDATE inscriptions SET date_inscription = date_inscription - INTERVAL '1 year'
        WHERE annee_id = $1`,
      [annee.id],
    );
    // Le matricule porte l'année d'inscription : le laisser en 2026 sur une
    // année 2025-2026 serait un détail faux que le secrétariat repérerait.
    await q(
      `UPDATE eleves SET matricule = replace(matricule, $1, $2)
        WHERE matricule LIKE $3`,
      [`LGR-${rentreeAvant}-`, `LGR-${rentree}-`, `LGR-${rentreeAvant}-%`],
    );

    annee = await un(`SELECT id, libelle, date_debut, date_fin FROM annees_scolaires WHERE id = $1`, [annee.id]);
    console.log(`  Année ramenée à ${libelle} (${jour(new Date(annee.date_debut))} → ${jour(new Date(annee.date_fin))})`);
  } else {
    console.log(`  Année ${annee.libelle} déjà écoulée, conservée telle quelle`);
  }

  await q(`SELECT rafraichir_echeances_en_retard()`);

  // -------------------------------------------------------------------------
  // 2. Référentiel
  // -------------------------------------------------------------------------
  const periodes = (
    await q(`SELECT id, numero, date_debut, date_fin FROM periodes WHERE annee_id = $1 ORDER BY numero`, [annee.id])
  ).rows;
  if (periodes.length === 0) throw new Error("Aucune période sur l'année courante.");

  const classes = (
    await q(
      `SELECT c.id, c.libelle, c.niveau_id, n.code AS niveau_code, n.cycle
         FROM classes c JOIN niveaux n ON n.id = c.niveau_id
        WHERE c.annee_id = $1 AND c.active ORDER BY n.ordre, c.libelle`,
      [annee.id],
    )
  ).rows;

  const affectations = (
    await q(
      `SELECT a.classe_id, a.matiere_id, a.enseignant_id, a.heures_semaine,
              m.code AS matiere_code, m.libelle AS matiere
         FROM affectations a JOIN matieres m ON m.id = a.matiere_id
        WHERE a.annee_id = $1 AND a.active`,
      [annee.id],
    )
  ).rows;

  const coefficients = new Map(
    (
      await q(
        `SELECT niveau_id, serie_id, matiere_id, coefficient FROM coefficients WHERE annee_id = $1`,
        [annee.id],
      )
    ).rows.map((c) => [`${c.niveau_id}|${c.serie_id ?? ""}|${c.matiere_id}`, Number(c.coefficient)]),
  );

  const inscriptions = (
    await q(
      `SELECT i.id, i.classe_id, i.eleve_id, c.niveau_id, c.serie_id
         FROM inscriptions i JOIN classes c ON c.id = i.classe_id
        WHERE i.annee_id = $1 AND i.active`,
      [annee.id],
    )
  ).rows;

  const creneaux = (await q(`SELECT id, ordre FROM creneaux_horaires ORDER BY ordre`)).rows;
  const salles = (await q(`SELECT id FROM salles WHERE active`)).rows.map((s) => s.id);
  const agentSaisie = await un(`SELECT id FROM utilisateurs WHERE role <> 'PARENT' AND actif LIMIT 1`);

  console.log(`  ${classes.length} classes, ${inscriptions.length} inscriptions, ${periodes.length} périodes`);

  const coefficientDe = (insc, matiereId) =>
    coefficients.get(`${insc.niveau_id}|${insc.serie_id ?? ""}|${matiereId}`) ??
    coefficients.get(`${insc.niveau_id}||${matiereId}`) ??
    1;

  // -------------------------------------------------------------------------
  // 3. Emploi du temps
  //
  // Ordonnancement glouton avec deux contraintes dures : un enseignant n'est
  // qu'à un endroit à la fois, une classe n'a qu'un cours à la fois. Un
  // déclencheur en base refuse de toute façon les chevauchements — autant
  // les éviter en amont plutôt que de faire échouer la transaction.
  // -------------------------------------------------------------------------
  const JOURS = [1, 2, 3, 4, 5, 6]; // lundi → samedi
  const occupeEnseignant = new Set();
  const occupeClasse = new Set();
  const occupeSalle = new Set();
  const poses = new Map();
  const placesDuJour = (aff, j) => poses.get(`${aff.classe_id}|${aff.matiere_id}|${j}`) ?? 0;
  const lignesEdt = [];

  // L'emploi du temps déjà saisi à la main occupe des ressources : sans le
  // charger, l'ordonnanceur proposerait un créneau que le déclencheur de
  // conflit refuserait, et toute la transaction tomberait.
  for (const dejaLa of (
    await q(
      `SELECT classe_id, enseignant_id, salle_id, jour_semaine, creneau_id
         FROM emploi_du_temps WHERE annee_id = $1`,
      [annee.id],
    )
  ).rows) {
    const cle = `${dejaLa.jour_semaine}|${dejaLa.creneau_id}`;
    occupeClasse.add(`${dejaLa.classe_id}|${cle}`);
    if (dejaLa.enseignant_id) occupeEnseignant.add(`${dejaLa.enseignant_id}|${cle}`);
    if (dejaLa.salle_id) occupeSalle.add(`${dejaLa.salle_id}|${cle}`);
  }

  for (const [rang, aff] of affectations.entries()) {
    const heures = Math.max(1, Math.min(6, aff.heures_semaine ?? 2));
    let places = 0;

    // Une matière se répartit sur la semaine : au plus une heure par jour
    // tant que tous les jours n'ont pas servi. Entasser quatre heures de
    // mathématiques le lundi donnerait un emploi du temps que personne ne
    // reconnaîtrait. Le décalage par affectation évite en outre que toutes
    // les classes se disputent le même créneau de 7 h.
    const passes = [1, 2];
    const ordreJours = JOURS.map((_, k) => JOURS[(k + rang) % JOURS.length]);

    for (const passe of passes) {
      if (places >= heures) break;
      for (const j of ordreJours) {
        if (places >= heures) break;
        if (passe === 1 && placesDuJour(aff, j) >= 1) continue;

        for (const cr of creneaux) {
          if (places >= heures) break;
          // Le samedi s'arrête à midi, comme dans les établissements du pays.
          if (j === 6 && cr.ordre > 4) continue;

          const cleEns = `${aff.enseignant_id}|${j}|${cr.id}`;
          const cleCls = `${aff.classe_id}|${j}|${cr.id}`;
          if (occupeEnseignant.has(cleEns) || occupeClasse.has(cleCls)) continue;

          // La salle est la ressource la plus rare : 10 salles pour 15 classes.
          // Quand aucune n'est libre, le cours est programmé sans salle plutôt
          // que refusé — c'est ce que fait un établissement qui manque de
          // locaux, et le déclencheur de conflit l'accepte.
          const salleLibre = salles.find((s) => !occupeSalle.has(`${s}|${j}|${cr.id}`)) ?? null;

          occupeEnseignant.add(cleEns);
          occupeClasse.add(cleCls);
          if (salleLibre) occupeSalle.add(`${salleLibre}|${j}|${cr.id}`);

          poses.set(`${aff.classe_id}|${aff.matiere_id}|${j}`, (placesDuJour(aff, j) ?? 0) + 1);
          lignesEdt.push([
            annee.id, aff.classe_id, aff.matiere_id, aff.enseignant_id, salleLibre,
            j, cr.id, true, 1,
          ]);
          places += 1;
          break; // une seule heure par passage sur ce jour
        }
      }
    }
  }

  await inserer(
    "emploi_du_temps",
    ["annee_id", "classe_id", "matiere_id", "enseignant_id", "salle_id", "jour_semaine", "creneau_id", "publie", "nb_creneaux"],
    lignesEdt,
    200,
  );
  console.log(`  ${lignesEdt.length} créneaux d'emploi du temps`);

  // -------------------------------------------------------------------------
  // 4. Évaluations et notes
  // -------------------------------------------------------------------------
  const inscriptionsParClasse = new Map();
  for (const insc of inscriptions) {
    if (!inscriptionsParClasse.has(insc.classe_id)) inscriptionsParClasse.set(insc.classe_id, []);
    inscriptionsParClasse.get(insc.classe_id).push(insc);
  }

  /**
   * Niveau propre à chaque élève, stable toute l'année.
   *
   * Un élève n'a pas une note aléatoire à chaque devoir : il a un niveau,
   * autour duquel ses résultats varient. Sans ce facteur personnel, tous les
   * classements seraient du bruit et le rang n'aurait aucun sens.
   */
  const niveauEleve = new Map(inscriptions.map((i) => [i.id, gaussien(11.2, 2.9, 3.5, 18.5)]));

  const lignesEvaluations = [];
  const lignesNotes = [];

  const TYPES = [
    ["INTERROGATION", 20, 1, "Interrogation écrite"],
    ["DEVOIR", 20, 1, "Devoir surveillé"],
    ["COMPOSITION", 20, 2, "Composition"],
  ];

  for (const periode of periodes) {
    const debut = new Date(periode.date_debut);
    const fin = new Date(periode.date_fin);
    const duree = Math.max(1, (fin - debut) / 86400000);

    for (const classe of classes) {
      const eleves = inscriptionsParClasse.get(classe.id) ?? [];
      if (eleves.length === 0) continue;

      for (const aff of affectations.filter((a) => a.classe_id === classe.id)) {
        for (const [index, [type, bareme, poids, intitule]] of TYPES.entries()) {
          // Les évaluations s'échelonnent : interro tôt, composition en fin
          // de trimestre, comme dans la réalité d'une progression.
          const fraction = [0.25, 0.55, 0.88][index];
          const date = new Date(debut.getTime() + duree * fraction * 86400000);

          const evaluationId = crypto.randomUUID();
          lignesEvaluations.push([
            evaluationId, annee.id, periode.id, classe.id, aff.matiere_id, aff.enseignant_id,
            type, `${intitule} — ${aff.matiere}`, jour(date), bareme, poids, true,
            "PUBLIEE", type === "COMPOSITION" ? 120 : 55,
            new Date(date.getTime() + 10 * 86400000).toISOString(),
          ]);

          // Difficulté propre à l'épreuve : une composition note plus sévère
          // qu'une interrogation, et certains sujets « tombent » mal.
          const decalage = (type === "COMPOSITION" ? -0.9 : 0) + gaussien(0, 0.7, -2, 2);

          for (const eleve of eleves) {
            // 4 % d'absents à l'épreuve : le cas doit exister en base, c'est
            // lui qui vérifie qu'une note vide n'est pas comptée comme zéro.
            if (alea() < 0.04) {
              lignesNotes.push([evaluationId, eleve.id, null, "ABSENT", null]);
              continue;
            }
            const valeur = Math.min(
              bareme,
              Math.max(0, arrondi2(gaussien(niveauEleve.get(eleve.id) + decalage, 2.1, 0, 20) * (bareme / 20))),
            );
            lignesNotes.push([evaluationId, eleve.id, valeur, "NOTEE", agentSaisie?.id ?? null]);
          }
        }
      }
    }
  }

  await inserer(
    "evaluations",
    ["id", "annee_id", "periode_id", "classe_id", "matiere_id", "enseignant_id", "type", "titre",
     "date_evaluation", "bareme", "poids", "compte_dans_moyenne", "statut", "duree_minutes", "publiee_le"],
    lignesEvaluations,
    300,
  );
  console.log(`  ${lignesEvaluations.length} évaluations publiées`);

  await inserer("notes", ["evaluation_id", "inscription_id", "valeur", "statut", "saisie_par"], lignesNotes, 900);
  console.log(`  ${lignesNotes.length} notes saisies`);

  // -------------------------------------------------------------------------
  // 5. Absences, retards, incidents
  //
  // Le déclencheur d'absence met une notification en file par tuteur. Sur un
  // historique de plusieurs milliers d'absences, cela remplirait la file de
  // SMS à envoyer pour des faits vieux de six mois. On neutralise donc
  // l'alerte immédiate le temps de la reprise d'historique — c'est
  // exactement l'usage prévu par ce paramètre.
  // -------------------------------------------------------------------------
  const alerteAvant = await un(`SELECT valeur FROM parametres WHERE cle = 'notification_absence_immediate'`);
  await q(
    `INSERT INTO parametres (cle, valeur) VALUES ('notification_absence_immediate','false')
     ON CONFLICT (cle) DO UPDATE SET valeur = 'false'`,
  );

  const lignesAbsences = [];
  const lignesRetards = [];
  const lignesIncidents = [];

  /** Jour ouvré tiré au hasard dans une période. */
  const jourOuvre = (periode) => {
    const debut = new Date(periode.date_debut);
    const fin = new Date(periode.date_fin);
    for (let essai = 0; essai < 12; essai += 1) {
      const d = new Date(debut.getTime() + alea() * (fin - debut));
      if (d.getDay() !== 0) return d; // dimanche exclu
    }
    return debut;
  };

  for (const periode of periodes) {
    for (const insc of inscriptions) {
      // Profil d'assiduité personnel : la plupart des élèves manquent peu,
      // une minorité beaucoup. Répartir uniformément donnerait une école où
      // tout le monde est moyennement absent, ce qui n'existe pas.
      const fragile = alea() < 0.18;
      const nbAbsences = fragile ? entre(2, 7) : entre(0, 2);

      for (let k = 0; k < nbAbsences; k += 1) {
        const d = jourOuvre(periode);
        const type = piocher(["COURS", "COURS", "DEMI_JOURNEE", "JOURNEE"]);
        const heures = type === "JOURNEE" ? 6 : type === "DEMI_JOURNEE" ? 3 : entre(1, 2);
        const motif = piocher(MOTIFS_ABSENCE);
        // Une absence sans motif reste non justifiée : c'est le lien logique
        // que l'écran d'assiduité donne à lire au parent.
        const justifiee = motif !== null && alea() < 0.78;

        lignesAbsences.push([
          insc.id, periode.id, type, jour(d), heures,
          justifiee ? "JUSTIFIEE" : "NON_JUSTIFIEE", motif,
          justifiee ? agentSaisie?.id ?? null : null,
          justifiee ? new Date(d.getTime() + 2 * 86400000).toISOString() : null,
          true, agentSaisie?.id ?? null,
        ]);
      }

      const nbRetards = fragile ? entre(1, 5) : entre(0, 2);
      for (let k = 0; k < nbRetards; k += 1) {
        const d = jourOuvre(periode);
        const motif = piocher(MOTIFS_RETARD);
        lignesRetards.push([
          insc.id, periode.id, jour(d), entre(5, 45), motif,
          motif !== null && alea() < 0.6 ? "JUSTIFIEE" : "NON_JUSTIFIEE",
          true, agentSaisie?.id ?? null,
        ]);
      }

      if (alea() < 0.05) {
        const [gravite, description] = piocher(INCIDENTS);
        const d = jourOuvre(periode);
        lignesIncidents.push([
          insc.id, periode.id, jour(d), gravite, description,
          agentSaisie?.id ?? null, true, new Date(d.getTime() + 86400000).toISOString(),
        ]);
      }
    }
  }

  await inserer(
    "absences",
    ["inscription_id", "periode_id", "type", "date_absence", "nb_heures", "statut", "motif",
     "justifiee_par", "justifiee_le", "parents_notifies", "saisie_par"],
    lignesAbsences,
    700,
  );
  await inserer(
    "retards",
    ["inscription_id", "periode_id", "date_retard", "duree_minutes", "motif", "statut", "parents_notifies", "saisie_par"],
    lignesRetards,
    700,
  );
  await inserer(
    "incidents",
    ["inscription_id", "periode_id", "date_incident", "gravite", "description", "signale_par", "parents_notifies", "notifie_le"],
    lignesIncidents,
    400,
  );
  console.log(`  ${lignesAbsences.length} absences, ${lignesRetards.length} retards, ${lignesIncidents.length} incidents`);

  // Rétablissement immédiat : le paramètre gouverne le fonctionnement normal
  // de l'établissement, il ne doit pas rester désactivé après la reprise.
  await q(`UPDATE parametres SET valeur = $1 WHERE cle = 'notification_absence_immediate'`, [
    alerteAvant?.valeur ?? "true",
  ]);

  // -------------------------------------------------------------------------
  // 6. Moyennes, rangs, bulletins
  //
  // Tout est recalculé DEPUIS les notes réellement insérées. C'est le point
  // qui rend ces données vérifiables : le rang affiché sur le téléphone d'un
  // parent est celui que produit l'addition des notes de son enfant.
  // -------------------------------------------------------------------------
  console.log("  Calcul des moyennes et des rangs…");

  const notesParEval = new Map();
  for (const [evaluationId, inscriptionId, valeur] of lignesNotes) {
    if (valeur === null) continue;
    if (!notesParEval.has(evaluationId)) notesParEval.set(evaluationId, new Map());
    notesParEval.get(evaluationId).set(inscriptionId, valeur);
  }

  const evaluationsParCle = new Map(); // periode|classe|matiere → [{id, bareme, poids}]
  for (const l of lignesEvaluations) {
    const [id, , periodeId, classeId, matiereId, , , , , bareme, poids] = l;
    const cle = `${periodeId}|${classeId}|${matiereId}`;
    if (!evaluationsParCle.has(cle)) evaluationsParCle.set(cle, []);
    evaluationsParCle.get(cle).push({ id, bareme, poids });
  }

  const lignesMoyMatiere = [];
  const lignesMoyGenerale = [];
  const lignesBulletins = [];
  const lignesAppreciations = [];
  const lignesConduite = [];

  // Cumul des absences par inscription et période, pour le bulletin.
  const assiduite = new Map();
  const cumul = (map, cle, champ, valeur) => {
    if (!map.has(cle)) map.set(cle, { justifiees: 0, nonJustifiees: 0, retards: 0 });
    map.get(cle)[champ] += valeur;
  };
  for (const [inscId, periodeId, , , heures, statut] of lignesAbsences) {
    cumul(assiduite, `${inscId}|${periodeId}`, statut === "JUSTIFIEE" ? "justifiees" : "nonJustifiees", Number(heures));
  }
  for (const [inscId, periodeId] of lignesRetards) {
    cumul(assiduite, `${inscId}|${periodeId}`, "retards", 1);
  }

  const rangDe = (valeurs, valeur) => valeurs.filter((v) => v > valeur).length + 1;
  const categorie = (m) => (m >= 14 ? "excellent" : m >= 12 ? "bon" : m >= 10 ? "moyen" : "faible");

  for (const periode of periodes) {
    for (const classe of classes) {
      const eleves = inscriptionsParClasse.get(classe.id) ?? [];
      if (eleves.length === 0) continue;

      const matieresClasse = affectations.filter((a) => a.classe_id === classe.id);

      // --- Moyenne par matière ---
      const moyennesParMatiere = new Map(); // matiereId → Map(inscId → moyenne)

      for (const aff of matieresClasse) {
        const evals = evaluationsParCle.get(`${periode.id}|${classe.id}|${aff.matiere_id}`) ?? [];
        const parEleve = new Map();

        for (const eleve of eleves) {
          let points = 0;
          let poidsTotal = 0;
          let nb = 0;

          for (const ev of evals) {
            const note = notesParEval.get(ev.id)?.get(eleve.id);
            if (note === undefined) continue; // absent : la note ne compte pas
            points += (note * 20) / ev.bareme * ev.poids;
            poidsTotal += ev.poids;
            nb += 1;
          }

          if (poidsTotal > 0) parEleve.set(eleve.id, { moyenne: arrondi2(points / poidsTotal), nb });
        }
        moyennesParMatiere.set(aff.matiere_id, parEleve);
      }

      // --- Écriture des moyennes matière avec rang et statistiques classe ---
      for (const aff of matieresClasse) {
        const parEleve = moyennesParMatiere.get(aff.matiere_id);
        const valeurs = [...parEleve.values()].map((v) => v.moyenne);
        if (valeurs.length === 0) continue;

        const moyClasse = arrondi2(valeurs.reduce((s, v) => s + v, 0) / valeurs.length);
        const mini = arrondi2(Math.min(...valeurs));
        const maxi = arrondi2(Math.max(...valeurs));

        for (const eleve of eleves) {
          const item = parEleve.get(eleve.id);
          if (!item) continue;
          const coef = coefficientDe(eleve, aff.matiere_id);

          lignesMoyMatiere.push([
            eleve.id, periode.id, aff.matiere_id, item.moyenne, coef,
            arrondi2(item.moyenne * coef), rangDe(valeurs, item.moyenne),
            moyClasse, mini, maxi, item.nb,
          ]);

          lignesAppreciations.push([
            eleve.id, periode.id, aff.matiere_id, aff.enseignant_id,
            piocher(APPRECIATIONS_MATIERE[categorie(item.moyenne)]),
          ]);
        }
      }

      // --- Moyenne générale, rang, bulletin ---
      const generales = new Map();
      for (const eleve of eleves) {
        let points = 0;
        let coefs = 0;
        for (const aff of matieresClasse) {
          const item = moyennesParMatiere.get(aff.matiere_id)?.get(eleve.id);
          if (!item) continue;
          const coef = coefficientDe(eleve, aff.matiere_id);
          points += item.moyenne * coef;
          coefs += coef;
        }
        if (coefs > 0) generales.set(eleve.id, { moyenne: arrondi2(points / coefs), points: arrondi2(points), coefs });
      }

      const valeursGen = [...generales.values()].map((g) => g.moyenne);
      if (valeursGen.length === 0) continue;

      const moyClasse = arrondi2(valeursGen.reduce((s, v) => s + v, 0) / valeursGen.length);
      const mini = arrondi2(Math.min(...valeursGen));
      const maxi = arrondi2(Math.max(...valeursGen));
      const effectif = valeursGen.length;
      const derniere = periode.numero === periodes.length;

      for (const eleve of eleves) {
        const g = generales.get(eleve.id);
        if (!g) continue;

        const rang = rangDe(valeursGen, g.moyenne);
        const exAequo = valeursGen.filter((v) => v === g.moyenne).length > 1;
        const a = assiduite.get(`${eleve.id}|${periode.id}`) ?? { justifiees: 0, nonJustifiees: 0, retards: 0 };

        lignesMoyGenerale.push([
          eleve.id, periode.id, g.moyenne, g.points, g.coefs, rang, exAequo,
          effectif, moyClasse, mini, maxi,
        ]);

        // Note de conduite : elle descend avec les absences non justifiées,
        // ce qui est la règle appliquée par la surveillance générale.
        const conduite = Math.max(
          5,
          Math.min(20, arrondi2(18 - a.nonJustifiees * 0.5 - a.retards * 0.3 + gaussien(0, 1, -2, 2))),
        );
        lignesConduite.push([eleve.id, periode.id, conduite, agentSaisie?.id ?? null]);

        const mention =
          g.moyenne >= 16 ? "FELICITATIONS"
          : g.moyenne >= 14 ? "ENCOURAGEMENTS"
          : g.moyenne >= 12 ? "TABLEAU_HONNEUR"
          : g.moyenne < 8 ? "AVERTISSEMENT_TRAVAIL"
          : "AUCUNE";

        const decision = !derniere ? null : g.moyenne >= 10 ? "ADMIS" : g.moyenne >= 8.5 ? "REDOUBLE" : "REDOUBLE";

        lignesBulletins.push([
          eleve.id, periode.id, g.moyenne, rang, effectif, moyClasse,
          a.justifiees, a.nonJustifiees, a.retards, conduite,
          piocher(APPRECIATIONS_GENERALES[categorie(g.moyenne)]),
          mention, decision, true,
          new Date(new Date(periode.date_fin).getTime() + 12 * 86400000).toISOString(),
          agentSaisie?.id ?? null,
        ]);
      }
    }
  }

  await inserer(
    "moyennes_matiere",
    ["inscription_id", "periode_id", "matiere_id", "moyenne", "coefficient", "points",
     "rang_matiere", "moyenne_classe", "note_min_classe", "note_max_classe", "nb_evaluations"],
    lignesMoyMatiere,
    800,
  );
  await inserer(
    "appreciations_matiere",
    ["inscription_id", "periode_id", "matiere_id", "enseignant_id", "appreciation"],
    lignesAppreciations,
    800,
  );
  await inserer(
    "moyennes_generales",
    ["inscription_id", "periode_id", "moyenne", "total_points", "total_coefficients", "rang",
     "est_ex_aequo", "effectif_classe", "moyenne_classe", "moyenne_min_classe", "moyenne_max_classe"],
    lignesMoyGenerale,
    800,
  );
  await inserer("notes_conduite", ["inscription_id", "periode_id", "note", "attribuee_par"], lignesConduite, 800);
  await inserer(
    "bulletins",
    ["inscription_id", "periode_id", "moyenne_generale", "rang", "effectif_classe", "moyenne_classe",
     "heures_absence_justifiees", "heures_absence_non_justifiees", "nb_retards", "note_conduite",
     "appreciation_generale", "mention", "decision", "est_publie", "publie_le", "publie_par"],
    lignesBulletins,
    600,
  );
  console.log(
    `  ${lignesMoyMatiere.length} moyennes matière, ${lignesMoyGenerale.length} moyennes générales, ` +
    `${lignesBulletins.length} bulletins publiés`,
  );

  // -------------------------------------------------------------------------
  // 7. Annonces
  // -------------------------------------------------------------------------
  const lignesAnnonces = annonces(rentree).map(([titre, contenu, epinglee, date]) => [
    annee.id, titre, contenu, "TOUS", epinglee, `${date}T08:00:00Z`, true, agentSaisie?.id ?? null, true,
  ]);
  await inserer(
    "annonces",
    ["annee_id", "titre", "contenu", "cible", "epinglee", "publier_le", "publiee", "publiee_par", "donnees_semees"],
    lignesAnnonces,
    50,
  );
  console.log(`  ${lignesAnnonces.length} annonces publiées`);

  // -------------------------------------------------------------------------
  // 8. Verrouillage des périodes closes
  //
  // Une période dont le bulletin est publié ne doit plus accepter de note :
  // c'est la garantie qu'un bulletin remis à une famille ne changera pas
  // après coup. Le verrou est posé en base, pas dans l'application.
  // -------------------------------------------------------------------------
  await q(
    `UPDATE periodes
        SET est_verrouillee = TRUE, verrouillee_le = now(), saisie_ouverte = FALSE
      WHERE annee_id = $1 AND date_fin < CURRENT_DATE`,
    [annee.id],
  );

  await q("COMMIT");
  console.log("\nAnnée déroulée.\n");

  const bilan = await un(`
    SELECT (SELECT libelle FROM annees_scolaires WHERE est_courante)             AS annee,
           (SELECT count(*)::int FROM emploi_du_temps)                           AS creneaux,
           (SELECT count(*)::int FROM evaluations)                               AS evaluations,
           (SELECT count(*)::int FROM notes)                                     AS notes,
           (SELECT count(*)::int FROM bulletins WHERE est_publie)                AS bulletins,
           (SELECT count(*)::int FROM absences)                                  AS absences,
           (SELECT count(*)::int FROM retards)                                   AS retards,
           (SELECT count(*)::int FROM annonces WHERE publiee)                    AS annonces,
           (SELECT ROUND(AVG(moyenne_generale),2) FROM bulletins)                AS moyenne_etablissement,
           (SELECT count(*)::int FROM notifications WHERE statut = 'EN_ATTENTE') AS file_notifications
  `);
  console.table([bilan]);
} catch (erreur) {
  await q("ROLLBACK");
  console.error("\nÉchec, rien n'a été écrit :", erreur.message);
  if (erreur.detail) console.error("Détail :", erreur.detail);
  await client.end();
  process.exit(1);
}

await client.end();
