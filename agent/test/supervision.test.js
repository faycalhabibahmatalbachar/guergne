/**
 * La supervision répond aux questions d'exploitation — et ne retient rien de ce
 * qui a été dit.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { Supervision, natureErreur } from "../src/supervision.js";

function jouer() {
  const s = new Supervision({ lentMs: 5_000 });
  s.surEtape({ event: "intent_detected", run: "r1", intention: "outil", outil: "assiduite.consulter_absences", dureeMs: 900 });
  s.surEtape({ event: "entites_resolues", run: "r1", outil: "assiduite.consulter_absences", issue: "ok", dureeMs: 40 });
  s.surAudit({ runId: "r1", intent: "assiduite.consulter_absences", result: "SUCCESS", durationMs: 1800, role: "DIRECTION", message: "absences de Mahamat ABAKAR", params: { eleveId: "x" } });

  s.surEtape({ event: "intent_detected", run: "r2", intention: "outil", outil: "eleves.fiche", dureeMs: 800 });
  s.surEtape({ event: "entites_resolues", run: "r2", outil: "eleves.fiche", issue: "clarifier", choix: 2 });
  s.surAudit({ runId: "r2", intent: "eleves.fiche", result: "CLARIFICATION", durationMs: 1200 });
  s.surEtape({ event: "choix_evalue", run: "r3", outil: "eleves.fiche", compris: true });
  s.surAudit({ runId: "r3", intent: "eleves.fiche", result: "SUCCESS", durationMs: 9000 });

  s.surEtape({ event: "intent_detected", run: "r4", intention: "invalide", rejet: "OUTIL_INCONNU" });
  s.surAudit({ runId: "r4", intent: null, result: "PLAN_INVALIDE", durationMs: 700 });
  s.surAudit({ runId: "r5", intent: "eleves.modifier", result: "FAILURE", durationMs: 2100, error: "Erreur interne du serveur (500) pour ABAKAR Mahamat" });
  s.surEtape({ event: "handler_failed", run: "r6", erreur: "TypeError: x" });
  return s;
}

test("le rapport dit quels outils servent, lesquels échouent, ce qui est lent", () => {
  const r = jouer().rapport({ confirmationsEnAttente: 1 });
  assert.equal(r.totaux.messages, 5);
  assert.equal(r.outilsLesPlusUtilises[0].outil, "eleves.fiche");
  assert.deepEqual(r.outilsQuiEchouent.map((o) => o.outil), ["eleves.modifier"]);
  assert.equal(r.operationsLentes.length, 1);
  assert.equal(r.operationsLentes[0].outil, "eleves.fiche");
  assert.equal(r.demandesMalComprises[0].rejet, "OUTIL_INCONNU");
  assert.equal(r.erreursDeResolution.length, 1);
  assert.equal(r.totaux.choixProposes, 1);
  assert.equal(r.totaux.choixCompris, 1);
  assert.equal(r.conversationsInterrompues.length, 1);
  assert.equal(r.confirmationsEnAttente, 1);
  assert.equal(r.erreursBackend[0].nature, "erreur_interne_backend");
});

test("aucun texte de message, aucun paramètre, aucun nom n'entre dans la supervision", () => {
  const brut = JSON.stringify(jouer().rapport());
  assert.doesNotMatch(brut, /Mahamat|ABAKAR/);
  assert.doesNotMatch(brut, /eleveId|"params"|"message"/);
});

test("une conversation tracée est une suite d'étapes typées", () => {
  const r = jouer().rapport();
  const t = r.dernieresConversations.find((x) => x.run === "r2");
  assert.deepEqual(t.etapes.map((e) => e.etape), ["intention:outil:eleves.fiche", "resolution:clarifier"]);
  assert.equal(t.resultat, "CLARIFICATION");
});

test("la nature d'une erreur se dit sans son texte", () => {
  assert.equal(natureErreur("Vous n'avez pas les droits"), "droits");
  assert.equal(natureErreur("fetch failed: ECONNREFUSED"), "reseau");
  assert.equal(natureErreur("classeId requis"), "parametre_refuse");
  assert.equal(natureErreur(""), "inconnue");
});
