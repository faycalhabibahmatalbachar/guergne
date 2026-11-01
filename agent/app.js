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
import { createServer } from "node:http";
import QRCode from "qrcode";
import { chmodSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { AuditLog } from "./src/audit.js";
import { Agent } from "./src/engine.js";
import { GuergneHttpClient } from "./src/guergne-client.js";
import { IdentityStorePersistant } from "./src/identity-store.js";
import { MoteurIA } from "./src/ia.js";
import { Pairing, jetonAleatoire, pageAppairage } from "./src/pairing.js";
import { MatricePermissions } from "./src/permissions-matrix.js";
import { Referentiel } from "./src/referentiel.js";
import { DedupPersistant, VerrouInstance, cheminsPersistants } from "./src/persistance.js";
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
  cles: { groq: env("GROQ_API_KEY"), mistral: env("MISTRAL_API_KEY") },
};

const chemins = cheminsPersistants(CONF.donnees);
mkdirSync(chemins.racine, { recursive: true });

// --- Verrou avant toute connexion WhatsApp ---------------------------------
const verrou = new VerrouInstance({ chemin: chemins.verrou });
const prise = verrou.acquerir();
if (!prise.ok) {
  console.error(
    `[verrou] une autre instance (pid ${prise.detenuPar}) utilise deja la session ; ` +
      `arret pour ne pas faire bannir le numero.`,
  );
  process.exit(1);
}
const battement = setInterval(() => verrou.rafraichir(), 20_000);
battement.unref?.();

// --- Dépendances ------------------------------------------------------------
const audit = new AuditLog((e) =>
  console.log(JSON.stringify({ ts: e.at, type: "audit", run: e.runId, intent: e.intent, result: e.result })),
);
const iaConfiguree = Boolean(CONF.cles.groq || CONF.cles.mistral);
const backendConfigure = Boolean(CONF.apiEcole && CONF.jetonService);

// Le transport WhatsApp et l'appairage démarrent sans IA ni API.
// Toute action scolaire échoue explicitement tant que le backend n'est pas branché.
const ia = iaConfiguree
  ? new MoteurIA({
      cles: CONF.cles,
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

// L'association numéro → compte interne vit en base côté guergne. Tant que ce
// point n'est pas branché, le magasin démarre vide : AUCUN numéro n'est reconnu,
// donc aucune opération n'est possible. C'est le défaut sûr.
const identites = new IdentityStorePersistant({
  chemin: join(chemins.racine, "identites.json"),
  journal: (e) => console.log(JSON.stringify({ ts: e.at, ...e })),
});
console.log(`[identites] ${identites.nombreActives} association(s) active(s)`);

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

const agent = new Agent({
  provider,
  identity: identites,
  idempotency: new DedupPersistant({ chemin: chemins.dedup }),
  audit,
  tools: outils,
  permissions: new MatricePermissions(),
  guergne,
  interpret: async (texte, ctx = {}) => {
    if (!ia) throw new Error("Aucun fournisseur IA configuré : compréhension indisponible.");
    // Deux sources, deux roles. L'invite vient du registre : c'est lui qui
    // connait les parametres que l'API honore — un modele a qui l'on ne decrit
    // aucun parametre ne peut en remplir aucun. Le referentiel vient de la
    // plateforme : il porte les classes et les periodes que l'utilisateur
    // nomme, pour que le modele recopie un identifiant reel au lieu d'en
    // reclamer un a quelqu'un qui ne le connait pas.
    // Le moteur passe `{ staff, tools }` : l'identite de l'acteur est dans
    // `staff.id`, et c'est elle qui determine le perimetre des listes.
    const listes = await referentiel.pour(ctx.staff?.id);
    const r = await ia.completerJson([
      { role: "system", content: outils.invitePourNlu() },
      { role: "system", content: Referentiel.enTexte(listes) },
      { role: "user", content: texte },
    ]);
    return r.objet ?? { clarify: "Je n'ai pas compris la demande." };
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

console.log("[demarrage] connexion WhatsApp...");
await provider.connect();
// Le QR est transmis directement à Pairing par le callback surQr ; aucun état parallèle ici.
