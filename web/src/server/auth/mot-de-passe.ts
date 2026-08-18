import { hash, verify } from "@node-rs/argon2";

/**
 * Hachage des mots de passe.
 *
 * Argon2id avec les paramètres recommandés par l'OWASP (19 Mio de mémoire,
 * 2 passes, parallélisme 1) — le meilleur compromis entre résistance au
 * craquage GPU et temps de réponse acceptable sur une petite instance.
 */

const OPTIONS = {
  algorithm: 2, // Argon2id
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hacherMotDePasse(motDePasse: string): Promise<string> {
  return hash(motDePasse, OPTIONS);
}

/**
 * Vérifie un mot de passe contre son empreinte.
 *
 * Ne lève jamais : une empreinte corrompue ou un format inattendu renvoie
 * `false` plutôt qu'une erreur 500 qui révélerait l'état interne du compte.
 */
export async function verifierMotDePasse(empreinte: string, motDePasse: string): Promise<boolean> {
  try {
    return await verify(empreinte, motDePasse, OPTIONS);
  } catch {
    return false;
  }
}

/**
 * Règles de robustesse minimales.
 *
 * Volontairement sobres : la longueur prime sur la complexité symbolique.
 * Une exigence de « majuscule + chiffre + caractère spécial » pousse surtout
 * les agents à écrire leur mot de passe sur un papier collé à l'écran.
 */
export function validerMotDePasse(motDePasse: string): { valide: boolean; message?: string } {
  if (motDePasse.length < 10) {
    return { valide: false, message: "Le mot de passe doit contenir au moins 10 caractères." };
  }
  if (motDePasse.length > 128) {
    return { valide: false, message: "Le mot de passe ne doit pas dépasser 128 caractères." };
  }
  if (/^\d+$/.test(motDePasse)) {
    return { valide: false, message: "Le mot de passe ne peut pas être composé uniquement de chiffres." };
  }
  return { valide: true };
}
