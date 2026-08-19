"use client";

import { useMemo } from "react";

import Link from "next/link";

import { GraduationCap } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { APP_CONFIG } from "@/config/app-config";
import { type NavGroup, sidebarItems } from "@/navigation/sidebar/sidebar-items";
import type { Principal } from "@/server/auth/session";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";

/**
 * Retire du menu les entrées que le rôle n'a pas le droit d'ouvrir.
 *
 * Un groupe dont toutes les entrées sont filtrées disparaît entièrement :
 * afficher un intitulé de section vide donnerait l'impression d'un bug.
 */
function filtrerMenu(groupes: NavGroup[], autorisees: Set<string>): NavGroup[] {
  return groupes
    .map((groupe) => ({
      ...groupe,
      items: groupe.items
        .map((item) => {
          if ("subItems" in item && item.subItems) {
            const sous = item.subItems.filter((s) => !s.action || autorisees.has(s.action));
            return sous.length ? { ...item, subItems: sous } : null;
          }
          return !item.action || autorisees.has(item.action) ? item : null;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    }))
    .filter((groupe) => groupe.items.length > 0);
}

interface Props extends React.ComponentProps<typeof Sidebar> {
  utilisateur: Principal;
  actionsAutorisees: string[];
}

export function AppSidebar({ utilisateur, actionsAutorisees, ...props }: Props) {
  const { sidebarVariant, sidebarCollapsible, isSynced } = usePreferencesStore(
    useShallow((s) => ({
      sidebarVariant: s.values.sidebar_variant,
      sidebarCollapsible: s.values.sidebar_collapsible,
      isSynced: s.isSynced,
    })),
  );

  const variant = isSynced ? sidebarVariant : props.variant;
  const collapsible = isSynced ? sidebarCollapsible : props.collapsible;

  const menu = useMemo(
    () => filtrerMenu(sidebarItems, new Set(actionsAutorisees)),
    [actionsAutorisees],
  );

  return (
    <Sidebar {...props} variant={variant} collapsible={collapsible}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <Link prefetch={false} href="/dashboard/default">
                {/*
                  Le logo de l'établissement plutôt qu'une icône générique :
                  c'est le premier repère visuel de la page, et le personnel
                  doit reconnaître son école, pas un tableau de bord anonyme.
                  Fond blanc imposé — la couronne est verte et disparaîtrait
                  sur le bleu institutionnel.
                */}
                <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg border bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logo.svg"
                    alt=""
                    width={32}
                    height={32}
                    className="size-7"
                    aria-hidden
                  />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold text-sm">{APP_CONFIG.name}</span>
                  <span className="truncate text-muted-foreground text-xs">Administration</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavMain items={menu} />
      </SidebarContent>

      <SidebarFooter>
        <NavUser utilisateur={utilisateur} />
      </SidebarFooter>
    </Sidebar>
  );
}
