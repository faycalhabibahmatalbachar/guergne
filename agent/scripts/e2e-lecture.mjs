/**
 * Démonstration bout-en-bout (lecture) : message → NLU Groq → moteur d'agent →
 * API guergne → base Neon réelle → compte rendu.
 *
 * C'est la chaîne du critère final, sans le maillon WhatsApp (qui attend le
 * numéro dédié et le scan du QR). Rien n'est simulé ici hormis le transport :
 * le LLM, l'API et la base sont réels.
 *
 * Prérequis : serveur web lancé sur http://localhost:3000, `web/.env.local`
 * contenant AGENT_SERVICE_TOKEN, et `grok.env` contenant la clé Groq.
 * Aucun secret n'est affiché.
 *
 *   node agent/scripts/e2e-lecture.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Agent } from "../src/engine.js";
import { FakeProvider } from "../src/provider.js";
import { IdentityStore } from "../src/identity.js";
import { IdempotencyStore } from "../src/idempotency.js";
import { AuditLog } from "../src/audit.js";
import { MatricePermissions } from "../src/permissions-matrix.js";
import { ToolRegistry, ASSIDUITE_TOOLS } from "../src/tools.js";
import { GuergneHttpClient } from "../src/guergne-client.js";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const lire = (f, k) => {
  const t = readFileSync(resolve(racine, f), "utf8");
  return (t.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
};

const SERVICE_TOKEN = lire("web/.env.local", "AGENT_SERVICE_TOKEN");
const GROQ_KEY = lire("ai_apikey.env", "grok_api");
const ACTEUR = process.env.ACTEUR_ID ?? "e49a3dea-76b3-4607-9ccb-2b5fcf3ac0ad";
const JID = "23566000001@c.us";

if (!SERVICE_TOKEN || !GROQ_KEY) {
  console.error("Secrets manquants (AGENT_SERVICE_TOKEN / grok_api).");
  process.exit(1);
}

/** NLU réel : Groq choisit un outil du registre et ses paramètres. */
function interpretGroq(registre) {
  const catalogue = registre
    .all()
    .map((t) => `${t.name} (${t.sensitivity})`)
    .join(", ");
  return async (texte) => {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              `Tu choisis UN outil parmi : ${catalogue}. ` +
              `Reponds UNIQUEMENT en JSON {"tool":"<nom>","params":{...}}. ` +
              `Si la demande est ambigue, reponds {"clarify":"<question>"}.`,
          },
          { role: "user", content: texte },
        ],
      }),
    });
    const d = await r.json();
    const brut = d.choices?.[0]?.message?.content ?? "";
    const m = brut.match(/\{[\s\S]*\}/);
    if (!m) return { clarify: "Je n'ai pas compris." };
    try {
      return JSON.parse(m[0]);
    } catch {
      return { clarify: "Je n'ai pas compris." };
    }
  };
}

const provider = new FakeProvider();
const audit = new AuditLog();
const tools = new ToolRegistry(ASSIDUITE_TOOLS);

const agent = new Agent({
  provider,
  identity: new IdentityStore([{ jid: JID, id: ACTEUR, nom: "Compte de service", role: "SUPER_ADMIN" }]),
  idempotency: new IdempotencyStore(),
  audit,
  tools,
  permissions: new MatricePermissions(),
  guergne: new GuergneHttpClient({ baseUrl: "http://localhost:3000", serviceToken: SERVICE_TOKEN }),
  interpret: interpretGroq(tools),
});

const demande = process.argv[2] ?? "Montre-moi les 3 dernieres absences enregistrees.";
console.log("MESSAGE  :", demande);

const r = await agent.handle({ id: "e2e-" + Date.now(), from: JID, body: demande });

console.log("STATUT   :", r.status);
const e = audit.last();
console.log("OUTIL    :", e?.intent);
console.log("PERM     :", e?.permission);
console.log("RESULTAT :", e?.result);
console.log("REPONSE  :", provider.lastTextTo(JID)?.slice(0, 120));
const lignes = r.result?.data;
if (Array.isArray(lignes)) {
  console.log("DONNEES  :", lignes.length, "ligne(s) depuis la base reelle");
  for (const l of lignes.slice(0, 3)) {
    console.log(`   - ${l.prenom ?? ""} ${l.nom ?? ""} (${l.classe ?? "?"}) ${l.dateAbsence ?? ""}`);
  }
}
