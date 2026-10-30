import Link from "next/link";

import {
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Download,
  FileBadge2,
  GraduationCap,
  MoreHorizontal,
  Search,
  Upload,
  Users,
} from "lucide-react";
import type { Metadata } from "next";

import { EnTetePage } from "@/components/socle/en-tete-page";
import { RangeeStatistiques, Statistique } from "@/components/socle/statistique";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EnTeteTriable } from "@/components/ui/entete-triable";
import { CaseSelection, EnTeteSelection, ZoneSelection } from "@/components/ui/selection-lot";
import { imageProfilEleve } from "@/lib/avatar-eleve";
import { LIBELLES_STATUT, LIENS_PARENTE, type StatutEleve } from "@/lib/eleves-constantes";
import { getInitials } from "@/lib/utils";
import { sessionCourante } from "@/server/auth/session";
import { listerAnneesEleves, listerClassesCourantes, listerEleves, statistiquesEleves } from "@/server/domain/eleves";
import { listerClassesAnnee } from "@/server/domain/parametres";
import { chargerAnneeCourante } from "@/server/domain/tableau-de-bord";
import { exigerPage, peut } from "@/server/guard";
import { statusBadge } from "@/vendor/gentelella-v4/markup.js";

import { ActionsLotEleves } from "./_components/actions-lot";
import { ApercuEleve } from "./_components/apercu-eleve";
import { BadgeStatut } from "./_components/badge-statut";
import { FiltresEleves, PaginationEleves } from "./_components/filtres";
import { InscriptionFenetre } from "./_components/inscription-fenetre";
import { ModifierDossier } from "./[id]/_components/modifier-dossier";
import "../default/gentelella-tokens.css";
import "../default/gentelella-layout.css";
import "../default/gentelella-components.css";
import "../default/gentelella-widgets.css";

export const metadata: Metadata = { title: "Élèves" };
export const dynamic = "force-dynamic";

type Parametres = {
  q?: string;
  classe?: string;
  niveau?: string;
  statut?: string;
  dossier?: string;
  annee?: string;
  rapide?: string;
  page?: string;
  parPage?: string;
  tri?: string;
  sens?: string;
  inscription?: string;
};
const DOSSIERS = ["BROUILLON", "A_VALIDER", "VALIDE", "INCOMPLET", "REFUSE"] as const;
const RAPIDES = ["inscrits", "suspendus", "incomplets", "redoublants"] as const;

function ageDepuis(iso: string) {
  const naissance = new Date(iso);
  const maintenant = new Date();
  let age = maintenant.getFullYear() - naissance.getFullYear();
  if (
    maintenant.getMonth() < naissance.getMonth() ||
    (maintenant.getMonth() === naissance.getMonth() && maintenant.getDate() < naissance.getDate())
  )
    age--;
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
  const donnees = statut
    ? (libelles[statut] ?? { label: statut, color: "gray" as const })
    : { label: "Non renseigné", color: "gray" as const };
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
  const statut = p.statut && Object.hasOwn(LIBELLES_STATUT, p.statut) ? (p.statut as StatutEleve) : undefined;
  const parPage = [8, 16, 25, 50, 100].includes(Number(p.parPage)) ? Number(p.parPage) : 8;
  const classes = await listerClassesCourantes(anneeId);
  const niveauId = classes.some((c) => c.niveauId === p.niveau) ? p.niveau : undefined;
  const classeId = classes.some((c) => c.id === p.classe) ? p.classe : undefined;

  const [
    resultat,
    stats,
    peutCreer,
    peutAffecter,
    peutEnvoyer,
    peutModifier,
    peutVoirParents,
    peutEmettreDocument,
    peutInscrire,
  ] = await Promise.all([
    listerEleves({
      recherche: p.q,
      classeId,
      niveauId,
      statut,
      dossier,
      rapide,
      anneeId,
      page: Math.max(1, Number(p.page) || 1),
      parPage,
      tri: p.tri,
      sens: p.sens,
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
    <main className="space-y-6 pb-6 text-foreground">
      {/*
        En-tête commun. L'icône de 28 px et la pastille verte « N dossiers »
        ont disparu : le vert signifie « inscrit » dans la colonne Statut juste
        en dessous, et le décompte se lit mieux dans la description.
      */}
      <EnTetePage
        titre="Élèves"
        description={<>{stats.total.toLocaleString("fr-FR")} dossiers au fichier</>}
        actions={
          <>
            <div className="order-last flex items-center gap-2 sm:order-first">
              {peutModifier ? (
                <Button asChild variant="outline">
                  <Link href="/dashboard/eleves/completer">
                    <ClipboardCheck className="size-4" aria-hidden />
                    Compléter les fiches
                  </Link>
                </Button>
              ) : null}
              <Button
                asChild
                variant="outline"
                className="hidden sm:inline-flex"
                title="Export Excel — recherche, classe et statut"
              >
                <a href={lienExport}>
                  <Download className="size-4" aria-hidden />
                  Exporter Excel
                </a>
              </Button>
              {peutCreer ? (
                <Button asChild variant="outline" className="hidden lg:inline-flex">
                  <Link href="/dashboard/eleves/importer">
                    <Upload className="size-4" aria-hidden />
                    Importer
                  </Link>
                </Button>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className={`h-10 gap-2 rounded-lg border-border bg-card px-3.5 text-foreground shadow-none hover:bg-muted/40 ${peutCreer ? "lg:hidden" : "sm:hidden"}`}
                    aria-label="Autres actions sur les élèves"
                  >
                    <MoreHorizontal className="size-4" aria-hidden />
                    Actions
                    <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem asChild className="sm:hidden">
                    <a href={lienExport}>
                      <Download className="size-4" aria-hidden />
                      Exporter le fichier Excel
                    </a>
                  </DropdownMenuItem>
                  {peutCreer ? (
                    <DropdownMenuItem asChild className="lg:hidden">
                      <Link href="/dashboard/eleves/importer">
                        <Upload className="size-4" aria-hidden />
                        Importer des élèves
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {peutInscrire ? (
              <InscriptionFenetre
                annee={anneeInscription?.libelle ?? null}
                classes={classesInscription.map((cl) => ({
                  id: cl.id,
                  libelle: cl.libelle,
                  niveauLibelle: cl.niveauLibelle,
                  serieCode: cl.serieCode,
                  effectif: cl.effectif,
                  capaciteMax: cl.capaciteMax,
                }))}
                ouvrirInitialement={p.inscription === "1"}
                peutPhoto={peutModifier}
              />
            ) : null}
          </>
        }
      />

      <RangeeStatistiques colonnes={5}>
        <Statistique libelle="Élèves inscrits" valeur={stats.inscrits} aide="Inscriptions actives" icone={Users} />
        <Statistique
          libelle="Nouveaux cette semaine"
          valeur={stats.nouveaux}
          aide="Nouvelles inscriptions"
          icone={GraduationCap}
        />
        <Statistique
          libelle="Dossiers incomplets"
          valeur={stats.incomplets}
          aide="Pièces manquantes"
          ton={stats.incomplets > 0 ? "alerte" : "neutre"}
          icone={ClipboardList}
          href="/dashboard/eleves?dossier=incomplet"
        />
        <Statistique
          libelle="Suspendus"
          valeur={stats.suspendus}
          aide="Tous motifs"
          ton={stats.suspendus > 0 ? "danger" : "neutre"}
          icone={FileBadge2}
        />
        <Statistique
          libelle="Réinscriptions"
          valeur={stats.reinscriptions}
          aide="Année sélectionnée"
          icone={ClipboardCheck}
        />
      </RangeeStatistiques>

      <FiltresEleves
        classes={classes.map((c) => ({
          id: c.id,
          libelle: c.libelle,
          niveauId: c.niveauId,
          niveauLibelle: c.niveauLibelle,
        }))}
        annees={annees}
        valeurs={{
          q: p.q ?? "",
          classe: classeId ?? "",
          niveau: niveauId ?? "",
          statut: statut ?? "",
          dossier: dossier ?? "",
          annee: anneeId ?? "",
          rapide: rapide ?? "",
        }}
        statistiques={stats}
      />

      <div
        id="liste-eleves"
        className="gentelella-v4 scroll-mt-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm"
      >
        <ZoneSelection ids={lignes.map((e) => e.id)}>
          {peutAffecter || peutEnvoyer ? (
            <div>
              <ActionsLotEleves
                classes={classes.map((c) => ({
                  id: c.id,
                  libelle: c.libelle,
                  effectif: c.effectif,
                  capaciteMax: c.capaciteMax,
                }))}
                peutAffecter={peutAffecter}
                peutEnvoyer={peutEnvoyer}
                selectionDonnees={lignes.map((e) => ({
                  id: e.id,
                  nom: e.nom,
                  prenom: e.prenom,
                  matricule: e.matricule,
                  classeLibelle: e.classeLibelle,
                  statut: e.statut,
                  statutDossier: e.statutDossier,
                }))}
              />
            </div>
          ) : null}
          {lignes.length === 0 ? (
            <Card className="m-3 border-0 shadow-none">
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                {filtreActif ? (
                  <Search className="size-8 text-muted-foreground" aria-hidden />
                ) : (
                  <GraduationCap className="size-8 text-muted-foreground" aria-hidden />
                )}
                <p className="font-semibold">
                  {filtreActif ? "Aucun élève ne correspond aux filtres." : "Aucun élève enregistré."}
                </p>
                {filtreActif ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard/eleves">Effacer les filtres</Link>
                  </Button>
                ) : peutCreer ? (
                  <Button asChild size="sm">
                    <Link href="/dashboard/eleves/nouveau">Inscrire le premier élève</Link>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <div className="table-responsive overflow-x-auto">
              <table className="table w-full min-w-[1180px] border-collapse text-left text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground dark:bg-muted/30">
                  <tr className="border-b border-border">
                    {peutAffecter || peutEnvoyer ? <EnTeteSelection className="px-3 py-3" /> : null}
                    <EnTeteTriable colonne="nom" className="px-3 py-3">
                      Élève
                    </EnTeteTriable>
                    <EnTeteTriable colonne="matricule" className="px-3 py-3">
                      Matricule
                    </EnTeteTriable>
                    <EnTeteTriable colonne="classe" className="px-3 py-3">
                      Classe
                    </EnTeteTriable>
                    <EnTeteTriable colonne="naissance" className="px-3 py-3">
                      Âge
                    </EnTeteTriable>
                    <th className="px-3 py-3 font-medium">Parent / Tuteur</th>
                    <th className="px-3 py-3 font-medium">Téléphone</th>
                    <EnTeteTriable colonne="statut" className="px-3 py-3">
                      Statut
                    </EnTeteTriable>
                    <th className="px-3 py-3 font-medium">État du dossier</th>
                    <th className="px-3 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((e) => (
                    <tr
                      key={e.id}
                      className="border-b border-border transition-colors last:border-b-0 hover:bg-info-doux/90 dark:hover:bg-muted/30"
                    >
                      {peutAffecter || peutEnvoyer ? <CaseSelection id={e.id} className="px-3 py-2" /> : null}
                      <td className="px-3 py-2">
                        <Link
                          href={`/dashboard/eleves/${e.id}`}
                          className="flex items-center gap-2.5 font-semibold text-foreground hover:text-info"
                        >
                          <Avatar className="size-9 shrink-0">
                            <AvatarImage
                              src={imageProfilEleve({ id: e.id, sexe: e.sexe, photoUrl: e.photoUrl })}
                              alt=""
                            />
                            <AvatarFallback className="bg-info-doux text-xs">
                              {getInitials(`${e.prenom} ${e.nom}`)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="min-w-0">
                            <span className="block whitespace-nowrap">
                              {e.nom} {e.prenom}
                            </span>
                            {e.estRedoublant ? (
                              <span className="mt-0.5 inline-flex rounded-full bg-alerte-doux px-2 py-0.5 text-xs font-normal text-alerte">
                                Redoublant
                              </span>
                            ) : null}
                          </span>
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground tabular-nums">{e.matricule}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-medium">
                        {e.classeLibelle ?? <span className="font-normal text-muted-foreground">Non affecté</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{ageDepuis(e.dateNaissance)} ans</td>
                      <td className="px-3 py-2">
                        <div className="max-w-[185px] truncate font-medium">
                          {e.parentId && peutVoirParents ? (
                            <Link
                              href={"/dashboard/parents/" + e.parentId}
                              title={"Ouvrir la fiche du tuteur " + (e.parentNom ?? "")}
                              className="rounded-sm text-foreground underline-offset-4 hover:text-succes hover:underline focus-visible:outline-2 focus-visible:outline-emerald-600 dark:hover:text-succes"
                            >
                              {e.parentNom ?? "Non renseigné"}
                            </Link>
                          ) : (
                            (e.parentNom ?? "Non renseigné")
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {e.parentLien
                            ? (LIENS_PARENTE[e.parentLien as keyof typeof LIENS_PARENTE] ?? e.parentLien)
                            : "—"}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {e.parentTelephone ? (
                          <a
                            href={`tel:${e.parentTelephone.replace(/[^+0-9]/g, "")}`}
                            className="text-foreground hover:underline"
                          >
                            {e.parentTelephone}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <BadgeStatut statut={e.statut} className="whitespace-nowrap border-0 px-2.5 py-1 text-xs" />
                      </td>
                      <td className="px-3 py-2">
                        <BadgeDossier statut={e.statutDossier} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <ApercuEleve
                            eleve={e}
                            peutNotifier={peutEnvoyer}
                            peutModifier={
                              peutModifier &&
                              Boolean(
                                principal &&
                                  ["SUPER_ADMIN", "DIRECTION", "CENSEUR", "SURVEILLANT"].includes(principal.role),
                              )
                            }
                            peutGererActions={
                              peutAffecter &&
                              peutModifier &&
                              Boolean(
                                principal &&
                                  ["SUPER_ADMIN", "DIRECTION", "CENSEUR", "SURVEILLANT"].includes(principal.role),
                              )
                            }
                            classes={classes.map((c) => ({ id: c.id, libelle: c.libelle }))}
                          />
                          {peutModifier &&
                          principal &&
                          ["SUPER_ADMIN", "DIRECTION", "CENSEUR", "SURVEILLANT"].includes(principal.role) ? (
                            <ModifierDossier eleveId={e.id} declencheur="icone" nomEleve={`${e.prenom} ${e.nom}`} />
                          ) : null}
                          {peutEmettreDocument ? (
                            <Button
                              asChild
                              variant="outline"
                              size="icon"
                              className="size-8"
                              title="Certificat de scolarité"
                            >
                              <a
                                href={`/api/documents/certificat-scolarite/${e.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Certificat de scolarité de ${e.prenom} ${e.nom}`}
                              >
                                <FileBadge2 className="size-4" aria-hidden />
                              </a>
                            </Button>
                          ) : null}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                className="size-8"
                                aria-label={`Plus d'actions pour ${e.prenom} ${e.nom}`}
                              >
                                <MoreHorizontal className="size-4" aria-hidden />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem asChild>
                                <Link href={`/dashboard/eleves/${e.id}`}>
                                  <ClipboardList className="size-4" aria-hidden /> Ouvrir le dossier complet
                                </Link>
                              </DropdownMenuItem>
                              {e.parentId && peutVoirParents ? (
                                <DropdownMenuItem asChild>
                                  <Link href={`/dashboard/parents/${e.parentId}`}>
                                    <Users className="size-4" aria-hidden /> Ouvrir le parent
                                  </Link>
                                </DropdownMenuItem>
                              ) : null}
                              {peutEmettreDocument ? (
                                <DropdownMenuItem asChild>
                                  <a
                                    href={`/api/documents/certificat-scolarite/${e.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <FileBadge2 className="size-4" aria-hidden /> Certificat de scolarité
                                  </a>
                                </DropdownMenuItem>
                              ) : null}
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
