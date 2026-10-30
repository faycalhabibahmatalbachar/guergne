import Link from "next/link";

import { sql } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

import { EnTetePage, Page } from "@/components/socle/en-tete-page";
import { Button } from "@/components/ui/button";
import { db } from "@/server/db";
import { historiqueExonerations } from "@/server/domain/caisse";
import { chargerAnneeCourante } from "@/server/domain/tableau-de-bord";
import { exigerPage } from "@/server/guard";

import { VueExonerations } from "./vue-exonerations";

export const metadata: Metadata = { title: "Exonérations" };
export const dynamic = "force-dynamic";

/**
 * Historique des exonérations (E-59).
 *
 * ELLES POUVAIENT ÊTRE ACCORDÉES, PAS RELUES
 * -------------------------------------------
 * `exonerer()` écrivait dans la table depuis le début ; aucun écran ne la
 * lisait. Une remise consentie disparaissait de la vue dès la page rechargée,
 * et le seul moyen de savoir qui était exonéré était d'ouvrir le classeur
 * comptable dans un tableur.
 *
 * C'est pourtant le poste le plus sensible d'une comptabilité d'établissement
 * privé : de l'argent auquel on renonce, décidé au cas par cas. Il doit se
 * relire d'un coup d'œil, avec le nom de qui a accordé — c'est la seule chose
 * qui distingue une politique sociale d'une faveur.
 */
export default async function PageExonerations({
  searchParams,
}: {
  searchParams: Promise<{ classe?: string; motif?: string }>;
}) {
  await exigerPage("finance:lire");

  const params = await searchParams;
  const annee = await chargerAnneeCourante();

  if (!annee) {
    return (
      <Page>
        <EnTetePage titre="Exonérations" />
        <p className="text-muted-foreground text-sm">Aucune année scolaire n&apos;est configurée.</p>
      </Page>
    );
  }

  const [classes, historique] = await Promise.all([
    db.execute<{ id: string; libelle: string }>(sql`
      SELECT c.id, c.libelle
        FROM classes c
       WHERE c.annee_id = ${annee.id}::uuid
       ORDER BY c.libelle
    `),
    historiqueExonerations(annee.id, {
      classeId: params.classe || undefined,
      motif: params.motif || undefined,
    }),
  ]);

  return (
    <Page>
      <EnTetePage
        titre="Exonérations et remises"
        description={<>Année {annee.libelle}. Ce à quoi l&apos;établissement a renoncé, et qui l&apos;a décidé.</>}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/finances">
                <ArrowLeft aria-hidden />
                Suivi financier
              </Link>
            </Button>
          </>
        }
      />

      <VueExonerations
        historique={historique}
        classes={classes.rows}
        classeId={params.classe ?? ""}
        motif={params.motif ?? ""}
      />
    </Page>
  );
}
