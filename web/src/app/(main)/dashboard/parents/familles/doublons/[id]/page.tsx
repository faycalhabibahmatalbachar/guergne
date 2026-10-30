import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  GitCompareArrows,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import { z } from "zod";

import { comparerNumerosPartages, type ProfilDoublon, type StatutExamen } from "@/server/domain/doublons-parents";
import { exigerPage, peut } from "@/server/guard";

import { ExamenDoublon } from "./_components/examen-doublon";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Comparer les dossiers parents — Vérification" };

function Profil({ profil, accent }: { profil: ProfilDoublon; accent: "emerald" | "blue" }) {
  const colors = accent === "emerald" ? "bg-succes-doux text-succes" : "bg-info-doux text-info";
  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/40 px-4 py-3 dark:bg-muted/15">
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${colors}`}>
          {(profil.prenom[0] ?? "") + (profil.nom[0] ?? "")}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-base font-bold">
            {profil.prenom} {profil.nom}
          </h3>
          <p className="text-xs text-muted-foreground">
            {profil.utilisateurId
              ? profil.compteActif
                ? "Compte actif ou invité"
                : "Compte désactivé"
              : "Sans compte d'application"}
          </p>
        </div>
        <Link href={"/dashboard/parents/" + profil.id} className="text-xs font-semibold text-succes hover:underline">
          Ouvrir <ArrowRight className="inline size-3" aria-hidden />
        </Link>
      </div>
      <dl className="grid gap-3 p-4 text-xs sm:grid-cols-2">
        {[
          ["Téléphone", profil.telephone],
          ["E-mail", profil.email],
          ["Profession", profil.profession],
          ["Adresse", profil.adresse],
        ].map(([titre, valeur]) => (
          <div key={titre}>
            <dt className="text-muted-foreground">{titre}</dt>
            <dd className="mt-1 break-words font-semibold">{valeur || "Non renseigné"}</dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-border px-4 py-3">
        <h4 className="mb-2 text-xs font-bold">
          {profil.enfants.length} élève{profil.enfants.length > 1 ? "s" : ""} rattaché
          {profil.enfants.length > 1 ? "s" : ""}
        </h4>
        <div className="space-y-2">
          {profil.enfants.map((e) => (
            <div
              key={e.eleveId}
              className="flex min-w-0 flex-wrap items-center justify-between gap-1 rounded-lg bg-muted/40 px-3 py-2 text-xs dark:bg-muted/20"
            >
              <Link href={"/dashboard/eleves/" + e.eleveId} className="font-semibold hover:text-info hover:underline">
                {e.prenom} {e.nom}
              </Link>
              <span className="text-muted-foreground">
                {e.matricule} · {e.lien}
                {e.principal ? " · Principal" : ""}
              </span>
            </div>
          ))}
          {!profil.enfants.length ? <p className="text-xs text-muted-foreground">Aucun enfant rattaché.</p> : null}
        </div>
      </div>
    </article>
  );
}

function Decision({ statut }: { statut?: StatutExamen }) {
  if (!statut) return <p className="text-xs font-medium text-alerte">Aucun examen consigné pour cette paire.</p>;
  const distinct = statut.decision === "DISTINCTS";
  return (
    <div
      className={`rounded-xl border px-3 py-3 text-xs ${distinct ? "border-succes-trait bg-succes-doux text-succes" : "border-alerte-trait bg-alerte-doux text-alerte"}`}
    >
      <p className="font-bold">
        {distinct ? "Examen : personnes distinctes" : "Examen : même personne potentielle — rapprochement non effectué"}
      </p>
      <p className="mt-1">{statut.motif}</p>
      <p className="mt-1 opacity-80">
        Consigné le {new Date(statut.examineLe).toLocaleDateString("fr-FR")} · {statut.examinePar}
      </p>
    </div>
  );
}

export default async function Comparaison({ params }: { params: Promise<{ id: string }> }) {
  const principal = await exigerPage("tuteur:gerer");
  const autoriseAExaminer = await peut(principal, "audit:lire");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const resultat = await comparerNumerosPartages(id);
  if (!resultat) notFound();
  const principalProfil = resultat.profils.find((p) => p.id === id);
  if (!principalProfil) notFound();
  const autres = resultat.profils.filter((p) => p.id !== id);
  const paire = (a: string, b: string) => [a, b].sort().join(":");
  return (
    <main className="mx-auto max-w-[1510px] space-y-5 pb-8 text-foreground dark:text-foreground">
      <nav className="flex flex-wrap items-center gap-3 text-xs">
        <Link
          className="inline-flex items-center gap-1.5 font-semibold text-succes hover:underline"
          href="/dashboard/parents/familles/doublons"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Liste des doublons
        </Link>
        <span className="text-muted-foreground">/</span>
        <Link className="font-medium text-muted-foreground hover:underline" href="/dashboard/parents/familles">
          Familles & fratries
        </Link>
      </nav>
      <header className="flex items-start gap-3 border-b border-border pb-5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-alerte-doux text-alerte">
          <GitCompareArrows className="size-6" aria-hidden />
        </span>
        <div>
          <h1 className="tracking-tight">Comparer les responsables</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {resultat.profils.length} fiches utilisent un numéro commun. Comparez identité, comptes et enfants avant de
            consigner un avis.
          </p>
        </div>
      </header>
      <section className="flex items-start gap-3 rounded-xl border border-alerte-trait bg-alerte-doux p-4 text-sm leading-relaxed text-alerte">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
        <p>
          <strong>Attention aux données scolaires :</strong> une similitude de téléphone ou de nom ne suffit jamais pour
          conclure que ces personnes sont identiques. Même après examen, les dossiers et leurs droits restent séparés.
          Le rapprochement technique avec transferts d'enfants et d'accès n'est pas disponible ici.
        </p>
      </section>

      <section className="space-y-4">
        {autres.map((autre) => {
          const statut = resultat.examens[paire(id, autre.id)];
          const nom = autre.prenom + " " + autre.nom;
          return (
            <article
              key={autre.id}
              className="space-y-3 rounded-[22px] border border-border bg-muted/40 p-3 shadow-sm dark:bg-muted/10 sm:p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  <Users className="size-4 text-succes" aria-hidden />
                  Comparaison avec {nom}
                </h2>
                {statut ? (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${statut.decision === "DISTINCTS" ? "bg-succes-doux text-succes" : "bg-alerte-doux text-alerte"}`}
                  >
                    {statut.decision === "DISTINCTS" ? "Distincts examinés" : "À rapprocher"}
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                    Non examiné
                  </span>
                )}
              </div>
              <div className="grid items-stretch gap-3 lg:grid-cols-2">
                <Profil profil={principalProfil} accent="emerald" />
                <Profil profil={autre} accent="blue" />
              </div>
              <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
                <Decision statut={statut} />
                {autoriseAExaminer ? (
                  <ExamenDoublon tuteurId={id} autreTuteurId={autre.id} nom={nom} />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Validation réservée au personnel disposant du droit d'audit.
                  </p>
                )}
              </footer>
            </article>
          );
        })}
      </section>
      {resultat.profils.length === 25 ? (
        <p className="rounded-xl bg-alerte-doux px-4 py-3 text-xs text-alerte">
          <AlertTriangle className="mr-2 inline size-4" aria-hidden />
          Le groupe contient potentiellement plus de 25 fiches. Vérifiez les autres dossiers depuis la liste avant de
          conclure.
        </p>
      ) : null}
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-4" aria-hidden />
        Chaque examen est consigné dans le journal d'audit append-only, sans fusion ni suppression.
      </p>
    </main>
  );
}
