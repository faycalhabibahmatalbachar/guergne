import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-cyan-500/10 p-3 text-cyan-700 dark:text-cyan-300"><BookOpen className="size-5" aria-hidden /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Suivi de la scolarité</p>
            <p className="mt-1 font-semibold">{stats.annee?.libelle ?? "Année non configurée"} · {classes.rows.length} classes · {stats.effectifTotal} élèves</p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm"><Link href="/dashboard/notes">Accéder à la saisie des notes</Link></Button>
      </div>

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
