import { randomBytes } from "node:crypto";

/**
 * Construit un message RFC 5322 en UTF-8 sans dépendance et sans possibilité
 * d'injection d'en-têtes. Le corps est encodé en Base64.
 */
export function preparerMessageSMTP({
  expediteur,
  destinataire,
  lien,
}: {
  expediteur: string;
  destinataire: string;
  lien: string;
}): string {
  const email = /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/;
  if (!email.test(expediteur) || !email.test(destinataire)) throw new Error("Adresse e-mail incorrecte");
  if (!/^https:\/\/lycee-guergne-renaissance\.vercel\.app\/auth\/reinitialiser\?jeton=[A-Za-z0-9_.%-]+$/.test(lien)) {
    throw new Error("Lien de réinitialisation incorrect");
  }

  const encoderEntete = (texte: string) => "=?UTF-8?B?" + Buffer.from(texte, "utf8").toString("base64") + "?=";
  const texte = [
    "Bonjour,",
    "",
    "Vous avez demandé la réinitialisation de votre mot de passe pour l'espace d'administration du Lycée Guergné La Renaissance.",
    "",
    "Pour choisir un nouveau mot de passe, ouvrez ce lien (valable 20 minutes) :",
    lien,
    "",
    "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.",
    "Ne communiquez jamais votre mot de passe à un tiers.",
    "",
    "Lycée Guergné La Renaissance",
  ].join("\r\n");

  const corps = Buffer.from(texte, "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
  const id = randomBytes(16).toString("hex");
  return [
    "From: " + encoderEntete("Lycée Guergné La Renaissance") + " <" + expediteur + ">",
    "To: <" + destinataire + ">",
    "Subject: " + encoderEntete("Réinitialisez votre mot de passe — Lycée Guergné La Renaissance"),
    "Date: " + new Date().toUTCString(),
    "Message-ID: <" + id + "@gmail.com>",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "Auto-Submitted: auto-generated",
    "X-Auto-Response-Suppress: All",
    "",
    corps,
    "",
  ].join("\r\n");
}
