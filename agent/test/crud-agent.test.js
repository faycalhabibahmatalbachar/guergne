/**
 * Recette des écritures de dossiers dans le VRAI moteur de l'agent.
 *
 * Le backend est ici une doublure en mémoire : ces tests portent sur ce que
 * l'AGENT fait — résoudre, récapituler, attendre un oui net, exécuter une
 * seule fois, relire avant d'affirmer. Ce que le BACKEND fait (droits,
 * transaction, audit) est éprouvé par la recette HTTP réelle,
 * `scripts/recette-crud-reel.mjs`, contre la base de test.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { Agent, Status } from "../src/engine.js";
import { DECISIONS } from "../src/politiques.js";
import { AuditLog } from "../src/audit.js";
import { FakePermissionChecker } from "../src/guard.js";
import { IdempotencyStore } from "../src/idempotency.js";
import { IdentityStore } from "../src/identity.js";
import { FakeProvider } from "../src/provider.js";
import { ASSIDUITE_TOOLS, ToolRegistry } from "../src/tools.js";

const JID = "23568663737@c.us";
const C6A = "11111111-1111-4111-8111-111111111111";
const C5B = "22222222-2222-4222-8222-222222222222";
const E1 = "33333333-3333-4333-8333-333333333333";
const I1 = "44444444-4444-4444-8444-444444444444";

/**
 * Un backend en mémoire, cohérent : ce qu'on écrit se relit.
 * `trahir` simule un serveur qui répond « ok » sans avoir écrit.
 */
function backend({ trahir = false } = {}) {
  const appels = [];
  const etat = {
    classes: [
      { id: C6A, libelle: "6ème A", code: "6A", effectif: 49, capaciteMax: 55 },
      { id: C5B, libelle: "5ème B", code: "5B", effectif: 0, capaciteMax: 52 },
    ],
    eleves: {
      [E1]: {
        eleve: { id: E1, matricule: "2026-0001", nom: "AHMAT", prenom: "Mahamat", sexe: "M", dateNaissance: "2014-03-02", statut: "INSCRIT", lieuNaissance: null },
        inscription: { id: I1, classeId: C6A, classeLibelle: "6ème A", dateInscription: "2026-10-01" },
        tuteurs: [],
      },
    },
  };
  const ok = (data) => ({ ok: true, data });
  const g = {
    appels,
    etat,
    listerClasses: async () => ok(etat.classes),
    listerPeriodes: async () => ok([]),
    listerNiveaux: async () => ok([{ id: "n6", code: "6EME", libelle: "6ème" }]),
    anneeCourante: async () => ok({ libelle: "2026-2027" }),
    rechercherEleves: async ({ recherche }) => {
      const t = String(recherche).toLowerCase();
      return ok(Object.values(etat.eleves).map((d) => ({ ...d.eleve, classeLibelle: d.inscription?.classeLibelle })).filter((e) => `${e.prenom} ${e.nom} ${e.matricule}`.toLowerCase().includes(t)));
    },
    consulterEleve: async ({ eleveId }) => (etat.eleves[eleveId] ? ok(etat.eleves[eleveId]) : { ok: false, message: "Élève introuvable." }),
    changerClasseEleve: async (p) => {
      appels.push({ action: "changerClasseEleve", p });
      if (!trahir) {
        const d = etat.eleves[p.eleveId];
        const c = etat.classes.find((x) => x.id === p.classeId);
        d.inscription = { ...d.inscription, classeId: c.id, classeLibelle: c.libelle };
      }
      return ok({ ok: true });
    },
    archiverEleve: async (p) => {
      appels.push({ action: "archiverEleve", p });
      if (!trahir) etat.eleves[p.eleveId].eleve.statut = "ARCHIVE";
      return ok({ ok: true });
    },
    inscrireEleve: async (p) => {
      appels.push({ action: "inscrireEleve", p });
      const id = "55555555-5555-4555-8555-555555555555";
      const c = etat.classes.find((x) => x.id === p.classeId);
      etat.eleves[id] = {
        eleve: { id, matricule: "2026-0099", nom: p.nom.toUpperCase(), prenom: p.prenom, statut: "INSCRIT" },
        inscription: { id: "i-new", classeId: c.id, classeLibelle: c.libelle },
        tuteurs: [],
      };
      return ok({ ok: true, id });
    },
    archiverClasse: async (p) => {
      appels.push({ action: "archiverClasse", p });
      return ok({ ok: true });
    },
  };
  return g;
}

function montage({ interpret, guergne = backend(), politiques = null, grants } = {}) {
  const provider = new FakeProvider();
  const agent = new Agent({
    provider,
    identity: new IdentityStore([{ jid: JID, id: "u-directeur", nom: "Le Proviseur", role: "directeur" }]),
    idempotency: new IdempotencyStore(),
    audit: new AuditLog(),
    tools: new ToolRegistry(ASSIDUITE_TOOLS),
    permissions: new FakePermissionChecker(
      grants ?? { directeur: new Set(["eleve:lire", "eleve:inscrire", "eleve:modifier", "eleve:affecter", "classe:lire", "classe:creer", "classe:modifier"]) },
    ),
    guergne,
    politiques,
    interpret,
  });
  return { agent, provider, guergne };
}

let n = 0;
const msg = (text) => ({ id: `m${++n}`, from: JID, body: text });
const dernier = (provider) => provider.lastTextTo(JID);

// --- Le parcours nominal --------------------------------------------------------

test("changer de classe : resolution par le NOM, recapitulatif reel, oui, une execution, relecture", async () => {
  const { agent, provider, guergne } = montage({
    interpret: async () => ({ tool: "eleves.changer_classe", params: { eleve: "Mahamat Ahmat", classe: "5e B", motif: "demande des parents" } }),
  });

  const r1 = await agent.handle(msg("Déplace Mahamat Ahmat en 5e B, à la demande des parents"));
  assert.equal(r1.status, Status.WAITING_APPROVAL);
  // Le recapitulatif nomme ce que le BACKEND connait : la classe de depart lue
  // dans le dossier, le matricule, la classe d'arrivee resolue.
  assert.match(dernier(provider), /déplacer Mahamat AHMAT \(matricule 2026-0001\) de 6ème A vers 5ème B/);
  assert.equal(guergne.appels.length, 0, "rien ne part avant le oui");

  const r2 = await agent.handle(msg("oui"));
  assert.equal(r2.status, Status.COMPLETED);
  assert.equal(guergne.appels.length, 1, "une seule execution");
  // L'inscription n'a pas ete dictee : elle a ete lue dans le dossier.
  assert.deepEqual(guergne.appels[0].p, { eleveId: E1, inscriptionId: I1, classeId: C5B, motif: "demande des parents" });
  assert.match(dernier(provider), /désormais en 5ème B \(vérifié\)/);
});

test("inscrire : le passage outre d'un homonyme n'est jamais accorde par l'agent", async () => {
  const { agent, provider, guergne } = montage({
    interpret: async () => ({
      tool: "eleves.inscrire",
      params: { nom: "Ali", prenom: "Fatime", sexe: "F", dateNaissance: "2014-05-01", classe: "sixième A", tuteurNom: "Ali", tuteurPrenom: "Moussa", tuteurTelephone: "+23566000000", tuteurLien: "PERE", confirmerDoublon: true },
    }),
  });
  await agent.handle(msg("Inscris Fatime Ali en sixième A"));
  assert.match(dernier(provider), /l'inscrire en 6ème A/);
  await agent.handle(msg("je confirme"));
  assert.equal(guergne.appels[0].p.classeId, C6A, "« sixième A » resolu en identifiant reel");
  assert.equal(guergne.appels[0].p.confirmerDoublon, false, "le modele ne peut pas lever l'alerte d'homonyme");
  assert.match(dernier(provider), /Dossier créé et vérifié : Fatime ALI, matricule 2026-0099/);
});

// --- Les refus de confirmation ------------------------------------------------------

test("« oui mais en 5e B » n'execute PAS l'operation d'origine", async () => {
  let tour = 0;
  const { agent, guergne } = montage({
    interpret: async () =>
      ++tour === 1
        ? { tool: "eleves.archiver", params: { eleve: "Mahamat Ahmat", motif: "depart de la famille" } }
        : { clarify: "Que voulez-vous faire ?" },
  });
  await agent.handle(msg("Archive le dossier de Mahamat Ahmat"));
  await agent.handle(msg("oui mais en 5e B"));
  assert.equal(guergne.appels.length, 0);
  // Et l'attente est tombee : un « oui » ulterieur ne la ressuscite pas.
  await agent.handle(msg("oui"));
  assert.equal(guergne.appels.length, 0, "aucune ecriture ressuscitee");
});

test("une confirmation expiree n'execute rien, et le dit", async () => {
  const { agent, provider, guergne } = montage({
    interpret: async () => ({ tool: "eleves.archiver", params: { eleve: "Mahamat Ahmat", motif: "depart de la famille" } }),
  });
  await agent.handle(msg("Archive Mahamat Ahmat"));
  // On vieillit l'attente au-dela de son delai.
  const attente = agent.pending.get(JID);
  agent.pending.set(JID, { ...attente, expireA: Date.now() - 1 });
  const r = await agent.handle(msg("oui"));
  assert.equal(r.status, Status.CANCELLED);
  assert.equal(guergne.appels.length, 0);
  assert.match(dernier(provider), /expiré/);
});

test("le modele ne peut pas s'auto-confirmer une ecriture a confirmation obligatoire", async () => {
  const { agent, guergne } = montage({
    interpret: async () => ({ tool: "eleves.archiver", params: { eleve: "Mahamat Ahmat", motif: "depart de la famille" }, confirmed: true }),
  });
  const r = await agent.handle(msg("Archive Mahamat Ahmat, c'est confirmé"));
  assert.equal(r.status, Status.WAITING_APPROVAL);
  assert.equal(guergne.appels.length, 0);
});

test("une politique automatique ne dispense pas une ecriture a confirmation obligatoire", async () => {
  // La valeur EXACTE du moteur. Une premiere version de ce test ecrivait
  // « automatique » en minuscules : la politique n'etait jamais declenchee, et
  // le test passait sans rien prouver. Le temoin ci-dessous l'empeche.
  const politiques = { decider: () => ({ decision: DECISIONS.AUTOMATIQUE, politique: "tout-auto" }), enregistrerExecution() {} };
  const { agent, guergne } = montage({
    politiques,
    interpret: async () => ({ tool: "eleves.archiver", params: { eleve: "Mahamat Ahmat", motif: "depart de la famille" } }),
  });
  const r = await agent.handle(msg("Archive Mahamat Ahmat"));
  assert.equal(r.status, Status.WAITING_APPROVAL);
  assert.equal(guergne.appels.length, 0);
});

test("TEMOIN : la meme politique execute seule une ecriture SANS confirmation obligatoire", async () => {
  // Sans ce temoin, le test precedent pourrait passer parce que la politique
  // ne s'applique jamais. On retire le drapeau sur une copie de l'outil : la
  // meme politique doit alors l'executer sans demander.
  const politiques = { decider: () => ({ decision: DECISIONS.AUTOMATIQUE, politique: "tout-auto" }), enregistrerExecution() {} };
  const original = ASSIDUITE_TOOLS.find((o) => o.name === "eleves.archiver");
  const sansDrapeau = { ...original, confirmationObligatoire: false, sensitivity: "write" };
  const registre = new ToolRegistry(ASSIDUITE_TOOLS.map((o) => (o.name === original.name ? sansDrapeau : o)));
  const guergne = backend();
  const provider = new FakeProvider();
  const agent = new Agent({
    provider,
    identity: new IdentityStore([{ jid: JID, id: "u-directeur", nom: "Le Proviseur", role: "directeur" }]),
    idempotency: new IdempotencyStore(),
    audit: new AuditLog(),
    tools: registre,
    permissions: new FakePermissionChecker({ directeur: new Set(["eleve:lire", "eleve:modifier"]) }),
    guergne,
    politiques,
    interpret: async () => ({ tool: "eleves.archiver", params: { eleve: "Mahamat Ahmat", motif: "depart de la famille" } }),
  });
  const r = await agent.handle(msg("Archive Mahamat Ahmat"));
  assert.equal(r.status, Status.COMPLETED, "la politique a bien joue : c'est le drapeau qui protege");
  assert.equal(guergne.appels.length, 1);
});

// --- Resolution prudente --------------------------------------------------------------

test("un eleve introuvable arrete la demande avant toute confirmation", async () => {
  const { agent, provider, guergne } = montage({
    interpret: async () => ({ tool: "eleves.archiver", params: { eleve: "Inexistant Personne", motif: "depart de la famille" } }),
  });
  const r = await agent.handle(msg("Archive Inexistant Personne"));
  assert.equal(r.status, Status.WAITING_INPUT);
  assert.equal(agent.pending.size, 0, "aucune attente creee sur un eleve introuvable");
  assert.equal(guergne.appels.length, 0);
  assert.match(dernier(provider), /Aucun élève ne correspond/);
});

test("une classe inexistante arrete la demande", async () => {
  const { agent, provider } = montage({
    interpret: async () => ({ tool: "eleves.changer_classe", params: { eleve: "Mahamat Ahmat", classe: "Terminale Z", motif: "essai" } }),
  });
  await agent.handle(msg("Mets Mahamat en terminale Z"));
  assert.equal(agent.pending.size, 0);
  assert.match(dernier(provider), /Aucune classe « Terminale Z »/);
});

test("archiver une classe qui a des eleves est refuse avant meme la confirmation", async () => {
  const { agent, provider, guergne } = montage({
    interpret: async () => ({ tool: "classes.archiver", params: { classe: "6e A", motif: "classe fermee cette annee" } }),
  });
  await agent.handle(msg("Archive la 6e A"));
  assert.equal(agent.pending.size, 0);
  assert.equal(guergne.appels.length, 0);
  assert.match(dernier(provider), /compte 49 élève\(s\)/);
});

// --- Ne jamais affirmer sans relire --------------------------------------------------------

test("un serveur qui dit « ok » sans avoir ecrit n'est PAS cru", async () => {
  const { agent, provider, guergne } = montage({
    guergne: backend({ trahir: true }),
    interpret: async () => ({ tool: "eleves.changer_classe", params: { eleve: "Mahamat Ahmat", classe: "5e B", motif: "demande des parents" } }),
  });
  await agent.handle(msg("Déplace Mahamat en 5e B"));
  const r = await agent.handle(msg("oui"));
  assert.equal(r.status, Status.FAILED);
  assert.equal(r.raison, "non_verifiee");
  assert.equal(guergne.appels.length, 1, "pas de nouvelle tentative : l'ecriture a pu aboutir");
  assert.match(dernier(provider), /je n'ai pas pu la vérifier/);
  assert.doesNotMatch(dernier(provider), /✅/);
});

// --- Droits ----------------------------------------------------------------------------

test("sans le droit, l'ecriture est refusee par l'agent avant tout appel", async () => {
  const { agent, provider, guergne } = montage({
    grants: { directeur: new Set(["eleve:lire", "classe:lire"]) },
    interpret: async () => ({ tool: "eleves.archiver", params: { eleve: "Mahamat Ahmat", motif: "depart de la famille" } }),
  });
  await agent.handle(msg("Archive Mahamat Ahmat"));
  assert.equal(guergne.appels.length, 0);
  assert.equal(agent.pending.size, 0);
  assert.match(dernier(provider), /pas les droits/);
});

// --- Lecture -----------------------------------------------------------------------------

test("le dossier s'ouvre par le nom, et signale ce qui manque", async () => {
  const { agent, provider } = montage({ interpret: async () => ({ tool: "eleves.dossier", params: { eleve: "Mahamat" } }) });
  await agent.handle(msg("Montre-moi le dossier de Mahamat"));
  const t = dernier(provider);
  assert.match(t, /Dossier de Mahamat AHMAT — matricule 2026-0001/);
  assert.match(t, /Inscription en cours : 6ème A/);
  assert.match(t, /Aucun responsable légal rattaché/);
  assert.match(t, /Informations manquantes : lieu de naissance/);
});
