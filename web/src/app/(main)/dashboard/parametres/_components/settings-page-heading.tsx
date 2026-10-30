"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { ChevronRight, History, Send } from "lucide-react";

import { EnTetePage } from "@/components/socle/en-tete-page";
import { Button } from "@/components/ui/button";

import { SettingsSearch, type SettingsSection } from "./settings-navigation";

export function SettingsPageHeading({
  items,
  lyceeName,
  peutAuditer,
  peutLireMessages,
}: {
  items: SettingsSection[];
  lyceeName: string;
  peutAuditer: boolean;
  peutLireMessages: boolean;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const communication = pathname === "/dashboard/parametres" && params.get("section") === "communication";

  return (
    <EnTetePage
      titre={communication ? "Communication et familles" : "Paramètres"}
      description={
        communication
          ? "Paramétrage, diffusion et suivi des échanges avec les familles."
          : "Configurez les règles de " + lyceeName + " selon vos autorisations."
      }
      className={communication ? "border-b-0 pb-0" : undefined}
      actions={
        communication ? (
          <>
            {peutAuditer && (
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/parametres/audit">
                  <History aria-hidden /> Journal d&apos;audit
                </Link>
              </Button>
            )}
            {/*
              L'action principale était en vert. Le vert dit « payé, présent,
              admis » partout ailleurs : l'employer pour un bouton le vide de
              ce sens.
            */}
            {peutLireMessages && (
              <Button asChild size="sm">
                <Link href="/dashboard/communication">
                  <Send aria-hidden /> Ouvrir les messages
                </Link>
              </Button>
            )}
          </>
        ) : (
          <SettingsSearch items={items} />
        )
      }
    />
  );
}
