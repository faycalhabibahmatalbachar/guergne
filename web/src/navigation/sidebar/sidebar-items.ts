import {
  BadgeCheck,
  CalendarDays,
  FileText,
  GraduationCap,
  LayoutDashboard,
  type LucideIcon,
  Megaphone,
  NotebookPen,
  Settings,
  ShieldAlert,
  Users,
  UserRoundCog,
  Wallet,
} from "lucide-react";

import type { Action } from "@/server/guard/permissions";

export type NavBadge = "new" | "soon";

export interface NavSubItem {
  id: string;
  title: string;
  url: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
  /** Action requise pour voir cette entrée. Absente = visible par tous. */
  action?: Action;
}

interface NavItemBase {
  id: string;
  title: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
  action?: Action;
}

export interface NavMainLinkItem extends NavItemBase {
  url: string;
  subItems?: never;
}

export interface NavMainParentItem extends NavItemBase {
  subItems: NavSubItem[];
}

export type NavMainItem = NavMainLinkItem | NavMainParentItem;

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

/**
 * Navigation de l'administration.
 *
 * Chaque entrée porte l'action qu'elle exige. Le menu est filtré côté serveur
 * en fonction du rôle de l'utilisateur connecté : un comptable ne voit pas
 * « Notes », un enseignant ne voit pas « Finances ».
 *
 * Ce filtrage est un CONFORT D'INTERFACE, jamais une mesure de sécurité :
 * l'autorisation réelle est vérifiée à chaque requête par `requirePermission`.
 * Masquer un lien n'a jamais empêché personne de taper l'URL.
 *
 * Les entrées marquées « soon » sont des modules planifiés mais non livrés.
 * Elles sont désactivées, jamais cliquables : un bouton qui ne fait rien est
 * pire qu'un bouton absent.
 */
export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Pilotage",
    items: [
      {
        id: "tableau-de-bord",
        title: "Tableau de bord",
        url: "/dashboard/default",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    id: 2,
    label: "Scolarité",
    items: [
      {
        id: "eleves",
        title: "Élèves",
        url: "/dashboard/eleves",
        icon: GraduationCap,
        action: "eleve:lire",
      },
      {
        id: "classes",
        title: "Classes",
        url: "/dashboard/classes",
        icon: Users,
        action: "classe:lire",
      },
      {
        id: "emploi-du-temps",
        title: "Emploi du temps",
        url: "/dashboard/emploi-du-temps",
        icon: CalendarDays,
        action: "emploi_du_temps:lire",
      },
    ],
  },
  {
    id: 3,
    label: "Pédagogie",
    items: [
      {
        id: "notes",
        title: "Notes",
        url: "/dashboard/notes",
        icon: NotebookPen,
        action: "note:lire",
      },
      {
        id: "bulletins",
        title: "Bulletins",
        url: "/dashboard/bulletins",
        icon: FileText,
        action: "bulletin:lire",
      },
    ],
  },
  {
    id: 4,
    label: "Vie scolaire",
    items: [
      {
        id: "assiduite",
        title: "Assiduité",
        url: "/dashboard/assiduite",
        icon: BadgeCheck,
        action: "assiduite:lire",
        badge: "soon",
        disabled: true,
      },
      {
        id: "discipline",
        title: "Discipline",
        url: "/dashboard/discipline",
        icon: ShieldAlert,
        action: "discipline:lire",
        badge: "soon",
        disabled: true,
      },
      {
        id: "communication",
        title: "Communication",
        url: "/dashboard/communication",
        icon: Megaphone,
        action: "annonce:lire",
        badge: "soon",
        disabled: true,
      },
    ],
  },
  {
    id: 5,
    label: "Administration",
    items: [
      {
        id: "finances",
        title: "Finances",
        url: "/dashboard/finances",
        icon: Wallet,
        action: "finance:lire",
        badge: "soon",
        disabled: true,
      },
      {
        id: "personnel",
        title: "Personnel",
        url: "/dashboard/personnel",
        icon: UserRoundCog,
        action: "utilisateur:creer",
      },
      {
        id: "parametres",
        title: "Paramètres",
        url: "/dashboard/parametres",
        icon: Settings,
        action: "parametre:modifier",
      },
    ],
  },
];
