import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle, CheckCheck, ChevronDown, ClipboardList,
  Download, Eye, FileText, GraduationCap, MoreHorizontal, Pencil, Plus,
  Search, Upload, UserPlus, Users, Wrench,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EnTeteTriable } from "@/components/ui/entete-triable";
import { CaseSelection, EnTeteSelection, ZoneSelection } from "@/components/ui/selection-lot";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getInitials } from "@/lib/utils";
import { LIBELLES_STATUT, LIENS_PARENTE, type StatutEleve } from "@/lib/eleves-constantes";
import { exigerPage, peut } from "@/server/guard";
import { sessionCourante } from "@/server/auth/session";
import { listerAnneesEleves, listerClassesCourantes, listerEleves, statistiquesEleves } from "@/server/domain/eleves";
import { BadgeStatut } from "./_components/badge-statut";
import { FiltresEleves, PaginationEleves } from "./_components/filtres";
import { ActionsLotEleves } from "./_components/actions-lot";

export const metadata: Metadata = { title: "Élèves" };
export const dynamic = "force-dynamic";

type Parametres = {
  q?: string; classe?: string; niveau?: string; statut?: string; dossier?: string;
  annee?: string; rapide?: string; page?: string; parPage?: string; tri?: string; sens?: string;
};
const DOSSIERS = ["BROUILLON", "A_VALIDER", "VALIDE", "INCOMPLET", "REFUSE"] as const;
const RAPIDES = ["inscrits", "suspendus", "incomplets", "redoublants"] as const;

function ageDepuis(iso: string) {
  const naissance = new Date(iso);
  const maintenant = new Date();
  let age = maintenant.getFullYear() - naissance.getFullYear();
  if (maintenant.getMonth() < naissance.getMonth() || (maintenant.getMonth() === naissance.getMonth() && maintenant.getDate() < naissance.getDate())) age--;
  return age;
}

function BadgeDossier({ statut }: { statut: string | null }) {
  if (!statut) return <span className="text-xs text-slate-400">Non renseigné</span>;
  const definitions: Record<string, { texte: string; classe: string; point: string }> = {
    VALIDE: { texte: "Validé", classe: "bg-emerald-50 text-emerald-700", point: "bg-emerald-500" },
    INCOMPLET: { texte: "Incomplet", classe: "bg-amber-50 text-amber-700", point: "bg-amber-500" },
    A_VALIDER: { texte: "À valider", classe: "bg-blue-50 text-blue-700", point: "bg-blue-500" },
    BROUILLON: { texte: "Brouillon", classe: "bg-slate-100 text-slate-600", point: "bg-slate-500" },
    REFUSE: { texte: "Refusé", classe: "bg-red-50 text-red-700", point: "bg-red-500" },
  };
  const definition = definitions[statut] ?? { texte: statut, classe: "bg-slate-100 text-slate-700", point: "bg-slate-500" };
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${definition.classe}`}><span aria-hidden className={`size-2 rounded-full ${definition.point}`} />{definition.texte}</span>;
}

function CarteStatistique({ titre, valeur, icone: Icone, couleur, fond, detail }: {
  titre: string; valeur: number; icone: typeof Users; couleur: string; fond: string; detail: string;
}) {
  return (
    <article className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3.5 py-4 shadow-sm dark:border-border dark:bg-card">
      <div className={`flex size-14 shrink-0 items-center justify-center rounded-xl ${fond}`}><Icone aria-hidden className={`size-7 ${couleur}`} strokeWidth={1.8} /></div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-slate-600 dark:text-muted-foreground">{titre}</p>
        <div className="mt-1 flex items-end justify-between gap-2"><span className="text-[27px] font-bold leading-none tracking-tight text-slate-950 tabular-nums dark:text-foreground">{valeur.toLocaleString("fr-FR")}</span></div>
        <p className="mt-1.5 text-[11px] text-slate-400">{detail}</p>
      </div>
    </article>
  );
}

export default async function PageEleves({ searchParams }: { searchParams: Promise<Parametres> }) {
  await exigerPage("eleve:lire");
  const principal = await sessionCourante();
  const p = await searchParams;
  const annees = await listerAnneesEleves();
  const anneeId = annees.find((a) => a.id === p.annee)?.id;
  const dossier = DOSSIERS.find((v) => v === p.dossier);
  const rapide = RAPIDES.find((v) => v === p.rapide);
  const statut = p.statut && Object.prototype.hasOwnProperty.call(LIBELLES_STATUT, p.statut) ? p.statut as StatutEleve : undefined;
  const parPage = [8, 16, 25, 50, 100].includes(Number(p.parPage)) ? Number(p.parPage) : 8;
  const classes = await listerClassesCourantes(anneeId);
  const niveauId = classes.some((c) => c.niveauId === p.niveau) ? p.niveau : undefined;
  const classeId = classes.some((c) => c.id === p.classe) ? p.classe : undefined;

  const [resultat, stats, peutCreer, peutAffecter, peutEnvoyer, peutModifier] = await Promise.all([
    listerEleves({
      recherche: p.q, classeId, niveauId, statut, dossier, rapide, anneeId,
      page: Math.max(1, Number(p.page) || 1), parPage, tri: p.tri, sens: p.sens,
    }),
    statistiquesEleves(anneeId),
    peut(principal, "eleve:creer"),
    peut(principal, "eleve:affecter"),
    peut(principal, "message:envoyer"),
    peut(principal, "eleve:modifier"),
  ]);
  const { lignes, total, page, nbPages } = resultat;
  const filtreActif = Boolean(p.q || classeId || niveauId || statut || dossier || rapide || anneeId);
  const exportParams = new URLSearchParams();
  if (p.q) exportParams.set("recherche", p.q);
  if (classeId) exportParams.set("classe", classeId);
  if (statut) exportParams.set("statut", statut);
  const lienExport = "/api/export/eleves?" + exportParams.toString();

  return (
    <div className="space-y-4 pb-6 text-slate-950 dark:text-foreground">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3"><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Élèves</h1><span className="rounded-lg bg-sky-100 px-3 py-1 text-base font-bold text-sky-950 tabular-nums">{stats.total.toLocaleString("fr-FR")}</span></div>
          <p className="mt-1 text-sm text-slate-500 sm:text-base dark:text-muted-foreground">Gestion complète des dossiers scolaires</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {peutAffecter || peutEnvoyer ? <Button asChild variant="outline" className="h-11 gap-2 bg-white dark:bg-card"><a href="#liste-eleves"><CheckCheck className="size-4" aria-hidden /> Actions groupées <ChevronDown className="size-4" aria-hidden /></a></Button> : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" className="h-11 gap-2 bg-white dark:bg-card"><Wrench className="size-4" aria-hidden /> Outils <ChevronDown className="size-4" aria-hidden /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild><a href={lienExport}><Download className="size-4" aria-hidden /> Exporter le fichier (filtres principaux)</a></DropdownMenuItem>
              {peutCreer ? <><DropdownMenuSeparator /><DropdownMenuItem asChild><Link href="/dashboard/eleves/importer"><Upload className="size-4" aria-hidden /> Importer un fichier</Link></DropdownMenuItem></> : null}
            </DropdownMenuContent>
          </DropdownMenu>
          {peutCreer ? <Button asChild className="h-11 bg-emerald-600 px-5 text-white shadow-sm hover:bg-emerald-700"><Link href="/dashboard/eleves/nouveau"><Plus className="size-5" aria-hidden /> Inscrire un élève</Link></Button> : null}
        </div>
      </header>

      <section aria-label="Indicateurs des élèves" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <CarteStatistique titre="Élèves inscrits" valeur={stats.inscrits} icone={Users} couleur="text-emerald-600" fond="bg-emerald-50" detail="Statut scolaire : inscrit" />
        <CarteStatistique titre="Nouveaux cette semaine" valeur={stats.nouveaux} icone={UserPlus} couleur="text-blue-600" fond="bg-blue-50" detail="Nouvelles inscriptions" />
        <CarteStatistique titre="Dossiers incomplets" valeur={stats.incomplets} icone={FileText} couleur="text-amber-600" fond="bg-amber-50" detail="État administratif" />
        <CarteStatistique titre="Suspendus" valeur={stats.suspendus} icone={AlertTriangle} couleur="text-red-600" fond="bg-red-50" detail="Tous motifs confondus" />
        <CarteStatistique titre="Réinscriptions" valeur={stats.reinscriptions} icone={GraduationCap} couleur="text-violet-600" fond="bg-violet-50" detail="Année scolaire sélectionnée" />
      </section>

      <FiltresEleves
        classes={classes.map((c) => ({ id: c.id, libelle: c.libelle, niveauId: c.niveauId, niveauLibelle: c.niveauLibelle }))}
        annees={annees}
        valeurs={{ q: p.q ?? "", classe: classeId ?? "", niveau: niveauId ?? "", statut: statut ?? "", dossier: dossier ?? "", annee: anneeId ?? "", rapide: rapide ?? "" }}
        statistiques={stats}
      />

      <div id="liste-eleves" className="scroll-mt-6 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card">
        <ZoneSelection ids={lignes.map((e) => e.id)}>
          {peutAffecter || peutEnvoyer ? <div><ActionsLotEleves
            classes={classes.map((c) => ({ id: c.id, libelle: c.libelle }))}
            peutAffecter={peutAffecter} peutEnvoyer={peutEnvoyer}
            selectionDonnees={lignes.map((e) => ({ id: e.id, nom: e.nom, prenom: e.prenom, matricule: e.matricule, classeLibelle: e.classeLibelle, statut: e.statut, statutDossier: e.statutDossier }))}
          /></div> : null}
          {lignes.length === 0 ? (
            <Card className="m-3 border-0 shadow-none"><CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              {filtreActif ? <Search className="size-8 text-slate-400" aria-hidden /> : <GraduationCap className="size-8 text-slate-400" aria-hidden />}
              <p className="font-semibold">{filtreActif ? "Aucun élève ne correspond aux filtres." : "Aucun élève enregistré."}</p>
              {filtreActif ? <Button asChild variant="outline" size="sm"><Link href="/dashboard/eleves">Effacer les filtres</Link></Button> : peutCreer ? <Button asChild size="sm"><Link href="/dashboard/eleves/nouveau">Inscrire le premier élève</Link></Button> : null}
            </CardContent></Card>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1250px] border-collapse text-left text-[13px]">
                <thead className="bg-slate-50/90 text-xs text-slate-500 dark:bg-muted/30 dark:text-muted-foreground"><tr className="border-b border-slate-200 dark:border-border">
                  {peutAffecter || peutEnvoyer ? <EnTeteSelection className="px-3 py-3" /> : null}
                  <EnTeteTriable colonne="nom" className="px-3 py-3">Élève</EnTeteTriable>
                  <EnTeteTriable colonne="matricule" className="px-3 py-3">Matricule</EnTeteTriable>
                  <EnTeteTriable colonne="classe" className="px-3 py-3">Classe</EnTeteTriable>
                  <EnTeteTriable colonne="naissance" className="px-3 py-3">Âge</EnTeteTriable>
                  <th className="px-3 py-3 font-medium">Parent / Tuteur</th>
                  <th className="px-3 py-3 font-medium">Téléphone</th>
                  <EnTeteTriable colonne="statut" className="px-3 py-3">Statut</EnTeteTriable>
                  <th className="px-3 py-3 font-medium">État du dossier</th>
                  <th className="px-3 py-3 font-medium">Actions</th>
                </tr></thead>
                <tbody>
                  {lignes.map((e) => (
                    <tr key={e.id} className="border-b border-slate-100 transition-colors last:border-b-0 hover:bg-emerald-50/40 dark:border-border dark:hover:bg-muted/30">
                      {peutAffecter || peutEnvoyer ? <CaseSelection id={e.id} className="px-3 py-2" /> : null}
                      <td className="px-3 py-2"><Link href={`/dashboard/eleves/${e.id}`} className="flex items-center gap-2.5 font-semibold text-slate-950 hover:text-emerald-700 dark:text-foreground">
                        <Avatar className="size-9 shrink-0"><AvatarImage src={e.photoUrl ?? undefined} alt="" /><AvatarFallback className="bg-sky-50 text-xs">{getInitials(`${e.prenom} ${e.nom}`)}</AvatarFallback></Avatar>
                        <span className="min-w-0"><span className="block whitespace-nowrap">{e.nom} {e.prenom}</span>{e.estRedoublant ? <span className="mt-0.5 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-normal text-amber-700">Redoublant</span> : null}</span>
                      </Link></td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600 tabular-nums dark:text-muted-foreground">{e.matricule}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-medium">{e.classeLibelle ?? <span className="font-normal text-slate-400">Non affecté</span>}</td>
                      <td className="whitespace-nowrap px-3 py-2">{ageDepuis(e.dateNaissance)} ans</td>
                      <td className="px-3 py-2"><div className="max-w-[165px] truncate font-medium">{e.parentNom ?? "Non renseigné"}</div><div className="text-[11px] text-slate-500">{e.parentLien ? LIENS_PARENTE[e.parentLien as keyof typeof LIENS_PARENTE] ?? e.parentLien : "—"}</div></td>
                      <td className="whitespace-nowrap px-3 py-2">{e.parentTelephone ? <a href={`tel:${e.parentTelephone.replace(/[^+0-9]/g, "")}`} className="text-slate-700 hover:underline dark:text-foreground">{e.parentTelephone}</a> : <span className="text-slate-400">—</span>}</td>
                      <td className="px-3 py-2"><BadgeStatut statut={e.statut} className="whitespace-nowrap border-0 px-2.5 py-1 text-xs" /></td>
                      <td className="px-3 py-2"><BadgeDossier statut={e.statutDossier} /></td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <Button asChild variant="outline" size="icon" className="size-8" title="Consulter le dossier"><Link href={`/dashboard/eleves/${e.id}`} aria-label={`Consulter le dossier de ${e.prenom} ${e.nom}`}><Eye className="size-4" aria-hidden /></Link></Button>
                          {peutModifier ? <Button asChild variant="outline" size="icon" className="size-8" title="Modifier le dossier"><Link href={`/dashboard/eleves/${e.id}`} aria-label={`Modifier le dossier de ${e.prenom} ${e.nom}`}><Pencil className="size-4" aria-hidden /></Link></Button> : null}
                          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="size-8" aria-label={`Plus d'actions pour ${e.prenom} ${e.nom}`}><MoreHorizontal className="size-4" aria-hidden /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link href={`/dashboard/eleves/${e.id}`}><ClipboardList className="size-4" aria-hidden /> Ouvrir le dossier</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ZoneSelection>
        <PaginationEleves page={Math.min(page, nbPages)} nbPages={nbPages} total={total} parPage={resultat.parPage} />
      </div>
    </div>
  );
}
