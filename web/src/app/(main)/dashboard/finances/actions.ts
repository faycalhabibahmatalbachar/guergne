"use server";

import { revalidatePath } from "next/cache";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import {
  echeances,
  exonerations,
  grillesTarifaires,
  inscriptions,
  paiements,
  tranches,
} from "@/server/db/schema";
import { ErreurAutorisation, requirePermission } from "@/server/guard";
import { reveillerFile } from "@/server/notifications/reveil";

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
  const m = e instanceof Error ? e.message : "";
  // Messages métier des déclencheurs comptables.
  if (/reste dû|annulation|supprime/.test(m)) {
    return { ok: false, message: m.replace(/^.*?ERROR:\s*/i, "").split("\n")[0] };
  }
  if (m.includes("duplicate key") || m.includes("23505")) {
    return { ok: false, message: "Cet élément existe déjà." };
  }
  console.error("[finances]", e);
  return { ok: false, message: defaut };
}

function messages(e: z.ZodError): Record<string, string> {
  const s: Record<string, string> = {};
  for (const p of e.issues) {
    const c = String(p.path[0] ?? "_");
    if (!s[c]) s[c] = p.message;
  }
  return s;
}

// ===========================================================================
// Grille tarifaire
// ===========================================================================

const schemaTarif = z.object({
  anneeId: z.string().uuid(),
  niveauId: z.string().uuid("Sélectionnez un niveau"),
  nature: z.enum([
    "INSCRIPTION", "REINSCRIPTION", "SCOLARITE", "APE", "TENUE",
    "EXAMEN", "FOURNITURES", "TRANSPORT", "CANTINE", "AUTRE",
  ]),
  libelle: z.string().trim().min(3, "Libellé requis"),
  montantFcfa: z.coerce.number().int().min(0).max(10_000_000),
  obligatoire: z.boolean().default(true),
  applicableNouveaux: z.boolean().default(true),
  applicableAnciens: z.boolean().default(true),
});

export async function definirTarif(donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("finance:configurer");
    const a = schemaTarif.safeParse(donnees);
    if (!a.success) return { ok: false, erreurs: messages(a.error) };

    const v = a.data;
    const [cree] = await db
      .insert(grillesTarifaires)
      .values({
        anneeId: v.anneeId,
        niveauId: v.niveauId,
        nature: v.nature,
        libelle: v.libelle,
        montantFcfa: v.montantFcfa,
        obligatoire: v.obligatoire,
        applicableNouveaux: v.applicableNouveaux,
        applicableAnciens: v.applicableAnciens,
      })
      .returning({ id: grillesTarifaires.id });

    await journaliser(acteur, {
      action: "tarif.defini",
      entite: "grilles_tarifaires",
      entiteId: cree.id,
      apres: v,
    });

    revalidatePath("/dashboard/finances");
    return OK;
  } catch (e) {
    return echec(e, "L'enregistrement du tarif a échoué.");
  }
}

export async function supprimerTarif(id: string): Promise<Resultat> {
  try {
    const acteur = await requirePermission("finance:configurer");
    const [avant] = await db.select().from(grillesTarifaires).where(eq(grillesTarifaires.id, id));
    await db.delete(grillesTarifaires).where(eq(grillesTarifaires.id, id));
    await journaliser(acteur, {
      action: "tarif.supprime",
      entite: "grilles_tarifaires",
      entiteId: id,
      avant: avant ? { libelle: avant.libelle, montant: avant.montantFcfa } : null,
    });
    revalidatePath("/dashboard/finances");
    return OK;
  } catch (e) {
    return echec(e, "La suppression a échoué.");
  }
}

// ===========================================================================
// Tranches
// ===========================================================================

const schemaTranche = z.object({
  anneeId: z.string().uuid(),
  numero: z.coerce.number().int().min(1).max(12),
  libelle: z.string().trim().min(2, "Libellé requis"),
  dateLimite: z.string().min(1, "Date limite requise"),
  pourcentage: z.coerce.number().min(1).max(100),
});

export async function definirTranche(donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("finance:configurer");
    const a = schemaTranche.safeParse(donnees);
    if (!a.success) return { ok: false, erreurs: messages(a.error) };

    const v = a.data;

    // La somme des tranches doit faire 100 % : sinon l'échéancier généré ne
    // couvre pas le montant dû, et l'écart passe inaperçu jusqu'au bilan.
    const [{ total }] = await db
      .select({ total: sql<number>`COALESCE(SUM(${tranches.pourcentage}), 0)` })
      .from(tranches)
      .where(eq(tranches.anneeId, v.anneeId));

    if (Number(total) + v.pourcentage > 100) {
      return {
        ok: false,
        erreurs: {
          pourcentage: `Les tranches existantes couvrent déjà ${Number(total)} %. Maximum ${100 - Number(total)} % ici.`,
        },
      };
    }

    await db.insert(tranches).values({
      anneeId: v.anneeId,
      numero: v.numero,
      libelle: v.libelle,
      dateLimite: v.dateLimite,
      pourcentage: String(v.pourcentage),
    });

    await journaliser(acteur, { action: "tranche.definie", entite: "tranches", apres: v });

    revalidatePath("/dashboard/finances");
    return OK;
  } catch (e) {
    return echec(e, "L'enregistrement de la tranche a échoué.");
  }
}

// ===========================================================================
// Génération des échéanciers
// ===========================================================================

/**
 * Génère l'échéancier des élèves d'une année.
 *
 * Croise la grille tarifaire du niveau avec les tranches de paiement. Un élève
 * qui a déjà un échéancier est ignoré : régénérer écraserait des paiements
 * déjà encaissés.
 *
 * Le calcul se fait en entiers : le reliquat d'arrondi est ajouté à la
 * dernière tranche, pour que la somme des échéances retombe exactement sur le
 * montant dû. Sans cela, il manquerait quelques francs par élève.
 */
export async function genererEcheanciers(anneeId: string, classeId?: string): Promise<Resultat> {
  try {
    const acteur = await requirePermission("finance:configurer");

    const listeTranches = await db
      .select()
      .from(tranches)
      .where(eq(tranches.anneeId, anneeId))
      .orderBy(tranches.numero);

    if (listeTranches.length === 0) {
      return { ok: false, message: "Définissez d'abord les tranches de paiement." };
    }

    const totalPourcentage = listeTranches.reduce((s, t) => s + Number(t.pourcentage), 0);
    if (Math.abs(totalPourcentage - 100) > 0.01) {
      return {
        ok: false,
        message: `Les tranches couvrent ${totalPourcentage} % au lieu de 100 %. Complétez-les avant de générer.`,
      };
    }

    const conditions = [eq(inscriptions.anneeId, anneeId), eq(inscriptions.active, true)];
    if (classeId) conditions.push(eq(inscriptions.classeId, classeId));

    const cibles = await db.execute<Record<string, unknown>>(sql`
      SELECT i.id AS inscription_id, i.type, c.niveau_id
        FROM inscriptions i
        JOIN classes c ON c.id = i.classe_id
       WHERE i.annee_id = ${anneeId}::uuid
         AND i.active
         AND (${classeId ?? null}::uuid IS NULL OR i.classe_id = ${classeId ?? null}::uuid)
         AND NOT EXISTS (SELECT 1 FROM echeances e WHERE e.inscription_id = i.id)
    `);

    if (cibles.rows.length === 0) {
      return { ok: false, message: "Aucun élève sans échéancier sur ce périmètre." };
    }

    let generes = 0;

    await db.transaction(async (tx) => {
      for (const cible of cibles.rows) {
        const inscriptionId = String(cible.inscription_id);
        const niveauId = String(cible.niveau_id);
        const estNouveau = cible.type !== "REINSCRIPTION";

        const tarifs = await tx
          .select()
          .from(grillesTarifaires)
          .where(
            and(
              eq(grillesTarifaires.anneeId, anneeId),
              eq(grillesTarifaires.niveauId, niveauId),
              eq(grillesTarifaires.obligatoire, true),
            ),
          );

        const applicables = tarifs.filter((t) =>
          estNouveau ? t.applicableNouveaux : t.applicableAnciens,
        );
        if (applicables.length === 0) continue;

        const total = applicables.reduce((s, t) => s + Number(t.montantFcfa), 0);
        if (total === 0) continue;

        let cumul = 0;
        const lignes = listeTranches.map((t, index) => {
          const dernier = index === listeTranches.length - 1;
          // Le reliquat d'arrondi va sur la dernière tranche.
          const montant = dernier
            ? total - cumul
            : Math.round((total * Number(t.pourcentage)) / 100);
          cumul += montant;

          return {
            inscriptionId,
            trancheId: t.id,
            nature: "SCOLARITE" as const,
            libelle: t.libelle,
            montantDuFcfa: montant,
            dateLimite: t.dateLimite,
          };
        });

        await tx.insert(echeances).values(lignes);
        generes += 1;
      }
    });

    await journaliser(acteur, {
      action: "echeanciers.generes",
      entite: "echeances",
      apres: { anneeId, classeId: classeId ?? null, nbEleves: generes },
    });

    revalidatePath("/dashboard/finances");
    return { ok: true, message: `Échéancier généré pour ${generes} élève(s).` };
  } catch (e) {
    return echec(e, "La génération des échéanciers a échoué.");
  }
}

// ===========================================================================
// Encaissement
// ===========================================================================

const schemaPaiement = z.object({
  inscriptionId: z.string().uuid(),
  echeanceId: z.string().uuid("Sélectionnez l'échéance à régler"),
  montantFcfa: z.coerce.number().int().min(1, "Montant requis"),
  mode: z.enum(["ESPECES", "MOBILE_MONEY", "VIREMENT", "CHEQUE", "AUTRE"]),
  referenceExterne: z.string().trim().optional(),
  nomPayeur: z.string().trim().optional(),
  datePaiement: z.string().min(1, "Date requise"),
  observations: z.string().trim().optional(),
});

/**
 * Enregistre un encaissement.
 *
 * Le numéro de reçu est attribué par une fonction PostgreSQL qui verrouille sa
 * ligne de séquence : deux encaissements simultanés au guichet ne peuvent pas
 * porter le même numéro. L'imputation sur l'échéance et le recalcul du statut
 * sont faits par déclencheur, pas par l'application.
 */
export async function encaisser(donnees: unknown): Promise<Resultat & { numeroRecu?: string }> {
  try {
    const acteur = await requirePermission("finance:encaisser");
    const a = schemaPaiement.safeParse(donnees);
    if (!a.success) return { ok: false, erreurs: messages(a.error) };

    const v = a.data;
    const anneeCivile = new Date().getFullYear();

    const resultat = await db.transaction(async (tx) => {
      const res = await tx.execute<{ numero: string }>(
        sql`SELECT prochain_numero('RECU', ${anneeCivile}::smallint) AS numero`,
      );
      const numeroRecu = res.rows[0].numero;

      await tx.insert(paiements).values({
        inscriptionId: v.inscriptionId,
        echeanceId: v.echeanceId,
        numeroRecu,
        montantFcfa: v.montantFcfa,
        mode: v.mode,
        referenceExterne: v.referenceExterne || null,
        nomPayeur: v.nomPayeur || null,
        datePaiement: v.datePaiement,
        observations: v.observations || null,
        encaissePar: acteur.id,
      });

      return numeroRecu;
    });

    const [insc] = await db
      .select({ eleveId: inscriptions.eleveId })
      .from(inscriptions)
      .where(eq(inscriptions.id, v.inscriptionId));

    await journaliser(acteur, {
      action: "paiement.encaisse",
      entite: "paiements",
      eleveId: insc?.eleveId ?? null,
      apres: { numeroRecu: resultat, montant: v.montantFcfa, mode: v.mode },
    });

    // La file part MAINTENANT, sans attendre le cron : trois à sept
    // minutes de délai ne se distinguent pas, pour un parent, d'un
    // envoi manuel.
    reveillerFile();
    revalidatePath("/dashboard/finances");
    return { ok: true, numeroRecu: resultat, message: `Reçu ${resultat} enregistré.` };
  } catch (e) {
    return echec(e, "L'encaissement a échoué.");
  }
}

/**
 * Annule un paiement par écriture inverse.
 *
 * On ne supprime jamais une ligne de caisse : un déclencheur l'interdit en
 * base. La correction passe par une écriture de montant négatif, qui laisse
 * les deux mouvements visibles au rapprochement.
 */
export async function annulerPaiement(paiementId: string, motif: string): Promise<Resultat> {
  try {
    const acteur = await requirePermission("finance:encaisser");

    if (motif.trim().length < 5) {
      return { ok: false, erreurs: { motif: "Le motif d'annulation doit être explicite." } };
    }

    const [origine] = await db.select().from(paiements).where(eq(paiements.id, paiementId));
    if (!origine) return { ok: false, message: "Paiement introuvable." };
    if (origine.annule) return { ok: false, message: "Ce paiement est déjà annulé." };
    if (Number(origine.montantFcfa) < 0) {
      return { ok: false, message: "Une écriture d'annulation ne s'annule pas." };
    }

    const anneeCivile = new Date().getFullYear();

    await db.transaction(async (tx) => {
      const res = await tx.execute<{ numero: string }>(
        sql`SELECT prochain_numero('RECU', ${anneeCivile}::smallint) AS numero`,
      );

      await tx.insert(paiements).values({
        inscriptionId: origine.inscriptionId,
        echeanceId: origine.echeanceId,
        numeroRecu: res.rows[0].numero,
        montantFcfa: -Number(origine.montantFcfa),
        mode: origine.mode,
        datePaiement: new Date().toISOString().slice(0, 10),
        annule: true,
        annulePaiementId: origine.id,
        motifAnnulation: motif.trim(),
        encaissePar: acteur.id,
      });

      await tx.update(paiements).set({ annule: true }).where(eq(paiements.id, origine.id));
    });

    await journaliser(acteur, {
      action: "paiement.annule",
      entite: "paiements",
      entiteId: paiementId,
      avant: { numeroRecu: origine.numeroRecu, montant: origine.montantFcfa },
      motif: motif.trim(),
    });

    revalidatePath("/dashboard/finances");
    return { ok: true, message: "Écriture d'annulation enregistrée." };
  } catch (e) {
    return echec(e, "L'annulation a échoué.");
  }
}

// ===========================================================================
// Exonérations
// ===========================================================================

const schemaExoneration = z
  .object({
    inscriptionId: z.string().uuid(),
    echeanceId: z.string().uuid().nullable().optional(),
    motif: z.enum(["BOURSE", "FRATRIE", "CAS_SOCIAL", "ENFANT_PERSONNEL", "MERITE", "AUTRE"]),
    justification: z.string().trim().min(5, "Justifiez cette exonération"),
    pourcentage: z.coerce.number().min(1).max(100).nullable().optional(),
    montantFcfa: z.coerce.number().int().min(1).nullable().optional(),
  })
  .refine((v) => (v.pourcentage == null) !== (v.montantFcfa == null), {
    message: "Indiquez soit un pourcentage, soit un montant — pas les deux",
    path: ["pourcentage"],
  });

export async function exonerer(donnees: unknown): Promise<Resultat> {
  try {
    // Une exonération est une perte de recette : elle relève de la direction,
    // pas du comptable qui encaisse.
    const acteur = await requirePermission("finance:exonerer");
    const a = schemaExoneration.safeParse(donnees);
    if (!a.success) return { ok: false, erreurs: messages(a.error) };

    const v = a.data;

    await db.transaction(async (tx) => {
      await tx.insert(exonerations).values({
        inscriptionId: v.inscriptionId,
        motif: v.motif,
        justification: v.justification,
        pourcentage: v.pourcentage == null ? null : String(v.pourcentage),
        montantFcfa: v.montantFcfa ?? null,
        accordePar: acteur.id,
      });

      // Application immédiate sur l'échéance visée, ou sur toutes si aucune
      // n'est précisée.
      const cibles = await tx
        .select({ id: echeances.id, du: echeances.montantDuFcfa, exo: echeances.montantExonereFcfa })
        .from(echeances)
        .where(
          v.echeanceId
            ? eq(echeances.id, v.echeanceId)
            : eq(echeances.inscriptionId, v.inscriptionId),
        );

      for (const cible of cibles) {
        const du = Number(cible.du);
        const dejaExonere = Number(cible.exo);
        const remise =
          v.pourcentage != null
            ? Math.round((du * v.pourcentage) / 100)
            : Math.min(v.montantFcfa ?? 0, du - dejaExonere);

        const nouveau = Math.min(du, dejaExonere + remise);
        await tx
          .update(echeances)
          .set({ montantExonereFcfa: nouveau })
          .where(eq(echeances.id, cible.id));

        // Une exonération ciblée ne s'applique qu'une fois.
        if (v.montantFcfa != null) break;
      }
    });

    const [insc] = await db
      .select({ eleveId: inscriptions.eleveId })
      .from(inscriptions)
      .where(eq(inscriptions.id, v.inscriptionId));

    await journaliser(acteur, {
      action: "finance.exoneration",
      entite: "exonerations",
      eleveId: insc?.eleveId ?? null,
      apres: { motif: v.motif, pourcentage: v.pourcentage, montant: v.montantFcfa },
      motif: v.justification,
    });

    revalidatePath("/dashboard/finances");
    return { ok: true, message: "Exonération accordée et appliquée à l'échéancier." };
  } catch (e) {
    return echec(e, "L'exonération a échoué.");
  }
}
