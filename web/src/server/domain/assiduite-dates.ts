/**
 * Contrôle du calendrier à la saisie d'assiduité.
 *
 * POURQUOI CE MODULE EXISTE
 * --------------------------
 * La base de production porte 23 absences datées d'un DIMANCHE : la saisie
 * n'a jamais confronté la date au calendrier scolaire. Une absence un jour
 * sans cours n'est pas une anomalie cosmétique — elle gonfle le cumul horaire
 * reporté sur le bulletin, et elle déclenche une notification aux tuteurs
 * pour un cours qui n'a pas eu lieu.
 *
 * POURQUOI IL N'EST PAS DANS `calendrier-scolaire.ts`
 * ---------------------------------------------------
 * `calendrier-scolaire.ts` répond à « quelles dates existent » et « quels
 * événements couvrent cette date ». Il ne décide délibérément pas ce qui est
 * ouvré. La règle d'acceptation d'une absence est une règle de vie scolaire,
 * pas de calendrier civil : elle vit donc ici et CONSOMME le module calendrier
 * au lieu de redéfinir la notion de plage d'événement.
 *
 * Fonction PURE : aucune base, aucune horloge. Les jours ouvrés, la période et
 * les vacances sont fournis par l'appelant, qui seul sait les lire.
 */

// POURQUOI L'EXTENSION « .ts » EST ÉCRITE ICI
// --------------------------------------------
// Ce module est importé par un test exécuté par le lanceur natif de Node, qui
// résout les modules en ESM : un spécificateur relatif SANS extension y est une
// erreur de résolution, et le test ne démarrait pas. Le compilateur de Next.js,
// lui, refuse l'extension explicite tant que `allowImportingTsExtensions` n'est
// activé dans `tsconfig.json`, après vérification que `next build` l'accepte.
// L'extension satisfait le lanceur de tests et les bundlers, et le drapeau
// évite d'avoir à masquer une erreur du compilateur dans du code applicatif.
import { type DateISO, evenementsPourDate, jourSemaineISO, parserDateISO } from "./calendrier-scolaire.ts";

/**
 * Jours de classe par défaut : lundi (1) à SAMEDI (6).
 *
 * Au Tchad le samedi est un jour de cours ordinaire. Le refuser invaliderait
 * une journée de saisie sur six. Seul le dimanche est hors classe par défaut.
 * Ce tableau n'est qu'un repli : dès que l'établissement configurera ses jours
 * ouvrés par année, l'appelant passera `joursOuvres` et ce défaut s'effacera.
 */
export const JOURS_OUVRES_PAR_DEFAUT: readonly number[] = [1, 2, 3, 4, 5, 6];

/** Plage de fermeture : même forme que les événements du calendrier scolaire. */
export interface PlageVacances {
  id: string;
  titre: string;
  type: string;
  dateDebut: DateISO;
  dateFin: DateISO;
}

export interface EntreeValidationDate {
  /** Date saisie, attendue au format ISO YYYY-MM-DD. */
  date: unknown;
  debutPeriode: DateISO;
  finPeriode: DateISO;
  /** Numérotation ISO lundi=1 ... dimanche=7. Défaut : lundi à samedi. */
  joursOuvres?: readonly number[];
  vacances?: readonly PlageVacances[];
}

export interface ResultatValidationDate {
  valide: boolean;
  /** Message destiné à l'agent de saisie, pas au journal technique. */
  raison?: string;
}

const NOMS_JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

/**
 * Décide si une date d'absence ou de retard est recevable.
 *
 * L'ordre des contrôles est voulu : on commence par le format, puis par la
 * période, puis par le jour de semaine, et les vacances en dernier. Un agent
 * qui s'est trompé d'année doit lire « hors période » et non « jour de
 * vacances », qui l'enverrait chercher le mauvais problème.
 */
export function validerDateAssiduite(entree: EntreeValidationDate): ResultatValidationDate {
  const { date, debutPeriode, finPeriode, joursOuvres = JOURS_OUVRES_PAR_DEFAUT, vacances = [] } = entree;

  if (typeof date !== "string" || date.trim() === "") {
    return { valide: false, raison: "Date requise au format AAAA-MM-JJ." };
  }

  const dateISO = date.trim();
  try {
    parserDateISO(dateISO);
  } catch {
    return { valide: false, raison: `Date invalide « ${dateISO} » : le format attendu est AAAA-MM-JJ.` };
  }

  // Les bornes viennent de la base ; une période inversée est un défaut de
  // configuration, et le dire vaut mieux que d'accepter n'importe quelle date.
  try {
    parserDateISO(debutPeriode);
    parserDateISO(finPeriode);
  } catch {
    return { valide: false, raison: "Les dates de la période scolaire sont illisibles." };
  }
  if (debutPeriode > finPeriode) {
    return { valide: false, raison: "La période scolaire a des bornes inversées." };
  }

  // Comparaison de chaînes ISO : lexicographique = chronologique, bornes incluses.
  if (dateISO < debutPeriode) {
    return { valide: false, raison: `Le ${dateISO} précède le début de la période (${debutPeriode}).` };
  }
  if (dateISO > finPeriode) {
    return { valide: false, raison: `Le ${dateISO} suit la fin de la période (${finPeriode}).` };
  }

  const jour = jourSemaineISO(dateISO);
  if (!joursOuvres.includes(jour)) {
    return { valide: false, raison: `Le ${dateISO} est un ${NOMS_JOURS[jour - 1]} : ce n'est pas un jour de classe.` };
  }

  // On réutilise `evenementsPourDate` : la logique de plage incluse, et le
  // refus d'un événement aux dates inversées, sont déjà écrits et testés là-bas.
  // Une plage mal saisie y lève une erreur : on la traduit en refus plutôt que
  // de laisser remonter une exception au milieu d'un enregistrement d'appel.
  let fermetures: readonly PlageVacances[];
  try {
    fermetures = evenementsPourDate(dateISO, vacances);
  } catch {
    return { valide: false, raison: "Une plage de vacances est mal configurée : dates inversées ou illisibles." };
  }
  if (fermetures.length > 0) {
    return { valide: false, raison: `Le ${dateISO} tombe pendant « ${fermetures[0].titre} ».` };
  }

  return { valide: true };
}
