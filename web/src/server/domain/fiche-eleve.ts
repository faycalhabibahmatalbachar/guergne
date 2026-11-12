import "server-only";

import { sql } from "drizzle-orm";

import type { Principal } from "@/server/auth/session";
import { db } from "@/server/db";
import { peut } from "@/server/guard";

import { chargerDossierComplet, type DossierComplet } from "./dossier";
import { chargerDossierScolarite, type DossierScolarite } from "./dossier-eleve";
import { chargerStatistiques } from "./tableau-de-bord";

/**
 * La fiche complète d'un élève, telle que l'agent la lit à la direction.
 *
 * UNE SEULE SOURCE : LA PAGE DE RÉFÉRENCE
 * ----------------------------------------
 * `/dashboard/eleves/[id]` se construit sur `chargerDossierComplet` et
 * `chargerDossierScolarite`. Cette fiche emploie EXACTEMENT les mêmes
 * chargeurs, avec la même période (celle de `chargerStatistiques`) : ce que
 * l'agent dit et ce que l'écran montre ne peuvent pas diverger.
 *
 * LES MÊMES DROITS QUE LA PAGE, SECTION PAR SECTION
 * --------------------------------------------------
 * Avoir `eleve:lire` ouvre l'identité et la scolarité ; cela n'ouvre ni les
 * notes, ni les finances, ni la santé. Chaque section est donc filtrée par
 * `peut(acteur, …, { eleveId, classeId })`, comme sur la page, et la fiche
 * NOMME ce qu'elle a masqué — une section absente ne doit jamais se lire comme
 * « rien à signaler ».
 */

/** Rôles qui voient la santé (groupe sanguin, allergies, observations) — même liste que la page. */
const ROLES_SANTE = ["SUPER_ADMIN", "DIRECTION", "CENSEUR", "SURVEILLANT"] as const;

export interface FicheEleve {
  identite: Omit<DossierComplet["eleve"], "groupeSanguin" | "allergies" | "observationsMedicales"> & {
    age: number | null;
    sante?: { groupeSanguin: string | null; allergies: string | null; observationsMedicales: string | null };
  };
  /**
   * La DERNIÈRE inscription, active ou non (c'est la règle du chargeur
   * partagé), complétée de ce qui dit si elle est close. Sans `active`, un
   * élève transféré se lisait « inscrit en 3e A ».
   */
  inscription:
    | (NonNullable<DossierComplet["inscription"]> & {
        active: boolean;
        dateSortie: string | null;
        motifSortie: string | null;
        etablissementDestination: string | null;
      })
    | null;
  tuteurs: DossierComplet["tuteurs"];
  parcours: DossierComplet["parcours"];
  scolarite: (Partial<DossierScolarite> & { periodeReleve: string | null }) | null;
  pieces: Array<{ type: string; libelle: string; deposeLe: string }> | null;
  historique: {
    statuts: DossierComplet["historiqueStatuts"];
    changementsClasse: DossierComplet["changementsClasse"];
    journal: Array<{ le: string; action: string; acteur: string | null; role: string | null }> | null;
  };
  /** Sections retirées faute de droit : à DIRE, pas à taire. */
  masquees: string[];
}

function ageAu(dateNaissance: string | null | undefined, ref = new Date()): number | null {
  if (!dateNaissance) return null;
  const n = new Date(`${String(dateNaissance).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(n.getTime())) return null;
  let age = ref.getUTCFullYear() - n.getUTCFullYear();
  const pasEncore =
    ref.getUTCMonth() < n.getUTCMonth() || (ref.getUTCMonth() === n.getUTCMonth() && ref.getUTCDate() < n.getUTCDate());
  if (pasEncore) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

export async function chargerFicheEleve(eleveId: string, acteur: Principal): Promise<FicheEleve | null> {
  const dossier = await chargerDossierComplet(eleveId);
  if (!dossier) return null;
  const inscription = dossier.inscription;
  const perimetre = { eleveId, classeId: inscription?.classeId };

  const [voitFinances, voitNotes, voitAssiduite, voitDiscipline, voitJournal] = await Promise.all([
    peut(acteur, "finance:lire", perimetre),
    peut(acteur, "note:lire", perimetre),
    peut(acteur, "assiduite:lire", perimetre),
    peut(acteur, "discipline:lire", perimetre),
    peut(acteur, "audit:lire", perimetre),
  ]);
  const voitSante = (ROLES_SANTE as readonly string[]).includes(acteur.role);

  const masquees: string[] = [];
  if (!voitNotes) masquees.push("notes");
  if (!voitAssiduite) masquees.push("assiduité");
  if (!voitDiscipline) masquees.push("discipline");
  if (!voitFinances) masquees.push("finances");
  if (!voitSante) masquees.push("santé");
  if (!voitJournal) masquees.push("journal des modifications");

  const { periode } = await chargerStatistiques();
  const [scolarite, pieces, journal, sortie] = await Promise.all([
    inscription && (voitNotes || voitAssiduite || voitDiscipline || voitFinances)
      ? chargerDossierScolarite(inscription.id, periode?.id ?? null, {
          notes: voitNotes,
          assiduite: voitAssiduite,
          discipline: voitDiscipline,
          finances: voitFinances,
        })
      : Promise.resolve(null),
    // L'URL du fichier n'est jamais rendue : la fiche dit QUELLES pièces
    // existent, elle ne les distribue pas.
    db.execute<{ type: string; libelle: string; depose_le: string }>(sql`
      SELECT type::text AS type, libelle, cree_le::text AS depose_le
        FROM pieces_dossier WHERE eleve_id = ${eleveId}::uuid
       ORDER BY cree_le DESC LIMIT 30
    `),
    voitJournal
      ? db.execute<{ le: string; action: string; acteur: string | null; role: string | null }>(sql`
          SELECT cree_le::text AS le, action, nom_acteur AS acteur, role_acteur::text AS role
            FROM journal_audit WHERE eleve_id = ${eleveId}::uuid
           ORDER BY cree_le DESC LIMIT 20
        `)
      : Promise.resolve(null),
    inscription
      ? db.execute<{ active: boolean; date_sortie: string | null; motif_sortie: string | null; destination: string | null }>(sql`
          SELECT active, date_sortie::text AS date_sortie, motif_sortie,
                 etablissement_destination AS destination
            FROM inscriptions WHERE id = ${inscription.id}::uuid
        `)
      : Promise.resolve(null),
  ]);
  const s = sortie?.rows[0];

  const { groupeSanguin, allergies, observationsMedicales, ...identite } = dossier.eleve;
  return {
    identite: {
      ...identite,
      age: ageAu(dossier.eleve.dateNaissance),
      ...(voitSante ? { sante: { groupeSanguin, allergies, observationsMedicales } } : {}),
    },
    inscription: inscription
      ? {
          ...inscription,
          active: s?.active ?? false,
          dateSortie: s?.date_sortie ?? null,
          motifSortie: s?.motif_sortie ?? null,
          etablissementDestination: s?.destination ?? null,
        }
      : null,
    tuteurs: dossier.tuteurs,
    parcours: dossier.parcours,
    scolarite: scolarite
      ? {
          periodeReleve: scolarite.periodeReleve,
          ...(voitNotes ? { releve: scolarite.releve, evolution: scolarite.evolution } : {}),
          ...(voitAssiduite ? { assiduite: scolarite.assiduite } : {}),
          ...(voitDiscipline ? { discipline: scolarite.discipline } : {}),
          ...(voitFinances ? { echeances: scolarite.echeances, paiements: scolarite.paiements } : {}),
        }
      : null,
    pieces: pieces.rows.map((p) => ({ type: p.type, libelle: p.libelle, deposeLe: p.depose_le })),
    historique: {
      statuts: dossier.historiqueStatuts,
      changementsClasse: dossier.changementsClasse,
      journal: journal ? journal.rows : null,
    },
    masquees,
  };
}
