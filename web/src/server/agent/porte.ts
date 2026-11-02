/**
 * La porte : lecture toujours, écriture seulement si on l'a décidé.
 *
 * POURQUOI CETTE LOGIQUE VIT SEULE
 * ---------------------------------
 * Elle est la seule chose qui rende une mise en production de l'agent
 * acceptable : elle permet de livrer les consultations sans emporter, du même
 * geste, la création et la suppression d'absences — qui déclenchent la
 * notification des tuteurs.
 *
 * Une décision pareille doit être éprouvée, et elle ne peut l'être que si
 * l'éprouver n'exige pas d'ouvrir une base de données. Isolée ici, elle se
 * teste en quelques millisecondes, sans environnement.
 */

/**
 * Les écritures sont-elles ouvertes sur ce déploiement ?
 *
 * La comparaison est stricte et volontairement intolérante : un « 1 », un
 * « yes » ou un « TRUE » recopiés d'une autre configuration ne doivent pas
 * ouvrir les écritures par accident.
 */
export function ecrituresActives(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AGENT_ECRITURES_ACTIVES === "true";
}

/** Ce que vaut une opération demandée. */
export type Classement =
  | { genre: "lecture" }
  | { genre: "ecriture" }
  | { genre: "inconnue" }
  | { genre: "desactivee" };

/**
 * Classe une opération demandée.
 *
 * On distingue « inconnue » de « desactivee » : un nom hors catalogue est une
 * erreur du modèle, une écriture éteinte est une décision de déploiement. Les
 * confondre ferait chercher au mauvais endroit.
 */
export function classerOperation(
  action: string,
  lectures: readonly string[],
  ecritures: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Classement {
  if (lectures.includes(action)) return { genre: "lecture" };
  if (!ecritures.includes(action)) return { genre: "inconnue" };
  return ecrituresActives(env) ? { genre: "ecriture" } : { genre: "desactivee" };
}
