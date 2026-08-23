import "server-only";

import ExcelJS from "exceljs";

/**
 * Production de classeurs Excel, pour toutes les listes du portail.
 *
 * POURQUOI UN MODULE PLUTÔT QU'UN EXPORT PAR PAGE
 * ------------------------------------------------
 * Chaque liste — élèves, parents, personnel, paiements — aura son export. Écrit
 * page par page, cela donnerait quatre mises en forme différentes, dont trois
 * oublieraient un détail : les largeurs de colonne, le figeage de l'en-tête, ou
 * pire, le format des nombres.
 *
 * LE PIÈGE DES MATRICULES
 * ------------------------
 * Excel interprète tout ce qui ressemble à un nombre. Un matricule
 * « 0016 » devient 16, un numéro de téléphone « 66112233 » devient un entier
 * qu'il affichera en notation scientifique s'il est assez long, et une date
 * « 05/07 » devient le 5 juillet de l'année courante. Ces colonnes sont donc
 * forcées en TEXTE — c'est la principale raison d'être de ce module.
 */

export type TypeColonne = "texte" | "nombre" | "decimal" | "date" | "monnaie" | "booleen";

export interface Colonne<T> {
  entete: string;
  /** Largeur en caractères. Faute de mieux, calculée depuis l'en-tête. */
  largeur?: number;
  type?: TypeColonne;
  valeur: (ligne: T) => string | number | boolean | null | undefined;
}

export interface OptionsClasseur {
  /** Nom de l'onglet. Excel refuse plus de 31 caractères et les `:\/?*[]`. */
  feuille: string;
  titre?: string;
  /** Affiché sous le titre : filtres appliqués, date d'édition, effectif. */
  contexte?: string[];
}

const BLEU = "FF1E429F";

/** Excel refuse certains caractères dans un nom d'onglet, et le tronque à 31. */
function nomFeuilleValide(brut: string): string {
  return brut.replace(/[:\\/?*[\]]/g, "-").slice(0, 31) || "Export";
}

function formatDe(type: TypeColonne | undefined): string | undefined {
  switch (type) {
    case "texte":
      // « @ » force le texte : c'est lui qui sauve les matricules à zéro
      // initial et les numéros de téléphone.
      return "@";
    case "nombre":
      return "0";
    case "decimal":
      return "0.00";
    case "monnaie":
      // Séparateur de milliers, sans décimale : le franc CFA n'en a pas.
      return "# ##0 \"F\"";
    case "date":
      return "dd/mm/yyyy";
    default:
      return undefined;
  }
}

/**
 * Construit un classeur à partir d'une liste et de ses colonnes.
 *
 * Les valeurs `null` deviennent des cellules VIDES, jamais « null » ni « — » :
 * un tableur sert à trier et à filtrer, et un tiret est une valeur qui remonte
 * dans les tris et fausse les totaux.
 */
export async function construireClasseur<T>(
  lignes: T[],
  colonnes: Colonne<T>[],
  options: OptionsClasseur,
): Promise<ArrayBuffer> {
  const classeur = new ExcelJS.Workbook();
  classeur.creator = "Lycée Guergné La Renaissance";
  classeur.created = new Date();

  const feuille = classeur.addWorksheet(nomFeuilleValide(options.feuille));

  // --- Bandeau : titre et contexte ------------------------------------------
  let ligneEntete = 1;

  if (options.titre) {
    feuille.mergeCells(1, 1, 1, colonnes.length);
    const c = feuille.getCell(1, 1);
    c.value = options.titre;
    c.font = { bold: true, size: 14, color: { argb: BLEU } };
    ligneEntete = 2;
  }

  for (const [i, texte] of (options.contexte ?? []).entries()) {
    const rang = (options.titre ? 2 : 1) + i;
    feuille.mergeCells(rang, 1, rang, colonnes.length);
    const c = feuille.getCell(rang, 1);
    c.value = texte;
    c.font = { size: 9, color: { argb: "FF64748B" } };
    ligneEntete = rang + 1;
  }

  if (ligneEntete > 1) ligneEntete += 1; // une ligne vide de respiration

  // --- En-tête des colonnes -------------------------------------------------
  const entete = feuille.getRow(ligneEntete);
  colonnes.forEach((col, i) => {
    const c = entete.getCell(i + 1);
    c.value = col.entete;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLEU } };
    c.alignment = { vertical: "middle", wrapText: true };
  });
  entete.height = 22;

  // --- Données --------------------------------------------------------------
  lignes.forEach((ligne, index) => {
    const rang = feuille.getRow(ligneEntete + 1 + index);
    colonnes.forEach((col, i) => {
      const brut = col.valeur(ligne);
      const cellule = rang.getCell(i + 1);

      if (brut === null || brut === undefined || brut === "") {
        cellule.value = null;
      } else if (col.type === "booleen") {
        cellule.value = brut ? "Oui" : "Non";
      } else if (col.type === "date" && typeof brut === "string") {
        const d = new Date(brut);
        cellule.value = Number.isNaN(d.getTime()) ? brut : d;
      } else {
        cellule.value = brut as string | number;
      }

      const format = formatDe(col.type);
      if (format) cellule.numFmt = format;
    });
  });

  // --- Confort de lecture ---------------------------------------------------
  colonnes.forEach((col, i) => {
    feuille.getColumn(i + 1).width = col.largeur ?? Math.max(12, col.entete.length + 4);
  });

  // L'en-tête reste visible au défilement, et le filtre automatique est posé :
  // sans lui, la première chose que fait l'utilisateur est de le poser
  // lui-même, souvent sur la mauvaise plage.
  feuille.views = [{ state: "frozen", ySplit: ligneEntete }];
  feuille.autoFilter = {
    from: { row: ligneEntete, column: 1 },
    to: { row: ligneEntete + lignes.length, column: colonnes.length },
  };

  return (await classeur.xlsx.writeBuffer()) as ArrayBuffer;
}

/**
 * Nom de fichier lisible et sans surprise.
 *
 * Accents et espaces retirés : ils survivent mal au passage par un en-tête
 * HTTP, et pire, à une clé USB formatée en FAT.
 */
export function nomFichier(base: string, extension = "xlsx"): string {
  const propre = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  const jour = new Date().toISOString().slice(0, 10);
  return `${propre}-${jour}.${extension}`;
}

/** En-têtes d'une réponse portant un classeur en pièce jointe. */
export function enTetesClasseur(nom: string): HeadersInit {
  return {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${nom}"`,
    "Cache-Control": "no-store",
  };
}
