#!/usr/bin/env node
/**
 * Peuple la base avec un établissement complet et cohérent.
 *
 * Ce n'est pas un jeu de « données bidon » : la structure reproduit celle d'un
 * lycée tchadien réel — noms et prénoms du pays, classes de la 6ème à la
 * Terminale, séries S/L en 1ère et A/D en Terminale, coefficients conformes
 * aux usages, tarifs en francs CFA aux montants pratiqués.
 *
 * Tout ce qui est créé porte la marque `donnees_semees = TRUE` sur l'élève et
 * l'enseignant : `npm run db:purger` retire l'ensemble sans toucher aux
 * données saisies à la main.
 *
 * Usage :
 *   npm run db:peupler          — crée l'établissement complet
 *   npm run db:peupler -- --purge  — retire uniquement les données semées
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
// Référentiel onomastique tchadien
//
// Le Tchad est partagé entre un nord sahélien majoritairement musulman et un
// sud soudanien majoritairement chrétien : les deux répertoires de noms sont
// représentés, comme dans un établissement de N'Djamena.
// ---------------------------------------------------------------------------

const NOMS = [
  "MAHAMAT", "ABDELKERIM", "DJIMET", "NGARTA", "OUSMANE", "HASSAN", "ADOUM",
  "YOUSSOUF", "BRAHIM", "ABAKAR", "TAHIR", "SALEH", "MOUSSA", "ISSA",
  "DJIBRINE", "HAROUN", "ZAKARIA", "IDRISS", "NOUR", "ALHADJ",
  "NDOUBA", "RIMTOBAYE", "NADJITA", "BEASSEMDA", "DENEBEYE", "MBAIRAMADJI",
  "TOGBE", "NGARADOUM", "DJONDANG", "MADJINGAR", "NARAMADJI", "KOSSINGAR",
  "ALLAHOUNDOUM", "BENDOUNGA", "DINGAMNAYAL", "MOUSSAYE",
];

const PRENOMS_M = [
  "Abakar", "Ousmane", "Idriss", "Youssouf", "Adam", "Souleymane", "Djimet",
  "Bichara", "Hissein", "Mahamat", "Ahmat", "Abdoulaye", "Ibrahim", "Moussa",
  "Roumbaye", "Nodjilar", "Ngarlem", "Djasrabé", "Bethel", "Emmanuel",
  "Josué", "Élie", "Nathan", "Béchir", "Tidjani", "Oumar",
];

const PRENOMS_F = [
  "Fatimé", "Achta", "Zara", "Hawa", "Amina", "Mariam", "Kaltouma", "Djénéba",
  "Halimé", "Aché", "Khadidja", "Roukaya", "Zenaba", "Fadila",
  "Grâce", "Esther", "Rachel", "Bénédicte", "Nadège", "Solange",
  "Ruth", "Léa", "Danielle", "Christine", "Alizée", "Prudence",
];

const QUARTIERS = [
  "Chagoua", "Moursal", "Klemat", "Farcha", "Dembé", "Amriguébé", "Walia",
  "Gassi", "Diguel", "Ridina", "Habbena", "Sabangali", "Ardep-Djoumal",
];

const PROFESSIONS = [
  "Commerçant", "Fonctionnaire", "Enseignant", "Infirmier", "Agriculteur",
  "Chauffeur", "Couturière", "Ménagère", "Militaire", "Artisan",
  "Comptable", "Éleveur", "Mécanicien", "Secrétaire",
];

/**
 * Générateur pseudo-aléatoire déterministe.
 *
 * Une graine fixe garantit que deux exécutions produisent le même
 * établissement : indispensable pour reproduire un bogue à l'identique, ce que
 * `Math.random` interdit.
 */
let graine = 20262027;
function alea() {
  graine = (graine * 1103515245 + 12345) & 0x7fffffff;
  return graine / 0x7fffffff;
}
const piocher = (tableau) => tableau[Math.floor(alea() * tableau.length)];
const entre = (min, max) => min + Math.floor(alea() * (max - min + 1));

/** Date de naissance plausible pour un niveau donné. */
function naissancePour(ordreNiveau, anneeRentree) {
  const ageNormal = 10 + ordreNiveau; // 6ème ≈ 11 ans, Terminale ≈ 17 ans
  // Les parcours sont irréguliers au Tchad : redoublements fréquents.
  const age = ageNormal + entre(0, 3);
  const annee = anneeRentree - age;
  return `${annee}-${String(entre(1, 12)).padStart(2, "0")}-${String(entre(1, 28)).padStart(2, "0")}`;
}

let compteurTel = 0;
function telephone() {
  // Préfixes réels au Tchad : 6x = Airtel, 9x = Moov.
  const prefixe = alea() > 0.5 ? 6 : 9;
  compteurTel += 1;
  return `+235${prefixe}${String(1000000 + compteurTel).slice(-7)}`;
}

// ---------------------------------------------------------------------------
// Structure pédagogique
// ---------------------------------------------------------------------------

/** Classes à créer : [code niveau, série, libellé, code, capacité] */
const CLASSES = [
  ["6EME", null, "6ème A", "6A", 55],
  ["6EME", null, "6ème B", "6B", 55],
  ["5EME", null, "5ème A", "5A", 52],
  ["5EME", null, "5ème B", "5B", 52],
  ["4EME", null, "4ème A", "4A", 50],
  ["4EME", null, "4ème B", "4B", 50],
  ["3EME", null, "3ème A", "3A", 48],
  ["3EME", null, "3ème B", "3B", 48],
  ["2NDE", null, "2nde A", "2A", 45],
  ["2NDE", null, "2nde B", "2B", 45],
  ["1ERE", "S", "1ère S", "1S", 40],
  ["1ERE", "L", "1ère L", "1L", 40],
  ["TERMINALE", "D", "Terminale D", "TD", 38],
  ["TERMINALE", "A", "Terminale A", "TA", 38],
];

/**
 * Coefficients par cycle et par série.
 *
 * Conformes aux usages du secondaire tchadien : au collège les coefficients
 * sont resserrés, au lycée la matière dominante de la série pèse lourd — c'est
 * ce qui distingue une Terminale D d'une Terminale A.
 */
const COEFFICIENTS = {
  COLLEGE: { FR: 4, MATH: 4, PC: 2, SVT: 2, HG: 3, ANG: 2, AR: 2, ECM: 1, EPS: 1, INFO: 1 },
  "2NDE": { FR: 4, MATH: 4, PC: 3, SVT: 3, HG: 3, ANG: 2, AR: 1, ECM: 1, EPS: 1, INFO: 1 },
  S: { FR: 2, MATH: 6, PC: 5, SVT: 4, HG: 2, ANG: 2, PHILO: 2, EPS: 1, INFO: 1 },
  L: { FR: 5, MATH: 2, HG: 4, ANG: 3, AR: 3, PHILO: 4, SVT: 1, ECM: 1, EPS: 1 },
  D: { FR: 2, MATH: 4, PC: 4, SVT: 6, HG: 2, ANG: 2, PHILO: 2, EPS: 1 },
  A: { FR: 5, MATH: 2, HG: 4, ANG: 3, AR: 3, PHILO: 5, SVT: 1, EPS: 1 },
};

/** Enseignants : [nom, prénom, sexe, matière principale, statut, heures] */
const ENSEIGNANTS = [
  ["MAHAMAT", "Ousmane", "M", "MATH", "PERMANENT", 20],
  ["NGARTA", "Djimet", "M", "MATH", "PERMANENT", 20],
  ["ABDELKERIM", "Fatimé", "F", "FR", "PERMANENT", 18],
  ["RIMTOBAYE", "Grâce", "F", "FR", "CONTRACTUEL", 18],
  ["YOUSSOUF", "Idriss", "M", "PC", "PERMANENT", 18],
  ["NDOUBA", "Bethel", "M", "SVT", "PERMANENT", 18],
  ["HASSAN", "Amina", "F", "HG", "PERMANENT", 16],
  ["DJIBRINE", "Souleymane", "M", "ANG", "VACATAIRE", 14],
  ["BEASSEMDA", "Esther", "F", "ANG", "CONTRACTUEL", 16],
  ["ADOUM", "Bichara", "M", "AR", "PERMANENT", 14],
  ["MADJINGAR", "Nadège", "F", "PHILO", "PERMANENT", 12],
  ["SALEH", "Ahmat", "M", "EPS", "CONTRACTUEL", 12],
  ["DENEBEYE", "Emmanuel", "M", "INFO", "VACATAIRE", 10],
  ["TAHIR", "Zara", "F", "ECM", "VACATAIRE", 8],
];

const SALLES = [
  ["S01", "Salle 01", "CLASSE", 55, "Bâtiment A"],
  ["S02", "Salle 02", "CLASSE", 55, "Bâtiment A"],
  ["S03", "Salle 03", "CLASSE", 52, "Bâtiment A"],
  ["S04", "Salle 04", "CLASSE", 52, "Bâtiment B"],
  ["S05", "Salle 05", "CLASSE", 50, "Bâtiment B"],
  ["S06", "Salle 06", "CLASSE", 48, "Bâtiment B"],
  ["S07", "Salle 07", "CLASSE", 45, "Bâtiment C"],
  ["S08", "Salle 08", "CLASSE", 40, "Bâtiment C"],
  ["LAB", "Laboratoire", "LABORATOIRE", 35, "Bâtiment C"],
  ["INFO", "Salle informatique", "INFORMATIQUE", 30, "Bâtiment C"],
];

/** Tarifs par cycle, en FCFA — montants pratiqués dans le privé à N'Djamena. */
const TARIFS = {
  COLLEGE: [
    ["INSCRIPTION", "Droits d'inscription", 15000, true, false],
    ["SCOLARITE", "Scolarité annuelle", 150000, true, true],
    ["APE", "Cotisation APE", 5000, true, true],
  ],
  LYCEE: [
    ["INSCRIPTION", "Droits d'inscription", 20000, true, false],
    ["SCOLARITE", "Scolarité annuelle", 200000, true, true],
    ["APE", "Cotisation APE", 5000, true, true],
    ["EXAMEN", "Frais d'examen", 10000, true, true],
  ],
};

// ---------------------------------------------------------------------------

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000 });
await client.connect();

const q = (sql, params) => client.query(sql, params);
const un = async (sql, params) => (await q(sql, params)).rows[0];

async function purger() {
  console.log("Purge des données semées…");
  await q("BEGIN");
  try {
    // L'ordre suit les dépendances ; les cascades font le reste.
    await q(`DELETE FROM notifications WHERE eleve_id IN (SELECT id FROM eleves WHERE donnees_semees)`);
    await q(`DELETE FROM eleves WHERE donnees_semees`);
    await q(`DELETE FROM enseignants WHERE donnees_semees`);
    await q(`DELETE FROM tuteurs WHERE donnees_semees`);
    await q(`DELETE FROM utilisateurs WHERE role = 'PARENT' AND donnees_semees`);
    await q(`DELETE FROM salles WHERE donnees_semees`);
    await q(`DELETE FROM classes WHERE donnees_semees`);
    await q(`DELETE FROM annonces WHERE donnees_semees`);
    await q("COMMIT");
    console.log("Données semées retirées. Les saisies manuelles sont intactes.");
  } catch (e) {
    await q("ROLLBACK");
    throw e;
  }
}

if (PURGE) {
  await purger();
  await client.end();
  process.exit(0);
}

// ===========================================================================
// Peuplement
// ===========================================================================

console.log("Peuplement du Lycée Guergné La Renaissance…\n");
await q("BEGIN");

try {
  const annee = await un(`SELECT id, libelle, date_debut FROM annees_scolaires WHERE est_courante`);
  if (!annee) throw new Error("Aucune année scolaire courante. Créez-la d'abord dans Paramètres.");

  const anneeRentree = Number(String(annee.libelle).slice(0, 4));
  const periodes = (await q(`SELECT id, numero FROM periodes WHERE annee_id = $1 ORDER BY numero`, [annee.id])).rows;
  const niveaux = Object.fromEntries(
    (await q(`SELECT id, code, ordre, cycle FROM niveaux`)).rows.map((n) => [n.code, n]),
  );
  const series = Object.fromEntries((await q(`SELECT id, code FROM series`)).rows.map((s) => [s.code, s.id]));
  const matieres = Object.fromEntries((await q(`SELECT id, code FROM matieres`)).rows.map((m) => [m.code, m.id]));

  // --- Salles ---------------------------------------------------------------
  const salles = {};
  for (const [code, libelle, type, capacite, batiment] of SALLES) {
    const s = await un(
      `INSERT INTO salles (code,libelle,type,capacite,batiment,donnees_semees)
       VALUES ($1,$2,$3::type_salle,$4,$5,TRUE)
       ON CONFLICT (code) DO UPDATE SET libelle = EXCLUDED.libelle RETURNING id`,
      [code, libelle, type, capacite, batiment],
    );
    salles[code] = s.id;
  }
  console.log(`  ${SALLES.length} salles`);

  // --- Coefficients ---------------------------------------------------------
  let nbCoefficients = 0;
  const grillePour = (codeNiveau, codeSerie) => {
    if (niveaux[codeNiveau].cycle === "COLLEGE") return COEFFICIENTS.COLLEGE;
    if (codeNiveau === "2NDE") return COEFFICIENTS["2NDE"];
    return COEFFICIENTS[codeSerie] ?? COEFFICIENTS["2NDE"];
  };

  for (const [codeNiveau, codeSerie] of CLASSES) {
    const grille = grillePour(codeNiveau, codeSerie);
    for (const [codeMatiere, coefficient] of Object.entries(grille)) {
      if (!matieres[codeMatiere]) continue;
      await q(
        `INSERT INTO coefficients (annee_id,matiere_id,niveau_id,serie_id,coefficient,volume_horaire,poids_composition)
         VALUES ($1,$2,$3,$4,$5,$6,2)
         ON CONFLICT DO NOTHING`,
        [annee.id, matieres[codeMatiere], niveaux[codeNiveau].id, codeSerie ? series[codeSerie] : null,
         coefficient, Math.max(1, Math.round(coefficient * 0.8))],
      );
      nbCoefficients += 1;
    }
  }
  console.log(`  ${nbCoefficients} coefficients`);

  // --- Enseignants ----------------------------------------------------------
  const enseignants = [];
  for (const [i, [nom, prenom, sexe, matiere, statut, heures]] of ENSEIGNANTS.entries()) {
    const e = await un(
      `INSERT INTO enseignants (matricule,nom,prenom,sexe,telephone,email,statut,specialite,diplome,
                                date_embauche,heures_contractuelles,quartier,donnees_semees)
       VALUES ($1,$2,$3,$4::sexe_type,$5,$6,$7::statut_enseignant,$8,$9,$10,$11,$12,TRUE)
       ON CONFLICT (matricule) DO UPDATE SET nom = EXCLUDED.nom RETURNING id`,
      [
        `ENS-${String(i + 1).padStart(3, "0")}`, nom, prenom, sexe, telephone(),
        `${prenom.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}.${nom.toLowerCase()}@lgr.td`,
        statut, matiere, alea() > 0.4 ? "Licence" : "Maîtrise",
        `${anneeRentree - entre(1, 12)}-10-01`, heures, piocher(QUARTIERS),
      ],
    );
    enseignants.push({ id: e.id, matiere });

    if (matieres[matiere]) {
      await q(
        `INSERT INTO enseignant_matieres (enseignant_id,matiere_id,est_principale)
         VALUES ($1,$2,TRUE) ON CONFLICT DO NOTHING`,
        [e.id, matieres[matiere]],
      );
    }
  }
  console.log(`  ${enseignants.length} enseignants`);

  // --- Classes --------------------------------------------------------------
  const classes = [];
  for (const [i, [codeNiveau, codeSerie, libelle, code, capacite]] of CLASSES.entries()) {
    const professeurPrincipal = enseignants[i % enseignants.length].id;
    const c = await un(
      `INSERT INTO classes (annee_id,niveau_id,serie_id,libelle,code,capacite_max,salle_id,
                            professeur_principal_id,donnees_semees)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)
       ON CONFLICT (annee_id,code) DO UPDATE SET libelle = EXCLUDED.libelle RETURNING id`,
      [annee.id, niveaux[codeNiveau].id, codeSerie ? series[codeSerie] : null, libelle, code,
       capacite, salles[SALLES[i % SALLES.length][0]], professeurPrincipal],
    );
    classes.push({ id: c.id, code, libelle, codeNiveau, codeSerie, niveauId: niveaux[codeNiveau].id,
                   ordre: niveaux[codeNiveau].ordre, cycle: niveaux[codeNiveau].cycle });
  }
  console.log(`  ${classes.length} classes`);

  // --- Affectations enseignant × classe × matière ----------------------------
  let nbAffectations = 0;
  for (const classe of classes) {
    const grille = grillePour(classe.codeNiveau, classe.codeSerie);
    for (const codeMatiere of Object.keys(grille)) {
      if (!matieres[codeMatiere]) continue;
      const candidats = enseignants.filter((e) => e.matiere === codeMatiere);
      if (candidats.length === 0) continue;
      const choisi = candidats[nbAffectations % candidats.length];

      await q(
        `INSERT INTO affectations (annee_id,enseignant_id,classe_id,matiere_id,heures_semaine)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (annee_id,classe_id,matiere_id) DO NOTHING`,
        [annee.id, choisi.id, classe.id, matieres[codeMatiere], Math.max(1, Math.round(grille[codeMatiere] * 0.8))],
      );
      nbAffectations += 1;
    }
  }
  console.log(`  ${nbAffectations} affectations`);

  // --- Grille tarifaire et tranches -----------------------------------------
  for (const classe of classes) {
    const tarifs = TARIFS[classe.cycle === "COLLEGE" ? "COLLEGE" : "LYCEE"];
    for (const [nature, libelle, montant, obligatoire, anciens] of tarifs) {
      await q(
        `INSERT INTO grilles_tarifaires (annee_id,niveau_id,nature,libelle,montant_fcfa,obligatoire,
                                         applicable_nouveaux,applicable_anciens)
         VALUES ($1,$2,$3::nature_frais,$4,$5,$6,TRUE,$7) ON CONFLICT DO NOTHING`,
        [annee.id, classe.niveauId, nature, libelle, montant, obligatoire, anciens],
      );
    }
  }

  const debut = new Date(annee.date_debut);
  const TRANCHES = [
    [1, "1ère tranche", 40, new Date(debut.getFullYear(), 10, 30)],
    [2, "2ème tranche", 30, new Date(debut.getFullYear() + 1, 0, 31)],
    [3, "3ème tranche", 30, new Date(debut.getFullYear() + 1, 3, 30)],
  ];
  for (const [numero, libelle, pourcentage, dateLimite] of TRANCHES) {
    await q(
      `INSERT INTO tranches (annee_id,numero,libelle,pourcentage,date_limite)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (annee_id,numero) DO NOTHING`,
      [annee.id, numero, libelle, pourcentage, dateLimite.toISOString().slice(0, 10)],
    );
  }
  console.log(`  grille tarifaire et 3 tranches`);

  // --- Élèves, tuteurs, inscriptions ----------------------------------------
  const inscriptions = [];
  let numeroEleve = 0;
  const anneeCivile = new Date().getFullYear();

  for (const classe of classes) {
    // Effectif réaliste : entre 70 % et 95 % de la capacité.
    const effectif = Math.round(
      CLASSES.find((c) => c[3] === classe.code)[4] * (0.7 + alea() * 0.25),
    );

    for (let i = 0; i < effectif; i += 1) {
      numeroEleve += 1;
      const sexe = alea() > 0.47 ? "M" : "F";
      const nom = piocher(NOMS);
      const prenom = piocher(sexe === "M" ? PRENOMS_M : PRENOMS_F);
      const quartier = piocher(QUARTIERS);

      const matricule = `LGR-${anneeCivile}-${String(1000 + numeroEleve)}`;
      const eleve = await un(
        `INSERT INTO eleves (matricule,nom,prenom,sexe,date_naissance,lieu_naissance,nationalite,
                             quartier,adresse,statut,date_premiere_inscription,groupe_sanguin,donnees_semees)
         VALUES ($1,$2,$3,$4::sexe_type,$5,$6,'Tchadienne',$7,$8,'INSCRIT',$9,$10,TRUE) RETURNING id`,
        [matricule, nom, prenom, sexe, naissancePour(classe.ordre, anneeRentree),
         alea() > 0.25 ? "N'Djamena" : piocher(["Moundou", "Sarh", "Abéché", "Doba", "Bongor"]),
         quartier, `${quartier}, N'Djamena`, `${anneeRentree - entre(0, 4)}-10-01`,
         piocher(["O+", "A+", "B+", "AB+", "O-", "A-"])],
      );

      // Tuteur principal : le père dans la majorité des cas, la mère sinon.
      const tuteurNom = nom; // la fratrie partage le nom de famille
      const estPere = alea() > 0.3;
      const tuteur = await un(
        `INSERT INTO tuteurs (nom,prenom,sexe,telephone,profession,quartier,adresse,accepte_sms,donnees_semees)
         VALUES ($1,$2,$3::sexe_type,$4,$5,$6,$7,TRUE,TRUE) RETURNING id`,
        [tuteurNom, piocher(estPere ? PRENOMS_M : PRENOMS_F), estPere ? "M" : "F",
         telephone(), piocher(PROFESSIONS), quartier, `${quartier}, N'Djamena`],
      );

      await q(
        `INSERT INTO eleve_tuteur (eleve_id,tuteur_id,lien,est_principal,est_tuteur_legal,
                                   est_responsable_financier,est_contact_urgence)
         VALUES ($1,$2,$3::lien_parente,TRUE,TRUE,TRUE,TRUE)`,
        [eleve.id, tuteur.id, estPere ? "PERE" : "MERE"],
      );

      // Un second tuteur dans un cas sur trois.
      if (alea() > 0.66) {
        const second = await un(
          `INSERT INTO tuteurs (nom,prenom,sexe,telephone,profession,quartier,accepte_sms,donnees_semees)
           VALUES ($1,$2,$3::sexe_type,$4,$5,$6,TRUE,TRUE) RETURNING id`,
          [tuteurNom, piocher(estPere ? PRENOMS_F : PRENOMS_M), estPere ? "F" : "M",
           telephone(), piocher(PROFESSIONS), quartier],
        );
        await q(
          `INSERT INTO eleve_tuteur (eleve_id,tuteur_id,lien,autorise_retrait)
           VALUES ($1,$2,$3::lien_parente,TRUE)`,
          [eleve.id, second.id, estPere ? "MERE" : "PERE"],
        );
      }

      const redoublant = alea() > 0.85;
      const inscription = await un(
        `INSERT INTO inscriptions (eleve_id,annee_id,classe_id,type,numero_inscription,
                                   est_redoublant,est_boursier,statut_dossier,date_inscription)
         VALUES ($1,$2,$3,$4::type_inscription,$5,$6,$7,$8::statut_dossier,$9) RETURNING id`,
        [eleve.id, annee.id, classe.id,
         classe.ordre === 1 ? "INSCRIPTION" : "REINSCRIPTION",
         `INS-${anneeCivile}-${String(1000 + numeroEleve)}`,
         redoublant, alea() > 0.94,
         alea() > 0.12 ? "VALIDE" : "A_VALIDER",
         `${anneeRentree}-09-${String(entre(1, 28)).padStart(2, "0")}`],
      );

      inscriptions.push({ id: inscription.id, eleveId: eleve.id, classe });
    }
  }
  console.log(`  ${inscriptions.length} élèves inscrits, avec leurs tuteurs`);

  // --- Échéanciers et paiements ---------------------------------------------
  let nbEcheances = 0;
  let nbPaiements = 0;

  for (const inscription of inscriptions) {
    const tarifs = TARIFS[inscription.classe.cycle === "COLLEGE" ? "COLLEGE" : "LYCEE"];
    const total = tarifs.reduce((s, t) => s + t[2], 0);

    let cumul = 0;
    for (const [index, [numero, libelle, pourcentage, dateLimite]] of TRANCHES.entries()) {
      const dernier = index === TRANCHES.length - 1;
      const montant = dernier ? total - cumul : Math.round((total * pourcentage) / 100);
      cumul += montant;

      const echeance = await un(
        `INSERT INTO echeances (inscription_id,nature,libelle,montant_du_fcfa,date_limite)
         VALUES ($1,'SCOLARITE',$2,$3,$4) RETURNING id`,
        [inscription.id, libelle, montant, dateLimite.toISOString().slice(0, 10)],
      );
      nbEcheances += 1;

      // Recouvrement réaliste : la 1ère tranche est largement payée, la
      // dernière beaucoup moins. C'est le profil réel d'un établissement.
      const tauxPaiement = [0.88, 0.62, 0.3][index];
      if (alea() < tauxPaiement) {
        // Un paiement sur six est partiel.
        const partiel = alea() > 0.84;
        const verse = partiel ? Math.round(montant * (0.3 + alea() * 0.4) / 500) * 500 : montant;
        const numeroRecu = (await un(`SELECT prochain_numero('RECU', $1::smallint) AS n`, [anneeCivile])).n;

        await q(
          `INSERT INTO paiements (inscription_id,echeance_id,numero_recu,montant_fcfa,mode,date_paiement,nom_payeur)
           VALUES ($1,$2,$3,$4,$5::mode_paiement,$6,$7)`,
          [inscription.id, echeance.id, numeroRecu, verse,
           piocher(["ESPECES", "ESPECES", "MOBILE_MONEY", "MOBILE_MONEY", "VIREMENT"]),
           new Date(dateLimite.getTime() - entre(0, 25) * 86400000).toISOString().slice(0, 10),
           "Tuteur"],
        );
        nbPaiements += 1;
      }
    }
  }
  await q(`SELECT rafraichir_echeances_en_retard()`);
  console.log(`  ${nbEcheances} échéances, ${nbPaiements} paiements encaissés`);

  console.log("\nValidation…");
  await q("COMMIT");
  console.log("Établissement peuplé.\n");

  const bilan = await un(`
    SELECT (SELECT count(*)::int FROM eleves WHERE donnees_semees)        AS eleves,
           (SELECT count(*)::int FROM enseignants WHERE donnees_semees)   AS enseignants,
           (SELECT count(*)::int FROM classes WHERE donnees_semees)       AS classes,
           (SELECT count(*)::int FROM tuteurs WHERE donnees_semees)       AS tuteurs,
           (SELECT count(*)::int FROM echeances)                          AS echeances,
           (SELECT count(*)::int FROM paiements)                          AS paiements,
           (SELECT COALESCE(SUM(montant_paye_fcfa),0)::bigint FROM echeances) AS encaisse
  `);
  console.table([bilan]);
} catch (erreur) {
  await q("ROLLBACK");
  console.error("\nÉchec, rien n'a été écrit :", erreur.message);
  await client.end();
  process.exit(1);
}

await client.end();
