import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";

import { envoyerParGmail, smtpDisponible } from "@/server/auth/gmail-smtp";

import { db } from "@/server/db";
import { roleAutoriseAdministration } from "@/lib/acces-administration";
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
    .select({ id: utilisateurs.id, hash: utilisateurs.motDePasseHash, actif: utilisateurs.actif, role: utilisateurs.role })
    .from(utilisateurs)
    .where(eq(utilisateurs.id, payload.id))
    .limit(1);
  if (!utilisateur?.actif || !utilisateur.hash || !roleAutoriseAdministration(utilisateur.role)) return null;

  const attendu = Buffer.from(signature(texte, utilisateur.hash), "hex");
  const fourni = Buffer.from(mac, "hex");
  if (attendu.length !== fourni.length || !timingSafeEqual(attendu, fourni)) return null;
  return utilisateur;
}

export function lienReinitialisation(jeton: string): string {
  return BASE_URL + "/auth/reinitialiser?jeton=" + encodeURIComponent(jeton);
}

/** Gmail SMTP est désormais le fournisseur d'envoi réellement configuré en production. */
export function emailsDisponibles(): boolean {
  return smtpDisponible();
}

/** Attendre l'acceptation SMTP avant de répondre à l'utilisateur. */
export async function envoyerEmailReinitialisation(
  destinataire: string,
  lien: string,
): Promise<boolean> {
  if (!emailsDisponibles()) return false;
  return envoyerParGmail(destinataire, lien);
}
