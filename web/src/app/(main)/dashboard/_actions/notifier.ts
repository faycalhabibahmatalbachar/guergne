"use server";

import { revalidatePath } from "next/cache";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { segmentsSms } from "@/lib/segments-sms";
import { COUT_SMS_FCFA } from "@/lib/tarifs";
import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { ErreurAutorisation, requirePermission } from "@/server/guard";

/**
 * Prévenir les parents depuis la page où l'on se trouve.
 *
 * POURQUOI PAS UNIQUEMENT DEPUIS « COMMUNICATION »
 * ------------------------------------------------
 * Le surveillant qui vient de saisir une absence, le comptable qui encaisse, le
 * censeur qui consulte un dossier : tous ont, à ce moment précis, une raison de
 * prévenir la famille et le contexte sous les yeux. Les envoyer sur un autre
 * écran pour y resaisir le nom de l'élève, c'est garantir que le message ne
 * partira pas.
 *
 * Les notifications produites empruntent exactement le même chemin que celles
 * des déclencheurs : `fn_notifier_tuteurs` choisit le canal réellement
 * joignable, et la file les expédie. Rien de particulier n'est inventé ici.
 */

export interface ResultatNotification {
  ok: boolean;
  message?: string;
  erreurs?: Record<string, string>;
  /** Notifications déposées, tous canaux confondus. */
  posees?: number;
}

/**
 * Ce que coûtera l'envoi, avant de l'engager.
 *
 * Le SMS est le seul poste variable du budget. Annoncer « 42 destinataires,
 * dont 31 par SMS, soit 1 550 F » avant le clic est la seule façon d'éviter
 * qu'un envoi de routine ne vide le crédit de l'établissement.
 */
export interface Apercu {
  total: number;
  parPush: number;
  parSms: number;
  sansCanal: number;
  segments: number;
  coutFcfa: number;
}

const schema = z.object({
  titre: z.string().trim().min(3, "Titre requis (3 caractères minimum)").max(80, "Titre trop long"),
  corps: z.string().trim().min(5, "Message requis").max(600, "Message trop long"),
});

function echec(erreur: unknown, defaut: string): ResultatNotification {
  if (erreur instanceof ErreurAutorisation) {
    return { ok: false, message: "Vous n'avez pas les droits pour prévenir les familles." };
  }
  console.error("[notifier]", erreur);
  return { ok: false, message: defaut };
}

/**
 * Répartition des tuteurs d'un ensemble d'élèves par canal joignable.
 *
 * On interroge `fn_canal_tuteur` — la même fonction que les déclencheurs — pour
 * que l'aperçu ne puisse pas diverger de ce qui partira réellement.
 */
async function repartition(eleveIds: string[], titre: string, corps: string): Promise<Apercu> {
  if (eleveIds.length === 0) {
    return { total: 0, parPush: 0, parSms: 0, sansCanal: 0, segments: 0, coutFcfa: 0 };
  }

  const r = await db.execute<{ canal: string; n: number }>(sql`
    SELECT fn_canal_tuteur(t.id)::text AS canal, count(DISTINCT t.id) AS n
      FROM eleve_tuteur et
      JOIN tuteurs t ON t.id = et.tuteur_id
     WHERE et.eleve_id = ANY(${eleveIds}::uuid[])
     GROUP BY 1
  `);

  const par = Object.fromEntries(r.rows.map((x) => [x.canal, Number(x.n)]));
  const parPush = par.PUSH ?? 0;
  const parSms = par.SMS ?? 0;
  const sansCanal = par.IN_APP ?? 0;

  // Le texte réellement expédié est « titre\ncorps », signature comprise. On
  // approxime la signature par sa longueur usuelle plutôt que de l'importer :
  // ce module est appelé depuis le client pour l'aperçu.
  const segmentsUnitaires = segmentsSms(`LGR : ${titre}\n${corps}`);

  return {
    total: parPush + parSms + sansCanal,
    parPush,
    parSms,
    sansCanal,
    segments: segmentsUnitaires,
    coutFcfa: parSms * segmentsUnitaires * COUT_SMS_FCFA,
  };
}

/** Aperçu pour un élève. N'écrit rien. */
export async function apercuEleve(
  eleveId: string,
  titre: string,
  corps: string,
): Promise<Apercu> {
  await requirePermission("message:envoyer");
  return repartition([eleveId], titre, corps);
}

/** Aperçu pour une classe entière. N'écrit rien. */
export async function apercuClasse(
  classeId: string,
  titre: string,
  corps: string,
): Promise<Apercu> {
  await requirePermission("message:envoyer");
  const r = await db.execute<{ id: string }>(sql`
    SELECT e.id FROM inscriptions i
      JOIN eleves e ON e.id = i.eleve_id
     WHERE i.classe_id = ${classeId}::uuid AND i.active
  `);
  return repartition(r.rows.map((x) => x.id), titre, corps);
}

/**
 * Prévient les tuteurs d'un élève.
 *
 * `route_cible` pointe sur la fiche de l'élève dans l'application des parents :
 * une notification sur laquelle on tape doit mener quelque part.
 */
export async function notifierEleve(
  eleveId: string,
  donnees: unknown,
): Promise<ResultatNotification> {
  try {
    const acteur = await requirePermission("message:envoyer");

    const a = schema.safeParse(donnees);
    if (!a.success) {
      const s: Record<string, string> = {};
      for (const p of a.error.issues) s[String(p.path[0])] = p.message;
      return { ok: false, erreurs: s };
    }

    const r = await db.execute<{ posees: number }>(sql`
      SELECT fn_notifier_tuteurs(
        ${eleveId}::uuid,
        'ANNONCE'::type_notification,
        ${a.data.titre},
        ${a.data.corps},
        ${`/eleves/${eleveId}`},
        ${JSON.stringify({ origine: "page_eleve" })}::jsonb
      ) AS posees
    `);

    const posees = Number(r.rows[0]?.posees ?? 0);

    await journaliser(acteur, {
      action: "notification.envoyee_depuis_fiche",
      entite: "eleves",
      entiteId: eleveId,
      apres: { titre: a.data.titre, destinataires: posees },
    });

    revalidatePath(`/dashboard/eleves/${eleveId}`);

    return posees === 0
      ? { ok: false, message: "Aucun tuteur rattaché à cet élève." }
      : { ok: true, posees, message: `${posees} tuteur(s) prévenu(s).` };
  } catch (erreur) {
    return echec(erreur, "L'envoi a échoué.");
  }
}

/**
 * Prévient les tuteurs de tous les élèves d'une classe.
 *
 * Une notification par élève, et non une par classe : le message parle de
 * l'enfant du destinataire, et le lien doit mener à SON dossier. Un parent de
 * deux enfants dans la même classe en reçoit donc deux — c'est voulu, ils
 * concernent deux scolarités distinctes.
 */
export async function notifierClasse(
  classeId: string,
  donnees: unknown,
): Promise<ResultatNotification> {
  try {
    const acteur = await requirePermission("message:envoyer");

    const a = schema.safeParse(donnees);
    if (!a.success) {
      const s: Record<string, string> = {};
      for (const p of a.error.issues) s[String(p.path[0])] = p.message;
      return { ok: false, erreurs: s };
    }

    const r = await db.execute<{ posees: number }>(sql`
      SELECT COALESCE(sum(fn_notifier_tuteurs(
        e.id,
        'ANNONCE'::type_notification,
        ${a.data.titre},
        ${a.data.corps},
        '/eleves/' || e.id,
        ${JSON.stringify({ origine: "page_classe" })}::jsonb
      )), 0) AS posees
        FROM inscriptions i
        JOIN eleves e ON e.id = i.eleve_id
       WHERE i.classe_id = ${classeId}::uuid AND i.active
    `);

    const posees = Number(r.rows[0]?.posees ?? 0);

    await journaliser(acteur, {
      action: "notification.envoyee_depuis_classe",
      entite: "classes",
      entiteId: classeId,
      apres: { titre: a.data.titre, destinataires: posees },
    });

    revalidatePath("/dashboard/classes");

    return posees === 0
      ? { ok: false, message: "Aucun tuteur joignable dans cette classe." }
      : { ok: true, posees, message: `${posees} tuteur(s) prévenu(s).` };
  } catch (erreur) {
    return echec(erreur, "L'envoi a échoué.");
  }
}
