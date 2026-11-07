/**
 * Recette du jugement de fiabilité d'une transcription.
 *
 * Le cas qui a motivé ce module est le premier test : notre propre note vocale
 * bilingue, dont la moitié arabe est revenue en français halluciné. Les tests
 * suivants gardent l'inverse, et c'est le risque réel — refuser une demande
 * légitime où quelqu'un s'est simplement répété serait pire que de laisser
 * passer une hallucination discrète.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  DIVERSITE_MINIMALE,
  REPETITIONS_MOT_SEUL,
  REPETITIONS_SUSPECTES,
  detecterRepetition,
  evaluerTranscription,
} from "../src/voix/qualite-transcription.js";

/** La transcription REELLE de notre note bilingue, telle que Groq l'a rendue. */
const HALLUCINATION_REELLE =
  "Bonjour, ceci est un test du système vocal du lycée Guernier-la-Renaissance. " +
  "La synthèse française fonctionne et la transmission WhatsApp est en cours de validation. " +
  "Bonjour, c'est un test de la communication de la communication de la communication " +
  "de la communication de la communication. Il est possible de faire un test de la " +
  "communication de la communication et de l'application de la communication.";

test("l'hallucination REELLE du 7 novembre est detectee", () => {
  // Ce n'est pas un cas construit : c'est la sortie exacte de
  // whisper-large-v3-turbo sur notre propre note vocale bilingue.
  const r = evaluerTranscription(HALLUCINATION_REELLE, { langueAttendue: "ar", langueLue: "fr" });
  assert.equal(r.fiable, false);
  assert.ok(r.repetition, "la repetition doit etre trouvee");
  assert.match(r.repetition.locution, /communication/);
  assert.ok(r.repetition.fois >= 3, `repete ${r.repetition.fois} fois`);
  assert.match(r.griefs.join(" "), /decrochage/);
});

test("la locution est rapportee entiere, pas reduite a son premier mot", () => {
  // « de la communication » repete decrit ce qui se passe ; « de » repete
  // cinq fois le decrirait mal, et mettrait sur une fausse piste.
  const r = detecterRepetition("test de la communication de la communication de la communication");
  assert.ok(r);
  assert.ok(r.mots >= 2, `locution de ${r.mots} mot(s) : trop courte pour etre descriptive`);
  assert.match(r.locution, /communication/);
});

// --- Ce qui doit rester FIABLE : le risque reel -------------------------

test("une demande scolaire ordinaire est jugee fiable", () => {
  const r = evaluerTranscription(
    "Bonjour, je voudrais connaitre le nombre d'absences de la classe de sixieme A pour cette semaine.",
  );
  assert.equal(r.fiable, true, r.griefs.join(" ; "));
});

test("une phrase arabe ordinaire est jugee fiable", () => {
  const r = evaluerTranscription("مرحبا، أريد معرفة عدد الطلاب في الصف السادس.");
  assert.equal(r.fiable, true, r.griefs.join(" ; "));
});

test("une repetition humaine naturelle ne declenche rien", () => {
  // Quelqu'un qui hesite ou insiste se repete deux fois. Deux n'est pas trois.
  for (const texte of [
    "Oui oui, c'est bien cela.",
    "Non non, pas celui-la.",
    "C'est tres tres important pour la direction.",
    "Vite, vite s'il vous plait.",
  ]) {
    assert.equal(evaluerTranscription(texte).fiable, true, `refuse a tort : ${texte}`);
  }
});

test("une phrase courte qui reutilise des mots n'est pas jugee sur sa diversite", () => {
  // Sur cinq mots, la proportion de mots distincts ne veut rien dire.
  const r = evaluerTranscription("la classe de la sixieme");
  assert.equal(r.fiable, true);
  assert.equal(r.diversite, null, "trop court pour etre juge sur la diversite");
});

test("un nom repete dans une enumeration legitime passe", () => {
  const r = evaluerTranscription(
    "Je veux les absences de Mahamat Abakar, puis celles de Fatime Hassan, " +
      "et enfin celles de Djimet Oumar pour le mois de novembre.",
  );
  assert.equal(r.fiable, true, r.griefs.join(" ; "));
});

// --- Les seuils, et ce qu'ils signifient --------------------------------

test("un mot seul tolere plus de repetitions qu'une locution", () => {
  assert.ok(REPETITIONS_MOT_SEUL > REPETITIONS_SUSPECTES);
  // Trois fois le meme mot : tolere.
  assert.equal(evaluerTranscription("alors alors alors je disais que la reunion est reportee").fiable, true);
  // Cinq fois : plus tolere.
  assert.equal(evaluerTranscription("alors alors alors alors alors").fiable, false);
});

test("un texte long qui tourne en rond est refuse sur sa diversite", () => {
  // Dix mots distincts repetes sans repetition CONSECUTIVE : la detection de
  // locution ne les voit pas, et c'est la diversite qui les attrape.
  const r = evaluerTranscription(
    "le la de et un deux trois le la de et un deux trois le la de et un deux " +
      "trois le la de et un deux trois le la de et",
  );
  assert.equal(r.fiable, false);
  assert.ok(r.diversite !== null && r.diversite < DIVERSITE_MINIMALE, `diversite ${r.diversite}`);
});

test("une transcription vide est refusee, et le grief le dit", () => {
  for (const vide of ["", "   ", null, undefined, "!!! ???"]) {
    const r = evaluerTranscription(vide);
    assert.equal(r.fiable, false, `accepte a tort : ${JSON.stringify(vide)}`);
    assert.match(r.griefs.join(" "), /vide/);
  }
});

test("une langue contredite SEULE ne suffit pas a refuser", () => {
  // L'utilisateur a le droit de changer de langue. Ce n'est un signal que
  // combine a une repetition.
  const r = evaluerTranscription("Bonjour, je voudrais consulter le dossier de cet eleve.", {
    langueAttendue: "ar",
    langueLue: "fr",
  });
  assert.equal(r.fiable, true, r.griefs.join(" ; "));
});

test("le jugement ne leve jamais, quelle que soit l'entree", () => {
  for (const entree of [null, undefined, 42, {}, [], "\u0000", "é".repeat(5000)]) {
    assert.doesNotThrow(() => evaluerTranscription(entree), `leve sur ${typeof entree}`);
  }
});
