import { sql } from "drizzle-orm";
import ExcelJS from "exceljs";

import { db } from "@/server/db";
import { ErreurAutorisation, requirePermission } from "@/server/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Grille de saisie d'une évaluation, au format tableur.
 *
 * PRÉ-REMPLIE AVEC LA CLASSE
 * ---------------------------
 * Le gabarit des élèves est vide — c'est un fichier d'entrée. Celui-ci ne l'est
 * pas : il porte déjà les matricules et les noms de la classe, dans l'ordre
 * alphabétique. Un professeur n'a qu'à remplir la colonne « Note ».
 *
 * Sans cela, il recopierait cinquante matricules à la main, et l'import lui
 * coûterait plus cher que la saisie à l'écran.
 *
 * Les notes DÉJÀ saisies sont reportées : le fichier est une photographie de
 * l'existant, qu'on complète ou qu'on corrige, pas une page blanche qui
 * effacerait le travail commencé.
 */
export async function GET(
  _requete: Request,
  { params }: { params: Promise<{ evaluationId: string }> },
) {
  const { evaluationId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(evaluationId)) {
    return new Response("Identifiant invalide", { status: 400 });
  }

  const contexte = await db.execute<{
    titre: string;
    matiere: string;
    classe: string;
    classe_id: string;
    matiere_id: string;
    bareme: string;
    periode: string;
    date_evaluation: string | null;
  }>(sql`
    SELECT ev.titre, m.libelle AS matiere, c.libelle AS classe,
           ev.classe_id, ev.matiere_id, ev.bareme::text,
           p.libelle AS periode, ev.date_evaluation::text
      FROM evaluations ev
      JOIN matieres m ON m.id = ev.matiere_id
      JOIN classes c  ON c.id = ev.classe_id
      JOIN periodes p ON p.id = ev.periode_id
     WHERE ev.id = ${evaluationId}::uuid
  `);

  const ev = contexte.rows[0];
  if (!ev) return new Response("Évaluation introuvable", { status: 404 });

  try {
    await requirePermission("note:saisir", {
      classeId: ev.classe_id,
      matiereId: ev.matiere_id,
    });
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return Response.json({ erreur: "Non autorisé." }, { status: 403 });
    }
    throw erreur;
  }

  const eleves = await db.execute<{
    matricule: string;
    nom: string;
    prenom: string;
    valeur: string | null;
    statut: string | null;
    appreciation: string | null;
  }>(sql`
    SELECT e.matricule, e.nom, e.prenom,
           n.valeur::text AS valeur, n.statut::text AS statut, n.appreciation
      FROM inscriptions i
      JOIN eleves e ON e.id = i.eleve_id
      LEFT JOIN notes n ON n.inscription_id = i.id AND n.evaluation_id = ${evaluationId}::uuid
     WHERE i.classe_id = ${ev.classe_id}::uuid AND i.active
     ORDER BY e.nom, e.prenom
  `);

  const classeur = new ExcelJS.Workbook();
  classeur.creator = "Lycée Guergné La Renaissance";
  classeur.created = new Date();

  const feuille = classeur.addWorksheet("Notes");

  feuille.mergeCells(1, 1, 1, 5);
  const titre = feuille.getCell(1, 1);
  titre.value = `${ev.matiere} — ${ev.titre}`;
  titre.font = { bold: true, size: 14, color: { argb: "FF1E429F" } };

  feuille.mergeCells(2, 1, 2, 5);
  const sousTitre = feuille.getCell(2, 1);
  sousTitre.value =
    `${ev.classe} · ${ev.periode} · barème sur ${ev.bareme}` +
    (ev.date_evaluation ? ` · ${new Date(ev.date_evaluation).toLocaleDateString("fr-FR")}` : "");
  sousTitre.font = { size: 9, color: { argb: "FF64748B" } };

  feuille.mergeCells(3, 1, 3, 5);
  const consigne = feuille.getCell(3, 1);
  consigne.value =
    "Remplissez la colonne Note. Pour une absence, laissez la note vide et écrivez " +
    "« absent », « absent non justifié », « dispensé » ou « non rendu » dans la colonne Statut.";
  consigne.font = { size: 9, italic: true, color: { argb: "FF64748B" } };

  const LIGNE_ENTETE = 5;
  const colonnes = [
    { entete: "Matricule", cle: "matricule", largeur: 16 },
    { entete: "Nom", cle: "nom", largeur: 22 },
    { entete: "Prénom", cle: "prenom", largeur: 20 },
    { entete: "Note", cle: "note", largeur: 10 },
    { entete: "Statut", cle: "statut", largeur: 22 },
    { entete: "Appréciation", cle: "appreciation", largeur: 34 },
  ];

  const entete = feuille.getRow(LIGNE_ENTETE);
  colonnes.forEach((c, i) => {
    const cellule = entete.getCell(i + 1);
    cellule.value = c.entete;
    cellule.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cellule.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E429F" } };
    feuille.getColumn(i + 1).width = c.largeur;
  });
  entete.height = 20;

  eleves.rows.forEach((e, index) => {
    const rang = feuille.getRow(LIGNE_ENTETE + 1 + index);
    rang.getCell(1).value = e.matricule;
    // Le matricule est forcé en texte : « 0016 » deviendrait 16 autrement, et
    // l'import ne retrouverait plus l'élève.
    rang.getCell(1).numFmt = "@";
    rang.getCell(2).value = e.nom;
    rang.getCell(3).value = e.prenom;
    rang.getCell(4).value = e.valeur === null ? null : Number(e.valeur);
    rang.getCell(5).value = e.statut && e.statut !== "NOTEE" ? e.statut.toLowerCase().replace(/_/g, " ") : null;
    rang.getCell(6).value = e.appreciation;

    // Les colonnes déjà servies par la base sont grisées : le professeur voit
    // ce qu'il modifie et ce qu'il ajoute.
    for (const c of [1, 2, 3]) {
      rang.getCell(c).font = { color: { argb: "FF64748B" } };
    }
  });

  feuille.views = [{ state: "frozen", ySplit: LIGNE_ENTETE }];

  // La colonne Note refuse ce qui sort du barème, directement dans Excel : le
  // professeur est arrêté à la saisie plutôt qu'au dépôt du fichier.
  for (let i = 0; i < eleves.rows.length; i += 1) {
    feuille.getCell(LIGNE_ENTETE + 1 + i, 4).dataValidation = {
      type: "decimal",
      operator: "between",
      formulae: [0, Number(ev.bareme)],
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: "Hors barème",
      error: `La note doit être comprise entre 0 et ${ev.bareme}.`,
    };
  }

  const donnees = await classeur.xlsx.writeBuffer();
  const nom = `notes-${ev.classe}-${ev.titre}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase();

  return new Response(donnees as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nom}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
