/**
 * Libellés du fil d'Ariane.
 *
 * Le fil est calculé une fois dans l'en-tête global plutôt que déclaré page par
 * page : dix-huit pages déclaraient déjà leur titre à la main, il n'était pas
 * question de leur faire déclarer aussi leur ascendance.
 *
 * Les intitulés reprennent EXACTEMENT ceux de la barre latérale. Un menu qui
 * dit « Comptes parents » et un fil qui dit « Parents » font douter qu'on soit
 * au bon endroit.
 */

/** Segment d'URL vers intitulé affiché. */
const LIBELLES: Record<string, string> = {
  default: "Tableau de bord",

  eleves: "Élèves",
  classes: "Classes",
  parents: "Comptes parents",
  "emploi-du-temps": "Emploi du temps",

  notes: "Notes",
  bulletins: "Bulletins",

  assiduite: "Assiduité",
  discipline: "Discipline",
  communication: "Communication",

  finances: "Finances",
  personnel: "Personnel",
  parametres: "Paramètres",

  // Sous-pages
  nouveau: "Inscription",
  importer: "Import",
  completer: "Complément de dossier",
  journee: "Journée",
  calendrier: "Calendrier",
  appreciations: "Appréciations",
  conseils: "Conseils de classe",
  statistiques: "Statistiques",
  caisse: "Caisse",
  exonerations: "Exonérations",
  audit: "Journal d'audit",
  notifications: "Notifications",
  diagnostic: "Diagnostic",
  etablissement: "Établissement",
  familles: "Familles",
  doublons: "Doublons",
  invitations: "Invitations",
  "coming-soon": "Bientôt disponible",
};

/**
 * Intitulé donné à un identifiant dans l'URL, selon le module qui le précède.
 * On ne peut pas afficher le nom de l'élève : le fil est rendu côté client,
 * sans accès à la base. « Dossier élève » est honnête ; un identifiant brut ne
 * renseigne personne.
 */
const SEGMENT_DYNAMIQUE: Record<string, string> = {
  eleves: "Dossier élève",
  parents: "Fiche parent",
  personnel: "Fiche agent",
  classes: "Classe",
  doublons: "Rapprochement",
};

export interface MailleFil {
  libelle: string;
  /** Absent sur la dernière maille : la page courante n'est pas un lien. */
  url?: string;
}

/**
 * Construit le fil d'Ariane d'un chemin.
 *
 * La racine `/dashboard` n'apparaît pas : ce n'est pas une page, et un fil dont
 * la première maille mène au vide est pire qu'un fil absent.
 */
export function filAriane(chemin: string): MailleFil[] {
  const segments = chemin.split("/").filter(Boolean);
  if (segments[0] !== "dashboard") return [];

  // Le tableau de bord est sa propre racine : pas de doublon dans le fil.
  if (segments.length <= 2 && segments[1] === "default") return [];

  const mailles: MailleFil[] = [{ libelle: "Tableau de bord", url: "/dashboard/default" }];

  let cumul = "/dashboard";
  for (let i = 1; i < segments.length; i += 1) {
    const segment = segments[i];
    cumul += `/${segment}`;

    const libelle = LIBELLES[segment] ?? SEGMENT_DYNAMIQUE[segments[i - 1]] ?? "Détail";
    mailles.push({ libelle, url: i === segments.length - 1 ? undefined : cumul });
  }

  return mailles;
}
