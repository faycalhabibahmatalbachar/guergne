"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, CalendarDays, Check,
  ChevronRight, Clock3, Database, FileClock, Fingerprint, Globe2, History,
  Laptop, LockKeyhole, RotateCcw, Search, ShieldAlert, ShieldCheck,
  SlidersHorizontal, UserRound, UsersRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateAudit, libelleChamp } from "@/lib/audit-presentation";
import type { LigneAudit, ResultatAudit } from "@/server/domain/audit";

const ROLES: Record<string, string> = {
  SUPER_ADMIN:"Super administrateur",DIRECTION:"Direction",
  CENSEUR:"Censeur",SURVEILLANT:"Surveillance",SECRETARIAT:"Secrétariat",
  COMPTABLE:"Comptabilité",ENSEIGNANT:"Enseignant",PARENT:"Parent",ELEVE:"Élève",
};
const ENTITES: Record<string,string> = {
  utilisateurs:"Compte utilisateur",eleves:"Dossier élève",tuteurs:"Responsable légal",
  classes:"Classe",bulletins:"Bulletin",messages:"Communication",evaluations:"Évaluation",
  periodes:"Période",journal_audit:"Journal d'audit",
};

function formatCourt(date: string) {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? "Date inconnue" :
    new Intl.DateTimeFormat("fr-FR",{
      timeZone:"Africa/Ndjamena",day:"2-digit",month:"short",year:"numeric",
      hour:"2-digit",minute:"2-digit",
    }).format(d);
}
function etiquettePreuve(ligne: LigneAudit): string {
  return ligne.preuve.typePreuve === "comparaison" ? "Avant / après disponible" :
    ligne.preuve.typePreuve === "resultat" ? "Résultat enregistré" : "Sans état détaillé";
}
function categorie(ligne: LigneAudit) {
  if (/connexion|mot_de_passe|deconnexion|permission|session/i.test(ligne.action)) {
    return {icon:LockKeyhole, tonalite:"border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"};
  }
  if (/notification|message|tuteur/i.test(ligne.action)) {
    return {icon:UsersRound,tonalite:"border-sky-100 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300"};
  }
  return {icon:Activity,tonalite:"border-slate-200 bg-slate-50 text-slate-700 dark:border-border dark:bg-muted dark:text-foreground"};
}
function TitreValeur({label,children}:{label:string;children:ReactNode}) {
  return <div className="min-w-0 space-y-1">
    <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-muted-foreground">{label}</dt>
    <dd className="break-words text-sm font-semibold text-slate-900 dark:text-foreground">{children}</dd>
  </div>;
}
function Stat({titre,valeur,legende,icon:Icon}:{
  titre:string;valeur:string|number;legende:string;icon:typeof Activity;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 dark:border-border dark:bg-card">
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500 dark:text-muted-foreground">
        <span>{titre}</span><Icon className="size-4 shrink-0" aria-hidden />
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{valeur}</div>
      <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">{legende}</p>
    </div>
  );
}
function Ensemble({titre,children}:{titre:string;children:ReactNode}){
  return <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-border dark:bg-card">
    <h3 className="mb-4 text-sm font-bold text-slate-900 dark:text-foreground">{titre}</h3>
    {children}
  </section>;
}

function PanneauDetails({ligne,onClose}:{
  ligne:LigneAudit|null;onClose:()=>void;
}) {
  return (
    <Sheet open={Boolean(ligne)} onOpenChange={ouvert=>{if(!ouvert)onClose();}}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[min(740px,94vw)]">
        {ligne ? (
          <>
            <SheetHeader className="shrink-0 border-b border-slate-200 px-5 pb-4 pt-6 dark:border-border sm:px-7">
              <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30">
                <ShieldCheck className="size-3.5" aria-hidden /> Événement enregistré
              </div>
              <SheetTitle className="pr-8 text-xl font-bold tracking-tight sm:text-2xl">
                {ligne.actionLibelle}
              </SheetTitle>
              <SheetDescription className="mt-1 text-xs leading-relaxed">
                Trace n° {ligne.id} · {formatDateAudit(ligne.date)} · heure du Tchad (UTC+1)
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7">
              <Tabs key={ligne.id} defaultValue="synthese" className="gap-5">
                <TabsList className="grid h-10 w-full grid-cols-3 rounded-xl bg-slate-100 p-1 dark:bg-muted">
                  <TabsTrigger value="synthese" className="text-xs sm:text-sm">1. Synthèse</TabsTrigger>
                  <TabsTrigger value="evolution" className="text-xs sm:text-sm">2. Avant / après</TabsTrigger>
                  <TabsTrigger value="trace" className="text-xs sm:text-sm">3. Traçabilité</TabsTrigger>
                </TabsList>

                <TabsContent value="synthese" className="space-y-4">
                  <Ensemble titre="Qui a effectué cette action ?">
                    <div className="flex items-center gap-3">
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 dark:bg-muted dark:text-foreground">
                        <UserRound className="size-5" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{ligne.acteur}</p>
                        <p className="text-xs text-slate-500">{ROLES[ligne.role??""]??ligne.role??"Rôle non enregistré"}</p>
                      </div>
                    </div>
                  </Ensemble>
                  <Ensemble titre="Résumé de l'opération">
                    <dl className="grid gap-5 sm:grid-cols-2">
                      <TitreValeur label="Action">{ligne.actionLibelle}</TitreValeur>
                      <TitreValeur label="Domaine">{ligne.familleLibelle}</TitreValeur>
                      <TitreValeur label="Dossier concerné">{ligne.eleve || ENTITES[ligne.entite] || libelleChamp(ligne.entite)}</TitreValeur>
                      <TitreValeur label="Date et heure">{formatDateAudit(ligne.date)}</TitreValeur>
                    </dl>
                    {ligne.motif ? <div className="mt-5 rounded-lg border-l-2 border-slate-400 bg-slate-50 px-4 py-3 dark:bg-muted">
                      <p className="text-xs font-semibold text-slate-600 dark:text-foreground">Motif consigné</p>
                      <p className="mt-1 text-sm leading-relaxed">{ligne.motif}</p>
                    </div> : <p className="mt-4 text-xs text-slate-500">Aucun motif explicite n'a été consigné pour cet événement.</p>}
                  </Ensemble>
                  <Ensemble titre="Qualité des preuves">
                    <div className="flex items-center gap-2">
                      {ligne.preuve.typePreuve==="comparaison"?<Check className="size-4 text-emerald-700" aria-hidden/>:<ShieldAlert className="size-4 text-amber-700" aria-hidden/>}
                      <p className="text-sm font-semibold">{etiquettePreuve(ligne)}</p>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                      {ligne.preuve.typePreuve==="comparaison"
                        ?"Le journal contient un état avant et un état après. Seuls les champs effectivement présents sont comparés."
                        :ligne.preuve.typePreuve==="resultat"
                        ?"Le résultat a été consigné, mais l'état antérieur n'a pas été enregistré. Il ne peut pas être reconstitué avec certitude."
                        :"Le journal atteste l'événement et son contexte, mais ne contient pas de valeurs métiers détaillées."}
                    </p>
                  </Ensemble>
                </TabsContent>

                <TabsContent value="evolution" className="space-y-4">
                  <Ensemble titre="Évolution constatée">
                    {ligne.preuve.changements.length ? <div className="space-y-3">
                      {ligne.preuve.changements.map((v,i)=>(
                        <div key={i} className="rounded-xl border border-slate-200 p-3 dark:border-border">
                          <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-foreground">{v.champ}</p>
                          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 text-xs">
                            <div className="min-w-0 rounded-lg bg-slate-50 p-2.5 dark:bg-muted">
                              <span className="text-[10px] font-semibold uppercase text-slate-500">Avant</span>
                              <p className="mt-1 break-words font-medium">{v.avant}</p>
                            </div>
                            <ArrowRight className="mt-6 size-4 text-slate-400" aria-hidden/>
                            <div className="min-w-0 rounded-lg bg-emerald-50 p-2.5 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                              <span className="text-[10px] font-semibold uppercase">Après</span>
                              <p className="mt-1 break-words font-medium">{v.apres}</p>
                            </div>
                          </div>
                          {v.nature==="information" && <p className="mt-2 text-[11px] text-slate-500">
                            Une des deux valeurs n'a pas été enregistrée ; ce n'est pas une comparaison complète.
                          </p>}
                        </div>
                      ))}
                    </div>:<p className="text-sm text-slate-500">Aucune évolution détaillée exploitable pour cette action.</p>}
                  </Ensemble>
                  <div className="grid gap-3 md:grid-cols-2">
                    {([{titre:"État avant",lignes:ligne.preuve.lignesAvant},
                      {titre:"État après",lignes:ligne.preuve.lignesApres}] as const).map(bloc=>(
                        <Ensemble key={bloc.titre} titre={bloc.titre}>
                          {bloc.lignes.length? <dl className="space-y-3">
                            {bloc.lignes.map((v,i)=><div key={i} className="border-b border-slate-100 pb-2 last:border-0 dark:border-border">
                              <dt className="text-xs text-slate-500">{v.label}</dt>
                              <dd className="mt-1 break-words text-sm font-medium">{v.valeur}</dd>
                            </div>)}
                          </dl>:<p className="text-xs text-slate-500">Non enregistré dans le journal.</p>}
                        </Ensemble>
                    ))}
                  </div>
                  <p className="text-xs leading-relaxed text-slate-500">
                    Les mots de passe, codes, jetons et autres champs sensibles sont systématiquement masqués.
                    Les données absentes ne sont jamais inventées.
                  </p>
                </TabsContent>

                <TabsContent value="trace" className="space-y-4">
                  <Ensemble titre="Quand et comment ?">
                    <dl className="grid gap-5 sm:grid-cols-2">
                      <TitreValeur label="Horodatage précis">{formatDateAudit(ligne.date)}</TitreValeur>
                      <TitreValeur label="Fuseau d'affichage">Tchad — UTC+1</TitreValeur>
                      <TitreValeur label="Appareil / méthode">{ligne.appareil}</TitreValeur>
                      <TitreValeur label="Origine réseau">{ligne.ip || "Adresse IP non consignée"}</TitreValeur>
                    </dl>
                    <p className="mt-4 text-xs leading-relaxed text-slate-500">
                      L'adresse IP identifie une origine réseau observée, pas une adresse physique exacte.
                      La position géographique n'est pas enregistrée par ce journal.
                    </p>
                  </Ensemble>
                  <Ensemble titre="Références de traçabilité">
                    <dl className="grid gap-4">
                      <TitreValeur label="Identifiant de l'événement">N° {ligne.id}</TitreValeur>
                      <TitreValeur label="Objet enregistré">{ligne.entiteId ? "Référence ···"+ligne.entiteId.slice(-8) : "Non renseigné"}</TitreValeur>
                      <TitreValeur label="Compte à l'origine">{ligne.acteurId ? "Référence ···"+ligne.acteurId.slice(-8) : "Non renseigné"}</TitreValeur>
                      <TitreValeur label="Code d'action (identifiant technique)">{ligne.action}</TitreValeur>
                    </dl>
                  </Ensemble>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    <p className="mb-1 flex items-center gap-2 font-semibold"><ShieldAlert className="size-4" aria-hidden/> Limites des traces</p>
                    Un contexte absent n'est pas une preuve qu'il n'existait pas. Pour une enquête,
                    rapprocher cet événement des autres journaux applicatifs et de l'infrastructure.
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </>
        ):null}
      </SheetContent>
    </Sheet>
  );
}

export function VueAudit({
  journal,familles,acteurs,filtres,
}:{
  journal:ResultatAudit;
  familles:Array<{famille:string;label:string;nombre:number}>;
  acteurs:Array<{id:string;nom:string;role:string|null;nombre:number}>;
  filtres:{action:string;entite:string;acteur:string;recherche:string;depuis:string;jusqua:string};
}) {
  const routeur=useRouter();
  const params=useSearchParams();
  const [selection,setSelection]=useState<LigneAudit|null>(null);
  const [recherche,setRecherche]=useState(filtres.recherche);
  const base="/dashboard/parametres/audit";

  function naviguer(changements:Record<string,string>){
    setSelection(null);
    const p=new URLSearchParams(params.toString());
    for(const [cle,valeur] of Object.entries(changements)){
      if(valeur)p.set(cle,valeur);else p.delete(cle);
    }
    p.delete("page");
    routeur.push(base+"?"+p.toString());
  }
  function paginer(n:number){
    setSelection(null);
    const p=new URLSearchParams(params.toString());
    p.set("page",String(n));
    routeur.push(base+"?"+p.toString());
  }
  const pourcentage=(n:number)=>journal.total?Math.round(n*100/journal.total):0;
  const actif=Boolean(filtres.action||filtres.entite||filtres.acteur||filtres.recherche||filtres.depuis||filtres.jusqua);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat titre="Événements trouvés" valeur={journal.total.toLocaleString("fr-FR")} legende="Pour les filtres sélectionnés" icon={History}/>
        <Stat titre="Origine réseau" valeur={pourcentage(journal.couverture.adresseIp)+" %"} legende="Avec une adresse IP conservée" icon={Globe2}/>
        <Stat titre="Appareil identifié" valeur={pourcentage(journal.couverture.appareil)+" %"} legende="Avec un agent utilisateur" icon={Laptop}/>
        <Stat titre="État avant disponible" valeur={pourcentage(journal.couverture.avant)+" %"} legende="Taux de comparaison possible" icon={Database}/>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-border dark:bg-card">
        <div className="mb-4 flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-slate-500" aria-hidden/>
          <h3 className="text-sm font-bold">Rechercher dans les traces</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_minmax(150px,190px)_minmax(150px,190px)_140px_140px]">
          <form onSubmit={e=>{e.preventDefault();naviguer({recherche});}} className="space-y-1.5">
            <Label htmlFor="audit-recherche" className="text-xs">Action, nom, dossier ou motif</Label>
            <div className="flex gap-2">
              <Input id="audit-recherche" type="search" value={recherche} maxLength={90}
                onChange={e=>setRecherche(e.target.value)}
                placeholder="Rechercher…" className="h-10 min-w-0 flex-1"/>
              <Button type="submit" variant="outline" size="icon" className="size-10 shrink-0" aria-label="Lancer la recherche"><Search className="size-4"/></Button>
            </div>
          </form>
          <div className="space-y-1.5">
            <Label htmlFor="audit-famille" className="text-xs">Domaine d'activité</Label>
            <NativeSelect id="audit-famille" className="h-10 w-full" value={filtres.action}
              onChange={e=>naviguer({action:e.target.value})}>
              <option value="">Toutes les activités</option>
              {familles.map(f=><option value={f.famille} key={f.famille}>{f.label} ({f.nombre})</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-acteur" className="text-xs">Auteur</Label>
            <NativeSelect id="audit-acteur" className="h-10 w-full" value={filtres.acteur}
              onChange={e=>naviguer({acteur:e.target.value})}>
              <option value="">Tous les utilisateurs</option>
              {acteurs.map(a=><option key={a.id} value={a.id}>{a.nom} ({a.nombre})</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-depuis" className="text-xs">Du</Label>
            <Input id="audit-depuis" type="date" className="h-10" value={filtres.depuis}
              onChange={e=>naviguer({depuis:e.target.value})}/>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-jusqua" className="text-xs">Au</Label>
            <Input id="audit-jusqua" type="date" className="h-10" value={filtres.jusqua}
              onChange={e=>naviguer({jusqua:e.target.value})}/>
          </div>
        </div>
        {actif&&<div className="mt-3 flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={()=>{setRecherche("");routeur.push(base);}}>
            <RotateCcw className="size-3.5" aria-hidden/> Réinitialiser les filtres
          </Button>
        </div>}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-border dark:bg-card" aria-label="Chronologie des événements">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-4 dark:border-border sm:px-5">
          <div>
            <h3 className="text-sm font-bold">Chronologie des actions</h3>
            <p className="mt-1 text-xs text-slate-500">
              {journal.total.toLocaleString("fr-FR")} événement(s) · du plus récent au plus ancien
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Clock3 className="size-4" aria-hidden/> Heure du Tchad (UTC+1)
          </span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-border">
          {journal.lignes.length?journal.lignes.map(l=>{
            const info=categorie(l),Icon=info.icon;
            return (
              <button key={l.id} type="button" onClick={()=>setSelection(l)}
                className="group flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600 dark:hover:bg-muted sm:gap-4 sm:px-5">
                <span className={"grid size-10 shrink-0 place-items-center rounded-xl border "+info.tonalite}>
                  <Icon className="size-4.5" aria-hidden/>
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <strong className="text-sm font-semibold text-slate-900 dark:text-foreground">{l.actionLibelle}</strong>
                    <Badge variant="outline" className="max-w-full truncate text-[10px] font-normal text-slate-500">{l.familleLibelle}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-muted-foreground">
                    <span className="font-semibold text-slate-700 dark:text-foreground">{l.acteur}</span>
                    <span aria-hidden>·</span>
                    <span>{ROLES[l.role??""]??"Rôle inconnu"}</span>
                    <span aria-hidden>·</span>
                    <span>{l.eleve||ENTITES[l.entite]||libelleChamp(l.entite)}</span>
                  </div>
                  {l.motif?<p className="line-clamp-2 text-xs leading-relaxed text-slate-500">{l.motif}</p>:null}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1"><FileClock className="size-3.5" aria-hidden/>{etiquettePreuve(l)}</span>
                    <span className="inline-flex items-center gap-1"><Laptop className="size-3.5" aria-hidden/>{l.appareil}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2 self-center">
                  <span className="text-right text-[11px] font-medium tabular-nums text-slate-500">{formatCourt(l.date)}</span>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 opacity-80 group-hover:text-blue-700 dark:text-foreground">
                    Examiner <ChevronRight className="size-4" aria-hidden/>
                  </span>
                </div>
              </button>
            );
          }):<div className="px-5 py-16 text-center">
            <Search className="mx-auto mb-3 size-7 text-slate-400" aria-hidden/>
            <p className="text-sm font-semibold">Aucun événement pour ces critères</p>
            <p className="mt-1 text-xs text-slate-500">Modifiez la période ou effacez les filtres pour élargir la recherche.</p>
          </div>}
        </div>
        <footer className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-xs dark:border-border sm:px-5">
          <span className="text-slate-500">
            Page {journal.page} sur {journal.nbPages} · {journal.parPage} traces par page
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={journal.page<=1} onClick={()=>paginer(journal.page-1)}>
              <ArrowLeft className="size-3.5" aria-hidden/> Précédent
            </Button>
            <Button size="sm" variant="outline" disabled={journal.page>=journal.nbPages} onClick={()=>paginer(journal.page+1)}>
              Suivant <ArrowRight className="size-3.5" aria-hidden/>
            </Button>
          </div>
        </footer>
      </section>

      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 dark:border-border dark:bg-muted dark:text-muted-foreground">
        <Fingerprint className="mt-0.5 size-4 shrink-0" aria-hidden/>
        <p>
          La traçabilité reflète les événements réellement écrits par l'application.
          L'absence d'une valeur « avant », d'une IP ou d'un motif est clairement signalée.
          Les données sensibles sont masquées et aucune position géographique n'est déduite d'une adresse IP.
        </p>
      </div>
      <PanneauDetails ligne={selection} onClose={()=>setSelection(null)}/>
    </div>
  );
}
