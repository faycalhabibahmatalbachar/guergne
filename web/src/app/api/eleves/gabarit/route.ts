import { sql } from "drizzle-orm";
import ExcelJS from "exceljs";

import { db } from "@/server/db";
import { ErreurAutorisation, requirePermission } from "@/server/guard";
import { ORDRE_GABARIT, libelleColonne } from "@/server/import/eleves";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Gabarit d'import des élèves.
 *
 * POURQUOI LE PRODUIRE PLUTÔT QUE LE COMMITTER
 * ---------------------------------------------
 * Un fichier d'exemple figé dans le dépôt se désynchronise du code au premier
 * champ ajouté, et personne ne s'en aperçoit avant qu'un secrétariat n'importe
 * cinq cents élèves sans leur classe. Ici, les colonnes viennent de la même
 * source que l'analyseur : elles ne peuvent pas diverger.
 *
 * La feuille porte aussi la LISTE RÉELLE DES CLASSES OUVERTES, en seconde
 * feuille. C'est le champ qui fait échouer les imports : le secrétariat écrit
 * « 6A », la base connaît « 6ème A ». Donner la liste exacte à recopier coûte
 * dix lignes et supprime le problème.
 */
export async function GET() {
  // Une route d'API n'a pas de page d'erreur : sans ce rattrapage, une requête
  // non authentifiée remonte en 500. C'est faux — la demande était recevable,
  // c'est l'appelant qui n'a pas le droit — et cela pollue les journaux avec
  // des incidents qui n'en sont pas.
  try {
    await requirePermission("eleve:inscrire");
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return Response.json({ erreur: "Non autorisé." }, { status: 403 });
    }
    throw erreur;
  }

  const classeur = new ExcelJS.Workbook();
  classeur.creator = "Lycée Guergné La Renaissance";
  classeur.created = new Date();

  // --- Feuille 1 : la saisie ------------------------------------------------
  const feuille = classeur.addWorksheet("Élèves");

  feuille.columns = ORDRE_GABARIT.map((cle) => ({
    header: libelleColonne(cle),
    key: cle,
    width: Math.max(16, libelleColonne(cle).length + 4),
  }));

  const entete = feuille.getRow(1);
  entete.font = { bold: true, color: { argb: "FFFFFFFF" } };
  entete.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E429F" } };
  entete.height = 22;
  entete.alignment = { vertical: "middle" };
  feuille.views = [{ state: "frozen", ySplit: 1 }];

  // Une ligne d'exemple, en italique gris : elle montre le format attendu pour
  // les dates et le sexe, qui sont les deux causes d'échec les plus fréquentes.
  const exemple = feuille.addRow({
    nom: "DJIMET",
    prenom: "Oumar",
    sexe: "M",
    date_naissance: "05/07/2009",
    lieu_naissance: "N'Djamena",
    nationalite: "Tchadienne",
    acte_naissance: "1234/2009",
    adresse: "Quartier Chagoua",
    quartier: "Chagoua",
    classe: "6ème A",
    redoublant: "non",
    boursier: "non",
    ecole_origine: "École Publique de Chagoua",
    tuteur_nom: "DJIMET",
    tuteur_prenom: "Fatimé",
    tuteur_telephone: "66112233",
    tuteur_lien: "MERE",
  });
  exemple.font = { italic: true, color: { argb: "FF94A3B8" } };

  // La colonne des dates est forcée en TEXTE : sans cela Excel convertit
  // « 05/07/2009 » en nombre, et un secrétariat qui rouvre le fichier voit
  // 40 000 s'afficher à la place de la date.
  const colonneDate = feuille.getColumn("date_naissance");
  colonneDate.numFmt = "@";

  // --- Feuille 2 : les classes ouvertes -------------------------------------
  const classes = await db.execute<{ libelle: string; effectif: number; capacite: number | null }>(
    // Requête brute : elle ne sert qu'ici et joint trois tables pour un
    // affichage. Une abstraction n'apporterait rien.
    sql`
      SELECT c.libelle,
             count(i.id) FILTER (WHERE i.active) AS effectif,
             c.capacite_max AS capacite
        FROM classes c
        JOIN annees_scolaires a ON a.id = c.annee_id AND a.est_courante
        LEFT JOIN inscriptions i ON i.classe_id = c.id
       GROUP BY c.id, c.libelle, c.capacite_max
       ORDER BY c.libelle
    `,
  );

  const aide = classeur.addWorksheet("Classes ouvertes");
  aide.columns = [
    { header: "Libellé exact à recopier", key: "libelle", width: 32 },
    { header: "Effectif actuel", key: "effectif", width: 16 },
    { header: "Capacité", key: "capacite", width: 12 },
  ];
  aide.getRow(1).font = { bold: true };
  for (const c of classes.rows) {
    aide.addRow({
      libelle: c.libelle,
      effectif: Number(c.effectif),
      capacite: c.capacite ?? "—",
    });
  }

  const donnees = await classeur.xlsx.writeBuffer();

  return new Response(donnees as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="gabarit-import-eleves.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
