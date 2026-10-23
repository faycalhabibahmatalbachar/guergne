import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Settings2 } from "lucide-react";

import { APP_CONFIG } from "@/config/app-config";
import { exigerSession, peut } from "@/server/guard";

import { SettingsNavigation, type SettingsSection } from "./_components/settings-navigation";

type Autorisation =
  | "parametre:modifier" | "annee:cloturer" | "periode:verrouiller" | "periode:deverrouiller"
  | "matiere:gerer" | "coefficient:gerer" | "classe:creer" | "classe:modifier"
  | "notification:configurer" | "finance:configurer" | "audit:lire";

const DROITS: readonly Autorisation[] = [
  "parametre:modifier", "annee:cloturer", "periode:verrouiller",
  "periode:deverrouiller", "matiere:gerer", "coefficient:gerer",
  "classe:creer", "classe:modifier", "notification:configurer",
  "finance:configurer", "audit:lire",
];

const SECTIONS: (SettingsSection & { droits: readonly Autorisation[] })[] = [
  {
    id: "identite", label: "Informations du lycée", group: "ÉTABLISSEMENT",
    href: "/dashboard/parametres/etablissement", icon: "school",
    keywords: "fiche officielle adresse ville pays telephone email site web ministre proviseur censeur",
    droits: ["parametre:modifier"],
  },
  {
    id: "annees", label: "Années et périodes", group: "SCOLARITÉ ET PÉDAGOGIE",
    href: "/dashboard/parametres?onglet=annees", icon: "calendar",
    keywords: "annee scolaire en cours calendrier trimestre semestre cloture verrouillage",
    droits: ["annee:cloturer", "periode:verrouiller", "periode:deverrouiller"],
  },
  {
    id: "matieres", label: "Matières et séries", group: "SCOLARITÉ ET PÉDAGOGIE",
    href: "/dashboard/parametres?onglet=matieres", icon: "book",
    keywords: "matiere serie enseignement catalogue",
    droits: ["matiere:gerer"],
  },
  {
    id: "coefficients", label: "Coefficients", group: "SCOLARITÉ ET PÉDAGOGIE",
    href: "/dashboard/parametres?onglet=coefficients", icon: "calculator",
    keywords: "notes ponderation interro devoir composition bareme",
    droits: ["coefficient:gerer"],
  },
  {
    id: "classes", label: "Classes", group: "SCOLARITÉ ET PÉDAGOGIE",
    href: "/dashboard/parametres?onglet=classes", icon: "class",
    keywords: "classe capacite niveau series",
    droits: ["classe:creer", "classe:modifier"],
  },
  {
    id: "parents", label: "Invitations parents", group: "COMMUNICATION",
    href: "/dashboard/parametres/parents", icon: "parents",
    keywords: "activation invitation validite code parents tuteurs",
    droits: ["parametre:modifier"],
  },
  {
    id: "notifications", label: "Notifications et SMS", group: "COMMUNICATION",
    href: "/dashboard/parametres/notifications", icon: "bell",
    keywords: "push sms politiques canaux seuil incident message cout",
    droits: ["notification:configurer"],
  },
  {
    id: "finances", label: "Règles financières", group: "FINANCES ET CONTRÔLE",
    href: "/dashboard/parametres/finances", icon: "wallet",
    keywords: "bulletins impayes seuil fcfa retenue",
    droits: ["finance:configurer"],
  },
  {
    id: "diagnostic", label: "Diagnostic", group: "FINANCES ET CONTRÔLE",
    href: "/dashboard/parametres/diagnostic", icon: "diagnostic",
    keywords: "verification configuration coherence controle annee",
    droits: ["parametre:modifier"],
  },
  {
    id: "audit", label: "Journal d'audit", group: "FINANCES ET CONTRÔLE",
    href: "/dashboard/parametres/audit", icon: "audit",
    keywords: "historique actions acteur trace securite",
    droits: ["audit:lire"],
  },
];

export default async function LayoutParametres({ children }: { children: ReactNode }) {
  const principal = await exigerSession();
  const resultats = await Promise.all(DROITS.map((droit) => peut(principal, droit)));
  const autorises = new Set(DROITS.filter((_, i) => resultats[i]));
  const items = SECTIONS.filter((s) => s.droits.some((droit) => autorises.has(droit)))
    .map(({ droits: _droits, ...item }) => item);

  if (!items.length) redirect("/unauthorized");

  return (
    <div className="min-w-0 space-y-5 pb-8 text-slate-950 dark:text-foreground">
      <header className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 dark:border-border">
        <nav aria-label="Fil d'Ariane" className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-muted-foreground">
          <Link href="/dashboard/default" className="hover:text-blue-700 hover:underline">Tableau de bord</Link>
          <ChevronRight className="size-3.5" aria-hidden />
          <span aria-current="page">Paramètres</span>
        </nav>
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
            <Settings2 className="size-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-[29px] font-bold leading-tight tracking-tight sm:text-[34px]">Paramètres</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">
              Configurez les règles de {APP_CONFIG.name} selon vos autorisations.
            </p>
          </div>
        </div>
      </header>

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[248px_minmax(0,1fr)] xl:gap-5">
        <SettingsNavigation items={items} />
        <section aria-label="Contenu des paramètres" className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5 xl:p-6 dark:border-border dark:bg-card">
          {children}
        </section>
      </div>
    </div>
  );
}
