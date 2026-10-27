import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";

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

  rapport.relancesEcheances = await relancerEcheances();

  const pushDisponible = fcmConfigure();
  const smsDisponible = smsConfigure();
  if (!pushDisponible) rapport.canauxIndisponibles.push("push (Firebase non configuré)");
  if (!smsDisponible) rapport.canauxIndisponibles.push("SMS (passerelle non configurée)");
  if (!pushDisponible && !smsDisponible) return rapport;

  const limiteSecurisee = Math.max(1, Math.min(200, Math.trunc(Number.isFinite(limite) ? limite : 100)));
  const workerId = randomUUID();

  // Une exécution interrompue peut laisser un bail expiré. Après trois essais,
  // la ligne doit devenir un échec définitif, pas rester éternellement en attente.
  await db.execute(sql`
    UPDATE notifications
       SET statut = 'ECHOUE'::statut_envoi,
           erreur = COALESCE(erreur, 'Traitement interrompu après trois tentatives.'),
           traitement_id = NULL,
           traitement_le = NULL
     WHERE statut = 'EN_ATTENTE'::statut_envoi
       AND canal IN ('PUSH'::canal_notification, 'SMS'::canal_notification)
       AND tentatives >= 3
       AND (traitement_id IS NULL OR traitement_le IS NULL
            OR traitement_le < now() - interval '10 minutes')
  `);

  // Réservation atomique : deux workers (cron + bouton manuel, par exemple)
  // ne peuvent pas envoyer simultanément la même notification.
  const file = await db.execute<LigneFile & Record<string, unknown>>(sql`
    WITH candidates AS (
      SELECT n.id
        FROM notifications n
       WHERE n.statut = 'EN_ATTENTE'::statut_envoi
         AND n.canal IN ('PUSH'::canal_notification, 'SMS'::canal_notification)
         AND n.prochaine_tentative_le <= now()
         AND n.tentatives < 3
         AND (n.traitement_id IS NULL OR n.traitement_le IS NULL
              OR n.traitement_le < now() - interval '10 minutes')
         AND (${pushDisponible}::boolean OR n.canal <> 'PUSH'::canal_notification)
         AND (${smsDisponible}::boolean OR n.canal <> 'SMS'::canal_notification)
       ORDER BY n.prochaine_tentative_le, n.cree_le
       LIMIT ${limiteSecurisee}
       FOR UPDATE SKIP LOCKED
    ),
    reservees AS (
      UPDATE notifications n
         SET traitement_id = ${workerId}::uuid,
             traitement_le = now(),
             tentatives = n.tentatives + 1
        FROM candidates c
       WHERE n.id = c.id
      RETURNING n.id, n.canal::text AS canal, n.type::text AS type,
                n.titre, n.corps, n.route_cible, n.donnees, n.telephone,
                n.tentatives, n.destinataire_id
    )
    SELECT r.*,
           (SELECT array_agg(a.jeton_fcm)
              FROM appareils a
             WHERE a.utilisateur_id = r.destinataire_id
               AND a.actif AND a.jeton_fcm IS NOT NULL) AS jetons_fcm
      FROM reservees r
     ORDER BY r.tentatives, r.id
  `);

  for (const ligne of file.rows) {
    rapport.traitees += 1;
    const canal = String(ligne.canal);
    let succes = false;
    let erreur: string | undefined;
    let reference: string | undefined;
    let cout = 0;
    let definitif = false;

    try {
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
          erreur = "Aucun numéro de téléphone.";
        } else {
          const texte = `${ligne.titre}\n${ligne.corps}`;
          // Les messages ordinaires et les relances restent transactionnels.
          // Une priorité OTP doit être déclarée explicitement dans les données
          // de la notification, jamais déduite du type générique AUTRE.
          const donnees = ligne.donnees && typeof ligne.donnees === "object"
            ? ligne.donnees as Record<string, unknown>
            : {};
          const priorite = donnees.priorite === "otp" ? "otp" : "transactional";
          const r = await envoyerSms(
            ligne.telephone,
            texte,
            priorite,
            String(ligne.id),
          );
          succes = r.succes;
          erreur = r.erreur;
          reference = r.reference;
          definitif = r.definitif ?? false;
          if (succes) cout = (r.segments ?? segmentsSms(texte)) * COUT_SMS_FCFA;
        }
      } else {
        // La requête de réservation filtre déjà ces canaux : cette branche
        // reste un garde-fou si le schéma de la file évolue.
        erreur = "Canal de notification non pris en charge.";
      }
    } catch (cause) {
      erreur = cause instanceof Error ? cause.message.slice(0, 400) : "Erreur de transport inconnue.";
      console.error("[notifications] échec d'expédition", { canal, notificationId: ligne.id });
    }

    const tentatives = Number(ligne.tentatives);
    const conditionsReservation = and(
      eq(notifications.id, ligne.id),
      eq(notifications.traitementId, workerId),
    );

    if (succes) {
      const confirme = await db.update(notifications)
        .set({
          statut: "ENVOYE",
          envoyeLe: new Date().toISOString(),
          tentatives,
          coutFcfa: cout || null,
          referenceExterne: reference ?? null,
          erreur: null,
          traitementId: null,
          traitementLe: null,
        })
        .where(conditionsReservation)
        .returning({ id: notifications.id });

      if (confirme.length) {
        rapport.envoyees += 1;
        rapport.coutSmsFcfa += cout;
      }
    } else {
      const minutes = 5 ** Math.max(0, tentatives - 1);
      const abandonne = definitif || tentatives >= 3;
      const confirme = await db.update(notifications)
        .set({
          statut: abandonne ? "ECHOUE" : "EN_ATTENTE",
          tentatives,
          erreur: erreur?.slice(0, 500) ?? "Échec inconnu",
          prochaineTentativeLe: new Date(Date.now() + minutes * 60_000).toISOString(),
          traitementId: null,
          traitementLe: null,
        })
        .where(conditionsReservation)
        .returning({ id: notifications.id });

      if (confirme.length) rapport.echouees += 1;
    }
  }

  return rapport;
}
