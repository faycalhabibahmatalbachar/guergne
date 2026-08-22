import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/server/db";

import { cleColonne, normaliserDate, normaliserSexe, type Feuille } from "./feuille";
import type { ErreurLigne } from "./eleves";

/**
 * Import d'enseignants depuis un tableur.
 *
 * Même principe que pour les élèves — on lit tout avant d'écrire quoi que ce
 * soit — mais trois différences de fond :
 *
 *   1. **Le matricule est fourni**, pas généré. Un enseignant en a déjà un,
 *      attribué par l'établissement ou par la fonction publique, et il figure
 *      sur sa fiche de paie. En inventer un créerait un second identifiant pour
 *      la même personne.
 *
 *   2. **Les matières enseignées** sont une colonne à part, séparée par des
 *      virgules ou des points-virgules. Un professeur de sciences enseigne
 *      couramment SVT et Physique.
 *
 *   3. **Le volume est petit** — quinze à cinquante personnes, contre cinq
 *      cents élèves. Les contrôles peuvent donc être plus stricts sans rendre
 *      le fichier impossible à préparer.
 */

export interface EnseignantImporte {
  ligne: number;
  matricule: string;
  nom: string;
  prenom: string;
  sexe: "M" | "F" | null;
  dateNaissance: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  quartier: string | null;
  diplome: string | null;
  specialite: string | null;
  statut: string;
  dateEmbauche: string | null;
  numeroCnps: string | null;
  heuresContractuelles: number | null;
  /** Identifiants des matières reconnues, pour `enseignant_matieres`. */
  matiereIds: string[];
  matieresLibelles: string[];
}

export interface RapportEnseignants {
  colonnesReconnues: string[];
  colonnesIgnorees: string[];
  colonnesManquantes: string[];
  valides: EnseignantImporte[];
  erreurs: ErreurLigne[];
  doublonsFichier: ErreurLigne[];
  dejaPresents: ErreurLigne[];
}

const STATUTS = [
  "PERMANENT",
  "CONTRACTUEL",
  "VACATAIRE",
  "STAGIAIRE",
  "SUSPENDU",
  "RETRAITE",
  "DEMISSIONNAIRE",
];

const COLONNES: Record<string, { alias: string[]; requis: boolean; libelle: string }> = {
  matricule: { alias: ["matricule", "matricule_enseignant", "numero_matricule"], requis: true, libelle: "Matricule" },
  nom: { alias: ["nom", "nom_de_famille", "nom_enseignant"], requis: true, libelle: "Nom" },
  prenom: { alias: ["prenom", "prenoms", "prenom_enseignant"], requis: true, libelle: "Prénom" },
  sexe: { alias: ["sexe", "genre"], requis: false, libelle: "Sexe" },
  date_naissance: { alias: ["date_naissance", "date_de_naissance", "ne_le"], requis: false, libelle: "Date de naissance" },
  telephone: { alias: ["telephone", "tel", "contact", "numero"], requis: false, libelle: "Téléphone" },
  email: { alias: ["email", "adresse_electronique", "courriel", "mail"], requis: false, libelle: "Adresse électronique" },
  adresse: { alias: ["adresse"], requis: false, libelle: "Adresse" },
  quartier: { alias: ["quartier"], requis: false, libelle: "Quartier" },
  diplome: { alias: ["diplome", "diplomes", "niveau_etude"], requis: false, libelle: "Diplôme" },
  specialite: { alias: ["specialite", "specialisation"], requis: false, libelle: "Spécialité" },
  statut: { alias: ["statut", "situation", "type_contrat", "contrat"], requis: true, libelle: "Statut" },
  date_embauche: { alias: ["date_embauche", "date_de_recrutement", "embauche_le"], requis: false, libelle: "Date d'embauche" },
  cnps: { alias: ["cnps", "numero_cnps", "n_cnps"], requis: false, libelle: "Numéro CNPS" },
  heures: { alias: ["heures", "heures_contractuelles", "volume_horaire", "quota_horaire"], requis: false, libelle: "Heures hebdomadaires" },
  matieres: { alias: ["matieres", "matiere", "matieres_enseignees", "discipline", "disciplines"], requis: false, libelle: "Matières enseignées" },
};

export const ORDRE_GABARIT_ENSEIGNANTS = Object.keys(COLONNES);

export function libelleColonneEnseignant(cle: string): string {
  return COLONNES[cle]?.libelle ?? cle;
}

export function statutsEnseignant(): string[] {
  return [...STATUTS];
}

function apparier(feuille: Feuille) {
  const correspondance: Record<string, string> = {};
  const utilisees = new Set<string>();

  for (const [champ, def] of Object.entries(COLONNES)) {
    const trouvee = feuille.colonnes.find((c) => def.alias.includes(c));
    if (trouvee) {
      correspondance[champ] = trouvee;
      utilisees.add(trouvee);
    }
  }

  return {
    correspondance,
    colonnesIgnorees: feuille.colonnes.filter((c) => c && !utilisees.has(c)),
    colonnesManquantes: Object.entries(COLONNES)
      .filter(([champ, def]) => def.requis && !correspondance[champ])
      .map(([, def]) => def.libelle),
  };
}

/**
 * Analyse un fichier d'enseignants sans rien écrire.
 *
 * `matieres` est fourni par l'appelant : la liste des matières est un
 * paramétrage de l'établissement, et l'import ne doit pas en créer à la volée.
 * Une matière mal orthographiée deviendrait sinon une seconde matière, avec ses
 * propres coefficients et sa propre colonne de bulletin.
 */
export async function analyserEnseignants(
  feuille: Feuille,
  matieres: Array<{ id: string; libelle: string; code: string }>,
): Promise<RapportEnseignants> {
  const { correspondance, colonnesIgnorees, colonnesManquantes } = apparier(feuille);

  const rapport: RapportEnseignants = {
    colonnesReconnues: Object.keys(correspondance).map(libelleColonneEnseignant),
    colonnesIgnorees,
    colonnesManquantes,
    valides: [],
    erreurs: [],
    doublonsFichier: [],
    dejaPresents: [],
  };

  if (colonnesManquantes.length > 0) return rapport;

  // Une matière se reconnaît par son libellé OU par son code : les fichiers
  // d'établissement écrivent souvent « MATH » là où la base dit
  // « Mathématiques ».
  const parNom = new Map<string, { id: string; libelle: string }>();
  for (const m of matieres) {
    parNom.set(cleColonne(m.libelle), m);
    parNom.set(cleColonne(m.code), m);
  }

  const vus = new Map<string, number>();
  const lire = (l: Record<string, string>, champ: string) =>
    correspondance[champ] ? (l[correspondance[champ]] ?? "").trim() : "";

  for (const { ligne, valeurs } of feuille.lignes) {
    const erreurs: ErreurLigne[] = [];
    const ajouter = (colonne: string | null, message: string) =>
      erreurs.push({ ligne, colonne, message });

    const matricule = lire(valeurs, "matricule").toUpperCase();
    const nom = lire(valeurs, "nom").toUpperCase();
    const prenom = lire(valeurs, "prenom");

    if (matricule.length < 2) ajouter("Matricule", "Matricule absent.");
    if (nom.length < 2) ajouter("Nom", "Nom absent ou trop court.");
    if (prenom.length < 2) ajouter("Prénom", "Prénom absent ou trop court.");

    const statutBrut = lire(valeurs, "statut").toUpperCase().replace(/[^A-Z]/g, "");
    const statut = STATUTS.find((s) => s.replace(/[^A-Z]/g, "") === statutBrut);
    if (!statut) {
      ajouter("Statut", `Statut inconnu : « ${lire(valeurs, "statut")} ». Attendu : ${STATUTS.join(", ")}.`);
    }

    const telephone = lire(valeurs, "telephone");
    if (telephone && !/^\+?[0-9\s.\-]{8,20}$/.test(telephone)) {
      ajouter("Téléphone", `Numéro invalide : « ${telephone} ».`);
    }

    const email = lire(valeurs, "email");
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      ajouter("Adresse électronique", `Adresse invalide : « ${email} ».`);
    }

    const heuresBrut = lire(valeurs, "heures").replace(",", ".");
    let heures: number | null = null;
    if (heuresBrut) {
      const n = Number(heuresBrut);
      if (Number.isNaN(n) || n < 0 || n > 40) {
        ajouter("Heures hebdomadaires", `Volume horaire invalide : « ${heuresBrut} ». Attendu entre 0 et 40.`);
      } else {
        heures = n;
      }
    }

    // Les matières inconnues ne bloquent PAS l'import de l'enseignant : mieux
    // vaut un professeur enregistré sans ses matières qu'un professeur absent
    // du système. On le signale, et le rattachement se fera à la main.
    const matiereIds: string[] = [];
    const matieresLibelles: string[] = [];
    const brutMatieres = lire(valeurs, "matieres");
    if (brutMatieres) {
      for (const morceau of brutMatieres.split(/[,;/]/)) {
        const cle = cleColonne(morceau);
        if (!cle) continue;
        const trouvee = parNom.get(cle);
        if (trouvee) {
          if (!matiereIds.includes(trouvee.id)) {
            matiereIds.push(trouvee.id);
            matieresLibelles.push(trouvee.libelle);
          }
        } else {
          rapport.erreurs.push({
            ligne,
            colonne: "Matières enseignées",
            message: `Matière inconnue, ignorée : « ${morceau.trim() }». À rattacher à la main.`,
          });
        }
      }
    }

    if (erreurs.length > 0) {
      rapport.erreurs.push(...erreurs);
      continue;
    }

    const dejaVu = vus.get(matricule);
    if (dejaVu) {
      rapport.doublonsFichier.push({
        ligne,
        colonne: "Matricule",
        message: `Matricule ${matricule} déjà présent ligne ${dejaVu}.`,
      });
      continue;
    }
    vus.set(matricule, ligne);

    rapport.valides.push({
      ligne,
      matricule,
      nom,
      prenom,
      sexe: normaliserSexe(lire(valeurs, "sexe")),
      dateNaissance: normaliserDate(lire(valeurs, "date_naissance")),
      telephone: telephone || null,
      email: email || null,
      adresse: lire(valeurs, "adresse") || null,
      quartier: lire(valeurs, "quartier") || null,
      diplome: lire(valeurs, "diplome") || null,
      specialite: lire(valeurs, "specialite") || null,
      statut: statut!,
      dateEmbauche: normaliserDate(lire(valeurs, "date_embauche")),
      numeroCnps: lire(valeurs, "cnps") || null,
      heuresContractuelles: heures,
      matiereIds,
      matieresLibelles,
    });
  }

  // Le matricule porte une contrainte d'unicité : un doublon ferait échouer
  // l'insertion. Autant le dire avant plutôt que de laisser la base le refuser
  // ligne par ligne.
  if (rapport.valides.length > 0) {
    const existants = await db.execute<{ matricule: string }>(sql`
      SELECT matricule FROM enseignants
       WHERE matricule = ANY(${rapport.valides.map((v) => v.matricule)}::text[])
    `);

    const connus = new Set(existants.rows.map((r) => r.matricule));
    const restants: EnseignantImporte[] = [];

    for (const v of rapport.valides) {
      if (connus.has(v.matricule)) {
        rapport.dejaPresents.push({
          ligne: v.ligne,
          colonne: "Matricule",
          message: `${v.prenom} ${v.nom} — le matricule ${v.matricule} existe déjà, ligne ignorée.`,
        });
      } else {
        restants.push(v);
      }
    }
    rapport.valides = restants;
  }

  return rapport;
}
