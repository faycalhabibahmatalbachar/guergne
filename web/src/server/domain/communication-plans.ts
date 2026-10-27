import "server-only";

import { sql } from "drizzle-orm";

import { COUT_SMS_FCFA } from "@/lib/tarifs";
import {
  choisirCanaux,
  type CanalPlanifie,
  type CapacitesContact,
  type PolitiqueCanal,
} from "@/lib/planification-notification";
import { db } from "@/server/db";
import { segmentsSms, signatureSms } from "@/server/notifications/sms";

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface AudienceAnnonce {
  anneeId: string;
  titre: string;
  contenu: string;
  cible: "TOUS" | "NIVEAU" | "CLASSE" | "ELEVE";
  niveauId?: string | null;
  classeId?: string | null;
  elevesIds: string[];
  envoyerPush: boolean;
}

export interface ResumePlanDiffusion {
  politique: PolitiqueCanal;
  total: number;
  parPush: number;
  parSms: number;
  dansApplication: number;
  sansCanal: number;
  segments: number;
  coutFcfa: number;
}

export interface DepotPlanifie {
  canal: CanalPlanifie;
  destinataireId: string | null;
  telephone: string | null;
  eleveId: string | null;
}

export interface PlanDiffusion {
  resume: ResumePlanDiffusion;
  depots: DepotPlanifie[];
}

interface LigneContact extends CapacitesContact {
  [key: string]: unknown;
  eleveId: string | null;
  politique: PolitiqueCanal;
}

interface LignePolitique extends Record<string, unknown> {
  politique: string;
}

interface LigneMessageContact extends Record<string, unknown> {
  utilisateurId: string | null;
  compteActif: boolean;
  telephone: string | null;
  accepteSms: boolean;
  pushDisponible: boolean;
}

const POLITIQUE_PAR_DEFAUT: PolitiqueCanal = "PUSH_SINON_SMS";

async function politiquePour(
  executor: Executor,
  type: "ANNONCE" | "AUTRE",
): Promise<PolitiqueCanal> {
  const resultat = await executor.execute<LignePolitique>(sql`
    SELECT COALESCE(
      (SELECT politique::text FROM politiques_notification WHERE type = ${type}::type_notification),
      'PUSH_SINON_SMS'
    ) AS politique
  `);
  const valeur = resultat.rows[0]?.politique;
  return valeur === "PUSH_ET_SMS" || valeur === "PUSH_SEUL" || valeur === "SMS_SEUL" || valeur === "AUCUN"
    ? valeur
    : POLITIQUE_PAR_DEFAUT;
}

function creerPlan(
  contacts: LigneContact[],
  politique: PolitiqueCanal,
  titre: string,
  contenu: string,
): PlanDiffusion {
  const depots: DepotPlanifie[] = [];
  let sansCanal = 0;
  let segments = 0;
  const texteSms = `${signatureSms()}${titre}\n${contenu}`;
  const segmentsParSms = segmentsSms(texteSms);

  for (const contact of contacts) {
    const canaux = choisirCanaux(contact, politique);
    if (canaux.length === 0) sansCanal += 1;

    for (const canal of canaux) {
      depots.push({
        canal,
        destinataireId: contact.utilisateurId,
        telephone: canal === "SMS" ? contact.telephone : null,
        eleveId: contact.eleveId,
      });
      if (canal === "SMS") segments += segmentsParSms;
    }
  }

  const parPush = depots.filter((d) => d.canal === "PUSH").length;
  const parSms = depots.filter((d) => d.canal === "SMS").length;
  const dansApplication = depots.filter((d) => d.canal === "IN_APP").length;

  return {
    depots,
    resume: {
      politique,
      total: depots.length,
      parPush,
      parSms,
      dansApplication,
      sansCanal,
      segments,
      coutFcfa: segments * COUT_SMS_FCFA,
    },
  };
}

export async function planifierAnnonce(
  audience: AudienceAnnonce,
  executor: Executor = db,
): Promise<PlanDiffusion> {
  const politique = await politiquePour(executor, "ANNONCE");
  if (!audience.envoyerPush) {
    return creerPlan([], politique, audience.titre, audience.contenu);
  }

  const resultat = await executor.execute<LigneContact & { tuteurId: string; eleveId: string }>(sql`
    SELECT DISTINCT ON (i.eleve_id, t.id)
      i.eleve_id::text AS "eleveId",
      t.id::text AS "tuteurId",
      t.utilisateur_id::text AS "utilisateurId",
      COALESCE(u.actif, FALSE) AS "compteActif",
      t.telephone,
      COALESCE(t.accepte_sms, TRUE) AS "accepteSms",
      EXISTS (
        SELECT 1 FROM appareils a
        WHERE a.utilisateur_id = t.utilisateur_id
          AND a.actif AND a.jeton_fcm IS NOT NULL
      ) AS "pushDisponible",
      ${politique}::text AS politique
    FROM inscriptions i
    JOIN classes c ON c.id = i.classe_id
    JOIN eleve_tuteur et ON et.eleve_id = i.eleve_id
    JOIN tuteurs t ON t.id = et.tuteur_id
    LEFT JOIN utilisateurs u ON u.id = t.utilisateur_id
    WHERE i.annee_id = ${audience.anneeId}::uuid
      AND i.active
      AND c.annee_id = ${audience.anneeId}::uuid
      AND c.active
      AND (
        ${audience.cible} = 'TOUS'
        OR (${audience.cible} = 'NIVEAU' AND c.niveau_id = ${audience.niveauId ?? null}::uuid)
        OR (${audience.cible} = 'CLASSE' AND c.id = ${audience.classeId ?? null}::uuid)
        OR (${audience.cible} = 'ELEVE' AND i.eleve_id = ANY(${audience.elevesIds}::uuid[]))
      )
      AND (${audience.cible} <> 'TOUS' OR et.est_principal)
    ORDER BY i.eleve_id, t.id
  `);

  const contacts: LigneContact[] = resultat.rows.map((l) => ({
    eleveId: l.eleveId,
    utilisateurId: l.utilisateurId,
    compteActif: Boolean(l.compteActif),
    telephone: l.telephone,
    accepteSms: Boolean(l.accepteSms),
    pushDisponible: Boolean(l.pushDisponible),
    politique,
  }));

  return creerPlan(contacts, politique, audience.titre, audience.contenu);
}

export async function planifierMessage(
  destinataireId: string,
  eleveId: string | null,
  titre: string,
  contenu: string,
  executor: Executor = db,
): Promise<PlanDiffusion> {
  const politique = await politiquePour(executor, "AUTRE");
  const resultat = await executor.execute<LigneMessageContact>(sql`
    SELECT
      t.utilisateur_id::text AS "utilisateurId",
      COALESCE(u.actif, FALSE) AS "compteActif",
      t.telephone,
      COALESCE(t.accepte_sms, TRUE) AS "accepteSms",
      EXISTS (
        SELECT 1 FROM appareils a
        WHERE a.utilisateur_id = t.utilisateur_id
          AND a.actif AND a.jeton_fcm IS NOT NULL
      ) AS "pushDisponible"
    FROM tuteurs t
    JOIN utilisateurs u ON u.id = t.utilisateur_id
    WHERE t.utilisateur_id = ${destinataireId}::uuid
      AND u.role = 'PARENT'::role_utilisateur
      AND u.actif
    ORDER BY t.id
    LIMIT 1
  `);

  const contacts: LigneContact[] = resultat.rows.map((l) => ({
    ...l,
    eleveId,
    politique,
  }));

  return creerPlan(contacts, politique, titre, contenu);
}
