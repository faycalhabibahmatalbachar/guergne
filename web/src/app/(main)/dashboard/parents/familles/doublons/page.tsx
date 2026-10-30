import Link from "next/link";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  GitCompareArrows,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { listerGroupesNumerosPartages } from "@/server/domain/doublons-parents";
import { exigerPage } from "@/server/guard";

export const metadata: Metadata = { title: "Examen des doublons — Parents" };
export const dynamic = "force-dynamic";

export default async function DoublonsParents({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await exigerPage("tuteur:gerer");
  const params = await searchParams;
  const p = Number(params.page ?? 1);
  const page = Number.isSafeInteger(p) && p > 0 ? p : 1;
  const r = await listerGroupesNumerosPartages(page);
  const pages = Math.max(1, Math.ceil(r.total / r.parPage));

  return (
    <main className="mx-auto max-w-[1470px] space-y-5 pb-9 text-foreground dark:text-foreground">
      <Link
        href="/dashboard/parents/familles"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-succes hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Familles & fratries
      </Link>
      <header className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-alerte-doux text-alerte">
            <GitCompareArrows className="size-6" aria-hidden />
          </span>
          <div>
            <h1 className="tracking-tight">Vérification des doublons</h1>
            <p className="text-sm text-muted-foreground">
              Examinez les fiches partageant un numéro, sans altérer les accès familiaux
            </p>
          </div>
        </div>
        <span className="rounded-xl bg-alerte-doux px-3 py-2 text-sm font-semibold text-alerte">
          {r.total} groupe{r.total > 1 ? "s" : ""} à vérifier
        </span>
      </header>

      <section className="rounded-2xl border border-alerte-trait bg-alerte-doux px-4 py-3 text-sm leading-relaxed text-alerte">
        <ShieldCheck className="mr-2 inline size-4" aria-hidden />
        Un numéro partagé peut appartenir à plusieurs personnes : ce n'est <strong>pas une preuve de doublon</strong>.
        L'examen classe seulement la suspicion. Aucun compte, enfant, responsable financier ou droit de retrait n'est
        transféré automatiquement.
      </section>

      {r.groupes.length ? (
        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          {r.groupes.map((g) => (
            <article
              key={g.numero}
              className="min-w-0 overflow-hidden rounded-[20px] border border-border bg-card shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-4 dark:bg-muted/20">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Numéro en commun</p>
                  <p className="mt-1 text-base font-bold tabular-nums">{g.numero}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-alerte-doux px-3 py-1 text-xs font-semibold text-alerte">
                  <Users className="size-3.5" aria-hidden />
                  {g.dossiers} fiches
                </span>
              </div>
              <div className="divide-y divide-border px-4">
                {g.responsables.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {t.prenom} {t.nom}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t.nbEnfants} enfant{t.nbEnfants > 1 ? "s" : ""} rattaché{t.nbEnfants > 1 ? "s" : ""}
                      </p>
                    </div>
                    <Link
                      href={"/dashboard/parents/" + t.id}
                      className="shrink-0 text-xs font-semibold text-succes hover:underline"
                    >
                      Voir dossier <ArrowRight className="inline size-3" aria-hidden />
                    </Link>
                  </div>
                ))}
              </div>
              <div className="border-t border-border p-3 text-right">
                <Button asChild className="bg-succes font-semibold text-primary-foreground hover:bg-succes/90">
                  <Link href={"/dashboard/parents/familles/doublons/" + g.responsables[0].id}>
                    <GitCompareArrows className="size-4" aria-hidden />
                    Comparer les fiches
                  </Link>
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <AlertTriangle className="mx-auto mb-2 size-8 text-muted-foreground" aria-hidden />
          Aucun numéro partagé n'est actuellement détecté.
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-xs">
        <span>
          Page {page} / {pages} · {r.parPage} groupes par page
        </span>
        <nav aria-label="Pagination des numéros partagés" className="flex items-center gap-2">
          {page > 1 ? (
            <Button size="sm" variant="outline" asChild>
              <Link href={"?page=" + (page - 1)}>
                <ChevronLeft className="size-4" aria-hidden />
                Précédent
              </Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled>
              <ChevronLeft className="size-4" aria-hidden />
              Précédent
            </Button>
          )}
          {page < pages ? (
            <Button size="sm" variant="outline" asChild>
              <Link href={"?page=" + (page + 1)}>
                Suivant
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled>
              Suivant
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          )}
        </nav>
      </footer>
    </main>
  );
}
