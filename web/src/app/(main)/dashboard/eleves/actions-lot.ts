"use server";

import { revalidatePath } from "next/cache";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { ErreurAutorisation, requirePermission } from "@/server/guard";

/**
 * Actions en lot sur une sélection d'élèves (E-38).
 *
 * POURQUOI TOUT OU RIEN
 * ----------------------
 * Le changement de classe s'exécute dans UNE transaction. Si la classe cible
 * déborde sa capacité au douzième élève, rien ne bouge — au lieu de laisser
 * onze élèves déplacés et neuf restés en arrière, situation qu'il faut ensuite
 * démêler à la main sans savoir qui est passé.
 *
 * Le déclencheur de capacité en base demeure l’autorité finale.
 * Le précontrôle de capacité ci-dessous sert uniquement à afficher un message
 * compréhensible avant la transaction, et ne remplace pas le déclencheur.
 *
 * LE MOTIF EST OBLIGATOIRE, ET COMMUN
 * ------------------------------------
 * Un mouvement de vingt élèves a une raison unique : dédoublement, fusion,
 * réorientation de série. Ce motif est écrit dans `changements_classe` pour
 * chacun — c'est ce que le censeur relira l'année suivante.
 */

export interface ResultatLot {
  ok: boolean;
  message?: string;
  traites?: number;
}

const schemaClasse = z.object({
  eleveIds: z.array(z.string().uuid()).min(1, "Aucun élève sélectionné.").max(100)
    .refine((ids) => new Set(ids).size === ids.length, "La sélection contient des doublons."),
  classeId: z.string().uuid(),
  motif: z.string().trim().min(3, "Le motif est obligatoire.").max(500, "Motif trop long."),
});

export async function changerClasseEnLot(donnees: unknown): Promise<ResultatLot> {
  try {
    const acteur = await requirePermission("eleve:affecter");

    const a = schemaClasse.safeParse(donnees);
    if (!a.success) {
      return { ok: false, message: a.error.issues[0]?.message ?? "Requête invalide." };
    }
    const { eleveIds, classeId, motif } = a.data;
    // La destination doit être une classe active de l’année scolaire courante.
    const destination = await db.execute<{ id: string; libelle: string; capacite_max: number; annee_id: string }>(sql`
      SELECT c.id, c.libelle, c.capacite_max, c.annee_id
        FROM classes c JOIN annees_scolaires a ON a.id = c.annee_id
       WHERE c.id = ${classeId}::uuid AND c.active AND a.est_courante AND NOT a.est_cloturee
    `);
    if (!destination.rows[0]) return { ok: false, message: "La classe choisie n’est pas disponible pour l’année scolaire en cours." };
    const classeCible = destination.rows[0];

    // On résout les inscriptions actives ici plutôt que de les faire remonter
    // de l'écran : la liste affiche des élèves, et un élève peut n'avoir aucune
    // inscription active — il ne doit alors pas être déplacé en silence.
    const cibles = await db.execute<{ id: string; eleve_id: string; classe_id: string }>(sql`
      SELECT i.id, i.eleve_id, i.classe_id
        FROM inscriptions i
       WHERE i.eleve_id IN (${sql.join(eleveIds.map((id) => sql`${id}::uuid`), sql`, `)})
         AND i.active
         AND i.annee_id = ${classeCible.annee_id}::uuid
    `);

    if (cibles.rows.length !== eleveIds.length) {
      return { ok: false, message: "La sélection contient des élèves sans inscription active pour cette année. Aucun dossier modifié." };
    }
    const deja = cibles.rows.filter((i) => i.classe_id === classeId).length;
    if (deja > 0) {
      return { ok: false, message: `${deja} élève(s) sont déjà dans la classe choisie. Retirez-les de la sélection.` };
    }
    const places = await db.execute<{ effectif: number }>(sql`
      SELECT count(*)::int AS effectif FROM inscriptions
       WHERE classe_id = ${classeId}::uuid AND active
    `);
    const effectif = Number(places.rows[0]?.effectif ?? 0);
    if (effectif + cibles.rows.length > Number(classeCible.capacite_max)) {
      return { ok: false, message: `La classe ${classeCible.libelle} dispose de ${Math.max(0, Number(classeCible.capacite_max) - effectif)} place(s) pour ${cibles.rows.length} élève(s). Aucun dossier modifié.` };
    }
    await db.transaction(async (tx) => {
      // Verrouiller la destination pour sérialiser les mouvements concurrents.
      await tx.execute(sql`SELECT id FROM classes WHERE id = ${classeId}::uuid FOR UPDATE`);
      // Le déclencheur SQL conserve le contrôle définitif de capacité.
      for (const c of cibles.rows) {
        await tx.execute(sql`
          UPDATE inscriptions SET classe_id = ${classeId}::uuid WHERE id = ${c.id}::uuid
        `);
        await tx.execute(sql`
          INSERT INTO changements_classe
            (inscription_id, classe_origine_id, classe_destination_id, motif, decide_par)
          VALUES (${c.id}::uuid, ${c.classe_id}::uuid, ${classeId}::uuid, ${motif}, ${acteur.id}::uuid)
        `);
      }
    });

    // Un audit applicatif indisponible ne doit pas afficher un échec alors que
    // la transaction a déjà déplacé les élèves.
    try {
      await journaliser(acteur, {
        action: "eleve.classe_changee_en_lot",
        entite: "inscriptions",
        apres: { classeId, eleves: cibles.rows.length },
        motif,
      });
    } catch (auditErreur) {
      console.error("[lot-classe] Audit applicatif indisponible", (auditErreur as { code?: string })?.code ?? "inconnu");
    }
    revalidatePath("/dashboard/eleves");
    revalidatePath("/dashboard/classes");
    return {
      ok: true,
      traites: cibles.rows.length,
      message: `${cibles.rows.length} élève(s) déplacé(s) avec succès.`,
    };
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return { ok: false, message: "Vous n'avez pas les droits pour affecter des élèves." };
    }
    const cause = (erreur as { cause?: { code?: string; message?: string } })?.cause;
    const code = cause?.code ?? (erreur as { code?: string })?.code;
    const message = cause?.message ?? (erreur instanceof Error ? erreur.message : "");
    if (message.includes("est complète") || code === "23514") {
      return { ok: false, message: "La classe de destination est complète. Aucun élève déplacé." };
    }
    if (code === "22P02") {
      return { ok: false, message: "Erreur de format des identifiants. Réessayez ou contactez l’administration." };
    }
    if (code === "23503") {
      return { ok: false, message: "Une classe, une inscription ou l’utilisateur responsable n’est plus disponible. Actualisez la page." };
    }
    if (code === "40001" || code === "40P01") {
      return { ok: false, message: "Une autre opération est en cours. Réessayez dans quelques instants." };
    }
    // Journalisation sans paramètres SQL ni identifiants privés des élèves.
    console.error("[lot-classe] Code PostgreSQL :", code ?? "inconnu");
    return { ok: false, message: "Le déplacement n’a pas pu être effectué. Aucun élève déplacé. Contactez l’administration si le problème persiste." };
  }
}