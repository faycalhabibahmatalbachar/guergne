import Link from "next/link";
import {
  Activity, ArrowRight, BellRing, ChevronRight, KeyRound,
  ShieldCheck, Smartphone, UserCheck, UserRoundX, Users, Wallet,
  type LucideIcon,
} from "lucide-react";

import type { StatistiquesParents } from "@/server/domain/parents";
import type { EtatFile } from "@/server/domain/communication";
import { COUT_SMS_FCFA } from "@/lib/tarifs";
import { FormulaireValidite } from "../parents/formulaire";
import { CommunicationPolicies, type ApercuPolitique } from "./communication-policies";
import type { AccesModule } from "./settings-category-panel";
import type { SettingsCard } from "../settings-catalog";

export interface CouvertureFamilles {
  push: number;
  sms: number;
  interne: number;
}

function CarteIndicateur({
  titre, valeur, detail, icon: Icon, color, bg, href,
}: {
  titre: string;
  valeur: number;
  detail: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  href?: string;
}) {
  const contenu = (
    <div className="flex min-h-[116px] min-w-0 items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm transition-colors group-hover:border-emerald-300 dark:border-border dark:bg-card">
      <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${bg}`}>
        <Icon className={`size-6 ${color}`} strokeWidth={1.8} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-600 dark:text-muted-foreground">{titre}</p>
        <p className="mt-1 text-[27px] font-bold leading-none tracking-tight tabular-nums">{valeur.toLocaleString("fr-FR")}</p>
        <p className="mt-1.5 text-[11px] leading-4 text-slate-500 dark:text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
  return href ? <Link href={href} prefetch={false} className="group block min-w-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">{contenu}</Link> : <div className="min-w-0">{contenu}</div>;
}

const TITRE_SECTION = "text-base font-bold tracking-tight text-slate-950 dark:text-foreground";
const CARTE = "min-w-0 rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card";

export function CommunicationSettingsPanel({
  items,
  accesModules,
  joursInvitations,
  parents,
  couverture,
  file,
  politiques,
}: {
  items: SettingsCard[];
  accesModules: AccesModule[];
  joursInvitations: number | null;
  parents: StatistiquesParents | null;
  couverture: CouvertureFamilles | null;
  file: EtatFile | null;
  politiques: ApercuPolitique[] | null;
}) {
  const autoriseInvitations = items.some((item) => item.id === "parents") && joursInvitations !== null;
  const autoriseNotifications = items.some((item) => item.id === "notifications") && politiques !== null;
  const lienCommunication = accesModules.find((item) => item.href === "/dashboard/communication");
  const lienParents = accesModules.find((item) => item.href === "/dashboard/parents");
  const lienInvitations = accesModules.find((item) => item.href === "/dashboard/parents/invitations");

  const statistiques = [
    ...(parents ? [
      { titre: "Parents recensés", valeur: parents.total, detail: "Dossiers de responsables", icon: Users, color: "text-emerald-700", bg: "bg-emerald-50", href: lienParents?.href },
      { titre: "Comptes actifs", valeur: parents.actifs, detail: "Comptes déjà utilisés", icon: UserCheck, color: "text-blue-700", bg: "bg-blue-50", href: lienParents ? "/dashboard/parents?etat=actif" : undefined },
      { titre: "Sans compte", valeur: parents.sansCompte, detail: "Accès à créer", icon: UserRoundX, color: "text-amber-700", bg: "bg-amber-50", href: lienParents ? "/dashboard/parents?etat=sans_compte" : undefined },
    ] : []),
    ...(couverture ? [
      { titre: "Push disponible", valeur: couverture.push, detail: "Familles avec appareil joignable", icon: Smartphone, color: "text-violet-700", bg: "bg-violet-50" },
    ] : []),
    ...(file ? [
      { titre: "En attente d'envoi", valeur: file.enAttente, detail: "Notifications en file", icon: BellRing, color: "text-sky-700", bg: "bg-sky-50", href: lienCommunication?.href },
    ] : []),
  ];

  return (
    <div className="min-w-0 space-y-5 pb-6 text-slate-950 dark:text-foreground">
      {statistiques.length > 0 && (
        <section aria-label="Indicateurs de communication" className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {statistiques.map((stat) => <CarteIndicateur key={stat.titre} {...stat} />)}
        </section>
      )}

      <section aria-labelledby="communication-outils-titre" className="space-y-3">
        <div>
          <h2 id="communication-outils-titre" className={TITRE_SECTION}>Réglages et suivi</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">
            Modifiez les invitations, contrôlez les canaux et anticipez les envois depuis un même espace.
          </p>
        </div>

        <div className="grid min-w-0 items-stretch gap-3 lg:grid-cols-3">
          {autoriseInvitations && joursInvitations !== null && (
            <section aria-labelledby="invitation-controle-titre" className={CARTE + " flex flex-col p-4"}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><KeyRound className="size-5" aria-hidden /></span>
                  <div>
                    <h3 id="invitation-controle-titre" className="text-sm font-semibold">Codes d'activation</h3>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-muted-foreground">Durée actuelle : <strong className="text-slate-900 dark:text-foreground">{joursInvitations} jours</strong></p>
                  </div>
                </div>
              </div>
              <div className="min-w-0 [&_form]:flex-col [&_form]:items-stretch [&_form_button]:h-9 [&_form_button]:bg-emerald-700 [&_form_button]:text-white [&_form_button]:hover:bg-emerald-800">
                <FormulaireValidite joursActuels={joursInvitations} />
              </div>
              <div className="mt-auto flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-xs dark:border-border">
                <p className="w-full text-slate-500 dark:text-muted-foreground">Les codes existants gardent leur échéance.</p>
                {lienInvitations && <Link href={lienInvitations.href} className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Suivi des invitations <ArrowRight className="inline size-3.5" aria-hidden /></Link>}
              </div>
            </section>
          )}

          {couverture && (
            <section aria-labelledby="couverture-controle-titre" className={CARTE + " flex flex-col p-4"}>
              <div className="flex items-start gap-2.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"><Smartphone className="size-5" aria-hidden /></span>
                <div>
                  <h3 id="couverture-controle-titre" className="text-sm font-semibold">Canaux des familles</h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-muted-foreground">Canal prioritaire actuellement retenu</p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  { label: "Push", valeur: couverture.push, couleur: "bg-violet-500" },
                  { label: "SMS", valeur: couverture.sms, couleur: "bg-blue-500" },
                  { label: "Application interne", valeur: couverture.interne, couleur: "bg-slate-400" },
                ].map((ligne) => {
                  const total = couverture.push + couverture.sms + couverture.interne;
                  const pourcent = total ? (ligne.valeur / total) * 100 : 0;
                  return <div key={ligne.label} className="space-y-1">
                    <div className="flex justify-between gap-2 text-xs"><span className="text-slate-600 dark:text-muted-foreground">{ligne.label}</span><strong className="tabular-nums">{ligne.valeur.toLocaleString("fr-FR")}</strong></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-muted"><div className={`h-full rounded-full ${ligne.couleur}`} style={{ width: `${pourcent}%` }} /></div>
                  </div>;
                })}
              </div>
              <p className="mt-auto border-t border-slate-100 pt-3 text-[11px] leading-4 text-slate-500 dark:border-border dark:text-muted-foreground">
                SMS sous réserve d'un numéro valide et du consentement ; les politiques par événement peuvent utiliser plusieurs canaux.
              </p>
            </section>
          )}

          {file && (
            <section aria-labelledby="file-controle-titre" className={CARTE + " flex flex-col p-4"}>
              <div className="flex items-start gap-2.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"><Activity className="size-5" aria-hidden /></span>
                <div>
                  <h3 id="file-controle-titre" className="text-sm font-semibold">File de notifications</h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-muted-foreground">État des envois enregistrés</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  { label: "En attente", valeur: file.enAttente },
                  { label: "Envoyées", valeur: file.envoyees },
                  { label: "Échouées", valeur: file.echouees },
                ].map((stat) => <div key={stat.label} className="rounded-lg bg-slate-50 px-2 py-2 dark:bg-muted/40">
                  <p className="text-[11px] text-slate-500 dark:text-muted-foreground">{stat.label}</p>
                  <p className="mt-1 text-lg font-bold tabular-nums">{stat.valeur.toLocaleString("fr-FR")}</p>
                </div>)}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/20">
                <span className="flex items-center gap-1.5 text-xs text-amber-900 dark:text-amber-300"><Wallet className="size-3.5" aria-hidden /> Coût SMS estimé en attente</span>
                <strong className="whitespace-nowrap text-sm tabular-nums text-amber-950 dark:text-amber-200">{(file.smsEnAttente * COUT_SMS_FCFA).toLocaleString("fr-FR")} F</strong>
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-muted-foreground">Estimation par message de base, hors segments supplémentaires.</p>
              {lienCommunication && <Link href={lienCommunication.href} className="mt-auto inline-flex items-center gap-1.5 pt-3 text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Consulter la file <ArrowRight className="size-3.5" aria-hidden /></Link>}
            </section>
          )}
        </div>
      </section>

      {autoriseNotifications && politiques && <CommunicationPolicies lignes={politiques} />}

      {accesModules.length > 0 && (
        <section aria-labelledby="communication-acces-titre" className="min-w-0 space-y-3">
          <h2 id="communication-acces-titre" className={TITRE_SECTION}>Modules et opérations</h2>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {accesModules.map((module) => {
              const Icon = module.icon;
              return <Link key={module.href} href={module.href} prefetch={false}
                className="group flex min-h-[77px] min-w-0 items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:border-border dark:bg-card">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-600 dark:bg-muted dark:text-muted-foreground"><Icon className="size-[19px]" aria-hidden /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{module.titre}</span><span className="mt-0.5 block text-xs text-slate-500 dark:text-muted-foreground">{module.description}</span></span>
                <ChevronRight className="size-4 shrink-0 text-slate-400 group-hover:text-emerald-700" aria-hidden />
              </Link>;
            })}
          </div>
        </section>
      )}

      <p className="flex items-start gap-2 text-xs text-slate-500 dark:text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        Les informations et commandes affichées dépendent des autorisations ; les changements de paramètres sont vérifiés côté serveur et consignés dans le journal d'audit.
      </p>
    </div>
  );
}
