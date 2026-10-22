import { z } from "zod";

/**
 * Informations administratives d'un établissement unique.
 * Le nom légal, le sigle et la devise restent immuables ici pour éviter
 * des identités contradictoires entre l'application et les documents émis.
 */
const champTexte = (taille: number) =>
  z.string().trim().max(taille, `Maximum ${taille} caractères.`).transform((v) => v || null);

const telephone = z.string().trim().max(30)
  .refine((v) => !v || (v.length >= 6 && /^[+0-9() .-]+$/.test(v)), "Numéro de téléphone invalide.")
  .transform((v) => v || null);

const email = z.string().trim().max(160)
  .refine((v) => !v || z.email().safeParse(v).success, "Adresse e-mail invalide.")
  .transform((v) => v ? v.toLowerCase() : null);

const siteWeb = z.string().trim().max(240)
  .refine((v) => {
    if (!v) return true;
    try {
      const u = new URL(v);
      return u.protocol === "https:" && u.hostname.includes(".")
        && !u.username && !u.password && !u.port
        && !u.hash;
    } catch {
      return false;
    }
  }, "Utilisez une adresse https:// valide sans identifiants ni port.")
  .transform((v) => v || null);

export const schemaIdentiteLycee = z.object({
  version: z.string().trim().min(1, "Version de la fiche absente. Rechargez la page.").max(100),
  adresse: champTexte(220),
  ville: champTexte(100),
  pays: champTexte(100),
  telephone,
  email,
  siteWeb,
  ministereTutelle: champTexte(180),
  autorisationNumero: champTexte(100),
  nomProviseur: champTexte(140),
  nomCenseur: champTexte(140),
}).strict();

export type IdentiteLyceeModifiable = z.infer<typeof schemaIdentiteLycee>;
export type SaisieIdentiteLycee = z.input<typeof schemaIdentiteLycee>;
