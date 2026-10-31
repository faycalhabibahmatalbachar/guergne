import type { Principal } from "@/server/auth/session";
import { principalParId } from "@/server/auth/session";
import {
  enregistrerAppelPour,
  enregistrerRetardPour,
  justifierEnLotPour,
  supprimerAbsencePour,
} from "@/server/domain/assiduite-ecritures";
import {
  chargerConduiteClasse,
  listerAbsences,
  listerAlertes,
  listerElevesClasse,
  listerIncidents,
  listerRetards,
  listerSanctions,
  statistiquesVieScolaire,
} from "@/server/domain/vie-scolaire";
import { ErreurAutorisation, exigerPermissionPour } from "@/server/guard";
import type { Action } from "@/server/guard/permissions";

import { timingSafeEqual } from "node:crypto";

/**
 * API de l'agent IA (pilotage par WhatsApp).
 *
 * DEUX AUTHENTIFICATIONS, PAS UNE
 * --------------------------------
 * - `Authorization: Bearer <AGENT_SERVICE_TOKEN>` authentifie le *service* agent.
 * - `x-acteur-id` désigne le *membre du personnel* au nom de qui l'agent agit.
 *
 * Les deux sont exigés. Le jeton de service ne confère AUCUN droit métier : les
 * permissions sont décidées action par action par le `guard`, sur le rôle réel de
 * l'acteur, exactement comme pour une session navigateur. Un agent compromis ne
 * peut donc pas faire plus que l'utilisateur qu'il représente.
 *
 * AUCUN SQL ARBITRAIRE
 * ---------------------
 * Le modèle d'IA ne choisit pas une requête : il choisit un nom dans la liste
 * blanche ci-dessous. Tout nom hors liste est un 404.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Executeur = (params: Record<string, unknown>, acteur: Principal) => Promise<unknown>;

interface OutilExpose {
  permission: Action;
  executer: Executeur;
}

const s = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

/**
 * Liste blanche des opérations exposées à l'agent.
 *
 * Cette première livraison n'expose que des **lectures** : elles sont sans risque
 * et suffisent déjà au contrôle des saisies et aux rapports. Les écritures
 * (appel, retard, justification, suppression) seront ajoutées après extraction
 * d'un noyau commun avec les actions serveur, pour qu'il n'existe jamais deux
 * chemins d'écriture divergents.
 */
const OUTILS: Record<string, OutilExpose> = {
  listerAbsences: {
    permission: "assiduite:lire",
    executer: (p) =>
      listerAbsences({
        periodeId: s(p.periodeId),
        classeId: s(p.classeId),
        statut: s(p.statut),
        depuis: s(p.depuis),
        jusqua: s(p.jusqua),
        limite: typeof p.limite === "number" ? p.limite : 100,
      }),
  },
  listerRetards: {
    permission: "assiduite:lire",
    executer: (p) =>
      listerRetards({
        periodeId: s(p.periodeId),
        classeId: s(p.classeId),
        limite: typeof p.limite === "number" ? p.limite : 100,
      }),
  },
  listerAlertes: {
    permission: "assiduite:lire",
    executer: (p) => listerAlertes(s(p.periodeId)),
  },
  statistiquesVieScolaire: {
    permission: "assiduite:lire",
    executer: (p) => statistiquesVieScolaire(s(p.periodeId) ?? null),
  },
  listerElevesClasse: {
    permission: "eleve:lire",
    executer: (p) => {
      const classeId = s(p.classeId);
      if (!classeId) throw new TypeError("classeId requis");
      return listerElevesClasse(classeId);
    },
  },
  chargerConduiteClasse: {
    permission: "assiduite:lire",
    executer: (p) => {
      const classeId = s(p.classeId);
      const periodeId = s(p.periodeId);
      if (!classeId || !periodeId) throw new TypeError("classeId et periodeId requis");
      return chargerConduiteClasse(classeId, periodeId);
    },
  },
  listerIncidents: {
    permission: "discipline:lire",
    executer: (p) =>
      listerIncidents({
        periodeId: s(p.periodeId),
        classeId: s(p.classeId),
        limite: typeof p.limite === "number" ? p.limite : 100,
      }),
  },
  listerSanctions: {
    permission: "discipline:lire",
    executer: (p) =>
      listerSanctions({
        periodeId: s(p.periodeId),
        classeId: s(p.classeId),
        limite: typeof p.limite === "number" ? p.limite : 100,
      }),
  },

  // --- Écritures -----------------------------------------------------------
  // Elles passent par le MÊME noyau que les actions de l'écran Assiduité
  // (`@/server/domain/assiduite-ecritures`) : une seule implémentation, donc
  // aucune divergence possible entre le chemin web et le chemin WhatsApp.
  enregistrerAppel: {
    permission: "assiduite:saisir",
    executer: (p, acteur) => enregistrerAppelPour(acteur, p),
  },
  enregistrerRetard: {
    permission: "retard:saisir",
    executer: (p, acteur) => enregistrerRetardPour(acteur, p),
  },
  justifierEnLot: {
    permission: "assiduite:justifier",
    executer: (p, acteur) => {
      const ids = Array.isArray(p.absenceIds) ? (p.absenceIds as string[]) : [];
      const statut = p.statut === "NON_JUSTIFIEE" ? "NON_JUSTIFIEE" : "JUSTIFIEE";
      return justifierEnLotPour(acteur, ids, statut, s(p.motif) ?? "");
    },
  },
  supprimerAbsence: {
    permission: "assiduite:saisir",
    executer: (p, acteur) => {
      const id = s(p.absenceId);
      if (!id) throw new TypeError("absenceId requis");
      return supprimerAbsencePour(acteur, id, s(p.motif) ?? "");
    },
  },
};

/** Comparaison à temps constant : une comparaison naïve fuite la longueur du préfixe. */
function jetonValide(fourni: string | null): boolean {
  const attendu = process.env.AGENT_SERVICE_TOKEN;
  if (!attendu || !fourni) return false;
  const a = Buffer.from(fourni);
  const b = Buffer.from(attendu);
  return a.length === b.length && timingSafeEqual(a, b);
}

const json = (corps: unknown, status = 200) =>
  Response.json(corps, { status, headers: { "cache-control": "no-store" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(requete: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;

  // 1. Le service doit être configuré. Sans jeton côté serveur, on refuse tout :
  //    une API agent ouverte vaudrait un accès anonyme aux données scolaires.
  if (!process.env.AGENT_SERVICE_TOKEN) {
    return json({ ok: false, message: "API agent non configurée." }, 503);
  }

  const entete = requete.headers.get("authorization");
  const jeton = entete?.startsWith("Bearer ") ? entete.slice(7) : null;
  if (!jetonValide(jeton)) {
    return json({ ok: false, message: "Service non authentifié." }, 401);
  }

  // 2. L'acteur au nom de qui on agit.
  const acteurId = requete.headers.get("x-acteur-id");
  if (!acteurId || !UUID.test(acteurId)) {
    return json({ ok: false, message: "En-tête x-acteur-id manquant ou invalide." }, 400);
  }
  const acteur = await principalParId(acteurId);
  if (!acteur) {
    return json({ ok: false, message: "Acteur inconnu, désactivé ou non habilité." }, 403);
  }

  // 3. L'opération doit figurer dans la liste blanche.
  const outil = OUTILS[action];
  if (!outil) {
    return json({ ok: false, message: `Opération inconnue : ${action}.` }, 404);
  }

  let params_: Record<string, unknown> = {};
  try {
    const brut = await requete.text();
    if (brut.trim().length > 0) params_ = JSON.parse(brut) as Record<string, unknown>;
  } catch {
    return json({ ok: false, message: "Corps JSON invalide." }, 400);
  }

  // 4. Le guard décide — même matrice, même périmètre que pour une session web.
  try {
    await exigerPermissionPour(acteur, outil.permission, {
      classeId: s(params_.classeId),
      eleveId: s(params_.eleveId),
    });
  } catch (e) {
    if (e instanceof ErreurAutorisation) {
      return json({ ok: false, code: e.code, message: "Droits insuffisants." }, 403);
    }
    throw e;
  }

  // 5. Exécution.
  try {
    const data = await outil.executer(params_, acteur);

    // Les écritures renvoient un `Resultat` portant son propre `ok`. L'emballer
    // dans un `{ok:true}` transformerait un refus métier en fausse réussite :
    // on propage l'échec tel quel, avec ses messages de validation.
    if (data && typeof data === "object" && "ok" in data && (data as { ok: unknown }).ok === false) {
      const r = data as { message?: string; erreurs?: Record<string, string> };
      return json({ ok: false, message: r.message, erreurs: r.erreurs }, 422);
    }

    return json({ ok: true, data });
  } catch (e) {
    if (e instanceof TypeError) {
      return json({ ok: false, message: e.message }, 400);
    }
    // On ne renvoie jamais la trace : elle peut contenir des fragments de données.
    console.error("[api/agent]", action, e);
    return json({ ok: false, message: "L'opération a échoué côté plateforme." }, 500);
  }
}
