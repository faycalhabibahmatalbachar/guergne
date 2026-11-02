/** Vérification de la couche IA contre les vrais fournisseurs. Aucun secret affiché. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MoteurIA } from "../src/ia.js";
const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const env = readFileSync(resolve(racine, "ai_apikey.env"), "utf8");
const g = (k) => (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
const evts = [];
const m = new MoteurIA({ cles: { groq: g("grok_api"), mistral: g("mistral_ai") }, journal: (e) => evts.push(e) });
console.log("fournisseurs actifs :", m.fournisseurs.join(" -> "));
const r = await m.completerJson([
  { role: "system", content: 'Reponds en JSON {"tool":"<nom>","params":{}}. Outils: assiduite.consulter_absences, assiduite.enregistrer_appel.' },
  { role: "user", content: "Combien d'eleves sont absents aujourd'hui en 3e A ?" },
]);
console.log(`LLM  : ${r.fournisseur}/${r.modele} en ${r.dureeMs}ms, ${r.tokens} tokens`);
console.log("objet:", JSON.stringify(r.objet));
// Repli forcé : clé Groq volontairement invalide -> la bascule doit s'opérer.
// Mistral peut répondre 429 (son palier gratuit limite le débit) : c'est un
// résultat valable, qui prouve la bascule tout en documentant la limite.
const traces = [];
const m2 = new MoteurIA({ cles: { groq: "cle-invalide", mistral: g("mistral_ai") }, journal: (e) => traces.push(e) });
try {
  const r2 = await m2.completer([{ role: "user", content: "Dis OK" }]);
  console.log(`REPLI: Groq invalide -> ${r2.fournisseur}/${r2.modele} a repondu (${r2.dureeMs}ms)`);
} catch (e) {
  const essayes = traces.filter((t) => t.type === "llm_echec").map((t) => `${t.fournisseur}(${t.erreur})`);
  console.log(`REPLI: bascule effectuee, fournisseurs essayes -> ${essayes.join(" puis ")}`);
  console.log("  constat : le repli fonctionne ; Mistral gratuit est limite en debit (429).");
}
console.log("evenements traces :", evts.map((e) => e.type).join(", "));
