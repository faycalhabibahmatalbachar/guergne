import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findSettingsCategory,
  SETTINGS_CATEGORIES,
  settingsCategoryForRoute,
} from "../navigation/sidebar/settings-categories.ts";

const route = (url: string) => {
  const u = new URL(url, "https://lycee.example.td");
  return settingsCategoryForRoute(u.pathname, u.searchParams);
};

describe("Sous-menu Paramètres du lycée", () => {
  it("affiche précisément les cinq catégories, dans l'ordre attendu", () => {
    assert.deepEqual(SETTINGS_CATEGORIES.map((s) => s.title), [
      "Le lycée",
      "Scolarité",
      "Finances",
      "Communication",
      "Contrôle et sécurité",
    ]);
    assert.equal(new Set(SETTINGS_CATEGORIES.map((s) => s.id)).size, 5);
  });

  it("identifie les liens du sous-menu et conserve leurs droits distincts", () => {
    for (const section of SETTINGS_CATEGORIES) {
      assert.equal(route("/dashboard/parametres?section=" + section.id), section.id);
      assert.ok(section.action.length > 0);
      assert.ok(section.cards.length > 0);
    }
    assert.deepEqual(SETTINGS_CATEGORIES.find((s) => s.id === "finances")?.action, ["finance:configurer"]);
  });

  it("conserve la catégorie active sur toutes les pages de détail", () => {
    const cas = [
      ["/dashboard/parametres/etablissement", "lycee"],
      ["/dashboard/parametres?onglet=annees", "lycee"],
      ["/dashboard/parametres?onglet=matieres", "scolarite"],
      ["/dashboard/parametres?onglet=coefficients&niveau=college", "scolarite"],
      ["/dashboard/parametres?onglet=classes", "scolarite"],
      ["/dashboard/parametres/finances", "finances"],
      ["/dashboard/parametres/parents", "communication"],
      ["/dashboard/parametres/notifications", "communication"],
      ["/dashboard/parametres/diagnostic", "controle-securite"],
      ["/dashboard/parametres/audit", "controle-securite"],
    ] as const;
    for (const [url, expected] of cas) assert.equal(route(url), expected, url);
  });

  it("la page générale et les autres modules n'activent aucune sous-rubrique", () => {
    assert.equal(route("/dashboard/parametres"), null);
    assert.equal(route("/dashboard/eleves"), null);
    assert.equal(route("/dashboard/parametres?section=erreur"), null);
    assert.equal(findSettingsCategory("administration-multi-ecoles"), null);
  });

  it("ne confond pas finance et contrôle : deux rubriques séparées", () => {
    const fi = findSettingsCategory("finances");
    const sec = findSettingsCategory("controle-securite");
    assert.ok(fi && sec);
    assert.deepEqual(fi.cards, ["finances"]);
    assert.deepEqual(sec.cards, ["diagnostic", "audit"]);
    assert.ok(!sec.action.includes("finance:configurer"));
  });
});
