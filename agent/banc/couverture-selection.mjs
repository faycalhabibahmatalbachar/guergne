/**
 * La sélection d'outils cache-t-elle le bon outil ? Vérifié sur TOUT le
 * catalogue de scénarios, sans modèle : pour chaque tour qui attend un outil,
 * l'un des outils admis doit être détaillé dans l'invite.
 *
 *   node banc/couverture-selection.mjs
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ToolRegistry, ASSIDUITE_TOOLS } from "../src/tools.js";
import { selectionnerOutils } from "../src/selection-outils.js";
import { racineAgent } from "./moteur.mjs";

const r = new ToolRegistry(ASSIDUITE_TOOLS);
const f = { unique: { prenom: "Achta", nom: "DJIMET", matricule: "LGR-2025-1127", classe: "5ème A", tuteurs: [{ prenom: "Abdoulaye", nom: "DJIMET", telephone: "+23561000187", lien: "PERE", est_principal: true }], finances: {}, assiduite: {} },
  homonymes: { prenom: "Amina", nom: "ABAKAR", eleves: [{ matricule: "x", classe: "4ème B" }, { matricule: "y", classe: "3ème A" }] }, enseignant: { prenom: "Fatimé", nom: "ABDELKERIM" }, classes: {}, absences: {}, retards: {}, totaux: {}, annee: {}, nombre: () => /x/ };
const dossier = join(racineAgent, "banc", "scenarios");
let total = 0, ok = 0, tous = 0;
const manques = [];
for (const fichier of readdirSync(dossier).filter((x) => x.endsWith(".mjs")).sort()) {
  for (const s of (await import(pathToFileURL(join(dossier, fichier)).href)).default) {
    let dernier = null;
    for (const t of s.tours) {
      if (!t.dit) continue;
      const dit = typeof t.dit === "function" ? t.dit(f) : t.dit;
      const admis = [].concat(t.outil ?? []).filter((x) => x && x !== "mission");
      const sel = selectionnerOutils({ texte: dit, outils: r.all(), dernierOutil: dernier });
      if (admis.length) {
        total += 1;
        if (!sel.detailles) { tous += 1; ok += 1; }
        else if (admis.some((a) => sel.detailles.has(a))) ok += 1;
        else manques.push(s.id + " « " + dit.slice(0, 60) + " » attend " + admis.join("|") + " — détaillés : " + [...sel.detailles].join(","));
        dernier = admis[0];
      }
    }
  }
}
console.log("tours avec outil attendu : " + total + " — outil détaillé : " + ok + " (dont " + tous + " avec registre complet)");
for (const m of manques) console.log("  MANQUE " + m.slice(0, 260));
process.exitCode = manques.length ? 1 : 0;
