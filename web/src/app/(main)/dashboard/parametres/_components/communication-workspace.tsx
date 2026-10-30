"use client";

import { type ReactNode, useState } from "react";

import Link from "next/link";

import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  KeyRound,
  type LucideIcon,
  MessageSquare,
  Settings2,
  ShieldCheck,
  Smartphone,
  UserRoundCheck,
  UserRoundX,
  Users,
  Wallet,
} from "lucide-react";

import { COUT_SMS_FCFA } from "@/lib/tarifs";
import type { EtatFile } from "@/server/domain/communication";
import type { StatistiquesParents } from "@/server/domain/parents";

import { CommunicationIncidentEditor, libelleGravite } from "./communication-incident-editor";
import {
  CanauxOperations,
  type InvitationOverview,
  InvitationsOperations,
  type NotificationOverview,
  SuiviOperations,
} from "./communication-operations";
import { type ApercuPolitique, CommunicationPolicies } from "./communication-policies";
import type { CouvertureFamilles } from "./communication-settings-panel";
import { CommunicationValidityEditor } from "./communication-validity-editor";

type Rubrique = "synthese" | "invitations" | "canaux" | "suivi";
type Acces = { titre: string; description: string; href: string };
type Props = {
  autoriseInvitations: boolean;
  autoriseNotifications: boolean;
  joursInvitations: number | null;
  graviteIncident: string | null;
  parents: StatistiquesParents | null;
  couverture: CouvertureFamilles | null;
  file: EtatFile | null;
  echecs30Jours: number | null;
  politiques: ApercuPolitique[] | null;
  invitations: InvitationOverview | null;
  suiviNotifications: NotificationOverview | null;
  accesModules: Acces[];
};

const SURFACE = "min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm";
const SUBTLE = "text-xs text-muted-foreground";
const DASHLINK =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground shadow-none transition-colors hover:border-succes-trait hover:text-succes focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700";

function Title({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-succes" aria-hidden />
        <div>
          <h2 className="text-base font-bold tracking-tight">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}
function ActionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} prefetch={false} className={DASHLINK}>
      {children}
      <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}
function IndicatorBand({
  parents,
  couverture,
  file,
  acces,
}: {
  parents: StatistiquesParents | null;
  couverture: CouvertureFamilles | null;
  file: EtatFile | null;
  acces: Acces[];
}) {
  const parentsHref = acces.some((x) => x.href === "/dashboard/parents") ? "/dashboard/parents" : undefined;
  const messagesHref = acces.find((x) => x.href === "/dashboard/communication")?.href;
  const indicators = [
    ...(parents
      ? [
          {
            label: "Parents recensés",
            value: parents.total,
            description: "Dossiers de responsables",
            icon: Users,
            tone: "text-succes bg-succes-doux",
            href: parentsHref,
          },
          {
            label: "Comptes actifs",
            value: parents.actifs,
            description: "Comptes déjà utilisés",
            icon: UserRoundCheck,
            tone: "text-info bg-info-doux",
            href: parentsHref ? "/dashboard/parents?etat=actif" : undefined,
          },
          {
            label: "Sans compte",
            value: parents.sansCompte,
            description: "Accès à créer",
            icon: UserRoundX,
            tone: "text-alerte bg-alerte-doux",
            href: parentsHref ? "/dashboard/parents?etat=sans_compte" : undefined,
          },
        ]
      : []),
    ...(couverture
      ? [
          {
            label: "Push disponible",
            value: couverture.push,
            description: "Responsables joignables",
            icon: Smartphone,
            tone: "text-info bg-info-doux",
            href: undefined,
          },
        ]
      : []),
    ...(file
      ? [
          {
            label: "En attente d’envoi",
            value: file.enAttente,
            description: "Notifications en file",
            icon: Bell,
            tone: "text-danger bg-danger-doux",
            href: messagesHref,
          },
        ]
      : []),
  ];
  if (!indicators.length) return null;
  return (
    <section aria-label="Indicateurs de la communication" className={SURFACE}>
      <div className="flex items-stretch overflow-x-auto divide-x divide-border">
        {indicators.map(({ label, value, description, icon: Icon, tone, href }) => {
          const content = (
            <>
              <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                <Icon className="size-[22px]" strokeWidth={1.8} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block whitespace-nowrap text-xs font-semibold text-muted-foreground">{label}</span>
                <span className="mt-1 block text-2xl font-bold leading-none tracking-tight tabular-nums">
                  {value.toLocaleString("fr-FR")}
                </span>
                <span className="mt-1.5 block text-xs leading-4 text-muted-foreground">{description}</span>
              </span>
            </>
          );
          return href ? (
            <Link
              key={label}
              href={href}
              className="flex min-w-[205px] flex-1 items-center gap-3 px-3 py-4 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-700 dark:hover:bg-muted/30"
            >
              {content}
            </Link>
          ) : (
            <div key={label} className="flex min-w-[205px] flex-1 items-center gap-3 px-3 py-4">
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}
function ValueBadge({ children, tone }: { children: ReactNode; tone: "green" | "amber" | "blue" | "purple" }) {
  const t = {
    green: "bg-succes-doux text-succes",
    amber: "bg-alerte-doux text-alerte",
    blue: "bg-info-doux text-info",
    purple: "bg-info-doux text-info",
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${t[tone]}`}>
      {children}
    </span>
  );
}
function SettingsTable({
  joursInvitations,
  graviteIncident,
  politiques,
  autoriseInvitations,
  autoriseNotifications,
  onCanaux,
  onSuivi,
}: {
  joursInvitations: number | null;
  graviteIncident: string | null;
  politiques: ApercuPolitique[] | null;
  autoriseInvitations: boolean;
  autoriseNotifications: boolean;
  onCanaux: () => void;
  onSuivi: () => void;
}) {
  const rowClasses = "border-t border-border";
  const labelClasses = "flex items-center gap-2.5 font-semibold";
  const iconClasses = "flex size-8 shrink-0 items-center justify-center rounded-lg";
  const rows = [
    ...(autoriseInvitations && joursInvitations !== null
      ? [
          {
            key: "invitations",
            icon: KeyRound,
            iconTone: "bg-succes-doux text-succes",
            title: "Codes d’activation",
            description: "Validité des nouvelles invitations",
            value: (
              <ValueBadge tone="green">
                {joursInvitations} jour{joursInvitations > 1 ? "s" : ""}
              </ValueBadge>
            ),
            action: <CommunicationValidityEditor joursActuels={joursInvitations} />,
          },
        ]
      : []),
    ...(autoriseNotifications && politiques
      ? [
          {
            key: "politique",
            icon: MessageSquare,
            iconTone: "bg-info-doux text-info",
            title: "Règles d’envoi",
            description: "Canaux configurés par événement",
            value: <ValueBadge tone="blue">{politiques.length} politiques</ValueBadge>,
            action: (
              <button type="button" onClick={onCanaux} className={DASHLINK}>
                Configurer <ArrowRight className="size-3.5" aria-hidden />
              </button>
            ),
          },
        ]
      : []),
    ...(autoriseNotifications && graviteIncident
      ? [
          {
            key: "incidents",
            icon: AlertTriangle,
            iconTone: "bg-alerte-doux text-alerte",
            title: "Seuil des incidents",
            description: "Gravité minimale à notifier",
            value: <ValueBadge tone="amber">{libelleGravite(graviteIncident)}</ValueBadge>,
            action: <CommunicationIncidentEditor actuel={graviteIncident} />,
          },
        ]
      : []),
    ...(autoriseNotifications
      ? [
          {
            key: "tarif",
            icon: Wallet,
            iconTone: "bg-info-doux text-info",
            title: "Gestion des SMS",
            description: "Tarif indicatif par segment",
            value: <ValueBadge tone="purple">{COUT_SMS_FCFA.toLocaleString("fr-FR")} FCFA</ValueBadge>,
            action: (
              <button type="button" onClick={onSuivi} className={DASHLINK}>
                Détails <ChevronRight className="size-3.5" aria-hidden />
              </button>
            ),
          },
        ]
      : []),
  ];
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[625px] text-left text-xs">
          <thead className="bg-muted/40 text-muted-foreground dark:bg-muted/30">
            <tr>
              <th scope="col" className="w-[29%] px-3 py-2.5 font-semibold">
                Paramètre
              </th>
              <th scope="col" className="w-[36%] px-3 py-2.5 font-semibold">
                Description
              </th>
              <th scope="col" className="w-[18%] px-3 py-2.5 font-semibold">
                Valeur actuelle
              </th>
              <th scope="col" className="px-3 py-2.5 text-center font-semibold">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, icon: Icon, iconTone, title, description, value, action }) => (
              <tr key={key} className={rowClasses}>
                <td className="px-3 py-2.5">
                  <div className={labelClasses}>
                    <span className={`${iconClasses} ${iconTone}`}>
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span>{title}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{description}</td>
                <td className="px-3 py-2.5">{value}</td>
                <td className="px-3 py-2.5 text-center">{action}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                  Aucun réglage accessible pour ce compte.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function Attention({
  parents,
  file,
  echecs30Jours,
  onSuivi,
  hrefParents,
  hrefMessages,
}: {
  parents: StatistiquesParents | null;
  file: EtatFile | null;
  echecs30Jours: number | null;
  onSuivi: () => void;
  hrefParents: string | null;
  hrefMessages: string | null;
}) {
  const incidents = [
    ...(echecs30Jours !== null && echecs30Jours > 0
      ? [
          {
            key: "echecs",
            icon: Bell,
            tone: "bg-danger-doux text-danger",
            titre: `${echecs30Jours.toLocaleString("fr-FR")} notification${echecs30Jours > 1 ? "s" : ""} échouée${echecs30Jours > 1 ? "s" : ""}`,
            detail: "Échecs au cours des 30 derniers jours",
            label: "Examiner les erreurs",
            href: undefined,
            onClick: onSuivi,
          },
        ]
      : []),
    ...(parents && parents.sansCompte > 0
      ? [
          {
            key: "parents",
            icon: Users,
            tone: "bg-alerte-doux text-alerte",
            titre: `${parents.sansCompte.toLocaleString("fr-FR")} parents sans compte`,
            detail: "Accès parents encore à créer",
            label: "Gérer les accès",
            href: hrefParents,
            onClick: undefined,
          },
        ]
      : []),
    ...(file && file.smsEnAttente > 0
      ? [
          {
            key: "sms",
            icon: MessageSquare,
            tone: "bg-info-doux text-info",
            titre: `${file.smsEnAttente.toLocaleString("fr-FR")} SMS en attente`,
            detail:
              "Coût estimé : " +
              (file.smsEnAttente * COUT_SMS_FCFA).toLocaleString("fr-FR") +
              " FCFA (hors segments supplémentaires)",
            label: "Voir le coût",
            href: undefined,
            onClick: onSuivi,
          },
        ]
      : []),
  ];
  return (
    <section aria-label="Points d'attention" className={SURFACE + " p-4"}>
      <Title icon={CircleAlert} title="Points d’attention" description="Éléments nécessitant votre attention." />
      {incidents.length ? (
        <div className="mt-3 divide-y divide-border">
          {incidents.map(({ key, icon: Icon, tone, titre, detail, label, href, onClick }) => (
            <div key={key} className="flex gap-3 py-3.5">
              <span className={`flex size-11 shrink-0 items-center justify-center rounded-full ${tone}`}>
                <Icon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{titre}</p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</p>
                {href ? (
                  <Link
                    href={href}
                    prefetch={false}
                    className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-succes hover:underline"
                  >
                    {label} <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={onClick}
                    className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-succes hover:underline"
                  >
                    {label} <ArrowRight className="size-3.5" aria-hidden />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 flex items-center gap-2 border-t border-border pt-5 text-sm text-succes">
          <CheckCircle2 className="size-5" aria-hidden /> Aucun point d’attention détecté.
        </p>
      )}
    </section>
  );
}
function Queue({ file, echecs30Jours, href }: { file: EtatFile; echecs30Jours: number | null; href: string | null }) {
  return (
    <section className={SURFACE + " p-4 sm:p-5"} aria-label="Suivi des notifications">
      <Title
        icon={Bell}
        title="État des notifications"
        description="File de diffusion, échecs et budget potentiel."
        action={href ? <ActionLink href={href}>Ouvrir le journal</ActionLink> : undefined}
      />
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {[
          { label: "En attente", n: file.enAttente },
          { label: "Envoyées (historique)", n: file.envoyees },
          { label: "Échouées (historique)", n: file.echouees },
        ].map((v) => (
          <div key={v.label} className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">{v.label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{v.n.toLocaleString("fr-FR")}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-alerte-doux p-3 text-sm">
        <span className="flex items-center gap-2 text-alerte">
          <Wallet className="size-4" aria-hidden /> SMS en attente : {file.smsEnAttente.toLocaleString("fr-FR")}
        </span>
        <strong className="tabular-nums text-alerte">
          {(file.smsEnAttente * COUT_SMS_FCFA).toLocaleString("fr-FR")} FCFA estimés
        </strong>
      </div>
      {echecs30Jours !== null && (
        <p className="mt-3 text-sm">{echecs30Jours.toLocaleString("fr-FR")} échecs sur les 30 derniers jours.</p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Les volumes historiques sont cumulatifs. Coût SMS estimé hors segments multiples ; aucun SMS envoyé depuis cette
        page.
      </p>
    </section>
  );
}
function Cover({ couverture }: { couverture: CouvertureFamilles }) {
  const total = couverture.push + couverture.sms + couverture.interne;
  const a = [
    { name: "Push", n: couverture.push, color: "bg-primary" },
    { name: "SMS", n: couverture.sms, color: "bg-primary" },
    { name: "Boîte interne", n: couverture.interne, color: "bg-muted" },
  ];
  return (
    <section className={SURFACE + " p-4 sm:p-5"}>
      <Title
        icon={Smartphone}
        title="Couverture des familles"
        description="Canal prioritaire calculé selon la disponibilité et le consentement."
      />
      <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-muted">
        {a.map((c) => (
          <div key={c.name} className={c.color} style={{ width: `${total ? (c.n / total) * 100 : 0}%` }} />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {a.map((c) => (
          <div key={c.name}>
            <p className="text-xs text-muted-foreground">{c.name}</p>
            <p className="mt-1 text-lg font-bold tabular-nums">{c.n.toLocaleString("fr-FR")}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Le canal prioritaire n'est pas une preuve de livraison ; chaque événement respecte sa politique.
      </p>
    </section>
  );
}

export function CommunicationWorkspace({
  autoriseInvitations,
  autoriseNotifications,
  joursInvitations,
  graviteIncident,
  parents,
  couverture,
  file,
  echecs30Jours,
  politiques,
  invitations,
  suiviNotifications,
  accesModules,
}: Props) {
  const [rubrique, setRubrique] = useState<Rubrique>("synthese");
  const hrefParents = accesModules.find((l) => l.href === "/dashboard/parents")?.href ?? null;
  const hrefInvitations = accesModules.find((l) => l.href === "/dashboard/parents/invitations")?.href ?? null;
  const hrefMessages = accesModules.find((l) => l.href === "/dashboard/communication")?.href ?? null;
  const tabs: Array<{ id: Rubrique; label: string }> = [
    { id: "synthese", label: "Vue d’ensemble" },
    ...(autoriseInvitations || hrefParents || hrefInvitations
      ? [{ id: "invitations" as const, label: "Invitations" }]
      : []),
    ...(autoriseNotifications || couverture ? [{ id: "canaux" as const, label: "Canaux et règles" }] : []),
    ...(file ? [{ id: "suivi" as const, label: "Suivi des envois" }] : []),
  ];
  const parameters = (
    <SettingsTable
      joursInvitations={joursInvitations}
      graviteIncident={graviteIncident}
      politiques={politiques}
      autoriseInvitations={autoriseInvitations}
      autoriseNotifications={autoriseNotifications}
      onCanaux={() => setRubrique("canaux")}
      onSuivi={() => setRubrique("suivi")}
    />
  );
  return (
    <div className="min-w-0 space-y-4 pb-6 text-foreground">
      <nav
        aria-label="Navigation Communication"
        className="flex min-w-0 gap-4 overflow-x-auto border-b border-border"
        role="tablist"
      >
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={rubrique === id}
            aria-controls="communication-tab-content"
            onClick={() => setRubrique(id)}
            className={`-mb-px min-h-11 shrink-0 border-b-2 px-3 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-700 ${rubrique === id ? "border-succes-trait text-succes" : "border-transparent text-muted-foreground hover:text-foreground dark:hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div id="communication-tab-content" role="tabpanel" aria-label={tabs.find((t) => t.id === rubrique)?.label}>
        {rubrique === "synthese" && (
          <div className="space-y-4">
            <IndicatorBand parents={parents} couverture={couverture} file={file} acces={accesModules} />
            <div className="grid min-w-0 items-stretch gap-3 lg:grid-cols-[minmax(0,2.2fr)_minmax(280px,1fr)]">
              <section className={SURFACE + " p-3 sm:p-4"}>
                <div className="mb-3">
                  <Title
                    icon={Settings2}
                    title="Paramètres essentiels"
                    description="Configurez les paramètres principaux de communication avec les familles."
                    action={
                      autoriseNotifications ? (
                        <button type="button" onClick={() => setRubrique("canaux")} className={DASHLINK}>
                          <Settings2 className="size-4" aria-hidden /> Tous les réglages
                        </button>
                      ) : undefined
                    }
                  />
                </div>
                {parameters}
              </section>
              <Attention
                parents={parents}
                file={file}
                echecs30Jours={echecs30Jours}
                hrefParents={hrefParents}
                hrefMessages={hrefMessages}
                onSuivi={() => setRubrique("suivi")}
              />
            </div>
            {politiques && (
              <div className={SURFACE + " p-3 sm:p-4"}>
                <CommunicationPolicies lignes={politiques} apercu onViewAll={() => setRubrique("canaux")} />
              </div>
            )}
          </div>
        )}
        {rubrique === "invitations" && (
          <InvitationsOperations
            parents={parents}
            joursInvitations={joursInvitations}
            autoriseInvitations={autoriseInvitations}
            invitations={invitations}
            hrefParents={hrefParents}
            hrefHistorique={hrefInvitations}
          />
        )}
        {rubrique === "canaux" && (
          <CanauxOperations
            couverture={couverture}
            politiques={politiques}
            seuilIncident={autoriseNotifications ? graviteIncident : null}
          />
        )}
        {rubrique === "suivi" && file && (
          <SuiviOperations
            file={file}
            echouees30={echecs30Jours}
            details={suiviNotifications}
            messagesHref={hrefMessages}
          />
        )}
      </div>
      <p className="flex items-start gap-2 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        Les changements sont vérifiés selon les droits du compte et consignés dans l’audit. Les nombres proviennent des
        données réelles du lycée.
      </p>
    </div>
  );
}
