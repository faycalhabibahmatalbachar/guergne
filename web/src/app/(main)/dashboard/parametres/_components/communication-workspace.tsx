"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Activity, ArrowRight, Bell, ChevronRight, ClipboardList,
  KeyRound, LayoutDashboard, MessageSquare, Send, Settings2,
  ShieldCheck, Smartphone, Users, Wallet, type LucideIcon,
} from "lucide-react";

import type { StatistiquesParents } from "@/server/domain/parents";
import type { EtatFile } from "@/server/domain/communication";
import { COUT_SMS_FCFA } from "@/lib/tarifs";
import { CommunicationPolicies, type ApercuPolitique } from "./communication-policies";
import { CommunicationValidityEditor } from "./communication-validity-editor";
import type { CouvertureFamilles } from "./communication-settings-panel";

type Rubrique = "synthese" | "invitations" | "canaux" | "exploitation";
type Acces = { titre: string; description: string; href: string };

const RUBRIQUES: Array<{ id: Rubrique; titre: string; description: string; icon: LucideIcon }> = [
  { id: "synthese", titre: "Vue d’ensemble", description: "Statut et priorités", icon: LayoutDashboard },
  { id: "invitations", titre: "Invitations", description: "Activation des familles", icon: KeyRound },
  { id: "canaux", titre: "Canaux et règles", description: "Push, SMS, politiques", icon: Settings2 },
  { id: "exploitation", titre: "Exploitation", description: "File, coûts, incidents", icon: Activity },
];

const LABEL = "text-xs font-medium text-slate-500 dark:text-muted-foreground";
const SURFACE = "min-w-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card";
const DETAIL = "text-xs leading-5 text-slate-500 dark:text-muted-foreground";
const ROW = "flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5";

function SectionTitle({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-base font-bold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

function SettingRow({ icon: Icon, name, description, value, action, tone = "slate" }: {
  icon: LucideIcon; name: string; description: string; value: string; action?: ReactNode;
  tone?: "slate" | "emerald" | "violet";
}) {
  const toneStyle = tone === "emerald" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : tone === "violet" ? "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" : "bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground";
  return (
    <div className={ROW}>
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${toneStyle}`}><Icon className="size-[18px]" aria-hidden /></span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{name}</p>
          <p className={DETAIL}>{description}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 pl-12 sm:justify-end sm:pl-0">
        <strong className="whitespace-nowrap text-sm tabular-nums">{value}</strong>
        {action}
      </div>
    </div>
  );
}

function SmallLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} prefetch={false} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:border-emerald-300 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:border-border dark:bg-card dark:text-foreground">
      {label}<ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}

function StatStrip({ parents, couverture, file, acces }: {
  parents: StatistiquesParents | null; couverture: CouvertureFamilles | null; file: EtatFile | null; acces: Acces[];
}) {
  const lienParents = acces.some((l) => l.href === "/dashboard/parents") ? "/dashboard/parents" : null;
  const mesures = [
    ...(parents ? [
      { label: "Responsables", value: parents.total, hint: "Enregistrés", href: lienParents },
      { label: "Comptes actifs", value: parents.actifs, hint: "Déjà connectés", href: lienParents ? "/dashboard/parents?etat=actif" : null },
      { label: "Sans compte", value: parents.sansCompte, hint: "À accompagner", href: lienParents ? "/dashboard/parents?etat=sans_compte" : null },
    ] : []),
    ...(couverture ? [{ label: "Push joignable", value: couverture.push, hint: "Appareils actifs", href: null }] : []),
    ...(file ? [{ label: "En attente", value: file.enAttente, hint: "Notifications", href: acces.find((l) => l.href === "/dashboard/communication")?.href ?? null }] : []),
  ];
  if (!mesures.length) return null;
  return (
    <section aria-label="Synthèse chiffrée de communication" className={SURFACE}>
      <div className="flex items-stretch overflow-x-auto divide-x divide-slate-100 dark:divide-border">
        {mesures.map((m) => {
          const inner = (
            <>
              <p className="text-[11px] font-medium text-slate-500 dark:text-muted-foreground">{m.label}</p>
              <p className="mt-1 text-[26px] font-bold leading-none tracking-tight tabular-nums">{m.value.toLocaleString("fr-FR")}</p>
              <p className="mt-1.5 text-[11px] text-slate-400 dark:text-muted-foreground">{m.hint}</p>
            </>
          );
          return m.href
            ? <Link href={m.href} key={m.label} className="min-w-[145px] flex-1 px-4 py-3.5 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-700 dark:hover:bg-muted/40">{inner}</Link>
            : <div key={m.label} className="min-w-[145px] flex-1 px-4 py-3.5">{inner}</div>;
        })}
      </div>
    </section>
  );
}

function Coverage({ couverture }: { couverture: CouvertureFamilles }) {
  const total = couverture.push + couverture.sms + couverture.interne;
  const parts = [
    { label: "Push", valeur: couverture.push, bar: "bg-violet-500", dot: "bg-violet-500" },
    { label: "SMS", valeur: couverture.sms, bar: "bg-blue-500", dot: "bg-blue-500" },
    { label: "Interne", valeur: couverture.interne, bar: "bg-slate-400", dot: "bg-slate-400" },
  ];
  return (
    <section aria-label="Couverture des familles" className={SURFACE + " p-4 sm:p-5"}>
      <div className="flex items-center justify-between gap-3">
        <div><h3 className="text-sm font-semibold">Couverture des familles</h3><p className={DETAIL}>Canal prioritaire calculé pour chaque responsable</p></div>
        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold tabular-nums dark:bg-muted">{total.toLocaleString("fr-FR")} familles</span>
      </div>
      <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-muted">
        {parts.map((p) => <div key={p.label} className={p.bar} style={{ width: `${total ? p.valeur / total * 100 : 0}%` }} />)}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {parts.map((p) => <div key={p.label}>
          <p className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-muted-foreground"><span className={`size-2 rounded-full ${p.dot}`} /> {p.label}</p>
          <p className="mt-1 text-lg font-bold tabular-nums">{p.valeur.toLocaleString("fr-FR")}</p>
        </div>)}
      </div>
      <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] leading-4 text-slate-500 dark:border-border dark:text-muted-foreground">
        Cette répartition ne prouve pas que chaque message a été livré. Les règles d’événements peuvent modifier le canal final.
      </p>
    </section>
  );
}

function QueueDetails({ file, href }: { file: EtatFile; href: string | null }) {
  const values = [
    { label: "En attente", value: file.enAttente },
    { label: "Envoyées", value: file.envoyees },
    { label: "Échouées", value: file.echouees },
  ];
  return (
    <section aria-label="Suivi de la file de notifications" className={SURFACE}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 dark:border-border">
        <div><h3 className="text-sm font-semibold">File de notifications</h3><p className={DETAIL}>Volumes enregistrés, tous événements confondus</p></div>
        {href && <SmallLink href={href} label="Ouvrir le journal" />}
      </div>
      <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-border">
        {values.map((v) => <div key={v.label} className="px-4 py-4">
          <p className={LABEL}>{v.label}</p><p className="mt-1 text-xl font-bold tabular-nums">{v.value.toLocaleString("fr-FR")}</p>
        </div>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 dark:border-border">
        <span className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-muted-foreground"><Wallet className="size-4" aria-hidden /> SMS en attente : {file.smsEnAttente.toLocaleString("fr-FR")}</span>
        <strong className="text-sm tabular-nums">{(file.smsEnAttente * COUT_SMS_FCFA).toLocaleString("fr-FR")} FCFA estimés</strong>
      </div>
      <p className="px-4 pb-3 text-[11px] text-slate-500 dark:text-muted-foreground">Coût indicatif hors messages multiparties et tarification supplémentaire. Aucun envoi depuis cet écran.</p>
    </section>
  );
}

export function CommunicationWorkspace({
  autoriseInvitations, autoriseNotifications, joursInvitations, parents, couverture, file, politiques, accesModules,
}: {
  autoriseInvitations: boolean;
  autoriseNotifications: boolean;
  joursInvitations: number | null;
  parents: StatistiquesParents | null;
  couverture: CouvertureFamilles | null;
  file: EtatFile | null;
  politiques: ApercuPolitique[] | null;
  accesModules: Acces[];
}) {
  const [rubrique, setRubrique] = useState<Rubrique>("synthese");
  const lienInvitations = accesModules.find((l) => l.href === "/dashboard/parents/invitations")?.href;
  const lienParents = accesModules.find((l) => l.href === "/dashboard/parents")?.href;
  const lienCommunication = accesModules.find((l) => l.href === "/dashboard/communication")?.href;
  const autoriseCanaux = autoriseNotifications || couverture !== null;
  const rubriques = RUBRIQUES.filter((r) =>
    r.id === "synthese" ||
    (r.id === "invitations" && (autoriseInvitations || Boolean(lienInvitations) || Boolean(lienParents))) ||
    (r.id === "canaux" && autoriseCanaux) ||
    (r.id === "exploitation" && (file !== null || Boolean(lienCommunication)))
  );
  const policyCount = politiques?.length ?? 0;
  const smsPolicies = politiques?.filter((p) => ["SMS_SEUL", "PUSH_ET_SMS", "PUSH_SINON_SMS"].includes(p.politique)).length ?? 0;
  const totalCouverture = couverture ? couverture.push + couverture.sms + couverture.interne : 0;
  const faiblePush = couverture && totalCouverture > 0 && couverture.push / totalCouverture < 0.1;

  const durationRow = autoriseInvitations && joursInvitations !== null ? (
    <SettingRow icon={KeyRound} tone="emerald"
      name="Validité des codes d’activation"
      description="Durée des nouveaux codes parents · les codes existants ne changent pas"
      value={`${joursInvitations} jour${joursInvitations > 1 ? "s" : ""}`}
      action={<CommunicationValidityEditor joursActuels={joursInvitations} />}
    />
  ) : null;
  const policiesRow = autoriseNotifications && politiques ? (
    <SettingRow icon={Bell} tone="violet"
      name="Règles de notification"
      description="Politiques par événement : Push, SMS, repli et désactivation"
      value={`${policyCount} règles`}
      action={<button type="button" onClick={() => setRubrique("canaux")} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold hover:border-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:border-border">Gérer <ArrowRight className="size-3.5" aria-hidden /></button>}
    />
  ) : null;

  return (
    <div className="min-w-0 space-y-5 pb-6 text-slate-950 dark:text-foreground">
      <StatStrip parents={parents} couverture={couverture} file={file} acces={accesModules} />
      <div className="grid min-w-0 gap-4 lg:grid-cols-[218px_minmax(0,1fr)] lg:gap-5">
        <aside className="min-w-0">
          <nav aria-label="Rubriques Communication" className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200/80 bg-white p-1.5 shadow-sm lg:sticky lg:top-4 lg:flex-col lg:gap-1.5 lg:p-2 dark:border-border dark:bg-card">
            {rubriques.map(({ id, titre, description, icon: Icon }) => (
              <button key={id} type="button"
                aria-pressed={rubrique === id}
                onClick={() => setRubrique(id)}
                className={`flex min-h-11 min-w-max items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-700 lg:min-w-0 ${rubrique === id
                  ? "bg-emerald-700 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 dark:text-muted-foreground dark:hover:bg-muted/40"}`}
              >
                <Icon className="size-[18px] shrink-0" aria-hidden />
                <span className="min-w-0"><span className="block text-[13px] font-semibold">{titre}</span><span className={`hidden text-[11px] lg:block ${rubrique === id ? "text-emerald-100" : "text-slate-400"}`}>{description}</span></span>
              </button>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 space-y-5">
          {rubrique === "synthese" && (
            <>
              <section aria-label="Réglages essentiels">
                <SectionTitle title="Configuration essentielle" description="Les paramètres importants au même endroit, sans formulaires permanents." />
                <div className={SURFACE + " divide-y divide-slate-100 dark:divide-border"}>
                  {durationRow}
                  {policiesRow}
                  {couverture && (
                    <SettingRow icon={Smartphone} name="Couverture des canaux"
                      description="Répartition des parents par mode de contact prioritaire"
                      value={`${couverture.push.toLocaleString("fr-FR")} Push · ${couverture.sms.toLocaleString("fr-FR")} SMS`}
                      action={<button type="button" onClick={() => setRubrique("canaux")} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold hover:border-emerald-300 dark:border-border">Analyser <ArrowRight className="size-3.5" aria-hidden /></button>}
                    />
                  )}
                  {!durationRow && !policiesRow && !couverture && <p className="px-5 py-6 text-sm text-slate-500">Aucun réglage accessible pour ce compte.</p>}
                </div>
              </section>

              {(couverture || file) && (
                <section>
                  <SectionTitle title="Santé de la communication" description="Indicateurs utiles pour détecter les problèmes de contact et de diffusion." />
                  <div className="grid min-w-0 gap-3 xl:grid-cols-2">
                    {couverture && <Coverage couverture={couverture} />}
                    {file && <QueueDetails file={file} href={lienCommunication ?? null} />}
                  </div>
                  {(faiblePush || (file && file.echouees > 0)) && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
                      <p className="flex-1"><strong>Point d’attention :</strong> {file && file.echouees > 0 ? `${file.echouees.toLocaleString("fr-FR")} notifications échouées dans l’historique. ` : ""}{faiblePush ? "L’adoption Push reste faible parmi les responsables." : ""}</p>
                      {lienCommunication && <SmallLink href={lienCommunication} label="Examiner les envois" />}
                    </div>
                  )}
                </section>
              )}
            </>
          )}

          {rubrique === "invitations" && (
            <>
              <SectionTitle title="Activation des comptes parents" description="Administrer les délais et suivre l’adoption, sans renvoyer de codes automatiquement."
                action={lienInvitations && <SmallLink href={lienInvitations} label="Historique des invitations" />} />
              <div className={SURFACE + " divide-y divide-slate-100 dark:divide-border"}>
                {durationRow}
                {parents && (
                  <SettingRow icon={Users} name="Comptes parents"
                    description={`${parents.invites.toLocaleString("fr-FR")} invités non connectés · ${parents.sansCompte.toLocaleString("fr-FR")} sans compte`}
                    value={`${parents.actifs.toLocaleString("fr-FR")} actifs`}
                    action={lienParents && <SmallLink href={lienParents} label="Gérer" />} />
                )}
                {lienInvitations && <SettingRow icon={Send} name="Suivi des invitations" description="SMS en attente, envoyés ou échoués" value="Journal" action={<SmallLink href={lienInvitations} label="Consulter" />} />}
              </div>
              <p className={DETAIL}><ShieldCheck className="mr-1 inline size-4" aria-hidden /> Les codes ne sont jamais affichés ici et aucun code déjà émis n’est prolongé par un changement de validité.</p>
            </>
          )}

          {rubrique === "canaux" && (
            <>
              <SectionTitle title="Canaux et politiques" description="Contrôler la couverture puis configurer le canal choisi pour chaque événement." />
              {couverture && <Coverage couverture={couverture} />}
              {politiques && (
                <div className="min-w-0 space-y-2">
                  <p className={DETAIL}><strong>{smsPolicies}</strong> politiques peuvent utiliser le SMS. Les changements ne déclenchent aucun envoi.</p>
                  <CommunicationPolicies lignes={politiques} />
                </div>
              )}
            </>
          )}

          {rubrique === "exploitation" && (
            <>
              <SectionTitle title="Exploitation et suivi" description="Surveiller les notifications, les incidents et le coût potentiel des SMS." />
              {file && <QueueDetails file={file} href={lienCommunication ?? null} />}
              {file && file.echouees > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm dark:border-amber-900 dark:bg-amber-950/20">
                  <strong className="text-amber-900 dark:text-amber-200">{file.echouees.toLocaleString("fr-FR")} notifications échouées dans l’historique.</strong>
                  <p className="mt-1 text-xs text-slate-600 dark:text-muted-foreground">Un échec ne doit pas déclencher de renvoi sans contrôle préalable de la cause et du coût.</p>
                </div>
              )}
              {autoriseNotifications && politiques && (
                <div className={SURFACE}>
                  <SettingRow icon={ClipboardList} name="Politiques actives" description="Consulter les règles et arbitrer les canaux de notification"
                    value={`${policyCount} événements`}
                    action={<button type="button" onClick={() => setRubrique("canaux")} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold hover:border-emerald-300 dark:border-border">Voir <ChevronRight className="size-3.5" aria-hidden /></button>} />
                </div>
              )}
            </>
          )}

          {accesModules.length > 0 && (
            <section aria-label="Modules accessibles" className="space-y-3">
              <SectionTitle title="Modules opérationnels" description="Ouvrez le module adapté à l’opération à effectuer." />
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {accesModules.map((m) => {
                  const Icon = m.href === "/dashboard/parents" ? Users : m.href === "/dashboard/parents/invitations" ? Send : MessageSquare;
                  return <Link key={m.href} href={m.href} prefetch={false} className="flex min-h-[64px] items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-3 transition-colors hover:border-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:border-border dark:bg-card">
                    <Icon className="size-[18px] shrink-0 text-slate-500" aria-hidden />
                    <span className="min-w-0 flex-1"><span className="block text-xs font-semibold">{m.titre}</span><span className="block text-[11px] text-slate-500 dark:text-muted-foreground">{m.description}</span></span>
                    <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden />
                  </Link>;
                })}
              </div>
            </section>
          )}
        </div>
      </div>
      <p className="flex items-start gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-border dark:text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        Modifications contrôlées côté serveur et consignées dans l’audit. Les commandes d’envoi et les dépenses SMS restent dans les modules opérationnels.
      </p>
    </div>
  );
}
