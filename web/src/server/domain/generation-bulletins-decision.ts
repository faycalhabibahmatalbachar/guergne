/**
 * Porte d'entrée de la génération des bulletins : a-t-on le DROIT d'écrire ?
 *
 * POURQUOI CE MODULE EST SÉPARÉ, ET SANS AUCUN IMPORT
 * ----------------------------------------------------
 * La décision « on régénère, ou on refuse » est la seule chose qui protège
 * 1 647 bulletins déjà publiés. Elle doit donc être éprouvée par des tests,
 * et un test ne doit jamais avoir besoin d'une base de données pour vérifier
 * un refus. `generation-bulletins.ts` ouvre des connexions : il ne peut pas
 * être chargé par le lanceur de tests de Node. Ce fichier-ci est pur — pas un
 * import, pas une horloge, pas d'aléatoire — donc testable directement.
 *
 * CE QU'ON PROTÈGE
 * -----------------
 * Un bulletin publié a été vu par une famille. Le recalculer, c'est changer
 * sous ses yeux une moyenne et un rang qu'elle a déjà lus, et qu'un conseil de
 * classe a peut-être déjà commentés. Une période verrouillée porte la même
 * intention, en amont : la saisie est closée, les chiffres sont arrêtés.
 *
 * Le refus arrive AVANT toute écriture. Refuser au milieu de la boucle
 * laisserait une classe à moitié régénérée — la moitié des rangs calculés sur
 * un effectif, l'autre sur un autre — ce qui est pire que ne rien faire.
 */

export interface EntreeDecisionGeneration {
  /** Libellé de la classe, pour que le message dise de quoi on parle. */
  classe?: string;
  /** Libellé de la période, même raison. */
  periode?: string;
  /** `periodes.est_verrouillee` pour la période visée. */
  periodeVerrouillee: boolean;
  /** Nombre de bulletins DÉJÀ PUBLIÉS pour cette classe et cette période. */
  bulletinsPublies: number;
  /** Dérogation explicitement demandée par un responsable. Jamais vraie par défaut. */
  forcer?: boolean;
  /** Motif écrit de la dérogation. Obligatoire dès que `forcer` est vrai. */
  motif?: string | null;
}

export interface DecisionGeneration {
  autorise: boolean;
  /** Phrase destinée à l'utilisateur : ce qui bloque, et quoi faire ensuite. */
  raison?: string;
  /** Motif retenu, nettoyé, à consigner au journal d'audit. */
  motifDerogation?: string;
}

/**
 * Décide si la génération peut écrire, et explique tout refus.
 *
 * Deux obstacles, cumulables : la période est verrouillée, et/ou des bulletins
 * de la classe sont déjà publiés. Sans obstacle, on laisse passer sans rien
 * exiger — la génération d'une période ouverte reste un geste ordinaire.
 *
 * LA DÉROGATION N'EST PAS UN INTERRUPTEUR
 * ----------------------------------------
 * Elle exige un motif écrit. Un paramètre booléen seul finirait par être mis à
 * `true` « juste pour cette fois » dans un appel oublié ; un motif obligatoire
 * force celui qui passe outre à dire pourquoi, et laisse une trace nommée dans
 * le journal d'audit. Un motif vide ou blanc ne vaut pas motif.
 */
export function deciderGeneration(entree: EntreeDecisionGeneration): DecisionGeneration {
  const publies = Number.isFinite(entree.bulletinsPublies) ? Math.max(0, Math.trunc(entree.bulletinsPublies)) : 0;
  const periode = entree.periode?.trim() || "la période visée";
  const classe = entree.classe?.trim() || "cette classe";

  const obstacles: string[] = [];
  if (entree.periodeVerrouillee) {
    obstacles.push(`la période « ${periode} » est verrouillée`);
  }
  if (publies > 0) {
    obstacles.push(
      `${publies} bulletin(s) de ${classe} sont déjà publiés sur « ${periode} » (les familles les ont vus)`,
    );
  }

  if (obstacles.length === 0) {
    // Rien ne bloque : la dérogation éventuelle n'a pas d'objet, on ne
    // consigne donc aucun motif — un motif sans dérogation effective
    // encombrerait le journal d'audit de traces qui n'attestent de rien.
    return { autorise: true };
  }

  const motif = (entree.motif ?? "").trim();

  if (!entree.forcer) {
    return {
      autorise: false,
      raison:
        `Génération refusée : ${obstacles.join(", et ")}. ` +
        "Un bulletin publié ne doit plus changer de valeur. " +
        "Dépubliez les bulletins concernés ou déverrouillez la période, puis relancez.",
    };
  }

  if (motif.length === 0) {
    return {
      autorise: false,
      raison:
        `Dérogation refusée : ${obstacles.join(", et ")}. ` +
        "Passer outre exige un motif écrit, qui sera consigné au journal d'audit.",
    };
  }

  return { autorise: true, motifDerogation: motif };
}
