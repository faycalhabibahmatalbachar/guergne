import "server-only";

import { eq, inArray, sql } from "drizzle-orm";

import { COUT_SMS_FCFA } from "@/lib/tarifs";
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
  /** Relances d'échéances créées avant le vidage. */
  relancesEcheances: number;
  traitees: number;
  envoyees: number;
  echouees: number;
  ignorees: number;
  jetonsNettoyes: number;
  coutSmsFcfa: number;
  canauxIndisponibles: string[];
}


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

/**
 * Relance les échéances impayées avant de vider la file.
 *
 * Une échéance n'est pas un événement : c'est une date qui approche, et aucun
 * déclencheur ne peut se réveiller pour cela. La fonction SQL
 * `fn_relancer_echeances` produit les notifications à J-7, J-1, J+3 et J+15,
 * une seule fois par échéance et par jour.
 *
 * Elle est appelée ICI plutôt que dans une tâche séparée : les relances créées
 * partent alors dans le même passage, au lieu d'attendre le vidage suivant. Et
 * il n'y a qu'une seule tâche planifiée à ne pas oublier.
 */
async function relancerEcheances(): Promise<number> {
  try {
    const r = await db.execute<{ posees: number }>(
      sql`SELECT fn_relancer_echeances() AS posees`,
    );
    return Number(r.rows[0]?.posees ?? 0);
  } catch (erreur) {
    // Une relance qui échoue ne doit pas empêcher la file de se vider : les
    // absences du jour comptent davantage qu'un rappel de paiement.
    console.error("Relance des échéances impossible :", erreur);
    return 0;
  }
}

export async function traiterFile(limite = 100): Promise<RapportExpedition> {
  const rapport: RapportExpedition = {
    relancesEcheances: 0,
    traitees: 0,
    envoyees: 0,
    echouees: 0,
    ignorees: 0,
    jetonsNettoyes: 0,
    coutSmsFcfa: 0,
    canauxIndisponibles: [],
  };

  // Avant de lire la file : les relances du jour doivent y figurer.
  rapport.relancesEcheances = await relancerEcheances();

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
    let definitif = false;

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
        // Un code de connexion passe devant tout le reste : le parent est
        // devant son écran, en train de l'attendre. Une relance d'impayé peut
        // patienter derrière cinquante messages sans que personne ne le
        // remarque.
        const r = await envoyerSms(
          ligne.telephone,
          texte,
          ligne.type === "AUTRE" ? "otp" : "transactional",
          // L'identifiant de la notification sert de clé d'idempotence : si
          // cette exécution est interrompue entre l'envoi et l'enregistrement,
          // la suivante réenverra la même clé et la passerelle rendra le
          // message d'origine au lieu d'en créer un second.
          ligne.id,
        );
        succes = r.succes;
        erreur = r.erreur;
        reference = r.reference;
        definitif = r.definitif ?? false;
        // Le nombre de segments vient de l'expéditeur, qui seul connaît le
        // texte final : c'est lui qui appose la signature de l'établissement.
        // Le recalculer ici sous-estimerait la dépense.
        if (succes) cout = (r.segments ?? segmentsSms(texte)) * COUT_SMS_FCFA;
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
      //
      // Un refus définitif — numéro Moov, numéro malformé — court-circuite ce
      // report : le rejouer trois fois produirait trois fois la même erreur, et
      // chaque tentative repart chez la passerelle. Cent vingt-neuf
      // notifications ont été rejouées ainsi avant que la distinction existe.
      const minutes = 5 ** (tentatives - 1);
      const abandonne = definitif || tentatives >= 3;

      await db
        .update(notifications)
        .set({
          statut: abandonne ? "ECHOUE" : "EN_ATTENTE",
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
