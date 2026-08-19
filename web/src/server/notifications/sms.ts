import "server-only";

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
}

export type FournisseurSms = "twilio" | "generique" | "journal";

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
 * Les numéros sont saisis de vingt façons au secrétariat : « 66 00 00 00 »,
 * « 0066000000 », « +235 66 00 00 00 ». Une passerelle les refuse tous sauf
 * un. On normalise donc au moment de l'envoi plutôt que d'imposer un format
 * de saisie que personne ne respectera.
 */
export function normaliserNumero(numero: string): string {
  const chiffres = numero.replace(/[^\d+]/g, "");
  if (chiffres.startsWith("+")) return chiffres;
  if (chiffres.startsWith("235")) return `+${chiffres}`;
  // Numéro national tchadien : 8 chiffres commençant par 6, 7 ou 9.
  if (/^[679]\d{7}$/.test(chiffres)) return `+235${chiffres}`;
  if (chiffres.startsWith("00")) return `+${chiffres.slice(2)}`;
  return `+235${chiffres.replace(/^0+/, "")}`;
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
async function envoyerGenerique(numero: string, texte: string): Promise<ResultatSms> {
  const url = process.env.SMS_API_URL as string;
  const cle = process.env.SMS_API_KEY as string;
  const expediteur = process.env.SMS_SENDER_ID ?? "LGR";

  const reponse = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cle}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: numero,
      from: expediteur,
      message: texte,
      // Certains agrégateurs attendent ces alias : les envoyer tous évite un
      // aller-retour de configuration à chaque changement de passerelle.
      destinataire: numero,
      expediteur,
      contenu: texte,
    }),
  });

  if (!reponse.ok) {
    return { succes: false, erreur: `Passerelle ${reponse.status} : ${(await reponse.text()).slice(0, 200)}` };
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

export async function envoyerSms(numeroBrut: string, texte: string): Promise<ResultatSms> {
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
    return await envoyerGenerique(numero, texte);
  } catch (erreur) {
    return {
      succes: false,
      erreur: erreur instanceof Error ? erreur.message : "Échec d'envoi SMS.",
    };
  }
}
