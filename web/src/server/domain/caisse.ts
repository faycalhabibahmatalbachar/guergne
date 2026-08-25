import "server-only";

import { sql } from "drizzle-orm";

import { db } from "./../db";

/**
 * Journal de caisse (E-57), exonérations (E-59), retenue de bulletin (E-58).
 *
 * LE JOURNAL DE CAISSE N'EST PAS UN EXPORT COMPTABLE EN PLUS PETIT
 * -----------------------------------------------------------------
 * L'export comptable (E-18) sert à rapprocher un trimestre entier, une fois.
 * Le journal sert le soir même, à une seule question : combien dois-je avoir
 * dans le tiroir. C'est pourquoi il isole les ESPÈCES du reste — le mobile
 * money et les virements n'entrent jamais dans la caisse physique, et les
 * additionner donnerait un total qu'aucun comptage de billets ne retrouvera.
 */

export interface LigneCaisse {
  id: string;
  numeroRecu: string;
  heure: string;
  eleve: string;
  matricule: string;
  classe: string;
  montant: number;
  mode: string;
  reference: string | null;
  payeur: string | null;
  encaissePar: string | null;
  annule: boolean;
  /** Vrai si cette ligne EST une écriture d'annulation (montant négatif). */
  estAnnulation: boolean;
  motifAnnulation: string | null;
}

export interface JournalCaisse {
  date: string;
  lignes: LigneCaisse[];
  /** Totaux par mode, annulations comprises — donc nets. */
  parMode: Array<{ mode: string; nombre: number; total: number }>;
  totalNet: number;
  /** Ce qui doit se trouver physiquement dans le tiroir. */
  especesNet: number;
  nbAnnulations: number;
}

const LIBELLE_MODE: Record<string, string> = {
  ESPECES: "Espèces",
  MOBILE_MONEY: "Mobile Money",
  VIREMENT: "Virement",
  CHEQUE: "Chèque",
  AUTRE: "Autre",
};

export function libelleMode(mode: string): string {
  return LIBELLE_MODE[mode] ?? mode;
}

export async function journalDeCaisse(date: string): Promise<JournalCaisse> {
  const r = await db.execute<{
    id: string;
    numero_recu: string;
    heure: string;
    eleve: string;
    matricule: string;
    classe: string;
    montant: number;
    mode: string;
    reference: string | null;
    payeur: string | null;
    encaisse_par: string | null;
    annule: boolean;
    est_annulation: boolean;
    motif_annulation: string | null;
  }>(sql`
    SELECT p.id,
           p.numero_recu,
           to_char(p.cree_le, 'HH24:MI') AS heure,
           e.nom || ' ' || e.prenom AS eleve,
           e.matricule,
           c.libelle AS classe,
           p.montant_fcfa AS montant,
           p.mode::text AS mode,
           p.reference_externe AS reference,
           COALESCE(p.nom_payeur, t.prenom || ' ' || t.nom) AS payeur,
           u.prenom || ' ' || u.nom AS encaisse_par,
           p.annule,
           p.annule_paiement_id IS NOT NULL AS est_annulation,
           p.motif_annulation
      FROM paiements p
      JOIN inscriptions i ON i.id = p.inscription_id
      JOIN eleves e       ON e.id = i.eleve_id
      JOIN classes c      ON c.id = i.classe_id
      LEFT JOIN tuteurs t      ON t.id = p.paye_par_tuteur_id
      LEFT JOIN utilisateurs u ON u.id = p.encaisse_par
     WHERE p.date_paiement = ${date}::date
     ORDER BY p.cree_le
  `);

  const lignes: LigneCaisse[] = r.rows.map((x) => ({
    id: x.id,
    numeroRecu: x.numero_recu,
    heure: x.heure,
    eleve: x.eleve,
    matricule: x.matricule,
    classe: x.classe,
    montant: Number(x.montant),
    mode: x.mode,
    reference: x.reference,
    payeur: x.payeur,
    encaissePar: x.encaisse_par,
    annule: x.annule,
    estAnnulation: x.est_annulation,
    motifAnnulation: x.motif_annulation,
  }));

  // Les écritures d'annulation portent un montant NÉGATIF et restent dans le
  // journal : une caisse dont on efface les erreurs n'est plus vérifiable.
  // Elles entrent donc dans les totaux, qui sont nets par construction.
  const parMode = new Map<string, { nombre: number; total: number }>();
  for (const l of lignes) {
    const e = parMode.get(l.mode) ?? { nombre: 0, total: 0 };
    e.nombre += 1;
    e.total += l.montant;
    parMode.set(l.mode, e);
  }

  return {
    date,
    lignes,
    parMode: [...parMode.entries()]
      .map(([mode, v]) => ({ mode, ...v }))
      .sort((a, b) => b.total - a.total),
    totalNet: lignes.reduce((t, l) => t + l.montant, 0),
    especesNet: lignes.filter((l) => l.mode === "ESPECES").reduce((t, l) => t + l.montant, 0),
    nbAnnulations: lignes.filter((l) => l.estAnnulation).length,
  };
}

// ===========================================================================
// Exonérations (E-59)
// ===========================================================================

/**
 * Historique des exonérations.
 *
 * ELLES POUVAIENT ÊTRE ACCORDÉES, PAS RELUES
 * -------------------------------------------
 * `exonerer()` écrivait dans la table ; aucun écran ne la lisait. Une remise
 * consentie disparaissait donc de la vue dès la page rechargée, et le seul
 * moyen de savoir qui était exonéré était d'exporter le classeur comptable.
 *
 * C'est le poste le plus sensible de la comptabilité d'un établissement privé :
 * de l'argent auquel on renonce, décidé au cas par cas. Il doit se relire
 * facilement, avec le nom de qui a accordé — c'est la seule chose qui distingue
 * une politique sociale d'une faveur.
 */

export interface LigneExoneration {
  id: string;
  eleve: string;
  matricule: string;
  eleveId: string;
  classe: string;
  motif: string;
  justification: string;
  nature: string | null;
  pourcentage: number | null;
  montantFcfa: number | null;
  /** Montant réellement renoncé, pourcentages convertis. */
  montantEffectif: number;
  accordePar: string | null;
  dateAccord: string;
}

export async function historiqueExonerations(
  anneeId: string,
  filtres: { classeId?: string; motif?: string } = {},
): Promise<{ lignes: LigneExoneration[]; total: number; parMotif: Array<{ motif: string; nombre: number; total: number }> }> {
  const r = await db.execute<{
    id: string;
    eleve: string;
    matricule: string;
    eleve_id: string;
    classe: string;
    motif: string;
    justification: string;
    nature: string | null;
    pourcentage: string | null;
    montant_fcfa: number | null;
    montant_effectif: number;
    accorde_par: string | null;
    date_accord: string;
  }>(sql`
    SELECT x.id,
           e.nom || ' ' || e.prenom AS eleve,
           e.matricule,
           e.id AS eleve_id,
           c.libelle AS classe,
           x.motif::text,
           x.justification,
           x.nature::text AS nature,
           x.pourcentage::text AS pourcentage,
           x.montant_fcfa,
           -- Un pourcentage ne dit rien tant qu'on ne l'a pas appliqué au dû
           -- de l'élève. C'est ce montant-là, et non « 50 % », qui manque en
           -- caisse à la fin de l'année.
           COALESCE(
             x.montant_fcfa,
             ROUND(COALESCE((
               SELECT SUM(ec.montant_du_fcfa)
                 FROM echeances ec
                WHERE ec.inscription_id = x.inscription_id
                  AND (x.nature IS NULL OR ec.nature = x.nature)
             ), 0) * x.pourcentage / 100)
           )::int AS montant_effectif,
           u.prenom || ' ' || u.nom AS accorde_par,
           x.date_accord::text AS date_accord
      FROM exonerations x
      JOIN inscriptions i ON i.id = x.inscription_id
      JOIN eleves e       ON e.id = i.eleve_id
      JOIN classes c      ON c.id = i.classe_id
      LEFT JOIN utilisateurs u ON u.id = x.accorde_par
     WHERE i.annee_id = ${anneeId}::uuid
       AND (${filtres.classeId ?? null}::uuid IS NULL OR i.classe_id = ${filtres.classeId ?? null}::uuid)
       AND (${filtres.motif ?? null}::text IS NULL OR x.motif::text = ${filtres.motif ?? null}::text)
     ORDER BY x.date_accord DESC, e.nom
     LIMIT 500
  `);

  const lignes: LigneExoneration[] = r.rows.map((x) => ({
    id: x.id,
    eleve: x.eleve,
    matricule: x.matricule,
    eleveId: x.eleve_id,
    classe: x.classe,
    motif: x.motif,
    justification: x.justification,
    nature: x.nature,
    pourcentage: x.pourcentage === null ? null : Number(x.pourcentage),
    montantFcfa: x.montant_fcfa === null ? null : Number(x.montant_fcfa),
    montantEffectif: Number(x.montant_effectif),
    accordePar: x.accorde_par,
    dateAccord: x.date_accord,
  }));

  const parMotif = new Map<string, { nombre: number; total: number }>();
  for (const l of lignes) {
    const e = parMotif.get(l.motif) ?? { nombre: 0, total: 0 };
    e.nombre += 1;
    e.total += l.montantEffectif;
    parMotif.set(l.motif, e);
  }

  return {
    lignes,
    total: lignes.reduce((t, l) => t + l.montantEffectif, 0),
    parMotif: [...parMotif.entries()]
      .map(([motif, v]) => ({ motif, ...v }))
      .sort((a, b) => b.total - a.total),
  };
}

// ===========================================================================
// Retenue du bulletin pour impayé (E-58)
// ===========================================================================

export interface ReglageBlocage {
  actif: boolean;
  seuilFcfa: number;
}

export async function reglageBlocage(): Promise<ReglageBlocage> {
  const r = await db.execute<{ cle: string; valeur: string }>(sql`
    SELECT cle, valeur FROM parametres
     WHERE cle IN ('bulletin_blocage_impaye', 'bulletin_blocage_seuil_fcfa')
  `);
  const p = Object.fromEntries(r.rows.map((x) => [x.cle, x.valeur]));
  return {
    actif: p.bulletin_blocage_impaye === "oui",
    seuilFcfa: Number(p.bulletin_blocage_seuil_fcfa ?? 0) || 0,
  };
}

export interface BlocageEleve {
  inscriptionId: string;
  eleve: string;
  matricule: string;
  resteDu: number;
  echeancesEnRetard: number;
  /** Retenu au moment où l'on regarde, levée comprise. */
  retenu: boolean;
  leveePar: string | null;
  motifLevee: string | null;
  dejaPublie: boolean;
}

/**
 * Qui serait retenu si l'on publiait maintenant.
 *
 * Affiché AVANT le bouton de publication, comme les saisies manquantes (E-45).
 * Le secrétariat doit savoir quelles familles ne recevront rien, et pourquoi,
 * avant de cliquer — pas en lisant le compte-rendu après coup.
 *
 * La liste sort même quand le réglage est inactif : elle indique alors
 * simplement qui doit de l'argent, ce qui reste l'information utile au moment
 * de remettre les bulletins en main propre.
 */
export async function blocagesBulletin(
  classeId: string,
  periodeId: string,
  reglage: ReglageBlocage,
): Promise<BlocageEleve[]> {
  const r = await db.execute<{
    inscription_id: string;
    eleve: string;
    matricule: string;
    reste_du: string | null;
    en_retard: number | null;
    levee_par: string | null;
    motif_levee: string | null;
    deja_publie: boolean;
  }>(sql`
    SELECT i.id AS inscription_id,
           e.nom || ' ' || e.prenom AS eleve,
           e.matricule,
           s.reste_du_fcfa::text AS reste_du,
           s.nb_echeances_en_retard AS en_retard,
           u.prenom || ' ' || u.nom AS levee_par,
           b.motif_levee,
           COALESCE(b.est_publie, FALSE) AS deja_publie
      FROM inscriptions i
      JOIN eleves e ON e.id = i.eleve_id
      LEFT JOIN v_situation_financiere s ON s.inscription_id = i.id
      LEFT JOIN bulletins b ON b.inscription_id = i.id AND b.periode_id = ${periodeId}::uuid
      LEFT JOIN utilisateurs u ON u.id = b.blocage_leve_par
     WHERE i.classe_id = ${classeId}::uuid
       AND i.active
       AND COALESCE(s.reste_du_fcfa, 0) > ${reglage.seuilFcfa}
     ORDER BY s.reste_du_fcfa DESC NULLS LAST, e.nom
  `);

  return r.rows.map((x) => ({
    inscriptionId: x.inscription_id,
    eleve: x.eleve,
    matricule: x.matricule,
    resteDu: Number(x.reste_du ?? 0),
    echeancesEnRetard: Number(x.en_retard ?? 0),
    // Un bulletin déjà publié n'est jamais repris : un document remis est
    // remis. Le faire disparaître d'une application se lirait comme une panne,
    // pas comme une sanction.
    retenu: reglage.actif && !x.levee_par && !x.deja_publie,
    leveePar: x.levee_par,
    motifLevee: x.motif_levee,
    dejaPublie: x.deja_publie,
  }));
}
