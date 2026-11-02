/**
 * Tests de la porte de la génération des bulletins.
 *
 * Exécution : `node --test src/server/domain/generation-bulletins.test.ts`
 *
 * Ces tests portent sur la DÉCISION, pas sur l'écriture : ils n'ouvrent
 * aucune connexion. Ce qu'ils vérifient est exactement ce qui empêche une
 * régénération d'écraser 1 647 bulletins déjà publiés — un refus qui ne
 * serait pas éprouvé ne protège rien.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deciderGeneration } from "./generation-bulletins-decision.ts";

const CLASSE = "6ème A";
const PERIODE = "Trimestre 1";

/** Cas nominal : période ouverte, rien de publié, aucune dérogation. */
function libre(partiel: Partial<Parameters<typeof deciderGeneration>[0]> = {}) {
  return deciderGeneration({
    classe: CLASSE,
    periode: PERIODE,
    periodeVerrouillee: false,
    bulletinsPublies: 0,
    ...partiel,
  });
}

describe("deciderGeneration — ce qui passe", () => {
  it("autorise une période libre sans bulletin publié", () => {
    const d = libre();
    assert.equal(d.autorise, true);
    assert.equal(d.raison, undefined);
    // Aucune dérogation n'a eu lieu : rien à consigner au journal d'audit.
    assert.equal(d.motifDerogation, undefined);
  });

  it("n'exige aucun motif quand rien ne bloque", () => {
    const d = libre({ forcer: true, motif: "" });
    assert.equal(d.autorise, true);
    assert.equal(d.motifDerogation, undefined);
  });
});

describe("deciderGeneration — ce qui refuse", () => {
  it("refuse une période verrouillée", () => {
    const d = libre({ periodeVerrouillee: true });
    assert.equal(d.autorise, false);
    assert.match(String(d.raison), /verrouill/i);
    // Le message doit NOMMER la période : « génération refusée » tout court
    // n'apprend rien à qui gère trois périodes et vingt classes.
    assert.ok(String(d.raison).includes(PERIODE));
    // Et dire quoi faire ensuite.
    assert.match(String(d.raison), /d[eé]verrouill/i);
  });

  it("refuse quand des bulletins sont déjà publiés", () => {
    const d = libre({ bulletinsPublies: 42 });
    assert.equal(d.autorise, false);
    assert.ok(String(d.raison).includes("42"));
    assert.ok(String(d.raison).includes(CLASSE));
    assert.match(String(d.raison), /d[eé]publi/i);
  });

  it("énonce les DEUX obstacles quand ils se cumulent", () => {
    const d = libre({ periodeVerrouillee: true, bulletinsPublies: 1647 });
    assert.equal(d.autorise, false);
    // Lever un seul des deux verrous ne débloquerait rien : qui ne lit qu'un
    // obstacle déverrouille la période, relance, et se fait refuser à nouveau.
    assert.match(String(d.raison), /verrouill/i);
    assert.ok(String(d.raison).includes("1647"));
  });

  it("refuse un nombre de bulletins publiés quand il est connu, même à 1", () => {
    assert.equal(libre({ bulletinsPublies: 1 }).autorise, false);
  });
});

describe("deciderGeneration — la dérogation", () => {
  it("n'est jamais active par défaut", () => {
    // Pas de `forcer` : l'absence du paramètre vaut refus, et non passage.
    assert.equal(libre({ periodeVerrouillee: true }).autorise, false);
    assert.equal(libre({ periodeVerrouillee: true, forcer: false }).autorise, false);
  });

  it("refuse une dérogation sans motif", () => {
    const d = libre({ periodeVerrouillee: true, forcer: true });
    assert.equal(d.autorise, false);
    assert.match(String(d.raison), /motif/i);
  });

  it("refuse un motif fait d'espaces", () => {
    const d = libre({ bulletinsPublies: 3, forcer: true, motif: "   \n\t " });
    assert.equal(d.autorise, false);
    assert.match(String(d.raison), /motif/i);
  });

  it("autorise une dérogation motivée et CONSERVE le motif", () => {
    const motif = "Erreur de coefficient en mathématiques, corrigée sur décision du censeur.";
    const d = libre({ periodeVerrouillee: true, bulletinsPublies: 31, forcer: true, motif });
    assert.equal(d.autorise, true);
    assert.equal(d.raison, undefined);
    // Le motif remonte pour être journalisé : une dérogation non traçable
    // vaudrait l'absence de verrou.
    assert.equal(d.motifDerogation, motif);
  });

  it("nettoie les blancs autour du motif sans en altérer le texte", () => {
    const d = libre({ periodeVerrouillee: true, forcer: true, motif: "  Motif retenu.  " });
    assert.equal(d.autorise, true);
    assert.equal(d.motifDerogation, "Motif retenu.");
  });
});

describe("deciderGeneration — robustesse du comptage", () => {
  it("traite un comptage absurde comme une absence de bulletin publié", () => {
    // `count(*)` revient en texte depuis PostgreSQL : un Number(…) raté
    // donnerait NaN, et un NaN qui ouvrirait la porte serait le pire des cas.
    assert.equal(libre({ bulletinsPublies: Number.NaN }).autorise, true);
    assert.equal(libre({ bulletinsPublies: -5 }).autorise, true);
  });

  it("refuse malgré un comptage fractionnaire supérieur à un", () => {
    assert.equal(libre({ bulletinsPublies: 2.7 }).autorise, false);
  });
});
