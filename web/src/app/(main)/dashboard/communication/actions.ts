"use server";

import { revalidatePath } from "next/cache";

import { and, count, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { planifierAnnonce, planifierMessage, type AudienceAnnonce } from "@/server/domain/communication-plans";
import { annonceDestinataires, annonces, anneesScolaires, classes, eleveTuteur, inscriptions, messages, niveaux, notifications, tuteurs, utilisateurs } from "@/server/db/schema";
import { traiterFile } from "@/server/notifications/expediteur";
import { ErreurAutorisation, requirePermission, type Principal } from "@/server/guard";

export interface Resultat {
  ok: boolean;
  message?: string;
  erreurs?: Record<string, string>;
}

const OK: Resultat = { ok: true };

function echec(e: unknown, defaut: string): Resultat {
  if (e instanceof ErreurAutorisation) {
    return { ok: false, message: "Vous n'avez pas les droits pour cette opération." };
  }
  console.error("[communication]", e);
  return { ok: false, message: defaut };
}

function messagesErreur(e: z.ZodError): Record<string, string> {
  const s: Record<string, string> = {};
  for (const p of e.issues) {
    const c = String(p.path[0] ?? "_");
    if (!s[c]) s[c] = p.message;
  }
  return s;
}

// ===========================================================================
// Annonces
// ===========================================================================

const schemaAnnonce = z
  .object({
    anneeId: z.string().uuid(),
    titre: z.string().trim().min(3, "Titre requis").max(180, "Titre trop long"),
    contenu: z.string().trim().min(10, "Le contenu doit être explicite").max(5000, "Contenu trop long"),
    cible: z.enum(["TOUS", "NIVEAU", "CLASSE", "ELEVE"]),
    niveauId: z.string().uuid().nullable().optional(),
    classeId: z.string().uuid().nullable().optional(),
    elevesIds: z.array(z.string().uuid()).default([]),
    epinglee: z.boolean().default(false),
    envoyerPush: z.boolean().default(true),
    expireLe: z.string().refine((v) => v === "" || dateIsoValide(v), { message: "Date d’expiration invalide" }).optional(),
    confirmerDiffusion: z.boolean().default(false),
    confirmerCout: z.boolean().default(false),
    plafondNotifications: z.number().int().min(0).optional(),
    plafondCoutFcfa: z.number().int().min(0).optional(),
  })
  .refine((v) => v.cible !== "NIVEAU" || !!v.niveauId, {
    message: "Sélectionnez le niveau visé",
    path: ["niveauId"],
  })
  .refine((v) => v.cible !== "CLASSE" || !!v.classeId, {
    message: "Sélectionnez la classe visée",
    path: ["classeId"],
  })
  .refine((v) => v.cible !== "ELEVE" || v.elevesIds.length > 0, {
    message: "Sélectionnez au moins un élève",
    path: ["elevesIds"],
  })
  .refine((v) => new Set(v.elevesIds).size === v.elevesIds.length, {
    message: "Un élève ne peut être sélectionné qu’une seule fois.",
    path: ["elevesIds"],
  });


function dateIsoValide(value: string): boolean {
  if (value.length !== 10 || value[4] !== "-" || value[7] !== "-") return false;
  const [annee, mois, jour] = value.split("-").map(Number);
  const date = new Date(Date.UTC(annee, mois - 1, jour));
  return date.getUTCFullYear() === annee && date.getUTCMonth() === mois - 1 && date.getUTCDate() === jour;
}

async function validerCibleAnnonce(v: z.infer<typeof schemaAnnonce>): Promise<Record<string, string> | null> {
  const [annee] = await db.select({ id: anneesScolaires.id })
    .from(anneesScolaires).where(eq(anneesScolaires.id, v.anneeId)).limit(1);
  if (!annee) return { anneeId: "Cette année scolaire n’existe pas." };

  if (v.cible === "CLASSE") {
    const [classe] = await db.select({ id: classes.id }).from(classes).where(and(
      eq(classes.id, v.classeId ?? ""), eq(classes.anneeId, v.anneeId), eq(classes.active, true),
    )).limit(1);
    if (!classe) return { classeId: "Cette classe n’est pas active dans l’année scolaire sélectionnée." };
  }

  if (v.cible === "NIVEAU") {
    const [niveau] = await db.select({ id: niveaux.id }).from(niveaux)
      .where(eq(niveaux.id, v.niveauId ?? "")).limit(1);
    const [classeInscrite] = await db.select({ id: classes.id }).from(classes)
      .innerJoin(inscriptions, and(
        eq(inscriptions.classeId, classes.id),
        eq(inscriptions.anneeId, v.anneeId),
        eq(inscriptions.active, true),
      ))
      .where(and(
        eq(classes.anneeId, v.anneeId),
        eq(classes.niveauId, v.niveauId ?? ""),
        eq(classes.active, true),
      )).limit(1);
    if (!niveau || !classeInscrite) {
      return { niveauId: "Ce niveau n’a pas de classe active avec des élèves inscrits pour cette année." };
    }
  }

  if (v.cible === "ELEVE") {
    const inscrits = await db.select({ id: inscriptions.eleveId })
      .from(inscriptions).innerJoin(classes, eq(classes.id, inscriptions.classeId))
      .where(and(
        eq(inscriptions.anneeId, v.anneeId),
        eq(inscriptions.active, true),
        eq(classes.anneeId, v.anneeId),
        eq(classes.active, true),
        inArray(inscriptions.eleveId, v.elevesIds),
      ));
    if (new Set(inscrits.map((ligne) => ligne.id)).size !== v.elevesIds.length) {
      return { elevesIds: "Au moins un élève sélectionné n’est pas inscrit dans une classe active de cette année." };
    }
  }
  return null;
}

/**
 * Publie une annonce et met en file les notifications.
 *
 * La diffusion est calculée EN BASE, au moment de la publication : recalculer
 * à l'envoi donnerait une population différente si un élève change de classe
 * entre-temps, et certaines familles recevraient un message qui ne les
 * concerne plus.
 */
export interface ApercuDiffusion {
  politique: string;
  total: number;
  parPush: number;
  parSms: number;
  dansApplication: number;
  sansCanal: number;
  segments: number;
  coutFcfa: number;
}

export interface ResultatApercu {
  ok: boolean;
  message?: string;
  erreurs?: Record<string, string>;
  apercu?: ApercuDiffusion;
}

function audienceAnnonce(v: z.infer<typeof schemaAnnonce>): AudienceAnnonce {
  return {
    anneeId: v.anneeId,
    titre: v.titre,
    contenu: v.contenu,
    cible: v.cible,
    niveauId: v.niveauId ?? null,
    classeId: v.classeId ?? null,
    elevesIds: v.elevesIds,
    envoyerPush: v.envoyerPush,
  };
}

function validerConfirmation(
  v: { confirmerDiffusion: boolean; confirmerCout: boolean; plafondNotifications?: number; plafondCoutFcfa?: number },
  apercu: ApercuDiffusion,
): string | null {
  if (!v.confirmerDiffusion) return "Confirmez la population et les canaux affichés dans l’aperçu avant de continuer.";
  if (v.plafondNotifications === undefined || apercu.total > v.plafondNotifications) {
    return "La population a changé depuis l’aperçu. Recalculez la diffusion avant de continuer.";
  }
  if (v.plafondCoutFcfa === undefined || apercu.coutFcfa > v.plafondCoutFcfa) {
    return "Le coût estimé a augmenté depuis l’aperçu. Recalculez la diffusion avant de continuer.";
  }
  if (apercu.parSms > 0 && !v.confirmerCout) {
    return "Confirmez explicitement le coût SMS estimé avant de continuer.";
  }
  return null;
}

/** Calcule les destinataires et le coût sans écrire d'annonce ni déclencher de canal. */
export async function previsualiserAnnonce(donnees: unknown): Promise<ResultatApercu> {
  try {
    await requirePermission("annonce:publier");
    const analyse = schemaAnnonce.safeParse(donnees);
    if (!analyse.success) return { ok: false, erreurs: messagesErreur(analyse.error) };
    const v = analyse.data;
    const erreurCible = await validerCibleAnnonce(v);
    if (erreurCible) return { ok: false, erreurs: erreurCible };

    const plan = await planifierAnnonce(audienceAnnonce(v));
    return { ok: true, apercu: plan.resume };
  } catch (e) {
    return echec(e, "Le calcul de la diffusion a échoué.");
  }
}

/**
 * Publie et dépose la diffusion issue d'un aperçu confirmé.
 * Les canaux sont planifiés côté serveur sous verrou de lecture de la politique :
 * aucun SMS ne peut être ajouté après confirmation sans être reflété au client.
 */
export async function publierAnnonce(donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("annonce:publier");
    const analyse = schemaAnnonce.safeParse(donnees);
    if (!analyse.success) return { ok: false, erreurs: messagesErreur(analyse.error) };

    const v = analyse.data;
    const erreurCible = await validerCibleAnnonce(v);
    if (erreurCible) return { ok: false, erreurs: erreurCible };

    let erreurConfirmation: string | null = null;
    let nbNotifications = 0;
    let coutSmsFcfa = 0;

    await db.transaction(async (tx) => {
      let plan: Awaited<ReturnType<typeof planifierAnnonce>> | null = null;
      if (v.envoyerPush) {
        await tx.execute(sql`
          SELECT type FROM politiques_notification
           WHERE type = 'ANNONCE'::type_notification
           FOR SHARE
        `);
        plan = await planifierAnnonce(audienceAnnonce(v), tx);
        erreurConfirmation = validerConfirmation(v, plan.resume);
        if (erreurConfirmation) return;
      }

      const [creee] = await tx.insert(annonces)
        .values({
          anneeId: v.anneeId,
          titre: v.titre,
          contenu: v.contenu,
          cible: v.cible,
          niveauId: v.cible === "NIVEAU" ? (v.niveauId ?? null) : null,
          classeId: v.cible === "CLASSE" ? (v.classeId ?? null) : null,
          epinglee: v.epinglee,
          envoyerPush: v.envoyerPush,
          expireLe: v.expireLe ? new Date(v.expireLe).toISOString() : null,
          publieePar: acteur.id,
        })
        .returning({ id: annonces.id });

      if (v.cible === "ELEVE" && v.elevesIds.length > 0) {
        await tx.insert(annonceDestinataires)
          .values(v.elevesIds.map((eleveId) => ({ annonceId: creee.id, eleveId })));
      }

      if (plan && plan.depots.length > 0) {
        await tx.insert(notifications).values(plan.depots.map((depot) => ({
          destinataireId: depot.destinataireId,
          telephone: depot.telephone,
          eleveId: depot.eleveId,
          type: "ANNONCE" as const,
          canal: depot.canal,
          titre: v.titre,
          corps: v.contenu,
          routeCible: "/annonces/" + creee.id,
          donnees: { annonce_id: creee.id },
        })));
        nbNotifications = plan.resume.total;
        coutSmsFcfa = plan.resume.coutFcfa;
      }

      await journaliser(acteur, {
        action: "annonce.publiee",
        entite: "annonces",
        entiteId: creee.id,
        apres: { titre: v.titre, cible: v.cible, nbNotifications, coutSmsEstimeFcfa: coutSmsFcfa },
      });
    });

    if (erreurConfirmation) return { ok: false, message: erreurConfirmation };
    revalidatePath("/dashboard/communication");
    return {
      ok: true,
      message: v.envoyerPush
        ? `Annonce publiée. ${nbNotifications} notification(s) déposée(s) selon la politique actuelle${coutSmsFcfa > 0 ? ` · SMS estimés : ${coutSmsFcfa.toLocaleString("fr-FR")} F` : ""}.`
        : "Annonce publiée sans notification immédiate.",
    };
  } catch (e) {
    return echec(e, "La publication de l'annonce a échoué.");
  }
}

export async function basculerAnnonce(annonceId: string, publiee: boolean): Promise<Resultat> {
  try {
    const acteur = await requirePermission("annonce:publier");
    const valide = z.string().uuid().safeParse(annonceId);
    if (!valide.success) return { ok: false, message: "Identifiant d’annonce invalide." };
    const [modifiee] = await db.update(annonces).set({ publiee })
      .where(eq(annonces.id, valide.data)).returning({ id: annonces.id });
    if (!modifiee) return { ok: false, message: "Cette annonce n’existe plus." };
    await journaliser(acteur, {
      action: publiee ? "annonce.reactivee" : "annonce.retiree",
      entite: "annonces", entiteId: valide.data,
    });
    revalidatePath("/dashboard/communication");
    return { ok: true, message: publiee ? "Annonce réactivée." : "Annonce retirée." };
  } catch (e) { return echec(e, "L’opération a échoué."); }
}

export async function epinglerAnnonce(annonceId: string, epinglee: boolean): Promise<Resultat> {
  try {
    const acteur = await requirePermission("annonce:publier");
    const valide = z.string().uuid().safeParse(annonceId);
    if (!valide.success) return { ok: false, message: "Identifiant d’annonce invalide." };
    const [modifiee] = await db.update(annonces).set({ epinglee })
      .where(eq(annonces.id, valide.data)).returning({ id: annonces.id });
    if (!modifiee) return { ok: false, message: "Cette annonce n’existe plus." };
    await journaliser(acteur, {
      action: epinglee ? "annonce.epinglee" : "annonce.desepinglee",
      entite: "annonces", entiteId: valide.data,
    });
    revalidatePath("/dashboard/communication");
    return { ok: true, message: epinglee ? "Annonce épinglée." : "Annonce désépinglée." };
  } catch (e) { return echec(e, "L’opération a échoué."); }
}

// ===========================================================================
// Messages
// ===========================================================================

const schemaMessage = z.object({
  anneeId: z.string().uuid(),
  destinataireId: z.string().uuid("Sélectionnez un destinataire"),
  eleveId: z.string().uuid().nullable().optional(),
  objet: z.string().trim().min(3, "Objet requis").max(180, "Objet trop long"),
  contenu: z.string().trim().min(5, "Message trop court").max(5000, "Message trop long"),
  confirmerDiffusion: z.boolean().default(false),
  confirmerCout: z.boolean().default(false),
  plafondNotifications: z.number().int().min(0).optional(),
  plafondCoutFcfa: z.number().int().min(0).optional(),
});

interface CibleMessageValidee {
  acteur: Principal;
  tuteurId: string;
}

async function validerCibleMessage(
  v: z.infer<typeof schemaMessage>,
): Promise<{ ok: true; cible: CibleMessageValidee } | { ok: false; message: string; champ?: string }> {
  const contexte = v.eleveId
    ? await db.select({ classeId: inscriptions.classeId })
        .from(inscriptions)
        .innerJoin(classes, eq(classes.id, inscriptions.classeId))
        .where(and(
          eq(inscriptions.eleveId, v.eleveId),
          eq(inscriptions.anneeId, v.anneeId),
          eq(inscriptions.active, true),
          eq(classes.anneeId, v.anneeId),
          eq(classes.active, true),
        ))
        .limit(1)
    : [];

  let acteur: Principal;
  try {
    acteur = await requirePermission(
      "message:envoyer",
      contexte[0] ? { classeId: contexte[0].classeId, eleveId: v.eleveId ?? undefined } : {},
    );
  } catch (e) {
    if (e instanceof ErreurAutorisation && e.code === "HORS_PERIMETRE" && !v.eleveId) {
      return { ok: false, champ: "eleveId", message: "Pour ce rôle, sélectionnez un élève appartenant à votre périmètre." };
    }
    throw e;
  }

  if (v.eleveId && !contexte[0]) {
    return { ok: false, champ: "eleveId", message: "Cet élève n’est pas inscrit dans une classe active de cette année." };
  }

  const [destinataire] = await db.select({ id: utilisateurs.id, tuteurId: tuteurs.id })
    .from(utilisateurs)
    .innerJoin(tuteurs, eq(tuteurs.utilisateurId, utilisateurs.id))
    .where(and(
      eq(utilisateurs.id, v.destinataireId),
      eq(utilisateurs.role, "PARENT"),
      eq(utilisateurs.actif, true),
    ))
    .limit(1);
  if (!destinataire) {
    return { ok: false, champ: "destinataireId", message: "Ce compte parent est introuvable ou inactif." };
  }

  const conditions = [
    eq(eleveTuteur.tuteurId, destinataire.tuteurId),
    eq(inscriptions.anneeId, v.anneeId),
    eq(inscriptions.active, true),
    eq(classes.anneeId, v.anneeId),
    eq(classes.active, true),
  ];
  if (v.eleveId) conditions.push(eq(eleveTuteur.eleveId, v.eleveId));
  const lien = await db.select({ eleveId: eleveTuteur.eleveId })
    .from(eleveTuteur)
    .innerJoin(inscriptions, eq(inscriptions.eleveId, eleveTuteur.eleveId))
    .innerJoin(classes, eq(classes.id, inscriptions.classeId))
    .where(and(...conditions))
    .limit(1);
  if (!lien.length) {
    return v.eleveId
      ? { ok: false, champ: "eleveId", message: "Le destinataire n’est pas rattaché à cet élève pour l’année sélectionnée." }
      : { ok: false, champ: "destinataireId", message: "Ce parent n’est rattaché à aucun élève actif de cette année." };
  }
  return { ok: true, cible: { acteur, tuteurId: destinataire.tuteurId } };
}

/** Prévisualise la politique AUTRE et le coût avant d'enregistrer un message ciblé. */
export async function previsualiserMessageCible(donnees: unknown): Promise<ResultatApercu> {
  try {
    const analyse = schemaMessage.safeParse(donnees);
    if (!analyse.success) return { ok: false, erreurs: messagesErreur(analyse.error) };
    const v = analyse.data;
    const cible = await validerCibleMessage(v);
    if (!cible.ok) return { ok: false, message: cible.message, erreurs: cible.champ ? { [cible.champ]: cible.message } : undefined };

    const plan = await planifierMessage(v.destinataireId, v.eleveId ?? null, v.objet, v.contenu);
    return { ok: true, apercu: plan.resume };
  } catch (e) {
    return echec(e, "Le calcul de la notification a échoué.");
  }
}

export async function envoyerMessage(donnees: unknown): Promise<Resultat> {
  try {
    const analyse = schemaMessage.safeParse(donnees);
    if (!analyse.success) return { ok: false, erreurs: messagesErreur(analyse.error) };
    const v = analyse.data;
    const cible = await validerCibleMessage(v);
    if (!cible.ok) return { ok: false, message: cible.message, erreurs: cible.champ ? { [cible.champ]: cible.message } : undefined };
    const { acteur } = cible.cible;

    let erreurConfirmation: string | null = null;
    let nbNotifications = 0;
    let coutSmsFcfa = 0;

    await db.transaction(async (tx) => {
      await tx.execute(sql`
        SELECT type FROM politiques_notification
         WHERE type = 'AUTRE'::type_notification
         FOR SHARE
      `);
      const plan = await planifierMessage(v.destinataireId, v.eleveId ?? null, v.objet, v.contenu, tx);
      erreurConfirmation = validerConfirmation(v, plan.resume);
      if (erreurConfirmation) return;

      const [cree] = await tx.insert(messages).values({
        expediteurId: acteur.id,
        destinataireId: v.destinataireId,
        eleveId: v.eleveId ?? null,
        objet: v.objet,
        contenu: v.contenu,
      }).returning({ id: messages.id });

      if (plan.depots.length > 0) {
        await tx.insert(notifications).values(plan.depots.map((depot) => ({
          destinataireId: depot.destinataireId,
          telephone: depot.telephone,
          eleveId: v.eleveId ?? null,
          type: "AUTRE" as const,
          canal: depot.canal,
          titre: v.objet,
          corps: v.contenu,
          routeCible: "/messages/" + cree.id,
          donnees: { message_id: cree.id },
        })));
      }
      nbNotifications = plan.resume.total;
      coutSmsFcfa = plan.resume.coutFcfa;

      await journaliser(acteur, {
        action: "message.envoye",
        entite: "messages",
        entiteId: cree.id,
        eleveId: v.eleveId ?? null,
        apres: { objet: v.objet, notificationsDeposees: nbNotifications, coutSmsEstimeFcfa: coutSmsFcfa },
      });
    });

    if (erreurConfirmation) return { ok: false, message: erreurConfirmation };
    revalidatePath("/dashboard/communication");
    return {
      ok: true,
      message: nbNotifications > 0
        ? `Message enregistré. ${nbNotifications} notification(s) déposée(s)${coutSmsFcfa > 0 ? ` · SMS estimés : ${coutSmsFcfa.toLocaleString("fr-FR")} F` : ""}.`
        : "Message enregistré dans la messagerie, sans alerte immédiate selon la politique de notification.",
    };
  } catch (e) {
    return echec(e, "L’envoi du message a échoué.");
  }
}

export async function marquerMessageLu(messageId: string): Promise<Resultat> {
  try {
    const acteur = await requirePermission("message:lire");
    const valide = z.string().uuid().safeParse(messageId);
    if (!valide.success) return { ok: false, message: "Identifiant de message invalide." };

    const modifie = await db.update(messages)
      .set({ lu: true, luLe: new Date().toISOString() })
      .where(and(
        eq(messages.id, valide.data),
        eq(messages.destinataireId, acteur.id),
      ))
      .returning({ id: messages.id });

    if (!modifie.length) {
      return { ok: false, message: "Message introuvable ou inaccessible pour ce compte." };
    }
    revalidatePath("/dashboard/communication");
    return OK;
  } catch (e) {
    return echec(e, "L'opération a échoué.");
  }
}

// ===========================================================================
// File d'expédition
// ===========================================================================

/**
 * Vide la file des notifications en attente.
 *
 * Délègue à l'expéditeur, qui n'accuse un envoi que sur confirmation du canal.
 * Un canal non configuré laisse ses notifications EN FILE plutôt que de les
 * marquer en échec : elles partiront dès qu'il sera branché.
 */
export async function traiterFileNotifications(): Promise<Resultat> {
  try {
    const acteur = await requirePermission("notification:configurer");
    const rapport = await traiterFile(200);
    await journaliser(acteur, { action: "notifications.traitees", entite: "notifications", apres: rapport });
    revalidatePath("/dashboard/communication");
    const [etatRestant] = await db.select({ nombre: count() }).from(notifications)
      .where(eq(notifications.statut, "EN_ATTENTE"));
    const restants = Number(etatRestant?.nombre ?? 0);

    if (rapport.traitees === 0 && rapport.canauxIndisponibles.length > 0) {
      return { ok: false, message: "Aucun canal disponible : " + rapport.canauxIndisponibles.join(", ") +
        ". Les notifications restent en file (" + restants + " en attente)." };
    }
    if (rapport.traitees === 0) {
      return { ok: true, message: "Aucune notification traitée. " + restants + " restent en attente." };
    }
    const details = [
      rapport.envoyees + " envoyée(s)",
      rapport.echouees > 0 ? rapport.echouees + " en échec" : null,
      rapport.ignorees > 0 ? rapport.ignorees + " en attente de canal" : null,
      rapport.coutSmsFcfa > 0 ? "coût SMS " + rapport.coutSmsFcfa.toLocaleString("fr-FR") + " F" : null,
      rapport.jetonsNettoyes > 0 ? rapport.jetonsNettoyes + " appareil(s) obsolète(s) retiré(s)" : null,
      restants > 0 ? restants + " restant(s) en file" : "File vide",
    ].filter(Boolean);
    return { ok: true, message: details.join(" · ") };
  } catch (e) { return echec(e, "Le traitement de la file a échoué."); }
}
