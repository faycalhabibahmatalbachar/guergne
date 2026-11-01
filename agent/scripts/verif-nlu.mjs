/**
 * Vérifie le chemin de compréhension RÉELLEMENT emprunté en production :
 * `MoteurIA.completerJson()` + l'invite du registre + `normaliserPlan()`.
 *
 * Pourquoi un script dédié : les démonstrations de bout en bout appellent
 * l'API du fournisseur en direct, et ne passent donc PAS par le moteur. Un
 * défaut introduit dans `ia.js` ou dans le contrat resterait invisible jusqu'au
 * premier message d'un utilisateur — c'est précisément ce qui a produit
 * « Action inconnue. » en production.
 *
 * Aucune donnée scolaire : le référentiel est fictif, et aucune requête n'est
 * adressée au backend.
 *
 *   node agent/scripts/verif-nlu.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MoteurIA, configurerDepuisEnv } from "../src/ia.js";
import { normaliserPlan } from "../src/plan.js";
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

/** Référentiel fictif : des libellés plausibles, des identifiants qui ne désignent rien. */
const LISTES = {
  classes: [
    { id: "aaaaaaaa-0000-0000-0000-000000000001", libelle: "6ème B" },
    { id: "aaaaaaaa-0000-0000-0000-000000000002", libelle: "3ème A" },
  ],
  periodes: [{ id: "bbbbbbbb-0000-0000-0000-000000000001", libelle: "1er Trimestre", numero: 1 }],
};

const CAS = [
  // --- Conversation : le chemin qui n'existait pas, et dont l'absence
  // produisait « Action inconnue. ».
  { demande: "Salut", intention: "conversation" },
  { demande: "Bonjour, peux-tu me presenter tes capacites ?", intention: "conversation" },
  { demande: "Merci beaucoup !", intention: "conversation" },

  // --- Outil : toute demande portant sur l'etablissement.
  {
    demande: "Quelles sont les trois dernieres absences ?",
    intention: "outil",
    outil: "assiduite.consulter_absences",
    verifier: (p) => p.limite === 3,
  },
  { demande: "Qui depasse le seuil d'absences ?", intention: "outil", outil: "assiduite.alertes" },
  {
    demande: "Montre les absences de la 6eme B.",
    intention: "outil",
    outil: "assiduite.consulter_absences",
    verifier: (p) => p.classeId === LISTES.classes[0].id,
  },
  { demande: "Combien de retards cette semaine ?", intention: "outil", outil: "assiduite.consulter_retards" },
  { demande: "Quels incidents ont ete declares ?", intention: "outil", outil: "discipline.consulter_incidents" },

  // --- Le piege : une question scolaire traitee en conversation ferait
  // inventer le chiffre. C'est le defaut que le contrat existe pour empecher.
  { demande: "Combien d'absences avons-nous aujourd'hui ?", pasConversation: true },

  // --- Clarification : une classe qui n'existe pas.
  { demande: "Montre les absences de la 7eme Z.", intention: "clarifier" },
];

let echecs = 0;
for (const cas of CAS) {
  try {
    const r = await ia.completerJson([
      { role: "system", content: outils.invitePourNlu() },
      { role: "system", content: Referentiel.enTexte(LISTES) },
      { role: "user", content: cas.demande },
    ]);
    const plan = normaliserPlan(r.objet, outils);

    let ok;
    let detail;
    if (cas.pasConversation) {
      ok = plan.type !== "conversation";
      detail = `${plan.type}${plan.nomOutil ? ` ${plan.nomOutil}` : ""}`;
    } else if (cas.intention === "outil") {
      ok = plan.type === "outil" && plan.tool?.name === cas.outil && (cas.verifier ? cas.verifier(plan.params) : true);
      detail = `${plan.type} ${plan.nomOutil ?? ""} ${JSON.stringify(plan.params ?? {})}`;
    } else {
      ok = plan.type === cas.intention;
      detail =
        plan.type === "conversation"
          ? `conversation : « ${plan.texte.slice(0, 60)} »`
          : plan.type === "clarifier"
            ? `clarifier : « ${plan.question.slice(0, 60)} »`
            : plan.type;
    }

    console.log(`  ${ok ? "OK     " : "ECHEC  "} « ${cas.demande} »`);
    console.log(
      `             ${detail}${plan.rejet ? `  [${plan.rejet} : ${plan.detail}]` : ""}` +
        `   (${r.fournisseur}, ${r.dureeMs} ms)`,
    );
    if (!ok) echecs += 1;
  } catch (e) {
    console.log(`  ECHEC   « ${cas.demande} » — ${String(e.message).slice(0, 140)}`);
    echecs += 1;
  }
}

console.log(`\n${CAS.length - echecs}/${CAS.length} cas corrects par le chemin de production.`);
const etats = ia.etatFournisseurs;
for (const [nom, e] of Object.entries(etats)) {
  if (e.appels) console.log(`  ${nom} : ${e.succes}/${e.appels} succes, ${e.latenceMoyenneMs} ms en moyenne, ${e.tokens} jetons`);
}
process.exitCode = echecs ? 1 : 0;
