/**
 * Recette du contrat entre le modèle et le moteur.
 *
 * Le défaut corrigé ici s'est vu en production : prié de présenter ses
 * capacités, le modèle a répondu correctement par un objet `{description,
 * examples}`. Le contrat n'admettait que « appeler un outil » ou « demander
 * une précision » ; le moteur a donc répondu « Action inconnue. » à une
 * réponse parfaitement valide.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { INTENTIONS, REJETS, citeDesDonneesScolaires, inviteContrat, normaliserPlan } from "../src/plan.js";
import { ASSIDUITE_TOOLS, ToolRegistry } from "../src/tools.js";

const reg = new ToolRegistry(ASSIDUITE_TOOLS);
const OUTIL = "assiduite.consulter_absences";

// --- Le cas de production --------------------------------------------------

test("l'objet exact qui a produit « Action inconnue. » est desormais nomme", () => {
  const plan = normaliserPlan({ description: "Je peux consulter l'assiduite", examples: ["..."] }, reg);
  assert.equal(plan.type, "invalide");
  assert.equal(plan.rejet, REJETS.INTENTION_INCONNUE);
  // Le detail porte les NOMS des champs, jamais leurs valeurs : elles peuvent
  // contenir la demande d'un utilisateur.
  assert.equal(plan.detail, "description,examples");
});

test("la meme demande, avec le contrat respecte, devient une conversation", () => {
  const plan = normaliserPlan(
    { intention: "conversation", reponse: "Je peux consulter l'assiduite, les retards et les incidents." },
    reg,
  );
  assert.equal(plan.type, INTENTIONS.CONVERSATION);
  assert.match(plan.texte, /assiduite/);
});

// --- Les trois intentions --------------------------------------------------

test("conversation : le texte est transmis tel quel", () => {
  const plan = normaliserPlan({ intention: "conversation", reponse: "  Bonjour !  " }, reg);
  assert.equal(plan.texte, "Bonjour !");
});

test("outil : le registre valide le nom", () => {
  const plan = normaliserPlan({ intention: "outil", outil: OUTIL, params: { limite: 3 } }, reg);
  assert.equal(plan.type, INTENTIONS.OUTIL);
  assert.equal(plan.tool.name, OUTIL);
  assert.deepEqual(plan.params, { limite: 3 });
});

test("clarifier : la question est transmise", () => {
  const plan = normaliserPlan({ intention: "clarifier", question: "Quelle classe ?" }, reg);
  assert.equal(plan.type, INTENTIONS.CLARIFIER);
  assert.equal(plan.question, "Quelle classe ?");
});

// --- Les rejets, chacun avec sa raison -------------------------------------

test("un outil qui n'existe pas est nomme, pas confondu avec une panne", () => {
  const plan = normaliserPlan({ intention: "outil", outil: "assiduite.inventee" }, reg);
  assert.equal(plan.rejet, REJETS.OUTIL_INCONNU);
  assert.equal(plan.detail, "assiduite.inventee", "le nom tente doit figurer, pour le diagnostic");
});

test("une intention sans son champ obligatoire est rejetee", () => {
  assert.equal(normaliserPlan({ intention: "conversation" }, reg).rejet, REJETS.CHAMP_MANQUANT);
  assert.equal(normaliserPlan({ intention: "clarifier" }, reg).rejet, REJETS.CHAMP_MANQUANT);
  assert.equal(normaliserPlan({ intention: "outil" }, reg).rejet, REJETS.CHAMP_MANQUANT);
  assert.equal(normaliserPlan({ intention: "conversation", reponse: "   " }, reg).rejet, REJETS.CHAMP_MANQUANT);
});

test("ce qui n'est pas un objet est rejete sans interpretation", () => {
  for (const brut of [null, undefined, "du texte", 42, []]) {
    const plan = normaliserPlan(brut, reg);
    assert.equal(plan.type, "invalide", JSON.stringify(brut));
  }
  assert.equal(normaliserPlan(null, reg).rejet, REJETS.PLAN_ABSENT);
});

// --- La protection contre les chiffres inventés ----------------------------

test("une reponse conversationnelle qui avance un chiffre scolaire est refusee", () => {
  // Le modele n'a lu aucune donnee : ce chiffre ne peut etre qu'invente, et il
  // serait lu comme un releve officiel par un directeur.
  for (const texte of [
    "Aujourd'hui, nous avons 45 absences.",
    "Il y a 3 incidents cette semaine.",
    "La 6eme B compte 47 eleves.",
    "On releve 12 retards non justifies.",
    "Le total atteint 26.5 heures d'absence.",
  ]) {
    const plan = normaliserPlan({ intention: "conversation", reponse: texte }, reg);
    assert.equal(plan.rejet, REJETS.DONNEES_INVENTEES, texte);
  }
});

test("une reponse conversationnelle ordinaire passe sans entrave", () => {
  // Le garde-fou doit etre etroit : genant s'il refusait une phrase normale.
  for (const texte of [
    "Bonjour, comment puis-je vous aider ?",
    "Je peux consulter les absences, les retards et les incidents.",
    "Precisez la classe et la periode, et j'irai chercher les donnees.",
    "Je suis l'assistant du lycee. Posez-moi votre question.",
    "Vous pouvez me demander un releve par classe.",
  ]) {
    const plan = normaliserPlan({ intention: "conversation", reponse: texte }, reg);
    assert.equal(plan.type, INTENTIONS.CONVERSATION, texte);
  }
});

test("citeDesDonneesScolaires ne se declenche pas sur un chiffre sans rapport", () => {
  assert.equal(citeDesDonneesScolaires("Je connais 3 types de demandes."), false);
  assert.equal(citeDesDonneesScolaires("Repondez par 1 ou 2."), false);
  assert.equal(citeDesDonneesScolaires("45 absences"), true);
  assert.equal(citeDesDonneesScolaires("45 absences non justifiees"), true);
  assert.equal(citeDesDonneesScolaires(""), false);
  assert.equal(citeDesDonneesScolaires(null), false);
});

// --- Compatibilité avec les formes historiques -----------------------------

test("les formes historiques restent comprises", () => {
  // Les demonstrations de bout en bout et les tests les emploient : les casser
  // n'apporterait rien.
  const a = normaliserPlan({ tool: OUTIL, params: { limite: 2 } }, reg);
  assert.equal(a.type, INTENTIONS.OUTIL);
  assert.equal(a.tool.name, OUTIL);

  const b = normaliserPlan({ clarify: "Quelle periode ?" }, reg);
  assert.equal(b.type, INTENTIONS.CLARIFIER);
  assert.equal(b.question, "Quelle periode ?");
});

test("une forme historique nommant un outil inconnu est rejetee de meme", () => {
  assert.equal(normaliserPlan({ tool: "n.existe.pas" }, reg).rejet, REJETS.OUTIL_INCONNU);
});

// --- L'invite et le code ne peuvent pas diverger ---------------------------

test("l'invite decrit exactement les trois intentions validees", () => {
  const invite = inviteContrat();
  for (const intention of Object.values(INTENTIONS)) {
    assert.ok(invite.includes(`"intention":"${intention}"`), intention);
  }
  assert.match(invite, /AUCUNE donnee scolaire/);
});
