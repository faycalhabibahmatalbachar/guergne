"use server";

import { revalidatePath } from "next/cache";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { ErreurAutorisation, requirePermission } from "@/server/guard";

/**
 * Réinscription pour l'année suivante (E-36).
 *
 * CE QUI PREND DU TEMPS À LA RENTRÉE N'EST PAS LA SAISIE, C'EST LA DÉCISION
 * ---------------------------------------------------------------------------
 * Réinscrire six cents élèves un par un dans le formulaire d'inscription
 * complet — état civil, tuteurs, pièces — alors que rien n'a changé sauf la
 * classe, c'est trois semaines de guichet. L'information réellement nouvelle
 * tient en un champ : dans quelle classe il passe.
 *
 * LA DÉCISION DU CONSEIL PROPOSE, ELLE N'IMPOSE PAS
 * --------------------------------------------------
 * ADMIS mène au niveau suivant, REDOUBLE au même. Mais une famille peut
 * demander un redoublement volontaire, et un élève admis sous condition peut
 * être orienté ailleurs. La classe reste donc choisie à la main, la
 * proposition affichée à côté.
 *
 * L'ÉCHÉANCIER N'EST PAS CRÉÉ ICI
 * -------------------------------
 * Il dépend de la grille tarifaire de la nouvelle année, qui n'est pas
 * forcément votée au moment où l'on réinscrit. Le générer avec les tarifs de
 * l'année écoulée produirait des montants faux que personne ne penserait à
 * vérifier — et qui apparaîtraient aux familles dans l'application. La
 * génération reste groupée, depuis le module Finances.
 */

export interface ResultatReinscription {
  ok: boolean;
  message?: string;
}

export interface PropositionReinscription {
  possible: boolean;
  raison?: string;
  anneeSuivanteId?: string;
  anneeSuivanteLibelle?: string;
  decision?: string | null;
  niveauActuel?: string;
  niveauProposeId?: string;
  niveauProposeLibelle?: string;
  redoublementPropose?: boolean;
  classes?: Array<{ id: string; libelle: string; niveauId: string; places: number }>;
}

export async function preparerReinscription(eleveId: string): Promise<PropositionReinscription> {
  await requirePermission("eleve:creer");

  const r = await db.execute<{
    inscription_id: string;
    niveau_id: string;
    niveau_libelle: string;
    niveau_suivant_id: string | null;
    niveau_suivant_libelle: string | null;
    decision: string | null;
    annee_suivante_id: string | null;
    annee_suivante_libelle: string | null;
    deja: boolean;
  }>(sql`
    SELECT i.id AS inscription_id,
           n.id AS niveau_id,
           n.libelle AS niveau_libelle,
           n.niveau_suivant_id,
           ns.libelle AS niveau_suivant_libelle,
           -- La décision de fin d'année, prise sur le bulletin de la dernière
           -- période renseignée. On lit le bulletin plutôt que la synthèse
           -- annuelle : c'est lui que le conseil remplit, l'autre étant
           -- produite plus tard et souvent absente.
           (SELECT b.decision::text
              FROM bulletins b
              JOIN periodes p ON p.id = b.periode_id
             WHERE b.inscription_id = i.id AND b.decision IS NOT NULL
             ORDER BY p.numero DESC LIMIT 1) AS decision,
           suiv.id AS annee_suivante_id,
           suiv.libelle AS annee_suivante_libelle,
           EXISTS (
             SELECT 1 FROM inscriptions i2
              WHERE i2.eleve_id = i.eleve_id AND i2.annee_id = suiv.id
           ) AS deja
      FROM inscriptions i
      JOIN annees_scolaires a ON a.id = i.annee_id
      JOIN classes c ON c.id = i.classe_id
      JOIN niveaux n ON n.id = c.niveau_id
      LEFT JOIN niveaux ns ON ns.id = n.niveau_suivant_id
      -- L'année suivante est la prochaine par date de début, pas « l'année + 1 »
      -- déduite du libellé : un établissement peut sauter une année, et le
      -- libellé est du texte libre.
      LEFT JOIN LATERAL (
        SELECT a2.id, a2.libelle
          FROM annees_scolaires a2
         WHERE a2.date_debut > a.date_debut
         ORDER BY a2.date_debut
         LIMIT 1
      ) suiv ON TRUE
     WHERE i.eleve_id = ${eleveId}::uuid
       AND i.active
     ORDER BY a.date_debut DESC
     LIMIT 1
  `);

  const x = r.rows[0];
  if (!x) return { possible: false, raison: "Cet élève n'a aucune inscription active." };
  if (!x.annee_suivante_id) {
    return {
      possible: false,
      raison: "Aucune année scolaire suivante n'existe. Créez-la d'abord dans les paramètres.",
    };
  }
  if (x.deja) {
    return {
      possible: false,
      raison: `Cet élève est déjà inscrit pour ${x.annee_suivante_libelle}.`,
      anneeSuivanteLibelle: x.annee_suivante_libelle ?? undefined,
    };
  }

  const redouble = x.decision === "REDOUBLE";
  const niveauCible = redouble ? x.niveau_id : (x.niveau_suivant_id ?? x.niveau_id);

  const classes = await db.execute<{
    id: string;
    libelle: string;
    niveau_id: string;
    places: number;
  }>(sql`
    SELECT c.id, c.libelle, c.niveau_id,
           (c.capacite_max - (SELECT count(*) FROM inscriptions i
                               WHERE i.classe_id = c.id AND i.active))::int AS places
      FROM classes c
     WHERE c.annee_id = ${x.annee_suivante_id}::uuid
       AND c.active
     ORDER BY c.libelle
  `);

  return {
    possible: true,
    anneeSuivanteId: x.annee_suivante_id,
    anneeSuivanteLibelle: x.annee_suivante_libelle ?? undefined,
    decision: x.decision,
    niveauActuel: x.niveau_libelle,
    niveauProposeId: niveauCible,
    niveauProposeLibelle: redouble
      ? x.niveau_libelle
      : (x.niveau_suivant_libelle ?? x.niveau_libelle),
    redoublementPropose: redouble,
    classes: classes.rows.map((c) => ({
      id: c.id,
      libelle: c.libelle,
      niveauId: c.niveau_id,
      places: Number(c.places),
    })),
  };
}

const schema = z.object({
  eleveId: z.string().uuid(),
  anneeId: z.string().uuid(),
  classeId: z.string().uuid(),
  estRedoublant: z.boolean().default(false),
  estBoursier: z.boolean().default(false),
});

export async function reinscrire(donnees: unknown): Promise<ResultatReinscription> {
  try {
    const acteur = await requirePermission("eleve:creer");

    const a = schema.safeParse(donnees);
    if (!a.success) return { ok: false, message: "Requête invalide." };
    const v = a.data;

    // La contrainte UNIQUE (eleve_id, annee_id) protège du doublon ; on la
    // laisse parler plutôt que de recompter avant, sinon deux guichets
    // simultanés passeraient tous deux la vérification.
    const r = await db.execute<{ id: string }>(sql`
      INSERT INTO inscriptions
        (eleve_id, annee_id, classe_id, type, est_redoublant, est_boursier)
      VALUES (${v.eleveId}::uuid, ${v.anneeId}::uuid, ${v.classeId}::uuid,
              'REINSCRIPTION'::type_inscription, ${v.estRedoublant}, ${v.estBoursier})
      RETURNING id
    `);

    await journaliser(acteur, {
      action: "eleve.reinscrit",
      entite: "inscriptions",
      entiteId: r.rows[0]?.id,
      eleveId: v.eleveId,
      apres: { anneeId: v.anneeId, classeId: v.classeId, redoublant: v.estRedoublant },
    });

    revalidatePath(`/dashboard/eleves/${v.eleveId}`);
    revalidatePath("/dashboard/eleves");

    return {
      ok: true,
      message:
        "Réinscription enregistrée. L'échéancier reste à générer depuis Finances, une fois la grille tarifaire de la nouvelle année arrêtée.",
    };
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return { ok: false, message: "Vous n'avez pas les droits pour inscrire un élève." };
    }
    const message = erreur instanceof Error ? erreur.message : "";
    if (message.includes("eleve_id") && message.includes("annee_id")) {
      return { ok: false, message: "Cet élève est déjà inscrit pour cette année." };
    }
    if (message.includes("ERROR:")) {
      return { ok: false, message: message.replace(/^.*?ERROR:\s*/i, "").slice(0, 200) };
    }
    console.error("[reinscription]", erreur);
    return { ok: false, message: "La réinscription a échoué." };
  }
}
