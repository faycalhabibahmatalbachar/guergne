import type { Metadata } from "next";

import { sql } from "drizzle-orm";

import { db } from "@/server/db";
import { chargerStatistiques } from "@/server/domain/tableau-de-bord";
import { saisiesManquantes } from "@/server/domain/generation-bulletins";
import { exigerPage } from "@/server/guard";

import { type EtapeManquante, Prerequis } from "../_components/prerequis";
import { GenerationBulletins, type BulletinListe } from "./_components/generation";
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

  // E-45 : ce qui manque AVANT de produire. Chargé en même temps que la liste.
  const manquantes =
    classeChoisie && periodeChoisie
      ? await saisiesManquantes(classeChoisie, periodeChoisie)
      : [];

  let bulletins: BulletinListe[] = [];
  if (classeChoisie && periodeChoisie) {
    const r = await db.execute<{
      inscription_id: string;
      eleve: string;
      matricule: string;
      moyenne: string | null;
      rang: number | null;
      mention: string | null;
      appreciation_generale: string | null;
      decision: string | null;
      est_publie: boolean;
    }>(sql`
      SELECT b.inscription_id,
             e.prenom || ' ' || e.nom AS eleve,
             e.matricule,
             b.moyenne_generale::text AS moyenne,
             b.rang,
             b.mention::text AS mention,
             b.appreciation_generale,
             b.decision::text AS decision,
             b.est_publie
        FROM bulletins b
        JOIN inscriptions i ON i.id = b.inscription_id
        JOIN eleves e       ON e.id = i.eleve_id
       WHERE i.classe_id = ${classeChoisie}::uuid
         AND b.periode_id = ${periodeChoisie}::uuid
       ORDER BY b.rang NULLS LAST, e.nom
    `);

    bulletins = r.rows.map((x) => ({
      inscriptionId: x.inscription_id,
      eleve: x.eleve,
      matricule: x.matricule,
      moyenne: x.moyenne,
      rang: x.rang,
      mention: x.mention,
      appreciation: x.appreciation_generale,
      decision: x.decision,
      publie: x.est_publie,
    }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Bulletins</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          {stats.annee
            ? `Année ${stats.annee.libelle} — ${classes.rows.length} classe(s)`
            : "Aucune année scolaire configurée"}
        </p>
      </div>

      {classeChoisie && periodeChoisie ? <SaisiesManquantes lignes={manquantes} /> : null}

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
      />
    </div>
  );
}
