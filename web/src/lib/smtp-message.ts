import { randomBytes } from "node:crypto";

const BASE = "https://lycee-guergne-renaissance.vercel.app";
const URL_AUTORISEE = /^https:\/\/lycee-guergne-renaissance\.vercel\.app\/auth\/reinitialiser\?jeton=[A-Za-z0-9_.%-]+$/;
const COURRIEL_AUTORISE = /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/;

const encoder = (valeur: string) => Buffer.from(valeur, "utf8").toString("base64");
const plier = (valeur: string) => encoder(valeur).match(/.{1,76}/g)?.join("\r\n") ?? "";
const entete = (valeur: string) => "=?UTF-8?B?" + encoder(valeur) + "?=";

export function creerContenuReinitialisation(lien: string): { texte: string; html: string } {
  if (!URL_AUTORISEE.test(lien)) throw new Error("Lien de réinitialisation incorrect");

  const texte = [
    "LYCÉE GUERGNÉ LA RENAISSANCE",
    "Réinitialisation de votre mot de passe",
    "",
    "Bonjour,",
    "Une demande de réinitialisation de votre mot de passe a été reçue.",
    "Pour choisir un nouveau mot de passe, ouvrez ce lien :",
    lien,
    "",
    "Ce lien personnel expire dans 20 minutes et devient invalide après le changement de mot de passe.",
    "Si vous n'avez rien demandé, ignorez ce message. Votre mot de passe ne sera pas modifié.",
    "Ne partagez jamais ce lien ni votre mot de passe.",
    "",
    "Lycée Guergné La Renaissance",
  ].join("\n");

  // Styles en ligne compatibles avec les clients mail. Version texte accessible aussi.
  const html = [
    '<!doctype html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>',
    '<body style="margin:0;padding:0;background:#f4f7f6;font-family:Arial,Helvetica,sans-serif;color:#17202a">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f7f6"><tr><td align="center" style="padding:32px 16px">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;border:1px solid #e3eae7;border-radius:14px;background:#ffffff">',
    '<tr><td style="height:5px;background:#26765b;font-size:0">&nbsp;</td></tr>',
    '<tr><td align="center" style="padding:30px 28px 18px">',
    '<img src="', BASE, '/logo-officiel.webp" width="76" height="66" alt="Blason officiel du lycée" style="display:block;max-width:76px;border:0">',
    '<div style="padding-top:12px;color:#163d33;font-size:17px;line-height:24px;font-weight:bold">Lycée Guergné La Renaissance</div>',
    '<div style="padding-top:4px;color:#70817a;font-size:12px">Espace d’administration</div>',
    '</td></tr><tr><td style="padding:16px 34px 20px">',
    '<h1 style="font-size:25px;line-height:33px;letter-spacing:-.5px;margin:0 0 18px;color:#17202a">Réinitialiser votre mot de passe</h1>',
    '<p style="font-size:15px;line-height:24px;color:#485569;margin:0 0 14px">Bonjour,</p>',
    '<p style="font-size:15px;line-height:24px;color:#485569;margin:0 0 24px">Vous avez demandé à définir un nouveau mot de passe pour votre espace d’administration. Utilisez le bouton ci-dessous pour poursuivre.</p>',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center" bgcolor="#171717" style="border-radius:11px">',
    '<a href="', lien, '" style="display:block;padding:16px;color:#ffffff;font-size:15px;line-height:22px;font-weight:bold;text-decoration:none">Réinitialiser mon mot de passe &#8594;</a>',
    '</td></tr></table>',
    '<p style="margin:22px 0 11px;font-size:13px;line-height:21px;color:#556577">Ce lien personnel est valable <strong>20 minutes</strong>. Il devient invalide après modification de votre mot de passe.</p>',
    '<p style="margin:0 0 8px;font-size:12px;line-height:19px;color:#697584">Si le bouton ne fonctionne pas, utilisez ce lien :</p>',
    '<p style="margin:0;overflow-wrap:anywhere;word-break:break-all;font-size:12px;line-height:19px"><a style="color:#276c55" href="', lien, '">', lien, '</a></p>',
    '</td></tr><tr><td style="padding:8px 34px 30px">',
    '<p style="border-top:1px solid #e6eeea;padding-top:17px;margin:0;font-size:12px;line-height:20px;color:#667781">Si vous n’êtes pas à l’origine de cette demande, ignorez ce message. Ne communiquez jamais votre mot de passe ni ce lien à un tiers.</p>',
    '</td></tr></table>',
    '<p style="margin:20px 0 0;text-align:center;font-size:11px;color:#86938e">&copy; Lycée Guergné La Renaissance — Notification automatique</p>',
    '</td></tr></table></body></html>',
  ].join("");
  return { texte, html };
}

export function preparerMessageSMTP({
  expediteur,
  destinataire,
  lien,
}: {
  expediteur: string;
  destinataire: string;
  lien: string;
}): string {
  if (!COURRIEL_AUTORISE.test(expediteur) || !COURRIEL_AUTORISE.test(destinataire)) {
    throw new Error("Adresse e-mail incorrecte");
  }
  const { texte, html } = creerContenuReinitialisation(lien);
  const id = randomBytes(16).toString("hex");
  const separateur = "lgr-" + randomBytes(12).toString("hex");
  return [
    "From: " + entete("Lycée Guergné La Renaissance") + " <" + expediteur + ">",
    "To: <" + destinataire + ">",
    "Subject: " + entete("Réinitialisation de votre mot de passe — Lycée Guergné La Renaissance"),
    "Date: " + new Date().toUTCString(),
    "Message-ID: <" + id + "@gmail.com>",
    "MIME-Version: 1.0",
    'Content-Type: multipart/alternative; boundary="' + separateur + '"',
    "Auto-Submitted: auto-generated",
    "X-Auto-Response-Suppress: All",
    "",
    "--" + separateur,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    plier(texte),
    "--" + separateur,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    plier(html),
    "--" + separateur + "--",
    "",
  ].join("\r\n");
}
