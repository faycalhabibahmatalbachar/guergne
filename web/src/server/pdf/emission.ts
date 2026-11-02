/**
 * Décision d'émission d'un document officiel.
 *
 * Un numéro de document est un acte administratif : il est tiré d'une séquence
 * annuelle, il est unique et il part chez la famille. Jusqu'ici chaque GET sur
 * la route d'édition en consommait un, si bien qu'un simple rafraîchissement
 * d'aperçu multipliait les exemplaires officiels d'un même certificat — en
 * production, neuf certificats de scolarité pour six élèves, dont un élève
 * détenteur de trois numéros différents, sans qu'aucun ne fasse foi.
 *
 * Ce module ne contient QUE la décision, sans accès à la base : c'est la règle
 * qu'on veut pouvoir éprouver par des tests, et c'est elle qui protège la
 * séquence. L'appelant fournit ce qu'il a lu, et obéit à ce qui en ressort.
 */

/** Ce qu'on retient d'une émission antérieure retrouvée au registre. */
export interface DocumentAnterieur {
  numero: string;
  codeVerification: string | null;
}

/**
 * Forme attendue de `documents_emis.donnees_figees` pour un document d'élève.
 *
 * On ne décrit que ce dont la décision a besoin : l'année figée, qui dit à
 * quelle année scolaire l'exemplaire déjà émis appartient. Le reste du contenu
 * n'est pas interprété ici, il est rendu tel quel par l'appelant.
 */
export interface DonneesFigeesEleve {
  eleve: Record<string, unknown>;
  scolarite: { anneeLibelle: string; [clef: string]: unknown };
  [clef: string]: unknown;
}

export interface EntreeDecision {
  /** L'émission antérieure, ou `null` si le registre n'en connaît aucune. */
  dejaEmis: DocumentAnterieur | null;
  /** Le contenu figé de cette émission antérieure, tel que lu en base. */
  donneesFigees?: unknown;
  /** Année scolaire du dossier courant, pour savoir si l'antérieur la couvre. */
  anneeAttendue?: string | null;
  /** Réémission explicitement demandée par l'agent, via la requête. */
  reemissionDemandee?: boolean;
  /** Motif saisi par l'agent pour justifier cette réémission. */
  raison?: string | null;
}

export type Decision =
  /** Rendre l'exemplaire déjà émis, avec son numéro et son code d'origine. */
  | {
      action: "rejouer";
      numero: string;
      codeVerification: string | null;
      donneesFigees: DonneesFigeesEleve;
    }
  /** Émettre : consommer un numéro neuf. `raison` n'est posée qu'en réémission. */
  | { action: "emettre"; raison?: string }
  /** Refuser : ni exemplaire servable, ni droit de consommer un numéro. */
  | { action: "refuser"; raison: string };

/** Longueur minimale d'un motif de réémission, pour écarter les « ok » et les « . ». */
const LONGUEUR_MINIMALE_RAISON = 10;

/**
 * Vérifie que `donnees_figees` permet de reconstruire le document à l'identique.
 *
 * Le commentaire d'origine du service promettait une réédition identique, mais
 * la colonne n'était jamais relue : rien ne garantit donc que les lignes déjà
 * en base aient la forme attendue. On contrôle au lieu de supposer.
 */
export function lireDonneesFigees(brut: unknown): DonneesFigeesEleve | null {
  if (typeof brut === "string") {
    // Certains pilotes rendent le jsonb en texte : on tente une seule fois.
    try {
      return lireDonneesFigees(JSON.parse(brut));
    } catch {
      return null;
    }
  }
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return null;

  const objet = brut as Record<string, unknown>;
  const eleve = objet.eleve;
  const scolarite = objet.scolarite;
  if (!eleve || typeof eleve !== "object") return null;
  if (!scolarite || typeof scolarite !== "object") return null;
  const annee = (scolarite as Record<string, unknown>).anneeLibelle;
  if (typeof annee !== "string" || !annee) return null;

  return objet as unknown as DonneesFigeesEleve;
}

/**
 * Décide s'il faut rejouer l'exemplaire existant, en émettre un neuf, ou refuser.
 *
 * Ordre volontaire : la réémission explicite est examinée d'abord, parce qu'elle
 * est le seul cas où l'on accepte de consommer un numéro alors qu'un exemplaire
 * existe déjà. Tout le reste penche vers le rejeu.
 */
export function deciderEmission({
  dejaEmis,
  donneesFigees,
  anneeAttendue,
  reemissionDemandee,
  raison,
}: EntreeDecision): Decision {
  if (reemissionDemandee) {
    const motif = (raison ?? "").trim();
    if (motif.length < LONGUEUR_MINIMALE_RAISON) {
      return {
        action: "refuser",
        raison:
          "Une réémission consomme un numéro officiel : indiquez un motif d'au moins " +
          `${LONGUEUR_MINIMALE_RAISON} caractères (exemplaire perdu, erreur de saisie…).`,
      };
    }
    return { action: "emettre", raison: motif };
  }

  if (!dejaEmis) return { action: "emettre" };

  const figees = lireDonneesFigees(donneesFigees);
  if (!figees) {
    // Un numéro est déjà parti chez la famille mais on ne sait pas reconstruire
    // le document qui le portait. En émettre un neuf en silence, c'est le bug
    // d'origine : deux numéros pour un seul acte, et aucun qui fasse foi. On
    // s'arrête donc, et on laisse l'agent trancher par une réémission motivée.
    return {
      action: "refuser",
      raison: `Le document ${dejaEmis.numero} est déjà au registre mais son contenu figé est illisible : réémission explicite requise.`,
    };
  }

  if (anneeAttendue && figees.scolarite.anneeLibelle !== anneeAttendue) {
    // Changement d'année scolaire : le dossier courant ne parle plus de la même
    // scolarité, un document neuf est légitime et doit porter un numéro neuf.
    return { action: "emettre" };
  }

  return {
    action: "rejouer",
    numero: dejaEmis.numero,
    codeVerification: dejaEmis.codeVerification,
    donneesFigees: figees,
  };
}
