/** Construire un lien vers la liste nominative officielle de classes choisies. */
export function urlImpressionClasses(anneeId: string, classesIds: string[]): string {
  const params = new URLSearchParams({
    annee: anneeId,
    classes: [...new Set(classesIds)].join(","),
  });
  return "/impression/classes?" + params.toString();
}
