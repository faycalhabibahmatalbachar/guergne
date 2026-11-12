/**
 * Catalogue des capacités de l'agent — DÉRIVÉ, jamais écrit à la main.
 *
 *   node banc/catalogue.mjs [banc/rapports/<campagne>.json]
 *
 * Sources :
 *   - le registre des outils (`src/tools.js`) : ce que l'agent sait faire ;
 *   - la liste blanche du backend (`web/src/server/agent/operations.ts`) : ce
 *     que l'API sert réellement ;
 *   - le catalogue de scénarios (`banc/scenarios/`) : ce qui est éprouvé ;
 *   - un rapport de campagne (facultatif) : ce qui a été OBSERVÉ, outil par outil.
 *
 * Écrit `docs/AI_CAPABILITY_CATALOG.md`. Une capacité sans scénario y est
 * marquée telle quelle : le document ne peut pas mentir sur la couverture.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { ASSIDUITE_TOOLS, ToolRegistry } from "../src/tools.js";
import { depot, racineAgent } from "./moteur.mjs";

const registre = new ToolRegistry(ASSIDUITE_TOOLS);
const outils = registre.all();
const operations = readFileSync(join(depot, "web", "src", "server", "agent", "operations.ts"), "utf8");
const servie = (action) => new RegExp("^  " + action + ": \\{", "m").test(operations);

const dossier = join(racineAgent, "banc", "scenarios");
const scenarios = [];
for (const f of readdirSync(dossier).filter((x) => x.endsWith(".mjs")).sort()) {
  scenarios.push(...(await import(pathToFileURL(join(dossier, f)).href)).default);
}
const declares = new Map(); // outil -> ids de scénarios qui le visent
const viser = (outil, id) => {
  if (!outil || outil === "mission") return;
  if (!declares.has(outil)) declares.set(outil, new Set());
  declares.get(outil).add(id);
};
for (const s of scenarios) {
  for (const c of s.capacites ?? []) viser(c, s.id);
  for (const t of s.tours) for (const o of [].concat(t.outil ?? [])) viser(o, s.id);
}

const rapport = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], "utf8")) : null;
const observes = new Map(); // outil -> { tours, reussis }
if (rapport) {
  for (const s of rapport.scenarios) {
    for (const t of s.tours) {
      if (!t.outil || t.outil === "mission") continue;
      const o = observes.get(t.outil) ?? { tours: 0, sansDefaut: 0, scenarios: new Set() };
      o.tours += 1;
      if (t.controles.every((c) => c.ok)) o.sansDefaut += 1;
      o.scenarios.add(s.id);
      observes.set(t.outil, o);
    }
  }
}

const RISQUE = { read: "lecture", write: "écriture (confirmation selon politique)", sensitive: "écriture sensible (confirmation obligatoire)" };
const ENTITES = { classeId: "classe", classe: "classe", periodeId: "période", periode: "période", eleveId: "élève", eleve: "élève", eleves: "élèves (liste ou résultat précédent)", enseignantId: "enseignant", matiereId: "matière", anneeId: "année scolaire", tuteur: "responsable", responsable: "responsable" };
const parModule = new Map();
for (const t of outils) {
  if (!parModule.has(t.module)) parModule.set(t.module, []);
  parModule.get(t.module).push(t);
}

const lignes = [
  "# Catalogue des capacités de l'agent",
  "",
  "> Document **généré** par `node banc/catalogue.mjs` à partir du registre des outils, de la liste blanche du backend et du catalogue de scénarios. Ne pas le modifier à la main : relancer la commande.",
  "",
  "Généré le " + new Date().toISOString().slice(0, 10) + (rapport ? " — observations de la campagne « " + rapport.etiquette + " » (" + rapport.date.slice(0, 16).replace("T", " ") + " UTC)." : " — sans rapport de campagne : la colonne « observé » est vide."),
  "",
  "## Vue d'ensemble",
  "",
  "| | |",
  "|---|---|",
  "| Outils au registre | " + outils.length + " |",
  "| dont lectures | " + outils.filter((t) => t.sensitivity === "read").length + " |",
  "| dont écritures | " + outils.filter((t) => t.sensitivity !== "read").length + " |",
  "| Servis par le backend (liste blanche) | " + outils.filter((t) => servie(t.action)).length + " / " + outils.length + " |",
  "| Visés par au moins un scénario | " + outils.filter((t) => declares.has(t.name)).length + " / " + outils.length + " |",
  rapport ? "| Réellement exercés dans la campagne | " + outils.filter((t) => observes.has(t.name)).length + " / " + outils.length + " |" : null,
  "| Scénarios au catalogue | " + scenarios.length + " (" + scenarios.reduce((s, x) => s + x.tours.filter((t) => t.dit).length, 0) + " tours) |",
  "",
  "Trois niveaux à ne pas confondre : ce que **l'interface web** propose, ce que **le backend** sait faire, et ce que **l'agent** peut déclencher. Ce catalogue ne décrit que le troisième. Ce que l'agent ne sait PAS faire est listé à la fin.",
  "",
].filter((x) => x !== null);

for (const [module, liste] of [...parModule.entries()].sort()) {
  lignes.push("## Domaine : " + module, "");
  for (const t of liste) {
    const params = Object.entries(t.parametres ?? {});
    const nommes = Object.keys(t.nommes ?? {});
    const entites = [...new Set([...params.map(([n]) => n), ...nommes].map((n) => ENTITES[n]).filter(Boolean))];
    const sc = [...(declares.get(t.name) ?? [])];
    const obs = observes.get(t.name);
    lignes.push(
      "### `" + t.name + "`",
      "",
      "- **Intention** : " + t.description,
      "- **Risque** : " + (RISQUE[t.sensitivity] ?? t.sensitivity) + (t.confirmationObligatoire ? " — confirmation TOUJOURS exigée" : t.requiresConfirmation ? " — confirmation exigée" : ""),
      "- **Permission d'entrée** : `" + t.permission + "` (le backend revérifie, et peut exiger davantage)",
      "- **Opération backend** : `" + t.action + "`" + (servie(t.action) ? "" : " — ⚠️ ABSENTE de la liste blanche"),
      "- **Paramètres** : " + (params.length || nommes.length ? [...nommes.map((n) => "`" + n + "`"), ...params.map(([n]) => "`" + n + "`")].join(", ") : "aucun"),
      "- **Entités résolues automatiquement** : " + (entites.length ? entites.join(", ") + " (résolveur central" + (typeof t.preparer === "function" ? " + préparation de l'outil" : "") + ")" : "aucune"),
      "- **Exécution** : " + (typeof t.preparer === "function" ? "préparation (relecture au backend, récapitulatif) → " : "") + "appel `" + t.action + "`" + (t.ditParLUtilisateur ? " — champs qui doivent avoir été écrits par l'utilisateur : " + t.ditParLUtilisateur.join(", ") : ""),
      "- **Vérification** : " + (typeof t.verifier === "function" ? "relecture après écriture (`verifier`)" : t.sensitivity === "read" ? "comparaison à l'oracle SQL dans le banc" : "message du backend — pas de relecture dédiée"),
      "- **Rendu** : " + (typeof t.rendre === "function" ? "mis en forme" : typeof t.verifier === "function" ? "texte de la vérification" : "⚠️ message générique"),
      "- **Scénarios** : " + (sc.length ? sc.sort().join(", ") : "⚠️ AUCUN") + (obs ? " — observé sur " + obs.tours + " tour(s), dont " + obs.sansDefaut + " sans défaut" : rapport ? " — non exercé dans cette campagne" : ""),
      "",
    );
  }
}

const sansScenario = outils.filter((t) => !declares.has(t.name)).map((t) => t.name);
lignes.push(
  "## Couverture",
  "",
  sansScenario.length ? "Outils sans aucun scénario : " + sansScenario.map((n) => "`" + n + "`").join(", ") + "." : "Tous les outils du registre sont visés par au moins un scénario.",
  "",
  "## Ce que l'agent ne sait pas faire",
  "",
  "Constaté à l'audit du registre et du backend — ces capacités existent dans l'interface web, pas (ou pas encore) pour l'agent :",
  "",
  "- **Notes** : saisir ou corriger une note, créer une évaluation, générer ou publier un bulletin.",
  "- **Finances** : enregistrer ou annuler un paiement, accorder une exonération, relancer une échéance.",
  "- **Documents** : déposer, vérifier ou lister les pièces manquantes par élève (la table `pieces_dossier` n'a ni service ni colonnes de vérification) ; lister les dossiers incomplets.",
  "- **Parents** : inviter à l'application, générer un code d'accès (ces parcours envoient un SMS).",
  "- **Notifications** : consulter l'historique de livraison, connaître le consentement SMS parent par parent hors devis.",
  "- **Discipline** : déclarer un incident, prononcer une sanction, convoquer un conseil.",
  "- **Scolarité** : réinscription d'une année sur l'autre, passage d'année, conseil de classe.",
  "- **Personnel** : créer ou modifier un enseignant, une affectation, un emploi du temps ; gérer rôles et permissions.",
  "",
  "Pour ces demandes l'agent doit le DIRE, sans improviser : c'est éprouvé par les scénarios `co-06` et `co-07`.",
  "",
);
const sortie = join(depot, "docs", "AI_CAPABILITY_CATALOG.md");
writeFileSync(sortie, lignes.join("\n"));
console.log("Catalogue écrit : " + sortie + " — " + outils.length + " outils, " + sansScenario.length + " sans scénario" + (sansScenario.length ? " (" + sansScenario.join(", ") + ")" : ""));
