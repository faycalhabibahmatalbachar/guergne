/**
 * notifications.parents : la cible exacte, le devis avant le oui, et un compte
 * rendu qui dit « en file » et jamais « délivré ».
 */
import test from "node:test";
import assert from "node:assert/strict";

import { NOTIFICATIONS_TOOLS, canalDe } from "../src/tools-notifications.js";

const outil = NOTIFICATIONS_TOOLS[0];
const E = "33333333-3333-4333-8333-333333333333";
const C4B = "11111111-1111-4111-8111-111111111111";
const PERE = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", nom: "ABAKAR", prenom: "Ahmat", lien: "PERE", telephone: "+23566000001" };
const MERE = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", nom: "HAWA", prenom: "Zara", lien: "MERE", telephone: "+23599000002" };
const DEVIS = { parentsSelectionnes: 1, parentsJoignables: 1, nonJoignables: 0, total: 1, parPush: 0, parSms: 1, dansApplication: 0, coutFcfa: 25, segments: 1, smsDedoublonnes: 0, empreinteAudience: "e".repeat(64) };

function outils(devis = DEVIS) {
  const appels = [];
  return {
    appels,
    ctx: {},
    guergne: {
      rechercherEleves: async () => ({ ok: true, data: [{ id: E, nom: "ABAKAR", prenom: "Mahamat", matricule: "LGR-001" }] }),
      consulterEleve: async () => ({ ok: true, data: { eleve: { id: E, nom: "ABAKAR", prenom: "Mahamat" } } }),
      ficheEleve: async () => ({ ok: true, data: { identite: {}, tuteurs: [PERE, MERE] } }),
      listerClasses: async () => ({ ok: true, data: [{ id: C4B, libelle: "4ème B" }] }),
      devisNotificationParents: async (p) => {
        appels.push(p);
        return { ok: true, data: devis };
      },
    },
  };
}
const BASE = { titre: "Absence", message: "Votre enfant était absent ce matin." };

test("canal : les mots courants", () => {
  assert.deepEqual(canalDe("par SMS"), { canal: "SMS" });
  assert.deepEqual(canalDe("application et SMS"), { canal: "APP_ET_SMS" });
  assert.deepEqual(canalDe("notification"), { canal: "APP" });
  assert.deepEqual(canalDe(undefined), { canal: "AUTO" });
  assert.ok(canalDe("pigeon").erreur);
});

test("« uniquement le pere de Mahamat » : une selection d'UN identifiant", async () => {
  const o = outils();
  const r = await outil.preparer({ ...BASE, eleve: "Mahamat", responsable: "le père", canal: "SMS" }, o);
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.params.selection, { mode: "ids", ids: [PERE.id] });
  assert.equal(o.appels[0].canal, "SMS");
  assert.match(r.texte, /Ahmat ABAKAR \(PERE\), pour Mahamat ABAKAR/);
  assert.match(r.texte, /Coût SMS estimé : 25 FCFA/);
});

test("les deux responsables par defaut", async () => {
  const r = await outil.preparer({ ...BASE, eleve: "Mahamat" }, outils());
  assert.deepEqual(r.params.selection.ids, [PERE.id, MERE.id]);
});

test("parents d'une classe filtres par etat : selection par filtres", async () => {
  const r = await outil.preparer({ ...BASE, classe: "4e B", etat: "pas activé" }, outils());
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.params.selection, { mode: "filtres", filtres: { recherche: "", etat: "invite", classeId: C4B }, exclureIds: [] });
});

test("les bornes de l'envoi viennent du devis, et la cle d'envoi est figee", async () => {
  const r = await outil.preparer({ ...BASE, eleve: "Mahamat", responsable: "la mère" }, outils());
  assert.equal(r.params.plafondCoutFcfa, 25);
  assert.equal(r.params.plafondNotifications, 1);
  assert.equal(r.params.empreinteAudience, "e".repeat(64));
  assert.match(r.params.cleEnvoi, /^[0-9a-f-]{36}$/);
});

test("personne de joignable : rien n'est propose a l'envoi", async () => {
  const r = await outil.preparer({ ...BASE, eleve: "Mahamat" }, outils({ ...DEVIS, total: 0, parentsJoignables: 0, nonJoignables: 2 }));
  assert.equal(r.ok, false);
  assert.match(r.message, /Aucun parent joignable/);
});

test("compte rendu : « en file », jamais « délivré »", async () => {
  const v = await outil.verifier({ result: { ok: true, data: { ok: true, message: "1 notification programmée." } }, params: { plafondNotifications: 1 } });
  assert.equal(v.ok, true);
  assert.match(v.texte, /mise en file/);
  assert.doesNotMatch(v.texte, /délivr[ée]+ à|a été reçu/);
  const refus = await outil.verifier({ result: { ok: true, data: { ok: false, message: "L'audience a changé." } }, params: {} });
  assert.equal(refus.ok, false);
});

test("confirmation obligatoire, qu'aucune politique ne leve", () => {
  assert.equal(outil.confirmationObligatoire, true);
});
