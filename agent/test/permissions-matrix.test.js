import test from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MATRICE, MatricePermissions, RESERVES_SUPER_ADMIN } from "../src/permissions-matrix.js";

const perm = new MatricePermissions();
const staff = (role) => ({ id: "x", role });

test("la matrice reflète guergne : le SURVEILLANT saisit l'assiduité", () => {
  assert.ok(perm.allows(staff("SURVEILLANT"), "assiduite:saisir"));
  assert.ok(perm.allows(staff("SURVEILLANT"), "retard:saisir"));
});

// CE TEST AFFIRMAIT L'INVERSE, ET C'ETAIT LE DEFAUT.
//
// « constat cle : la DIRECTION ne peut PAS saisir l'assiduite ». C'etait exact
// au regard de 0009, et c'est precisement ce que le proprietaire a tranche le
// 2026-11-10 : la direction est un administrateur METIER complet. La migration
// 0041 l'applique en base ; ce test fixe desormais le nouveau constat.
test("la DIRECTION saisit l'assiduite et les retards (decision du 2026-11-10)", () => {
  assert.ok(perm.allows(staff("DIRECTION"), "assiduite:lire"));
  assert.ok(perm.allows(staff("DIRECTION"), "assiduite:saisir"));
  assert.ok(perm.allows(staff("DIRECTION"), "retard:saisir"));
  assert.ok(perm.allows(staff("DIRECTION"), "assiduite:justifier"));
});

test("la DIRECTION inscrit, reinscrit, affecte — ce qui lui manquait", () => {
  for (const action of ["eleve:inscrire", "eleve:reinscrire", "eleve:affecter", "tuteur:gerer", "tuteur:inviter"]) {
    assert.ok(perm.allows(staff("DIRECTION"), action), `DIRECTION devrait avoir ${action}`);
  }
});

test("les trois droits techniques restent refuses a la DIRECTION", () => {
  for (const action of RESERVES_SUPER_ADMIN) {
    assert.equal(perm.allows(staff("DIRECTION"), action), false, `DIRECTION ne doit pas avoir ${action}`);
    assert.ok(MATRICE.SUPER_ADMIN.has(action), `SUPER_ADMIN doit garder ${action}`);
  }
});

test("`utilisateur:modifier` n'est PAS un droit reserve", () => {
  // L'audit du code (voir l'en-tete de 0041) montre qu'il ne garde que le
  // dossier administratif d'un enseignant, sa photo, et la lecture de son
  // document. Le changement de role passe par `utilisateur:creer`, borne a
  // ENSEIGNANT, que la DIRECTION detenait deja.
  assert.equal(RESERVES_SUPER_ADMIN.includes("utilisateur:modifier"), false);
  assert.ok(perm.allows(staff("DIRECTION"), "utilisateur:modifier"));
});

// L'EVOLUTIVITE, RENDUE TESTABLE.
//
// Le besoin : « eviter que chaque nouveau module oublie le role DIRECTION ».
// Une liste recopiee se perime en silence. Ce test lit le catalogue officiel du
// backend et exige que la DIRECTION couvre TOUT sauf les trois reserves. Ajouter
// une permission metier sans la lui accorder fait echouer ici, et non six mois
// plus tard devant un refus incomprehensible.
test("EVOLUTIVITE : la DIRECTION couvre tout le catalogue sauf les 3 reserves", () => {
  const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const source = readFileSync(resolve(racine, "web/src/server/guard/permissions.ts"), "utf8");
  const bloc = source.slice(source.indexOf("export const ACTIONS"), source.indexOf("] as const"));
  const catalogue = [...bloc.matchAll(/"([a-z_]+:[a-z_]+)"/g)].map((m) => m[1]);

  assert.ok(catalogue.length >= 78, `catalogue illisible ou tronque : ${catalogue.length} action(s)`);

  // Le reflet de l'agent doit connaitre tout le vocabulaire : une action
  // inconnue du pre-filtre serait refusee tot, sans que le backend soit
  // consulte.
  const inconnues = catalogue.filter((a) => !MATRICE.SUPER_ADMIN.has(a));
  assert.deepEqual(inconnues, [], `actions du catalogue absentes du reflet : ${inconnues.join(", ")}`);

  const attendus = catalogue.filter((a) => !RESERVES_SUPER_ADMIN.includes(a));
  const oublies = attendus.filter((a) => !MATRICE.DIRECTION.has(a));
  assert.deepEqual(oublies, [], `droits metier non accordes a la DIRECTION : ${oublies.join(", ")}`);

  // Et les comptes mesures en base le 2026-11-10, apres 0041.
  assert.equal(MATRICE.SUPER_ADMIN.size, catalogue.length);
  assert.equal(MATRICE.DIRECTION.size, catalogue.length - RESERVES_SUPER_ADMIN.length);
});

test("aucun autre role ne recoit un droit reserve", () => {
  for (const [role, actions] of Object.entries(MATRICE)) {
    if (role === "SUPER_ADMIN") continue;
    for (const reserve of RESERVES_SUPER_ADMIN) {
      assert.equal(actions.has(reserve), false, `${role} ne doit pas avoir ${reserve}`);
    }
  }
});

test("l'exclusion définitive reste hors de portée du SURVEILLANT", () => {
  assert.ok(perm.allows(staff("DIRECTION"), "eleve:exclure"));
  assert.equal(perm.allows(staff("SURVEILLANT"), "eleve:exclure"), false);
  assert.equal(perm.allows(staff("SECRETARIAT"), "eleve:exclure"), false);
  assert.equal(perm.allows(staff("ENSEIGNANT"), "eleve:exclure"), false);
});

test("le COMPTABLE encaisse, la justification revient surveillant/secrétariat", () => {
  assert.ok(perm.allows(staff("COMPTABLE"), "finance:encaisser"));
  assert.ok(perm.allows(staff("SECRETARIAT"), "assiduite:justifier"));
  assert.equal(perm.allows(staff("COMPTABLE"), "assiduite:justifier"), false);
});

test("SUPER_ADMIN détient tout", () => {
  for (const action of ["assiduite:saisir", "eleve:exclure", "finance:encaisser", "bulletin:generer"]) {
    assert.ok(MATRICE.SUPER_ADMIN.has(action), `SUPER_ADMIN devrait avoir ${action}`);
  }
});
