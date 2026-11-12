/**
 * Parler à l'agent sans WhatsApp : une conversation de banc, tour par tour.
 *
 *   node banc/parler.mjs "les absents de 6e A" "et les retards ?"
 *   BANC_ROLE=SURVEILLANT node banc/parler.mjs "..."
 *   BANC_MEMOIRE=non node banc/parler.mjs "..."     (comportement sans mémoire)
 *
 * Chaque argument est un message du même fil. Affiche ce que l'agent a compris,
 * ce qu'il a appelé, et ce qu'il a répondu.
 */
import "./extensions.mjs";
import { ouvrirConversation, ouvrirIA, ouvrirOracle } from "./moteur.mjs";

const oracle = await ouvrirOracle();
const role = process.env.BANC_ROLE ?? "SUPER_ADMIN";
const [acteur] = await oracle.q(
  "SELECT id::text, role FROM utilisateurs WHERE NOT donnees_semees AND role = $1 AND actif ORDER BY cree_le LIMIT 1",
  [role],
);
if (!acteur) throw new Error("Aucun acteur actif de rôle " + role + " dans la base de test");

const evenementsIA = [];
const ia = ouvrirIA((e) => evenementsIA.push(e));
const conv = ouvrirConversation({ ia, acteur, memoire: process.env.BANC_MEMOIRE !== "non", evenementsIA });

for (const message of process.argv.slice(2)) {
  const t = await conv.dire(message);
  console.log("\n\x1b[1;34m> " + message + "\x1b[0m");
  console.log(
    "\x1b[0;90m  intention=" + t.intention + " outil=" + t.outil + " statut=" + t.statut +
      " | llm " + t.llm.appels + " appel(s), " + t.llm.tokens + " jetons, " + t.llm.ms + " ms (" + t.llm.fournisseurs.join(",") + ")" +
      " | total " + t.dureeMs + " ms\x1b[0m",
  );
  for (const a of t.appels) {
    console.log("\x1b[0;90m  → " + a.action + " " + JSON.stringify(a.params ?? {}).slice(0, 200) + (a.ok ? "" : "  ✗ " + a.message) + " (" + a.ms + " ms)\x1b[0m");
  }
  console.log(t.reponse || "(aucune réponse)");
}
await oracle.fermer();
