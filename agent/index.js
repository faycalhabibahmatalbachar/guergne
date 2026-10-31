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
import { mkdirSync } from "node:fs";

import { AuditLog } from "./src/audit.js";
import { Agent } from "./src/engine.js";
import { GuergneHttpClient } from "./src/guergne-client.js";
import { IdentityStore } from "./src/identity.js";
import { MoteurIA } from "./src/ia.js";
import { MatricePermissions } from "./src/permissions-matrix.js";
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
  port: Number(env("PORT", "8080")),
  apiEcole: requis("SCHOOL_API_BASE_URL"),
  jetonService: requis("AGENT_SERVICE_TOKEN"),
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
const ia = new MoteurIA({
  cles: CONF.cles,
  journal: (e) => console.log(JSON.stringify({ ts: new Date().toISOString(), ...e })),
});
const guergne = new GuergneHttpClient({ baseUrl: CONF.apiEcole, serviceToken: CONF.jetonService });
const outils = new ToolRegistry(ASSIDUITE_TOOLS);

// L'association numéro → compte interne vit en base côté guergne. Tant que ce
// point n'est pas branché, le magasin démarre vide : AUCUN numéro n'est reconnu,
// donc aucune opération n'est possible. C'est le défaut sûr.
const identites = new IdentityStore();

let dernierQr = null;
const provider = new WwebjsProvider({
  dossierSession: chemins.session,
  surQr: (qr) => {
    dernierQr = qr;
  },
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
  interpret: async (texte) => {
    const catalogue = outils.all().map((t) => `${t.name} (${t.sensitivity})`).join(", ");
    const r = await ia.completerJson([
      {
        role: "system",
        content:
          `Tu choisis UN outil parmi : ${catalogue}. ` +
          `Reponds en JSON {"tool":"<nom>","params":{}}. ` +
          `Si la demande est ambigue ou incomplete, reponds {"clarify":"<question>"}.`,
      },
      { role: "user", content: texte },
    ]);
    return r.objet ?? { clarify: "Je n'ai pas compris la demande." };
  },
  transcribe: async (media) => (media ? (await ia.transcrire(media.data ?? media)).texte : ""),
});

provider.onMessage((msg) => agent.handle(msg));

// --- Santé : un processus vivant ne signifie pas que WhatsApp fonctionne ----
createServer(async (req, res) => {
  if (req.url !== "/sante") {
    res.writeHead(404).end();
    return;
  }
  const wa = provider.getConnectionStatus();
  const corps = {
    processus: "ok",
    whatsapp: wa.state,
    reconnexions: wa.reconnexions,
    fournisseursIA: ia.etatFournisseurs,
    attenteScanQr: wa.state === "qr",
    memoireMo: Math.round(process.memoryUsage().rss / 1024 / 1024),
    tempsDeMarcheS: Math.round(process.uptime()),
  };
  const sain = wa.state === "ready" && ia.disponibles.length > 0;
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
if (dernierQr) console.log("[demarrage] en attente du scan du QR");
