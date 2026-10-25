"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity, ArrowRight, CalendarCheck2, ClipboardList, CreditCard, Eye,
  FileText, GraduationCap, History, Mail, MapPin, Pencil,
  Phone, Printer, ShieldAlert, UserRound, Users, Wallet,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { imageProfilEleve } from "@/lib/avatar-eleve";
import { getInitials } from "@/lib/utils";
import type { LigneEleve } from "@/server/domain/eleves";
import { LIENS_PARENTE } from "@/lib/eleves-constantes";
import { BoutonNotifier } from "../../_components/bouton-notifier";
import { ActionsDossier } from "../[id]/_components/actions-dossier";
import { ModifierDossier } from "../[id]/_components/modifier-dossier";
import { chargerApercuEleve, type ApercuDossier } from "./apercu-eleve-actions";

const formatDate = (valeur: string | null | undefined) =>
  valeur ? new Date(valeur).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const nombre = (v: number) => v.toLocaleString("fr-FR");
const CASE = "min-w-0 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-border dark:bg-card";

function Champ({ titre, valeur }: { titre: string; valeur: React.ReactNode }) {
  return <div className="min-w-0"><p className="text-[11px] font-medium text-slate-500 dark:text-muted-foreground">{titre}</p>
    <div className="mt-1 break-words text-sm font-semibold text-slate-800 dark:text-foreground">{valeur || "—"}</div></div>;
}
function Bloc({ title, icon: Icon, children, href }: { title: string; icon: typeof Users; children: React.ReactNode; href?: string }) {
  return <section className={CASE}>
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-foreground"><Icon className="size-4 text-blue-600" aria-hidden />{title}</h3>
      {href && <Link href={href} className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline" title={`Voir ${title.toLowerCase()} dans le dossier`}>Voir <ArrowRight className="size-3" aria-hidden /></Link>}
    </div>{children}
  </section>;
}

export function ApercuEleve({
  eleve, peutNotifier, peutModifier, peutGererActions, classes,
}: {
  eleve: LigneEleve;
  peutNotifier: boolean;
  peutModifier: boolean;
  peutGererActions: boolean;
  classes: Array<{ id: string; libelle: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ApercuDossier | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const dossierUrl = `/dashboard/eleves/${eleve.id}`;
  const sexe = eleve.sexe === "F" ? "Fille" : "Garçon";
  const nom = `${eleve.prenom} ${eleve.nom}`;

  useEffect(() => {
    if (!open) return;
    let active = true;
    chargerApercuEleve(eleve.id)
      .then((result) => { if (active) { setData(result); setError(!result); } })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, eleve.id]);

  return <Sheet open={open} onOpenChange={(next) => {
    setOpen(next);
    if (next) { setLoading(true); setData(null); setError(false); }
  }}>
    <SheetTrigger asChild>
      <Button type="button" size="icon" variant="outline" title="Aperçu rapide de l’élève"
        aria-label={`Afficher l'aperçu de ${nom}`} className="size-8 rounded-lg border-slate-200 text-slate-700 shadow-none hover:border-blue-300 hover:text-blue-700 dark:border-border">
        <Eye className="size-4" aria-hidden />
      </Button>
    </SheetTrigger>
    <SheetContent side="right" className="flex h-dvh w-full max-w-full flex-col gap-0 overflow-hidden border-l border-slate-200 p-0 sm:max-w-[760px] xl:max-w-[920px] dark:border-border">
      <SheetHeader className="shrink-0 border-b border-slate-200 px-5 py-4 dark:border-border">
        <SheetTitle className="text-base font-bold">Aperçu du dossier élève</SheetTitle>
        <SheetDescription>Consultez les informations essentielles sans quitter la liste.</SheetDescription>
      </SheetHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50/40 p-4 sm:p-5 dark:bg-muted/10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar className="size-20 shrink-0 rounded-2xl border border-slate-200">
            <AvatarImage src={imageProfilEleve({ id: eleve.id, sexe: eleve.sexe, photoUrl: eleve.photoUrl })} alt="" />
            <AvatarFallback>{getInitials(nom)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-xl font-bold">{nom}</h3>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">{eleve.statut.replaceAll("_", " ")}</span>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-muted-foreground">{eleve.classeLibelle ?? "Classe non affectée"} · {sexe}</p>
            <p className="mt-1 text-xs text-slate-500">Matricule : <strong className="tabular-nums">{eleve.matricule}</strong></p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button asChild className="h-10 gap-2 bg-blue-600 font-semibold text-white hover:bg-blue-700">
            <Link href={dossierUrl}><ClipboardList className="size-4" aria-hidden />Ouvrir le dossier</Link>
          </Button>
          {peutModifier && <ModifierDossier eleveId={eleve.id} nomEleve={nom} />}
          {peutNotifier && <BoutonNotifier cible={{ type: "eleve", id: eleve.id, nom }} contexteEleves libelle="Prévenir les parents" />}
          {peutGererActions && data && <ActionsDossier eleveId={eleve.id} statut={data.statut} inscriptionId={data.inscriptionId}
            classeActuelleId={data.classeId} statutDossier={data.statutDossier} classes={classes} />}
        </div>

        {loading && <div className="space-y-3" role="status" aria-live="polite"><div className="h-20 animate-pulse rounded-xl bg-slate-200/70" /><div className="h-32 animate-pulse rounded-xl bg-slate-200/70" /><p className="text-xs text-slate-500">Chargement de l’aperçu…</p></div>}
        {error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Aperçu indisponible. Vous pouvez ouvrir le dossier complet pour consulter les informations autorisées.</div>}
        {data && !loading && <Tabs defaultValue="apercu" className="gap-3">
          <TabsList variant="line" className="flex h-10 w-full justify-start gap-3 overflow-x-auto border-b border-slate-200 bg-transparent p-0">
            <TabsTrigger value="apercu" className="text-xs font-semibold data-active:text-blue-700">Aperçu</TabsTrigger>
            <TabsTrigger value="scolarite" className="text-xs font-semibold data-active:text-blue-700">Scolarité</TabsTrigger>
            {data.finances && <TabsTrigger value="finances" className="text-xs font-semibold data-active:text-blue-700">Paiements</TabsTrigger>}
            <TabsTrigger value="activite" className="text-xs font-semibold data-active:text-blue-700">Activité</TabsTrigger>
          </TabsList>
          <TabsContent value="apercu" className="mt-0 space-y-3">
            <Bloc title="Informations principales" icon={UserRound} href={dossierUrl}>
              <div className="grid grid-cols-2 gap-3">
                <Champ titre="Date de naissance" valeur={formatDate(data.naissance)} />
                <Champ titre="Sexe" valeur={data.sexe === "F" ? "Féminin" : "Masculin"} />
                <Champ titre="Téléphone" valeur={data.telephone ? <a className="text-blue-700 hover:underline" href={"tel:" + data.telephone}>{data.telephone}</a> : "—"} />
                <Champ titre="Adresse" valeur={data.adresse ?? "—"} />
                {data.email && <div className="col-span-2"><Champ titre="Email" valeur={<a className="break-all text-blue-700 hover:underline" href={"mailto:" + data.email}>{data.email}</a>} /></div>}
              </div>
            </Bloc>
            {data.parents.length > 0 && <Bloc title="Parent / Responsable" icon={Users} href={dossierUrl}>
              <div className="space-y-2">{data.parents.slice(0,2).map((p) => <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2.5 dark:bg-muted/30">
                <div><p className="text-sm font-semibold">{p.prenom} {p.nom} {p.principal ? "· Principal" : ""}</p><p className="text-xs text-slate-500">{LIENS_PARENTE[p.lien as keyof typeof LIENS_PARENTE] ?? p.lien}</p></div>
                {p.telephone && <a className="text-xs font-semibold text-blue-700 hover:underline" href={"tel:" + p.telephone}>{p.telephone}</a>}
              </div>)}</div>
            </Bloc>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Bloc title="Scolarité" icon={GraduationCap} href={dossierUrl}>
                <Champ titre="Classe · année" valeur={`${data.classe ?? "Sans classe"} · ${data.annee ?? "—"}`} />
                <div className="mt-2"><Champ titre="État du dossier" valeur={data.statutDossier?.replaceAll("_"," ") ?? "Non renseigné"} /></div>
                {data.scolarite?.moyenne !== null && data.scolarite?.moyenne !== undefined && <p className="mt-2 text-xs">Moyenne ({data.scolarite.periode}) : <strong>{data.scolarite.moyenne.toFixed(2)}/20</strong></p>}
              </Bloc>
              {data.finances && <Bloc title="Paiements" icon={Wallet} href={dossierUrl}>
                <Champ titre="Reste à payer" valeur={`${nombre(data.finances.reste)} FCFA`} />
                <div className="mt-2"><Champ titre="Dernier paiement" valeur={formatDate(data.finances.dernierPaiement)} /></div>
              </Bloc>}
              {data.assiduite && <Bloc title="Assiduité" icon={CalendarCheck2} href={dossierUrl}>
                <Champ titre="Absences · retards" valeur={`${data.assiduite.absences} · ${data.assiduite.retards}`} />
                <p className="mt-2 text-xs text-slate-500">{data.assiduite.nonJustifiees} non justifiés</p>
              </Bloc>}
              {data.discipline && <Bloc title="Discipline" icon={ShieldAlert} href={dossierUrl}>
                <Champ titre="Incidents · sanctions" valeur={`${data.discipline.incidents} · ${data.discipline.sanctions}`} />
              </Bloc>}
            </div>
          </TabsContent>
          <TabsContent value="scolarite" className="mt-0 space-y-3">
            <Bloc title="Parcours scolaire" icon={GraduationCap} href={dossierUrl}>
              <div className="grid grid-cols-2 gap-3"><Champ titre="Classe actuelle" valeur={data.classe} /><Champ titre="Année scolaire" valeur={data.annee} /><Champ titre="Type d'inscription" valeur={data.typeInscription?.replaceAll("_"," ")} /><Champ titre="Redoublant" valeur={data.estRedoublant ? "Oui" : "Non"} /></div>
            </Bloc>
            {data.scolarite && <Bloc title="Résultat académique" icon={FileText} href={dossierUrl}><Champ titre={data.scolarite.periode ?? "Dernière période renseignée"} valeur={data.scolarite.moyenne === null ? "Moyenne non publiée" : `${data.scolarite.moyenne.toFixed(2)}/20`} /></Bloc>}
            {data.assiduite && <Bloc title="Assiduité" icon={CalendarCheck2} href={dossierUrl}><p className="text-sm">{data.assiduite.absences} absences · {data.assiduite.retards} retards · {data.assiduite.nonJustifiees} non justifiés</p></Bloc>}
          </TabsContent>
          {data.finances && <TabsContent value="finances" className="mt-0"><Bloc title="Résumé financier" icon={CreditCard} href={dossierUrl}><div className="grid grid-cols-2 gap-3"><Champ titre="Reste à payer" valeur={`${nombre(data.finances.reste)} FCFA`} /><Champ titre="Paiements enregistrés" valeur={data.finances.paiements} /><Champ titre="Dernier règlement" valeur={formatDate(data.finances.dernierPaiement)} /></div></Bloc></TabsContent>}
          <TabsContent value="activite" className="mt-0"><Bloc title="Historique récent" icon={History} href={dossierUrl}>{data.activite.length ? <ol className="space-y-3">{data.activite.map((h,i) => <li key={i} className="flex gap-3 border-l-2 border-blue-100 pl-3 text-xs"><Activity className="mt-0.5 size-4 shrink-0 text-blue-600" aria-hidden /><span><span className="block font-semibold">{h.texte}</span><span className="mt-1 block text-slate-500">{formatDate(h.date)}</span></span></li>)}</ol> : <p className="text-xs text-slate-500">Aucun événement récent enregistré.</p>}</Bloc></TabsContent>
        </Tabs>}
      </div>
      <footer className="shrink-0 border-t border-slate-200 bg-white px-5 py-3 dark:border-border dark:bg-card">
        <Button asChild variant="outline" className="w-full gap-2 border-slate-200 text-blue-700"><Link href={dossierUrl}><ClipboardList className="size-4" aria-hidden />Accéder au dossier détaillé <ArrowRight className="size-4" aria-hidden /></Link></Button>
      </footer>
    </SheetContent>
  </Sheet>;
}
