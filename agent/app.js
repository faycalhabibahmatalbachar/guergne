/**
 * Point d'entrée du service — c'est le fichier que le démarrage Altare attend.
 *
 * Son absence expliquait les échecs de lancement constatés : la configuration
 * pointait sur `index.js` alors qu'aucun n'existait.
 *
 * Ordre de démarrage, délibéré :
 *   1. configuration (échouer tôt si un secret manque, pas au premier message) ;
 *   2. verrou d'instance (avant WhatsApp : deux instances font bannir le numéro) ;
 *   3. dépendances sans effet de bord (IA, client métier, registre d'outils) ;
 *   4. serveur de santé ;
 *   5. WhatsApp en dernier, une fois tout le reste prêt à recevoir.
 */
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import QRCode from "qrcode";
import { chmodSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { AuditLog } from "./src/audit.js";
import { Agent } from "./src/engine.js";
import { GuergneHttpClient } from "./src/guergne-client.js";
import { IdentityStorePersistant } from "./src/identity-store.js";
import { FOURNISSEURS as FOURNISSEURS_CONNUS, MoteurIA, configurerDepuisEnv } from "./src/ia.js";
import { Pairing, jetonAleatoire, pageAppairage } from "./src/pairing.js";
import { MatricePermissions } from "./src/permissions-matrix.js";
import { Referentiel } from "./src/referentiel.js";
import { resoudreNomsEleves } from "./src/resolution-eleves.js";
import { resoudreClasse } from "./src/resolveur.js";
import { NeonConversationMemory } from "./src/memory.js";
import {
  CompteurJournalierPersistant,
  DedupPersistant,
  FreinRedemarrage,
  VerrouInstance,
  cheminsPersistants,
} from "./src/persistance.js";
import { MoteurPolitiques, POLITIQUES_DEFAUT } from "./src/politiques.js";
import { WwebjsProvider } from "./src/providers/wwebjs.js";
import { ASSIDUITE_TOOLS, ToolRegistry } from "./src/tools.js";

const env = (c, defaut = undefined) => process.env[c] ?? defaut;
const requis = (c) => {
  const v = process.env[c];
  if (!v) {
    console.error(`[config] variable obligatoire manquante : ${c}`);
    process.exit(1);
  }
  return v;
};

const CONF = {
  donnees: env("DONNEES_DIR", "/home/container/donnees"),
  // Altare injecte le port alloué dans SERVER_PORT. On le préfère à PORT :
  // écouter sur un autre port rendrait le point de santé injoignable.
  port: Number(env("SERVER_PORT") ?? env("PORT", "8080")),
  // Le backend scolaire peut être raccordé après la première liaison WhatsApp.
  apiEcole: env("SCHOOL_API_BASE_URL"),
  jetonService: env("AGENT_SERVICE_TOKEN"),
};

// --- Fournisseurs IA : ce qui est présent, et rien de plus ------------------
// La lecture est déportée dans `configurerDepuisEnv` pour être testable sans
// toucher à `process.env`, et pour qu'un seul endroit connaisse les alias.
const confIA = configurerDepuisEnv(process.env);
for (const a of confIA.avertissements) console.warn(`[config] ${a}`);
// Diagnostic non sensible : des noms et des états, jamais une valeur.
console.log(
  `[config] ${Object.keys(FOURNISSEURS_CONNUS)
    .map((n) => `${n}=${confIA.desactives.includes(n) ? "desactive" : confIA.cles[n] ? "present" : "absent"}`)
    .join(" ")}`,
);
// L'ordre EFFECTIF, pas l'ordre théorique : afficher `xai` dans une file dont
// la clé est absente laisse croire à quatre fournisseurs opérationnels.
const ordreEffectif = confIA.ordre.filter((n) => confIA.cles[n] && !confIA.desactives.includes(n));
console.log(`[config] ordre=${ordreEffectif.join(">") || "(aucun fournisseur utilisable)"}`);
const ecartes = confIA.ordre.filter((n) => !ordreEffectif.includes(n));
if (ecartes.length) console.log(`[config] hors file (cle absente ou desactive) : ${ecartes.join(", ")}`);

const chemins = cheminsPersistants(CONF.donnees);
mkdirSync(chemins.racine, { recursive: true });

// --- Frein : une boucle de redémarrages coûte le numéro, pas seulement du temps
const frein = new FreinRedemarrage({ chemin: chemins.redemarrages });
const { pauseMs } = frein.enregistrer();
if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs));

// --- Verrou avant toute connexion WhatsApp ---------------------------------
const verrou = new VerrouInstance({ chemin: chemins.verrou });
const prise = verrou.acquerir();
if (!prise.ok) {
  console.error(
    `[verrou] une autre instance (pid ${prise.detenuPar}) utilise deja la session ` +
      `(decision=${prise.decision}) ; arret pour ne pas faire bannir le numero.`,
  );
  process.exit(1);
}
console.log(`[verrou] acquis (decision=${prise.decision}) instance=${verrou.instanceId.slice(0, 8)}`);

// Le battement est aussi une surveillance : s'il découvre que le verrou n'est
// plus le nôtre, c'est qu'une autre instance tient la session. Rester en vie
// signifierait deux clients sur le même compte — donc le bannissement.
const battement = setInterval(() => {
  if (!verrou.rafraichir()) {
    console.error("[verrou] verrou perdu au profit d'une autre instance ; arret immediat.");
    clearInterval(battement);
    provider.disconnect().finally(() => process.exit(1));
  }
}, 20_000);
battement.unref?.();

// --- Dépendances ------------------------------------------------------------
const audit = new AuditLog((e) =>
  console.log(JSON.stringify({ ts: e.at, type: "audit", run: e.runId, intent: e.intent, result: e.result })),
);
const iaConfiguree = confIA.presents.some((n) => !confIA.desactives.includes(n));
const backendConfigure = Boolean(CONF.apiEcole && CONF.jetonService);

// Le transport WhatsApp et l'appairage démarrent sans IA ni API.
// Toute action scolaire échoue explicitement tant que le backend n'est pas branché.
const ia = iaConfiguree
  ? new MoteurIA({
      cles: confIA.cles,
      modeles: confIA.modeles,
      ordre: confIA.ordre,
      desactives: confIA.desactives,
      journal: (e) => console.log(JSON.stringify({ ts: new Date().toISOString(), ...e })),
    })
  : null;
const guergne = backendConfigure
  ? new GuergneHttpClient({ baseUrl: CONF.apiEcole, serviceToken: CONF.jetonService })
  : new Proxy({}, {
      get: (_cible, propriete) => {
        if (propriete === "snapshot") return undefined;
        return async () => ({
          ok: false,
          message: "Backend scolaire non configuré : opération indisponible.",
        });
      },
    });
const outils = new ToolRegistry(ASSIDUITE_TOOLS);
// Les listes reelles de classes et de periodes, dans le perimetre de l'acteur.
const referentiel = new Referentiel({ guergne });

// La mémoire est opt-in. En mode activé, une connexion Neon invalide fait
// échouer le démarrage : ne jamais prétendre mémoriser si la base est absente.
const memoireActivee = String(env("AGENT_MEMORY_ENABLED", "false")).toLowerCase() === "true";
const memoire = memoireActivee
  ? new NeonConversationMemory({
      connectionString: requis("AGENT_MEMORY_DATABASE_URL"),
      encryptionKey: requis("AGENT_MEMORY_ENCRYPTION_KEY"),
      hmacKey: requis("AGENT_MEMORY_HMAC_KEY"),
      logger: (e) => console.log(JSON.stringify({ ts: new Date().toISOString(), type: "memory", ...e })),
    })
  : null;
if (memoire) {
  await memoire.ping();
  console.log("[memory] Neon conversationnelle active");
} else {
  console.log("[memory] desactivee (AGENT_MEMORY_ENABLED=false)");
}

// L'association numéro → compte interne vit en base côté guergne. Tant que ce
// point n'est pas branché, le magasin démarre vide : AUCUN numéro n'est reconnu,
// donc aucune opération n'est possible. C'est le défaut sûr.
const identites = new IdentityStorePersistant({
  chemin: join(chemins.racine, "identites.json"),
  journal: (e) => console.log(JSON.stringify({ ts: e.at, ...e })),
});
/**
 * Sel d'empreinte, neuf à chaque démarrage.
 *
 * Les empreintes servent à comparer, dans les journaux, le numéro qui a écrit
 * aux numéros du magasin — sans qu'aucun des deux n'apparaisse. Un sel neuf à
 * chaque processus les rend incomparables d'un redémarrage à l'autre, donc
 * inutilisables comme identifiant durable.
 */
const SEL_EMPREINTE = randomUUID();

console.log(`[identites] ${identites.nombreActives} association(s) active(s)`);
// Les empreintes du magasin au démarrage : sans elles, un refus ne dit pas si
// le numéro qui a écrit est un autre numéro, ou le bon mal résolu.
for (const a of identites.empreintes(SEL_EMPREINTE)) {
  console.log(JSON.stringify({ type: "identite_chargee", ...a }));
}

// `Pairing` est l'UNIQUE autorité sur le cycle de vie du QR : pas de variable
// parallèle qui pourrait diverger de son état.
// Secret de liaison neuf à chaque démarrage, jamais écrit dans les journaux ni servi en HTTP.
const fichierJetonPairing = join(chemins.racine, "PAIRING_TOKEN.txt");
function nouveauJetonPairing() {
  const jeton = jetonAleatoire();
  writeFileSync(fichierJetonPairing, jeton + "\n", { mode: 0o600 });
  try { chmodSync(fichierJetonPairing, 0o600); } catch { /* permissions best effort */ }
  return jeton;
}
function retirerJetonPairing() {
  try { unlinkSync(fichierJetonPairing); } catch { /* absent = normal */ }
}
const pairing = new Pairing({ jeton: nouveauJetonPairing() });

const provider = new WwebjsProvider({
  dossierSession: chemins.session,
  // Le QR ne passe jamais par les journaux : il est remis directement au
  // gestionnaire, qui seul décide de sa durée de vie.
  surQr: (qr) => pairing.nouveauQr(qr),
  // Session authentifiee : le QR est detruit et le jeton brule.
  surPret: () => {
    pairing.marquerAuthentifie();
    retirerJetonPairing(); // le secret n'est plus nécessaire après le scan
  },
  // Chaque déconnexion ouvre un nouveau cycle avec un secret neuf.
  surDeconnexion: () => pairing.reinitialiser({ nouveauJeton: nouveauJetonPairing() }),
  journal: console,
});

/**
 * Politiques d'execution de l'etablissement.
 *
 * Elles remplacent la confirmation repetee par une autorisation permanente.
 * Le compteur est persistant : un quota journalier qui repart de zero a chaque
 * redemarrage n'est pas un quota.
 */
const politiques = new MoteurPolitiques({
  politiques: POLITIQUES_DEFAUT,
  compteur: new CompteurJournalierPersistant({ chemin: chemins.compteurs }),
  journal: (e) => console.log(JSON.stringify({ ts: new Date().toISOString(), ...e })),
});
for (const p of politiques.politiques) {
  console.log(`[politique] ${p.id} v${p.version} ${p.suspendue ? "SUSPENDUE" : "active"}`);
}

const agent = new Agent({
  politiques,
  // Les responsables sont INFORMES des operations automatiques, jamais
  // sollicites pour les autoriser.
  destinatairesNotification: async (roles) => identites.destinatairesParRole(roles),
  provider,
  identity: identites,
  idempotency: new DedupPersistant({ chemin: chemins.dedup }),
  audit,
  tools: outils,
  permissions: new MatricePermissions(),
  guergne,
  // Journal d'identification : la seule facon de diagnostiquer un refus sans
  // qu'aucun numero complet n'apparaisse. L'empreinte se compare a celles
  // ecrites au demarrage (`identite_chargee`) : si elles different, le message
  // vient d'un AUTRE numero ; si elles coincident, c'est l'etat de
  // l'association qu'il faut regarder.
  journalIdentite: (e) => console.log(JSON.stringify({ ts: new Date().toISOString(), ...e })),
  // Journal d'etape : il porte le meme `run` que le transport, de la reception
  // a la reponse. Sans cette correlation, un message disparu ne laisse aucune
  // piste a suivre.
  journalEtape: (e) => console.log(JSON.stringify({ ts: new Date().toISOString(), type: "agent", ...e })),
  selEmpreinte: SEL_EMPREINTE,
  memory: memoire,
  /**
   * Etat des dependances, pour la commande de diagnostic.
   *
   * On annonce ce qui est VERIFIE, pas ce qui est configure : une cle presente
   * ne prouve pas qu'elle fonctionne, et une URL posee ne prouve pas que la
   * route repond.
   */
  diagnostic: async () => {
    const etats = ia?.etatFournisseurs ?? {};
    const dispo = Object.entries(etats)
      .filter(([, e]) => e.statut === "disponible")
      .map(([n]) => n);
    const configures = Object.entries(etats)
      .filter(([, e]) => e.statut !== "non_configure" && e.statut !== "desactive")
      .map(([n]) => n);
    return {
      ia: !ia
        ? "aucun fournisseur"
        : dispo.length
          ? `disponible (${dispo.join(", ")})`
          : `configure mais pas encore eprouve (${configures.join(", ") || "aucun"})`,
      backend: backendConfigure ? "configure" : "non configure",
      memoire: memoire ? "Neon active" : "desactivee",
    };
  },
  interpret: async (texte, ctx = {}) => {
    if (!ia) throw new Error("Aucun fournisseur IA configuré : compréhension indisponible.");
    const listes = await referentiel.pour(ctx.staff?.id);
    const mem = ctx.memory ?? {};
    const pending = mem.pending ?? null;

    // Une réponse courte à une clarification est résolue sans LLM.
    if (
      pending?.intention === "clarification" &&
      pending.tool === "eleves.rechercher" &&
      (pending.missingFields ?? []).includes("classeId")
    ) {
      const resolution = resoudreClasse(listes.classes, texte);
      if (resolution.statut === "unique") {
        return {
          intention: "outil",
          outil: "eleves.rechercher",
          params: { ...(pending.params ?? {}), classeId: resolution.classe.id },
        };
      }
      const candidats = (resolution.candidats ?? []).map((c) => c.libelle ?? c.code ?? c.nom ?? "?");
      return {
        intention: "clarifier",
        question: resolution.statut === "ambigu"
          ? "Plusieurs classes correspondent. Précisez laquelle : " + candidats.join(", ") + "."
          : "Je ne retrouve pas cette classe dans le référentiel. Indiquez son libellé exact.",
        outil: "eleves.rechercher",
        params: pending.params ?? {},
        missingFields: ["classeId"],
      };
    }

    // Cas fréquent : le responsable demande la liste sans préciser la classe.
    const demandeListeEleves =
      /\b(?:quels?\s+sont|quelles?\s+sont|qui\s+sont|liste|affiche|montre|donne)\b[\s\S]{0,100}\b(?:eleves?|élèves?)\b/iu.test(texte) &&
      /\bclasse\b/iu.test(texte);
    if (demandeListeEleves) {
      const match = String(texte).match(/\bclasse\b(?:\s+(?:de|du|des|la))?\s+(.+?)(?:[?.!,;]|$)/iu);
      const libelle = match?.[1]?.trim();
      if (!libelle) {
        return {
          intention: "clarifier",
          question: "De quelle classe souhaitez-vous consulter la liste des élèves ?",
          outil: "eleves.rechercher",
          params: {},
          missingFields: ["classeId"],
        };
      }
      const resolution = resoudreClasse(listes.classes, libelle);
      if (resolution.statut === "unique") {
        return {
          intention: "outil",
          outil: "eleves.rechercher",
          params: { classeId: resolution.classe.id },
        };
      }
      const candidats = (resolution.candidats ?? []).map((c) => c.libelle ?? c.code ?? c.nom ?? "?");
      return {
        intention: "clarifier",
        question: resolution.statut === "ambigu"
          ? "Plusieurs classes correspondent. Précisez laquelle : " + candidats.join(", ") + "."
          : "Je ne retrouve pas cette classe dans le référentiel. Indiquez son libellé exact.",
        outil: "eleves.rechercher",
        params: {},
        missingFields: ["classeId"],
      };
    }

    const messages = [
      { role: "system", content: outils.invitePourNlu() },
      { role: "system", content: Referentiel.enTexte(listes) },
      {
        role: "system",
        content: "L'historique aide à comprendre les réponses courtes et les pronoms. " +
          "Les données scolaires officielles doivent toujours être consultées avec un outil réel ; " +
          "ne les déduis jamais d'un ancien message.",
      },
    ];
    for (const resume of mem.summaries ?? []) {
      messages.push({ role: "system", content: "Résumé antérieur : " + resume });
    }
    for (const fait of mem.facts ?? []) {
      messages.push({
        role: "system",
        content: "Contexte non sensible mémorisé (" + fait.category + ") : " + fait.key + " = " + fait.value,
      });
    }
    if (pending?.intention === "clarification" && pending.tool) {
      messages.push({
        role: "system",
        content: "REPRISE OBLIGATOIRE : l'utilisateur répond à ta question précédente. " +
          "Conserve l'outil " + pending.tool + ", les paramètres déjà collectés " +
          JSON.stringify(pending.params ?? {}) + " et complète uniquement les champs manquants " +
          JSON.stringify(pending.missingFields ?? []) + ". Utilise le référentiel fourni, n'invente aucun identifiant.",
      });
    }
    for (const message of (mem.history ?? []).slice(-12)) {
      if (["user", "assistant"].includes(message.role) && typeof message.content === "string") {
        messages.push({ role: message.role, content: message.content.slice(-8_000) });
      }
    }
    messages.push({ role: "user", content: texte });

    const r = await ia.completerJson(messages);
    const plan = r.objet;
    if (!plan) return { clarify: "Je n'ai pas compris la demande." };
    if (plan.clarify) {
      return {
        intention: "clarifier",
        question: plan.clarify,
        outil: plan.tool ?? plan.outil ?? undefined,
        params: plan.params ?? {},
        missingFields: plan.missingFields ?? [],
      };
    }
    const nomOutil = plan.tool ?? plan.outil;
    if (!nomOutil) return plan;

    const outil = outils.get(nomOutil);
    const conv = await resoudreNomsEleves({
      outil,
      params: plan.params ?? {},
      guergne,
      acteurId: ctx.staff?.id,
    });
    if (conv.statut === "clarifier") {
      return {
        intention: "clarifier",
        question: conv.question,
        outil: nomOutil,
        params: plan.params ?? {},
        missingFields: ["recherche"],
      };
    }
    return { ...plan, tool: nomOutil, params: conv.params };
  },
  transcribe: async (media) => {
    if (!ia) throw new Error("Aucun fournisseur IA configuré : transcription indisponible.");
    return media ? (await ia.transcrire(media.data ?? media)).texte : '';
  },
});

provider.onMessage((msg) => agent.handle(msg));

// --- Santé : un processus vivant ne signifie pas que WhatsApp fonctionne ----
/** En-têtes communs : rien de ce qui touche à l'appairage ne doit être mis en cache. */
function entetesSurs(extra = {}) {
  return {
    "cache-control": "no-store, no-cache, must-revalidate, private",
    pragma: "no-cache",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    ...extra,
  };
}

/**
 * Origine de la requête, pour la limitation par adresse.
 *
 * `X-Forwarded-For` est trivialement falsifiable : on ne s'y fie que si le
 * service est explicitement déclaré derrière un proxy de confiance. Sinon on
 * prend l'adresse de la socket, qui ne se falsifie pas.
 */
const DERRIERE_PROXY = String(env("TRUST_PROXY", "false")).toLowerCase() === "true";
function origineDe(req) {
  if (DERRIERE_PROXY) {
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  }
  return req.socket?.remoteAddress ?? "inconnue";
}

/** Vérifie le jeton d'appairage. Ni le jeton ni la raison du refus ne sont journalisés. */
function autorise(req, res) {
  const r = pairing.verifier(req.headers["x-pairing-token"], { origine: origineDe(req) });
  if (r.ok) return true;
  const code = r.raison === "trop_de_tentatives" ? 429 : r.raison === "revoque" ? 410 : 401;
  res.writeHead(code, entetesSurs({ "content-type": "application/json" }))
    .end(JSON.stringify({ erreur: r.raison }));
  return false;
}

createServer(async (req, res) => {
  const url = (req.url || "").split("?")[0];

  if (url.startsWith("/pairing")) {
    if (req.method !== "GET") {
      res.writeHead(405, entetesSurs({ allow: "GET" })).end();
      return;
    }

    // La page elle-même ne contient aucun secret : le jeton arrive côté client
    // par le fragment d'URL, que le navigateur n'envoie jamais au serveur.
    if (url === "/pairing") {
      const e = pairing.etat();
      res.writeHead(200, entetesSurs({ "content-type": "text/html; charset=utf-8" }))
        .end(pageAppairage({ etat: e.etat, resteMs: e.resteMs }));
      return;
    }

    if (url === "/pairing/etat") {
      // Une fois WhatsApp authentifie, seul l'etat non sensible reste public ;
      // le QR et ses donnees restent inaccessibles et le jeton demeure brule.
      if (!pairing.authentifie && !autorise(req, res)) return;
      res.writeHead(200, entetesSurs({ "content-type": "application/json" }))
        .end(JSON.stringify(pairing.etat()));
      return;
    }

    if (url === "/pairing/qr") {
      if (!autorise(req, res)) return;
      const valeur = pairing.valeurCourante();
      if (!valeur) {
        res.writeHead(409, entetesSurs({ "content-type": "application/json" }))
          .end(JSON.stringify({ erreur: pairing.etat().etat }));
        return;
      }
      // Vrai QR lisible par WhatsApp, généré à la demande et jamais stocké.
      const png = await QRCode.toBuffer(valeur, { type: "png", width: 512, margin: 2 });
      res.writeHead(200, entetesSurs({ "content-type": "image/png", "content-length": png.length }))
        .end(png);
      return;
    }

    res.writeHead(404, entetesSurs()).end();
    return;
  }

  if (url !== "/sante") {
    res.writeHead(404, entetesSurs()).end();
    return;
  }
  const wa = provider.getConnectionStatus();
  const corps = {
    processus: "ok",
    whatsapp: wa.state,
    reconnexions: wa.reconnexions,
    fournisseursIA: ia?.etatFournisseurs ?? {},
    configuration: { backend: backendConfigure, ia: Boolean(ia) },
    attenteScanQr: wa.state === "qr",
    verrou: { detenu: verrou.detientToujours(), instance: verrou.instanceId.slice(0, 8), pid: process.pid },
    // Sans mesure, « l'agent travaille seul » reste une impression.
    autonomie: agent.metriques,
    politiques: politiques.politiques,
    appairage: pairing.etat().etat,
    appairageOuvert: pairing.actif,
    memoireMo: Math.round(process.memoryUsage().rss / 1024 / 1024),
    tempsDeMarcheS: Math.round(process.uptime()),
  };
  const sain = wa.state === "ready" && Boolean(ia?.disponibles.length) && backendConfigure;
  res.writeHead(sain ? 200 : 503, { "content-type": "application/json" }).end(JSON.stringify(corps));
}).listen(CONF.port, "0.0.0.0", () => console.log(`[sante] ecoute sur 0.0.0.0:${CONF.port}`));

// --- Arrêt propre -----------------------------------------------------------
async function arreter(signal) {
  console.log(`[arret] ${signal} recu`);
  clearInterval(battement);
  try {
    await provider.disconnect();
  } finally {
    verrou.liberer();
    process.exit(0);
  }
}
process.on("SIGTERM", () => arreter("SIGTERM"));
process.on("SIGINT", () => arreter("SIGINT"));

// Dernière vérification avant d'ouvrir la session : entre l'acquisition et ce
// point, le service a monté ses dépendances et son serveur HTTP. Si une autre
// instance a pris le verrou dans cet intervalle, connecter WhatsApp ferait
// exactement ce que le verrou existe pour empêcher.
if (!verrou.detientToujours()) {
  console.error("[verrou] le verrou a change de main pendant le demarrage ; arret avant connexion WhatsApp.");
  process.exit(1);
}

console.log("[demarrage] connexion WhatsApp...");
await provider.connect();
// Le QR est transmis directement à Pairing par le callback surQr ; aucun état parallèle ici.
