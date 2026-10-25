import type { StatistiquesParents } from "@/server/domain/parents";
import type { EtatFile } from "@/server/domain/communication";
import type { SettingsCard } from "../settings-catalog";
import type { AccesModule } from "./settings-category-panel";
import type { ApercuPolitique } from "./communication-policies";
import { CommunicationWorkspace } from "./communication-workspace";

/** Adaptateur serveur : ne transmet que des données sérialisables au module interactif. */
export interface CouvertureFamilles {
  push: number;
  sms: number;
  interne: number;
}

export function CommunicationSettingsPanel({
  items, accesModules, joursInvitations, parents, couverture, file, politiques,
}: {
  items: SettingsCard[];
  accesModules: AccesModule[];
  joursInvitations: number | null;
  parents: StatistiquesParents | null;
  couverture: CouvertureFamilles | null;
  file: EtatFile | null;
  politiques: ApercuPolitique[] | null;
}) {
  return (
    <CommunicationWorkspace
      autoriseInvitations={items.some((item) => item.id === "parents") && joursInvitations !== null}
      autoriseNotifications={items.some((item) => item.id === "notifications") && politiques !== null}
      joursInvitations={joursInvitations}
      parents={parents}
      couverture={couverture}
      file={file}
      politiques={politiques}
      accesModules={accesModules.map(({ href, titre, description }) => ({ href, titre, description }))}
    />
  );
}
