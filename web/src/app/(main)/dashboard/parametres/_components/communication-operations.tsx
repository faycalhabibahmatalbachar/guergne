"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle, ArrowRight, BellRing, CheckCircle2, Clock3, KeyRound,
  MessageSquare, Search, ShieldCheck, Smartphone, Users, Wallet,
} from "lucide-react";

import type { StatistiquesParents } from "@/server/domain/parents";
import type { EtatFile } from "@/server/domain/communication";
import { COUT_SMS_FCFA } from "@/lib/tarifs";
import { CommunicationValidityEditor } from "./communication-validity-editor";
import { CommunicationIncidentEditor, libelleGravite } from "./communication-incident-editor";
import { CommunicationPolicies, type ApercuPolitique } from "./communication-policies";
import type { CouvertureFamilles } from "./communication-settings-panel";

export type InvitationOverview = {
  total: number;
  enAttente: number;
  envoyees: number;
  echouees: number;
  lues: number;
  recentes: { id: string; statut: string; creeLe: string; tentatives: number; finTelephone: string }[];
};
export type NotificationOverview = {
  canaux: { canal: string; statut: string; total: number }[];
  echecs: { id: string; type: string; canal: string; tentatives: number; creeLe: string }[];
};

const PANEL = "min-w-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card";
const LINK = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:border-border dark:bg-card dark:text-foreground";
const fmt = (v: number) => v.toLocaleString("fr-FR");
const dt = (v: string) => new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
const statusText: Record<string, string> = { EN_ATTENTE: "En attente", ENVOYE: "Envoyé", ECHOUE: "Échoué", LU: "Lu" };
const channelText: Record<string, string> = { SMS: "SMS", PUSH: "Push", IN_APP: "Boîte interne" };
const statusColor: Record<string, string> = {
  EN_ATTENTE: "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200",
  ENVOYE: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-200",
  ECHOUE: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-200",
  LU: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200",
};
function State({ value }: { value: string }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${statusColor[value] ?? "bg-slate-100 text-slate-600"}`}>{statusText[value] ?? value}</span>;
}
function Header({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5 dark:border-border">
    <div><h2 className="text-base font-bold">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-muted-foreground">{description}</p></div>{action}
  </header>;
}
function Open({ href, text }: { href: string; text: string }) {
  return <Link href={href} prefetch={false} className={LINK}>{text}<ArrowRight className="size-3.5" aria-hidden /></Link>;
}
function Figures({ items }: { items: { label: string; n: number; href?: string; description: string }[] }) {
  return <div className={PANEL + " flex min-w-0 divide-x divide-slate-100 overflow-x-auto dark:divide-border"}>
    {items.map((s) => {
      const child = <><span className="block whitespace-nowrap text-xs font-medium text-slate-600 dark:text-muted-foreground">{s.label}</span><strong className="mt-1 block text-2xl leading-tight tabular-nums">{fmt(s.n)}</strong><span className="mt-1 block text-[11px] text-slate-500 dark:text-muted-foreground">{s.description}</span></>;
      return s.href
        ? <Link key={s.label} href={s.href} className="min-w-[150px] flex-1 px-4 py-3 hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-700 dark:hover:bg-muted/30">{child}</Link>
        : <div key={s.label} className="min-w-[150px] flex-1 px-4 py-3">{child}</div>;
    })}
  </div>;
}

export function InvitationsOperations({
  parents, joursInvitations, autoriseInvitations, invitations, hrefParents, hrefHistorique,
}: {
  parents: StatistiquesParents | null; joursInvitations: number | null; autoriseInvitations: boolean;
  invitations: InvitationOverview | null; hrefParents: string | null; hrefHistorique: string | null;
}) {
  const [filtre, setFiltre] = useState("TOUS");
  const recents = invitations?.recentes.filter((v) => filtre === "TOUS" || v.statut === filtre) ?? [];
  return <div className="space-y-4">
    <Figures items={[
      ...(parents ? [
        { label: "Responsables", n: parents.total, description: "Dossiers recensés", href: hrefParents ?? undefined },
        { label: "Sans compte", n: parents.sansCompte, description: "Comptes à créer", href: hrefParents ? hrefParents + "?etat=sans_compte" : undefined },
        { label: "Invités", n: parents.invites, description: "Aucune connexion", href: hrefParents ? hrefParents + "?etat=invite" : undefined },
        { label: "Actifs", n: parents.actifs, description: "Déjà connectés", href: hrefParents ? hrefParents + "?etat=actif" : undefined },
      ] : []),
      ...(!parents && invitations ? [{ label: "SMS d'invitation", n: invitations.total, description: "Historique des envois" }] : []),
    ]} />

    <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
      <section className={PANEL}>
        <Header title="Gestion des accès parents" description="Les actions s'effectuent dans les comptes parents, selon vos autorisations."
          action={hrefParents ? <Open href={hrefParents} text="Ouvrir les comptes" /> : undefined} />
        <div className="divide-y divide-slate-100 dark:divide-border">
          {[
            { title: "Créer les accès manquants", description: "Vérifier les coordonnées et inviter les parents sans compte", number: parents?.sansCompte, href: hrefParents ? hrefParents + "?etat=sans_compte" : null, icon: Users },
            { title: "Suivre les parents invités", description: "Comptes créés, mais sans première connexion", number: parents?.invites, href: hrefParents ? hrefParents + "?etat=invite" : null, icon: BellRing },
            { title: "Vérifier les comptes actifs", description: "Parents ayant déjà ouvert leur espace", number: parents?.actifs, href: hrefParents ? hrefParents + "?etat=actif" : null, icon: CheckCircle2 },
          ].filter((x) => x.number !== undefined).map(({ title, description, number, href, icon: Icon }) =>
            <div key={title} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
              <div className="flex min-w-0 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-600 dark:bg-muted dark:text-foreground"><Icon className="size-[18px]" aria-hidden /></span>
                <div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">{description}</p></div></div>
              <div className="flex items-center gap-2"><strong className="text-sm tabular-nums">{fmt(number ?? 0)}</strong>{href && <Open href={href} text="Gérer" />}</div>
            </div>
          )}
          {!parents && <p className="px-5 py-5 text-sm text-slate-500">Statistiques de comptes non accessibles à ce rôle.</p>}
        </div>
      </section>
      <section className={PANEL}>
        <Header title="Règles d'activation" description="Paramètres applicables aux futures invitations." />
        <div className="space-y-4 p-4 sm:p-5">
          {autoriseInvitations && joursInvitations !== null ? (
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-xs text-slate-500">Durée des codes</p><p className="mt-1 text-xl font-bold tabular-nums">{joursInvitations} jours</p></div>
              <CommunicationValidityEditor joursActuels={joursInvitations} />
            </div>
          ) : <p className="text-xs text-slate-500">Configuration de la durée non autorisée.</p>}
          <div className="flex gap-2 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500 dark:border-border"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />Une modification n'allonge pas les codes déjà émis et ne déclenche aucun SMS.</div>
          {hrefHistorique && <Open href={hrefHistorique} text="Historique complet" />}
        </div>
      </section>
    </div>

    {invitations && <section className={PANEL}>
      <Header title="Historique des invitations" description="Derniers SMS d'activation — sans codes secrets ni contenu des messages."
        action={hrefHistorique ? <Open href={hrefHistorique} text="Voir tous les envois" /> : undefined} />
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 p-3 sm:px-4 dark:border-border" role="group" aria-label="Filtrer les invitations">
        {(["TOUS", "EN_ATTENTE", "ENVOYE", "ECHOUE", "LU"] as const).map((s) => {
          const count = s === "TOUS" ? invitations.total : ({ EN_ATTENTE: invitations.enAttente, ENVOYE: invitations.envoyees, ECHOUE: invitations.echouees, LU: invitations.lues })[s];
          return <button type="button" key={s} aria-pressed={filtre === s} onClick={() => setFiltre(s)}
            className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${filtre === s ? "bg-emerald-700 text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-muted dark:text-foreground"}`}>
            {s === "TOUS" ? "Toutes" : statusText[s]} ({fmt(count)})
          </button>;
        })}
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm">
        <thead className="bg-slate-50/60 text-xs text-slate-500 dark:bg-muted/30">
          <tr><th className="px-4 py-3 font-semibold">Création</th><th className="px-4 py-3 font-semibold">Téléphone masqué</th><th className="px-4 py-3 font-semibold">Statut</th><th className="px-4 py-3 font-semibold">Tentatives</th><th className="px-4 py-3 text-right font-semibold">Action</th></tr>
        </thead><tbody className="divide-y divide-slate-100 dark:divide-border">
          {recents.map((v) => <tr key={v.id}>
            <td className="px-4 py-3 text-xs">{dt(v.creeLe)}</td><td className="px-4 py-3 font-mono text-xs">{v.finTelephone ? "•••• " + v.finTelephone : "Masqué"}</td>
            <td className="px-4 py-3"><State value={v.statut} /></td><td className="px-4 py-3 tabular-nums">{v.tentatives}</td>
            <td className="px-4 py-3 text-right">{hrefHistorique && <Link href={hrefHistorique + "?statut=" + v.statut} className="text-xs font-semibold text-emerald-700 hover:underline">Consulter</Link>}</td>
          </tr>)}
          {recents.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-500">Aucune invitation dans les dernières entrées pour ce statut. Consultez l'historique complet.</td></tr>}
        </tbody>
      </table></div>
    </section>}
  </div>;
}

export function CanauxOperations({ couverture, politiques, seuilIncident, onModify }: {
  couverture: CouvertureFamilles | null;
  politiques: ApercuPolitique[] | null;
  seuilIncident: string | null;
  onModify?: () => void;
}) {
  const tot = couverture ? couverture.push + couverture.sms + couverture.interne : 0;
  const channels = couverture ? [
    { key: "PUSH", title: "Application Push", n: couverture.push, desc: "Appareils avec jeton actif", color: "bg-violet-500", icon: Smartphone },
    { key: "SMS", title: "SMS", n: couverture.sms, desc: "Canal de repli si consenti", color: "bg-blue-500", icon: MessageSquare },
    { key: "IN_APP", title: "Boîte interne", n: couverture.interne, desc: "Pas de Push ni SMS prioritaire", color: "bg-slate-500", icon: BellRing },
  ] : [];
  return <div className="space-y-4">
    {couverture && <section className={PANEL}>
      <Header title="Couverture des familles" description="Canal prioritaire calculé pour chaque responsable : ce n'est pas une garantie de livraison." />
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <span className="text-sm font-semibold">{fmt(tot)} responsables analysés</span>
        <span className="text-xs text-slate-500">Répartition selon appareils et consentements</span>
      </div>
      <div className="mx-4 mt-3 flex h-2.5 overflow-hidden rounded-full bg-slate-100 sm:mx-5 dark:bg-muted">
        {channels.map((ch) => <div key={ch.key} className={ch.color} style={{width: tot ? `${(ch.n / tot) * 100}%` : "0%"}} />)}
      </div>
      <div className="mt-4 grid gap-0 divide-y divide-slate-100 border-t border-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-border dark:border-border">
        {channels.map(({ key, title, n, desc, color, icon: Icon }) => <div key={key} className="flex items-start gap-3 px-4 py-4 sm:px-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 dark:bg-muted"><Icon className="size-4" aria-hidden /></span>
          <div className="min-w-0"><p className="text-xs font-semibold">{title}</p><p className="mt-1 text-[23px] font-bold tabular-nums">{fmt(n)} <span className="text-xs font-medium text-slate-500">({tot ? (100*n/tot).toFixed(1) : "0"} %)</span></p><p className="mt-1 text-[11px] text-slate-500 dark:text-muted-foreground">{desc}</p><span className={`mt-2 block h-1 w-10 rounded-full ${color}`} /></div>
        </div>)}
      </div>
    </section>}
    {couverture && tot > 0 && couverture.push / tot < .1 && <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p><strong>Adoption Push faible.</strong> La majorité des responsables utilise le SMS comme canal prioritaire. Vérifiez les installations de l'application avant d'envisager une politique « Push uniquement ».</p>
    </div>}
    {politiques && <section className={PANEL + " p-3 sm:p-4"}>
      <CommunicationPolicies lignes={politiques} />
    </section>}
    {seuilIncident && <section className={PANEL}>
      <Header title="Règles complémentaires" description="Paramètres métiers indépendants du choix Push ou SMS." />
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
        <div><p className="text-sm font-semibold">Gravité minimale des incidents</p><p className="mt-1 text-xs text-slate-500">Événements concernés par les prochaines alertes de discipline.</p></div>
        <div className="flex items-center gap-3"><strong className="text-sm">{libelleGravite(seuilIncident)}</strong><CommunicationIncidentEditor actuel={seuilIncident} /></div>
      </div>
    </section>}
  </div>;
}

export function SuiviOperations({ file, echouees30, details, messagesHref }: {
  file: EtatFile; echouees30: number | null; details: NotificationOverview | null; messagesHref: string | null;
}) {
  const [canal, setCanal] = useState("TOUS");
  const [query, setQuery] = useState("");
  const filtres = useMemo(() =>
    (details?.echecs ?? []).filter((x) => (canal === "TOUS" || x.canal === canal)
      && (!query.trim() || [x.type, x.canal].join(" ").toLocaleLowerCase("fr-FR").includes(query.trim().toLocaleLowerCase("fr-FR")))),
    [details, canal, query]);
  const matrix = ["PUSH", "SMS", "IN_APP"].map((c) => {
    const rows = details?.canaux.filter((x) => x.canal === c) ?? [];
    return { canal: c, total: rows.reduce((s,x)=>s+x.total,0), attente: rows.filter(x=>x.statut === "EN_ATTENTE").reduce((s,x)=>s+x.total,0), envoye: rows.filter(x=>["ENVOYE","LU"].includes(x.statut)).reduce((s,x)=>s+x.total,0), echoue: rows.filter(x=>x.statut === "ECHOUE").reduce((s,x)=>s+x.total,0) };
  });
  return <div className="space-y-4">
    <Figures items={[
      { label: "En attente", n: file.enAttente, description: "File actuelle" },
      { label: "Envoyées", n: file.envoyees, description: "Historique cumulé" },
      { label: "Échouées", n: file.echouees, description: "Historique cumulé" },
      { label: "Échecs récents", n: echouees30 ?? 0, description: "Sur 30 jours" },
    ]} />
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,1fr)]">
      {details && <section className={PANEL}>
        <Header title="Diffusion par canal" description="Statuts des notifications créées au cours des 30 derniers jours." />
        <div className="overflow-x-auto"><table className="w-full min-w-[440px] text-left text-sm">
          <thead className="bg-slate-50/60 text-xs text-slate-500 dark:bg-muted/30"><tr><th className="px-4 py-3">Canal</th><th className="px-4 py-3 text-right">Produites</th><th className="px-4 py-3 text-right">En attente</th><th className="px-4 py-3 text-right">Envoyées / lues</th><th className="px-4 py-3 text-right">Échouées</th></tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-border">{matrix.map(x=><tr key={x.canal}>
            <td className="px-4 py-3 font-semibold">{channelText[x.canal]}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(x.total)}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(x.attente)}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(x.envoye)}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(x.echoue)}</td>
          </tr>)}</tbody>
        </table></div>
      </section>}
      <section className={PANEL}>
        <Header title="Coût potentiel des SMS" description="Estimation du stock en attente, pas une facture définitive." />
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-3"><span className="flex size-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Wallet className="size-5" aria-hidden /></span>
            <div><p className="text-xs text-slate-500">SMS en file</p><p className="text-2xl font-bold tabular-nums">{fmt(file.smsEnAttente)}</p></div></div>
          <p className="mt-3 text-2xl font-bold tabular-nums">{fmt(file.smsEnAttente * COUT_SMS_FCFA)} FCFA <span className="text-sm font-normal text-slate-500">estimés</span></p>
          <p className="mt-2 text-xs leading-5 text-slate-500">Tarif indicatif de {fmt(COUT_SMS_FCFA)} FCFA par segment de base. Les SMS multiparties peuvent coûter davantage.</p>
          <div className="mt-4 border-t border-slate-100 pt-4 dark:border-border">{messagesHref && <Open href={messagesHref} text="Consulter le journal" />}</div>
        </div>
      </section>
    </div>
    {details && <section className={PANEL}>
      <Header title="Derniers échecs" description="Diagnostic de première lecture, sans texte de message ni coordonnées personnelles."
        action={messagesHref ? <Open href={messagesHref} text="Journal des notifications" /> : undefined} />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-3 sm:px-4 dark:border-border">
        <div role="group" aria-label="Filtrer les échecs" className="flex flex-wrap gap-1.5">
          {["TOUS","SMS","PUSH","IN_APP"].map(c => <button key={c} type="button" aria-pressed={canal === c} onClick={()=>setCanal(c)}
            className={`h-9 rounded-lg px-3 text-xs font-semibold ${canal === c ? "bg-emerald-700 text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-muted dark:text-foreground"}`}>{c === "TOUS" ? "Tous" : channelText[c]}</button>)}
        </div>
        <div className="relative w-full sm:w-60"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input aria-label="Rechercher un type d'événement" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher un événement…"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 dark:border-border dark:bg-card" /></div>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm">
        <thead className="bg-slate-50/60 text-xs text-slate-500 dark:bg-muted/30"><tr><th className="px-4 py-3 font-semibold">Création</th><th className="px-4 py-3 font-semibold">Type d'événement</th><th className="px-4 py-3 font-semibold">Canal</th><th className="px-4 py-3 font-semibold">Tentatives</th><th className="px-4 py-3 text-right font-semibold">Statut</th></tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-border">
          {filtres.map(x=><tr key={x.id}><td className="px-4 py-3 text-xs">{dt(x.creeLe)}</td><td className="px-4 py-3 text-xs font-semibold">{x.type.replaceAll("_", " ")}</td><td className="px-4 py-3 text-xs">{channelText[x.canal] ?? x.canal}</td><td className="px-4 py-3 tabular-nums">{x.tentatives}</td><td className="px-4 py-3 text-right"><State value="ECHOUE" /></td></tr>)}
          {!filtres.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-xs text-slate-500">Aucun échec récent correspondant à ce filtre.</td></tr>}
        </tbody>
      </table></div>
      <p className="border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-500 dark:border-border">Affichage limité aux {details.echecs.length} échecs les plus récents. Les défaillances ne sont pas relancées automatiquement depuis cette page.</p>
    </section>}
  </div>;
}
