/**
 * Recette de l'autonomie : les politiques dans l'orchestrateur.
 *
 * Le test central de ce fichier est celui du RBAC. Une politique répond à
 * « faut-il demander confirmation ? », jamais à « a-t-il le droit ? ». Si elle
 * pouvait ouvrir un droit, elle deviendrait un contournement du contrôle
 * d'accès avec l'apparence d'une règle d'établissement — la pire des portes
 * dérobées, parce qu'elle serait documentée.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { AuditLog } from "../src/audit.js";
import { Agent, Status } from "../src/engine.js";
import { FakePermissionChecker } from "../src/guard.js";
import { IdempotencyStore } from "../src/idempotency.js";
import { IdentityStore } from "../src/identity.js";
import { MoteurPolitiques, NOTIFIER } from "../src/politiques.js";
import { FakeProvider } from "../src/provider.js";
import { ASSIDUITE_TOOLS, ToolRegistry } from "../src/tools.js";
import { GuergneSim } from "./harness.js";

const JID = "23560000001@c.us";
const JID_CHEF = "23560000009@c.us";

const PLAN_APPEL = {
  intention: "outil",
  outil: "assiduite.enregistrer_appel",
  params: { periodeId: "p-1", dateAbsence: "2026-11-02", absents: ["i-1"], nbHeures: 2 },
};
const PLAN_SUPPRESSION = {
  intention: "outil",
  outil: "assiduite.supprimer_absence",
  params: { absenceId: "a-1", motif: "saisie erronee" },
};

const POLITIQUE_APPEL = {
  id: "appel-auto",
  version: 3,
  description: "Saisie de l'appel sans confirmation.",
  operations: ["assiduite.enregistrer_appel"],
  roles: ["SURVEILLANT"],
  notifier: { quand: NOTIFIER.ECHEC, destinataires: ["DIRECTION"] },
};

function monter({ plan = PLAN_APPEL, politiques = [POLITIQUE_APPEL], grants, guergne } = {}) {
  const provider = new FakeProvider();
  const audit = new AuditLog();
  const etapes = [];
  const sim = guergne ?? new GuergneSim();
  const agent = new Agent({
    provider,
    identity: new IdentityStore([{ jid: JID, id: "u-1", nom: "Awa", role: "SURVEILLANT" }]),
    idempotency: new IdempotencyStore(),
    audit,
    tools: new ToolRegistry(ASSIDUITE_TOOLS),
    permissions: new FakePermissionChecker(
      grants ?? { SURVEILLANT: new Set(["assiduite:lire", "assiduite:saisir", "retard:saisir"]) },
    ),
    guergne: sim,
    politiques: new MoteurPolitiques({ politiques }),
    interpret: async () => plan,
    journalEtape: (e) => etapes.push(e),
    destinatairesNotification: async (roles) => (roles.includes("DIRECTION") ? [JID_CHEF] : []),
  });
  let n = 0;
  const ecrire = (texte = "fais-le") => agent.handle({ id: `a-${n++}`, from: JID, body: texte });
  return { agent, provider, audit, etapes, guergne: sim, ecrire };
}

// --- Le test qui compte le plus --------------------------------------------

test("une politique n'ouvre AUCUN droit : le RBAC garde le dernier mot", async () => {
  // Meme couverte par une politique, une operation que le role n'autorise pas
  // reste refusee. Sans cela, une politique serait une porte derobee — la pire
  // qui soit, parce qu'elle serait documentee.
  const h = monter({ grants: { SURVEILLANT: new Set(["assiduite:lire"]) } });
  await h.ecrire();
  assert.equal(h.audit.last().result, "DENIED");
  assert.equal(h.audit.last().permission, "DENIED:assiduite:saisir");
  assert.equal(h.guergne.calls.length, 0, "le backend ne doit meme pas etre appele");
});

// --- Autonomie -------------------------------------------------------------

test("une ecriture couverte par une politique s'execute SANS confirmation", async () => {
  const h = monter();
  const r = await h.ecrire();
  assert.equal(r.status, Status.COMPLETED, "aucune attente d'approbation");
  assert.equal(h.guergne.countOf("enregistrerAppel"), 1);
  const e = h.etapes.find((x) => x.event === "politique_evaluee");
  assert.equal(e.decision, "AUTOMATIQUE");
  assert.equal(e.politique, "appel-auto");
  assert.equal(e.version, 3);
});

test("sans politique, la meme ecriture sensible demande confirmation", async () => {
  const h = monter({ plan: PLAN_SUPPRESSION, politiques: [] });
  const r = await h.ecrire();
  assert.equal(r.status, Status.WAITING_APPROVAL);
  assert.equal(h.guergne.calls.length, 0, "rien n'est execute avant la reponse");
  assert.match(h.provider.lastTextTo(JID) ?? "", /oui/);
});

test("une suppression reste sous confirmation meme quand l'appel est automatise", async () => {
  // Les politiques par defaut ne couvrent pas l'irreversible.
  const h = monter({ plan: PLAN_SUPPRESSION, politiques: [POLITIQUE_APPEL] });
  assert.equal((await h.ecrire()).status, Status.WAITING_APPROVAL);
});

test("le role hors politique retombe sur la confirmation, sans perdre le droit", async () => {
  const h = monter({ politiques: [{ ...POLITIQUE_APPEL, roles: ["ENSEIGNANT"] }] });
  const r = await h.ecrire();
  // `enregistrer_appel` est une ecriture ordinaire : sans politique, elle
  // s'execute quand meme — la confirmation ne concerne que le sensible.
  assert.equal(r.status, Status.COMPLETED);
  const e = h.etapes.find((x) => x.event === "politique_evaluee");
  assert.equal(e.decision, "CONFIRMATION");
  assert.equal(e.motif, "ROLE_HORS_POLITIQUE");
});

// --- Notifications ---------------------------------------------------------

test("les responsables sont INFORMES d'un echec, pas sollicites", async () => {
  const guergne = new GuergneSim({ fail: "enregistrerAppel" });
  const h = monter({ guergne });
  await h.ecrire();
  const avis = h.provider.lastTextTo(JID_CHEF) ?? "";
  assert.match(avis, /ECHEC d'operation/);
  assert.match(avis, /assiduite\.enregistrer_appel/);
  assert.match(avis, /Politique : appel-auto \(v3\)/);
  assert.ok(!/confirmer/i.test(avis), "une notification informe, elle ne demande rien");
});

test("une reussite ne derange personne quand la politique dit « echec »", async () => {
  const h = monter();
  await h.ecrire();
  assert.ok(!h.provider.lastTextTo(JID_CHEF), "noyer les responsables les ferait ne plus rien lire");
});

test("une politique « toujours » notifie aussi les reussites", async () => {
  const h = monter({ politiques: [{ ...POLITIQUE_APPEL, notifier: { quand: NOTIFIER.TOUJOURS, destinataires: ["DIRECTION"] } }] });
  await h.ecrire();
  assert.match(h.provider.lastTextTo(JID_CHEF) ?? "", /Operation effectuee/);
});

test("la notification ne porte aucune donnee d'eleve", async () => {
  const guergne = new GuergneSim({ fail: "enregistrerAppel" });
  const h = monter({ guergne });
  await h.ecrire();
  const avis = h.provider.lastTextTo(JID_CHEF) ?? "";
  assert.ok(!avis.includes("i-1"), "aucun identifiant d'inscription");
  assert.ok(!avis.includes(JID.split("@")[0]), "aucun numero");
});

test("une notification qui echoue ne fait pas echouer l'operation", async () => {
  // L'operation a deja eu lieu : la perdre pour un probleme d'envoi serait
  // pire que l'absence d'avis.
  const h = monter({ politiques: [{ ...POLITIQUE_APPEL, notifier: { quand: NOTIFIER.TOUJOURS, destinataires: ["DIRECTION"] } }] });
  const original = h.provider.sendText.bind(h.provider);
  h.provider.sendText = async (jid, texte) => {
    if (jid === JID_CHEF) throw new Error("conversation introuvable");
    return original(jid, texte);
  };
  const r = await h.ecrire();
  assert.equal(r.status, Status.COMPLETED);
  assert.ok(h.etapes.some((e) => e.event === "notification_echouee"));
});

// --- Indicateurs -----------------------------------------------------------

test("les indicateurs mesurent l'autonomie reellement obtenue", async () => {
  // Sans mesure, « l'agent travaille seul » reste une impression.
  const h = monter();
  await h.ecrire();
  await h.ecrire();
  const m = h.agent.metriques;
  assert.equal(m.messages, 2);
  assert.equal(m.automatiques, 2);
  assert.equal(m.confirmationsDemandees, 0);
  assert.equal(m.operationsReussies, 2);
  assert.equal(m.ecritures, 2);
  assert.equal(m.tauxAutonomie, 1);
  assert.ok(typeof m.dureeMoyenneMs === "number");
});

test("une confirmation demandee fait baisser le taux d'autonomie", async () => {
  const h = monter({ plan: PLAN_SUPPRESSION, politiques: [] });
  await h.ecrire();
  const m = h.agent.metriques;
  assert.equal(m.confirmationsDemandees, 1);
  assert.equal(m.automatiques, 0);
  assert.equal(m.tauxAutonomie, 0);
});

test("un refus d'identite est compte a part d'un refus de permission", async () => {
  const h = monter();
  await h.agent.handle({ id: "x-1", from: "23599999999@c.us", body: "fais-le" });
  assert.equal(h.agent.metriques.refusIdentite, 1);
  assert.equal(h.agent.metriques.automatiques, 0);
});
