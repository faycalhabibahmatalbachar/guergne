/**
 * Recette des missions multi-étapes.
 *
 * La règle qui gouverne ce module : **les chiffres sont calculés en code, à
 * partir des lignes rendues par le backend. Le modèle ne les produit jamais.**
 * Un modèle à qui l'on demande une synthèse chiffrée arrondit, invente une
 * tendance, ajoute un total qui paraît juste — et le directeur qui le lit n'a
 * aucun moyen de le savoir.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { AuditLog } from "../src/audit.js";
import { Agent, Status } from "../src/engine.js";
import { FakePermissionChecker } from "../src/guard.js";
import { IdempotencyStore } from "../src/idempotency.js";
import { IdentityStore } from "../src/identity.js";
import { ETAPE, MAX_ETAPES, agreger, estTransitoire, rendreBilan, validerMission } from "../src/mission.js";
import { MoteurPolitiques, POLITIQUES_DEFAUT } from "../src/politiques.js";
import { FakeProvider } from "../src/provider.js";
import { ASSIDUITE_TOOLS, ToolRegistry } from "../src/tools.js";

const reg = new ToolRegistry(ASSIDUITE_TOOLS);
const JID = "23560000001@c.us";
const JID_CHEF = "23560000009@c.us";

const MISSION = {
  intention: "mission",
  but: "Bilan d'assiduite du mois",
  etapes: [
    { outil: "assiduite.consulter_absences", params: { limite: 100 }, libelle: "Absences" },
    { outil: "assiduite.consulter_retards", params: { limite: 100 }, libelle: "Retards" },
  ],
};

// --- Agrégation : la seule source des chiffres -----------------------------

test("agreger compte ce qu'il y a, et rien d'autre", () => {
  const a = agreger([
    { classe: "6ème B", statut: "NON_JUSTIFIEE", nbHeures: 2 },
    { classe: "6ème B", statut: "JUSTIFIEE", nbHeures: 1.5 },
    { classe: "3ème A", statut: "NON_JUSTIFIEE", nbHeures: 3 },
  ]);
  assert.equal(a.total, 3);
  assert.equal(a.heures, 6.5);
  assert.deepEqual(a.parStatut, { NON_JUSTIFIEE: 2, JUSTIFIEE: 1 });
  assert.deepEqual(a.parClasse, [{ classe: "6ème B", n: 2 }, { classe: "3ème A", n: 1 }]);
});

test("deux classes a egalite sortent dans un ordre stable", () => {
  // Sans cela, deux bilans du meme jour differeraient sans raison.
  const lignes = [{ classe: "6ème B" }, { classe: "3ème A" }];
  assert.deepEqual(agreger(lignes).parClasse.map((c) => c.classe), ["3ème A", "6ème B"]);
});

test("agreger ne se laisse pas surprendre par des donnees incompletes", () => {
  const a = agreger([{}, { nbHeures: "pas un nombre" }, { classe: null }]);
  assert.equal(a.total, 3);
  assert.equal(a.heures, 0);
  assert.equal(a.parClasse[0].classe, "classe inconnue");
  assert.deepEqual(agreger(null), { total: 0, parClasse: [], parStatut: {}, heures: 0 });
});

// --- Validation d'un plan de mission ---------------------------------------

test("une mission ne contient que des CONSULTATIONS", () => {
  // Y glisser une ecriture ferait executer en chaine, sans confirmation ni
  // regard, ce qui modifie des dossiers.
  const r = validerMission(
    { etapes: [{ outil: "assiduite.consulter_absences" }, { outil: "assiduite.enregistrer_appel" }] },
    reg,
  );
  assert.equal(r.ok, false);
  assert.match(r.raison, /n'est pas une consultation/);
});

test("une mission sans etape, ou trop longue, est refusee", () => {
  assert.equal(validerMission({ etapes: [] }, reg).ok, false);
  const trop = { etapes: Array.from({ length: MAX_ETAPES + 1 }, () => ({ outil: "assiduite.alertes" })) };
  assert.match(validerMission(trop, reg).raison, new RegExp(`maximum ${MAX_ETAPES}`));
});

test("un outil inconnu dans une etape est nomme", () => {
  const r = validerMission({ etapes: [{ outil: "assiduite.inventee" }] }, reg);
  assert.match(r.raison, /outil inconnu « assiduite\.inventee »/);
});

test("une mission valide porte ses outils resolus", () => {
  const r = validerMission(MISSION, reg);
  assert.equal(r.ok, true);
  assert.equal(r.but, "Bilan d'assiduite du mois");
  assert.equal(r.etapes.length, 2);
  assert.equal(r.etapes[0].tool.name, "assiduite.consulter_absences");
});

// --- Rendu -----------------------------------------------------------------

test("le bilan dit ce qu'il n'a PAS pu lire", () => {
  // Un bilan muet sur ses trous laisse croire que le reste est complet.
  const texte = rendreBilan({
    but: "Bilan",
    resultats: [
      { libelle: "Absences", statut: ETAPE.REUSSIE, agregat: agreger([{ classe: "6ème B", nbHeures: 2 }]) },
      { libelle: "Retards", statut: ETAPE.REFUSEE, detail: "droits insuffisants" },
    ],
  });
  assert.match(texte, /Absences : 1 resultat, 2 h/);
  assert.match(texte, /Retards : non disponible \(droits insuffisants\)/);
  assert.match(texte, /1\/2 consultations abouties — bilan partiel/);
});

test("un bilan complet le dit aussi", () => {
  const texte = rendreBilan({
    but: "Bilan",
    resultats: [{ libelle: "Absences", statut: ETAPE.REUSSIE, agregat: agreger([{ classe: "A" }]) }],
  });
  assert.match(texte, /chiffres issus de la base/);
});

// --- Reprise ---------------------------------------------------------------

test("une panne passagere se reessaie, un refus de droits jamais", () => {
  assert.equal(estTransitoire("ECONNRESET sur le reseau"), true);
  assert.equal(estTransitoire("HTTP 503 service indisponible"), true);
  assert.equal(estTransitoire("delai depasse"), true);
  // Reessayer un refus serait insister contre une decision de securite.
  assert.equal(estTransitoire("Droits insuffisants cote plateforme."), false);
  assert.equal(estTransitoire("permission refusee"), false);
  assert.equal(estTransitoire(""), false);
});

// --- Bout en bout dans le moteur -------------------------------------------

function monter({ plan = MISSION, grants, guergne } = {}) {
  const provider = new FakeProvider();
  const audit = new AuditLog();
  const etapes = [];
  const appels = [];
  const sim = guergne ?? {
    listerAbsences: async () => {
      appels.push("listerAbsences");
      return { ok: true, data: [{ classe: "6ème B", statut: "NON_JUSTIFIEE", nbHeures: 2 }, { classe: "3ème A", nbHeures: 1 }] };
    },
    listerRetards: async () => {
      appels.push("listerRetards");
      return { ok: true, data: [{ classe: "6ème B" }] };
    },
  };
  const agent = new Agent({
    provider,
    identity: new IdentityStore([{ jid: JID, id: "u-1", nom: "Awa", role: "DIRECTION", msisdn: "23560000001" }]),
    idempotency: new IdempotencyStore(),
    audit,
    tools: reg,
    permissions: new FakePermissionChecker(grants ?? { DIRECTION: new Set(["assiduite:lire", "discipline:lire"]) }),
    guergne: sim,
    politiques: new MoteurPolitiques({ politiques: POLITIQUES_DEFAUT }),
    interpret: async () => plan,
    journalEtape: (e) => etapes.push(e),
    destinatairesNotification: async () => [JID_CHEF],
  });
  let n = 0;
  const ecrire = () => agent.handle({ id: `m-${n++}`, from: JID, body: "prepare le bilan" });
  return { agent, provider, audit, etapes, appels, ecrire };
}

test("une mission enchaine ses consultations et rend un bilan chiffre", async () => {
  const h = monter();
  const r = await h.ecrire();
  assert.equal(r.status, Status.COMPLETED);
  assert.deepEqual(h.appels, ["listerAbsences", "listerRetards"], "les etapes s'executent dans l'ordre");

  const bilan = h.provider.lastTextTo(JID) ?? "";
  assert.match(bilan, /Bilan d'assiduite du mois/);
  assert.match(bilan, /Absences : 2 resultats, 3 h, 1 non justifiée/);
  assert.match(bilan, /Retards : 1 resultat/);
  assert.equal(r.mission.reussies, 2);
});

test("une mission ne demande AUCUNE confirmation", async () => {
  const h = monter();
  const r = await h.ecrire();
  assert.notEqual(r.status, Status.WAITING_APPROVAL);
  assert.ok(!/confirmer/i.test(h.provider.lastTextTo(JID) ?? ""));
});

test("une etape refusee n'arrete pas la mission", async () => {
  // Les autres consultations restent utiles.
  const h = monter({ grants: { DIRECTION: new Set(["assiduite:lire"]) } });
  const plan = {
    ...MISSION,
    etapes: [...MISSION.etapes, { outil: "discipline.consulter_incidents", params: {}, libelle: "Incidents" }],
  };
  const h2 = monter({ plan, grants: { DIRECTION: new Set(["assiduite:lire"]) } });
  const r = await h2.ecrire();
  assert.equal(r.status, Status.COMPLETED);
  assert.equal(r.mission.reussies, 2);
  assert.match(h2.provider.lastTextTo(JID) ?? "", /Incidents : non disponible/);
  assert.equal(h.agent.metriques.refusPermission + h2.agent.metriques.refusPermission >= 1, true);
});

test("une panne passagere est reprise automatiquement", async () => {
  let essais = 0;
  const guergne = {
    listerAbsences: async () => {
      essais += 1;
      if (essais === 1) throw new Error("ECONNRESET");
      return { ok: true, data: [{ classe: "6ème B" }] };
    },
    listerRetards: async () => ({ ok: true, data: [] }),
  };
  const h = monter({ guergne });
  const r = await h.ecrire();
  assert.equal(essais, 2, "une seconde tentative doit avoir lieu");
  assert.equal(r.mission.reussies, 2);
  assert.equal(h.agent.metriques.repriseApresEchec, 1);
  assert.ok(h.etapes.some((e) => e.event === "mission_reprise"));
});

test("un refus de droits n'est JAMAIS reessaye", async () => {
  let essais = 0;
  const guergne = {
    listerAbsences: async () => {
      essais += 1;
      return { ok: false, message: "Droits insuffisants côté plateforme." };
    },
    listerRetards: async () => ({ ok: true, data: [] }),
  };
  const h = monter({ guergne });
  await h.ecrire();
  assert.equal(essais, 1, "insister contre une decision de securite n'a aucun sens");
});

test("le rapport est transmis aux responsables, sans rien leur demander", async () => {
  const h = monter();
  await h.ecrire();
  const avis = h.provider.lastTextTo(JID_CHEF) ?? "";
  assert.match(avis, /prepare automatiquement/);
  assert.match(avis, /Absences : 2 resultats/);
  assert.ok(!/confirmer/i.test(avis));
});

test("une mission dont une etape ecrit est refusee avant toute execution", async () => {
  const h = monter({
    plan: { ...MISSION, etapes: [{ outil: "assiduite.enregistrer_appel", params: {} }] },
  });
  const r = await h.ecrire();
  assert.equal(r.rejet, "MISSION_INVALIDE");
  assert.equal(h.appels.length, 0, "rien ne doit avoir ete appele");
  assert.equal(h.audit.last().result, "PLAN_INVALIDE");
});

test("les indicateurs comptent le rapport genere", async () => {
  const h = monter();
  await h.ecrire();
  assert.equal(h.agent.metriques.rapportsGeneres, 1);
  assert.equal(h.agent.metriques.automatiques, 2, "chaque etape passe par sa politique");
});

test("les consultations d'une mission sont comptees", async () => {
  // Sans ce comptage, un bilan de quatre consultations en affichait zero :
  // l'indicateur d'autonomie aurait menti par omission.
  const h = monter();
  await h.ecrire();
  const m = h.agent.metriques;
  assert.equal(m.consultations, 2);
  assert.equal(m.operationsReussies, 2);
  assert.equal(m.tauxAutonomie, 1);
});

test("une etape en echec est comptee comme telle", async () => {
  const guergne = {
    listerAbsences: async () => ({ ok: false, message: "Droits insuffisants côté plateforme." }),
    listerRetards: async () => ({ ok: true, data: [] }),
  };
  const h = monter({ guergne });
  await h.ecrire();
  assert.equal(h.agent.metriques.operationsEchouees, 1);
  assert.equal(h.agent.metriques.operationsReussies, 1);
});
