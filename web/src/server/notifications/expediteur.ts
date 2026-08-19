import "server-only";

import { eq, inArray, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { appareils, notifications } from "@/server/db/schema";

import { envoyerPush, fcmConfigure } from "./fcm";
import { envoyerSms, fournisseurSms, segmentsSms, smsConfigure } from "./sms";

/**
 * Vide la file des notifications en attente.
 *
 * Appelé par la route `/api/notifications/traiter`, elle-même déclenchée par
 * une tâche planifiée ou par le bouton de la page Communication.
 *
 * Principes :
 *   - On ne marque JAMAIS « envoyé » sans confirmation du canal. Une famille
 *     non prévenue que l'école croit prévenue est pire que pas de système.
 *   - Un échec est reporté de façon exponentielle (1, 5, 25 minutes), puis
 *     abandonné après trois tentatives — un numéro invalide ne doit pas être
 *     rejoué indéfiniment.
 *   - Un jeton FCM refusé par Google est désactivé : l'appareil a désinstallé
 *     l'application, le garder produirait un échec à chaque notification.
 */

export interface RapportExpedition {
  traitees: number;
  envoyees: number;
  echouees: number;
  ignorees: number;
  jetonsNettoyes: number;
  coutSmsFcfa: number;
  canauxIndisponibles: string[];
}

const COUT_SMS_FCFA = 25;

interface LigneFile {
  id: string;
  canal: string;
  titre: string;
  corps: string;
  route_cible: string | null;
  donnees: unknown;
  telephone: string | null;
  tentatives: number;
  jetons_fcm: string[] | null;
}

export async function traiterFile(limite = 100): Promise<RapportExpedition> {
  const rapport: RapportExpedition = {
    traitees: 0,
    envoyees: 0,
    echouees: 0,
    ignorees: 0,
    jetonsNettoyes: 0,
    coutSmsFcfa: 0,
    canauxIndisponibles: [],
  };

  const pushDisponible = fcmConfigure();
  const smsDisponible = smsConfigure();

  if (!pushDisponible) rapport.canauxIndisponibles.push("push (Firebase non configuré)");
  if (!smsDisponible) rapport.canauxIndisponibles.push("SMS (passerelle non configurée)");
  if (!pushDisponible && !smsDisponible) return rapport;

  const file = await db.execute<LigneFile & Record<string, unknown>>(sql`
    SELECT id, canal::text, titre, corps, route_cible, donnees, telephone, tentatives, jetons_fcm
      FROM v_file_notifications
     LIMIT ${limite}
  `);

  for (const ligne of file.rows) {
    const canal = String(ligne.canal);

    // Canal indisponible : on laisse la notification en file plutôt que de la
    // marquer en échec. Elle partira dès que le canal sera branché.
    if ((canal === "PUSH" && !pushDisponible) || (canal === "SMS" && !smsDisponible)) {
      rapport.ignorees += 1;
      continue;
    }

    rapport.traitees += 1;

    let succes = false;
    let erreur: string | undefined;
    let reference: string | undefined;
    let cout = 0;

    if (canal === "PUSH") {
      const r = await envoyerPush(ligne.jetons_fcm ?? [], {
        titre: ligne.titre,
        corps: ligne.corps,
        route: ligne.route_cible,
        donnees: ligne.donnees,
      });
      succes = r.succes;
      erreur = r.erreur;

      if (r.jetonsInvalides?.length) {
        await db
          .update(appareils)
          .set({ actif: false })
          .where(inArray(appareils.jetonFcm, r.jetonsInvalides));
        rapport.jetonsNettoyes += r.jetonsInvalides.length;
      }
    } else if (canal === "SMS") {
      if (!ligne.telephone) {
        succes = false;
        erreur = "Aucun numéro de téléphone.";
      } else {
        const texte = `${ligne.titre}\n${ligne.corps}`;
        const r = await envoyerSms(ligne.telephone, texte);
        succes = r.succes;
        erreur = r.erreur;
        reference = r.reference;
        if (succes) cout = segmentsSms(texte) * COUT_SMS_FCFA;
      }
    } else {
      // EMAIL et IN_APP ne passent pas par cet expéditeur.
      rapport.ignorees += 1;
      rapport.traitees -= 1;
      continue;
    }

    const tentatives = Number(ligne.tentatives) + 1;

    if (succes) {
      await db
        .update(notifications)
        .set({
          statut: "ENVOYE",
          envoyeLe: new Date().toISOString(),
          tentatives,
          coutFcfa: cout || null,
          referenceExterne: reference ?? null,
          erreur: null,
        })
        .where(eq(notifications.id, ligne.id));

      rapport.envoyees += 1;
      rapport.coutSmsFcfa += cout;
    } else {
      // Report exponentiel : 1 min, puis 5, puis 25. Au-delà de 3 tentatives
      // la vue de file ne la reprend plus.
      const minutes = 5 ** (tentatives - 1);
      const definitif = tentatives >= 3;

      await db
        .update(notifications)
        .set({
          statut: definitif ? "ECHOUE" : "EN_ATTENTE",
          tentatives,
          erreur: erreur?.slice(0, 500) ?? "Échec inconnu",
          prochaineTentativeLe: new Date(Date.now() + minutes * 60_000).toISOString(),
        })
        .where(eq(notifications.id, ligne.id));

      rapport.echouees += 1;
    }
  }

  return rapport;
}
