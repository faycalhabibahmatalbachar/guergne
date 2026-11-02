/**
 * Recette de la génération de documents.
 *
 * La règle que ces tests verrouillent : **ne jamais annoncer un fichier qui
 * n'existe pas.** Un rapport annoncé mais vide est pire que pas de rapport —
 * le lecteur croit l'avoir reçu, et ne redemande pas.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { documentDeMission, enCsv, enXlsx, genererDocument, nomDeFichier } from "../src/document.js";

const QUAND = new Date("2026-11-02T08:30:00Z");

const DOC = {
  titre: "Bilan d'assiduité",
  periode: "1er Trimestre",
  sources: ["listerAbsences", "listerRetards"],
  indicateurs: [
    { libelle: "Absences — total", valeur: 100 },
    { libelle: "Absences — heures", valeur: 294 },
  ],
  tableaux: [{ titre: "Absences par classe", colonnes: ["Classe", "Nombre"], lignes: [["5ème B", 16], ["2nde B", 9]] }],
  synthese: "2 consultations, chiffres issus de la base.",
  limites: ["Incidents : non disponible (droits insuffisants)"],
};

// --- CSV -------------------------------------------------------------------

test("le CSV porte l'en-tete, les indicateurs, les tableaux et les limites", () => {
  const texte = enCsv(DOC, QUAND).toString("utf8");
  assert.match(texte, /Titre;Bilan d'assiduité/);
  assert.match(texte, /Periode;1er Trimestre/);
  assert.match(texte, /Genere le;2026-11-02 08:30:00 UTC/);
  // Une virgule n'a pas besoin d'etre echappee : le separateur est le
  // point-virgule.
  assert.match(texte, /Sources;listerAbsences, listerRetards/);
  assert.match(texte, /Absences — total;100/);
  assert.match(texte, /Absences par classe/);
  assert.match(texte, /5ème B;16/);
  assert.match(texte, /Synthese;/);
  // Un document muet sur ce qu'il ne couvre pas se lit comme s'il couvrait
  // tout.
  assert.match(texte, /Limites/);
  assert.match(texte, /Incidents : non disponible/);
});

test("le CSV s'ouvre correctement dans un tableur francophone", () => {
  const brut = enCsv(DOC, QUAND);
  // BOM : sans lui, Excel abime les accents a l'ouverture.
  assert.equal(brut.subarray(0, 3).toString("hex"), "efbbbf");
  const texte = brut.toString("utf8");
  // Point-virgule : Excel francophone lit la virgule comme une decimale.
  assert.ok(texte.includes(";"));
  assert.ok(texte.includes("\r\n"), "fins de ligne Windows");
});

test("un champ qui porte un separateur ou un guillemet est echappe", () => {
  // Sans echappement, une seule valeur decalerait toute la ligne.
  const texte = enCsv(
    { titre: 'Rapport "spécial"; urgent', tableaux: [{ titre: "T", colonnes: ["A"], lignes: [['a;b"c']] }] },
    QUAND,
  ).toString("utf8");
  assert.match(texte, /"Rapport ""spécial""; urgent"/);
  assert.match(texte, /"a;b""c"/);
});

test("un document minimal reste valide", () => {
  const texte = enCsv({ titre: "Vide" }, QUAND).toString("utf8");
  assert.match(texte, /Titre;Vide/);
  assert.match(texte, /Periode;non precisee/);
  assert.match(texte, /Sources;non precisees/);
});

// --- XLSX ------------------------------------------------------------------

test("le XLSX est produit quand la bibliotheque est la, sinon on se replie", async () => {
  const buffer = await enXlsx(DOC, QUAND);
  if (buffer === null) {
    // Repli prevu, pas une erreur : l'agent tourne sur un hebergement ou une
    // installation ratee empeche le service de demarrer.
    console.log("    (exceljs absent : repli CSV — comportement attendu)");
    return;
  }
  assert.ok(Buffer.isBuffer(buffer) && buffer.length > 0);
  assert.equal(buffer.subarray(0, 2).toString("latin1"), "PK", "un XLSX est une archive ZIP");
});

// --- Génération complète ---------------------------------------------------

test("genererDocument rend un fichier non vide, nomme et type", async () => {
  const f = await genererDocument(DOC, QUAND);
  assert.ok(f.octets > 0);
  assert.ok(["csv", "xlsx"].includes(f.format));
  assert.match(f.nomFichier, /^bilan-d-assiduite-2026-11-02-08-30-00\.(csv|xlsx)$/);
  assert.match(f.mimetype, /csv|spreadsheetml/);
  assert.equal(f.data.length, f.octets);
});

test("un document vide est REFUSE plutot qu'annonce", async () => {
  // C'est la regle centrale : ne jamais annoncer un fichier qui n'existe pas.
  for (const sansTitre of [{ titre: "" }, { titre: "   " }, {}]) {
    await assert.rejects(
      () => genererDocument(sansTitre, QUAND),
      /sans titre/,
      `un titre absent rend le document invérifiable : ${JSON.stringify(sansTitre)}`,
    );
  }
});

test("le nom de fichier est sur, accentue ou non", () => {
  assert.equal(nomDeFichier("Bilan d'assiduité & discipline", "csv", QUAND), "bilan-d-assiduite-discipline-2026-11-02-08-30-00.csv");
  assert.match(nomDeFichier("", "csv", QUAND), /^rapport-/);
  assert.match(nomDeFichier("///", "csv", QUAND), /^rapport-/);
  // Deux rapports du meme jour ne doivent pas s'ecraser.
  assert.notEqual(nomDeFichier("X", "csv", QUAND), nomDeFichier("X", "csv", new Date("2026-11-02T08:31:00Z")));
});

// --- Depuis une mission ----------------------------------------------------

test("le document d'une mission ne contient que ce que les donnees portent", () => {
  const modele = documentDeMission({
    but: "Bilan",
    periode: "1er Trimestre",
    resultats: [
      {
        libelle: "Absences",
        outil: "assiduite.consulter_absences",
        statut: "reussie",
        agregat: { total: 2, heures: 3, parStatut: { NON_JUSTIFIEE: 1 }, parClasse: [{ classe: "6ème B", n: 2 }] },
      },
      { libelle: "Incidents", outil: "discipline.consulter_incidents", statut: "refusee", detail: "droits insuffisants" },
    ],
  });
  assert.equal(modele.titre, "Bilan");
  assert.deepEqual(modele.sources, ["assiduite.consulter_absences", "discipline.consulter_incidents"]);
  assert.ok(modele.indicateurs.some((i) => i.libelle === "Absences — total" && i.valeur === 2));
  assert.ok(modele.indicateurs.some((i) => i.libelle === "Absences — NON_JUSTIFIEE" && i.valeur === 1));
  assert.equal(modele.tableaux[0].titre, "Absences par classe");
  assert.deepEqual(modele.tableaux[0].lignes, [["6ème B", 2]]);
  // L'etape manquee devient une limite : le bilan dit ce qu'il n'a pas pu lire.
  assert.match(modele.limites[0], /Incidents : non disponible \(droits insuffisants\)/);
  assert.match(modele.synthese, /1\/2 consultations abouties/);
});

test("une mission entierement reussie le dit, sans limite inventee", () => {
  const modele = documentDeMission({
    but: "Bilan",
    resultats: [{ libelle: "A", outil: "o", statut: "reussie", agregat: { total: 1, heures: 0, parStatut: {}, parClasse: [] } }],
  });
  assert.deepEqual(modele.limites, []);
  assert.match(modele.synthese, /chiffres issus de la base/);
});
