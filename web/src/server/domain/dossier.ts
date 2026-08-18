import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  anneesScolaires,
  changementsClasse,
  classes,
  eleveTuteur,
  eleves,
  historiqueStatuts,
  inscriptions,
  niveaux,
  series,
  tuteurs,
  utilisateurs,
} from "@/server/db/schema";

/**
 * Dossier 360° d'un élève.
 *
 * Une seule fonction charge tout ce qu'affiche la fiche : identité, scolarité
 * de l'année, tuteurs, parcours des années précédentes, historique des statuts
 * et changements de classe.
 *
 * Les requêtes sont lancées en parallèle : sur une connexion tchadienne, six
 * allers-retours séquentiels vers Francfort se voient à l'œil nu.
 */

export interface DossierComplet {
  eleve: typeof eleves.$inferSelect;
  inscription: {
    id: string;
    classeId: string;
    classeLibelle: string;
    niveauLibelle: string;
    serieCode: string | null;
    anneeLibelle: string;
    type: string;
    numeroInscription: string | null;
    statutDossier: string;
    estRedoublant: boolean;
    estBoursier: boolean;
    dateInscription: string;
    observations: string | null;
  } | null;
  tuteurs: Array<{
    id: string;
    nom: string;
    prenom: string;
    lien: string;
    telephone: string;
    telephoneSecondaire: string | null;
    email: string | null;
    profession: string | null;
    adresse: string | null;
    estPrincipal: boolean;
    estTuteurLegal: boolean;
    estResponsableFinancier: boolean;
    estContactUrgence: boolean;
    autoriseRetrait: boolean;
    appActivee: boolean;
    /** Autres enfants du même tuteur scolarisés dans l'établissement. */
    autresEnfants: Array<{ id: string; nom: string; prenom: string; classe: string | null }>;
  }>;
  parcours: Array<{
    anneeLibelle: string;
    classeLibelle: string;
    niveauLibelle: string;
    estRedoublant: boolean;
    active: boolean;
    dateSortie: string | null;
    motifSortie: string | null;
  }>;
  historiqueStatuts: Array<{
    id: string;
    ancienStatut: string | null;
    nouveauStatut: string;
    motif: string;
    dateEffet: string;
    dateFinPrevue: string | null;
    decidePar: string | null;
    creeLe: string;
  }>;
  changementsClasse: Array<{
    id: string;
    origine: string;
    destination: string;
    motif: string;
    dateEffet: string;
  }>;
}

export async function chargerDossierComplet(eleveId: string): Promise<DossierComplet | null> {
  const [eleve] = await db.select().from(eleves).where(eq(eleves.id, eleveId)).limit(1);
  if (!eleve) return null;

  const [lignesInscription, lignesTuteurs, lignesParcours, lignesStatuts, lignesChangements] =
    await Promise.all([
      db
        .select({
          id: inscriptions.id,
          classeId: inscriptions.classeId,
          classeLibelle: classes.libelle,
          niveauLibelle: niveaux.libelle,
          serieCode: series.code,
          anneeLibelle: anneesScolaires.libelle,
          type: inscriptions.type,
          numeroInscription: inscriptions.numeroInscription,
          statutDossier: inscriptions.statutDossier,
          estRedoublant: inscriptions.estRedoublant,
          estBoursier: inscriptions.estBoursier,
          dateInscription: inscriptions.dateInscription,
          observations: inscriptions.observations,
        })
        .from(inscriptions)
        .innerJoin(classes, eq(classes.id, inscriptions.classeId))
        .innerJoin(niveaux, eq(niveaux.id, classes.niveauId))
        .innerJoin(anneesScolaires, eq(anneesScolaires.id, inscriptions.anneeId))
        .leftJoin(series, eq(series.id, classes.serieId))
        .where(eq(inscriptions.eleveId, eleveId))
        .orderBy(desc(anneesScolaires.dateDebut))
        .limit(1),

      db
        .select({
          id: tuteurs.id,
          nom: tuteurs.nom,
          prenom: tuteurs.prenom,
          lien: eleveTuteur.lien,
          telephone: tuteurs.telephone,
          telephoneSecondaire: tuteurs.telephoneSecondaire,
          email: tuteurs.email,
          profession: tuteurs.profession,
          adresse: tuteurs.adresse,
          estPrincipal: eleveTuteur.estPrincipal,
          estTuteurLegal: eleveTuteur.estTuteurLegal,
          estResponsableFinancier: eleveTuteur.estResponsableFinancier,
          estContactUrgence: eleveTuteur.estContactUrgence,
          autoriseRetrait: eleveTuteur.autoriseRetrait,
          appActivee: tuteurs.appActivee,
        })
        .from(eleveTuteur)
        .innerJoin(tuteurs, eq(tuteurs.id, eleveTuteur.tuteurId))
        .where(eq(eleveTuteur.eleveId, eleveId))
        .orderBy(desc(eleveTuteur.estPrincipal)),

      db
        .select({
          anneeLibelle: anneesScolaires.libelle,
          classeLibelle: classes.libelle,
          niveauLibelle: niveaux.libelle,
          estRedoublant: inscriptions.estRedoublant,
          active: inscriptions.active,
          dateSortie: inscriptions.dateSortie,
          motifSortie: inscriptions.motifSortie,
        })
        .from(inscriptions)
        .innerJoin(classes, eq(classes.id, inscriptions.classeId))
        .innerJoin(niveaux, eq(niveaux.id, classes.niveauId))
        .innerJoin(anneesScolaires, eq(anneesScolaires.id, inscriptions.anneeId))
        .where(eq(inscriptions.eleveId, eleveId))
        .orderBy(desc(anneesScolaires.dateDebut)),

      db
        .select({
          id: historiqueStatuts.id,
          ancienStatut: historiqueStatuts.ancienStatut,
          nouveauStatut: historiqueStatuts.nouveauStatut,
          motif: historiqueStatuts.motif,
          dateEffet: historiqueStatuts.dateEffet,
          dateFinPrevue: historiqueStatuts.dateFinPrevue,
          decidePar: utilisateurs.nom,
          creeLe: historiqueStatuts.creeLe,
        })
        .from(historiqueStatuts)
        .leftJoin(utilisateurs, eq(utilisateurs.id, historiqueStatuts.decidePar))
        .where(eq(historiqueStatuts.eleveId, eleveId))
        .orderBy(desc(historiqueStatuts.creeLe)),

      db
        .select({
          id: changementsClasse.id,
          motif: changementsClasse.motif,
          dateEffet: changementsClasse.dateEffet,
          origineId: changementsClasse.classeOrigineId,
          destinationId: changementsClasse.classeDestinationId,
        })
        .from(changementsClasse)
        .innerJoin(inscriptions, eq(inscriptions.id, changementsClasse.inscriptionId))
        .where(eq(inscriptions.eleveId, eleveId))
        .orderBy(desc(changementsClasse.dateEffet)),
    ]);

  // Libellés des classes citées dans les changements, en une requête.
  const idsClasses = [
    ...new Set(lignesChangements.flatMap((c) => [c.origineId, c.destinationId])),
  ];
  const libelles = new Map<string, string>();
  if (idsClasses.length > 0) {
    const lignes = await db.select({ id: classes.id, libelle: classes.libelle }).from(classes);
    for (const l of lignes) libelles.set(l.id, l.libelle);
  }

  // Fratrie : les autres enfants rattachés à chaque tuteur. C'est ce qui
  // permet, côté application parent, de basculer d'un enfant à l'autre.
  const tuteursAvecFratrie = await Promise.all(
    lignesTuteurs.map(async (t) => {
      const fratrie = await db
        .select({
          id: eleves.id,
          nom: eleves.nom,
          prenom: eleves.prenom,
          classe: classes.libelle,
        })
        .from(eleveTuteur)
        .innerJoin(eleves, eq(eleves.id, eleveTuteur.eleveId))
        .leftJoin(inscriptions, eq(inscriptions.eleveId, eleves.id))
        .leftJoin(classes, eq(classes.id, inscriptions.classeId))
        .where(eq(eleveTuteur.tuteurId, t.id));

      return {
        ...t,
        autresEnfants: fratrie.filter((f) => f.id !== eleveId),
      };
    }),
  );

  return {
    eleve,
    inscription: lignesInscription[0] ?? null,
    tuteurs: tuteursAvecFratrie,
    parcours: lignesParcours,
    historiqueStatuts: lignesStatuts,
    changementsClasse: lignesChangements.map((c) => ({
      id: c.id,
      origine: libelles.get(c.origineId) ?? "—",
      destination: libelles.get(c.destinationId) ?? "—",
      motif: c.motif,
      dateEffet: c.dateEffet,
    })),
  };
}
