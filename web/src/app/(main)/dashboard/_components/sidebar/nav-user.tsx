"use client";

import { EllipsisVertical, KeyRound, LogOut } from "lucide-react";
import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { getInitials } from "@/lib/utils";
import { deconnexion } from "@/app/(main)/auth/actions";
import type { Principal } from "@/server/auth/session";
import { LIBELLES_ROLES } from "@/server/guard/permissions";

export function NavUser({ utilisateur }: { readonly utilisateur: Principal }) {
  const { isMobile } = useSidebar();

  const nomComplet = `${utilisateur.prenom} ${utilisateur.nom}`;
  const identifiant = utilisateur.email ?? utilisateur.telephone ?? "";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={utilisateur.photoUrl ?? undefined} alt={nomComplet} />
                <AvatarFallback className="rounded-lg">{getInitials(nomComplet)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{nomComplet}</span>
                <span className="truncate text-muted-foreground text-xs">
                  {LIBELLES_ROLES[utilisateur.role]}
                </span>
              </div>
              <EllipsisVertical className="ml-auto size-4" aria-hidden />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={utilisateur.photoUrl ?? undefined} alt={nomComplet} />
                  <AvatarFallback className="rounded-lg">{getInitials(nomComplet)}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{nomComplet}</span>
                  <span className="truncate text-muted-foreground text-xs">{identifiant}</span>
                </div>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuItem asChild>
              <Link href="/auth/mot-de-passe">
                <KeyRound aria-hidden />
                Changer le mot de passe
              </Link>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Formulaire plutôt que bouton : la déconnexion écrit en base
                (suppression de la session) et doit donc être une requête POST,
                jamais un simple lien qu'un préchargement pourrait déclencher. */}
            <form action={deconnexion}>
              <button type="submit" className="w-full">
                <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut aria-hidden />
                  Se déconnecter
                </DropdownMenuItem>
              </button>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
