/**
 * Génération de vrais fichiers.
 *
 * POURQUOI UN FICHIER, ET PAS UN MESSAGE
 * ---------------------------------------
 * Un bilan rendu en texte WhatsApp se lit une fois, puis se perd dans la
 * conversation. On ne peut ni le trier, ni l'imprimer, ni le joindre à un
 * conseil de classe. Un directeur qui demande « prépare le rapport » attend un
 * document, pas un paragraphe.
 *
 * DEUX FORMATS, UNE SEULE RAISON
 * -------------------------------
 * XLSX quand `exceljs` est disponible — c'est la bibliothèque que la
 * plateforme utilise déjà, donc rien de nouveau à maîtriser. CSV sinon, qui
 * n'exige aucune dépendance et s'ouvre dans le même tableur.
 *
 * L'import d'`exceljs` est PARESSEUX et protégé. L'agent tourne sur un
 * hébergement où une installation ratée empêche le service de démarrer : une
 * dépendance de confort ne doit jamais pouvoir coûter la réception des
 * messages. Si elle manque, on produit un CSV et on le dit.
 *
 * NE JAMAIS ANNONCER UN FICHIER QUI N'EXISTE PAS
 * -----------------------------------------------
 * `genererDocument` relit ce qu'il vient d'écrire avant de le rendre. Un
 * rapport annoncé mais vide serait pire que pas de rapport : le lecteur
 * croirait l'avoir reçu.
 */

/** Séparateur : le point-virgule, parce qu'Excel francophone lit la virgule comme une décimale. */
const SEP = ";";

/** Échappement CSV : guillemets doublés, champ encadré dès qu'il porte un caractère de structure. */
function champCsv(v) {
  const t = v === null || v === undefined ? "" : String(v);
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/**
 * Modèle de document.
 *
 * @typedef {object} Document
 * @property {string} titre
 * @property {string} [periode]
 * @property {string[]} [sources]       d'où viennent les chiffres
 * @property {Array<{libelle:string, valeur:unknown}>} [indicateurs]
 * @property {Array<{titre:string, colonnes:string[], lignes:unknown[][]}>} [tableaux]
 * @property {string} [synthese]
 * @property {string[]} [limites]       ce que le document NE dit pas
 */

/** En-tête commun : un document sans date ni source n'est pas vérifiable. */
function entete(doc, maintenant) {
  return [
    ["Titre", doc.titre],
    ["Periode", doc.periode ?? "non precisee"],
    ["Genere le", maintenant.toISOString().replace("T", " ").slice(0, 19) + " UTC"],
    ["Sources", (doc.sources ?? []).join(", ") || "non precisees"],
  ];
}

/** Rendu CSV. Aucune dépendance. */
export function enCsv(doc, maintenant = new Date()) {
  const lignes = [];
  const pousser = (cellules) => lignes.push(cellules.map(champCsv).join(SEP));

  for (const [k, v] of entete(doc, maintenant)) pousser([k, v]);

  if (doc.indicateurs?.length) {
    lignes.push("");
    pousser(["Indicateur", "Valeur"]);
    for (const i of doc.indicateurs) pousser([i.libelle, i.valeur]);
  }

  for (const t of doc.tableaux ?? []) {
    lignes.push("");
    pousser([t.titre]);
    pousser(t.colonnes);
    for (const l of t.lignes) pousser(l);
  }

  if (doc.synthese) {
    lignes.push("");
    pousser(["Synthese", doc.synthese]);
  }

  // Les limites viennent en dernier, mais elles viennent : un document muet
  // sur ce qu'il ne couvre pas se lit comme s'il couvrait tout.
  if (doc.limites?.length) {
    lignes.push("");
    pousser(["Limites"]);
    for (const l of doc.limites) pousser([l]);
  }

  // Le BOM permet a Excel de reconnaitre l'UTF-8 ; sans lui, les accents
  // ressortent abimes a l'ouverture.
  return Buffer.from("﻿" + lignes.join("\r\n"), "utf8");
}

/**
 * Rendu XLSX, si `exceljs` est installé.
 *
 * @returns {Promise<Buffer|null>} `null` quand la bibliothèque manque — ce
 *   n'est pas une erreur, c'est un repli prévu.
 */
export async function enXlsx(doc, maintenant = new Date()) {
  let ExcelJS;
  try {
    ExcelJS = (await import("exceljs")).default;
  } catch {
    return null;
  }
  try {
    const classeur = new ExcelJS.Workbook();
    classeur.creator = "Agent IA — Lycee Guergne La Renaissance";
    classeur.created = maintenant;

    const f = classeur.addWorksheet("Rapport");
    const gras = (ligne) => {
      ligne.font = { bold: true };
      return ligne;
    };

    for (const [k, v] of entete(doc, maintenant)) gras(f.addRow([k, v])).getCell(2).font = { bold: false };

    if (doc.indicateurs?.length) {
      f.addRow([]);
      gras(f.addRow(["Indicateur", "Valeur"]));
      for (const i of doc.indicateurs) f.addRow([i.libelle, i.valeur]);
    }

    for (const t of doc.tableaux ?? []) {
      f.addRow([]);
      gras(f.addRow([t.titre]));
      gras(f.addRow(t.colonnes));
      for (const l of t.lignes) f.addRow(l);
    }

    if (doc.synthese) {
      f.addRow([]);
      gras(f.addRow(["Synthese"]));
      f.addRow([doc.synthese]);
    }
    if (doc.limites?.length) {
      f.addRow([]);
      gras(f.addRow(["Limites"]));
      for (const l of doc.limites) f.addRow([l]);
    }

    f.columns.forEach((c) => {
      c.width = Math.min(48, Math.max(14, ...(c.values ?? []).map((v) => String(v ?? "").length + 2)));
    });

    return Buffer.from(await classeur.xlsx.writeBuffer());
  } catch {
    // Une bibliotheque presente mais en echec ne doit pas priver du rapport :
    // le CSV reste.
    return null;
  }
}

/** Nom de fichier sûr, daté — deux rapports du même jour ne s'écrasent pas. */
export function nomDeFichier(titre, extension, maintenant = new Date()) {
  const base = String(titre ?? "rapport")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 50) || "rapport";
  const horodatage = maintenant.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `${base}-${horodatage}.${extension}`;
}

/**
 * Produit le document, en préférant XLSX, et VÉRIFIE ce qu'il vient d'écrire.
 *
 * @returns {Promise<{nomFichier:string, mimetype:string, data:Buffer, format:string, octets:number}>}
 */
export async function genererDocument(doc, maintenant = new Date()) {
  const xlsx = await enXlsx(doc, maintenant);
  const format = xlsx ? "xlsx" : "csv";
  const data = xlsx ?? enCsv(doc, maintenant);

  // Relecture : un rapport annonce mais vide serait pire que pas de rapport,
  // car le lecteur croirait l'avoir recu.
  if (!Buffer.isBuffer(data) || data.length === 0) {
    throw new Error("document genere vide : rien ne sera annonce");
  }
  // Un document sans titre n'est pas verifiable : on ne peut pas s'assurer
  // qu'il porte bien ce qu'on croit y avoir mis. Et `includes("")` est
  // toujours vrai, donc la relecture ci-dessous ne prouverait rien.
  const titre = String(doc.titre ?? "").trim();
  if (!titre) throw new Error("document sans titre : illisible et invérifiable");
  if (format === "csv" && !data.toString("utf8").includes(titre)) {
    throw new Error("document genere illisible : le titre ne s'y retrouve pas");
  }
  if (format === "xlsx" && data.subarray(0, 2).toString("latin1") !== "PK") {
    // Un XLSX est une archive ZIP : sans cette signature, le fichier ne
    // s'ouvrira pas, et mieux vaut le savoir ici.
    throw new Error("document xlsx invalide : signature absente");
  }

  return {
    nomFichier: nomDeFichier(doc.titre, format, maintenant),
    mimetype:
      format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv; charset=utf-8",
    data,
    format,
    octets: data.length,
  };
}

/**
 * Transforme le résultat d'une mission en modèle de document.
 *
 * Les chiffres viennent des agrégats, calculés en code : le document ne peut
 * donc rien contenir que les données ne portent pas.
 */
export function documentDeMission({ but, resultats, periode }) {
  const indicateurs = [];
  const tableaux = [];
  const limites = [];

  for (const r of resultats) {
    if (r.statut !== "reussie") {
      limites.push(`${r.libelle} : non disponible (${r.detail ?? r.statut})`);
      continue;
    }
    const a = r.agregat;
    indicateurs.push({ libelle: `${r.libelle} — total`, valeur: a.total });
    if (a.heures > 0) indicateurs.push({ libelle: `${r.libelle} — heures`, valeur: a.heures });
    for (const [statut, n] of Object.entries(a.parStatut)) {
      indicateurs.push({ libelle: `${r.libelle} — ${statut}`, valeur: n });
    }
    if (a.parClasse.length) {
      tableaux.push({
        titre: `${r.libelle} par classe`,
        colonnes: ["Classe", "Nombre"],
        lignes: a.parClasse.map((c) => [c.classe, c.n]),
      });
    }
  }

  const reussies = resultats.filter((r) => r.statut === "reussie").length;
  return {
    titre: but,
    periode,
    sources: resultats.map((r) => r.outil ?? r.libelle),
    indicateurs,
    tableaux,
    synthese:
      reussies === resultats.length
        ? `${resultats.length} consultation(s), chiffres issus de la base.`
        : `${reussies}/${resultats.length} consultations abouties — bilan partiel.`,
    limites,
  };
}
