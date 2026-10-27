import "server-only";

import { and, count, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  annonces,
  classes,
  eleves,
  eleveTuteur,
  inscriptions,
  messages,
  niveaux,
  notifications,
  tuteurs,
  utilisateurs,
} from "@/server/db/schema";

import { COUT_SMS_FCFA } from "@/lib/tarifs";
import { segmentsSms, signatureSms } from "@/server/notifications/sms";

/** Lectures du module Communication. */

export interface LigneAnnonce {
  id: string;
  titre: string;
  contenu: string;
  cible: string;
  niveauLibelle: string | null;
  classeLibelle: string | null;
  epinglee: boolean;
  publiee: boolean;
  envoyerPush: boolean;
  publierLe: string;
  expireLe: string | null;
  auteur: string | null;
  nbLectures: number;
  nbNotifications: number;
}

export async function listerAnnonces(anneeId: string): Promise<LigneAnnonce[]> {
  const lignes = await db
    .select({
      id: annonces.id,
      titre: annonces.titre,
      contenu: annonces.contenu,
      cible: annonces.cible,
      niveauLibelle: niveaux.libelle,
      classeLibelle: classes.libelle,
      epinglee: annonces.epinglee,
      publiee: annonces.publiee,
      envoyerPush: annonces.envoyerPush,
      publierLe: annonces.publierLe,
      expireLe: annonces.expireLe,
      auteur: sql<string | null>`utilisateurs.prenom || ' ' || utilisateurs.nom`,
      nbLectures: sql<number>`(SELECT count(*) FROM lectures_annonces la WHERE la.annonce_id = annonces.id)`,
      nbNotifications: sql<number>`(
        SELECT count(*) FROM notifications n
         WHERE n.donnees ->> 'annonce_id' = annonces.id::text)`,
    })
    .from(annonces)
    .leftJoin(niveaux, eq(niveaux.id, annonces.niveauId))
    .leftJoin(classes, eq(classes.id, annonces.classeId))
    .leftJoin(utilisateurs, eq(utilisateurs.id, annonces.publieePar))
    .where(eq(annonces.anneeId, anneeId))
    .orderBy(desc(annonces.epinglee), desc(annonces.publierLe))
    .limit(100);

  return lignes.map((l) => ({
    ...l,
    nbLectures: Number(l.nbLectures),
    nbNotifications: Number(l.nbNotifications),
  }));
}

export interface LigneMessage {
  id: string;
  objet: string;
  contenu: string;
  lu: boolean;
  creeLe: string;
  expediteur: string | null;
  destinataire: string | null;
  eleveNom: string | null;
  elevePrenom: string | null;
  eleveId: string | null;
}

export async function listerMessages(utilisateurId: string): Promise<LigneMessage[]> {
  const lignes = await db
    .select({
      id: messages.id,
      objet: messages.objet,
      contenu: messages.contenu,
      lu: messages.lu,
      creeLe: messages.creeLe,
      expediteur: sql<string | null>`(
        SELECT u.prenom || ' ' || u.nom FROM utilisateurs u WHERE u.id = messages.expediteur_id)`,
      destinataire: sql<string | null>`(
        SELECT u.prenom || ' ' || u.nom FROM utilisateurs u WHERE u.id = messages.destinataire_id)`,
      eleveNom: eleves.nom,
      elevePrenom: eleves.prenom,
      eleveId: eleves.id,
    })
    .from(messages)
    .leftJoin(eleves, eq(eleves.id, messages.eleveId))
    .where(
      sql`${messages.destinataireId} = ${utilisateurId}::uuid OR ${messages.expediteurId} = ${utilisateurId}::uuid`,
    )
    .orderBy(desc(messages.creeLe))
    .limit(100);

  return lignes;
}

export interface EtatFile {
  enAttente: number;
  envoyees: number;
  echouees: number;
  pushEnAttente: number;
  smsEnAttente: number;
  smsSegmentsEstimes: number;
  coutSmsEstime: number;
  parCanal: Array<{
    canal: "PUSH" | "SMS";
    enAttente: number;
    envoyees: number;
    echouees: number;
  }>;
}
/** L’estimation tient compte de l’alphabet et du nombre de segments SMS. */
export async function etatFileNotifications(): Promise<EtatFile> {
  // La boîte interne (IN_APP) n'est pas une ligne à expédier par push/SMS.
  const [statuts, smsLignes] = await Promise.all([
    db.execute<Record<string, unknown> & { canal: string; statut: string; total: number }>(sql`
      SELECT canal::text, statut::text, count(*)::int AS total
        FROM notifications
       WHERE canal IN ('PUSH'::canal_notification, 'SMS'::canal_notification)
       GROUP BY canal, statut
    `),
    db.select({ titre: notifications.titre, corps: notifications.corps })
      .from(notifications)
      .where(and(
        eq(notifications.statut, "EN_ATTENTE"),
        eq(notifications.canal, "SMS"),
      )),
  ]);

  const parCanal = (["PUSH", "SMS"] as const).map((canal) => {
    const compter = (statut: string) => Number(
      statuts.rows.find((ligne) => ligne.canal === canal && ligne.statut === statut)?.total ?? 0,
    );
    return {
      canal,
      enAttente: compter("EN_ATTENTE"),
      envoyees: compter("ENVOYE"),
      echouees: compter("ECHOUE"),
    };
  });
  const signature = signatureSms();
  const smsSegmentsEstimes = smsLignes.reduce((total, ligne) => {
    const texte = ligne.titre + "\n" + ligne.corps;
    return total + segmentsSms(texte.startsWith(signature) ? texte : signature + texte);
  }, 0);

  return {
    enAttente: parCanal.reduce((total, ligne) => total + ligne.enAttente, 0),
    envoyees: parCanal.reduce((total, ligne) => total + ligne.envoyees, 0),
    echouees: parCanal.reduce((total, ligne) => total + ligne.echouees, 0),
    pushEnAttente: parCanal.find((ligne) => ligne.canal === "PUSH")?.enAttente ?? 0,
    smsEnAttente: parCanal.find((ligne) => ligne.canal === "SMS")?.enAttente ?? 0,
    smsSegmentsEstimes,
    coutSmsEstime: smsSegmentsEstimes * COUT_SMS_FCFA,
    parCanal,
  };
}

export interface LigneNotification {
  id: string;
  type: string;
  canal: string;
  titre: string;
  corps: string;
  statut: string;
  telephone: string | null;
  tentatives: number;
  creeLe: string;
  envoyeLe: string | null;
}

export async function listerNotifications(limite = 100): Promise<LigneNotification[]> {
  const lignes = await db.select({
    id: notifications.id,
    type: notifications.type,
    canal: notifications.canal,
    titre: notifications.titre,
    corps: notifications.corps,
    statut: notifications.statut,
    telephone: notifications.telephone,
    tentatives: notifications.tentatives,
    creeLe: notifications.creeLe,
    envoyeLe: notifications.envoyeLe,
  }).from(notifications)
    .orderBy(desc(notifications.creeLe))
    .limit(limite);
  return lignes.map((ligne) => ({
    ...ligne,
    telephone: ligne.telephone ? "•••• " + ligne.telephone.replace(/[^0-9]/g, "").slice(-4) : null,
  }));
}

/** Élèves pour le ciblage nominatif d'une annonce. */
export async function listerElevesActifs(anneeId: string, enseignantUtilisateurId?: string) {
  return db.execute<{ id: string; nom: string; prenom: string; classe: string }>(sql`
    SELECT e.id, e.nom, e.prenom, c.libelle AS classe
      FROM inscriptions i
      JOIN eleves e  ON e.id = i.eleve_id
      JOIN classes c ON c.id = i.classe_id
     WHERE i.active AND c.active AND i.annee_id = ${anneeId}::uuid
       AND (
         ${enseignantUtilisateurId ?? null}::uuid IS NULL
         OR EXISTS (
           SELECT 1
             FROM affectations af
             JOIN enseignants prof ON prof.id = af.enseignant_id
            WHERE af.classe_id = c.id
              AND af.annee_id = i.annee_id
              AND af.active
              AND prof.utilisateur_id = ${enseignantUtilisateurId ?? null}::uuid
              AND prof.actif
         )
       )
     ORDER BY e.nom, e.prenom
     LIMIT 2000
  `);
}

/** Tuteurs disposant d'un compte, destinataires possibles d'un message. */
export async function listerTuteursAvecCompte(anneeId: string, elevesAutorises?: string[]) {
  const parents = await db.select({
    utilisateurId: utilisateurs.id, nom: utilisateurs.nom, prenom: utilisateurs.prenom, tuteurId: tuteurs.id,
  }).from(utilisateurs)
    .innerJoin(tuteurs, eq(tuteurs.utilisateurId, utilisateurs.id))
    .where(and(eq(utilisateurs.role, "PARENT"), eq(utilisateurs.actif, true)))
    .orderBy(utilisateurs.nom, utilisateurs.prenom).limit(500);
  if (parents.length === 0 || (elevesAutorises && elevesAutorises.length === 0)) return [];

  const filtresLiaisons = [inArray(tuteurs.utilisateurId, parents.map((parent) => parent.utilisateurId))];
  if (elevesAutorises) filtresLiaisons.push(inArray(eleveTuteur.eleveId, elevesAutorises));

  const liaisons = await db.select({
    utilisateurId: tuteurs.utilisateurId, eleveId: eleveTuteur.eleveId,
  }).from(tuteurs)
    .innerJoin(eleveTuteur, eq(eleveTuteur.tuteurId, tuteurs.id))
    .innerJoin(inscriptions, and(
      eq(inscriptions.eleveId, eleveTuteur.eleveId),
      eq(inscriptions.anneeId, anneeId),
      eq(inscriptions.active, true),
    ))
    .innerJoin(classes, and(
      eq(classes.id, inscriptions.classeId),
      eq(classes.anneeId, anneeId),
      eq(classes.active, true),
    ))
    .where(and(...filtresLiaisons));

  const elevesParParent = new Map<string, Set<string>>();
  for (const lien of liaisons) {
    if (!lien.utilisateurId) continue;
    const ids = elevesParParent.get(lien.utilisateurId) ?? new Set<string>();
    ids.add(lien.eleveId);
    elevesParParent.set(lien.utilisateurId, ids);
  }
  return parents.flatMap((parent) => {
    const elevesIds = Array.from(elevesParParent.get(parent.utilisateurId) ?? []);
    return elevesIds.length
      ? [{ utilisateurId: parent.utilisateurId, nom: parent.nom, prenom: parent.prenom, elevesIds }]
      : [];
  });
}
