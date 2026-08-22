import "server-only";

import ExcelJS from "exceljs";

import { cleColonne, lireCsv, type Feuille, type LigneFeuille } from "@/lib/tableur";

export type { Feuille, LigneFeuille } from "@/lib/tableur";
export {
  cleColonne,
  normaliserBooleen,
  normaliserDate,
  normaliserSexe,
} from "@/lib/tableur";

/**
 * Lecture d'un fichier tableur, quelle qu'en soit la provenance.
 *
 * POURQUOI CE MODULE EST PLUS LONG QU'IL N'Y PARAÎT
 * --------------------------------------------------
 * Un secrétariat n'envoie pas « un CSV ». Il envoie ce que son Excel a bien
 * voulu produire, et sur un poste francophone cela veut dire :
 *
 *   - un séparateur **point-virgule**, parce que la virgule est le séparateur
 *     décimal en français ;
 *   - un encodage **Windows-1252**, pas UTF-8 — d'où les « MARIÉ » qui
 *     deviennent « MARIÃ‰ » ;
 *   - parfois un **BOM** UTF-8 en tête, qui colle un caractère invisible au
 *     premier nom de colonne et fait échouer la reconnaissance de l'en-tête ;
 *   - des dates tantôt texte, tantôt nombre de jours depuis 1900.
 *
 * Chacun de ces cas produit, si on l'ignore, un import qui « marche » et des
 * données fausses. On les traite donc tous, plutôt que d'exiger du secrétariat
 * une manipulation qu'il ne fera pas.
 */

/**
 * Convertit une cellule ExcelJS en texte.
 *
 * Une cellule peut porter une formule, un lien, un texte enrichi ou une date.
 * Prendre `.value` tel quel donnerait « [object Object] » dans le fichier
 * importé, et personne ne s'en apercevrait avant de lire une fiche élève.
 */
function texteCellule(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return "";
  if (valeur instanceof Date) return valeur.toISOString().slice(0, 10);
  if (typeof valeur === "object") {
    const o = valeur as Record<string, unknown>;
    if ("text" in o) return String(o.text);
    if ("result" in o) return texteCellule(o.result);
    if ("richText" in o && Array.isArray(o.richText)) {
      return o.richText.map((m: { text?: string }) => m.text ?? "").join("");
    }
    if ("hyperlink" in o) return String(o.text ?? o.hyperlink);
  }
  return String(valeur).trim();
}

async function lireXlsx(donnees: Buffer): Promise<Feuille> {
  const classeur = new ExcelJS.Workbook();
  await classeur.xlsx.load(donnees as unknown as ArrayBuffer);

  const feuille = classeur.worksheets[0];
  if (!feuille) return { colonnes: [], lignes: [] };

  const colonnes: string[] = [];
  const sortie: LigneFeuille[] = [];

  feuille.eachRow({ includeEmpty: false }, (ligne, numero) => {
    const cellules: string[] = [];
    // `values` est décalé d'un cran : l'index 0 n'est jamais utilisé par
    // ExcelJS, les colonnes commencent à 1.
    for (let i = 1; i <= feuille.columnCount; i += 1) {
      cellules.push(texteCellule(ligne.getCell(i).value));
    }

    if (numero === 1) {
      colonnes.push(...cellules.map(cleColonne));
      return;
    }

    // Une ligne entièrement vide au milieu d'un fichier n'est pas une erreur :
    // c'est une ligne de séparation, fréquente dans les fichiers faits à la
    // main. On la saute sans rien signaler.
    if (cellules.every((c) => c === "")) return;

    const valeurs: Record<string, string> = {};
    colonnes.forEach((c, j) => {
      if (c) valeurs[c] = cellules[j] ?? "";
    });
    sortie.push({ ligne: numero, valeurs });
  });

  return { colonnes: colonnes.filter(Boolean), lignes: sortie };
}

/** Lit un fichier téléversé, `.xlsx` ou `.csv`. */
export async function lireFeuille(fichier: File): Promise<Feuille> {
  const donnees = Buffer.from(await fichier.arrayBuffer());
  const nom = fichier.name.toLowerCase();

  if (nom.endsWith(".xlsx") || nom.endsWith(".xlsm")) return lireXlsx(donnees);
  if (nom.endsWith(".csv") || nom.endsWith(".txt")) return lireCsv(donnees);

  // `.xls` (format binaire d'avant 2007) n'est PAS lisible par ExcelJS. Le
  // dire franchement vaut mieux qu'un échec de lecture incompréhensible.
  if (nom.endsWith(".xls")) {
    throw new Error(
      "Le format .xls (Excel 97-2003) n'est pas pris en charge. " +
        "Ouvrez le fichier dans Excel puis « Enregistrer sous » au format .xlsx.",
    );
  }

  throw new Error("Format non reconnu. Utilisez un fichier .xlsx ou .csv.");
}
