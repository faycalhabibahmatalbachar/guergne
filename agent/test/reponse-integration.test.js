/**
 * Recette d'INTÉGRATION : le vrai moteur, passant par l'orchestrateur.
 *
 * POURQUOI CE FICHIER EXISTE EN PLUS DES AUTRES
 * ----------------------------------------------
 * `reponse-orchestrateur.test.js` éprouve l'orchestrateur seul. Mais un
 * orchestrateur impeccable qui n'est relié à rien ne corrige aucun double
 * envoi. Ces tests font tourner le VRAI `Agent` — ses permissions, son
 * registre d'outils, son dos scolaire simulé — à travers le transport
 * enveloppé, et comptent ce qui sort réellement.
 *
 * C'est la différence entre « la réponse passe par le filtre » et « le système
 * répond une fois ».
 */
import test from "node:test";
import assert from "node:assert/strict";

import { Agent } from "../src/engine.js";
import { AuditLog } from "../src/audit.js";
import { IdentityStore } from "../src/identity.js";
import { IdempotencyStore } from "../src/idempotency.js";
import { FakePermissionChecker } from "../src/guard.js";
import { ASSIDUITE_TOOLS, ToolRegistry } from "../src/tools.js";
import { OrchestrateurReponse, avecOrchestrateur } from "../src/reponse/orchestrateur.js";
import { MODES } from "../src/reponse/politique-sortie.js";
import { GuergneSim } from "./harness.js";

const JID = "23568663737@c.us";

/** Un transport qui compte ce qui part réellement. */
function transportCompteur() {
  const textes = [];
  const audios = [];
  return {
    textes,
    audios,
    async sendText(jid, texte) {
      textes.push({ jid, texte });
      return { ok: true, idPartie: `T${textes.length}` };
    },
    async sendAudio(jid, media) {
      audios.push({ jid, octets: media?.data?.length ?? 0 });
      return { ok: true, idPartie: `A${audios.length}` };
    },
    async sendMedia() {
      return { ok: true };
    },
    onMessage() {},
  };
}

/** Une production vocale qui réussit sans synthétiser : on compte les appels. */
function voixCompteur() {
  const appels = [];
  return {
    appels,
    langues: new Map(),
    metriques: {},
    async parler(jid, texte) {
      appels.push({ jid, texte });
      return { ok: true, dureeS: 2.5, idPartie: "A1" };
    },
  };
}

/**
 * Le montage complet : vrai Agent, vraies permissions, vrai registre d'outils,
 * dos scolaire simulé, et le transport passé par l'orchestrateur.
 */
function montage({ interpret, modeDefaut } = {}) {
  const brut = transportCompteur();
  const voix = voixCompteur();
  const orchestrateur = new OrchestrateurReponse({
    provider: brut,
    voix,
    modeDefaut,
    rolesVoix: ["SUPER_ADMIN", "directeur"],
  });
  const transport = avecOrchestrateur(brut, { orchestrateur, voix });

  const guergne = new GuergneSim();
  const agent = new Agent({
    provider: transport,
    identity: new IdentityStore([
      { jid: JID, id: "staff-0", nom: "Le Proviseur", role: "directeur" },
    ]),
    idempotency: new IdempotencyStore(),
    audit: new AuditLog(),
    tools: new ToolRegistry(ASSIDUITE_TOOLS),
    permissions: new FakePermissionChecker({
      directeur: new Set(["assiduite:lire", "assiduite:saisir", "retard:saisir", "assiduite:justifier"]),
    }),
    guergne,
    interpret: interpret ?? (async () => ({ clarify: "Quelle classe souhaitez-vous consulter ?" })),
  });
  return { agent, brut, voix, orchestrateur, guergne };
}

const entrant = ({ text = "", id = `m-${Math.random().toString(36).slice(2)}`, kind } = {}) => ({
  id,
  from: JID,
  body: text,
  kind,
});

// --- TEST 1 : un message textuel simple ------------------------------------

test("integration : un message textuel donne UNE reponse ecrite, sans TTS", async () => {
  const { agent, brut, voix } = montage();
  await agent.handle(entrant({ text: "Bonjour, comment vas-tu ?" }));

  assert.equal(brut.audios.length, 0, "aucune note vocale ne doit partir");
  assert.equal(voix.appels.length, 0, "et aucune synthese ne doit meme etre lancee");
  assert.equal(brut.textes.length, 1, `un seul envoi, or : ${brut.textes.map((t) => t.texte).join(" || ")}`);
});

// --- TEST 2 : une demande scolaire -----------------------------------------

test("integration : une demande scolaire execute l'outil et repond une fois", async () => {
  const { agent, brut, voix, guergne } = montage({
    interpret: async () => ({ tool: "assiduite.consulter_absences", params: { limite: 10 } }),
  });
  await agent.handle(entrant({ text: "Affiche-moi les absences de la 6e A" }));

  assert.equal(guergne.countOf("listerAbsences"), 1, "l'outil scolaire a bien ete execute");
  assert.equal(brut.textes.length, 1, `une seule reponse, or : ${brut.textes.length}`);
  assert.equal(brut.audios.length, 0);
  assert.equal(voix.appels.length, 0);
});

// --- TEST 5 : une note vocale entrante -------------------------------------

test("integration : une note vocale entrante recoit une reponse ECRITE", async () => {
  // LE CŒUR DE LA DECISION. Parler ne veut pas dire vouloir etre ecoute.
  const { agent, brut, voix } = montage({
    interpret: async () => ({ tool: "assiduite.consulter_absences", params: { limite: 10 } }),
  });
  const message = entrant({ text: "Affiche les absences de la 6e A", kind: "audio" });
  // Le media est deja transcrit par le moteur dans la vraie vie ; ici on
  // fournit directement le texte, car ce test porte sur le FORMAT DE SORTIE.
  await agent.handle(message);

  assert.equal(brut.textes.length, 1);
  assert.equal(voix.appels.length, 0, "une question posee en vocal ne commande pas une reponse vocale");
});

// --- TEST 6 : une demande explicite de vocal -------------------------------

test("integration : une demande vocale explicite donne UNE note vocale", async () => {
  const { agent, brut, voix, orchestrateur } = montage({
    interpret: async () => ({ texte: "Il y a vingt-huit eleves inscrits en sixieme A." }),
  });
  // La demande explicite est portee par le message de l'utilisateur. L'ecoute
  // la transmet a l'orchestrateur comme preference de la conversation.
  orchestrateur.contexte(JID, { role: "directeur", preference: MODES.VOIX });
  await agent.handle(entrant({ text: "Combien d'eleves en 6e A ?" }));

  assert.equal(voix.appels.length, 1, "la synthese doit avoir lieu, une fois");
  assert.equal(brut.textes.length, 0, "et ne pas etre doublee par du texte");
});

// --- TEST 8 : un doublon entrant -------------------------------------------

test("integration : le meme message traite deux fois ne repond qu'une fois", async () => {
  const { agent, brut } = montage({
    interpret: async () => ({ texte: "Il y a vingt-huit eleves inscrits en sixieme A." }),
  });
  const message = entrant({ text: "Combien d'eleves en 6e A ?", id: "MEME-ID" });
  await agent.handle(message);
  await agent.handle({ ...message });

  assert.equal(brut.textes.length, 1, `une seule reponse pour deux traitements, or : ${brut.textes.length}`);
});

// --- Le mode reste gouverne par la politique, pas par le moteur ------------

test("integration : un deploiement peut choisir les deux formats, explicitement", async () => {
  // Le reglage reste possible — ce n'est plus le DEFAUT, c'est une decision.
  const { agent, brut, voix } = montage({
    interpret: async () => ({ texte: "Il y a vingt-huit eleves inscrits en sixieme A." }),
    modeDefaut: MODES.TEXTE_ET_VOIX,
  });
  await agent.handle(entrant({ text: "Combien d'eleves en 6e A ?" }));

  assert.equal(brut.textes.length, 1, "un texte");
  assert.equal(voix.appels.length, 1, "et une voix — un de chaque, jamais deux");
});

test("integration : le rapport de l'orchestrateur mesure ce qui est sorti", async () => {
  const { agent, orchestrateur } = montage({
    interpret: async () => ({ texte: "Il y a vingt-huit eleves inscrits en sixieme A." }),
  });
  await agent.handle(entrant({ text: "Combien d'eleves en 6e A ?" }));
  const rapport = orchestrateur.rapport();
  assert.ok(rapport.demandes >= 1);
  assert.equal(rapport.modeDefaut, MODES.TEXTE);
  assert.equal(rapport.doublons, 0);
});
