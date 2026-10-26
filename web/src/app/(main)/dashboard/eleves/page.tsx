import type { Metadata } from "next";
import Link from "next/link";
import {
  ChevronDown, ClipboardList,
  Download, FileBadge2, GraduationCap, MoreHorizontal,
  Search, Upload, ClipboardCheck, Users,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EnTeteTriable } from "@/components/ui/entete-triable";
import { CaseSelection, EnTeteSelection, ZoneSelection } from "@/components/ui/selection-lot";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getInitials } from "@/lib/utils";
import { imageProfilEleve } from "@/lib/avatar-eleve";
import { LIBELLES_STATUT, LIENS_PARENTE, type StatutEleve } from "@/lib/eleves-constantes";
import { exigerPage, peut } from "@/server/guard";
import { sessionCourante } from "@/server/auth/session";
import { listerAnneesEleves, listerClassesCourantes, listerEleves, statistiquesEleves } from "@/server/domain/eleves";
import { BadgeStatut } from "./_components/badge-statut";
import { FiltresEleves, PaginationEleves } from "./_components/filtres";
import { ActionsLotEleves } from "./_components/actions-lot";
import { ModifierDossier } from "./[id]/_components/modifier-dossier";
import { InscriptionFenetre } from "./_components/inscription-fenetre";
import { chargerAnneeCourante } from "@/server/domain/tableau-de-bord";
import { listerClassesAnnee } from "@/server/domain/parametres";
import { ApercuEleve } from "./_components/apercu-eleve";
import { StatistiquesGentelellaEleves } from "./_components/statistiques-gentelella";
import { statusBadge } from "@/vendor/gentelella-v4/markup.js";
import "../default/gentelella-tokens.css";
import "../default/gentelella-layout.css";
import "../default/gentelella-components.css";
import "../default/gentelella-widgets.css";

export const metadata: Metadata = { title: "Élèves" };
export const dynamic = "force-dynamic";

type Parametres = {
  q?: string; classe?: string; niveau?: string; statut?: string; dossier?: string;
  annee?: string; rapide?: string; page?: string; parPage?: string; tri?: string; sens?: string;
  inscription?: string;
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
  const libelles: Record<string, { label: string; color: "green" | "blue" | "yellow" | "red" | "gray" }> = {
    VALIDE: { label: "Validé", color: "green" },
    INCOMPLET: { label: "Incomplet", color: "yellow" },
    A_VALIDER: { label: "À valider", color: "blue" },
    BROUILLON: { label: "Brouillon", color: "gray" },
    REFUSE: { label: "Refusé", color: "red" },
  };
  const donnees = statut ? libelles[statut] ?? { label: statut, color: "gray" as const } : { label: "Non renseigné", color: "gray" as const };
  return <span dangerouslySetInnerHTML={{ __html: statusBadge(donnees.label, donnees.color) }} />;
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

  const [resultat, stats, peutCreer, peutAffecter, peutEnvoyer, peutModifier, peutVoirParents, peutEmettreDocument, peutInscrire] = await Promise.all([
    listerEleves({
      recherche: p.q, classeId, niveauId, statut, dossier, rapide, anneeId,
      page: Math.max(1, Number(p.page) || 1), parPage, tri: p.tri, sens: p.sens,
    }),
    statistiquesEleves(anneeId),
    peut(principal, "eleve:creer"),
    peut(principal, "eleve:affecter"),
    peut(principal, "message:envoyer"),
    peut(principal, "eleve:modifier"),
    peut(principal, "tuteur:gerer"),
    peut(principal, "document:emettre"),
    peut(principal, "eleve:inscrire"),
  ]);
  const anneeInscription = peutInscrire ? await chargerAnneeCourante() : null;
  const classesInscription = peutInscrire && anneeInscription ? await listerClassesAnnee(anneeInscription.id) : [];
  const { lignes, total, page, nbPages } = resultat;
  const filtreActif = Boolean(p.q || classeId || niveauId || statut || dossier || rapide || anneeId);
  const exportParams = new URLSearchParams();
  if (p.q) exportParams.set("recherche", p.q);
  if (classeId) exportParams.set("classe", classeId);
  if (statut) exportParams.set("statut", statut);
  const lienExport = "/api/export/eleves?" + exportParams.toString();

  return (
    <main className="space-y-4 pb-6 text-slate-950 dark:text-foreground">
      <header aria-label="En-tête de la page Élèves" className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 xl:flex-row xl:items-end xl:justify-between dark:border-border">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="flex items-center gap-2.5 text-[29px] font-bold leading-tight tracking-tight sm:text-[34px]"><GraduationCap className="size-7 shrink-0 text-[#102448]" aria-hidden />Élèves</h1>
            <span className="inline-flex items-center rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-800 tabular-nums dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300" title="Nombre total de dossiers élèves">
              {stats.total.toLocaleString("fr-FR")} dossiers
            </span>
          </div>
          
        </div>

        <div role="group" aria-label="Actions sur les élèves" className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <div className="order-last flex items-center gap-2 sm:order-first">
            {peutModifier ? <Button asChild variant="outline" className="h-10 gap-2 rounded-lg border-slate-200 bg-white px-3.5 text-slate-700 shadow-none hover:bg-slate-50 dark:border-border dark:bg-card dark:text-foreground">
              <Link href="/dashboard/eleves/completer"><ClipboardCheck className="size-4" aria-hidden />Compléter les fiches</Link>
            </Button> : null}
            <Button asChild variant="outline" className="hidden h-10 gap-2 rounded-lg border-slate-200 bg-white px-3.5 text-slate-700 shadow-none hover:bg-slate-50 sm:inline-flex dark:bg-card dark:text-foreground" title="Export Excel — recherche, classe et statut">
              <a href={lienExport}><Download className="size-4" aria-hidden />Exporter Excel</a>
            </Button>
            {peutCreer ? (
              <Button asChild variant="outline" className="hidden h-10 gap-2 rounded-lg border-slate-200 bg-white px-3.5 text-slate-700 shadow-none hover:bg-slate-50 lg:inline-flex dark:bg-card dark:text-foreground">
                <Link href="/dashboard/eleves/importer"><Upload className="size-4" aria-hidden />Importer</Link>
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className={`h-10 gap-2 rounded-lg border-slate-200 bg-white px-3.5 text-slate-700 shadow-none hover:bg-slate-50 dark:bg-card dark:text-foreground ${peutCreer ? "lg:hidden" : "sm:hidden"}`} aria-label="Autres actions sur les élèves">
                  <MoreHorizontal className="size-4" aria-hidden />Actions<ChevronDown className="size-3.5 text-slate-400" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem asChild className="sm:hidden"><a href={lienExport}><Download className="size-4" aria-hidden />Exporter le fichier Excel</a></DropdownMenuItem>
                {peutCreer ? <DropdownMenuItem asChild className="lg:hidden"><Link href="/dashboard/eleves/importer"><Upload className="size-4" aria-hidden />Importer des élèves</Link></DropdownMenuItem> : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {peutInscrire ? <InscriptionFenetre
            annee={anneeInscription?.libelle ?? null}
            classes={classesInscription.map((cl) => ({
              id: cl.id, libelle: cl.libelle, niveauLibelle: cl.niveauLibelle,
              serieCode: cl.serieCode, effectif: cl.effectif, capaciteMax: cl.capaciteMax,
            }))}
            ouvrirInitialement={p.inscription === "1"}
            peutPhoto={peutModifier}
          /> : null}
        </div>
      </header>

      <StatistiquesGentelellaEleves statistiques={[
        { titre:"Élèves inscrits", valeur:stats.inscrits, detail:"Inscriptions actives", couleur:"teal", icone:"effectifs" },
        { titre:"Nouveaux cette semaine", valeur:stats.nouveaux, detail:"Nouvelles inscriptions", couleur:"blue", icone:"nouveaux" },
        { titre:"Dossiers incomplets", valeur:stats.incomplets, detail:"Statut administratif", couleur:"yellow", icone:"incomplets" },
        { titre:"Suspendus", valeur:stats.suspendus, detail:"Tous motifs", couleur:"red", icone:"suspendus" },
        { titre:"Réinscriptions", valeur:stats.reinscriptions, detail:"Année sélectionnée", couleur:"purple", icone:"reinscriptions" },
      ]} />

      <FiltresEleves
        classes={classes.map((c) => ({ id: c.id, libelle: c.libelle, niveauId: c.niveauId, niveauLibelle: c.niveauLibelle }))}
        annees={annees}
        valeurs={{ q: p.q ?? "", classe: classeId ?? "", niveau: niveauId ?? "", statut: statut ?? "", dossier: dossier ?? "", annee: anneeId ?? "", rapide: rapide ?? "" }}
        statistiques={stats}
      />

      <div id="liste-eleves" className="gentelella-v4 scroll-mt-6 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card">
        <ZoneSelection ids={lignes.map((e) => e.id)}>
          {peutAffecter || peutEnvoyer ? <div><ActionsLotEleves
            classes={classes.map((c) => ({ id: c.id, libelle: c.libelle, effectif: c.effectif, capaciteMax: c.capaciteMax }))}
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
            <div className="table-responsive overflow-x-auto">
              <table className="table w-full min-w-[1180px] border-collapse text-left text-[13px]">
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
                    <tr key={e.id} className="border-b border-slate-100 transition-colors last:border-b-0 hover:bg-blue-50/40 dark:border-border dark:hover:bg-muted/30">
                      {peutAffecter || peutEnvoyer ? <CaseSelection id={e.id} className="px-3 py-2" /> : null}
                      <td className="px-3 py-2"><Link href={`/dashboard/eleves/${e.id}`} className="flex items-center gap-2.5 font-semibold text-slate-950 hover:text-blue-700 dark:text-foreground">
                        <Avatar className="size-9 shrink-0"><AvatarImage src={imageProfilEleve({ id: e.id, sexe: e.sexe, photoUrl: e.photoUrl })} alt="" /><AvatarFallback className="bg-sky-50 text-xs">{getInitials(`${e.prenom} ${e.nom}`)}</AvatarFallback></Avatar>
                        <span className="min-w-0"><span className="block whitespace-nowrap">{e.nom} {e.prenom}</span>{e.estRedoublant ? <span className="mt-0.5 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-normal text-amber-700">Redoublant</span> : null}</span>
                      </Link></td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600 tabular-nums dark:text-muted-foreground">{e.matricule}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-medium">{e.classeLibelle ?? <span className="font-normal text-slate-400">Non affecté</span>}</td>
                      <td className="whitespace-nowrap px-3 py-2">{ageDepuis(e.dateNaissance)} ans</td>
                      <td className="px-3 py-2"><div className="max-w-[185px] truncate font-medium">
                        {e.parentId && peutVoirParents ? <Link href={"/dashboard/parents/" + e.parentId} title={"Ouvrir la fiche du tuteur " + (e.parentNom ?? "")} className="rounded-sm text-[#15264e] underline-offset-4 hover:text-emerald-700 hover:underline focus-visible:outline-2 focus-visible:outline-emerald-600 dark:text-foreground dark:hover:text-emerald-400">{e.parentNom ?? "Non renseigné"}</Link> : (e.parentNom ?? "Non renseigné")}
                      </div><div className="text-[11px] text-slate-500">{e.parentLien ? LIENS_PARENTE[e.parentLien as keyof typeof LIENS_PARENTE] ?? e.parentLien : "—"}</div></td>
                      <td className="whitespace-nowrap px-3 py-2">{e.parentTelephone ? <a href={`tel:${e.parentTelephone.replace(/[^+0-9]/g, "")}`} className="text-slate-700 hover:underline dark:text-foreground">{e.parentTelephone}</a> : <span className="text-slate-400">—</span>}</td>
                      <td className="px-3 py-2"><BadgeStatut statut={e.statut} className="whitespace-nowrap border-0 px-2.5 py-1 text-xs" /></td>
                      <td className="px-3 py-2"><BadgeDossier statut={e.statutDossier} /></td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <ApercuEleve eleve={e} peutNotifier={peutEnvoyer}
                            peutModifier={peutModifier && Boolean(principal && ["SUPER_ADMIN", "DIRECTION", "CENSEUR", "SURVEILLANT"].includes(principal.role))}
                            peutGererActions={peutAffecter && peutModifier && Boolean(principal && ["SUPER_ADMIN", "DIRECTION", "CENSEUR", "SURVEILLANT"].includes(principal.role))}
                            classes={classes.map(c => ({ id: c.id, libelle: c.libelle }))} />
                          {peutModifier && Boolean(principal && ["SUPER_ADMIN", "DIRECTION", "CENSEUR", "SURVEILLANT"].includes(principal.role)) ? <ModifierDossier eleveId={e.id} declencheur="icone" nomEleve={`${e.prenom} ${e.nom}`} /> : null}
                          {peutEmettreDocument ? <Button asChild variant="outline" size="icon" className="size-8 rounded-lg border-slate-200" title="Certificat de scolarité"><a href={`/api/documents/certificat-scolarite/${e.id}`} target="_blank" rel="noopener noreferrer" aria-label={`Certificat de scolarité de ${e.prenom} ${e.nom}`}><FileBadge2 className="size-4" aria-hidden /></a></Button> : null}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="size-8 rounded-lg border-slate-200" aria-label={`Plus d'actions pour ${e.prenom} ${e.nom}`}><MoreHorizontal className="size-4" aria-hidden /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem asChild><Link href={`/dashboard/eleves/${e.id}`}><ClipboardList className="size-4" aria-hidden /> Ouvrir le dossier complet</Link></DropdownMenuItem>
                              {e.parentId && peutVoirParents ? <DropdownMenuItem asChild><Link href={`/dashboard/parents/${e.parentId}`}><Users className="size-4" aria-hidden /> Ouvrir le parent</Link></DropdownMenuItem> : null}
                              {peutEmettreDocument ? <DropdownMenuItem asChild><a href={`/api/documents/certificat-scolarite/${e.id}`} target="_blank" rel="noopener noreferrer"><FileBadge2 className="size-4" aria-hidden /> Certificat de scolarité</a></DropdownMenuItem> : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
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
    </main>
  );
}
