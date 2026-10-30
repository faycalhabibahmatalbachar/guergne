import type { ReactNode } from "react";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppSidebar } from "@/app/(main)/dashboard/_components/sidebar/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { roleAutoriseAdministration } from "@/lib/acces-administration";
import { cn } from "@/lib/utils";
import { exigerSession } from "@/server/guard";
import { actionsAutorisees } from "@/server/guard/actions-autorisees";
import { getPreference } from "@/server/server-actions";

import { FilAriane } from "./_components/header/fil-ariane";
import { LayoutControls } from "./_components/header/layout-controls";
import { SearchDialog } from "./_components/header/search-dialog";
import { ThemeSwitcher } from "./_components/header/theme-switcher";
import { PiedDePage } from "./_components/pied-de-page";

export default async function Layout({ children }: Readonly<{ children: ReactNode }>) {
  // Garde unique de tout l'espace d'administration : aucune page enfant n'est
  // atteignable sans session valide.
  const principal = await exigerSession();

  // Garde de sécurité à l’entrée de TOUT le back-office, avant les requêtes.
  // Une ancienne session PARENT/ELEVE ne donne pas accès au tableau de bord.
  if (!roleAutoriseAdministration(principal.role)) redirect("/unauthorized");

  // Un mot de passe provisoire doit être remplacé avant tout accès aux données.
  if (principal.doitChangerMdp) redirect("/auth/mot-de-passe");

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  const [variant, collapsible, actions] = await Promise.all([
    getPreference("sidebar_variant"),
    getPreference("sidebar_collapsible"),
    actionsAutorisees(principal.role),
  ]);

  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      style={{ "--sidebar-width": "calc(var(--spacing) * 68)" } as React.CSSProperties}
    >
      <AppSidebar variant={variant} collapsible={collapsible} utilisateur={principal} actionsAutorisees={actions} />
      <SidebarInset
        className={cn(
          "[html[data-content-layout=centered]_&>*]:mx-auto",
          "[html[data-content-layout=centered]_&>*]:w-full",
          "[html[data-content-layout=centered]_&>*]:max-w-screen-2xl",
          "peer-data-[variant=inset]:border",
          "[--dashboard-header-height:--spacing(14)]",
          "min-w-0 overflow-x-clip",
        )}
      >
        {/*
          En-tête global, identique sur toutes les pages : repli de la barre
          latérale, fil d'Ariane, puis recherche et réglages alignés à droite.
          Hauteur portée de 48 à 56 px — à 48, le fil d'Ariane et le champ de
          recherche se touchaient.
        */}
        <header
          className={cn(
            "flex h-14 shrink-0 items-center border-b transition-[width,height] ease-linear",
            "[html[data-navbar-style=sticky]_&]:sticky [html[data-navbar-style=sticky]_&]:top-0 [html[data-navbar-style=sticky]_&]:z-50 [html[data-navbar-style=sticky]_&]:rounded-t-[inherit] [html[data-navbar-style=sticky]_&]:bg-background/80 [html[data-navbar-style=sticky]_&]:backdrop-blur-md",
          )}
        >
          <div className="flex w-full items-center gap-2 px-4 lg:px-6">
            <SidebarTrigger className="-ml-1.5 shrink-0" />
            <Separator
              orientation="vertical"
              className="data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
            />
            <FilAriane />

            {/*
              La recherche est poussée à droite avec les réglages : c'est une
              commande globale, pas un élément du chemin de navigation.
            */}
            <div className="ml-auto flex items-center gap-1.5">
              <SearchDialog />
              <Separator
                orientation="vertical"
                className="hidden data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center sm:block"
              />
              <LayoutControls />
              <ThemeSwitcher />
            </div>
          </div>
        </header>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
          <div className="min-w-0 flex-1 p-4 has-data-[content-padding=false]:p-0 md:p-6 md:has-data-[content-padding=false]:p-0">
            {children}
          </div>
          <PiedDePage />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
