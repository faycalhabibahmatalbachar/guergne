import { z } from "zod";

const optionalText = (longueur: number) =>
  z.string().trim().max(longueur, `Maximum ${longueur} caractères.`).transform((value) => value || null);

const email = z.string().trim().max(254).refine(
  (value) => !value || z.email().safeParse(value).success,
  "Adresse e-mail invalide.",
).transform((value) => value ? value.toLowerCase() : null);

const telephone = z.string().trim().max(32).refine(
  (value) => !value || /^[+0-9 ()-]{8,32}$/.test(value),
  "Numéro invalide : utilisez des chiffres et éventuellement +, espaces, parenthèses ou tirets.",
).transform((value) => value || null);

export function siteOfficielValide(valeur: string): boolean {
  if (!valeur) return true;
  try {
    const url = new URL(valeur);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

const siteWeb = z.string().trim().max(250).refine(
  siteOfficielValide,
  "Utilisez une adresse HTTPS valide (sans identifiants).",
).transform((value) => value || null);

export const schemaIdentiteLycee = z.object({
  version: z.string().trim().min(1).max(100),
  adresse: optionalText(240),
  ville: z.string().trim().min(2, "Indiquez une ville.").max(100),
  pays: z.string().trim().min(2, "Indiquez un pays.").max(100),
  telephone,
  email,
  siteWeb,
  ministereTutelle: optionalText(180),
  autorisationNumero: optionalText(100),
  nomProviseur: optionalText(150),
  nomCenseur: optionalText(150),
});

export type SaisieIdentiteLycee = z.input<typeof schemaIdentiteLycee>;
