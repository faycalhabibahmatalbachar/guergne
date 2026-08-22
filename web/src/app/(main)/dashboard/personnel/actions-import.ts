"use server";

import { revalidatePath } from "next/cache";

import { sql } from "drizzle-orm";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { ErreurAutorisation, requirePermission } from "@/server/guard";
import { analyserEnseignants, type RapportEnseignants } from "@/server/import/enseignants";
import { lireFeuille } from "@/server/import/feuille";
import { normaliserNumero } from "@/server/notifications/sms";

export interface ResultatImportEnseignants {
  ok: boolean;
  message?: string;
  rapport?: RapportEnseignants;
  crees?: number;
}

function echec(erreur: unknown, defaut: string): ResultatImportEnseignants {
  if (erreur instanceof ErreurAutorisation) {
    return { ok: false, message: "Vous n'avez pas les droits pour importer du personnel." };
  }
  const message = erreur instanceof Error ? erreur.message : "";
  if (message.includes("format") || message.includes("Format") || message.includes(".xls")) {
    return { ok: false, message };
  }
  console.error("[import-enseignants]", erreur);
  return { ok: false, message: defaut };
}

async function matieresActives() {
  const r = await db.execute<{ id: string; libelle: string; code: string }>(
    sql`SELECT id, libelle, code FROM matieres WHERE active ORDER BY libelle`,
  );
  return r.rows;
}

/** Lit et vérifie le fichier, sans rien écrire. */
export async function analyserFichierEnseignants(
  donnees: FormData,
): Promise<ResultatImportEnseignants> {
  try {
    await requirePermission("utilisateur:creer");

    const fichier = donnees.get("fichier");
    if (!(fichier instanceof File) || fichier.size === 0) {
      return { ok: false, message: "Aucun fichier reçu." };
    }
    if (fichier.size > 5 * 1024 * 1024) {
      return { ok: false, message: "Fichier trop volumineux (5 Mo maximum)." };
    }

    const feuille = await lireFeuille(fichier);
    if (feuille.lignes.length === 0) {
      return { ok: false, message: "Le fichier ne contient aucune ligne de données." };
    }

    return { ok: true, rapport: await analyserEnseignants(feuille, await matieresActives()) };
  } catch (erreur) {
    return echec(erreur, "La lecture du fichier a échoué.");
  }
}

/**
 * Crée réellement les enseignants du fichier.
 *
 * Le fichier est relu et réanalysé : on ne se fie pas au rapport renvoyé par le
 * navigateur, qui pourrait ne plus correspondre au contenu envoyé.
 *
 * Un enseignant par transaction — sa fiche et ses matières forment un tout,
 * mais l'échec de l'un ne doit pas emporter les autres.
 */
export async function importerEnseignants(
  donnees: FormData,
): Promise<ResultatImportEnseignants> {
  try {
    const acteur = await requirePermission("utilisateur:creer");

    const fichier = donnees.get("fichier");
    if (!(fichier instanceof File) || fichier.size === 0) {
      return { ok: false, message: "Aucun fichier reçu." };
    }

    const feuille = await lireFeuille(fichier);
    const rapport = await analyserEnseignants(feuille, await matieresActives());

    if (rapport.colonnesManquantes.length > 0) {
      return {
        ok: false,
        message: `Colonnes absentes : ${rapport.colonnesManquantes.join(", ")}.`,
        rapport,
      };
    }
    if (rapport.valides.length === 0) {
      return { ok: false, message: "Aucune ligne exploitable dans ce fichier.", rapport };
    }

    let crees = 0;
    const refus: typeof rapport.erreurs = [];

    for (const e of rapport.valides) {
      try {
        await db.transaction(async (tx) => {
          const insere = await tx.execute<{ id: string }>(sql`
            INSERT INTO enseignants (
              matricule, nom, prenom, sexe, date_naissance, telephone, email,
              adresse, quartier, diplome, specialite, statut, date_embauche,
              numero_cnps, heures_contractuelles, actif
            ) VALUES (
              ${e.matricule}, ${e.nom}, ${e.prenom},
              ${e.sexe}::sexe_type, ${e.dateNaissance}::date,
              ${e.telephone ? normaliserNumero(e.telephone) : null},
              ${e.email}, ${e.adresse}, ${e.quartier}, ${e.diplome}, ${e.specialite},
              ${e.statut}::statut_enseignant, ${e.dateEmbauche}::date,
              ${e.numeroCnps}, ${e.heuresContractuelles}, TRUE
            ) RETURNING id
          `);

          const enseignantId = insere.rows[0]!.id;

          // La première matière listée est marquée principale : c'est celle qui
          // apparaît à côté du nom dans les emplois du temps et les bulletins.
          for (const [rang, matiereId] of e.matiereIds.entries()) {
            await tx.execute(sql`
              INSERT INTO enseignant_matieres (enseignant_id, matiere_id, est_principale)
              VALUES (${enseignantId}::uuid, ${matiereId}::uuid, ${rang === 0})
              ON CONFLICT DO NOTHING
            `);
          }
        });
        crees += 1;
      } catch (erreur) {
        const message = erreur instanceof Error ? erreur.message : "Échec inconnu";
        refus.push({
          ligne: e.ligne,
          colonne: null,
          message: `${e.prenom} ${e.nom} — ${message.replace(/^.*?ERROR:\s*/i, "").slice(0, 160)}`,
        });
      }
    }

    await journaliser(acteur, {
      action: "enseignants.importes",
      entite: "enseignants",
      apres: {
        fichier: fichier.name,
        lignes: feuille.lignes.length,
        crees,
        refuses: refus.length,
        deja_presents: rapport.dejaPresents.length,
      },
    });

    revalidatePath("/dashboard/personnel");

    return {
      ok: true,
      crees,
      rapport: { ...rapport, erreurs: [...rapport.erreurs, ...refus] },
      message:
        refus.length === 0
          ? `${crees} enseignant(s) créé(s).`
          : `${crees} enseignant(s) créé(s), ${refus.length} refusé(s).`,
    };
  } catch (erreur) {
    return echec(erreur, "L'import a échoué.");
  }
}
