/**
 * Recette de la barrière de démarrage.
 *
 * L'INCIDENT QUE CES TESTS EMPÊCHENT DE REVENIR
 * ----------------------------------------------
 * Après un redémarrage d'Altare, le service a produit une rafale de réponses :
 * d'anciennes demandes, déjà traitées des jours plus tôt, ont été rejouées.
 * WhatsApp Web, en se resynchronisant, réémet des messages de l'historique, et
 * rien ne distinguait un message qui vient d'arriver d'un message vieux de
 * trois jours.
 *
 * La déduplication persistante couvre les messages DÉJÀ VUS. Elle ne peut rien
 * si son fichier est neuf ou perdu. Il fallait donc une seconde protection, de
 * nature différente : l'ÂGE du message.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { WwebjsProvider } from "../src/providers/wwebjs.js";

/**
 * Le provider sans Chromium : on lui pose la barrière à la main et on lui
 * présente des messages, exactement comme le ferait la page.
 */
function provider() {
  const traces = [];
  const p = new WwebjsProvider({
    dossierSession: "/inexistant",
    journal: { log: (l) => traces.push(JSON.parse(l)) },
  });
  return { p, traces, evenements: () => traces.map((t) => t.event) };
}

test("la barriere n'existe pas avant que la session soit prete", () => {
  const { p } = provider();
  // Poser la barriere a la construction la daterait d'avant l'ouverture de
  // Chromium et la synchronisation — elle laisserait alors passer tout ce que
  // cette synchronisation reemet.
  assert.equal(p._barriereMs, null);
});

test("un message plus ancien que la barriere est ecarte, et TRACE", () => {
  const { p, traces, evenements } = provider();
  const maintenant = Date.now();
  p._barriereMs = maintenant - 2 * 60 * 1000;
  let appele = false;
  p.onMessage(() => {
    appele = true;
  });

  // Un message de l'historique : trois jours.
  const vieux = {
    id: { _serialized: "false_235@c.us_VIEUX", id: "VIEUX", fromMe: false, remote: "235@c.us" },
    from: "235@c.us",
    type: "chat",
    body: "Affiche les absences",
    timestamp: Math.floor((maintenant - 3 * 24 * 3600 * 1000) / 1000),
  };
  p._surMessage?.(vieux);

  assert.equal(appele, false, "l'agent ne doit pas etre reveille par un message de l'historique");
  const trace = traces.find((t) => t.event === "message_historique_ignore");
  assert.ok(trace, `attendu message_historique_ignore, obtenu : ${evenements().join(", ")}`);
  // L'age est dit : si la barriere ecartait de vrais messages, le journal doit
  // le montrer, pas le cacher.
  assert.ok(trace.ageS >= 3 * 24 * 3600 - 300, `age annonce : ${trace.ageS} s`);
});

test("un message qui vient d'arriver passe", async () => {
  const { p } = provider();
  p._barriereMs = Date.now() - 2 * 60 * 1000;
  const vus = [];
  p.onMessage(async (m) => {
    vus.push(m);
    return { status: "ok" };
  });

  await p._surMessage?.({
    id: { _serialized: "false_235@c.us_NEUF", id: "NEUF", fromMe: false, remote: "235@c.us" },
    from: "235@c.us",
    type: "chat",
    body: "Affiche les absences de la 6e A",
    timestamp: Math.floor(Date.now() / 1000),
  });

  assert.equal(vus.length, 1, "un message reel doit etre traite");
});

test("un message envoye PENDANT le redemarrage passe encore", async () => {
  // La tolerance existe pour cela : un redemarrage prend du temps, et un
  // message envoye pendant l'arret est legitime.
  const { p } = provider();
  p._barriereMs = Date.now() - 2 * 60 * 1000;
  const vus = [];
  p.onMessage(async (m) => {
    vus.push(m);
    return { status: "ok" };
  });

  await p._surMessage?.({
    id: { _serialized: "false_235@c.us_PENDANT", id: "PENDANT", fromMe: false, remote: "235@c.us" },
    from: "235@c.us",
    type: "chat",
    body: "Tu es la ?",
    // Une minute avant : pendant la relance, donc apres la barriere.
    timestamp: Math.floor((Date.now() - 60 * 1000) / 1000),
  });

  assert.equal(vus.length, 1);
});

test("un message sans horodatage n'est pas ecarte a tort", async () => {
  // Mieux vaut traiter un message dont on ignore l'age que perdre une vraie
  // demande. La deduplication persistante reste la seconde protection.
  const { p } = provider();
  p._barriereMs = Date.now() - 2 * 60 * 1000;
  const vus = [];
  p.onMessage(async (m) => {
    vus.push(m);
    return { status: "ok" };
  });

  await p._surMessage?.({
    id: { _serialized: "false_235@c.us_SANSDATE", id: "SANSDATE", fromMe: false, remote: "235@c.us" },
    from: "235@c.us",
    type: "chat",
    body: "Bonjour",
    timestamp: undefined,
  });

  assert.equal(vus.length, 1);
});
