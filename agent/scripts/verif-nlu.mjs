/**
 * Vérifie le chemin de compréhension RÉELLEMENT emprunté en production :
 * `MoteurIA.completerJson()` avec l'invite du registre d'outils.
 *
 * Pourquoi un script dédié : les démonstrations de bout en bout appellent
 * l'API du fournisseur en direct, et ne passent donc PAS par le moteur. Un
 * défaut introduit dans `ia.js` — un paramètre refusé, un mode JSON mal
 * négocié — resterait invisible jusqu'au premier message d'un surveillant.
 *
 * Aucune donnée scolaire : les questions ne portent que sur des libellés de
 * classes fictifs, et aucun identifiant réel n'est transmis.
 *
 *   node agent/scripts/verif-nlu.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MoteurIA, configurerDepuisEnv } from "../src/ia.js";
import { Referentiel } from "../src/referentiel.js";
import { ASSIDUITE_TOOLS, ToolRegistry } from "../src/tools.js";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const f = resolve(racine, "ai_apikey.env");
const t = existsSync(f) ? readFileSync(f, "utf8") : "";
const v = (k) => (t.match(new RegExp("^" + k + "\\s*=\\s*(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");

const conf = configurerDepuisEnv({
  GROQ_API_KEY: process.env.GROQ_API_KEY || v("grok_api"),
  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY || v("mistral_ai"),
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || v("openrouterai_api"),
  XAI_API_KEY: process.env.XAI_API_KEY || v("xai_api"),
});
for (const a of conf.avertissements) console.warn(`[config] ${a}`);
console.log(`[config] ordre d'essai : ${conf.ordre.filter((n) => conf.cles[n]).join(" > ")}`);

const ia = new MoteurIA({ cles: conf.cles, modeles: conf.modeles, ordre: conf.ordre });
const outils = new ToolRegistry(ASSIDUITE_TOOLS);

// Référentiel fictif : des libellés plausibles, des identifiants inventés qui
// ne designent rien dans la base reelle.
const LISTES = {
  classes: [
    { id: "aaaaaaaa-0000-0000-0000-000000000001", libelle: "6ème B" },
    { id: "aaaaaaaa-0000-0000-0000-000000000002", libelle: "3ème A" },
  ],
  periodes: [{ id: "bbbbbbbb-0000-0000-0000-000000000001", libelle: "1er Trimestre", numero: 1 }],
};

const CAS = [
  { demande: "Quelles sont les trois dernières absences ?", outil: "assiduite.consulter_absences", verifier: (p) => p.limite === 3 },
  { demande: "Qui dépasse le seuil d'absences ?", outil: "assiduite.alertes" },
  {
    demande: "Montre les absences de la 6ème B.",
    outil: "assiduite.consulter_absences",
    verifier: (p) => p.classeId === LISTES.classes[0].id,
  },
  {
    demande: "Affiche les absences non justifiées de la 3ème A.",
    outil: "assiduite.consulter_absences",
    verifier: (p) => p.classeId === LISTES.classes[1].id && p.statut === "NON_JUSTIFIEE",
  },
  { demande: "Montre les absences de la 7ème Z.", clarifier: true },
];

let echecs = 0;
for (const cas of CAS) {
  try {
    const r = await ia.completerJson([
      { role: "system", content: outils.invitePourNlu() },
      { role: "system", content: Referentiel.enTexte(LISTES) },
      { role: "user", content: cas.demande },
    ]);
    const plan = r.objet;
    if (!plan) {
      console.log(`  ECHEC   « ${cas.demande} » — aucun objet JSON exploitable`);
      echecs += 1;
      continue;
    }
    if (cas.clarifier) {
      const ok = Boolean(plan.clarify) || !plan.tool;
      console.log(`  ${ok ? "OK     " : "ECHEC  "} « ${cas.demande} » -> ${ok ? "demande une precision" : `outil=${plan.tool}`}`);
      if (!ok) echecs += 1;
      continue;
    }
    const bonOutil = plan.tool === cas.outil;
    const bonsParams = cas.verifier ? cas.verifier(plan.params ?? {}) : true;
    const ok = bonOutil && bonsParams;
    console.log(
      `  ${ok ? "OK     " : "ECHEC  "} « ${cas.demande} » -> ${plan.tool} ${JSON.stringify(plan.params ?? {})}` +
        `  [${r.fournisseur}/${r.modele}, ${r.dureeMs} ms]`,
    );
    if (!ok) echecs += 1;
  } catch (e) {
    console.log(`  ECHEC   « ${cas.demande} » — ${String(e.message).slice(0, 140)}`);
    echecs += 1;
  }
}

console.log(`\n${CAS.length - echecs}/${CAS.length} cas corrects par le chemin de production (MoteurIA.completerJson).`);
console.log(`etat des fournisseurs : ${JSON.stringify(ia.etatFournisseurs, null, 0).slice(0, 400)}`);
process.exitCode = echecs ? 1 : 0;
