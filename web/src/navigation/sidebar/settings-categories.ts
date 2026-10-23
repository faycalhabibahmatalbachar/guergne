import {
  Building2,
  BookOpenCheck,
  Wallet,
  MessagesSquare,
  ShieldCheck,
} from "lucide-react";

import type { Action } from "@/server/guard/permissions";

/**
 * Five sections of the ONE lycée. No multi-school administration.
 * The same source drives sidebar navigation, active state and category pages.
 */
export const SETTINGS_CATEGORIES = [
  {
    id: "lycee",
    title: "Le lycée",
    heading: "Gestion de l’établissement",
    description: "Coordonnées officielles, responsables et calendrier scolaire.",
    icon: Building2,
    action: ["parametre:modifier", "annee:cloturer", "periode:verrouiller", "periode:deverrouiller"],
    cards: ["identite", "annees"],
  },
  {
    id: "scolarite",
    title: "Scolarité",
    heading: "Scolarité et pédagogie",
    description: "Matières, séries, coefficients et structure des classes.",
    icon: BookOpenCheck,
    action: ["matiere:gerer", "coefficient:gerer", "classe:creer", "classe:modifier"],
    cards: ["matieres", "coefficients", "classes"],
  },
  {
    id: "finances",
    title: "Finances",
    heading: "Paramètres financiers",
    description: "Règles de retenue des bulletins et seuils de tolérance.",
    icon: Wallet,
    action: ["finance:configurer"],
    cards: ["finances"],
  },
  {
    id: "communication",
    title: "Communication",
    heading: "Communication et familles",
    description: "Invitations des parents, notifications et politiques SMS.",
    icon: MessagesSquare,
    action: ["parametre:modifier", "notification:configurer"],
    cards: ["parents", "notifications"],
  },
  {
    id: "controle-securite",
    title: "Contrôle et sécurité",
    heading: "Contrôle et sécurité",
    description: "Diagnostic de configuration et journal d’audit.",
    icon: ShieldCheck,
    action: ["parametre:modifier", "audit:lire"],
    cards: ["diagnostic", "audit"],
  },
] as const satisfies ReadonlyArray<{
  id: string;
  title: string;
  heading: string;
  description: string;
  icon: typeof Building2;
  action: readonly Action[];
  cards: readonly string[];
}>;

export type SettingsCategoryId = (typeof SETTINGS_CATEGORIES)[number]["id"];

export function findSettingsCategory(id: string | null | undefined) {
  return SETTINGS_CATEGORIES.find((category) => category.id === id) ?? null;
}

export function settingsCategoryForRoute(
  pathname: string,
  params: Pick<URLSearchParams, "get">,
): SettingsCategoryId | null {
  const prefix = "/dashboard/parametres";
  if (pathname === prefix) {
    const section = findSettingsCategory(params.get("section"));
    if (section) return section.id;

    switch (params.get("onglet")) {
      case "annees": return "lycee";
      case "matieres":
      case "coefficients":
      case "classes": return "scolarite";
      default: return null;
    }
  }

  const routeToCategory: Record<string, SettingsCategoryId> = {
    "/dashboard/parametres/etablissement": "lycee",
    "/dashboard/parametres/parents": "communication",
    "/dashboard/parametres/notifications": "communication",
    "/dashboard/parametres/finances": "finances",
    "/dashboard/parametres/diagnostic": "controle-securite",
    "/dashboard/parametres/audit": "controle-securite",
  };
  return routeToCategory[pathname] ?? null;
}
