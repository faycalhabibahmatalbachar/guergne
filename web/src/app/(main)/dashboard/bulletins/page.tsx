import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, BookOpenCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

import { sql } from "drizzle-orm";

import { db } from "@/server/db";
import { chargerStatistiques } from "@/server/domain/tableau-de-bord";
import { blocagesBulletin, reglageBlocage } from "@/server/domain/caisse";
import { saisiesManquantes } from "@/server/domain/generation-bulletins";
import { sessionCourante } from "@/server/auth/session";
import { exigerPage, peut } from "@/server/guard";

import { type EtapeManquante, Prerequis } from "../_components/prerequis";
import { GenerationBulletins, type BulletinListe } from "./_components/generation";
import { RetenueImpaye } from "./_components/retenue-impaye";
import { SaisiesManquantes } from "./_components/saisies-manquantes";

export const metadata: Metadata = { title: "Bulletins" };
export const dynamic = "force-dynamic";

/**
 * Bulletins.
 *
 * Un bulletin n'est jamais « généré à la volée » : il fige les moyennes, le
 * rang et les décisions du conseil de classe au moment de sa production. C'est
 * ce qui permet à un parent de contester un chiffre trois mois plus tard — le
 * bulletin dit ce qu'il disait le jour du conseil, même si une note a été
 * corrigée depuis.
 *
 * La classe et la période passent par l'URL plutôt que par un état local : le
 * secrétariat produit classe après classe, et doit pouvoir revenir en arrière
 * ou partager un lien.
 */
export default async function PageBulletins({
  searchParams,
}: {
  searchParams: Promise<{ classe?: string; periode?: string }>;
}) {
  await exigerPage("bulletin:lire");

  const params = await searchParams;
  const stats = await chargerStatistiques();

  const manquants: EtapeManquante[] = [];
  if (!stats.annee) manquants.push({ libelle: "Créer l'année scolaire" });
  if (stats.nbCoefficients === 0) manquants.push({ libelle: "Saisir les coefficients" });
  if (stats.effectifTotal === 0)
    manquants.push({ libelle: "Inscrire des élèves", url: "/dashboard/eleves" });

  if (manquants.length > 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Bulletins</h1>
        </div>
        <Prerequis
          titre="Les bulletins ne peuvent pas encore être produits"
          explication="Un bulletin suppose des élèves inscrits, des coefficients déclarés et des notes saisies. Voici ce qui manque, dans l'ordre où il faut le traiter."
          manquants={manquants}
        />
      </div>
    );
  }

  const [classes, periodes] = await Promise.all([
    db.execute<{ id: string; libelle: string; effectif: number }>(sql`
      SELECT c.id, c.libelle,
             (SELECT count(*) FROM inscriptions i WHERE i.classe_id = c.id AND i.active) AS effectif
        FROM classes c
        JOIN annees_scolaires a ON a.id = c.annee_id AND a.est_courante
       ORDER BY c.libelle
    `),
    db.execute<{ id: string; libelle: string }>(sql`
      SELECT p.id, p.libelle
        FROM periodes p
        JOIN annees_scolaires a ON a.id = p.annee_id AND a.est_courante
       ORDER BY p.numero
    `),
  ]);

  const classeChoisie = params.classe ?? "";
  const periodeChoisie = params.periode ?? "";
  const classeLibelle = classes.rows.find((c) => c.id === classeChoisie)?.libelle ?? "Toutes les classes";
  const periodeLibelle = periodes.rows.find((p) => p.id === periodeChoisie)?.libelle ?? "Toutes les périodes";

  // E-45 : ce qui manque AVANT de produire. E-58 : qui ne recevra rien, et
  // pourquoi. Les deux se lisent au même moment — juste avant de cliquer — et
  // se chargent donc ensemble.
  const reglage = await reglageBlocage();
  const [manquantes, retenues, peutLever, peutConfigurer] = await Promise.all([
    classeChoisie && periodeChoisie
      ? saisiesManquantes(classeChoisie, periodeChoisie)
      : Promise.resolve([]),
    classeChoisie && periodeChoisie
      ? blocagesBulletin(classeChoisie, periodeChoisie, reglage)
      : Promise.resolve([]),
    peut(await sessionCourante(), "finance:exonerer"),
    peut(await sessionCourante(), "finance:configurer"),
  ]);

  const rBulletins = await db.execute<{
    inscription_id: string;
    eleve_id: string;
    eleve: string;
    matricule: string;
    moyenne: string | null;
    rang: number | null;
    mention: string | null;
    appreciation_generale: string | null;
    decision: string | null;
    est_publie: boolean;
    classe_id: string;
    classe: string;
    periode_id: string;
    periode: string;
  }>(sql`
    SELECT b.inscription_id,
           e.id AS eleve_id,
           e.prenom || ' ' || e.nom AS eleve,
           e.matricule,
           b.moyenne_generale::text AS moyenne,
           b.rang,
           b.mention::text AS mention,
           b.appreciation_generale,
           b.decision::text AS decision,
           b.est_publie,
           c.id AS classe_id,
           c.libelle AS classe,
           p.id AS periode_id,
           p.libelle AS periode
      FROM bulletins b
      JOIN periodes p ON p.id = b.periode_id
      JOIN annees_scolaires a ON a.id = p.annee_id AND a.est_courante
      JOIN inscriptions i ON i.id = b.inscription_id
      JOIN classes c ON c.id = i.classe_id AND c.annee_id = a.id
      JOIN eleves e ON e.id = i.eleve_id
     ORDER BY p.numero, c.libelle, b.rang NULLS LAST, e.nom
  `);

  const bulletins: BulletinListe[] = rBulletins.rows.map((x) => ({
    inscriptionId: x.inscription_id,
    eleveId: x.eleve_id,
    eleve: x.eleve,
    matricule: x.matricule,
    moyenne: x.moyenne,
    rang: x.rang,
    mention: x.mention,
    appreciation: x.appreciation_generale,
    decision: x.decision,
    publie: x.est_publie,
    classeId: x.classe_id,
    classe: x.classe,
    periodeId: x.periode_id,
    periode: x.periode,
  }));

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <div className="h-1.5 bg-gradient-to-r from-cyan-700 via-sky-600 to-indigo-600" />
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)] lg:items-center">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-700/20 bg-cyan-700/[0.06] px-3 py-1.5 text-xs font-semibold tracking-wide text-cyan-800 dark:text-cyan-300">
              <BookOpenCheck className="size-3.5" aria-hidden />
              ESPACE PÉDAGOGIQUE
            </div>
            <div className="space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Gestion des bulletins scolaires</h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">Produisez, vérifiez et publiez les résultats scolaires depuis un espace unique.</p>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="inline-flex items-center rounded-lg border bg-muted/30 px-3 py-2 text-sm font-medium">{stats.annee?.libelle ?? "Année non configurée"}</span>
              <span className="inline-flex items-center rounded-lg border bg-muted/30 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">{classes.rows.length} classes</span>
              <span className="inline-flex items-center rounded-lg border bg-muted/30 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">{stats.effectifTotal} élèves</span>
            </div>
          </div>
          <div className="rounded-xl border border-border/80 bg-muted/20 p-4 sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">Contexte de production</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div className="rounded-lg border bg-card px-3 py-3">
                <p className="text-xs text-slate-600 dark:text-slate-300">Classe</p>
                <p className="mt-1 truncate text-sm font-semibold">{classeLibelle}</p>
              </div>
              <div className="rounded-lg border bg-card px-3 py-3">
                <p className="text-xs text-slate-600 dark:text-slate-300">Période</p>
                <p className="mt-1 truncate text-sm font-semibold">{periodeLibelle}</p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm" className="mt-3 w-full justify-between">
              <Link href="/dashboard/notes">Ouvrir la saisie des notes <ArrowUpRight className="size-4" aria-hidden /></Link>
            </Button>
          </div>
        </div>
      </section>

      {classeChoisie && periodeChoisie ? (
        <>
          <SaisiesManquantes lignes={manquantes} />
          <RetenueImpaye
            reglage={reglage}
            lignes={retenues}
            periodeId={periodeChoisie}
            peutLever={peutLever}
            peutConfigurer={peutConfigurer}
          />
        </>
      ) : null}

      <GenerationBulletins
        classes={classes.rows.map((c) => ({
          id: c.id,
          libelle: c.libelle,
          effectif: Number(c.effectif),
        }))}
        periodes={periodes.rows}
        classeChoisie={classeChoisie}
        periodeChoisie={periodeChoisie}
        bulletins={bulletins}
        effectifTotal={stats.effectifTotal}
      />
    </div>
  );
}
