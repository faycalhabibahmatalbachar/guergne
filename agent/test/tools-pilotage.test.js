/**
 * Recette des outils de pilotage, de pédagogie, de finances et d'annuaire.
 *
 * Ces tests portent sur le RENDU. Ce n'est pas un détail d'affichage : un
 * rendu qui lève sur une donnée inattendue fait échouer la réponse entière, et
 * l'utilisateur ne reçoit rien. Un rendu qui affiche `undefined` ou `NaN` est
 * pire encore — il a l'air d'un chiffre.
 *
 * Les jeux de données reprennent la forme réelle rendue par
 * `web/src/server/domain/pilotage.ts` et consorts.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { GuergneHttpClient } from "../src/guergne-client.js";
import { PILOTAGE_TOOLS } from "../src/tools-pilotage.js";

const outil = (nom) => {
  const t = PILOTAGE_TOOLS.find((x) => x.name === nom);
  assert.ok(t, `outil introuvable : ${nom}`);
  return t;
};
const rendre = (nom, donnees, params) => outil(nom).rendre(donnees, params);

// --- Robustesse commune ----------------------------------------------------

test("aucun rendu ne leve sur une donnee absente, vide ou de mauvaise forme", () => {
  // Le backend peut rendre null (annee introuvable), un tableau vide, ou une
  // forme que l'on n'attendait pas. Aucun de ces cas ne doit couper la reponse.
  for (const t of PILOTAGE_TOOLS) {
    for (const d of [null, undefined, [], {}, "du texte", 42, [{}], [null]]) {
      assert.doesNotThrow(() => t.rendre(d, {}), `${t.name} sur ${JSON.stringify(d)}`);
    }
  }
});

test("aucun rendu ne laisse passer « undefined » ou « NaN » dans le texte", () => {
  // Ces mots ont l'air d'un resultat. Mieux vaut « non calculé ».
  for (const t of PILOTAGE_TOOLS) {
    for (const d of [[{}], [{ classe: null, moyenne: null }], {}]) {
      const texte = t.rendre(d, {}) ?? "";
      assert.ok(!texte.includes("undefined"), `${t.name} : « undefined » visible`);
      assert.ok(!texte.includes("NaN"), `${t.name} : « NaN » visible`);
    }
  }
});

test("chaque outil declare ce qu'il fait et ce qu'il appelle", () => {
  for (const t of PILOTAGE_TOOLS) {
    assert.ok(t.description && t.description.length > 20, `${t.name} : description trop courte`);
    assert.equal(t.sensitivity, "read", `${t.name} doit etre une lecture`);
    assert.match(t.permission, /^[a-z_]+:[a-z_]+$/, `${t.name} : permission mal formee`);
    assert.equal(typeof t.validate, "function");
    assert.equal(typeof t.rendre, "function");
  }
});

// --- Pilotage --------------------------------------------------------------

test("les indicateurs cles rendent les chiffres de l'etablissement", () => {
  const texte = rendre("pilotage.indicateurs", {
    effectif: 548,
    nouveauxInscrits: 120,
    reinscriptions: 428,
    enseignants: 15,
    classes: 15,
    absentsAujourdhui: 3,
    retardsAujourdhui: 1,
    moyenneGenerale: 10.59,
    suspendus: 2,
    exclus: 0,
    transferes: 1,
  });
  assert.match(texte, /548 eleve\(s\) inscrit\(s\), 15 classe\(s\), 15 enseignant\(s\)/);
  assert.match(texte, /3 absent\(s\), 1 retard\(s\)/);
  assert.match(texte, /moyenne generale : 10\.59\/20/);
});

test("une moyenne non calculee le dit, au lieu d'afficher un vide", () => {
  const texte = rendre("pilotage.indicateurs", { effectif: 0, moyenneGenerale: null });
  assert.match(texte, /moyenne generale : non calculé/);
});

test("les effectifs par niveau portent le detail garcons / filles", () => {
  const texte = rendre("pilotage.effectifs_par_niveau", [
    { niveau: "Sixième", cycle: "COLLEGE", garcons: 42, filles: 52, total: 94 },
  ]);
  assert.match(texte, /Sixième \(COLLEGE\) — 94 eleves : 42 G \/ 52 F/);
});

test("les absences par mois distinguent justifiees et non justifiees", () => {
  const texte = rendre("pilotage.absences_par_mois", [
    { mois: "2025-10", libelle: "Oct", justifiees: 619, nonJustifiees: 389 },
  ]);
  assert.match(texte, /Oct — 389 h non justifiees, 619 h justifiees/);
});

test("le classement porte le rang et l'ecart a la moyenne", () => {
  const texte = rendre("pilotage.classement_classes", [
    { rang: 1, classe: "Terminale A", moyenne: 11.67, ecart: 1.08 },
  ]);
  assert.match(texte, /1\. Terminale A — 11\.67\/20 \(ecart 1\.08\)/);
});

test("une classe sans note est annoncee comme telle", () => {
  // Une classe vide en debut d'annee ne doit pas apparaitre avec « 0/20 »,
  // qui se lirait comme une moyenne catastrophique.
  const texte = rendre("pilotage.moyennes_par_classe", [{ classe: "6E", effectif: 0, moyenne: null, tauxReussite: null }]);
  assert.match(texte, /6E \(0 eleves\) — non calculé, reussite non calculé/);
});

test("les resultats par matiere exigent une periode", () => {
  // La route rend une liste vide sans periode : reclamer le parametre vaut
  // mieux que laisser croire que l'etablissement n'a aucune note.
  assert.deepEqual(outil("pilotage.resultats_par_matiere").validate({}), { periodeId: "Période requise." });
  assert.deepEqual(outil("pilotage.resultats_par_matiere").validate({ periodeId: "p-1" }), {});
});

// --- Élèves, parents, personnel --------------------------------------------

test("la recherche d'eleves annonce le total, pas seulement la page", () => {
  // Afficher « 5 résultats » quand il y en a 549 tromperait le lecteur.
  const texte = rendre("eleves.rechercher", {
    total: 549,
    lignes: [{ prenom: "Amina", nom: "ABAKAR", matricule: "LGR-2025-1274", classe: "6ème B" }],
  });
  assert.match(texte, /Eleves \(549 au total\)/);
  assert.match(texte, /Amina ABAKAR — LGR-2025-1274, 6ème B/);
});

test("un eleve sans matricule ne produit pas un trou", () => {
  const texte = rendre("eleves.rechercher", { total: 1, lignes: [{ prenom: "Zara", nom: "TAHIR" }] });
  assert.match(texte, /Zara TAHIR — sans matricule/);
});

test("les responsables portent leur lien de parente", () => {
  const texte = rendre("parents.tuteurs_de_l_eleve", [
    { prenom: "Djasrabé", nom: "ABAKAR", lienParente: "PERE", principal: true },
  ]);
  assert.match(texte, /Djasrabé ABAKAR — PERE \(principal\)/);
});

test("tuteurs_de_l_eleve exige un eleve", () => {
  assert.deepEqual(outil("parents.tuteurs_de_l_eleve").validate({}), { eleveId: "Élève requis." });
});

test("l'annuaire des enseignants porte matricule, specialite et statut", () => {
  const texte = rendre("personnel.enseignants", [
    { prenom: "Fatimé", nom: "ABDELKERIM", matricule: "ENS-003", specialite: "FR", statut: "PERMANENT" },
  ]);
  assert.match(texte, /Fatimé ABDELKERIM — ENS-003, FR \(PERMANENT\)/);
});

// --- Pédagogie et finances -------------------------------------------------

test("les evaluations portent classe, matiere, date et statut", () => {
  const texte = rendre("pedagogie.evaluations", [
    { titre: "Composition", classe: "2nde A", matiere: "Physique", dateEvaluation: "2025-12-22T00:00:00Z", statut: "PUBLIEE" },
  ]);
  assert.match(texte, /Composition — 2nde A, Physique, 2025-12-22 \(PUBLIEE\)/);
});

test("les montants financiers sont formates, pas bruts", () => {
  // « 106380000 » ne se lit pas. L'espace insecable des milliers, si.
  const texte = rendre("finances.recouvrement_par_classe", [
    { classe: "2nde A", totalPaye: 5665500, totalDu: 9635000, nbEnRetard: 36 },
  ]);
  assert.match(texte, /2nde A — 5\s?665\s?500 FCFA encaisses sur 9\s?635\s?000 FCFA, 36 en retard/);
});

test("les statistiques financieres formatent les montants et laissent les comptes bruts", () => {
  const texte = rendre("finances.statistiques", { totalDu: 106380000, nbEleves: 549 });
  assert.match(texte, /totalDu : 106\s?380\s?000 FCFA/);
  assert.match(texte, /nbEleves : 549/);
});

// --- Le client appelle bien l'action annoncée ------------------------------

test("chaque outil a une methode de client qui appelle SON action", async () => {
  // Un outil qui annonce une action mais dont le client en appelle une autre
  // echouerait silencieusement sur la mauvaise donnee.
  const appels = [];
  const client = new GuergneHttpClient({
    baseUrl: "http://exemple.invalide",
    serviceToken: "jeton",
    fetch: async (url) => {
      appels.push(String(url).split("/").pop());
      return { ok: true, status: 200, json: async () => ({ ok: true, data: [] }) };
    },
  });
  for (const t of PILOTAGE_TOOLS) {
    assert.equal(typeof client[t.action], "function", `${t.name} -> ${t.action} absent du client`);
    await client[t.action]({}, { actorId: "a-1" });
    assert.equal(appels.at(-1), t.action, `${t.name} appelle la mauvaise action`);
  }
  assert.equal(appels.length, PILOTAGE_TOOLS.length);
});
