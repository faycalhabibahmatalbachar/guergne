import "server-only";

import { createHash } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { fichiers } from "@/server/db/schema";

/**
 * Stockage des fichiers.
 *
 * Adaptateur unique, comme la passerelle SMS : le jour où l'établissement
 * ouvre un compte de stockage objet, seul ce fichier change.
 *
 * Aujourd'hui le contenu vit en base. Deux garde-fous rendent ce choix
 * tenable sur un quota de 500 Mo :
 *   - la compression se fait DANS LE NAVIGATEUR avant l'envoi. On reçoit du
 *     WebP déjà réduit, ce qui évite une dépendance native côté serveur et,
 *     surtout, économise la bande passante à la saisie — décisif sur une
 *     connexion tchadienne.
 *   - le serveur reste juge : il vérifie type et taille, et refuse le reste.
 *     Ne jamais faire confiance à ce que le client annonce.
 */

export const TAILLE_MAX_OCTETS = 200 * 1024;
export const TYPES_IMAGE = ["image/webp", "image/jpeg", "image/png"];
export const TYPES_DOCUMENT = [...TYPES_IMAGE, "application/pdf"];

export type UsageFichier =
  | "PHOTO_ELEVE"
  | "PHOTO_ENSEIGNANT"
  | "PIECE_DOSSIER"
  | "LOGO_ETABLISSEMENT"
  | "CACHET_ETABLISSEMENT"
  | "PIECE_JOINTE"
  | "JUSTIFICATIF";

export interface ResultatStockage {
  ok: boolean;
  id?: string;
  erreur?: string;
}

/**
 * Enregistre un fichier et retourne son identifiant.
 *
 * Déduplication par empreinte : deux dépôts du même contenu ne consomment la
 * place qu'une fois. Une photo de classe déposée en pièce jointe sur trente
 * dossiers ne pèse alors qu'une fois — sur un quota de 500 Mo, ce n'est pas
 * un détail.
 */
export async function enregistrerFichier(
  donnees: {
    contenu: Buffer;
    nomOrigine: string;
    mimeType: string;
    usage: UsageFichier;
    largeur?: number;
    hauteur?: number;
  },
  deposePar?: string,
  typesAutorises: string[] = TYPES_IMAGE,
): Promise<ResultatStockage> {
  const { contenu, mimeType, nomOrigine, usage } = donnees;

  if (!typesAutorises.includes(mimeType)) {
    return {
      ok: false,
      erreur: `Format non accepté (${mimeType}). Attendu : ${typesAutorises.join(", ")}.`,
    };
  }

  if (contenu.length === 0) return { ok: false, erreur: "Fichier vide." };

  if (contenu.length > TAILLE_MAX_OCTETS) {
    return {
      ok: false,
      erreur: `Fichier trop volumineux (${Math.round(contenu.length / 1024)} ko, maximum ${TAILLE_MAX_OCTETS / 1024} ko).`,
    };
  }

  // Le type annoncé par le client ne prouve rien : on vérifie les octets de
  // tête. Un exécutable renommé en .webp ne doit pas entrer en base.
  if (!signatureValide(contenu, mimeType)) {
    return { ok: false, erreur: "Le contenu ne correspond pas au format annoncé." };
  }

  const empreinte = createHash("sha256").update(contenu).digest("hex");

  const [existant] = await db
    .select({ id: fichiers.id })
    .from(fichiers)
    .where(eq(fichiers.empreinte, empreinte))
    .limit(1);

  if (existant) return { ok: true, id: existant.id };

  const [cree] = await db
    .insert(fichiers)
    .values({
      usage,
      nomOrigine: nomOrigine.slice(0, 200),
      mimeType,
      tailleOctets: contenu.length,
      largeur: donnees.largeur ?? null,
      hauteur: donnees.hauteur ?? null,
      contenu,
      empreinte,
      deposePar: deposePar ?? null,
    })
    .returning({ id: fichiers.id });

  return { ok: true, id: cree.id };
}

/**
 * Vérifie les octets de tête (« nombre magique ») du fichier.
 * C'est le contrôle minimal contre un fichier déguisé.
 */
function signatureValide(contenu: Buffer, mimeType: string): boolean {
  if (contenu.length < 12) return false;

  switch (mimeType) {
    case "image/webp":
      // "RIFF" .... "WEBP"
      return contenu.toString("ascii", 0, 4) === "RIFF" && contenu.toString("ascii", 8, 12) === "WEBP";
    case "image/jpeg":
      return contenu[0] === 0xff && contenu[1] === 0xd8 && contenu[2] === 0xff;
    case "image/png":
      return contenu[0] === 0x89 && contenu.toString("ascii", 1, 4) === "PNG";
    case "application/pdf":
      return contenu.toString("ascii", 0, 5) === "%PDF-";
    default:
      return false;
  }
}

export interface FichierLu {
  contenu: Buffer;
  mimeType: string;
  tailleOctets: number;
  nomOrigine: string;
}

export async function lireFichier(id: string): Promise<FichierLu | null> {
  const [ligne] = await db
    .select({
      contenu: fichiers.contenu,
      mimeType: fichiers.mimeType,
      tailleOctets: fichiers.tailleOctets,
      nomOrigine: fichiers.nomOrigine,
    })
    .from(fichiers)
    .where(eq(fichiers.id, id))
    .limit(1);

  if (!ligne) return null;

  return {
    contenu: Buffer.from(ligne.contenu as unknown as Uint8Array),
    mimeType: ligne.mimeType,
    tailleOctets: ligne.tailleOctets,
    nomOrigine: ligne.nomOrigine,
  };
}

/** Espace occupé par les fichiers — surveillance du quota. */
export async function occupationStockage(): Promise<{
  nbFichiers: number;
  octets: number;
  parUsage: Array<{ usage: string; nb: number; octets: number }>;
}> {
  const total = await db.execute<{ nb: number; octets: number }>(sql`
    SELECT count(*)::int AS nb, COALESCE(SUM(taille_octets), 0)::bigint AS octets FROM fichiers
  `);
  const detail = await db.execute<{ usage: string; nb: number; octets: number }>(sql`
    SELECT usage::text, count(*)::int AS nb, COALESCE(SUM(taille_octets), 0)::bigint AS octets
      FROM fichiers GROUP BY usage ORDER BY 3 DESC
  `);

  return {
    nbFichiers: Number(total.rows[0]?.nb ?? 0),
    octets: Number(total.rows[0]?.octets ?? 0),
    parUsage: detail.rows.map((l) => ({
      usage: l.usage,
      nb: Number(l.nb),
      octets: Number(l.octets),
    })),
  };
}
