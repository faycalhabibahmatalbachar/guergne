/**
 * Recette de la préparation de texte pour la voix.
 *
 * Chaque cas correspond à quelque chose qu'une voix dirait mal si on ne le
 * traitait pas. Aucune donnée personnelle réelle : les noms et matricules sont
 * inventés.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  CIBLE_PREMIER,
  LANGUES,
  detecterLangue,
  normaliserPourOral,
  preparerPourVoix,
  segmenter,
} from "../src/voix/texte-oral.js";

// --- Détection de langue --------------------------------------------------

test("un texte francais est reconnu comme francais", () => {
  assert.equal(detecterLangue("La classe de seconde B compte trente-deux eleves."), "fr");
});

test("un texte arabe est reconnu comme arabe", () => {
  assert.equal(detecterLangue("صف الثانية باء يضم اثنين وثلاثين طالبا."), "ar");
});

test("une reponse arabe melee de chiffres et de matricules reste arabe", () => {
  // C'est le cas reel : une reponse scolaire en arabe porte des matricules et
  // des nombres en caracteres latins.
  assert.equal(detecterLangue("الطالب LGR-2025-1050 في صف 2nde B بمعدل 12,4"), "ar");
});

test("aucune langue n'est imposee quand il n'y a rien a examiner", () => {
  // Choisir le francais par defaut serait un choix non examine.
  for (const v of ["", "   ", "12,4 %", "2026-11-04", null, undefined]) {
    assert.equal(detecterLangue(v), null, `valeur ${JSON.stringify(v)}`);
  }
});

test("les langues annoncees sont celles que le systeme sait prononcer", () => {
  assert.deepEqual([...LANGUES], ["fr", "ar"]);
});

// --- Ce qu'une voix dirait mal -------------------------------------------

test("le Markdown ne se prononce pas", () => {
  const t = normaliserPourOral("**Absences** du _trimestre_ : voir `rapport.pdf`");
  assert.ok(!/[*_`]/.test(t), `marqueur restant dans « ${t} »`);
  assert.match(t, /Absences/);
  assert.match(t, /trimestre/);
});

test("une puce devient une pause, pas le mot « etoile »", () => {
  const t = normaliserPourOral("Resultats :\n• Premier eleve\n• Deuxieme eleve");
  assert.ok(!/•/.test(t));
  assert.match(t, /Premier eleve/);
  assert.match(t, /Deuxieme eleve/);
});

test("un titre perd ses diesesr mais garde son texte", () => {
  const t = normaliserPourOral("## Bilan du trimestre");
  assert.equal(t, "Bilan du trimestre");
});

test("une URL n'est pas epelee", () => {
  // Une adresse enoncee caractere par caractere occupe la voix plusieurs
  // secondes et n'apprend rien.
  const t = normaliserPourOral("Le bulletin est sur https://exemple.test/bulletins/42?x=1");
  assert.ok(!/https|exemple\.test/.test(t), `URL restante dans « ${t} »`);
  assert.match(t, /un lien/);
});

test("une URL en contexte arabe est annoncee en arabe", () => {
  const t = normaliserPourOral("التقرير على https://exemple.test/x", { langue: "ar" });
  assert.match(t, /رابط/);
  assert.ok(!/https/.test(t));
});

test("un identifiant technique est tu, pas epele", () => {
  const t = normaliserPourOral("Eleve fb5fa8be-7d33-4616-8816-f6875ca9ec39 trouve.");
  assert.ok(!/fb5fa8be|f6875ca9ec39/.test(t), `UUID restant dans « ${t} »`);
  assert.match(t, /Eleve/);
  assert.match(t, /trouve/);
});

test("un matricule est groupe pour rester notable a l'oreille", () => {
  const t = normaliserPourOral("Matricule LGR-2025-1050");
  assert.ok(!/LGR-2025-1050/.test(t), "le matricule brut serait mal prononce");
  assert.match(t, /L G R/, "les lettres sont epelees");
  assert.match(t, /2025/);
  assert.match(t, /1050/);
});

// --- Nombres, dates et heures --------------------------------------------

test("une date ISO devient une date dite", () => {
  assert.match(normaliserPourOral("Le 2026-11-04 a 15h00"), /4 novembre 2026/);
});

test("le premier du mois se dit « premier »", () => {
  assert.match(normaliserPourOral("2026-01-01"), /premier janvier 2026/);
});

test("une date au format francais est aussi traitee", () => {
  assert.match(normaliserPourOral("04/11/2026"), /4 novembre 2026/);
});

test("une heure se dit en heures", () => {
  const t = normaliserPourOral("Conseil a 15h00, fin a 16h30");
  assert.match(t, /15 heures/);
  assert.match(t, /16 heures 30/);
});

test("un decimal se dit avec « virgule »", () => {
  assert.match(normaliserPourOral("Moyenne de 12,4 sur 20"), /12 virgule 4/);
});

test("un pourcentage se dit « pour cent »", () => {
  assert.match(normaliserPourOral("95 % de presence"), /95 pour cent/);
});

// --- Ce qu'il ne faut SURTOUT pas abimer ---------------------------------

test("les accents francais sont preserves", () => {
  // Les retirer changerait la prononciation : c'est l'inverse du but.
  const t = normaliserPourOral("Bénédicte a été élève à Guergné, très régulière.");
  for (const mot of ["Bénédicte", "été", "élève", "Guergné", "très", "régulière"]) {
    assert.match(t, new RegExp(mot), `« ${mot} » abime dans « ${t} »`);
  }
});

test("les caracteres arabes sont preserves", () => {
  const source = "صف الثانية باء يضم اثنين وثلاثين طالبا";
  assert.match(normaliserPourOral(source, { langue: "ar" }), /صف الثانية باء/);
});

test("un nom propre compose n'est pas decoupe", () => {
  const t = normaliserPourOral("Jean-Baptiste N'Garta est inscrit.");
  assert.match(t, /Jean-Baptiste/);
  assert.match(t, /N'Garta/);
});

test("un texte vide ou absent rend une chaine vide, sans lever", () => {
  for (const v of ["", "   ", null, undefined]) {
    assert.doesNotThrow(() => normaliserPourOral(v));
    assert.equal(normaliserPourOral(v), "");
  }
});

// --- Segmentation ---------------------------------------------------------

test("une reponse courte ne se decoupe pas", () => {
  // La decouper produirait plusieurs notifications pour rien.
  const court = "La classe compte trente-deux eleves.";
  assert.deepEqual(segmenter(court), [court]);
});

test("le PREMIER segment est court : c'est lui qui decide du delai ressenti", () => {
  const long = Array.from({ length: 12 }, (_, i) => `Voici la phrase numero ${i + 1} du bilan trimestriel.`).join(" ");
  const s = segmenter(long);
  assert.ok(s.length > 1, "un texte long doit etre segmente");
  assert.ok(s[0].length <= CIBLE_PREMIER + 60, `premier segment trop long : ${s[0].length}`);
});

test("on ne coupe jamais au milieu d'une phrase", () => {
  // Couper au milieu produit deux moities sans prosodie.
  const long = Array.from({ length: 10 }, (_, i) => `Phrase ${i + 1} du rapport.`).join(" ");
  for (const seg of segmenter(long)) {
    assert.match(seg, /[.!?؟…]$/u, `segment sans fin de phrase : « ${seg} »`);
  }
});

test("une phrase plus longue que la cible part entiere plutot que mutilee", () => {
  const enorme = `Ceci est une phrase unique et volontairement tres longue ${"qui continue ".repeat(40)}sans point.`;
  const s = segmenter(enorme);
  assert.equal(s.length, 1);
  assert.equal(s[0], enorme.trim());
});

test("rien ne se perd au decoupage", () => {
  const long = Array.from({ length: 9 }, (_, i) => `Element ${i + 1} du bilan.`).join(" ");
  const recolle = segmenter(long).join(" ");
  assert.equal(recolle.replace(/\s+/g, " "), long.replace(/\s+/g, " "));
});

test("un texte vide ne produit aucun segment", () => {
  for (const v of ["", "   ", null, undefined]) assert.deepEqual(segmenter(v), []);
});

test("l'arabe se segmente aussi, sur sa propre ponctuation", () => {
  const ar = "هذا هو التقرير الأول. وهذا هو الثاني؟ وهذا هو الثالث. والرابع كذلك. والخامس أيضا. والسادس هنا.";
  const s = segmenter(ar, { ciblePremier: 40, cible: 60 });
  assert.ok(s.length > 1);
  assert.equal(s.join(" ").replace(/\s+/g, " "), ar);
});

// --- De bout en bout ------------------------------------------------------

test("preparerPourVoix rend la langue, le texte dit et les segments", () => {
  const r = preparerPourVoix("**Absences** de la classe : 12,4 % au 2026-11-04. Voir https://exemple.test/x");
  assert.equal(r.langue, "fr");
  assert.ok(!/[*]|https|%/.test(r.texteOral), `texte oral mal nettoye : ${r.texteOral}`);
  assert.match(r.texteOral, /12 virgule 4 pour cent/);
  assert.match(r.texteOral, /4 novembre 2026/);
  assert.ok(r.segments.length >= 1);
});

test("une langue imposee par l'utilisateur est respectee", () => {
  const r = preparerPourVoix("Bonjour", { langue: "ar" });
  assert.equal(r.langue, "ar");
});

test("la version ecrite n'est jamais modifiee par la preparation", () => {
  // C'est la reponse ecrite qui fait foi : deux versions divergentes d'une
  // meme information scolaire seraient pires qu'une absence de voix.
  const source = "**Moyenne** : 12,4 sur 20";
  const copie = String(source);
  preparerPourVoix(source);
  assert.equal(source, copie);
});
