import { principalParId } from "@/server/auth/session";
import { trouverOperation } from "@/server/agent/operations";
import { ErreurAutorisation, exigerPermissionPour } from "@/server/guard";

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
 * blanche de `@/server/agent/operations`. Tout nom hors liste est un 404.
 *
 * LECTURES ET ÉCRITURES NE VOYAGENT PAS ENSEMBLE
 * -----------------------------------------------
 * Le catalogue est scindé par risque. Les écritures ne répondent que si
 * `AGENT_ECRITURES_ACTIVES=true` : mettre les consultations en ligne ne doit
 * pas mettre en ligne, du même geste, la création et la suppression
 * d'absences — qui déclenchent la notification des tuteurs.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const s = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

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
  const trouvee = trouverOperation(action);
  if ("erreur" in trouvee) {
    // Un nom hors catalogue est une erreur du modele ; une ecriture eteinte
    // est une decision de deploiement. Les confondre ferait chercher au
    // mauvais endroit.
    return trouvee.erreur === "desactivee"
      ? json(
          { ok: false, code: "ECRITURES_DESACTIVEES", message: "Les ecritures de l'agent ne sont pas activees sur ce deploiement." },
          403,
        )
      : json({ ok: false, message: `Opération inconnue : ${action}.` }, 404);
  }
  const outil = trouvee.outil;

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
