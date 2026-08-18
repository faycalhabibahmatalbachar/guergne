import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/server/db";
import { affectations, eleveTuteur, enseignants, permissions, tuteurs } from "@/server/db/schema";
import { type Principal, sessionCourante } from "@/server/auth/session";

import type { Action, Portee, RoleUtilisateur } from "./permissions";

/**
 * Couche d'autorisation — point de passage unique.
 *
 * Aucune page, aucune action serveur, aucune route d'API ne doit interroger la
 * base sans être passée par ici. Trois contrôles, dans cet ordre :
 *
 *   1. AUTHENTIFICATION — une session valide existe.
 *   2. RÔLE            — le rôle détient l'action (matrice en base).
 *   3. PÉRIMÈTRE       — l'acteur est rattaché à la ressource visée.
 *
 * Le rôle n'est jamais lu depuis le client. Il est rechargé à chaque requête
 * depuis la table `utilisateurs`, via la session. C'est la parade directe à
 * l'élévation de privilège par altération d'une donnée côté navigateur.
 */

export class ErreurAutorisation extends Error {
  constructor(
    message: string,
    readonly code: "NON_AUTHENTIFIE" | "ROLE_INSUFFISANT" | "HORS_PERIMETRE",
  ) {
    super(message);
    this.name = "ErreurAutorisation";
  }
}

/** Cible facultative sur laquelle porte l'action. */
export interface Perimetre {
  classeId?: string;
  matiereId?: string;
  eleveId?: string;
}

// ---------------------------------------------------------------------------
// Matrice des permissions
// ---------------------------------------------------------------------------

type Matrice = Map<string, Portee>;
let matriceEnCache: Matrice | null = null;

/**
 * Charge la matrice `rôle → action → portée` depuis la base.
 *
 * Mise en cache pour la durée de vie du processus : elle ne change qu'à
 * l'occasion d'une migration, et la relire à chaque requête coûterait un
 * aller-retour SQL sur le chemin le plus chaud de l'application.
 */
async function chargerMatrice(): Promise<Matrice> {
  if (matriceEnCache) return matriceEnCache;

  const lignes = await db
    .select({ role: permissions.role, action: permissions.action, portee: permissions.portee })
    .from(permissions);

  const matrice: Matrice = new Map();
  for (const l of lignes) {
    matrice.set(`${l.role}:${l.action}`, (l.portee ?? "AUCUNE") as Portee);
  }

  matriceEnCache = matrice;
  return matrice;
}

/** À appeler après toute modification des permissions. */
export function invaliderMatrice(): void {
  matriceEnCache = null;
}

// ---------------------------------------------------------------------------
// Contrôles de périmètre
// ---------------------------------------------------------------------------

/**
 * Un enseignant n'accède qu'aux couples (classe × matière) où il est affecté.
 *
 * On vérifie l'affectation, pas une liste de classes portée par la session :
 * une affectation retirée le matin doit fermer l'accès l'après-midi même.
 */
async function enseignantCouvre(
  utilisateurId: string,
  perimetre: Perimetre,
): Promise<boolean> {
  if (!perimetre.classeId) return false;

  const conditions = [
    eq(affectations.classeId, perimetre.classeId),
    eq(affectations.active, true),
  ];
  if (perimetre.matiereId) {
    conditions.push(eq(affectations.matiereId, perimetre.matiereId));
  }

  // L'affectation désigne un enseignant, la session porte un utilisateur :
  // la jointure passe par `enseignants.utilisateur_id`.
  const lignes = await db
    .select({ id: affectations.id })
    .from(affectations)
    .innerJoin(enseignants, eq(enseignants.id, affectations.enseignantId))
    .where(and(eq(enseignants.utilisateurId, utilisateurId), eq(enseignants.actif, true), ...conditions))
    .limit(1);

  return lignes.length > 0;
}

/** Un parent n'accède qu'aux élèves dont il est tuteur déclaré. */
async function parentCouvre(utilisateurId: string, perimetre: Perimetre): Promise<boolean> {
  if (!perimetre.eleveId) return false;

  const lignes = await db
    .select({ id: eleveTuteur.id })
    .from(eleveTuteur)
    .innerJoin(tuteurs, eq(tuteurs.id, eleveTuteur.tuteurId))
    .where(and(eq(tuteurs.utilisateurId, utilisateurId), eq(eleveTuteur.eleveId, perimetre.eleveId)))
    .limit(1);

  return lignes.length > 0;
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/** Vérifie sans lever : utile pour afficher ou masquer un élément d'interface. */
export async function peut(
  principal: Principal | null,
  action: Action,
  perimetre?: Perimetre,
): Promise<boolean> {
  if (!principal) return false;

  const matrice = await chargerMatrice();
  const portee = matrice.get(`${principal.role}:${action}`);
  if (portee === undefined) return false;
  if (portee === "AUCUNE") return true;

  if (portee === "PROPRES_CLASSES") return enseignantCouvre(principal.id, perimetre ?? {});
  if (portee === "PROPRES_ENFANTS") return parentCouvre(principal.id, perimetre ?? {});

  return false;
}

/**
 * Exige une permission. Lève `ErreurAutorisation` si elle n'est pas accordée.
 * À utiliser dans les actions serveur et les routes d'API.
 */
export async function requirePermission(
  action: Action,
  perimetre?: Perimetre,
): Promise<Principal> {
  const principal = await sessionCourante();
  if (!principal) {
    throw new ErreurAutorisation("Session absente ou expirée.", "NON_AUTHENTIFIE");
  }

  const matrice = await chargerMatrice();
  const portee = matrice.get(`${principal.role}:${action}`);

  if (portee === undefined) {
    throw new ErreurAutorisation(
      `Le rôle ${principal.role} ne dispose pas de l'action ${action}.`,
      "ROLE_INSUFFISANT",
    );
  }

  if (portee !== "AUCUNE") {
    const couvre =
      portee === "PROPRES_CLASSES"
        ? await enseignantCouvre(principal.id, perimetre ?? {})
        : await parentCouvre(principal.id, perimetre ?? {});

    if (!couvre) {
      throw new ErreurAutorisation(
        "La ressource demandée est hors de votre périmètre.",
        "HORS_PERIMETRE",
      );
    }
  }

  return principal;
}

/**
 * Variante pour les pages : redirige au lieu de lever.
 * Une page inaccessible doit renvoyer vers la connexion ou l'écran « accès
 * refusé », pas afficher une trace d'erreur.
 */
export async function exigerPage(action: Action, perimetre?: Perimetre): Promise<Principal> {
  try {
    return await requirePermission(action, perimetre);
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation && erreur.code === "NON_AUTHENTIFIE") {
      redirect("/auth/connexion");
    }
    redirect("/unauthorized");
  }
}

/** Exige seulement une session valide, sans contrôle d'action. */
export async function exigerSession(): Promise<Principal> {
  const principal = await sessionCourante();
  if (!principal) redirect("/auth/connexion");
  return principal;
}

export type { Principal };
export type { Action, RoleUtilisateur } from "./permissions";
