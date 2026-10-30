import Link from "next/link";
import { notFound } from "next/navigation";

import { sql } from "drizzle-orm";
import {
  ArrowLeft,
  ArrowRight,
  BellRing,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Eye,
  FileText,
  GraduationCap,
  Info,
  Pencil,
  Printer,
  School,
  Search,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import { z } from "zod";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { imageProfilEleve } from "@/lib/avatar-eleve";
import { libelleStatut } from "@/lib/eleves-constantes";
import { getInitials } from "@/lib/utils";
import { db } from "@/server/db";
import { listerAnnees, listerClassesAnnee } from "@/server/domain/parametres";
import { exigerPage, peut } from "@/server/guard";

import { BoutonNotifier } from "../../_components/bouton-notifier";
import { rechercherElevesClasses } from "../eleves-actions";
import { urlImpressionClasses } from "../impression-url";
import { SelecteurClasse } from "./selecteur-classe";

export const metadata: Metadata = { title: "Détails de la classe" };
export const dynamic = "force-dynamic";

type StatutDossier = "VALIDE" | "A_VALIDER" | "INCOMPLET" | "BROUILLON" | "REFUSE";
const STATUTS: { id: StatutDossier; label: string; couleur: string }[] = [
  { id: "VALIDE", label: "Validés", couleur: "bg-succes" },
  { id: "A_VALIDER", label: "À valider", couleur: "bg-primary" },
  { id: "INCOMPLET", label: "Incomplets", couleur: "bg-alerte" },
  { id: "BROUILLON", label: "Brouillons", couleur: "bg-muted" },
  { id: "REFUSE", label: "Refusés", couleur: "bg-danger" },
];

const lien =
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:border-info-trait hover:bg-info-doux/90 hover:text-info focus-visible:outline-2 focus-visible:outline-blue-600";
const carte = "rounded-xl border border-border bg-card shadow-sm";

function BadgeDossier({ valeur }: { valeur: string }) {
  const d: Record<string, { nom: string; classe: string }> = {
    VALIDE: { nom: "Validé", classe: "bg-succes-doux text-succes" },
    A_VALIDER: { nom: "À valider", classe: "bg-info-doux text-info" },
    INCOMPLET: { nom: "Incomplet", classe: "bg-alerte-doux text-alerte" },
    BROUILLON: { nom: "Brouillon", classe: "bg-muted text-muted-foreground" },
    REFUSE: { nom: "Refusé", classe: "bg-danger-doux text-danger" },
  };
  const s = d[valeur] ?? { nom: valeur.replaceAll("_", " "), classe: "bg-muted text-muted-foreground" };
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${s.classe}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-75" />
      {s.nom}
    </span>
  );
}

function StatCard({
  titre,
  valeur,
  sousTitre,
  icon: Icon,
  teinte,
}: {
  titre: string;
  valeur: string | number;
  sousTitre: string;
  icon: typeof Users;
  teinte: string;
}) {
  return (
    <div className={`${carte} flex min-w-0 items-center gap-3 p-3.5 sm:p-4`}>
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${teinte}`}>
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted-foreground">{titre}</p>
        <p className="mt-0.5 text-2xl font-bold leading-none tabular-nums tracking-tight">{valeur}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{sousTitre}</p>
      </div>
    </div>
  );
}

/** Données administratives réellement disponibles, sans créer de fausses statistiques. */
export default async function DetailClasse({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ annee?: string; q?: string; page?: string; dossier?: string }>;
}) {
  const { id } = await params;
  const p = await searchParams;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const principal = await exigerPage("classe:lire");
  const annees = await listerAnnees();
  const annee = annees.find((a) => a.id === p.annee) ?? (p.annee ? null : annees.find((a) => a.estCourante));
  if (!annee) notFound();

  const classes = await listerClassesAnnee(annee.id);
  const classe = classes.find((c) => c.id === id);
  if (!classe) notFound();

  const [peutVoirEleves, peutNotifier, peutModifier, peutInscrire] = await Promise.all([
    peut(principal, "eleve:lire", { classeId: id }),
    peut(principal, "message:envoyer", { classeId: id }),
    peut(principal, "classe:modifier", { classeId: id }),
    peut(principal, "eleve:inscrire", { classeId: id }),
  ]);
  const recherche = (p.q ?? "").trim().slice(0, 80);
  const dossier = STATUTS.find((s) => s.id === p.dossier)?.id;
  const page = Math.max(1, Math.min(10000, Math.trunc(Number(p.page) || 1)));

  const [annuaire, resume] = peutVoirEleves
    ? await Promise.all([
        rechercherElevesClasses({ anneeId: annee.id, classesIds: [id], recherche, dossier, page }),
        db.execute<{
          filles: number;
          garcons: number;
          valides: number;
          a_valider: number;
          incomplets: number;
          brouillons: number;
          refuses: number;
        }>(sql`
      SELECT count(*) FILTER (WHERE e.sexe = 'F')::int AS filles,
        count(*) FILTER (WHERE e.sexe = 'M')::int AS garcons,
        count(*) FILTER (WHERE i.statut_dossier::text = 'VALIDE')::int AS valides,
        count(*) FILTER (WHERE i.statut_dossier::text = 'A_VALIDER')::int AS a_valider,
        count(*) FILTER (WHERE i.statut_dossier::text = 'INCOMPLET')::int AS incomplets,
        count(*) FILTER (WHERE i.statut_dossier::text = 'BROUILLON')::int AS brouillons,
        count(*) FILTER (WHERE i.statut_dossier::text = 'REFUSE')::int AS refuses
      FROM inscriptions i
      JOIN eleves e ON e.id = i.eleve_id
      WHERE i.classe_id = ${id}::uuid AND i.annee_id = ${annee.id}::uuid AND i.active
    `),
      ])
    : [null, null];

  const effectif = Number(classe.effectif);
  const capacite = Number(classe.capaciteMax);
  const restant = Math.max(0, capacite - effectif);
  const taux = capacite ? Math.round((effectif / capacite) * 100) : 0;
  const femmes = Number(resume?.rows[0]?.filles ?? 0);
  const hommes = Number(resume?.rows[0]?.garcons ?? 0);
  const nonRenseignes = Math.max(0, effectif - femmes - hommes);
  const valides = Number(resume?.rows[0]?.valides ?? 0);
  const aValider = Number(resume?.rows[0]?.a_valider ?? 0);
  const incomplets = Number(resume?.rows[0]?.incomplets ?? 0);
  const brouillons = Number(resume?.rows[0]?.brouillons ?? 0);
  const refuses = Number(resume?.rows[0]?.refuses ?? 0);
  const decompte: Record<StatutDossier, number> = {
    VALIDE: valides,
    A_VALIDER: aValider,
    INCOMPLET: incomplets,
    BROUILLON: brouillons,
    REFUSE: refuses,
  };
  const pages = Math.max(1, Math.ceil((annuaire?.total ?? 0) / 25));
  const indexClasse = classes.findIndex((c) => c.id === id);
  const anneeCouranteModifiable = annee.estCourante && !annee.estCloturee;

  function hrefFiltres(modifs: { dossier?: string | null; recherche?: string; page?: number } = {}) {
    const q = new URLSearchParams({ annee: annee!.id });
    const valeurRecherche = modifs.recherche ?? recherche;
    const valeurDossier = modifs.dossier === undefined ? dossier : modifs.dossier;
    if (valeurRecherche) q.set("q", valeurRecherche);
    if (valeurDossier) q.set("dossier", valeurDossier);
    if (modifs.page && modifs.page > 1) q.set("page", String(modifs.page));
    return `/dashboard/classes/${id}?${q.toString()}`;
  }

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-4 pb-8 text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <GraduationCap className="size-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="tracking-tight">Classe {classe.libelle}</h1>
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${classe.active ? "bg-succes-doux text-succes" : "bg-muted text-muted-foreground"}`}
              >
                {classe.active ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              {classe.niveauLibelle}
              {classe.serieCode ? " · Série " + classe.serieCode : ""} · Année scolaire {annee.libelle} · Code{" "}
              {classe.code}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SelecteurClasse
            anneeId={annee.id}
            active={id}
            classes={classes.map((c) => ({ id: c.id, libelle: c.libelle }))}
          />
          {peutVoirEleves && (
            <a className={lien} href={urlImpressionClasses(annee.id, [id])} target="_blank" rel="noopener noreferrer">
              <Printer className="size-4" aria-hidden /> Imprimer
            </a>
          )}
          {peutModifier && anneeCouranteModifiable && (
            <Link className={lien} href={`/dashboard/classes?annee=${annee.id}&modifier=${id}`}>
              <Pencil className="size-4" aria-hidden /> Modifier
            </Link>
          )}
          {peutNotifier &&
            (classe.active && effectif > 0 ? (
              <BoutonNotifier
                contexteClasses
                cible={{ type: "classe", id, nom: classe.libelle }}
                libelle="Prévenir les parents"
              />
            ) : (
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 text-xs font-semibold text-muted-foreground"
              >
                <BellRing className="size-4" aria-hidden /> Aucun parent à prévenir
              </button>
            ))}
        </div>
      </header>

      <section aria-label="Indicateurs de la classe" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          titre="Élèves inscrits"
          valeur={effectif}
          sousTitre="Effectif de la classe"
          icon={Users}
          teinte="bg-info-doux text-info"
        />
        <StatCard
          titre="Places disponibles"
          valeur={restant}
          sousTitre={`Sur ${capacite} places`}
          icon={School}
          teinte="bg-succes-doux text-succes"
        />
        <StatCard
          titre="Remplissage"
          valeur={taux + " %"}
          sousTitre={taux >= 100 ? "Capacité atteinte" : "Taux d'occupation"}
          icon={GraduationCap}
          teinte="bg-info-doux text-info"
        />
        {peutVoirEleves ? (
          <StatCard
            titre="Dossiers à traiter"
            valeur={aValider + incomplets + brouillons}
            sousTitre="À valider, incomplets ou brouillons"
            icon={ClipboardCheck}
            teinte="bg-alerte-doux text-alerte"
          />
        ) : (
          <StatCard
            titre="Année scolaire"
            valeur={annee.libelle}
            sousTitre="Période sélectionnée"
            icon={CalendarDays}
            teinte="bg-muted text-muted-foreground"
          />
        )}
      </section>

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(310px,.8fr)]">
        <section id="eleves" className={`${carte} min-w-0 overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-base font-bold">
                <Users className="size-4 text-info" aria-hidden /> Élèves de la classe
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Liste des inscriptions actives · Recherche et suivi des dossiers
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-info-doux px-3 py-1.5 text-xs font-semibold text-info">
                {annuaire ? annuaire.total : effectif} résultat(s)
              </span>
              {peutVoirEleves && (
                <Link className={lien} href={`/dashboard/eleves?annee=${annee.id}&classe=${id}`}>
                  <ArrowRight className="size-3.5" aria-hidden /> Gestion des élèves
                </Link>
              )}
            </div>
          </div>

          {!peutVoirEleves ? (
            <div className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
              <ShieldCheck className="size-5 shrink-0" aria-hidden /> Votre compte ne dispose pas des droits de
              consultation des dossiers individuels.
            </div>
          ) : (
            <>
              <div className="space-y-3 border-b border-border px-4 py-3">
                <form method="get" className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="annee" value={annee.id} />
                  {dossier && <input type="hidden" name="dossier" value={dossier} />}
                  <div className="relative min-w-[170px] flex-1">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <input
                      type="search"
                      name="q"
                      defaultValue={recherche}
                      placeholder="Rechercher un élève, un matricule…"
                      aria-label="Rechercher les élèves de la classe"
                      className="h-10 w-full rounded-lg border border-border bg-muted/40 pl-9 pr-3 text-sm outline-none focus:border-info-trait focus:ring-2 focus:ring-ring dark:bg-muted/20"
                    />
                  </div>
                  <button
                    type="submit"
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    <Search className="size-3.5" aria-hidden /> Rechercher
                  </button>
                  {(recherche || dossier) && (
                    <Link href={hrefFiltres({ dossier: null, recherche: "" })} className={lien}>
                      Réinitialiser
                    </Link>
                  )}
                </form>
                <div className="flex flex-wrap items-center gap-2" aria-label="Filtrer les dossiers">
                  <Link
                    href={hrefFiltres({ dossier: null })}
                    aria-current={!dossier ? "page" : undefined}
                    className={`inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold ${!dossier ? "bg-primary text-primary-foreground" : "bg-muted/40 text-foreground hover:bg-muted/90 dark:bg-muted/30"}`}
                  >
                    Tous ({effectif})
                  </Link>
                  {STATUTS.map((item) => (
                    <Link
                      key={item.id}
                      href={hrefFiltres({ dossier: item.id })}
                      aria-current={dossier === item.id ? "page" : undefined}
                      className={`inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-semibold ${dossier === item.id ? "bg-primary text-primary-foreground" : "bg-muted/40 text-foreground hover:bg-muted/90 dark:bg-muted/30"}`}
                    >
                      <span className={`size-2 rounded-full ${item.couleur}`} aria-hidden />
                      {item.label} ({decompte[item.id]})
                    </Link>
                  ))}
                </div>
              </div>

              <div className="w-full overflow-x-auto">
                <table className="w-full min-w-[700px] border-collapse text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground dark:bg-muted/30">
                    <tr>
                      <th scope="col" className="px-4 py-3">
                        Élève
                      </th>
                      <th scope="col" className="px-3 py-3">
                        Matricule
                      </th>
                      <th scope="col" className="px-3 py-3">
                        Sexe
                      </th>
                      <th scope="col" className="px-3 py-3">
                        Dossier
                      </th>
                      <th scope="col" className="px-3 py-3">
                        Statut scolaire
                      </th>
                      <th scope="col" className="px-4 py-3 text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {annuaire?.lignes.map((e) => (
                      <tr key={e.id} className="transition-colors hover:bg-info-doux/90 dark:hover:bg-muted/20">
                        <th scope="row" className="px-4 py-2.5 text-left font-semibold">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <Avatar className="size-9 border border-border">
                              <AvatarImage
                                src={imageProfilEleve({ id: e.id, sexe: e.sexe, photoUrl: e.photoUrl })}
                                alt=""
                              />
                              <AvatarFallback>{getInitials(`${e.prenom} ${e.nom}`)}</AvatarFallback>
                            </Avatar>
                            <span className="min-w-0 truncate">
                              {e.prenom} {e.nom}
                            </span>
                          </div>
                        </th>
                        <td className="px-3 py-2.5 font-medium tabular-nums text-muted-foreground">{e.matricule}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {e.sexe === "F" ? "Fille" : e.sexe === "M" ? "Garçon" : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <BadgeDossier valeur={e.dossier} />
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{libelleStatut(e.statut)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <Link
                            href={`/dashboard/eleves/${e.id}`}
                            title={"Ouvrir le dossier de " + e.prenom + " " + e.nom}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold text-foreground hover:border-info-trait hover:bg-info-doux/90 hover:text-info"
                          >
                            <Eye className="size-3.5" aria-hidden /> Voir
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {annuaire?.lignes.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center">
                          <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                            <Users className="size-8 text-muted-foreground" aria-hidden />
                            <strong className="text-sm">Aucun élève trouvé</strong>
                            <p className="text-xs text-muted-foreground">
                              Essayez un autre filtre ou une recherche différente.
                            </p>
                            {(recherche || dossier) && (
                              <Link
                                href={hrefFiltres({ dossier: null, recherche: "" })}
                                className="mt-1 text-xs font-semibold text-info hover:underline"
                              >
                                Afficher tous les élèves
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  {annuaire?.total
                    ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, annuaire.total)} sur ${annuaire.total}`
                    : "0 résultat"}{" "}
                  · Page {page} sur {pages}
                </p>
                <div className="flex items-center gap-2">
                  {page > 1 ? (
                    <Link className={lien} href={hrefFiltres({ page: page - 1 })}>
                      <ChevronLeft className="size-4" aria-hidden /> Précédent
                    </Link>
                  ) : (
                    <span className="inline-flex h-9 cursor-not-allowed items-center gap-1 rounded-lg border border-border px-3 text-xs text-muted-foreground">
                      Précédent
                    </span>
                  )}
                  {page < pages ? (
                    <Link className={lien} href={hrefFiltres({ page: page + 1 })}>
                      Suivant <ChevronRight className="size-4" aria-hidden />
                    </Link>
                  ) : (
                    <span className="inline-flex h-9 cursor-not-allowed items-center gap-1 rounded-lg border border-border px-3 text-xs text-muted-foreground">
                      Suivant
                    </span>
                  )}
                </div>
              </footer>
            </>
          )}
        </section>

        <aside id="informations" className="min-w-0 space-y-4">
          <section className={`${carte} overflow-hidden`}>
            <div className="flex items-center gap-2 border-b border-border px-4 py-3.5">
              <Info className="size-4 text-info" aria-hidden />
              <h2 className="text-sm font-bold">Fiche de la classe</h2>
            </div>
            <dl className="space-y-0 px-4">
              {[
                ["Année scolaire", annee.libelle],
                ["Niveau", classe.niveauLibelle],
                ["Série", classe.serieCode || "Non applicable"],
                ["Code", classe.code],
                ["État", classe.active ? "Active" : "Inactive"],
                ["Capacité maximale", String(capacite) + " élèves"],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border py-3 text-xs last:border-b-0"
                >
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-semibold text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className={`${carte} p-4`}>
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <GraduationCap className="size-4 text-info" aria-hidden /> Occupation de la classe
            </h2>
            <div className="mt-4 flex items-baseline justify-between gap-2">
              <span className="text-2xl font-bold tabular-nums">
                {effectif} <span className="text-sm font-medium text-muted-foreground">/ {capacite}</span>
              </span>
              <span
                className={`text-xs font-bold ${taux >= 100 ? "text-danger" : taux >= 90 ? "text-alerte" : "text-succes"}`}
              >
                {taux}%
              </span>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, taux)}
              aria-label="Taux de remplissage"
            >
              <div
                className={`h-full rounded-full ${taux >= 100 ? "bg-danger" : taux >= 90 ? "bg-alerte" : "bg-primary"}`}
                style={{ width: Math.min(100, taux) + "%" }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {restant ? `${restant} place(s) encore disponibles` : "Aucune place disponible"}
            </p>
          </section>

          {peutVoirEleves && (
            <section className={`${carte} p-4`}>
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <Users className="size-4 text-info" aria-hidden /> Répartition des élèves
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-info-doux p-3">
                  <span className="text-xs font-medium text-info">Filles</span>
                  <p className="mt-1 text-xl font-bold tabular-nums">{femmes}</p>
                </div>
                <div className="rounded-lg bg-info-doux p-3">
                  <span className="text-xs font-medium text-info">Garçons</span>
                  <p className="mt-1 text-xl font-bold tabular-nums">{hommes}</p>
                </div>
              </div>
              {nonRenseignes > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {nonRenseignes} inscription(s) sans sexe renseigné.
                </p>
              )}
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div className="flex h-full">
                  {effectif > 0 && (
                    <>
                      <span className="bg-primary" style={{ width: (100 * femmes) / effectif + "%" }} />
                      <span className="bg-primary" style={{ width: (100 * hommes) / effectif + "%" }} />
                    </>
                  )}
                </div>
              </div>
              <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <ClipboardCheck className="size-3.5 text-succes" aria-hidden /> {valides} dossier(s) validé(s) sur{" "}
                {effectif} inscrits
              </p>
              {refuses > 0 && <p className="mt-1 text-xs text-danger">{refuses} dossier(s) refusé(s)</p>}
            </section>
          )}

          <section className={`${carte} p-4`}>
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <BookOpen className="size-4 text-info" aria-hidden /> Accès rapides
            </h2>
            <div className="mt-3 grid gap-2">
              {peutVoirEleves && (
                <a
                  href={urlImpressionClasses(annee.id, [id])}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-10 items-center justify-between rounded-lg border border-border px-3 text-xs font-semibold hover:bg-info-doux/90"
                >
                  <span className="flex items-center gap-2">
                    <Printer className="size-4 text-info" aria-hidden /> Liste officielle des élèves
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                </a>
              )}
              {peutVoirEleves && (
                <Link
                  href={`/dashboard/eleves?annee=${annee.id}&classe=${id}`}
                  className="flex min-h-10 items-center justify-between rounded-lg border border-border px-3 text-xs font-semibold hover:bg-info-doux/90"
                >
                  <span className="flex items-center gap-2">
                    <FileText className="size-4 text-info" aria-hidden /> Gestion des dossiers élèves
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              )}
              {peutInscrire && anneeCouranteModifiable && (
                <Link
                  href={`/dashboard/eleves?inscription=1`}
                  className="flex min-h-10 items-center justify-between rounded-lg border border-border px-3 text-xs font-semibold hover:bg-info-doux/90"
                >
                  <span className="flex items-center gap-2">
                    <UserRoundCheck className="size-4 text-info" aria-hidden /> Inscrire un élève
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              )}
              <Link
                href={`/dashboard/classes?annee=${annee.id}`}
                className="flex min-h-10 items-center justify-between rounded-lg border border-border px-3 text-xs font-semibold hover:bg-info-doux/90"
              >
                <span className="flex items-center gap-2">
                  <ArrowLeft className="size-4 text-info" aria-hidden /> Toutes les classes
                </span>
                <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
