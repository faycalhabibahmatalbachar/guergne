import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { utilisateurs } from "@/server/db/schema";

const DUREE_MINUTES = 20;
const BASE_URL = "https://lycee-guergne-renaissance.vercel.app";

function cleSignature(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 24) throw new Error("AUTH_SECRET manquant");
  return secret;
}

function signature(texte: string, empreinte: string): string {
  return createHmac("sha256", cleSignature())
    .update("lgr-reset-v1:")
    .update(texte)
    .update(":")
    .update(empreinte)
    .digest("hex");
}

type ContenuJeton = { id: string; exp: number; nonce: string };

export function creerJetonReinitialisation(utilisateurId: string, empreinte: string): string {
  const payload: ContenuJeton = {
    id: utilisateurId,
    exp: Date.now() + DUREE_MINUTES * 60_000,
    nonce: randomBytes(16).toString("hex"),
  };
  const texte = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return texte + "." + signature(texte, empreinte);
}

export async function compteDuJeton(jeton: string) {
  if (jeton.length > 1200 || !/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(jeton)) return null;
  const [texte, mac] = jeton.split(".");
  let payload: ContenuJeton;
  try {
    payload = JSON.parse(Buffer.from(texte, "base64url").toString("utf8")) as ContenuJeton;
  } catch {
    return null;
  }
  if (
    !payload ||
    typeof payload.id !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(payload.id) ||
    typeof payload.exp !== "number" ||
    !Number.isFinite(payload.exp) ||
    payload.exp < Date.now() ||
    payload.exp > Date.now() + DUREE_MINUTES * 60_000 ||
    typeof payload.nonce !== "string" ||
    !/^[0-9a-f]{32}$/.test(payload.nonce)
  ) return null;

  const [utilisateur] = await db
    .select({ id: utilisateurs.id, hash: utilisateurs.motDePasseHash, actif: utilisateurs.actif })
    .from(utilisateurs)
    .where(eq(utilisateurs.id, payload.id))
    .limit(1);
  if (!utilisateur?.actif || !utilisateur.hash) return null;

  const attendu = Buffer.from(signature(texte, utilisateur.hash), "hex");
  const fourni = Buffer.from(mac, "hex");
  if (attendu.length !== fourni.length || !timingSafeEqual(attendu, fourni)) return null;
  return utilisateur;
}

export function lienReinitialisation(jeton: string): string {
  return BASE_URL + "/auth/reinitialiser?jeton=" + encodeURIComponent(jeton);
}

export function emailsDisponibles(): boolean {
  const cle = process.env.RESEND_API_KEY?.trim() ?? "";
  const expediteur = process.env.RESEND_FROM_EMAIL?.trim() ?? "";
  const secret = process.env.AUTH_SECRET ?? "";
  return (
    cle.startsWith("re_") &&
    expediteur.includes("@") &&
    !expediteur.includes("votre-domaine-verifie.tld") &&
    secret.length >= 24
  );
}

/** L'envoi échoue explicitement si la passerelle n'est pas configurée. */
export async function envoyerEmailReinitialisation(destinataire: string, lien: string): Promise<boolean> {
  if (!emailsDisponibles()) return false;
  try {
    const reponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.RESEND_API_KEY,
        "Content-Type": "application/json",
        "Idempotency-Key": "lgr-reset-" + createHmac("sha256", cleSignature()).update(lien).digest("hex").slice(0,48),
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL,
        to: [destinataire],
        subject: "Réinitialisez votre mot de passe — Lycée Guergné La Renaissance",
        reply_to: process.env.RESEND_REPLY_TO || undefined,
        text: [
          "Bonjour,",
          "",
          "Vous avez demandé la réinitialisation de votre mot de passe pour l’espace d’administration du lycée.",
          "Pour choisir un nouveau mot de passe, ouvrez ce lien (valable 20 minutes) :",
          lien,
          "",
          "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.",
          "Le secrétariat ne vous demandera jamais votre mot de passe.",
        ].join("\n"),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!reponse.ok) {
      console.error("[auth/reset] Le fournisseur a refusé la demande", reponse.status);
      return false;
    }
    const resultat = (await reponse.json()) as { id?: string };
    return typeof resultat.id === "string" && resultat.id.length > 0;
  } catch (erreur) {
    console.error("[auth/reset] Envoi indisponible", erreur instanceof Error ? erreur.name : "erreur");
    return false;
  }
}
