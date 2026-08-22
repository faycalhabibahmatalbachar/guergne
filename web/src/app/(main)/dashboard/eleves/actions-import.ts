"use server";

import { revalidatePath } from "next/cache";

import { and, eq, sql } from "drizzle-orm";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { anneesScolaires, classes as tableClasses } from "@/server/db/schema";
import { ErreurAutorisation, requirePermission } from "@/server/guard";
import { lireFeuille } from "@/server/import/feuille";
import { analyserEleves, type RapportAnalyse } from "@/server/import/eleves";
import { normaliserNumero } from "@/server/notifications/sms";

export interface ResultatImport {
  ok: boolean;
  message?: string;
  rapport?: RapportAnalyse;
  /** Nombre d'élèves réellement inscrits. Absent tant qu'on est en simulation. */
  inscrits?: number;
}

function echec(erreur: unknown, defaut: string): ResultatImport {
  if (erreur instanceof ErreurAutorisation) {
    return { ok: false, message: "Vous n'avez pas les droits pour importer des élèves." };
  }
  const message = erreur instanceof Error ? erreur.message : "";
  // Les messages de `lireFeuille` sont écrits pour être lus par le secrétariat.
  if (message.includes("format") || message.includes("Format") || message.includes(".xls")) {
    return { ok: false, message };
  }
  console.error("[import-eleves]", erreur);
  return { ok: false, message: defaut };
}

async function classesOuvertes() {
  const lignes = await db
    .select({ id: tableClasses.id, libelle: tableClasses.libelle })
    .from(tableClasses)
    .innerJoin(anneesScolaires, eq(anneesScolaires.id, tableClasses.anneeId))
    .where(eq(anneesScolaires.estCourante, true));
  return lignes;
}

/**
 * Analyse un fichier sans rien écrire.
 *
 * C'est l'étape qu'on ne saute pas. Un fichier de rentrée fait cinq cents
 * lignes, et l'erreur la plus fréquente n'est pas dans une ligne mais dans une
 * colonne : un intitulé que le programme ne reconnaît pas, et cinq cents
 * élèves importés sans leur classe. Le rapport le montre AVANT d'écrire.
 */
export async function analyserFichierEleves(donnees: FormData): Promise<ResultatImport> {
  try {
    await requirePermission("eleve:inscrire");

    const fichier = donnees.get("fichier");
    if (!(fichier instanceof File) || fichier.size === 0) {
      return { ok: false, message: "Aucun fichier reçu." };
    }
    // Cinq cents élèves tiennent largement sous cette limite ; au-delà, c'est
    // un fichier qui n'a rien à faire ici.
    if (fichier.size > 5 * 1024 * 1024) {
      return { ok: false, message: "Fichier trop volumineux (5 Mo maximum)." };
    }

    const feuille = await lireFeuille(fichier);
    if (feuille.lignes.length === 0) {
      return { ok: false, message: "Le fichier ne contient aucune ligne de données." };
    }

    const rapport = await analyserEleves(feuille, await classesOuvertes());
    return { ok: true, rapport };
  } catch (erreur) {
    return echec(erreur, "La lecture du fichier a échoué.");
  }
}

/**
 * Importe réellement les élèves d'un fichier déjà analysé.
 *
 * Le fichier est RELU et RÉANALYSÉ plutôt que de faire confiance à un rapport
 * transmis par le navigateur : entre l'aperçu et la confirmation, le contenu
 * envoyé pourrait être tout autre. On ne se fie jamais à ce que le client
 * affirme avoir validé.
 *
 * Chaque élève est inscrit dans SA PROPRE transaction. Le choix mérite d'être
 * expliqué : une transaction unique sur cinq cents élèves ferait tout échouer
 * pour un seul refus de capacité de classe, et le secrétariat n'aurait aucun
 * moyen de savoir lesquels étaient bons. Ici, ce qui passe est acquis, ce qui
 * échoue est nommé ligne à ligne.
 */
export async function importerEleves(donnees: FormData): Promise<ResultatImport> {
  try {
    const acteur = await requirePermission("eleve:inscrire");

    const fichier = donnees.get("fichier");
    if (!(fichier instanceof File) || fichier.size === 0) {
      return { ok: false, message: "Aucun fichier reçu." };
    }

    const feuille = await lireFeuille(fichier);
    const rapport = await analyserEleves(feuille, await classesOuvertes());

    if (rapport.colonnesManquantes.length > 0) {
      return { ok: false, message: `Colonnes absentes : ${rapport.colonnesManquantes.join(", ")}.`, rapport };
    }
    if (rapport.valides.length === 0) {
      return { ok: false, message: "Aucune ligne exploitable dans ce fichier.", rapport };
    }

    const [annee] = await db
      .select({ id: anneesScolaires.id, libelle: anneesScolaires.libelle })
      .from(anneesScolaires)
      .where(eq(anneesScolaires.estCourante, true));
    if (!annee) return { ok: false, message: "Aucune année scolaire courante." };

    // Même source de numérotation que l'inscription au guichet : la fonction
    // verrouille sa ligne de séquence, donc deux imports simultanés ne
    // produisent pas deux fois le même matricule.
    const anneeCivile = Number(String(annee.libelle).slice(0, 4)) || new Date().getFullYear();

    let inscrits = 0;
    const refus: typeof rapport.erreurs = [];

    for (const e of rapport.valides) {
      try {
        await db.transaction(async (tx) => {
          // Le matricule est produit par la base — une séquence par année —
          // plutôt que calculé ici : deux imports simultanés produiraient
          // sinon deux fois le même.
          const matricule = (
            await tx.execute<{ v: string }>(
              sql`SELECT prochain_numero('MATRICULE', ${anneeCivile}::smallint) AS v`,
            )
          ).rows[0]!.v;
          const numeroInscription = (
            await tx.execute<{ v: string }>(
              sql`SELECT prochain_numero('INSCRIPTION', ${anneeCivile}::smallint) AS v`,
            )
          ).rows[0]!.v;

          const eleve = await tx.execute<{ id: string }>(sql`
            INSERT INTO eleves (
              matricule, nom, prenom, sexe, date_naissance, lieu_naissance, nationalite,
              acte_naissance_numero, adresse, quartier, ecole_origine, statut,
              date_premiere_inscription
            ) VALUES (
              ${matricule}, ${e.nom}, ${e.prenom}, ${e.sexe}::sexe_type, ${e.dateNaissance}::date,
              ${e.lieuNaissance}, ${e.nationalite}, ${e.acteNaissanceNumero},
              ${e.adresse}, ${e.quartier}, ${e.ecoleOrigine}, 'INSCRIT'::statut_eleve,
              CURRENT_DATE
            ) RETURNING id
          `);
          const eleveId = eleve.rows[0]!.id;

          await tx.execute(sql`
            INSERT INTO inscriptions (
              eleve_id, annee_id, classe_id, numero_inscription, type,
              est_redoublant, est_boursier, active
            ) VALUES (
              ${eleveId}::uuid, ${annee.id}::uuid, ${e.classeId}::uuid, ${numeroInscription},
              'INSCRIPTION'::type_inscription, ${e.estRedoublant}, ${e.estBoursier}, TRUE
            )
          `);

          // Un tuteur déjà connu par son numéro est RÉUTILISÉ, jamais dupliqué :
          // une fratrie de trois enfants ne doit pas créer trois fois le même
          // parent, sinon il recevra tout en triple.
          //
          // `telephone` ne porte PAS de contrainte d'unicité : on cherche donc
          // avant d'insérer, plutôt que de compter sur un ON CONFLICT qui
          // échouerait.
          const numero = normaliserNumero(e.tuteurTelephone);
          const existant = await tx.execute<{ id: string }>(
            sql`SELECT id FROM tuteurs WHERE telephone = ${numero} LIMIT 1`,
          );
          const tuteurId =
            existant.rows[0]?.id ??
            (
              await tx.execute<{ id: string }>(sql`
                INSERT INTO tuteurs (nom, prenom, telephone, accepte_sms)
                VALUES (${e.tuteurNom}, ${e.tuteurPrenom}, ${numero}, TRUE)
                RETURNING id
              `)
            ).rows[0]!.id;

          await tx.execute(sql`
            INSERT INTO eleve_tuteur (
              eleve_id, tuteur_id, lien, est_principal,
              est_tuteur_legal, est_responsable_financier, est_contact_urgence, autorise_retrait
            ) VALUES (
              ${eleveId}::uuid, ${tuteurId}::uuid, ${e.tuteurLien}::lien_parente,
              TRUE, TRUE, TRUE, TRUE, TRUE
            )
            ON CONFLICT (eleve_id, tuteur_id) DO NOTHING
          `);
        });
        inscrits += 1;
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
      action: "eleves.importes",
      entite: "eleves",
      apres: {
        fichier: fichier.name,
        lignes: feuille.lignes.length,
        inscrits,
        refuses: refus.length,
        deja_presents: rapport.dejaInscrits.length,
      },
    });

    revalidatePath("/dashboard/eleves");

    return {
      ok: true,
      inscrits,
      rapport: { ...rapport, erreurs: [...rapport.erreurs, ...refus] },
      message:
        refus.length === 0
          ? `${inscrits} élève(s) inscrit(s).`
          : `${inscrits} élève(s) inscrit(s), ${refus.length} refusé(s).`,
    };
  } catch (erreur) {
    return echec(erreur, "L'import a échoué.");
  }
}
