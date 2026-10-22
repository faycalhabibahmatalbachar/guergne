/** État de consultation d'un compte parent, distinct de la livraison SMS. */
export type EtatCompteParent = "sans_compte" | "revoque" | "invite" | "actif";
export interface DonneesEtatCompteParent {
  utilisateurId: string | null;
  compteActif: boolean | null;
  derniereConnexion: string | null;
}
export function etatCompteParent(t: DonneesEtatCompteParent): EtatCompteParent {
  if (!t.utilisateurId) return "sans_compte";
  if (t.compteActif !== true) return "revoque";
  return t.derniereConnexion ? "actif" : "invite";
}
