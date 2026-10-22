/**
 * Contrôles métiers purs des périodes scolaires.
 * Les bornes sont inclusives : une période ne peut chevaucher une autre,
 * même d'une seule journée.
 */
export interface PlageScolaire { dateDebut: string; dateFin: string }
export interface PlagePeriode extends PlageScolaire { id: string }

function dateIsoValide(texte: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texte)) return false;
  const date = new Date(`${texte}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === texte;
}

export function verifierDatesPeriode(
  candidate: PlageScolaire,
  annee: PlageScolaire,
  autres: readonly PlagePeriode[],
): Record<string, string> {
  const erreurs: Record<string, string> = {};
  if (!dateIsoValide(candidate.dateDebut)) erreurs.dateDebut = "Date de début invalide.";
  if (!dateIsoValide(candidate.dateFin)) erreurs.dateFin = "Date de fin invalide.";
  if (Object.keys(erreurs).length) return erreurs;

  if (candidate.dateFin <= candidate.dateDebut) {
    erreurs.dateFin = "La date de fin doit suivre la date de début.";
    return erreurs;
  }
  if (candidate.dateDebut < annee.dateDebut) {
    erreurs.dateDebut = "La période doit commencer dans l'année scolaire.";
  }
  if (candidate.dateFin > annee.dateFin) {
    erreurs.dateFin = "La période doit se terminer dans l'année scolaire.";
  }
  if (Object.keys(erreurs).length) return erreurs;

  const chevauchement = autres.some(
    (autre) => candidate.dateDebut <= autre.dateFin && candidate.dateFin >= autre.dateDebut,
  );
  if (chevauchement) {
    erreurs.dateDebut = "Les dates chevauchent une autre période de la même année.";
    erreurs.dateFin = "Ajustez les dates pour supprimer le chevauchement.";
  }
  return erreurs;
}
