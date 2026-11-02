/**
 * Contrôle de l'état de production, en LECTURE SEULE.
 *
 * Un seul script à lancer après chaque intervention. Il ne corrige rien : il
 * constate, et dit quelle est l'étape suivante. C'est délibéré — un outil qui
 * répare en même temps qu'il mesure ne permet plus de savoir ce qui était
 * cassé.
 *
 * Il distingue les quatre réponses possibles de la route agent, parce qu'elles
 * appellent quatre gestes différents :
 *
 *   404  la route n'est pas déployée        → fusionner dans main
 *   503  déployée, jeton de service absent  → poser AGENT_SERVICE_TOKEN
 *   401  déployée et protégée               → tout va bien, brancher l'agent
 *   200  authentifiée                       → un jeton valide a été présenté
 *
 *   node agent/scripts/verif-production.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const lireEnv = (chemin, cle) => {
  const p = resolve(racine, chemin);
  if (!existsSync(p)) return undefined;
  return (readFileSync(p, "utf8").match(new RegExp("^" + cle + "=(.*)$", "m")) || [])[1]
    ?.trim()
    .replace(/^["']|["']$/g, "");
};

const BASE_WEB = process.env.BASE_WEB ?? "https://lycee-guergne-renaissance.vercel.app";
const BASE_AGENT = process.env.BASE_AGENT ?? "http://se-kna02.altare.global:25278";

const ok = (b) => (b ? "OK   " : "A FAIRE");
const etapes = [];

// --- 1. La plateforme scolaire ---------------------------------------------
console.log("=== 1. PLATEFORME (Vercel) ===");
let codeAgent = null;
try {
  const r = await fetch(`${BASE_WEB}/api/agent/listerAlertes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(25_000),
  });
  codeAgent = r.status;
  const corps = await r.text();
  console.log(`  POST /api/agent/listerAlertes -> HTTP ${codeAgent}`);
  console.log(`    ${corps.slice(0, 110)}`);
} catch (e) {
  console.log(`  POST /api/agent/listerAlertes -> INJOIGNABLE (${e.message})`);
}

const verdict = {
  404: "la route n'est pas deployee — fusionner la branche dans main",
  503: "route deployee, AGENT_SERVICE_TOKEN absent cote Vercel — c'est l'etape suivante",
  401: "route deployee ET protegee — etat attendu, l'agent peut etre branche",
  200: "route authentifiee (un jeton valide a ete presente)",
}[codeAgent] ?? "etat inattendu, a examiner";
console.log(`  VERDICT : ${verdict}`);
if (codeAgent === 404) etapes.push("Fusionner ai-school-agent-p0-audit dans main");
if (codeAgent === 503) etapes.push("Poser AGENT_SERVICE_TOKEN sur Vercel, puis redeployer");

// Le jeton local existe-t-il ? On ne montre QUE sa longueur.
const jetonLocal = lireEnv("web/.env.local", "AGENT_SERVICE_TOKEN");
console.log(`  AGENT_SERVICE_TOKEN dans web/.env.local : ${jetonLocal ? `present (${jetonLocal.length} caracteres)` : "ABSENT"}`);

// --- 2. La passerelle WhatsApp ---------------------------------------------
console.log("\n=== 2. PASSERELLE WHATSAPP (Altare) ===");
let sante = null;
try {
  const r = await fetch(`${BASE_AGENT}/sante`, { signal: AbortSignal.timeout(25_000) });
  sante = await r.json();
} catch (e) {
  console.log(`  /sante INJOIGNABLE (${e.message}) — le service est arrete`);
  etapes.push("Demarrer le service depuis le panneau Altare");
}

if (sante) {
  const t = Math.round(sante.tempsDeMarcheS / 60);
  console.log(`  whatsapp = ${sante.whatsapp}   instance = ${sante.verrou?.instance}   en marche depuis ${t} min`);
  console.log(`  configuration = ${JSON.stringify(sante.configuration)}`);
  const politiques = sante.politiques?.length ?? 0;
  const file = sante.notifications ?? null;
  console.log(`  politiques chargees = ${politiques}${politiques === 0 ? "  <- code ANCIEN en memoire" : ""}`);
  console.log(`  file de notifications = ${file ? JSON.stringify(file) : "ABSENTE  <- code ANCIEN en memoire"}`);
  const auto = sante.autonomie ?? {};
  console.log(
    `  autonomie = messages ${auto.messages ?? "?"}, automatiques ${auto.automatiques ?? "?"}, ` +
      `confirmations ${auto.confirmationsDemandees ?? "?"}, taux ${auto.tauxAutonomie ?? "?"}`,
  );
  if (politiques === 0 || !file) etapes.push("Redemarrer le service Altare pour charger le code deploye");
  if (sante.configuration?.backend === false) etapes.push("Poser SCHOOL_API_BASE_URL (apres que la route reponde 401)");
}

// --- 3. Le code réellement déposé sur le serveur ---------------------------
console.log("\n=== 3. CODE DEPOSE SUR ALTARE (disque, pas memoire) ===");
try {
  const SftpClient = (await import("ssh2-sftp-client")).default;
  const c = {
    host: String(lireEnv("altare.env", "ALTARE_SFTP_HOST") ?? "").replace(/^sftp:\/\//, "").split(":")[0],
    port: Number(lireEnv("altare.env", "ALTARE_SFTP_PORT") ?? 2022),
    username: lireEnv("altare.env", "ALTARE_SFTP_USER"),
    password: lireEnv("altare.env", "ALTARE_SFTP_PASSWORD"),
    readyTimeout: Number(process.env.ALTARE_READY_TIMEOUT_MS ?? 120_000),
  };
  const s = new SftpClient();
  await s.connect(c);
  const h = (b) => createHash("sha256").update(b).digest("hex").slice(0, 10);
  const fichiers = [
    "app.js",
    "src/engine.js",
    "src/notifications.js",
    "src/politiques.js",
    "src/mission.js",
    "src/document.js",
    "src/tools.js",
    "src/tools-pilotage.js",
    "src/rendu.js",
    "src/jid.js",
  ];
  let ecarts = 0;
  for (const f of fichiers) {
    const local = h(readFileSync(resolve(racine, "agent", f)));
    let distant = "ABSENT";
    try {
      distant = h(await s.get(`./${f}`));
    } catch {
      /* absent */
    }
    if (local !== distant) {
      ecarts += 1;
      console.log(`  DIFFERENT  ${f}`);
    }
  }
  console.log(`  ${ecarts === 0 ? `${fichiers.length} fichiers identiques au depot` : `${ecarts} ecart(s) — relancer altare.mjs upload`}`);
  if (ecarts > 0) etapes.push("node agent/scripts/altare.mjs upload");

  const env = (await s.get("./.env")).toString("utf8");
  const noms = [...env.matchAll(/^([A-Z_]+)=/gm)].map((m) => m[1]);
  console.log(`  .env du serveur : ${noms.join(", ")}`);
  console.log(`  SCHOOL_API_BASE_URL : ${noms.includes("SCHOOL_API_BASE_URL") ? "presente" : "ABSENTE"}`);

  const ident = JSON.parse((await s.get("./donnees/identites.json")).toString("utf8"));
  const actives = ident.filter((a) => !a.revoqueLe && !a.suspendu);
  console.log(`  identites : ${actives.length} active(s) — roles ${[...new Set(actives.map((a) => a.role))].join(", ")}`);
  await s.end();
} catch (e) {
  console.log(`  SFTP indisponible : ${String(e.message).slice(0, 90)}`);
}

// --- 4. Ce qu'il reste à faire ---------------------------------------------
console.log("\n=== ETAPES RESTANTES ===");
if (etapes.length === 0) {
  console.log("  Aucune. La chaine est complete.");
} else {
  [...new Set(etapes)].forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
}
process.exitCode = etapes.length ? 1 : 0;
