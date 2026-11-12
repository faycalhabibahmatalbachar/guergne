// Ce que le modèle VOIT, exactement : l'invite assemblée à l'exécution pour un message.
//   node banc/invite.mjs "les retards de la semaine" [--tout]
import "./extensions.mjs";
import { join } from "node:path";
import { GuergneHttpClient } from "../src/guergne-client.js";
import { Referentiel } from "../src/referentiel.js";
import { ToolRegistry, ASSIDUITE_TOOLS } from "../src/tools.js";
import { creerInterprete } from "../src/interprete.js";
import { BACKEND, lireEnv, ouvrirOracle, racineAgent } from "./moteur.mjs";

const o = await ouvrirOracle();
const [a] = await o.q("SELECT id::text, role FROM utilisateurs WHERE NOT donnees_semees AND role='SUPER_ADMIN' AND actif ORDER BY cree_le LIMIT 1");
const [c] = await o.q("SELECT id::text FROM classes WHERE code = '6A'");
await o.fermer();
const guergne = new GuergneHttpClient({ baseUrl: BACKEND, serviceToken: lireEnv(join(racineAgent, ".env"), "AGENT_SERVICE_TOKEN") });
const outils = new ToolRegistry(ASSIDUITE_TOOLS);
const interpret = creerInterprete({ ia: {}, outils, referentiel: new Referentiel({ guergne }), guergne, resolutionCentrale: true });
const memory = {
  history: [{ role: "user", content: "les absences de la 6e A" }, { role: "assistant", content: "(consultation effectuee : assiduite.consulter_absences)" }],
  lastTask: { tool: "assiduite.consulter_absences", params: { classeId: c.id, statut: "NON_JUSTIFIEE" } },
  foyer: { classeId: c.id, eleveIds: ["x", "y", "z"] },
};
const { messages } = await interpret.assembler(process.argv[2] ?? "et les retards ?", { staff: a, memory });
const total = messages.reduce((s, m) => s + m.content.length, 0);
console.log(messages.length + " messages, " + total + " caractères (≈ " + Math.round(total / 3.2) + " jetons)");
for (const [i, m] of messages.entries()) {
  console.log("\n--- [" + i + "] " + m.role + " (" + m.content.length + " car.) ---");
  console.log(process.argv.includes("--tout") || i > 0 ? m.content : m.content.slice(0, 2600) + "\n[… registre des outils tronqué à l'affichage : --tout pour le voir en entier]");
}
const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
console.log("\nIdentifiant technique dans l'invite : " + (messages.some((m) => uuid.test(m.content)) ? "OUI — défaut" : "aucun"));
