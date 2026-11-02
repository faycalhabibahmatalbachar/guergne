/**
 * Tests de la décision d'émission d'un document officiel.
 * Exécution : `node --test src/server/pdf/emission.test.ts`
 *
 * Ces tests ne touchent pas la base : ce qu'on éprouve ici, c'est la règle qui
 * protège la séquence de numérotation, et elle doit tenir sans PostgreSQL.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deciderEmission, lireDonneesFigees } from "./emission.ts";

/** Copie figée minimale mais valide, telle que le service l'écrit. */
function figees(anneeLibelle = "2025-2026") {
  return {
    eleve: { matricule: "LGR-0001", nom: "Abakar", prenom: "Fatimé" },
    scolarite: { anneeLibelle, classeLibelle: "6ème A" },
  };
}

const ANTERIEUR = { numero: "CS-2026-0003", codeVerification: "A1B2C3D4" };

describe("lireDonneesFigees", () => {
  it("accepte une copie figée complète", () => {
    assert.notEqual(lireDonneesFigees(figees()), null);
  });

  it("accepte le jsonb rendu sous forme de texte", () => {
    assert.notEqual(lireDonneesFigees(JSON.stringify(figees())), null);
  });

  it("rejette ce qui ne permet pas de reconstruire le document", () => {
    assert.equal(lireDonneesFigees(null), null);
    assert.equal(lireDonneesFigees(undefined), null);
    assert.equal(lireDonneesFigees("{ceci n'est pas du json"), null);
    assert.equal(lireDonneesFigees([figees()]), null);
    assert.equal(lireDonneesFigees({ eleve: { nom: "Abakar" } }), null);
    assert.equal(lireDonneesFigees({ eleve: {}, scolarite: {} }), null);
  });
});

describe("deciderEmission", () => {
  it("émet quand l'élève ne détient aucun document de ce type", () => {
    const d = deciderEmission({ dejaEmis: null, anneeAttendue: "2025-2026" });
    assert.equal(d.action, "emettre");
    assert.equal("raison" in d ? d.raison : undefined, undefined);
  });

  it("rejoue le document déjà émis sans consommer de numéro", () => {
    const d = deciderEmission({
      dejaEmis: ANTERIEUR,
      donneesFigees: figees(),
      anneeAttendue: "2025-2026",
    });
    assert.equal(d.action, "rejouer");
    if (d.action !== "rejouer") return;
    assert.equal(d.numero, "CS-2026-0003");
    assert.equal(d.codeVerification, "A1B2C3D4");
  });

  it("rejoue même si le dossier vivant a changé de classe depuis", () => {
    // C'est tout l'intérêt de la copie figée : l'exemplaire remis à la famille
    // et celui reconstruit par l'école doivent rester identiques.
    const d = deciderEmission({
      dejaEmis: ANTERIEUR,
      donneesFigees: figees(),
      anneeAttendue: "2025-2026",
    });
    assert.equal(d.action, "rejouer");
    if (d.action !== "rejouer") return;
    assert.equal(d.donneesFigees.scolarite.classeLibelle, "6ème A");
  });

  it("rejoue un document ancien dépourvu de code de vérification", () => {
    const d = deciderEmission({
      dejaEmis: { numero: "CS-2024-0001", codeVerification: null },
      donneesFigees: figees("2023-2024"),
      anneeAttendue: "2023-2024",
    });
    assert.equal(d.action, "rejouer");
    if (d.action !== "rejouer") return;
    assert.equal(d.numero, "CS-2024-0001");
    assert.equal(d.codeVerification, null);
  });

  it("émet un document neuf pour une nouvelle année scolaire", () => {
    const d = deciderEmission({
      dejaEmis: ANTERIEUR,
      donneesFigees: figees("2024-2025"),
      anneeAttendue: "2025-2026",
    });
    assert.equal(d.action, "emettre");
  });

  it("refuse quand la copie figée est absente ou illisible", () => {
    for (const brut of [null, undefined, "{]", { scolarite: {} }]) {
      const d = deciderEmission({
        dejaEmis: ANTERIEUR,
        donneesFigees: brut,
        anneeAttendue: "2025-2026",
      });
      assert.equal(d.action, "refuser");
      if (d.action !== "refuser") return;
      // Le motif doit nommer le numéro déjà parti, c'est lui qui bloque.
      assert.match(d.raison, /CS-2026-0003/);
    }
  });

  it("refuse une réémission sans raison, ou motivée d'un mot", () => {
    for (const raison of [undefined, null, "", "   ", "perdu"]) {
      const d = deciderEmission({
        dejaEmis: ANTERIEUR,
        donneesFigees: figees(),
        anneeAttendue: "2025-2026",
        reemissionDemandee: true,
        raison,
      });
      assert.equal(d.action, "refuser");
    }
  });

  it("émet et conserve la raison quand la réémission est motivée", () => {
    const d = deciderEmission({
      dejaEmis: ANTERIEUR,
      donneesFigees: figees(),
      anneeAttendue: "2025-2026",
      reemissionDemandee: true,
      raison: "  Exemplaire perdu par la famille  ",
    });
    assert.deepEqual(d, { action: "emettre", raison: "Exemplaire perdu par la famille" });
  });

  it("refuse la réémission non motivée même sans document antérieur", () => {
    // Demander une réémission alors qu'il n'y a rien à réémettre révèle une
    // erreur de manipulation : on ne la récompense pas d'un numéro.
    const d = deciderEmission({ dejaEmis: null, reemissionDemandee: true });
    assert.equal(d.action, "refuser");
  });
});
