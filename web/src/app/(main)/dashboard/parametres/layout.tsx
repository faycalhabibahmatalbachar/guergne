import { type ReactNode, Suspense } from "react";

import { redirect } from "next/navigation";

import { APP_CONFIG } from "@/config/app-config";
import { exigerSession, peut } from "@/server/guard";

import { SettingsPageHeading } from "./_components/settings-page-heading";
import { SETTINGS_CARDS, SETTINGS_PERMISSIONS } from "./settings-catalog";

export default async function LayoutParametres({ children }: { children: ReactNode }) {
  const principal = await exigerSession();
  const [resultats, peutLireMessages] = await Promise.all([
    Promise.all(SETTINGS_PERMISSIONS.map((droit) => peut(principal, droit))),
    peut(principal, "annonce:lire"),
  ]);
  const autorises = new Set(SETTINGS_PERMISSIONS.filter((_, i) => resultats[i]));
  const items = SETTINGS_CARDS.filter((s) => s.droits.some((droit) => autorises.has(droit))).map(
    ({ droits: _droits, description: _description, action: _action, ...item }) => item,
  );

  if (!items.length) redirect("/unauthorized");

  return (
    <div className="min-w-0 space-y-5 pb-8 text-foreground">
      <Suspense fallback={<div className="h-[103px] border-b border-border" />}>
        <SettingsPageHeading
          items={items}
          lyceeName={APP_CONFIG.name}
          peutAuditer={autorises.has("audit:lire")}
          peutLireMessages={peutLireMessages}
        />
      </Suspense>
      <section aria-label="Contenu des paramètres" className="min-w-0">
        {children}
      </section>
    </div>
  );
}
