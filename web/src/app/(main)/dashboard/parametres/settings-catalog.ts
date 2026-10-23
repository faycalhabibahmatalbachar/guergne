import type { SettingsSection } from "./_components/settings-navigation";

/**
 * Unique directory of actual lycée settings. All destinations already exist.
 * Never add mock-only routes to this catalog. Permissions are rechecked by
 * each page and server action; filtering here is for navigation only.
 */
export type SettingsPermission =
  | "parametre:modifier"
  | "annee:cloturer"
  | "periode:verrouiller"
  | "periode:deverrouiller"
  | "matiere:gerer"
  | "coefficient:gerer"
  | "classe:creer"
  | "classe:modifier"
  | "notification:configurer"
  | "finance:configurer"
  | "audit:lire";

export const SETTINGS_PERMISSIONS: readonly SettingsPermission[] = [
  "parametre:modifier",
  "annee:cloturer",
  "periode:verrouiller",
  "periode:deverrouiller",
  "matiere:gerer",
  "coefficient:gerer",
  "classe:creer",
  "classe:modifier",
  "notification:configurer",
  "finance:configurer",
  "audit:lire",
];

export type SettingsCard = SettingsSection & {
  droits: readonly SettingsPermission[];
  description: string;
  action: string;
};

export const SETTINGS_CARDS: readonly SettingsCard[] = [
  {
    id: "identite",
    label: "Informations du lycée",
    description: "Coordonnées officielles, contacts et signataires de l'établissement.",
    group: "ÉTABLISSEMENT",
    href: "/dashboard/parametres/etablissement",
    icon: "school",
    keywords: "fiche officielle nom adresse ville pays telephone email site web logo proviseur censeur",
    droits: ["parametre:modifier"],
    action: "Ouvrir",
  },
  {
    id: "annees",
    label: "Années et périodes",
    description: "Années scolaires, trimestres ou semestres, dates et clôtures.",
    group: "ÉTABLISSEMENT",
    href: "/dashboard/parametres?onglet=annees",
    icon: "calendar",
    keywords: "annee scolaire en cours trimestre semestre cloture verrouillage",
    droits: ["annee:cloturer", "periode:verrouiller", "periode:deverrouiller"],
    action: "Configurer",
  },
  {
    id: "matieres",
    label: "Matières et séries",
    description: "Catalogue des matières, séries et états d'activation.",
    group: "SCOLARITÉ ET PÉDAGOGIE",
    href: "/dashboard/parametres?onglet=matieres",
    icon: "book",
    keywords: "matiere serie enseignement catalogue",
    droits: ["matiere:gerer"],
    action: "Ouvrir",
  },
  {
    id: "coefficients",
    label: "Coefficients",
    description: "Coefficients et pondération des évaluations par niveau et série.",
    group: "SCOLARITÉ ET PÉDAGOGIE",
    href: "/dashboard/parametres?onglet=coefficients",
    icon: "calculator",
    keywords: "notes ponderation interrogation devoir composition bareme",
    droits: ["coefficient:gerer"],
    action: "Configurer",
  },
  {
    id: "classes",
    label: "Classes",
    description: "Structure des classes, niveaux, séries et capacités.",
    group: "SCOLARITÉ ET PÉDAGOGIE",
    href: "/dashboard/parametres?onglet=classes",
    icon: "class",
    keywords: "classe capacite niveau serie",
    droits: ["classe:creer", "classe:modifier"],
    action: "Ouvrir",
  },
  {
    id: "parents",
    label: "Invitations parents",
    description: "Durée de validité des codes d'activation des comptes parents.",
    group: "COMMUNICATION",
    href: "/dashboard/parametres/parents",
    icon: "parents",
    keywords: "activation invitation validite code parents tuteurs",
    droits: ["parametre:modifier"],
    action: "Configurer",
  },
  {
    id: "notifications",
    label: "Notifications et SMS",
    description: "Canaux d'envoi, politiques de notification et seuils d'incident.",
    group: "COMMUNICATION",
    href: "/dashboard/parametres/notifications",
    icon: "bell",
    keywords: "push sms politiques canaux seuil incident cout",
    droits: ["notification:configurer"],
    action: "Ouvrir",
  },
  {
    id: "finances",
    label: "Règles financières",
    description: "Retenue des bulletins pour impayé et seuil de tolérance en FCFA.",
    group: "FINANCES ET CONTRÔLE",
    href: "/dashboard/parametres/finances",
    icon: "wallet",
    keywords: "bulletins impayes seuil fcfa retenue",
    droits: ["finance:configurer"],
    action: "Configurer",
  },
  {
    id: "diagnostic",
    label: "Diagnostic",
    description: "Cohérence de la fiche du lycée, des périodes et du référentiel.",
    group: "FINANCES ET CONTRÔLE",
    href: "/dashboard/parametres/diagnostic",
    icon: "diagnostic",
    keywords: "verification configuration coherence controle annee",
    droits: ["parametre:modifier"],
    action: "Lancer",
  },
  {
    id: "audit",
    label: "Journal d'audit",
    description: "Historique des opérations et des changements effectués.",
    group: "FINANCES ET CONTRÔLE",
    href: "/dashboard/parametres/audit",
    icon: "audit",
    keywords: "historique actions acteur trace securite",
    droits: ["audit:lire"],
    action: "Voir",
  },
];
