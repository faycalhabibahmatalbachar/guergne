"use server";

import { revalidatePath } from "next/cache";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { hacherMotDePasse } from "@/server/auth/mot-de-passe";
import { db } from "@/server/db";
import { ErreurAutorisation, peut, requirePermission } from "@/server/guard";

type Resultat = { ok: boolean; message?: string; id?: string; erreurs?: Record<string, string>; motDePasse?: string };

const ficheSchema = z.object({
  categorie: z.enum(["ADMINISTRATIF", "TECHNIQUE"]),
  matricule: z.string().trim().min(2, "Matricule requis").max(32).toUpperCase(),
  nom: z.string().trim().min(2, "Nom requis").max(100).toUpperCase(),
  prenom: z.string().trim().min(2, "Prénom requis").max(100),
  fonction: z.string().trim().min(2, "Fonction requise").max(120),
  service: z.string().trim().max(120).optional().default(""),
  telephone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s.-]{8,20}$/, "Numéro invalide")
    .optional()
    .or(z.literal("")),
  email: z.string().trim().email("Adresse invalide").optional().or(z.literal("")),
  adresse: z.string().trim().max(240).optional().default(""),
  dateEmbauche: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  typeContrat: z.string().trim().max(100).optional().default(""),
  observations: z.string().trim().max(1000).optional().default(""),
});
type Fiche = z.infer<typeof ficheSchema>;
const uuid = z.string().uuid();

function erreurMessage(e: unknown, defaut: string): string {
  if (e instanceof ErreurAutorisation) return "Vous n'avez pas les permissions requises.";
  const m = e instanceof Error ? e.message : "";
  if (m.includes("personnels_non_enseignants_matricule_key") || m.includes("23505"))
    return "Matricule, numéro ou adresse e-mail déjà utilisé.";
  console.error("[personnel-non-enseignant]", e);
  return defaut;
}
function erreursChamps(e: z.ZodError) {
  const d: Record<string, string> = {};
  for (const i of e.issues) {
    const champ = String(i.path[0] ?? "_");
    if (!d[champ]) d[champ] = i.message;
  }
  return d;
}
const nn = (x: string | undefined) => x?.trim() || null;
function actualiser() {
  revalidatePath("/dashboard/personnel");
  revalidatePath("/dashboard/default");
}

export async function creerPersonnelNonEnseignant(donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("utilisateur:creer");
    const r = ficheSchema.safeParse(donnees);
    if (!r.success) return { ok: false, erreurs: erreursChamps(r.error), message: "Certains champs sont invalides." };
    const v = r.data;
    const q = await db.execute<{ id: string }>(sql`
      INSERT INTO personnels_non_enseignants
        (categorie, matricule, nom, prenom, fonction, service, telephone, email,
         adresse, date_embauche, type_contrat, observations)
      VALUES (${v.categorie},${v.matricule},${v.nom},${v.prenom},${v.fonction},
        ${nn(v.service)},${nn(v.telephone)},${nn(v.email)},${nn(v.adresse)},
        ${nn(v.dateEmbauche)}::date,${nn(v.typeContrat)},${nn(v.observations)})
      RETURNING id`);
    const id = q.rows[0]?.id;
    if (!id) return { ok: false, message: "La création n'a pas été confirmée." };
    await journaliser(acteur, {
      action: "personnel.cree",
      entite: "personnels_non_enseignants",
      entiteId: id,
      apres: { categorie: v.categorie, matricule: v.matricule, fonction: v.fonction },
    });
    actualiser();
    return { ok: true, id, message: "Dossier créé." };
  } catch (e) {
    return { ok: false, message: erreurMessage(e, "Impossible de créer le dossier.") };
  }
}

export async function modifierPersonnelNonEnseignant(id: string, donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("utilisateur:creer");
    if (!uuid.safeParse(id).success) return { ok: false, message: "Identifiant invalide." };
    const r = ficheSchema.safeParse(donnees);
    if (!r.success) return { ok: false, erreurs: erreursChamps(r.error), message: "Certains champs sont invalides." };
    const v = r.data;
    const rows = await db.execute<{
      categorie: string;
      utilisateur_id: string | null;
      matricule: string;
      role_compte: string | null;
    }>(sql`
      SELECT p.categorie, p.utilisateur_id, p.matricule, u.role::text AS role_compte
      FROM personnels_non_enseignants p LEFT JOIN utilisateurs u ON u.id=p.utilisateur_id
      WHERE p.id=${id}::uuid`);
    const existant = rows.rows[0];
    if (!existant) return { ok: false, message: "Dossier introuvable." };
    if (existant.categorie !== v.categorie)
      return { ok: false, message: "Le changement de catégorie nécessite une procédure dédiée." };
    if (["DIRECTION", "CENSEUR"].includes(existant.role_compte ?? "") && !(await peut(acteur, "permission:gerer")))
      return { ok: false, message: "Vous ne pouvez pas modifier le dossier d'un compte privilégié." };
    if (existant.utilisateur_id && !nn(v.telephone) && !nn(v.email))
      return { ok: false, message: "Le compte nécessite un numéro de téléphone ou un e-mail." };
    await db.transaction(async (tx) => {
      await tx.execute(sql`UPDATE personnels_non_enseignants SET
        matricule=${v.matricule}, nom=${v.nom}, prenom=${v.prenom},
        fonction=${v.fonction}, service=${nn(v.service)}, telephone=${nn(v.telephone)},
        email=${nn(v.email)}, adresse=${nn(v.adresse)}, date_embauche=${nn(v.dateEmbauche)}::date,
        type_contrat=${nn(v.typeContrat)}, observations=${nn(v.observations)}, modifie_le=now()
        WHERE id=${id}::uuid`);
      if (existant.utilisateur_id) {
        await tx.execute(sql`UPDATE utilisateurs SET nom=${v.nom},prenom=${v.prenom},
          telephone=${nn(v.telephone)},email=${nn(v.email)},modifie_le=now()
          WHERE id=${existant.utilisateur_id}::uuid`);
      }
    });
    await journaliser(acteur, {
      action: "personnel.modifie",
      entite: "personnels_non_enseignants",
      entiteId: id,
      avant: { matricule: existant.matricule },
      apres: { matricule: v.matricule, fonction: v.fonction },
    });
    actualiser();
    return { ok: true, message: "Dossier actualisé." };
  } catch (e) {
    return { ok: false, message: erreurMessage(e, "La modification a échoué.") };
  }
}

export async function basculerPersonnelNonEnseignant(id: string, actif: boolean): Promise<Resultat> {
  try {
    const acteur = await requirePermission("utilisateur:desactiver");
    if (!uuid.safeParse(id).success) return { ok: false, message: "Identifiant invalide." };
    const r = await db.execute<{ utilisateur_id: string | null; role_compte: string | null }>(sql`
      SELECT p.utilisateur_id, u.role::text AS role_compte FROM personnels_non_enseignants p
      LEFT JOIN utilisateurs u ON u.id=p.utilisateur_id WHERE p.id=${id}::uuid`);
    if (!r.rows[0]) return { ok: false, message: "Dossier introuvable." };
    if (["DIRECTION", "CENSEUR"].includes(r.rows[0].role_compte ?? "") && !(await peut(acteur, "permission:gerer")))
      return { ok: false, message: "Seul un administrateur habilité peut désactiver ce dossier." };
    const uid = r.rows[0].utilisateur_id;
    if (uid === acteur.id && !actif)
      return { ok: false, message: "Vous ne pouvez pas désactiver votre propre dossier." };
    await db.transaction(async (tx) => {
      await tx.execute(sql`UPDATE personnels_non_enseignants SET actif=${actif},modifie_le=now() WHERE id=${id}::uuid`);
      if (uid && !actif) {
        await tx.execute(sql`UPDATE utilisateurs SET actif=FALSE,modifie_le=now() WHERE id=${uid}::uuid`);
        await tx.execute(sql`DELETE FROM sessions WHERE utilisateur_id=${uid}::uuid`);
      }
    });
    await journaliser(acteur, {
      action: actif ? "personnel.reactive" : "personnel.desactive",
      entite: "personnels_non_enseignants",
      entiteId: id,
    });
    actualiser();
    return {
      ok: true,
      message: actif
        ? "Dossier réactivé. L'accès au portail reste à contrôler."
        : "Dossier désactivé ; sessions clôturées.",
    };
  } catch (e) {
    return { ok: false, message: erreurMessage(e, "Opération impossible.") };
  }
}

const ROLES_ADMIN = ["SURVEILLANT", "SECRETARIAT", "COMPTABLE", "CENSEUR", "DIRECTION"] as const;
const roleSchema = z.enum(ROLES_ADMIN);
function motDePasseProvisoire(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const octets = new Uint32Array(12);
  crypto.getRandomValues(octets);
  return [...octets].map((x) => alphabet[x % alphabet.length]).join("");
}
export async function creerComptePersonnel(id: string, role: string): Promise<Resultat> {
  try {
    const acteur = await requirePermission("utilisateur:creer");
    if (!uuid.safeParse(id).success || !roleSchema.safeParse(role).success)
      return { ok: false, message: "Données invalides." };
    if (["DIRECTION", "CENSEUR"].includes(role) && !(await peut(acteur, "permission:gerer")))
      return { ok: false, message: "Seul un administrateur habilité peut attribuer ce rôle." };
    const q = await db.execute<{
      categorie: string;
      actif: boolean;
      utilisateur_id: string | null;
      nom: string;
      prenom: string;
      telephone: string | null;
      email: string | null;
    }>(sql`
      SELECT categorie,actif,utilisateur_id,nom,prenom,telephone,email
      FROM personnels_non_enseignants WHERE id=${id}::uuid`);
    const e = q.rows[0];
    if (!e) return { ok: false, message: "Dossier introuvable." };
    if (e.categorie !== "ADMINISTRATIF")
      return {
        ok: false,
        message: "Aucun rôle technique à privilèges n'est attribuable. Le dossier technique reste sans compte.",
      };
    if (!e.actif) return { ok: false, message: "Réactivez le dossier avant d'ouvrir un accès." };
    if (e.utilisateur_id) return { ok: false, message: "Ce personnel possède déjà un compte." };
    if (!e.telephone && !e.email) return { ok: false, message: "Renseignez un téléphone ou un e-mail dans la fiche." };
    const secret = motDePasseProvisoire();
    const empreinte = await hacherMotDePasse(secret);
    let uid = "";
    await db.transaction(async (tx) => {
      const verrou = await tx.execute<{ utilisateur_id: string | null }>(sql`
        SELECT utilisateur_id FROM personnels_non_enseignants WHERE id=${id}::uuid FOR UPDATE`);
      if (!verrou.rows[0] || verrou.rows[0].utilisateur_id) throw Error("COMPTE_EXISTANT");
      const compte = await tx.execute<{ id: string }>(sql`
        INSERT INTO utilisateurs(email,telephone,mot_de_passe_hash,role,nom,prenom,doit_changer_mdp)
        VALUES (${e.email},${e.telephone},${empreinte},${role}::role_utilisateur,${e.nom},${e.prenom},TRUE)
        RETURNING id`);
      uid = compte.rows[0].id;
      await tx.execute(
        sql`UPDATE personnels_non_enseignants SET utilisateur_id=${uid}::uuid,modifie_le=now() WHERE id=${id}::uuid`,
      );
    });
    await journaliser(acteur, {
      action: "utilisateur.cree",
      entite: "utilisateurs",
      entiteId: uid,
      apres: { personnelId: id, role },
    });
    actualiser();
    return {
      ok: true,
      motDePasse: secret,
      message: "Compte créé. Le mot de passe doit être transmis confidentiellement.",
    };
  } catch (e) {
    if (e instanceof Error && e.message === "COMPTE_EXISTANT") return { ok: false, message: "Un compte existe déjà." };
    return { ok: false, message: erreurMessage(e, "Impossible de créer le compte.") };
  }
}

export async function gererComptePersonnel(
  id: string,
  operation: "REINITIALISER" | "DESACTIVER" | "REACTIVER",
): Promise<Resultat> {
  try {
    const acteur = await requirePermission(
      operation === "REINITIALISER" ? "utilisateur:creer" : "utilisateur:desactiver",
    );
    if (!uuid.safeParse(id).success) return { ok: false, message: "Identifiant invalide." };
    const q = await db.execute<{
      utilisateur_id: string | null;
      actif: boolean;
      categorie: string;
      role_compte: string | null;
    }>(sql`
     SELECT p.utilisateur_id,p.actif,p.categorie,u.role::text AS role_compte
     FROM personnels_non_enseignants p LEFT JOIN utilisateurs u ON u.id=p.utilisateur_id
     WHERE p.id=${id}::uuid`);
    const p = q.rows[0];
    if (!p?.utilisateur_id || p.categorie !== "ADMINISTRATIF")
      return { ok: false, message: "Compte administratif introuvable." };
    if (["DIRECTION", "CENSEUR"].includes(p.role_compte ?? "") && !(await peut(acteur, "permission:gerer")))
      return { ok: false, message: "Vous ne pouvez pas gérer un compte de direction." };
    if (p.utilisateur_id === acteur.id && operation !== "REINITIALISER")
      return { ok: false, message: "Vous ne pouvez pas désactiver votre propre compte." };
    if (operation === "REACTIVER" && !p.actif)
      return { ok: false, message: "Réactivez d'abord le dossier du personnel." };
    let secret: string | undefined;
    if (operation === "REINITIALISER") {
      secret = motDePasseProvisoire();
      const empreinte = await hacherMotDePasse(secret);
      await db.transaction(async (tx) => {
        await tx.execute(sql`UPDATE utilisateurs SET mot_de_passe_hash=${empreinte},
         doit_changer_mdp=TRUE,tentatives_echouees=0,verrouille_jusqua=NULL,modifie_le=now()
         WHERE id=${p.utilisateur_id}::uuid`);
        await tx.execute(sql`DELETE FROM sessions WHERE utilisateur_id=${p.utilisateur_id}::uuid`);
      });
    } else {
      const activer = operation === "REACTIVER";
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`UPDATE utilisateurs SET actif=${activer},modifie_le=now() WHERE id=${p.utilisateur_id}::uuid`,
        );
        if (!activer) await tx.execute(sql`DELETE FROM sessions WHERE utilisateur_id=${p.utilisateur_id}::uuid`);
      });
    }
    await journaliser(acteur, {
      action:
        operation === "REINITIALISER"
          ? "utilisateur.mot_de_passe_reinitialise"
          : operation === "REACTIVER"
            ? "utilisateur.reactive"
            : "utilisateur.desactive",
      entite: "utilisateurs",
      entiteId: p.utilisateur_id,
    });
    actualiser();
    return {
      ok: true,
      motDePasse: secret,
      message: secret
        ? "Mot de passe renouvelé ; sessions fermées."
        : operation === "REACTIVER"
          ? "Compte réactivé."
          : "Compte désactivé ; sessions fermées.",
    };
  } catch (e) {
    return { ok: false, message: erreurMessage(e, "Impossible de mettre à jour le compte.") };
  }
}
