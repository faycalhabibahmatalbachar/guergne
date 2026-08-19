import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  annonces,
  classes,
  eleves,
  messages,
  niveaux,
  notifications,
  utilisateurs,
} from "@/server/db/schema";

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
  coutSmsEstime: number;
}

/**
 * État de la file d'expédition.
 *
 * Le coût SMS est estimé à 25 F par message : c'est le seul poste de dépense
 * variable du projet, la direction doit pouvoir le voir avant d'activer le
 * canal.
 */
export async function etatFileNotifications(): Promise<EtatFile> {
  const r = await db.execute<Record<string, unknown>>(sql`
    SELECT
      count(*) FILTER (WHERE statut = 'EN_ATTENTE')                      AS en_attente,
      count(*) FILTER (WHERE statut = 'ENVOYE')                          AS envoyees,
      count(*) FILTER (WHERE statut = 'ECHOUE')                          AS echouees,
      count(*) FILTER (WHERE statut = 'EN_ATTENTE' AND canal = 'PUSH')   AS push_attente,
      count(*) FILTER (WHERE statut = 'EN_ATTENTE' AND canal = 'SMS')    AS sms_attente
      FROM notifications
  `);

  const l = r.rows[0] ?? {};
  const smsEnAttente = Number(l.sms_attente ?? 0);

  return {
    enAttente: Number(l.en_attente ?? 0),
    envoyees: Number(l.envoyees ?? 0),
    echouees: Number(l.echouees ?? 0),
    pushEnAttente: Number(l.push_attente ?? 0),
    smsEnAttente,
    coutSmsEstime: smsEnAttente * 25,
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
  erreur: string | null;
  creeLe: string;
  envoyeLe: string | null;
}

export async function listerNotifications(limite = 50): Promise<LigneNotification[]> {
  return db
    .select({
      id: notifications.id,
      type: notifications.type,
      canal: notifications.canal,
      titre: notifications.titre,
      corps: notifications.corps,
      statut: notifications.statut,
      telephone: notifications.telephone,
      tentatives: notifications.tentatives,
      erreur: notifications.erreur,
      creeLe: notifications.creeLe,
      envoyeLe: notifications.envoyeLe,
    })
    .from(notifications)
    .orderBy(desc(notifications.creeLe))
    .limit(limite);
}

/** Élèves pour le ciblage nominatif d'une annonce. */
export async function listerElevesActifs(anneeId: string) {
  return db.execute<{ id: string; nom: string; prenom: string; classe: string }>(sql`
    SELECT e.id, e.nom, e.prenom, c.libelle AS classe
      FROM inscriptions i
      JOIN eleves e  ON e.id = i.eleve_id
      JOIN classes c ON c.id = i.classe_id
     WHERE i.active AND i.annee_id = ${anneeId}::uuid
     ORDER BY e.nom, e.prenom
     LIMIT 500
  `);
}

/** Tuteurs disposant d'un compte, destinataires possibles d'un message. */
export async function listerTuteursAvecCompte() {
  return db
    .select({
      utilisateurId: utilisateurs.id,
      nom: utilisateurs.nom,
      prenom: utilisateurs.prenom,
      telephone: utilisateurs.telephone,
    })
    .from(utilisateurs)
    .where(and(eq(utilisateurs.role, "PARENT"), eq(utilisateurs.actif, true)))
    .orderBy(utilisateurs.nom)
    .limit(500);
}
