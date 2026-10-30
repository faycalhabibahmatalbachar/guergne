import type { EtatFile } from "@/server/domain/communication";
import type { StatistiquesParents } from "@/server/domain/parents";

import type { SettingsCard } from "../settings-catalog";
import type { InvitationOverview, NotificationOverview } from "./communication-operations";
import type { ApercuPolitique } from "./communication-policies";
import { CommunicationWorkspace } from "./communication-workspace";
import type { AccesModule } from "./settings-category-panel";

/** Adaptateur serveur : ne transmet que des données sérialisables au module interactif. */
export interface CouvertureFamilles {
  push: number;
  sms: number;
  interne: number;
}

export function CommunicationSettingsPanel({
  items,
  accesModules,
  joursInvitations,
  graviteIncident,
  parents,
  couverture,
  file,
  echecs30Jours,
  politiques,
  invitations,
  suiviNotifications,
}: {
  items: SettingsCard[];
  accesModules: AccesModule[];
  joursInvitations: number | null;
  graviteIncident: string | null;
  parents: StatistiquesParents | null;
  couverture: CouvertureFamilles | null;
  file: EtatFile | null;
  echecs30Jours: number | null;
  politiques: ApercuPolitique[] | null;
  invitations: InvitationOverview | null;
  suiviNotifications: NotificationOverview | null;
}) {
  return (
    <CommunicationWorkspace
      autoriseInvitations={items.some((item) => item.id === "parents") && joursInvitations !== null}
      autoriseNotifications={items.some((item) => item.id === "notifications") && politiques !== null}
      joursInvitations={joursInvitations}
      graviteIncident={graviteIncident}
      parents={parents}
      couverture={couverture}
      file={file}
      echecs30Jours={echecs30Jours}
      politiques={politiques}
      invitations={invitations}
      suiviNotifications={suiviNotifications}
      accesModules={accesModules.map(({ href, titre, description }) => ({ href, titre, description }))}
    />
  );
}
