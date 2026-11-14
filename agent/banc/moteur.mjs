/**
 * Banc d'essai conversationnel — l'assemblage.
 *
 * CE QUI EST RÉEL, CE QUI NE L'EST PAS
 * ------------------------------------
 * Réel, et identique à la production (`app.js`) :
 *   - le moteur (`Agent`), son registre d'outils, sa matrice de permissions,
 *     ses politiques d'exécution ;
 *   - l'interprète (`creerInterprete`), avec le MÊME modèle de langage, joint
 *     par le même `MoteurIA` et dans le même ordre de fournisseurs ;
 *   - le référentiel, le résolveur de paramètres, la mémoire de session ;
 *   - le client HTTP du backend scolaire, donc l'API, les gardes, les actions
 *     serveur et la base (de TEST).
 *
 * Remplacé, et seulement cela :
 *   - le transport : `FakeProvider` au lieu de WhatsApp ;
 *   - l'identité : un acteur de la base de test, posé d'office.
 *
 * Ce n'est donc pas un agent parallèle : c'est l'agent, débranché de WhatsApp.
 *
 * VERROUS
 * -------
 * Le banc refuse de démarrer si le backend n'est pas local, ou si la base est
 * la branche de production. Il écrit, et met des notifications en file (SMS et
 * push neutralisés côté backend : rien ne part vers une famille).
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { Agent } from "../src/engine.js";
import { FakeProvider } from "../src/provider.js";
import { IdentityStore } from "../src/identity.js";
import { IdempotencyStore } from "../src/idempotency.js";
import { AuditLog } from "../src/audit.js";
import { MatricePermissions } from "../src/permissions-matrix.js";
import { ToolRegistry, ASSIDUITE_TOOLS } from "../src/tools.js";
import { GuergneHttpClient } from "../src/guergne-client.js";
import { Referentiel } from "../src/referentiel.js";
import { MoteurIA, configurerDepuisEnv } from "../src/ia.js";
import { MoteurPolitiques, POLITIQUES_DEFAUT } from "../src/politiques.js";
import { creerInterprete } from "../src/interprete.js";
import { MemoireVive } from "../src/memoire-vive.js";

export const racineAgent = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const depot = resolve(racineAgent, "..");
export const BACKEND = process.env.BANC_BACKEND ?? "http://localhost:3100";
const BRANCHE_PRODUCTION = "br-red-waterfall-b1ajf6iu";

export function lireEnv(fichier, nom) {
  let texte;
  try {
    texte = readFileSync(fichier, "utf8");
  } catch {
    return null;
  }
  for (const l of texte.split(/\r?\n/)) {
    const m = l.match(/^([A-Za-z_0-9]+)\s*=\s*(.*)$/);
    if (m && m[1] === nom) return m[2].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

/** L'adresse de la base de TEST (celle du backend local). Jamais affichée. */
export function urlBaseDeTest() {
  const fichier = join(depot, "web", ".env.development.local");
  const url = lireEnv(fichier, "DATABASE_URL_DIRECT") ?? lireEnv(fichier, "DATABASE_URL");
  if (!url) throw new Error("DATABASE_URL de test introuvable (web/.env.development.local)");
  return url.replace(/sslmode=require/, "sslmode=verify-full");
}

/** Connexion SQL de l'ORACLE : indépendante du backend, et verrouillée hors production. */
export async function ouvrirOracle() {
  if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(BACKEND)) throw new Error("VERROU : backend non local");
  // Un POOL, pas une connexion : une campagne dure une demi-heure, et Neon
  // coupe une connexion restée muette. La première campagne en est morte au
  // 73e scénario, sans nettoyer derrière elle.
  const pool = new pg.Pool({ connectionString: urlBaseDeTest(), max: 2, idleTimeoutMillis: 20_000 });
  pool.on("error", () => {});
  const q = async (s, p) => {
    for (let essai = 1; ; essai += 1) {
      try {
        return (await pool.query(s, p)).rows;
      } catch (e) {
        const coupure = /ECONNRESET|terminated|Connection terminated|ETIMEDOUT|EPIPE/i.test(String(e?.code ?? "") + " " + String(e?.message ?? ""));
        if (!coupure || essai >= 3) throw e;
        await new Promise((r) => setTimeout(r, 500 * essai));
      }
    }
  };
  const [{ branche }] = await q("SELECT current_setting('neon.branch_id', true) AS branche");
  if (!branche || branche === BRANCHE_PRODUCTION) {
    await pool.end();
    throw new Error("VERROU : base " + (branche ?? "inconnue") + " — le banc ne tourne que sur la base de test");
  }
  return { q, branche, fermer: () => pool.end() };
}

/** Le moteur de langage de la production, avec les clés locales. */
export function ouvrirIA(journal) {
  const f = join(depot, "ai_apikey.env");
  const conf = configurerDepuisEnv({
    GROQ_API_KEY: process.env.GROQ_API_KEY ?? lireEnv(f, "grok_api") ?? undefined,
    MISTRAL_API_KEY: process.env.MISTRAL_API_KEY ?? lireEnv(f, "mistral_ai") ?? undefined,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? lireEnv(f, "openrouterai_api") ?? undefined,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? lireEnv(f, "gemini_api") ?? undefined,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    GEMINI_LITE_MODEL: process.env.GEMINI_LITE_MODEL,
    IA_ORDRE: process.env.IA_ORDRE,
    IA_DESACTIVES: process.env.IA_DESACTIVES,
    GROQ_MODEL: process.env.GROQ_MODEL,
    MISTRAL_MODEL: process.env.MISTRAL_MODEL,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
  });
  return new MoteurIA({ cles: conf.cles, modeles: conf.modeles, ordre: conf.ordre, desactives: conf.desactives, journal });
}

/** Client backend qui NOTE chaque appel : action, paramètres, issue, durée. */
function clientObserve(client, appels) {
  return new Proxy(client, {
    get(cible, prop) {
      const v = cible[prop];
      if (typeof v !== "function" || String(prop).startsWith("_")) return v;
      return async (params, ctx) => {
        const debut = Date.now();
        try {
          const r = await v.call(cible, params, ctx);
          appels.push({ action: String(prop), params, ok: r?.ok !== false, message: r?.ok === false ? r.message : null, ms: Date.now() - debut });
          return r;
        } catch (e) {
          appels.push({ action: String(prop), params, ok: false, message: String(e?.message ?? e), ms: Date.now() - debut, exception: true });
          throw e;
        }
      };
    },
  });
}

/** Extensions du moteur (résolveur, supervision…) : posées par `extensions.mjs` quand elles existent. */
let extensions = null;
export function poserExtensions(fabrique) {
  extensions = fabrique;
}

/**
 * Une conversation de banc : un acteur, un numéro, un fil.
 *
 * @param {object} o
 * @param {object} o.ia            MoteurIA partagé (son disjoncteur vaut pour toute la campagne)
 * @param {object} o.acteur        { id, role }
 * @param {boolean} [o.memoire]    mémoire de session active (défaut : oui)
 * @param {object} [o.sabotage]    { action: async (params, ctx, reel) => reponse | Error } pannes injectées
 * @param {object[]} [o.evenementsIA] tableau où le MoteurIA journalise (partagé)
 * @param {() => number} [o.horloge]  horloge de la mémoire (péremption du contexte)
 */
export function ouvrirConversation({ ia, acteur, memoire = true, sabotage = null, evenementsIA = [], horloge = undefined, jid: jidImpose = null }) {
  const appels = [];
  const evenements = [];
  const jid = jidImpose ?? "2356600" + String(Math.floor(Math.random() * 9000) + 1000) + "@c.us";
  const reel = new GuergneHttpClient({ baseUrl: BACKEND, serviceToken: lireEnv(join(racineAgent, ".env"), "AGENT_SERVICE_TOKEN") });
  const sabote = sabotage
    ? new Proxy(reel, {
        get(cible, prop) {
          if (sabotage[prop]) {
            return async (p, c) => {
              const r = await sabotage[prop](p, c, (pp, cc) => cible[prop](pp, cc));
              if (r instanceof Error) throw r;
              return r;
            };
          }
          const v = cible[prop];
          return typeof v === "function" ? v.bind(cible) : v;
        },
      })
    : reel;
  const guergne = clientObserve(sabote, appels);
  const outils = new ToolRegistry(ASSIDUITE_TOOLS);
  const referentiel = new Referentiel({ guergne });
  const provider = new FakeProvider();
  const audit = new AuditLog();
  // `memoire` : false (aucune), true (session en mémoire vive), ou une instance (mémoire composée durable).
  const memory = memoire && typeof memoire === "object" ? memoire : memoire ? new MemoireVive(horloge ? { maintenant: horloge } : {}) : null;

  const deps = {
    provider,
    identity: new IdentityStore([{ jid, id: acteur.id, nom: "Acteur de banc", role: acteur.role }]),
    idempotency: new IdempotencyStore(),
    audit,
    tools: outils,
    permissions: new MatricePermissions(),
    politiques: new MoteurPolitiques({ politiques: POLITIQUES_DEFAUT, journal: (e) => evenements.push(e) }),
    destinatairesNotification: async () => [],
    guergne,
    memory,
    journalEtape: (e) => evenements.push(e),
    interpret: creerInterprete({ ia, outils, referentiel, guergne }),
  };
  if (extensions) Object.assign(deps, extensions({ guergne, referentiel, outils, memory, evenements, ia }));
  const agent = new Agent(deps);

  let n = 0;
  return {
    jid,
    agent,
    memory,
    /** Envoie un message, rend tout ce qui s'est passé pendant ce tour. */
    async dire(texte) {
      const a0 = appels.length;
      const e0 = evenements.length;
      const s0 = provider.sent.length;
      const i0 = evenementsIA.length;
      const debut = Date.now();
      const r = await agent.handle({ id: "banc-" + Date.now() + "-" + n++, from: jid, body: texte });
      const dureeMs = Date.now() - debut;
      const mesEvenements = evenements.slice(e0);
      const evIA = evenementsIA.slice(i0);
      const reponses = provider.sent.slice(s0).filter((x) => x.kind === "text").map((x) => x.text);
      const intention = mesEvenements.find((e) => e.event === "intent_detected") ?? null;
      // Réorienté par la préparation (« rattacher » un parent déjà rattaché =
      // changer ses responsabilités) : c'est l'outil EXÉCUTÉ qui compte.
      const reoriente = mesEvenements.find((e) => e.event === "outil_reoriente") ?? null;
      const dernierAudit = audit.last?.() ?? null;
      const llm = evIA.filter((e) => e.type === "llm");
      return {
        texte,
        statut: r?.status ?? null,
        resultat: r,
        reponses,
        reponse: reponses.join("\n---\n"),
        medias: provider.sent.slice(s0).filter((x) => x.kind !== "text").length,
        intention: intention?.intention ?? null,
        outil: reoriente?.vers ?? intention?.outil ?? (intention?.intention === "mission" ? "mission" : null),
        rejet: intention?.rejet ?? null,
        audit: dernierAudit ? { intent: dernierAudit.intent, result: dernierAudit.result, params: dernierAudit.params ?? null } : null,
        appels: appels.slice(a0),
        evenements: mesEvenements,
        llm: {
          appels: llm.length,
          echecs: evIA.filter((e) => e.type === "llm_echec").length,
          tokens: llm.reduce((s, e) => s + (e.tokens ?? 0), 0),
          ms: llm.reduce((s, e) => s + (e.dureeMs ?? 0), 0),
          fournisseurs: [...new Set(llm.map((e) => e.fournisseur))],
        },
        dureeMs,
      };
    },
  };
}
