import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  classes,
  echeances,
  eleves,
  grillesTarifaires,
  inscriptions,
  niveaux,
  paiements,
  tranches,
} from "@/server/db/schema";

/** Lectures du module Finances. Toutes les sommes sont des entiers en FCFA. */

// Le formatage vit dans `@/lib/finances-format` : il est aussi utilisé par des
// composants client, qui ne peuvent pas importer un module `server-only`.
export { formaterFcfa } from "@/lib/finances-format";

// ---------------------------------------------------------------------------
// Grille tarifaire
// ---------------------------------------------------------------------------

export interface LigneTarif {
  id: string;
  niveauId: string;
  niveauLibelle: string;
  niveauOrdre: number;
  nature: string;
  libelle: string;
  montantFcfa: number;
  obligatoire: boolean;
  applicableNouveaux: boolean;
  applicableAnciens: boolean;
}

export async function listerTarifs(anneeId: string): Promise<LigneTarif[]> {
  const lignes = await db
    .select({
      id: grillesTarifaires.id,
      niveauId: grillesTarifaires.niveauId,
      niveauLibelle: niveaux.libelle,
      niveauOrdre: niveaux.ordre,
      nature: grillesTarifaires.nature,
      libelle: grillesTarifaires.libelle,
      montantFcfa: grillesTarifaires.montantFcfa,
      obligatoire: grillesTarifaires.obligatoire,
      applicableNouveaux: grillesTarifaires.applicableNouveaux,
      applicableAnciens: grillesTarifaires.applicableAnciens,
    })
    .from(grillesTarifaires)
    .innerJoin(niveaux, eq(niveaux.id, grillesTarifaires.niveauId))
    .where(eq(grillesTarifaires.anneeId, anneeId))
    .orderBy(asc(niveaux.ordre), asc(grillesTarifaires.nature));

  return lignes.map((l) => ({ ...l, montantFcfa: Number(l.montantFcfa) }));
}

export interface LigneTranche {
  id: string;
  numero: number;
  libelle: string;
  dateLimite: string;
  pourcentage: string;
}

export async function listerTranches(anneeId: string): Promise<LigneTranche[]> {
  return db
    .select({
      id: tranches.id,
      numero: tranches.numero,
      libelle: tranches.libelle,
      dateLimite: tranches.dateLimite,
      pourcentage: tranches.pourcentage,
    })
    .from(tranches)
    .where(eq(tranches.anneeId, anneeId))
    .orderBy(asc(tranches.numero));
}

// ---------------------------------------------------------------------------
// Situation des élèves
// ---------------------------------------------------------------------------

export interface SituationEleve {
  inscriptionId: string;
  eleveId: string;
  matricule: string;
  nom: string;
  prenom: string;
  classe: string;
  estBoursier: boolean;
  totalDu: number;
  totalPaye: number;
  totalExonere: number;
  resteDu: number;
  nbEnRetard: number;
  prochaineEcheance: string | null;
}

export async function listerSituations(filtres: {
  anneeId: string;
  classeId?: string;
  seulementImpayes?: boolean;
}): Promise<SituationEleve[]> {
  const lignes = await db.execute<SituationEleve & Record<string, unknown>>(sql`
    SELECT i.id AS "inscriptionId", e.id AS "eleveId", e.matricule, e.nom, e.prenom,
           c.libelle AS classe, i.est_boursier AS "estBoursier",
           COALESCE(s.total_du_fcfa, 0)       AS "totalDu",
           COALESCE(s.total_paye_fcfa, 0)     AS "totalPaye",
           COALESCE(s.total_exonere_fcfa, 0)  AS "totalExonere",
           COALESCE(s.reste_du_fcfa, 0)       AS "resteDu",
           COALESCE(s.nb_echeances_en_retard, 0) AS "nbEnRetard",
           s.prochaine_echeance               AS "prochaineEcheance"
      FROM inscriptions i
      JOIN eleves e  ON e.id = i.eleve_id
      JOIN classes c ON c.id = i.classe_id
      LEFT JOIN v_situation_financiere s ON s.inscription_id = i.id
     WHERE i.active
       AND i.annee_id = ${filtres.anneeId}::uuid
       AND (${filtres.classeId ?? null}::uuid IS NULL OR i.classe_id = ${filtres.classeId ?? null}::uuid)
       AND (${filtres.seulementImpayes ?? false} = FALSE OR COALESCE(s.reste_du_fcfa, 0) > 0)
     ORDER BY COALESCE(s.reste_du_fcfa, 0) DESC, e.nom, e.prenom
     LIMIT 200
  `);

  return lignes.rows.map((l) => ({
    ...l,
    totalDu: Number(l.totalDu),
    totalPaye: Number(l.totalPaye),
    totalExonere: Number(l.totalExonere),
    resteDu: Number(l.resteDu),
    nbEnRetard: Number(l.nbEnRetard),
  }));
}

export interface EcheanceEleve {
  id: string;
  nature: string;
  libelle: string;
  montantDu: number;
  montantPaye: number;
  montantExonere: number;
  dateLimite: string;
  statut: string;
}

export async function listerEcheances(inscriptionId: string): Promise<EcheanceEleve[]> {
  const lignes = await db
    .select({
      id: echeances.id,
      nature: echeances.nature,
      libelle: echeances.libelle,
      montantDu: echeances.montantDuFcfa,
      montantPaye: echeances.montantPayeFcfa,
      montantExonere: echeances.montantExonereFcfa,
      dateLimite: echeances.dateLimite,
      statut: echeances.statut,
    })
    .from(echeances)
    .where(eq(echeances.inscriptionId, inscriptionId))
    .orderBy(asc(echeances.dateLimite));

  return lignes.map((l) => ({
    ...l,
    montantDu: Number(l.montantDu),
    montantPaye: Number(l.montantPaye),
    montantExonere: Number(l.montantExonere),
  }));
}

export interface LignePaiement {
  id: string;
  numeroRecu: string;
  montantFcfa: number;
  mode: string;
  referenceExterne: string | null;
  datePaiement: string;
  nomPayeur: string | null;
  annule: boolean;
  eleveNom: string;
  elevePrenom: string;
  matricule: string;
  classe: string;
}

export async function listerPaiements(filtres: {
  anneeId: string;
  inscriptionId?: string;
  limite?: number;
}): Promise<LignePaiement[]> {
  const conditions = [eq(inscriptions.anneeId, filtres.anneeId)];
  if (filtres.inscriptionId) conditions.push(eq(paiements.inscriptionId, filtres.inscriptionId));

  const lignes = await db
    .select({
      id: paiements.id,
      numeroRecu: paiements.numeroRecu,
      montantFcfa: paiements.montantFcfa,
      mode: paiements.mode,
      referenceExterne: paiements.referenceExterne,
      datePaiement: paiements.datePaiement,
      nomPayeur: paiements.nomPayeur,
      annule: paiements.annule,
      eleveNom: eleves.nom,
      elevePrenom: eleves.prenom,
      matricule: eleves.matricule,
      classe: classes.libelle,
    })
    .from(paiements)
    .innerJoin(inscriptions, eq(inscriptions.id, paiements.inscriptionId))
    .innerJoin(eleves, eq(eleves.id, inscriptions.eleveId))
    .innerJoin(classes, eq(classes.id, inscriptions.classeId))
    .where(and(...conditions))
    .orderBy(desc(paiements.datePaiement), desc(paiements.creeLe))
    .limit(filtres.limite ?? 100);

  return lignes.map((l) => ({ ...l, montantFcfa: Number(l.montantFcfa) }));
}

// ---------------------------------------------------------------------------
// Pilotage
// ---------------------------------------------------------------------------

export async function statistiquesFinancieres(anneeId: string) {
  const r = await db.execute<Record<string, unknown>>(sql`
    SELECT
      COALESCE(SUM(e.montant_du_fcfa), 0)       AS total_du,
      COALESCE(SUM(e.montant_paye_fcfa), 0)     AS total_paye,
      COALESCE(SUM(e.montant_exonere_fcfa), 0)  AS total_exonere,
      COALESCE(SUM(e.montant_du_fcfa - e.montant_paye_fcfa - e.montant_exonere_fcfa), 0)
                                                AS reste_du,
      count(*) FILTER (WHERE e.statut = 'EN_RETARD')  AS nb_en_retard,
      (SELECT COALESCE(SUM(p.montant_fcfa), 0) FROM paiements p
         JOIN inscriptions i2 ON i2.id = p.inscription_id
        WHERE i2.annee_id = ${anneeId}::uuid
          AND p.date_paiement >= date_trunc('month', CURRENT_DATE)) AS encaisse_mois
      FROM echeances e
      JOIN inscriptions i ON i.id = e.inscription_id
     WHERE i.annee_id = ${anneeId}::uuid AND i.active
  `);

  const l = r.rows[0] ?? {};
  const totalDu = Number(l.total_du ?? 0);
  const totalPaye = Number(l.total_paye ?? 0);
  const totalExonere = Number(l.total_exonere ?? 0);

  return {
    totalDu,
    totalPaye,
    totalExonere,
    resteDu: Number(l.reste_du ?? 0),
    nbEnRetard: Number(l.nb_en_retard ?? 0),
    encaisseMois: Number(l.encaisse_mois ?? 0),
    // Le taux se calcule sur le dû net d'exonérations : une bourse n'est pas
    // un impayé, l'inclure ferait chuter artificiellement le recouvrement.
    tauxRecouvrement:
      totalDu - totalExonere > 0
        ? Math.round((totalPaye / (totalDu - totalExonere)) * 100)
        : 0,
  };
}

export async function recouvrementParClasse(anneeId: string) {
  const r = await db.execute<Record<string, unknown>>(sql`
    SELECT classe_id AS "classeId", classe, effectif,
           total_du_fcfa AS "totalDu", total_paye_fcfa AS "totalPaye",
           reste_du_fcfa AS "resteDu", nb_eleves_en_retard AS "nbEnRetard"
      FROM v_recouvrement_classe
     WHERE annee_id = ${anneeId}::uuid
     ORDER BY reste_du_fcfa DESC
  `);

  return r.rows.map((l) => ({
    classeId: String(l.classeId),
    classe: String(l.classe),
    effectif: Number(l.effectif),
    totalDu: Number(l.totalDu),
    totalPaye: Number(l.totalPaye),
    resteDu: Number(l.resteDu),
    nbEnRetard: Number(l.nbEnRetard),
  }));
}
