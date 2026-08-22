/**
 * Lecture de tableurs : la partie qui ne dépend de rien.
 *
 * Découpage CSV, encodages, normalisation des dates et des libellés. Aucune
 * dépendance à Next, à ExcelJS ni au système de fichiers — ce module est donc
 * couvert par la suite de tests du projet, ce qu'un module `server-only` ne
 * peut pas être.
 *
 * C'est voulu : ces fonctions portent les règles qui décident si l'import d'un
 * fichier de rentrée est juste ou faux. Elles doivent être éprouvées, pas
 * supposées.
 */

export interface LigneFeuille {
  /** Numéro de ligne DANS LE FICHIER, en-tête comprise. C'est ce que voit l'utilisateur. */
  ligne: number;
  valeurs: Record<string, string>;
}

export interface Feuille {
  colonnes: string[];
  lignes: LigneFeuille[];
}

/**
 * Normalise un nom de colonne pour la comparaison.
 *
 * « Date de naissance », « DATE DE NAISSANCE » et « date_de_naissance »
 * désignent la même chose. On compare sur une forme réduite plutôt que
 * d'imposer une orthographe exacte que personne ne respectera.
 */
export function cleColonne(brut: string): string {
  return brut
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Découpe une ligne CSV en respectant les guillemets.
 *
 * Une adresse tchadienne contient très souvent une virgule — « Quartier
 * Chagoua, rue 12 ». Un découpage naïf décalerait alors toutes les colonnes
 * suivantes, et l'élève se retrouverait avec sa rue pour date de naissance.
 */
export function decouperCsv(ligne: string, separateur: string): string[] {
  const champs: string[] = [];
  let courant = "";
  let dansGuillemets = false;

  for (let i = 0; i < ligne.length; i += 1) {
    const c = ligne[i];

    if (c === '"') {
      // Deux guillemets consécutifs à l'intérieur d'un champ = un guillemet
      // littéral, convention universelle du CSV.
      if (dansGuillemets && ligne[i + 1] === '"') {
        courant += '"';
        i += 1;
      } else {
        dansGuillemets = !dansGuillemets;
      }
    } else if (c === separateur && !dansGuillemets) {
      champs.push(courant.trim());
      courant = "";
    } else {
      courant += c;
    }
  }

  champs.push(courant.trim());
  return champs;
}

/**
 * Devine le séparateur d'un CSV.
 *
 * On compte les candidats sur la ligne d'en-tête plutôt que de supposer : un
 * fichier produit par un Excel français utilise le point-virgule, un fichier
 * exporté d'un outil anglophone la virgule, et une tabulation apparaît dès
 * qu'on a copié-collé depuis un tableau.
 */
export function devinerSeparateur(entete: string): string {
  const candidats = [";", ",", "\t"];
  let meilleur = ";";
  let maximum = -1;

  for (const c of candidats) {
    const n = decouperCsv(entete, c).length;
    if (n > maximum) {
      maximum = n;
      meilleur = c;
    }
  }
  return meilleur;
}

/**
 * Décode un fichier texte en tenant compte de l'encodage réel.
 *
 * Excel enregistre en Windows-1252 sur un poste francophone. Décoder en UTF-8
 * produit alors des caractères de remplacement (U+FFFD) sur chaque accent. On
 * détecte cet échec et on reprend en 1252 — plutôt que de livrer des noms
 * d'élèves illisibles.
 */
export function decoder(donnees: Buffer): string {
  const utf8 = new TextDecoder("utf-8").decode(donnees);
  if (!utf8.includes("�")) {
    // BOM : un caractère invisible collé au premier nom de colonne suffit à
    // faire échouer la reconnaissance de l'en-tête.
    return utf8.replace(/^﻿/, "");
  }
  return new TextDecoder("windows-1252").decode(donnees).replace(/^﻿/, "");
}

export function lireCsv(donnees: Buffer): Feuille {
  const texte = decoder(donnees);
  const lignes = texte.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lignes.length === 0) return { colonnes: [], lignes: [] };

  const separateur = devinerSeparateur(lignes[0]!);
  const colonnes = decouperCsv(lignes[0]!, separateur).map(cleColonne);

  const sortie: LigneFeuille[] = [];
  for (let i = 1; i < lignes.length; i += 1) {
    const champs = decouperCsv(lignes[i]!, separateur);
    const valeurs: Record<string, string> = {};
    colonnes.forEach((c, j) => {
      if (c) valeurs[c] = (champs[j] ?? "").trim();
    });
    // `i + 1` : l'utilisateur compte à partir de 1, en-tête incluse.
    sortie.push({ ligne: i + 1, valeurs });
  }

  return { colonnes, lignes: sortie };
}

// ---------------------------------------------------------------------------
// Normalisations partagées
// ---------------------------------------------------------------------------

/**
 * Interprète une date écrite par un humain ou par Excel.
 *
 * Trois écritures cohabitent dans un même fichier :
 *   - « 12/03/2010 » — le format tapé au clavier au Tchad, jour d'abord ;
 *   - « 2010-03-12 » — ce que produit un export ;
 *   - « 40249 » — le nombre de jours depuis 1900 qu'Excel stocke réellement,
 *     et qui ressort tel quel quand la cellule a été mise au format Texte.
 *
 * Le troisième cas est le plus traître : c'est un nombre parfaitement valide,
 * qu'aucune validation de type ne rejettera.
 */
export function normaliserDate(brut: string): string | null {
  const valeur = brut.trim();
  if (!valeur) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(valeur)) return valeur.slice(0, 10);

  const jourMois = valeur.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (jourMois) {
    const [, j, m, a] = jourMois;
    return `${a}-${m!.padStart(2, "0")}-${j!.padStart(2, "0")}`;
  }

  if (/^\d{5}$/.test(valeur)) {
    // Excel compte les jours depuis le 30/12/1899 — décalage volontaire, il
    // reproduit un bogue de Lotus 1-2-3 qui croyait 1900 bissextile.
    const base = Date.UTC(1899, 11, 30);
    const date = new Date(base + Number(valeur) * 86_400_000);
    return date.toISOString().slice(0, 10);
  }

  return null;
}

/** « oui », « x », « 1 », « true » — tout ce qu'un humain écrit pour dire oui. */
export function normaliserBooleen(brut: string): boolean {
  return ["oui", "o", "x", "1", "true", "vrai"].includes(brut.trim().toLowerCase());
}

/** « m », « masculin », « garcon » → M. Le reste des conventions locales aussi. */
export function normaliserSexe(brut: string): "M" | "F" | null {
  const v = cleColonne(brut);
  if (["m", "masculin", "garcon", "homme", "h"].includes(v)) return "M";
  if (["f", "feminin", "fille", "femme"].includes(v)) return "F";
  return null;
}
