/**
 * Fonctions pures du calendrier scolaire.
 *
 * Les dates sont traitées en UTC et au format ISO YYYY-MM-DD afin d'éviter
 * les décalages de fuseau horaire lorsque l'on génère une année entière.
 * Ce module ne décide pas à lui seul si une date est ouvrée : cette décision
 * dépendra des horaires configurés et des événements validés pour l'année.
 */

export type DateISO = string;

export interface JourCalendrier {
  /** Date ISO inclusive, par exemple "2026-10-27". */
  date: DateISO;
  /** Numérotation ISO : lundi=1 ... dimanche=7. */
  jourSemaineISO: number;
  jourDuMois: number;
  mois: number;
  annee: number;
}

export interface EvenementCalendaireDate {
  id: string;
  titre: string;
  type: string;
  dateDebut: DateISO;
  dateFin: DateISO;
}

/** Parse et valide strictement YYYY-MM-DD sans accepter les dates normalisées. */
export function parserDateISO(valeur: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) {
    throw new RangeError(`Date invalide « ${valeur} » : le format attendu est YYYY-MM-DD.`);
  }

  const date = new Date(`${valeur}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== valeur) {
    throw new RangeError(`Date invalide « ${valeur} ».`);
  }

  return date;
}

/** Retourne la numérotation ISO du jour : lundi=1 ... dimanche=7. */
export function jourSemaineISO(valeur: DateISO): number {
  const jourJS = parserDateISO(valeur).getUTCDay();
  return jourJS === 0 ? 7 : jourJS;
}

/**
 * Génère chaque date entre le début et la fin inclus.
 *
 * La fonction génère le calendrier civil, pas les jours de cours. Les jours
 * ouvrés et les plages horaires sont déterminés ensuite par la configuration
 * annuelle, les règles par jour de semaine et les événements validés.
 */
export function genererDatesCalendrier(dateDebut: DateISO, dateFin: DateISO): JourCalendrier[] {
  const debut = parserDateISO(dateDebut);
  const fin = parserDateISO(dateFin);

  if (debut.getTime() > fin.getTime()) {
    throw new RangeError("La date de début doit être antérieure ou égale à la date de fin.");
  }

  const jours: JourCalendrier[] = [];
  for (let temps = debut.getTime(); temps <= fin.getTime(); temps += 24 * 60 * 60 * 1000) {
    const date = new Date(temps);
    const dateISO = date.toISOString().slice(0, 10);
    jours.push({
      date: dateISO,
      jourSemaineISO: jourSemaineISO(dateISO),
      jourDuMois: date.getUTCDate(),
      mois: date.getUTCMonth() + 1,
      annee: date.getUTCFullYear(),
    });
  }

  return jours;
}

/** Retourne les événements qui couvrent une date, bornes incluses. */
export function evenementsPourDate<T extends EvenementCalendaireDate>(
  date: DateISO,
  evenements: readonly T[],
): T[] {
  parserDateISO(date);
  return evenements.filter((evenement) => {
    parserDateISO(evenement.dateDebut);
    parserDateISO(evenement.dateFin);
    if (evenement.dateDebut > evenement.dateFin) {
      throw new RangeError(`L'événement « ${evenement.titre} » a une plage de dates inversée.`);
    }
    return evenement.dateDebut <= date && date <= evenement.dateFin;
  });
}
