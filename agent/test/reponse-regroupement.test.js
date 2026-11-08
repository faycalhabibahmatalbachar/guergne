/**
 * Recette du regroupement des fragments successifs.
 *
 * LE CAS QUI MOTIVE CE MODULE
 * ----------------------------
 *   « Affiche-moi les absences »   puis   « de la 6e A »
 *
 * Traités séparément, le premier déclenche une clarification que le second a
 * déjà résolue : deux réponses pour une intention. Mais une fenêtre
 * d'attente est un délai imposé à TOUT LE MONDE — ces tests vérifient donc
 * autant ce qui est regroupé que ce qui ne doit PAS l'être.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { Regroupeur, paraitComplet, paraitFragment } from "../src/reponse/regroupement.js";

/**
 * Un minuteur que le test fait avancer lui-même.
 *
 * Attendre de vraies millisecondes rendrait ces tests lents et capricieux : le
 * comportement dépend du temps, pas de la vitesse de la machine.
 */
function horlogerie() {
  let maintenant = 0;
  const taches = [];
  return {
    horloge: () => maintenant,
    programmer: (fn, ms) => {
      const t = { fn, quand: maintenant + ms, annulee: false };
      taches.push(t);
      return t;
    },
    annuler: (t) => {
      if (t) t.annulee = true;
    },
    /** Avance le temps et exécute ce qui doit l'être, dans l'ordre. */
    avancer(ms) {
      maintenant += ms;
      for (const t of [...taches].sort((a, b) => a.quand - b.quand)) {
        if (!t.annulee && t.quand <= maintenant) {
          t.annulee = true;
          t.fn();
        }
      }
    },
  };
}

function regroupeur(options = {}) {
  const h = horlogerie();
  const lots = [];
  const r = new Regroupeur({
    traiter: (lot) => {
      lots.push(lot);
      return { traite: lot.texte };
    },
    horloge: h.horloge,
    programmer: h.programmer,
    annuler: h.annuler,
    ...options,
  });
  return { r, lots, h };
}

test("deux fragments successifs forment UNE seule demande", async () => {
  const { r, lots, h } = regroupeur();
  r.ajouter("A@c.us", { id: "M1" }, "Affiche-moi les absences");
  r.ajouter("A@c.us", { id: "M2" }, "de la 6e A");
  h.avancer(1300);

  assert.equal(lots.length, 1, "une seule consultation, pas deux");
  assert.equal(lots[0].texte, "Affiche-moi les absences de la 6e A");
  assert.equal(lots[0].messages.length, 2, "aucun message n'est perdu");
  assert.deepEqual(lots[0].messages.map((m) => m.id), ["M1", "M2"], "l'ordre est conserve");
});

test("une question complete n'attend pas la fenetre", async () => {
  const { r, lots } = regroupeur();
  const p = r.ajouter("A@c.us", { id: "M1" }, "Combien d'eleves sont inscrits en 6e A ?");
  await p;
  // Pas besoin d'avancer le temps : la reponse ne doit pas etre retardee.
  assert.equal(lots.length, 1);
  assert.equal(r.metriques.immediats, 1);
});

test("deux conversations ne sont JAMAIS melangees", async () => {
  const { r, lots, h } = regroupeur();
  r.ajouter("A@c.us", { id: "M1" }, "les absences");
  r.ajouter("B@c.us", { id: "M2" }, "les retards");
  h.avancer(1300);

  assert.equal(lots.length, 2);
  const parJid = Object.fromEntries(lots.map((l) => [l.jid, l.texte]));
  assert.equal(parJid["A@c.us"], "les absences");
  assert.equal(parJid["B@c.us"], "les retards");
});

test("deux demandes independantes ne sont pas regroupees abusivement", async () => {
  const { r, lots, h } = regroupeur();
  r.ajouter("A@c.us", { id: "M1" }, "les absences");
  h.avancer(1300);
  r.ajouter("A@c.us", { id: "M2" }, "les retards");
  h.avancer(1300);

  assert.equal(lots.length, 2, "une demande arrivee apres la fenetre est independante");
  assert.equal(lots[0].texte, "les absences");
  assert.equal(lots[1].texte, "les retards");
});

test("un flot continu finit par recevoir une reponse : le plafond", async () => {
  const { r, lots, h } = regroupeur({ fenetreMs: 1000, plafondMs: 3000 });
  r.ajouter("A@c.us", { id: "M1" }, "les absences");
  // Quelqu'un qui ecrit sans fin ne doit pas attendre indefiniment.
  for (let i = 2; i <= 6; i += 1) {
    h.avancer(900);
    r.ajouter("A@c.us", { id: `M${i}` }, `et aussi ${i}`);
  }
  h.avancer(1200);

  assert.ok(lots.length >= 1, "le lot a bien ete rendu");
  assert.ok(r.metriques.plafonds >= 1, "le plafond a joue son role");
  const total = lots.reduce((n, l) => n + l.messages.length, 0);
  assert.equal(total, 6, "aucun message perdu malgre le plafond");
});

test("un fragment qui arrive ferme la fenetre s'il est complet", async () => {
  const { r, lots, h } = regroupeur();
  r.ajouter("A@c.us", { id: "M1" }, "les absences");
  r.ajouter("A@c.us", { id: "M2" }, "de quelle classe parles-tu ?");
  // La question complete ferme tout de suite : attente de 0.
  h.avancer(1);
  assert.equal(lots.length, 1);
  assert.equal(lots[0].messages.length, 2);
});

test("le meme lot est rendu a tous ses fragments", async () => {
  const { r, h } = regroupeur();
  const a = r.ajouter("A@c.us", { id: "M1" }, "les absences");
  const b = r.ajouter("A@c.us", { id: "M2" }, "de la 6e A");
  h.avancer(1300);
  assert.deepEqual(await a, await b, "l'appelant n'a pas a savoir s'il a declenche le traitement");
});

test("un traitement qui leve ne laisse pas la promesse en suspens", async () => {
  const h = horlogerie();
  const r = new Regroupeur({
    traiter: () => {
      throw new Error("l'agent a echoue");
    },
    horloge: h.horloge,
    programmer: h.programmer,
    annuler: h.annuler,
  });
  const p = r.ajouter("A@c.us", { id: "M1" }, "les absences");
  h.avancer(1300);
  await assert.rejects(() => p, /l'agent a echoue/);
});

test("la vidange complete ne perd aucun message en attente", async () => {
  const { r, lots } = regroupeur();
  r.ajouter("A@c.us", { id: "M1" }, "les absences");
  r.ajouter("B@c.us", { id: "M2" }, "les retards");
  r.vidangeComplete();
  assert.equal(lots.length, 2, "un arret ne doit pas avaler les demandes en cours");
});

test("les indices de completude et de fragment sont prudents", () => {
  assert.equal(paraitComplet("Combien d'eleves en 6e A ?"), true);
  assert.equal(paraitComplet("كم عدد الطلاب؟"), true);
  assert.equal(paraitComplet("les absences"), false);
  assert.equal(paraitComplet(""), false);

  assert.equal(paraitFragment("de la 6e A"), true);
  assert.equal(paraitFragment("et aussi les retards"), true);
  assert.equal(paraitFragment("من الصف السادس"), true);
  // Une phrase entiere n'est pas un fragment.
  assert.equal(paraitFragment("Affiche-moi toutes les absences de l'annee pour la classe de sixieme A"), false);
});
