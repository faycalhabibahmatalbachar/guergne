"use server";

import { createHash, randomInt } from "node:crypto";

import { revalidatePath } from "next/cache";

import { hash } from "@node-rs/argon2";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { codesActivation, tuteurs, utilisateurs } from "@/server/db/schema";
import { telephoneDisponible } from "@/server/domain/parents";
import { ErreurAutorisation, requirePermission } from "@/server/guard";
import { normaliserNumero } from "@/server/notifications/sms";

/**
 * Création complète d'un compte parent.
 *
 * Séparé de `actions.ts` : ce fichier porte la création en une passe (état
 * civil, rattachements aux enfants, accès), là où `actions.ts` gère le cycle
 * de vie d'un tuteur déjà enregistré.
 */

export interface ResultatCreation {
  ok: boolean;
  message?: string;
  erreurs?: Record<string, string>;
  tuteurId?: string;
  /** Affichés une seule fois, jamais relisibles ensuite. */
  motDePasse?: string;
  code?: string;
}

const DUREE_CODE_MINUTES = 60 * 24 * 7;
const empreinte = (v: string) => createHash("sha256").update(v).digest("hex");

function echec(e: unknown, defaut: string): ResultatCreation {
  if (e instanceof ErreurAutorisation) {
    return { ok: false, message: "Vous n'avez pas les droits pour cette opération." };
  }
  const m = e instanceof Error ? e.message : "";
  if (m.includes("duplicate key") || m.includes("23505")) {
    return { ok: false, message: "Ce numéro est déjà rattaché à un compte." };
  }
  console.error("[parents:creation]", e);
  return { ok: false, message: defaut };
}

const LIENS = [
  "PERE", "MERE", "TUTEUR", "ONCLE", "TANTE", "GRAND_PARENT", "FRERE_SOEUR", "AUTRE",
] as const;

const schema = z.object({
  nom: z.string().trim().min(2, "Nom requis").toUpperCase(),
  prenom: z.string().trim().min(2, "Prénom requis"),
  sexe: z.enum(["M", "F"]).nullable().optional(),
  telephone: z.string().trim().regex(/^\+?[0-9\s.-]{8,20}$/, "Numéro invalide"),
  telephoneSecondaire: z.string().trim().optional(),
  email: z.string().trim().email("Adresse invalide").optional().or(z.literal("")),
  profession: z.string().trim().optional(),
  employeur: z.string().trim().optional(),
  adresse: z.string().trim().optional(),
  quartier: z.string().trim().optional(),
  pieceIdentite: z.string().trim().optional(),
  enfants: z
    .array(
      z.object({
        eleveId: z.string().uuid(),
        lien: z.enum(LIENS),
        estPrincipal: z.boolean().default(false),
        estTuteurLegal: z.boolean().default(false),
        estResponsableFinancier: z.boolean().default(false),
        estContactUrgence: z.boolean().default(false),
        autoriseRetrait: z.boolean().default(true),
      }),
    )
    .default([]),
  accepteSms: z.boolean().default(true),
  creerAcces: z.boolean().default(true),
});

/**
 * Mot de passe généré, lisible et transmissible oralement.
 *
 * Le format « Mot-Mot-1234 » reste mémorisable, ce qui évite qu'il finisse
 * noté sur un papier collé au téléphone. Les chiffres viennent de `randomInt`
 * du module crypto, non de `Math.random` : un mot de passe prédictible
 * ouvrirait l'accès au dossier scolaire d'un enfant.
 */
function genererMotDePasse(): string {
  const mots = [
    "Sahel", "Chari", "Ennedi", "Tibesti", "Kanem", "Guera", "Salamat",
    "Baguirmi", "Ouaddai", "Logone", "Mayo", "Batha", "Borkou", "Sila",
  ];
  return `${mots[randomInt(mots.length)]}-${mots[randomInt(mots.length)]}-${randomInt(1000, 10000)}`;
}

const genererCode = () => String(randomInt(100_000, 1_000_000));

/**
 * Crée le tuteur, son compte et ses rattachements en une seule transaction.
 *
 * Deux voies d'accès coexistent volontairement :
 *   - le MOT DE PASSE, pour se connecter depuis un navigateur — au guichet ou
 *     depuis un cybercafé ;
 *   - le CODE par SMS, pour activer l'application mobile.
 * Un parent tchadien peut n'avoir accès qu'à l'un des deux selon le moment.
 *
 * Les deux sont retournés UNE SEULE FOIS. Le mot de passe est stocké en
 * Argon2id, le code en SHA-256 : ni l'un ni l'autre n'est relisible ensuite,
 * pas même par un administrateur.
 */
export async function creerCompteParent(donnees: unknown): Promise<ResultatCreation> {
  try {
    const acteur = await requirePermission("tuteur:gerer");
    const analyse = schema.safeParse(donnees);

    if (!analyse.success) {
      const erreurs: Record<string, string> = {};
      for (const p of analyse.error.issues) {
        const champ = String(p.path.join("."));
        if (!erreurs[champ]) erreurs[champ] = p.message;
      }
      return { ok: false, erreurs };
    }

    const v = analyse.data;
    const numero = normaliserNumero(v.telephone);

    if (v.creerAcces && !(await telephoneDisponible(numero))) {
      return { ok: false, erreurs: { telephone: "Ce numéro est déjà rattaché à un compte parent." } };
    }

    const motDePasse = v.creerAcces ? genererMotDePasse() : null;
    const code = v.creerAcces ? genererCode() : null;

    const tuteurId = await db.transaction(async (tx) => {
      let utilisateurId: string | null = null;

      if (motDePasse) {
        const empreinteMdp = await hash(motDePasse, {
          algorithm: 2, // Argon2id, paramètres OWASP
          memoryCost: 19456,
          timeCost: 2,
          parallelism: 1,
        });

        const [compte] = await tx
          .insert(utilisateurs)
          .values({
            telephone: numero,
            email: v.email || null,
            motDePasseHash: empreinteMdp,
            role: "PARENT",
            nom: v.nom,
            prenom: v.prenom,
            // Ce mot de passe a transité par un SMS et une feuille de papier :
            // le parent doit en choisir un autre dès sa première connexion.
            doitChangerMdp: true,
          })
          .returning({ id: utilisateurs.id });

        utilisateurId = compte.id;
      }

      const [tuteur] = await tx
        .insert(tuteurs)
        .values({
          utilisateurId,
          nom: v.nom,
          prenom: v.prenom,
          sexe: v.sexe ?? null,
          telephone: numero,
          telephoneSecondaire: v.telephoneSecondaire || null,
          email: v.email || null,
          profession: v.profession || null,
          employeur: v.employeur || null,
          adresse: v.adresse || null,
          quartier: v.quartier || null,
          pieceIdentite: v.pieceIdentite || null,
          accepteSms: v.accepteSms,
        })
        .returning({ id: tuteurs.id });

      for (const enfant of v.enfants) {
        // Un seul tuteur principal par élève : on bascule l'ancien avant
        // d'insérer, sinon l'index unique partiel refuse l'écriture.
        if (enfant.estPrincipal) {
          await tx.execute(sql`
            UPDATE eleve_tuteur SET est_principal = FALSE
             WHERE eleve_id = ${enfant.eleveId}::uuid AND est_principal
          `);
        }

        await tx.execute(sql`
          INSERT INTO eleve_tuteur
            (eleve_id, tuteur_id, lien, est_principal, est_tuteur_legal,
             est_responsable_financier, est_contact_urgence, autorise_retrait)
          VALUES (
            ${enfant.eleveId}::uuid, ${tuteur.id}::uuid, ${enfant.lien}::lien_parente,
            ${enfant.estPrincipal}, ${enfant.estTuteurLegal},
            ${enfant.estResponsableFinancier}, ${enfant.estContactUrgence},
            ${enfant.autoriseRetrait}
          )
          ON CONFLICT (eleve_id, tuteur_id) DO NOTHING
        `);
      }

      if (code) {
        await tx.insert(codesActivation).values({
          telephone: numero,
          codeHash: empreinte(code),
          expireLe: new Date(Date.now() + DUREE_CODE_MINUTES * 60_000).toISOString(),
        });

        if (v.accepteSms) {
          await tx.execute(sql`
            INSERT INTO notifications (telephone, type, canal, titre, corps)
            VALUES (
              ${numero},
              'AUTRE'::type_notification,
              'SMS'::canal_notification,
              ${"Votre compte a ete cree"},
              ${`Code d'activation : ${code}. Mot de passe provisoire : ${motDePasse}. A changer a la premiere connexion.`}
            )
          `);
        }
      }

      return tuteur.id;
    });

    await journaliser(acteur, {
      action: "tuteur.compte_cree",
      entite: "tuteurs",
      entiteId: tuteurId,
      apres: {
        nom: `${v.prenom} ${v.nom}`,
        telephone: numero,
        nbEnfants: v.enfants.length,
        accesCree: v.creerAcces,
      },
    });

    revalidatePath("/dashboard/parents");

    return {
      ok: true,
      tuteurId,
      motDePasse: motDePasse ?? undefined,
      code: code ?? undefined,
      message: v.creerAcces
        ? "Compte créé. Notez le mot de passe et le code : ils ne seront plus affichés."
        : "Tuteur enregistré, sans accès à l'application.",
    };
  } catch (e) {
    return echec(e, "La création du compte a échoué.");
  }
}

/** Recherche d'élèves pour le rattachement, avec leur classe. */
export async function rechercherEleves(terme: string): Promise<
  Array<{ id: string; nom: string; prenom: string; matricule: string; classe: string }>
> {
  try {
    await requirePermission("tuteur:gerer");
    const recherche = terme.trim();
    if (recherche.length < 2) return [];

    const r = await db.execute<{
      id: string;
      nom: string;
      prenom: string;
      matricule: string;
      classe: string;
    }>(sql`
      SELECT e.id, e.nom, e.prenom, e.matricule, COALESCE(c.libelle, '—') AS classe
        FROM eleves e
        LEFT JOIN inscriptions i ON i.eleve_id = e.id AND i.active
        LEFT JOIN classes c ON c.id = i.classe_id
       WHERE e.nom ILIKE ${`%${recherche}%`}
          OR e.prenom ILIKE ${`%${recherche}%`}
          OR e.matricule ILIKE ${`%${recherche}%`}
       ORDER BY e.nom, e.prenom
       LIMIT 20
    `);

    return r.rows;
  } catch {
    return [];
  }
}
