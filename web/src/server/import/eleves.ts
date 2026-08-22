import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/server/db";

import {
  cleColonne,
  normaliserBooleen,
  normaliserDate,
  normaliserSexe,
  type Feuille,
} from "./feuille";

/**
 * Import d'élèves depuis un tableur.
 *
 * PRINCIPE : ON N'ÉCRIT RIEN AVANT D'AVOIR TOUT LU
 * -------------------------------------------------
 * L'analyse est complète et sans effet de bord. L'écriture ne vient qu'ensuite,
 * et seulement si l'utilisateur confirme. Trois raisons :
 *
 *   1. Un fichier de rentrée fait cinq cents lignes. S'arrêter à la première
 *      erreur obligerait le secrétariat à cinq cents allers-retours.
 *   2. Un import à moitié écrit est pire que pas d'import : on ne sait plus qui
 *      est entré et qui reste à saisir.
 *   3. Le rapport se lit AVANT d'engager quoi que ce soit — c'est là qu'on
 *      s'aperçoit que la colonne « classe » contient des libellés inconnus.
 */

export interface ErreurLigne {
  ligne: number;
  colonne: string | null;
  message: string;
}

export interface EleveImporte {
  ligne: number;
  nom: string;
  prenom: string;
  sexe: "M" | "F";
  dateNaissance: string;
  lieuNaissance: string | null;
  nationalite: string;
  acteNaissanceNumero: string | null;
  adresse: string | null;
  quartier: string | null;
  classeId: string;
  classeLibelle: string;
  estRedoublant: boolean;
  estBoursier: boolean;
  ecoleOrigine: string | null;
  /** Tuteur principal — obligatoire : un élève sans adulte joignable est ingérable. */
  tuteurNom: string;
  tuteurPrenom: string;
  tuteurTelephone: string;
  tuteurLien: string;
}

export interface RapportAnalyse {
  colonnesReconnues: string[];
  colonnesIgnorees: string[];
  colonnesManquantes: string[];
  valides: EleveImporte[];
  erreurs: ErreurLigne[];
  /** Doublons À L'INTÉRIEUR du fichier, avant même de regarder la base. */
  doublonsFichier: ErreurLigne[];
  /** Élèves déjà présents en base, reconnus sur nom + prénom + date de naissance. */
  dejaInscrits: ErreurLigne[];
}

/**
 * Colonnes attendues.
 *
 * Les alias existent parce qu'aucun secrétariat n'écrira deux fois le même
 * intitulé. Exiger une orthographe exacte reviendrait à faire échouer l'import
 * sur un « Prénom » écrit « prenom ».
 */
const COLONNES: Record<string, { alias: string[]; requis: boolean; libelle: string }> = {
  nom: { alias: ["nom", "nom_de_famille", "nom_eleve"], requis: true, libelle: "Nom" },
  prenom: { alias: ["prenom", "prenoms", "prenom_eleve"], requis: true, libelle: "Prénom" },
  sexe: { alias: ["sexe", "genre"], requis: true, libelle: "Sexe" },
  date_naissance: {
    alias: ["date_naissance", "date_de_naissance", "ne_le", "naissance"],
    requis: true,
    libelle: "Date de naissance",
  },
  lieu_naissance: { alias: ["lieu_naissance", "lieu_de_naissance"], requis: false, libelle: "Lieu de naissance" },
  nationalite: { alias: ["nationalite"], requis: false, libelle: "Nationalité" },
  acte_naissance: {
    alias: ["acte_naissance", "numero_acte", "n_acte_de_naissance", "acte"],
    requis: false,
    libelle: "N° d'acte de naissance",
  },
  adresse: { alias: ["adresse"], requis: false, libelle: "Adresse" },
  quartier: { alias: ["quartier"], requis: false, libelle: "Quartier" },
  classe: { alias: ["classe", "classe_affectee", "niveau_classe"], requis: true, libelle: "Classe" },
  redoublant: { alias: ["redoublant", "est_redoublant"], requis: false, libelle: "Redoublant" },
  boursier: { alias: ["boursier", "est_boursier"], requis: false, libelle: "Boursier" },
  ecole_origine: { alias: ["ecole_origine", "etablissement_origine"], requis: false, libelle: "École d'origine" },
  tuteur_nom: { alias: ["tuteur_nom", "nom_tuteur", "nom_du_tuteur", "nom_parent"], requis: true, libelle: "Nom du tuteur" },
  tuteur_prenom: {
    alias: ["tuteur_prenom", "prenom_tuteur", "prenom_du_tuteur", "prenom_parent"],
    requis: true,
    libelle: "Prénom du tuteur",
  },
  tuteur_telephone: {
    alias: ["tuteur_telephone", "telephone_tuteur", "telephone", "tel_tuteur", "contact"],
    requis: true,
    libelle: "Téléphone du tuteur",
  },
  tuteur_lien: { alias: ["tuteur_lien", "lien", "lien_parente", "qualite"], requis: false, libelle: "Lien de parenté" },
};

const LIENS = ["PERE", "MERE", "TUTEUR", "ONCLE", "TANTE", "GRAND_PARENT", "FRERE_SOEUR", "AUTRE"];

/** Ordre des colonnes dans le gabarit téléchargeable. */
export const ORDRE_GABARIT = Object.keys(COLONNES);

export function libelleColonne(cle: string): string {
  return COLONNES[cle]?.libelle ?? cle;
}

/**
 * Fait correspondre les colonnes du fichier aux champs attendus.
 *
 * Retourne aussi ce qui n'a PAS été reconnu : une colonne ignorée en silence
 * est un piège — le secrétariat croit avoir importé les bourses alors que sa
 * colonne s'appelait « boursiere » et n'a jamais été lue.
 */
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
 * Analyse un fichier sans rien écrire.
 *
 * `classes` vient de l'appelant plutôt que d'une requête interne : l'année
 * scolaire visée est une décision, pas une déduction.
 */
export async function analyserEleves(
  feuille: Feuille,
  classes: Array<{ id: string; libelle: string }>,
): Promise<RapportAnalyse> {
  const { correspondance, colonnesIgnorees, colonnesManquantes } = apparier(feuille);

  const rapport: RapportAnalyse = {
    colonnesReconnues: Object.keys(correspondance).map(libelleColonne),
    colonnesIgnorees,
    colonnesManquantes,
    valides: [],
    erreurs: [],
    doublonsFichier: [],
    dejaInscrits: [],
  };

  if (colonnesManquantes.length > 0) return rapport;

  // Correspondance libellé de classe → identifiant, insensible à la casse et
  // aux espaces : « 6ème A », « 6EME A » et « 6eme  A » désignent la même.
  const parLibelle = new Map(classes.map((c) => [cleColonne(c.libelle), c]));

  const vus = new Map<string, number>();
  const lire = (l: Record<string, string>, champ: string) =>
    (l[correspondance[champ]!] ?? "").trim();

  for (const { ligne, valeurs } of feuille.lignes) {
    const erreurs: ErreurLigne[] = [];
    const ajouter = (colonne: string | null, message: string) =>
      erreurs.push({ ligne, colonne, message });

    const nom = lire(valeurs, "nom").toUpperCase();
    const prenom = lire(valeurs, "prenom");
    if (nom.length < 2) ajouter("Nom", "Nom absent ou trop court.");
    if (prenom.length < 2) ajouter("Prénom", "Prénom absent ou trop court.");

    const sexe = normaliserSexe(lire(valeurs, "sexe"));
    if (!sexe) ajouter("Sexe", `Sexe illisible : « ${lire(valeurs, "sexe")} ». Attendu M ou F.`);

    const brutDate = lire(valeurs, "date_naissance");
    const dateNaissance = normaliserDate(brutDate);
    if (!dateNaissance) {
      ajouter("Date de naissance", `Date illisible : « ${brutDate} ». Attendu JJ/MM/AAAA.`);
    } else {
      const age = (Date.now() - new Date(dateNaissance).getTime()) / (365.25 * 24 * 3600 * 1000);
      if (age < 8 || age > 30) {
        ajouter("Date de naissance", `Âge de ${Math.floor(age)} ans, hors des bornes du secondaire (8 à 30).`);
      }
    }

    const brutClasse = lire(valeurs, "classe");
    const classe = parLibelle.get(cleColonne(brutClasse));
    if (!classe) {
      ajouter("Classe", `Classe inconnue : « ${brutClasse} ». Classes ouvertes : ${classes.map((c) => c.libelle).join(", ")}.`);
    }

    const tuteurNom = lire(valeurs, "tuteur_nom").toUpperCase();
    const tuteurPrenom = lire(valeurs, "tuteur_prenom");
    const tuteurTelephone = lire(valeurs, "tuteur_telephone");
    if (tuteurNom.length < 2) ajouter("Nom du tuteur", "Nom du tuteur absent.");
    if (tuteurPrenom.length < 2) ajouter("Prénom du tuteur", "Prénom du tuteur absent.");
    if (!/^\+?[0-9\s.\-]{8,20}$/.test(tuteurTelephone)) {
      ajouter("Téléphone du tuteur", `Numéro invalide : « ${tuteurTelephone} ».`);
    }

    const lienBrut = lire(valeurs, "tuteur_lien").toUpperCase().replace(/[^A-Z_]/g, "_");
    const tuteurLien = LIENS.includes(lienBrut) ? lienBrut : "TUTEUR";

    if (erreurs.length > 0) {
      rapport.erreurs.push(...erreurs);
      continue;
    }

    // Doublon interne au fichier : deux fois le même élève sur deux lignes.
    // Fréquent quand deux classes ont été copiées l'une sous l'autre.
    const empreinte = `${nom}|${prenom}|${dateNaissance}`;
    const dejaVu = vus.get(empreinte);
    if (dejaVu) {
      rapport.doublonsFichier.push({
        ligne,
        colonne: null,
        message: `Déjà présent ligne ${dejaVu} — même nom, prénom et date de naissance.`,
      });
      continue;
    }
    vus.set(empreinte, ligne);

    rapport.valides.push({
      ligne,
      nom,
      prenom,
      sexe: sexe!,
      dateNaissance: dateNaissance!,
      lieuNaissance: lire(valeurs, "lieu_naissance") || null,
      nationalite: lire(valeurs, "nationalite") || "Tchadienne",
      acteNaissanceNumero: lire(valeurs, "acte_naissance") || null,
      adresse: lire(valeurs, "adresse") || null,
      quartier: lire(valeurs, "quartier") || null,
      classeId: classe!.id,
      classeLibelle: classe!.libelle,
      estRedoublant: normaliserBooleen(lire(valeurs, "redoublant")),
      estBoursier: normaliserBooleen(lire(valeurs, "boursier")),
      ecoleOrigine: lire(valeurs, "ecole_origine") || null,
      tuteurNom,
      tuteurPrenom,
      tuteurTelephone,
      tuteurLien,
    });
  }

  // Élèves déjà en base. Une seule requête pour tout le fichier : cinq cents
  // requêtes unitaires mettraient l'import à genoux sur une base distante.
  if (rapport.valides.length > 0) {
    // Les trois colonnes voyagent comme PARAMÈTRES, jamais concaténées dans le
    // texte de la requête : ces valeurs viennent d'un fichier téléversé, donc
    // d'une source qu'on ne contrôle pas. Un nom contenant une apostrophe et
    // une clause SQL suffirait autrement.
    const existants = await db.execute<{ nom: string; prenom: string; date_naissance: string }>(sql`
      SELECT e.nom, e.prenom, e.date_naissance::text AS date_naissance
        FROM eleves e
        JOIN unnest(
               ${rapport.valides.map((v) => v.nom)}::text[],
               ${rapport.valides.map((v) => v.prenom)}::text[],
               ${rapport.valides.map((v) => v.dateNaissance)}::date[]
             ) AS f(nom, prenom, date_naissance)
          ON f.nom = e.nom AND f.prenom = e.prenom AND f.date_naissance = e.date_naissance
    `);

    const connus = new Set(
      existants.rows.map((r) => `${r.nom}|${r.prenom}|${String(r.date_naissance).slice(0, 10)}`),
    );

    const restants: EleveImporte[] = [];
    for (const v of rapport.valides) {
      if (connus.has(`${v.nom}|${v.prenom}|${v.dateNaissance}`)) {
        rapport.dejaInscrits.push({
          ligne: v.ligne,
          colonne: null,
          message: `${v.prenom} ${v.nom} est déjà dans la base — ligne ignorée.`,
        });
      } else {
        restants.push(v);
      }
    }
    rapport.valides = restants;
  }

  return rapport;
}
