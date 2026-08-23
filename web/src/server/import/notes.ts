import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/server/db";

import { cleColonne, type Feuille } from "./feuille";
import type { ErreurLigne } from "./eleves";

/**
 * Import des notes d'une évaluation.
 *
 * L'IMPORT EST TOUJOURS RATTACHÉ À UNE ÉVALUATION
 * ------------------------------------------------
 * Une note n'existe pas seule : elle appartient à un devoir précis, dans une
 * matière, une classe et une période. Un fichier ne porte donc que deux
 * colonnes utiles — le matricule et la note — et tout le contexte vient de
 * l'évaluation choisie à l'écran.
 *
 * C'est aussi ce qui rend l'import sûr : impossible d'écrire une note dans la
 * mauvaise matière, puisque la matière n'est pas dans le fichier.
 *
 * LE MATRICULE, PAS LE NOM
 * -------------------------
 * Deux élèves peuvent s'appeler Mahamat Ahmat dans la même classe. Le
 * rapprochement se fait sur le matricule, qui est unique — le nom n'est affiché
 * que pour permettre au professeur de vérifier qu'il a le bon élève.
 */

export interface NoteImportee {
  ligne: number;
  inscriptionId: string;
  matricule: string;
  eleve: string;
  valeur: number | null;
  statut: "NOTEE" | "ABSENT" | "ABSENT_ZERO" | "DISPENSE" | "NON_RENDU";
  appreciation: string | null;
  /** Note déjà saisie pour cet élève, s'il y en a une. */
  ancienneValeur: number | null;
}

export interface RapportNotes {
  evaluation: {
    id: string;
    titre: string;
    matiere: string;
    classe: string;
    bareme: number;
    verrouillee: boolean;
  };
  colonnesManquantes: string[];
  colonnesIgnorees: string[];
  valides: NoteImportee[];
  erreurs: ErreurLigne[];
  doublonsFichier: ErreurLigne[];
  /** Élèves de la classe absents du fichier : leur note ne sera pas touchée. */
  nonFournis: Array<{ matricule: string; eleve: string }>;
}

const COLONNES: Record<string, { alias: string[]; requis: boolean; libelle: string }> = {
  matricule: {
    alias: ["matricule", "matricule_eleve", "n_matricule", "code"],
    requis: true,
    libelle: "Matricule",
  },
  note: {
    alias: ["note", "notes", "valeur", "resultat", "points"],
    requis: true,
    libelle: "Note",
  },
  statut: {
    alias: ["statut", "situation", "observation", "etat"],
    requis: false,
    libelle: "Statut",
  },
  appreciation: {
    alias: ["appreciation", "appreciations", "commentaire", "remarque"],
    requis: false,
    libelle: "Appréciation",
  },
};

export const ORDRE_GABARIT_NOTES = Object.keys(COLONNES);

export function libelleColonneNote(cle: string): string {
  return COLONNES[cle]?.libelle ?? cle;
}

/**
 * Statuts reconnus, et leurs écritures courantes.
 *
 * Un professeur écrit « abs », « absent », « ABS J » ou « dispensé ». Exiger
 * l'énumération exacte ferait échouer la moitié des lignes, et le professeur
 * corrigerait à la main — c'est-à-dire qu'il n'utiliserait plus l'import.
 */
const STATUTS: Record<string, NoteImportee["statut"]> = {
  notee: "NOTEE",
  note: "NOTEE",
  present: "NOTEE",
  absent: "ABSENT",
  abs: "ABSENT",
  absent_justifie: "ABSENT",
  abs_j: "ABSENT",
  justifie: "ABSENT",
  absent_zero: "ABSENT_ZERO",
  abs_nj: "ABSENT_ZERO",
  absent_non_justifie: "ABSENT_ZERO",
  zero: "ABSENT_ZERO",
  dispense: "DISPENSE",
  disp: "DISPENSE",
  exempte: "DISPENSE",
  non_rendu: "NON_RENDU",
  nr: "NON_RENDU",
  non_remis: "NON_RENDU",
  rien: "NON_RENDU",
};

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

export async function analyserNotes(
  feuille: Feuille,
  evaluationId: string,
): Promise<RapportNotes | null> {
  const contexte = await db.execute<{
    id: string;
    titre: string;
    matiere: string;
    classe: string;
    classe_id: string;
    bareme: string;
    verrouillee: boolean;
  }>(sql`
    SELECT ev.id, ev.titre, m.libelle AS matiere, c.libelle AS classe,
           ev.classe_id, ev.bareme::text, ev.est_verrouillee AS verrouillee
      FROM evaluations ev
      JOIN matieres m ON m.id = ev.matiere_id
      JOIN classes c  ON c.id = ev.classe_id
     WHERE ev.id = ${evaluationId}::uuid
  `);

  const ev = contexte.rows[0];
  if (!ev) return null;

  const { correspondance, colonnesIgnorees, colonnesManquantes } = apparier(feuille);

  const rapport: RapportNotes = {
    evaluation: {
      id: ev.id,
      titre: ev.titre,
      matiere: ev.matiere,
      classe: ev.classe,
      bareme: Number(ev.bareme),
      verrouillee: ev.verrouillee,
    },
    colonnesManquantes,
    colonnesIgnorees,
    valides: [],
    erreurs: [],
    doublonsFichier: [],
    nonFournis: [],
  };

  if (colonnesManquantes.length > 0) return rapport;

  // Les élèves de la classe, et leur note actuelle s'il y en a une.
  const inscrits = await db.execute<{
    inscription_id: string;
    matricule: string;
    eleve: string;
    valeur: string | null;
  }>(sql`
    SELECT i.id AS inscription_id, e.matricule,
           e.prenom || ' ' || e.nom AS eleve,
           n.valeur::text AS valeur
      FROM inscriptions i
      JOIN eleves e ON e.id = i.eleve_id
      LEFT JOIN notes n ON n.inscription_id = i.id AND n.evaluation_id = ${evaluationId}::uuid
     WHERE i.classe_id = ${ev.classe_id}::uuid AND i.active
  `);

  const parMatricule = new Map(inscrits.rows.map((r) => [r.matricule.toUpperCase(), r]));
  const vus = new Map<string, number>();
  const fournis = new Set<string>();

  const lire = (l: Record<string, string>, champ: string) =>
    correspondance[champ] ? (l[correspondance[champ]] ?? "").trim() : "";

  for (const { ligne, valeurs } of feuille.lignes) {
    const matricule = lire(valeurs, "matricule").toUpperCase();
    if (!matricule) {
      rapport.erreurs.push({ ligne, colonne: "Matricule", message: "Matricule absent." });
      continue;
    }

    const eleve = parMatricule.get(matricule);
    if (!eleve) {
      rapport.erreurs.push({
        ligne,
        colonne: "Matricule",
        message: `Aucun élève « ${matricule} » inscrit en ${ev.classe}.`,
      });
      continue;
    }

    const dejaVu = vus.get(matricule);
    if (dejaVu) {
      rapport.doublonsFichier.push({
        ligne,
        colonne: "Matricule",
        message: `${eleve.eleve} apparaît déjà ligne ${dejaVu}.`,
      });
      continue;
    }
    vus.set(matricule, ligne);
    fournis.add(matricule);

    // Le statut prime sur la note : « absent » avec une note écrite à côté
    // reste une absence, et la note est ignorée.
    const brutStatut = cleColonne(lire(valeurs, "statut"));
    const statut = brutStatut ? STATUTS[brutStatut] : undefined;

    if (brutStatut && !statut) {
      rapport.erreurs.push({
        ligne,
        colonne: "Statut",
        message: `Statut inconnu : « ${lire(valeurs, "statut")} ». Attendu : présent, absent, absent non justifié, dispensé ou non rendu.`,
      });
      continue;
    }

    const brutNote = lire(valeurs, "note").replace(",", ".");
    let valeur: number | null = null;

    if (statut && statut !== "NOTEE") {
      // Absence, dispense, travail non rendu : aucune note attendue.
      valeur = null;
    } else if (brutNote === "") {
      rapport.erreurs.push({
        ligne,
        colonne: "Note",
        message: "Note absente. Indiquez une note, ou un statut (absent, dispensé…).",
      });
      continue;
    } else {
      const n = Number(brutNote);
      if (Number.isNaN(n)) {
        rapport.erreurs.push({
          ligne,
          colonne: "Note",
          message: `Note illisible : « ${lire(valeurs, "note")} ».`,
        });
        continue;
      }
      if (n < 0 || n > Number(ev.bareme)) {
        rapport.erreurs.push({
          ligne,
          colonne: "Note",
          message: `${n} est hors du barème de l'évaluation (0 à ${ev.bareme}).`,
        });
        continue;
      }
      valeur = n;
    }

    rapport.valides.push({
      ligne,
      inscriptionId: eleve.inscription_id,
      matricule,
      eleve: eleve.eleve,
      valeur,
      statut: statut ?? "NOTEE",
      appreciation: lire(valeurs, "appreciation") || null,
      ancienneValeur: eleve.valeur === null ? null : Number(eleve.valeur),
    });
  }

  // Ce qui n'est PAS dans le fichier compte autant que ce qui y est : un
  // professeur qui importe trente notes sur cinquante élèves doit le voir, et
  // savoir que les vingt autres gardent leur note actuelle.
  rapport.nonFournis = inscrits.rows
    .filter((r) => !fournis.has(r.matricule.toUpperCase()))
    .map((r) => ({ matricule: r.matricule, eleve: r.eleve }));

  return rapport;
}
