import { sql } from "drizzle-orm";
import ExcelJS from "exceljs";

import { db } from "@/server/db";
import { enTetesClasseur, nomFichier } from "@/server/export/classeur";
import { ErreurAutorisation, requirePermission } from "@/server/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Export comptable (E-18).
 *
 * CE N'EST PAS L'EXPORT DES PAIEMENTS
 * ------------------------------------
 * `/api/export/paiements` rend une liste : ce que le portail a enregistré. Un
 * comptable ne travaille pas sur une liste, il travaille sur un RAPPROCHEMENT.
 * Il doit pouvoir répondre à trois questions dans le même classeur :
 *
 *   1. Combien est entré, quand, par quel moyen ? — le journal de caisse.
 *   2. Combien AURAIT dû entrer, et combien manque ? — les créances.
 *   3. Combien l'établissement a-t-il renoncé à percevoir ? — les exonérations,
 *      qui sont une dépense invisible : rien ne sort de la caisse, mais le
 *      budget est amputé du même montant.
 *
 * D'où quatre feuilles plutôt qu'un tableau. Chacune se suffit à elle-même et
 * porte ses totaux : un comptable qui n'imprime qu'une feuille doit pouvoir la
 * lire seule.
 *
 * LES ANNULATIONS RESTENT VISIBLES
 * ---------------------------------
 * Un reçu annulé n'est pas supprimé du journal — il y figure, marqué, avec son
 * montant en négatif. Faire disparaître une écriture est exactement ce qu'un
 * contrôle cherche : la trace doit rester, et le solde doit s'expliquer.
 */

const BLEU = "FF1E429F";
const MONNAIE = '# ##0 "F"';

function feuille(classeur: ExcelJS.Workbook, nom: string, colonnes: Array<[string, number, string?]>) {
  const f = classeur.addWorksheet(nom);
  f.columns = colonnes.map(([entete, largeur, format]) => ({
    header: entete,
    width: largeur,
    style: format ? { numFmt: format } : undefined,
  }));
  const e = f.getRow(1);
  e.font = { bold: true, color: { argb: "FFFFFFFF" } };
  e.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLEU } };
  e.height = 20;
  f.views = [{ state: "frozen", ySplit: 1 }];
  return f;
}

/** Ligne de total, en gras et détachée du corps du tableau. */
function total(f: ExcelJS.Worksheet, libelle: string, colonne: number, valeurs: number[]) {
  const rang = f.addRow([]);
  rang.getCell(1).value = libelle;
  rang.getCell(1).font = { bold: true };
  valeurs.forEach((v, i) => {
    const cellule = rang.getCell(colonne + i);
    cellule.value = v;
    cellule.font = { bold: true };
    cellule.numFmt = MONNAIE;
  });
  rang.border = { top: { style: "medium" } };
}

export async function GET(requete: Request) {
  try {
    await requirePermission("finance:exporter");
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return Response.json({ erreur: "Non autorisé." }, { status: 403 });
    }
    throw erreur;
  }

  const url = new URL(requete.url);
  const du = url.searchParams.get("du");
  const au = url.searchParams.get("au");

  const [annee] = (
    await db.execute<{ id: string; libelle: string }>(
      sql`SELECT id, libelle FROM annees_scolaires WHERE est_courante LIMIT 1`,
    )
  ).rows;

  if (!annee) return new Response("Aucune année scolaire courante", { status: 400 });

  const classeur = new ExcelJS.Workbook();
  classeur.creator = "Lycée Guergné La Renaissance";
  classeur.created = new Date();

  // === 1. Journal de caisse ==================================================
  const journal = await db.execute<Record<string, unknown>>(sql`
    SELECT p.date_paiement::text AS date, p.numero_recu, e.matricule,
           e.nom || ' ' || e.prenom AS eleve, c.libelle AS classe,
           COALESCE(ec.nature::text, 'AUTRE') AS nature,
           p.mode::text AS mode, p.nom_payeur, p.reference_externe,
           p.annule,
           CASE WHEN p.annule THEN -p.montant_fcfa ELSE p.montant_fcfa END AS montant
      FROM paiements p
      JOIN inscriptions i ON i.id = p.inscription_id
      JOIN eleves e       ON e.id = i.eleve_id
      LEFT JOIN classes c   ON c.id = i.classe_id
      LEFT JOIN echeances ec ON ec.id = p.echeance_id
     WHERE i.annee_id = ${annee.id}::uuid
       AND (${du}::date IS NULL OR p.date_paiement >= ${du}::date)
       AND (${au}::date IS NULL OR p.date_paiement <= ${au}::date)
     ORDER BY p.date_paiement, p.numero_recu
  `);

  const f1 = feuille(classeur, "Journal de caisse", [
    ["Date", 12],
    ["N° reçu", 16],
    ["Matricule", 14],
    ["Élève", 26],
    ["Classe", 12],
    ["Nature", 16],
    ["Mode", 16],
    ["Payeur", 22],
    ["Référence", 18],
    ["Montant", 14, MONNAIE],
    ["Annulé", 10],
  ]);

  let encaisse = 0;
  for (const l of journal.rows) {
    const montant = Number(l.montant);
    encaisse += montant;
    f1.addRow([
      l.date,
      l.numero_recu,
      l.matricule,
      l.eleve,
      l.classe,
      l.nature,
      l.mode,
      l.nom_payeur,
      l.reference_externe,
      montant,
      l.annule ? "OUI" : "",
    ]);
  }
  total(f1, `Total encaissé — ${journal.rows.length} écriture(s)`, 10, [encaisse]);

  // === 2. Récapitulatif par mode d'encaissement =============================
  // C'est la feuille du rapprochement bancaire : l'espèce se compte en caisse,
  // le mobile money et le virement se pointent sur un relevé.
  const parMode = await db.execute<Record<string, unknown>>(sql`
    SELECT p.mode::text AS mode, count(*)::int AS nb,
           SUM(CASE WHEN p.annule THEN -p.montant_fcfa ELSE p.montant_fcfa END) AS montant
      FROM paiements p
      JOIN inscriptions i ON i.id = p.inscription_id
     WHERE i.annee_id = ${annee.id}::uuid
       AND (${du}::date IS NULL OR p.date_paiement >= ${du}::date)
       AND (${au}::date IS NULL OR p.date_paiement <= ${au}::date)
     GROUP BY p.mode ORDER BY 3 DESC
  `);

  const f2 = feuille(classeur, "Par mode", [
    ["Mode d'encaissement", 26],
    ["Écritures", 12],
    ["Montant", 16, MONNAIE],
  ]);
  for (const l of parMode.rows) {
    f2.addRow([l.mode, Number(l.nb), Number(l.montant)]);
  }
  total(f2, "Total", 3, [encaisse]);

  // === 3. Créances : ce qui reste à percevoir ================================
  const creances = await db.execute<Record<string, unknown>>(sql`
    SELECT c.libelle AS classe,
           count(DISTINCT i.id)::int AS eleves,
           SUM(ec.montant_du_fcfa)      AS du,
           SUM(ec.montant_paye_fcfa)    AS paye,
           SUM(ec.montant_exonere_fcfa) AS exonere,
           SUM(ec.montant_du_fcfa - ec.montant_paye_fcfa - ec.montant_exonere_fcfa) AS reste,
           count(*) FILTER (
             WHERE ec.date_limite < CURRENT_DATE
               AND ec.montant_du_fcfa > ec.montant_paye_fcfa + ec.montant_exonere_fcfa
           )::int AS echeances_depassees
      FROM echeances ec
      JOIN inscriptions i ON i.id = ec.inscription_id AND i.active
      JOIN classes c      ON c.id = i.classe_id
     WHERE i.annee_id = ${annee.id}::uuid
     GROUP BY c.id, c.libelle
     ORDER BY 6 DESC
  `);

  const f3 = feuille(classeur, "Créances par classe", [
    ["Classe", 16],
    ["Élèves", 10],
    ["Dû", 16, MONNAIE],
    ["Encaissé", 16, MONNAIE],
    ["Exonéré", 16, MONNAIE],
    ["Reste à percevoir", 18, MONNAIE],
    ["Échéances dépassées", 20],
  ]);

  let totalDu = 0;
  let totalPaye = 0;
  let totalExonere = 0;
  let totalReste = 0;
  for (const l of creances.rows) {
    totalDu += Number(l.du);
    totalPaye += Number(l.paye);
    totalExonere += Number(l.exonere);
    totalReste += Number(l.reste);
    f3.addRow([
      l.classe,
      Number(l.eleves),
      Number(l.du),
      Number(l.paye),
      Number(l.exonere),
      Number(l.reste),
      Number(l.echeances_depassees),
    ]);
  }
  total(f3, "Total", 3, [totalDu, totalPaye, totalExonere, totalReste]);

  // === 4. Exonérations : la dépense qu'on ne voit pas dans la caisse ========
  const exonerations = await db.execute<Record<string, unknown>>(sql`
    SELECT x.date_accord::text AS date, e.matricule,
           e.nom || ' ' || e.prenom AS eleve, c.libelle AS classe,
           x.nature::text AS nature, x.motif, x.pourcentage, x.montant_fcfa AS montant,
           x.justification
      FROM exonerations x
      JOIN inscriptions i ON i.id = x.inscription_id
      JOIN eleves e       ON e.id = i.eleve_id
      LEFT JOIN classes c ON c.id = i.classe_id
     WHERE i.annee_id = ${annee.id}::uuid
     ORDER BY x.date_accord DESC
  `);

  const f4 = feuille(classeur, "Exonérations", [
    ["Date", 12],
    ["Matricule", 14],
    ["Élève", 26],
    ["Classe", 12],
    ["Nature", 16],
    ["Motif", 22],
    ["Taux", 10],
    ["Montant", 16, MONNAIE],
    ["Justification", 34],
  ]);

  let totalExo = 0;
  for (const l of exonerations.rows) {
    totalExo += Number(l.montant ?? 0);
    f4.addRow([
      l.date,
      l.matricule,
      l.eleve,
      l.classe,
      l.nature,
      l.motif,
      l.pourcentage === null ? "" : `${l.pourcentage} %`,
      Number(l.montant ?? 0),
      l.justification,
    ]);
  }
  total(f4, `Total renoncé — ${exonerations.rows.length} exonération(s)`, 8, [totalExo]);

  const donnees = await classeur.xlsx.writeBuffer();
  const periode = du || au ? `-${du ?? "debut"}-${au ?? "fin"}` : "";

  return new Response(donnees as ArrayBuffer, {
    headers: enTetesClasseur(nomFichier(`export-comptable-${annee.libelle}${periode}`)),
  });
}
