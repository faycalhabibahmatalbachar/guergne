import { sql } from "drizzle-orm";
import ExcelJS from "exceljs";

import { db } from "@/server/db";
import { ErreurAutorisation, requirePermission } from "@/server/guard";
import {
  ORDRE_GABARIT_ENSEIGNANTS,
  libelleColonneEnseignant,
  statutsEnseignant,
} from "@/server/import/enseignants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Gabarit d'import du personnel enseignant.
 *
 * Comme celui des élèves, il est PRODUIT depuis les mêmes définitions que
 * l'analyseur — colonnes et alias ne peuvent donc pas diverger.
 *
 * Il porte deux feuilles d'aide plutôt qu'une : les statuts admis et les
 * matières de l'établissement. Ce sont les deux colonnes où une valeur
 * approximative fait échouer la ligne, et où l'utilisateur n'a aucun moyen de
 * deviner l'orthographe attendue.
 */
export async function GET() {
  try {
    await requirePermission("utilisateur:creer");
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return Response.json({ erreur: "Non autorisé." }, { status: 403 });
    }
    throw erreur;
  }

  const classeur = new ExcelJS.Workbook();
  classeur.creator = "Lycée Guergné La Renaissance";
  classeur.created = new Date();

  const feuille = classeur.addWorksheet("Enseignants");
  feuille.columns = ORDRE_GABARIT_ENSEIGNANTS.map((cle) => ({
    header: libelleColonneEnseignant(cle),
    key: cle,
    width: Math.max(16, libelleColonneEnseignant(cle).length + 4),
  }));

  const entete = feuille.getRow(1);
  entete.font = { bold: true, color: { argb: "FFFFFFFF" } };
  entete.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E429F" } };
  entete.height = 22;
  entete.alignment = { vertical: "middle" };
  feuille.views = [{ state: "frozen", ySplit: 1 }];

  const exemple = feuille.addRow({
    matricule: "ENS-2026-001",
    nom: "ABDELKERIM",
    prenom: "Hassan",
    sexe: "M",
    date_naissance: "14/02/1985",
    telephone: "66445566",
    email: "h.abdelkerim@exemple.td",
    adresse: "Avenue Mobutu",
    quartier: "Moursal",
    diplome: "Licence en mathématiques",
    specialite: "Mathématiques",
    statut: "PERMANENT",
    date_embauche: "01/10/2019",
    cnps: "TD-0123456",
    heures: 18,
    // Séparateur explicite : c'est la colonne qui pose le plus de questions.
    matieres: "Mathématiques, Physique",
  });
  exemple.font = { italic: true, color: { argb: "FF94A3B8" } };

  for (const cle of ["date_naissance", "date_embauche", "matricule", "telephone", "cnps"]) {
    feuille.getColumn(cle).numFmt = "@";
  }

  // --- Feuille 2 : statuts admis --------------------------------------------
  const aideStatuts = classeur.addWorksheet("Statuts admis");
  aideStatuts.columns = [{ header: "Valeur à recopier", key: "v", width: 28 }];
  aideStatuts.getRow(1).font = { bold: true };
  for (const s of statutsEnseignant()) aideStatuts.addRow({ v: s });

  // --- Feuille 3 : matières de l'établissement ------------------------------
  const matieres = await db.execute<{ libelle: string; code: string }>(
    sql`SELECT libelle, code FROM matieres WHERE active ORDER BY libelle`,
  );

  const aideMatieres = classeur.addWorksheet("Matières");
  aideMatieres.columns = [
    { header: "Libellé", key: "libelle", width: 32 },
    { header: "Code (accepté aussi)", key: "code", width: 22 },
  ];
  aideMatieres.getRow(1).font = { bold: true };
  for (const m of matieres.rows) aideMatieres.addRow({ libelle: m.libelle, code: m.code });

  const donnees = await classeur.xlsx.writeBuffer();

  return new Response(donnees as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="gabarit-import-enseignants.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
