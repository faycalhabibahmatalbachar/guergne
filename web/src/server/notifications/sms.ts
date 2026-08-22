import "server-only";

import { formatInternational } from "@/lib/telephone";

/**
 * Expédition des SMS, indépendante du fournisseur.
 *
 * Le SMS est le SEUL poste de dépense variable du projet : c'est aussi celui
 * dont le fournisseur changera le plus souvent (tarifs, couverture au Tchad,
 * qualité d'acheminement). On isole donc l'adaptateur derrière une interface
 * unique — changer de passerelle ne doit toucher qu'un fichier.
 *
 * Trois fournisseurs sont câblés :
 *
 *   SMS_FOURNISSEUR=twilio     — essai gratuit, mais n'envoie qu'aux numéros
 *                                vérifiés et facture cher le Tchad. Utile pour
 *                                valider la chaîne, pas pour la production.
 *   SMS_FOURNISSEUR=generique  — toute passerelle acceptant un POST JSON.
 *                                C'est le mode à retenir pour une passerelle
 *                                tchadienne (Moov, Airtel) ou pour 235SMS.
 *   SMS_FOURNISSEUR=journal    — n'envoie rien, écrit dans les logs. Permet de
 *                                dérouler la chaîne complète sans dépenser.
 */

export interface ResultatSms {
  succes: boolean;
  erreur?: string;
  /** Identifiant du message chez le fournisseur, pour le rapprochement. */
  reference?: string;
  /**
   * Échec qu'aucune nouvelle tentative ne corrigera.
   *
   * Un numéro Moov, un numéro à sept chiffres, un préfixe inexistant : réessayer
   * dans une minute, puis dans cinq, puis dans vingt-cinq, ne fera que produire
   * trois fois la même erreur. Pire, chaque tentative repart chez la passerelle
   * et peut y créer un message facturé.
   *
   * Distinguer ce cas d'une panne réseau est le seul moyen d'avoir une file qui
   * se vide au lieu de tourner.
   */
  definitif?: boolean;
}

export type FournisseurSms = "twilio" | "generique" | "journal";

/**
 * Priorité d'acheminement.
 *
 * Un code d'activation part devant tout le reste : le parent est devant son
 * téléphone, l'écran ouvert, en train d'attendre. Une relance d'impayé peut
 * patienter derrière cinquante autres messages sans que personne ne s'en
 * aperçoive.
 */
export type Priorite = "otp" | "transactional" | "marketing";

export function fournisseurSms(): FournisseurSms | null {
  const f = (process.env.SMS_FOURNISSEUR ?? "").toLowerCase();
  if (f === "twilio" || f === "generique" || f === "journal") return f;
  // Rétrocompatibilité : une passerelle générique configurée sans nommer le
  // fournisseur reste fonctionnelle.
  if (process.env.SMS_API_URL && process.env.SMS_API_KEY) return "generique";
  return null;
}

export function smsConfigure(): boolean {
  const f = fournisseurSms();
  if (f === "journal") return true;
  if (f === "twilio") {
    return Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_NUMERO_EXPEDITEUR,
    );
  }
  if (f === "generique") return Boolean(process.env.SMS_API_URL && process.env.SMS_API_KEY);
  return false;
}

/**
 * Normalise un numéro tchadien au format international.
 *
 * La règle elle-même vit dans `lib/telephone.ts` : un seul endroit décide de
 * ce qu'est un numéro tchadien valide, pour le portail, l'application des
 * parents et la passerelle SMS. Les numéros sont saisis de vingt façons au
 * secrétariat — « 66 00 00 00 », « 0066000000 », « +235 66 00 00 00 » — et
 * une passerelle les refuse toutes sauf une.
 */
export function normaliserNumero(numero: string): string {
  return formatInternational(numero);
}

/**
 * Longueur d'un SMS.
 *
 * Un SMS latin fait 160 caractères ; au-delà il est découpé et FACTURÉ
 * plusieurs fois. Un accent hors GSM-7 fait basculer tout le message en
 * UCS-2, soit 70 caractères par segment. D'où l'intérêt de compter avant
 * d'envoyer.
 */
export function segmentsSms(texte: string): number {
  const gsm7 = /^[\x20-\x7E\n\ràâäçéèêëîïôöùûüÀÂÄÇÉÈÊËÎÏÔÖÙÛÜ€£¥§]*$/.test(texte);
  const taille = gsm7 ? 160 : 70;
  const tailleMulti = gsm7 ? 153 : 67;
  if (texte.length <= taille) return 1;
  return Math.ceil(texte.length / tailleMulti);
}

async function envoyerTwilio(numero: string, texte: string): Promise<ResultatSms> {
  const sid = process.env.TWILIO_ACCOUNT_SID as string;
  const token = process.env.TWILIO_AUTH_TOKEN as string;
  const expediteur = process.env.TWILIO_NUMERO_EXPEDITEUR as string;

  const reponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: numero, From: expediteur, Body: texte }),
  });

  if (!reponse.ok) {
    const texteErreur = await reponse.text();
    // 21608 : sur un compte d'essai, le numéro destinataire doit être vérifié.
    if (texteErreur.includes("21608")) {
      return {
        succes: false,
        erreur:
          "Compte Twilio en essai : ce numéro doit d'abord être vérifié dans la console Twilio.",
      };
    }
    return { succes: false, erreur: `Twilio ${reponse.status} : ${texteErreur.slice(0, 200)}` };
  }

  const donnees = (await reponse.json()) as { sid?: string };
  return { succes: true, reference: donnees.sid };
}

/**
 * Passerelle générique : un POST JSON avec clé en en-tête.
 * Le corps est configurable pour s'adapter aux conventions de chaque
 * opérateur sans modifier ce fichier.
 */
/**
 * Motifs de refus qu'il ne sert à rien de rejouer.
 *
 * `unsupported_operator_moov` mérite une mention : la passerelle 235SMS
 * n'achemine que les numéros Airtel (6, 8) et refuse Moov (3, 9). Ce n'est pas
 * une panne, c'est une limite de couverture — et elle concerne près de la
 * moitié des tuteurs de l'établissement. Les rejouer trois fois chacun ne les
 * rendra pas joignables ; c'est le canal qu'il faut changer, pas la tentative.
 */
const REFUS_DEFINITIFS = [
  "unsupported_operator_moov",
  "invalid_phone_length",
  "invalid_phone_operator_prefix",
  "invalid_phone_country_not_supported",
  "sandbox_destination_not_allowed",
  "project_not_found",
];

async function envoyerGenerique(
  numero: string,
  texte: string,
  priorite: Priorite,
  idempotence?: string,
): Promise<ResultatSms> {
  const url = process.env.SMS_API_URL as string;
  const cle = process.env.SMS_API_KEY as string;
  const expediteur = process.env.SMS_SENDER_ID ?? "LGR";

  const reponse = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cle}`,
      "Content-Type": "application/json",
      // Clé d'idempotence : la passerelle reconnaît un rejeu et renvoie le
      // message d'origine au lieu d'en créer un second.
      //
      // C'est la protection dont l'absence a coûté cher : une fonction
      // serverless est tuée à 60 secondes. Le message était parti, son
      // enregistrement en base ne l'était pas, la notification restait « en
      // attente » — et repartait au vidage suivant. Soixante-deux parents ont
      // ainsi été mis en file deux à trois fois pour le même message.
      ...(idempotence ? { "Idempotency-Key": idempotence } : {}),
    },
    body: JSON.stringify({
      to: numero,
      // `body` est le champ attendu par 235SMS, et il est OBLIGATOIRE : sans
      // lui la passerelle répond 400 sans envoyer le message. Les autres clés
      // sont des alias que d'autres agrégateurs attendent — les envoyer
      // toutes évite un aller-retour de configuration à chaque changement de
      // fournisseur, et aucune passerelle ne se plaint d'un champ superflu.
      body: texte,
      priority: priorite,
      from: expediteur,
      message: texte,
      destinataire: numero,
      expediteur,
      contenu: texte,
    }),
  });

  if (!reponse.ok) {
    const corpsErreur = (await reponse.text()).slice(0, 200);

    // 429 mis à part : une limite de débit se réessaie, c'est même sa raison
    // d'être. Un 402 « crédit épuisé » aussi — l'école peut recharger.
    const definitif =
      REFUS_DEFINITIFS.some((motif) => corpsErreur.includes(motif)) ||
      (reponse.status >= 400 && reponse.status < 500 && reponse.status !== 429 && reponse.status !== 402);

    return { succes: false, definitif, erreur: `Passerelle ${reponse.status} : ${corpsErreur}` };
  }

  const brut = await reponse.text();
  try {
    const donnees = JSON.parse(brut) as Record<string, unknown>;
    const reference = String(donnees.id ?? donnees.messageId ?? donnees.reference ?? "");
    return { succes: true, reference: reference || undefined };
  } catch {
    return { succes: true };
  }
}

export async function envoyerSms(
  numeroBrut: string,
  texte: string,
  priorite: Priorite = "transactional",
  /**
   * Clé stable identifiant CE message — l'identifiant de la notification.
   *
   * Deux appels portant la même clé ne produisent qu'un seul SMS, même si le
   * premier a été interrompu entre l'envoi et son enregistrement. Sans elle,
   * toute interruption se paie en double.
   */
  idempotence?: string,
): Promise<ResultatSms> {
  const fournisseur = fournisseurSms();

  if (!fournisseur) {
    return { succes: false, erreur: "Aucune passerelle SMS configurée (SMS_FOURNISSEUR)." };
  }
  if (!smsConfigure()) {
    return { succes: false, erreur: `Passerelle « ${fournisseur} » incomplètement configurée.` };
  }

  const numero = normaliserNumero(numeroBrut);

  try {
    if (fournisseur === "journal") {
      // Mode sans dépense : la chaîne complète se déroule, seul l'envoi réel
      // est remplacé par une trace. Indispensable pour la recette.
      console.info(
        `[sms:journal] ${numero} — ${segmentsSms(texte)} segment(s) — ${texte.slice(0, 120)}`,
      );
      return { succes: true, reference: `journal-${Date.now()}` };
    }
    if (fournisseur === "twilio") return await envoyerTwilio(numero, texte);
    return await envoyerGenerique(numero, texte, priorite, idempotence);
  } catch (erreur) {
    return {
      succes: false,
      erreur: erreur instanceof Error ? erreur.message : "Échec d'envoi SMS.",
    };
  }
}
