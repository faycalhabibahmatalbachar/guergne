/**
 * Barème officiel des appréciations de travail du bulletin, sur 20.
 *
 * Bornes sans chevauchement :
 * 0–2,99 Travail nul ; 3–4,99 Médiocre ; 5–5,99 Très faible ;
 * 6–7,99 Faible ; 8–9,99 Insuffisant ; 10–10,99 Moyen ;
 * 11–11,99 Passable ; 12–13,99 Assez-bien ; 14–15,99 Bien ;
 * 16–17,99 Très bien ; 18–20 Excellent Travail.
 */
export function libelleAppreciationTravail(moyenne: number | null): string | null {
  if (moyenne === null || !Number.isFinite(moyenne) || moyenne < 0 || moyenne > 20) return null;
  if (moyenne >= 18) return "Excellent";
  if (moyenne >= 16) return "Très bien";
  if (moyenne >= 14) return "Bien";
  if (moyenne >= 12) return "Assez-bien";
  if (moyenne >= 11) return "Passable";
  if (moyenne >= 10) return "Moyen";
  if (moyenne >= 8) return "Insuffisant";
  if (moyenne >= 6) return "Faible";
  if (moyenne >= 5) return "Très faible";
  if (moyenne >= 3) return "Médiocre";
  return "Travail nul";
}
