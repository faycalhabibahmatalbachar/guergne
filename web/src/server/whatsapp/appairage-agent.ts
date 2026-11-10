/**
 * Client SERVEUR de l'appairage WhatsApp de l'agent.
 *
 * CE QUE CE MODULE PROTÈGE
 * ------------------------
 * Un QR WhatsApp est un secret d'authentification : qui le scanne prend la
 * main sur le numéro de l'établissement. Et le jeton qui permet de le lire est
 * le jeton de service de l'agent, qui autorise par ailleurs les écritures
 * scolaires. Ni l'un ni l'autre ne doit atteindre le navigateur.
 *
 * D'où cette répartition, qui n'est pas négociable :
 *
 *   navigateur  ──HTTPS──▶  Next.js (Vercel)  ──HTTP──▶  agent (Altare)
 *   session + rôle vérifiés │  jeton de service, côté serveur uniquement
 *   ne reçoit que des pixels│  jamais d'en-tête relayé depuis le client
 *
 * L'agent Altare ne sert qu'en HTTP — le panneau n'offre pas de TLS. Ce saut
 * en clair est donc réel et il est assumé ici : il relie deux serveurs, pas un
 * public, et il est strictement plus court que d'exposer le lien d'appairage
 * d'Altare au navigateur de l'opérateur. Le jour où Altare servira en HTTPS,
 * seule `AGENT_BASE_URL` change.
 *
 * Ce fichier n'est JAMAIS importé par un composant client : il lit des secrets
 * d'environnement.
 */
import "server-only";

/** Un QR WhatsApp vit une vingtaine de secondes ; l'agent en retient 60. */
export type EtatAppairage = {
  /** `attente` : l'agent n'a pas encore de QR. `pret` : un QR valide existe.
   *  `expire` : le dernier QR a dépassé sa validité. `authentifie` : session liée. */
  etat: "attente" | "pret" | "expire" | "authentifie";
  qrDisponible: boolean;
  resteMs: number;
};

/** Ce que la page sait afficher, au-delà de l'appairage lui-même. */
export type EtatWhatsApp = {
  appairage: EtatAppairage;
  /** `null` quand `/sante` est injoignable : l'absence de mesure n'est pas un état. */
  transport: {
    whatsapp: string;
    etatDetaille: string | null;
    depuis: string | null;
    jamaisConnecte: boolean | null;
    reconnexions: number | null;
    derniereErreur: { le: string; message: string } | null;
    marcheS: number | null;
  } | null;
  /** Vrai seulement si l'agent a répondu. Sinon on ne prétend rien. */
  agentJoignable: boolean;
  /** Pourquoi l'agent n'a pas répondu, en clair, sans secret. */
  indisponibilite: string | null;
};

const DELAI_MS = 8_000;

function base(): string | null {
  const brut = process.env.AGENT_BASE_URL?.trim();
  if (!brut) return null;
  return brut.replace(/\/+$/, "");
}

function jeton(): string | null {
  return process.env.AGENT_SERVICE_TOKEN?.trim() || null;
}

/** Configuration manquante : on le dit, plutôt que d'échouer en réseau. */
export function configurationAppairage(): { ok: true } | { ok: false; manque: string[] } {
  const manque: string[] = [];
  if (!base()) manque.push("AGENT_BASE_URL");
  if (!jeton()) manque.push("AGENT_SERVICE_TOKEN");
  return manque.length ? { ok: false, manque } : { ok: true };
}

async function appeler(chemin: string): Promise<Response> {
  const racine = base();
  const secret = jeton();
  if (!racine || !secret) throw new Error("CONFIGURATION_ABSENTE");
  return fetch(`${racine}${chemin}`, {
    // L'en-tête est posé ICI, à partir de l'environnement du serveur. Aucun
    // en-tête du client n'est relayé : un navigateur ne peut pas s'inventer
    // d'autorisation en ajoutant le sien.
    headers: { "x-agent-service-token": secret },
    cache: "no-store",
    signal: AbortSignal.timeout(DELAI_MS),
  });
}

/** Message d'indisponibilité lisible, qui ne révèle ni URL interne ni secret. */
function direIndisponible(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (m === "CONFIGURATION_ABSENTE") return "La liaison avec l'agent WhatsApp n'est pas configurée sur ce déploiement.";
  if (/timeout|abort/i.test(m)) return "L'agent WhatsApp n'a pas répondu dans le délai imparti.";
  return "L'agent WhatsApp est injoignable depuis ce serveur.";
}

/**
 * État complet, pour la page et pour son rafraîchissement.
 *
 * Ne lève pas : une page de diagnostic qui plante quand le système diagnostiqué
 * est en panne ne diagnostique rien.
 */
export async function lireEtatWhatsApp(): Promise<EtatWhatsApp> {
  const vide: EtatAppairage = { etat: "attente", qrDisponible: false, resteMs: 0 };

  let appairage: EtatAppairage = vide;
  try {
    const r = await appeler("/pairing/etat");
    if (!r.ok) {
      return {
        appairage: vide,
        transport: null,
        agentJoignable: true,
        indisponibilite: `L'agent a refusé la lecture de l'état (HTTP ${r.status}).`,
      };
    }
    const brut = (await r.json()) as Partial<EtatAppairage>;
    appairage = {
      etat: brut.etat ?? "attente",
      qrDisponible: Boolean(brut.qrDisponible),
      resteMs: Number(brut.resteMs ?? 0),
    };
  } catch (e) {
    return { appairage: vide, transport: null, agentJoignable: false, indisponibilite: direIndisponible(e) };
  }

  // `/sante` enrichit, il ne conditionne pas : son silence ne doit pas effacer
  // un état d'appairage qu'on vient d'obtenir.
  let transport: EtatWhatsApp["transport"] = null;
  try {
    const r = await appeler("/sante");
    // `/sante` répond 503 quand le transport est dégradé : c'est une réponse
    // pleine de sens, pas une panne. On la lit.
    const s = (await r.json()) as Record<string, unknown>;
    const d = (s.whatsappDetaille ?? {}) as Record<string, unknown>;
    const err = (d.derniereErreur ?? null) as { le?: string; message?: string } | null;
    transport = {
      whatsapp: String(s.whatsapp ?? "inconnu"),
      etatDetaille: d.etat ? String(d.etat) : null,
      depuis: d.depuis ? String(d.depuis) : null,
      jamaisConnecte: typeof d.jamaisConnecte === "boolean" ? d.jamaisConnecte : null,
      reconnexions: typeof s.reconnexions === "number" ? s.reconnexions : null,
      derniereErreur: err?.le && err?.message ? { le: String(err.le), message: String(err.message) } : null,
      marcheS: typeof d.marcheS === "number" ? d.marcheS : null,
    };
  } catch {
    /* l'appairage reste la source d'autorité ; `/sante` n'est qu'un supplément */
  }

  return { appairage, transport, agentJoignable: true, indisponibilite: null };
}

/**
 * Image du QR courant.
 *
 * Rend les octets PNG, ou la raison du refus. Le QR n'est ni journalisé, ni
 * mis en cache, ni conservé : il est relayé et oublié.
 */
export async function lireQrWhatsApp(): Promise<
  { ok: true; png: ArrayBuffer } | { ok: false; statut: number; raison: string }
> {
  try {
    const r = await appeler("/pairing/qr");
    if (!r.ok) {
      const corps = (await r.json().catch(() => null)) as { erreur?: string } | null;
      return { ok: false, statut: r.status, raison: corps?.erreur ?? `HTTP ${r.status}` };
    }
    return { ok: true, png: await r.arrayBuffer() };
  } catch (e) {
    return { ok: false, statut: 502, raison: direIndisponible(e) };
  }
}
