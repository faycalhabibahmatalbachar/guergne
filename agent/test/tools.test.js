import test from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ToolRegistry, ASSIDUITE_TOOLS } from "../src/tools.js";
import { GuergneHttpClient } from "../src/guergne-client.js";
import { redact } from "../src/audit.js";
import { READ, WRITE, SENSITIVE } from "../src/guard.js";

const reg = new ToolRegistry(ASSIDUITE_TOOLS);
const tool = (n) => reg.get(n);

test("le registre expose les outils Assiduité avec leurs permissions réelles", () => {
  assert.equal(tool("assiduite.enregistrer_appel").permission, "assiduite:saisir");
  assert.equal(tool("assiduite.enregistrer_retard").permission, "retard:saisir");
  assert.equal(tool("assiduite.justifier_absences").permission, "assiduite:justifier");
  assert.equal(tool("assiduite.consulter_absences").permission, "assiduite:lire");
  assert.equal(tool("assiduite.supprimer_absence").sensitivity, SENSITIVE);
  assert.equal(tool("assiduite.consulter_absences").sensitivity, READ);
  assert.equal(tool("assiduite.enregistrer_appel").sensitivity, WRITE);
});

test("appel : nbHeures hors [0.5,12] est rejeté", () => {
  const v = tool("assiduite.enregistrer_appel").validate;
  assert.ok(v({ periodeId: "p", dateAbsence: "d", nbHeures: 20, absents: [] }).nbHeures);
  assert.deepEqual(v({ periodeId: "p", dateAbsence: "d", nbHeures: 2, absents: [] }), {});
});

test("retard : durée hors [0,480] est rejetée", () => {
  const v = tool("assiduite.enregistrer_retard").validate;
  assert.ok(v({ inscriptionId: "i", periodeId: "p", dateRetard: "d", dureeMinutes: 500 }).dureeMinutes);
  assert.deepEqual(v({ inscriptionId: "i", periodeId: "p", dateRetard: "d", dureeMinutes: 30 }), {});
});

test("justification : plus de 200 lignes est rejeté", () => {
  const v = tool("assiduite.justifier_absences").validate;
  const ids = Array.from({ length: 201 }, (_, i) => "a" + i);
  assert.ok(v({ absenceIds: ids, statut: "JUSTIFIEE", motif: "certificat" }).absenceIds);
});

test("justification : motif < 3 caractères rejeté quand JUSTIFIEE", () => {
  const v = tool("assiduite.justifier_absences").validate;
  assert.ok(v({ absenceIds: ["a1"], statut: "JUSTIFIEE", motif: "x" }).motif);
  assert.deepEqual(v({ absenceIds: ["a1"], statut: "JUSTIFIEE", motif: "certificat médical" }), {});
});

test("suppression : motif obligatoire (≥3)", () => {
  const v = tool("assiduite.supprimer_absence").validate;
  assert.ok(v({ absenceId: "a1", motif: "x" }).motif);
  assert.deepEqual(v({ absenceId: "a1", motif: "erreur de saisie" }), {});
});

test("redact masque les secrets dans les paramètres journalisés", () => {
  const out = redact({ eleve: "insc-1", apiKey: "sk-123", nested: { token: "t", ok: 1 } });
  assert.equal(out.eleve, "insc-1");
  assert.equal(out.apiKey, "[redacted]");
  assert.equal(out.nested.token, "[redacted]");
  assert.equal(out.nested.ok, 1);
});

// --- Rendu des lectures -----------------------------------------------------
// Une consultation qui répond « ✅ Opération effectuée. » perd la donnée qu'elle
// vient de chercher. Ces tests verrouillent le contraire.

test("rendu des absences : la réponse porte les lignes, pas un accusé vide", () => {
  const rendre = tool("assiduite.consulter_absences").rendre;
  const texte = rendre([
    { prenom: "Zenaba", nom: "TOGBE", classe: "6ème B", dateAbsence: "2026-07-14", nbHeures: "2", statut: "NON_JUSTIFIEE" },
  ]);
  assert.match(texte, /1 résultat :/);
  assert.match(texte, /Zenaba TOGBE/);
  assert.match(texte, /6ème B/);
  assert.match(texte, /2026-07-14/);
  assert.match(texte, /non justifiée/);
});

test("rendu des absences : l'affichage est borné et le reste est annoncé", () => {
  const rendre = tool("assiduite.consulter_absences").rendre;
  const lignes = Array.from({ length: 100 }, (_, i) => ({
    prenom: "Eleve", nom: "N" + i, classe: "6ème B", dateAbsence: "2026-07-14", nbHeures: "1", statut: "JUSTIFIEE",
  }));
  const texte = rendre(lignes);
  // Le total réel est annoncé : on ne laisse jamais croire qu'il n'y a que 10 lignes.
  assert.match(texte, /100 résultats :/);
  assert.equal(texte.split("\n").filter((l) => l.startsWith("• ")).length, 10);
  assert.match(texte, /… et 90 de plus\./);
});

test("rendu des absences : une liste vide le dit, sans inventer", () => {
  const texte = tool("assiduite.consulter_absences").rendre([]);
  assert.match(texte, /aucun résultat/i);
});

test("rendu : une date ou un nom manquant ne produit pas de ligne trompeuse", () => {
  const texte = tool("assiduite.consulter_absences").rendre([{ classe: "5ème A" }]);
  assert.match(texte, /élève inconnu/);
  assert.match(texte, /date inconnue/);
});

test("rendu des alertes : heures non justifiées, retards et seuil", () => {
  const texte = tool("assiduite.alertes").rendre([
    { prenom: "Mariam", nom: "BENDOUNGA", classe: "5ème A", heuresNonJustifiees: "14", nbRetards: 3, seuil: 10 },
  ]);
  assert.match(texte, /Mariam BENDOUNGA/);
  assert.match(texte, /14 h non justifiées/);
  assert.match(texte, /3 retard\(s\)/);
  assert.match(texte, /seuil 10/);
});

test("rendu : une donnée non tabulaire renvoie null (l'accusé générique reprend la main)", () => {
  assert.equal(tool("assiduite.consulter_absences").rendre(undefined), null);
  assert.equal(tool("assiduite.alertes").rendre({ pas: "un tableau" }), null);
});

// --- Catalogue et invite transmis au modèle ---------------------------------
// Ce texte vivait dans une fonction fléchée au fond de `app.js` : il n'était
// évalué qu'à l'arrivée d'un message, donc une faute ne se voyait qu'en
// production, et `node --check` la laissait passer (deux gabarits adjacents
// forment un appel de gabarit balisé, syntaxiquement valide). Ces tests
// l'évaluent réellement.

test("le catalogue NLU annonce les paramètres de chaque outil", () => {
  const texte = reg.pourNlu();
  assert.match(texte, /assiduite\.consulter_absences \[read\]/);
  assert.match(texte, /limite \(facultatif/);
  assert.match(texte, /absenceIds \(obligatoire/);
  // Un outil sans paramètre le dit, plutôt que d'afficher une liste vide.
  const vide = new ToolRegistry([
    { name: "x.sans_parametre", module: "x", permission: "p", sensitivity: "read", action: "a", validate: () => ({}) },
  ]);
  assert.match(vide.pourNlu(), /x\.sans_parametre \[read\] parametres : aucun parametre/);
});

test("le catalogue couvre TOUS les outils du registre", () => {
  const texte = reg.pourNlu();
  for (const t of reg.all()) assert.ok(texte.includes(t.name), `absent du catalogue : ${t.name}`);
  assert.equal(texte.split("\n").length, reg.all().length);
});

test("l'invite système s'évalue et porte les consignes qui comptent", () => {
  const invite = reg.invitePourNlu();
  assert.equal(typeof invite, "string");
  assert.ok(invite.length > 200);
  assert.match(invite, /Tu choisis UN outil parmi :/);
  // Les deux garde-fous : ne rien inventer, ne pas réclamer un facultatif.
  assert.match(invite, /n'invente aucune valeur, surtout pas un identifiant/);
  assert.match(invite, /ne le demande JAMAIS a l'utilisateur/);
  assert.match(invite, /"clarify"/);
  // Le catalogue est bien inclus : l'invite et la liste ne peuvent pas diverger.
  assert.ok(invite.includes(reg.pourNlu()));
});

test("un paramètre déclaré existe vraiment dans la liste blanche de l'API", () => {
  // Annoncer au modèle un paramètre que la route ignore produirait une réponse
  // qui paraît filtrée sans l'être. On fige donc la liste attendue.
  const attendus = {
    "assiduite.consulter_absences": ["periodeId", "classeId", "statut", "depuis", "jusqua", "limite"],
    "assiduite.alertes": ["periodeId"],
    "assiduite.justifier_absences": ["absenceIds", "statut", "motif"],
    "assiduite.supprimer_absence": ["absenceId", "motif"],
  };
  for (const [nom, champs] of Object.entries(attendus)) {
    assert.deepEqual(Object.keys(tool(nom).parametres), champs, nom);
  }
});

// --- L'outil et la route doivent parler de la meme chose -------------------

/**
 * Liste blanche des actions, lue dans le fichier de la route plutot que
 * recopiee ici.
 *
 * Une attente figee a la main ne protege de rien : c'est precisement comme cela
 * que `controleSaisies` a pu rester au catalogue des mois alors qu'aucune route
 * ne le servait. Chaque appel serait parti en 404, et l'utilisateur aurait vu
 * un outil propose puis echouer.
 */
function actionsDeLaRoute() {
  const chemin = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../web/src/app/api/agent/[action]/route.ts",
  );
  const source = readFileSync(chemin, "utf8");
  const debut = source.indexOf("const OUTILS");
  assert.ok(debut > 0, "bloc OUTILS introuvable dans la route");
  const noms = new Set();
  for (const m of source.slice(debut).matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*):\s*\{/gm)) noms.add(m[1]);
  return noms;
}

test("chaque outil du registre a une action REELLEMENT servie par la route", () => {
  const servies = actionsDeLaRoute();
  assert.ok(servies.size >= 10, `liste blanche suspecte : ${servies.size} action(s)`);
  for (const t of reg.all()) {
    assert.ok(servies.has(t.action), `${t.name} appelle « ${t.action} », absent de la liste blanche de l'API`);
  }
});

test("chaque outil du registre a une methode dans le client guergne", () => {
  // Un outil dont le client ignore l'action echoue a l'execution, pas au
  // demarrage : le defaut ne se voit qu'au premier message d'un utilisateur.
  for (const t of reg.all()) {
    assert.equal(typeof GuergneHttpClient.prototype[t.action], "function", `${t.name} -> ${t.action}`);
  }
});

test("le client n'expose pas de methode que la route ne sert pas", () => {
  const servies = actionsDeLaRoute();
  const ignorees = new Set(["constructor", "snapshot"]);
  for (const nom of Object.getOwnPropertyNames(GuergneHttpClient.prototype)) {
    if (ignorees.has(nom) || nom.startsWith("_")) continue;
    assert.ok(servies.has(nom), `le client expose « ${nom} », absent de la liste blanche de l'API`);
  }
});
