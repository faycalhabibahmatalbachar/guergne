/**
 * Recette du moteur de politiques.
 *
 * Une politique répond à UNE question : « faut-il demander confirmation à un
 * humain ? ». Elle ne donne jamais une permission. Le test le plus important
 * de ce fichier est celui qui le prouve — si une politique pouvait ouvrir un
 * droit, elle deviendrait un contournement du RBAC avec l'apparence d'une
 * règle d'établissement.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CompteurJournalierPersistant } from "../src/persistance.js";
import {
  DECISIONS,
  MOTIFS,
  CompteurMemoire,
  MoteurPolitiques,
  POLITIQUES_DEFAUT,
  validerPolitique,
} from "../src/politiques.js";

const OUTIL = (name, sensitivity = "write") => ({ name, sensitivity });
const STAFF = (role = "SURVEILLANT", id = "u-1") => ({ role, id });

const BASE = {
  id: "p-test",
  version: 1,
  operations: ["assiduite.enregistrer_appel"],
  roles: ["SURVEILLANT"],
};

const moteur = (politiques, extra = {}) => new MoteurPolitiques({ politiques, ...extra });

// --- Validation ------------------------------------------------------------

test("une politique incomplete est refusee a la construction", () => {
  // Une politique mal ecrite qui passerait inapercue serait pire qu'absente :
  // elle donnerait l'illusion d'un cadre.
  for (const manque of ["id", "version", "operations", "roles"]) {
    const p = { ...BASE };
    delete p[manque];
    assert.ok(validerPolitique(p).length > 0, manque);
    assert.throws(() => moteur([p]), /invalide/, manque);
  }
});

test("une politique saine passe", () => {
  assert.deepEqual(validerPolitique(BASE), []);
  for (const p of POLITIQUES_DEFAUT) assert.deepEqual(validerPolitique(p), [], p.id);
});

test("un moment de notification inconnu est refuse", () => {
  assert.ok(validerPolitique({ ...BASE, notifier: { quand: "peut-etre" } }).length > 0);
});

// --- Décision --------------------------------------------------------------

test("une operation couverte s'execute sans confirmation", () => {
  const r = moteur([BASE]).decider({ outil: OUTIL("assiduite.enregistrer_appel"), staff: STAFF() });
  assert.equal(r.decision, DECISIONS.AUTOMATIQUE);
  assert.equal(r.politique, "p-test");
  assert.equal(r.version, 1);
});

test("une operation non couverte demande confirmation — ce n'est PAS un refus", () => {
  const r = moteur([BASE]).decider({ outil: OUTIL("assiduite.supprimer_absence"), staff: STAFF() });
  assert.equal(r.decision, DECISIONS.CONFIRMATION);
  assert.equal(r.motif, MOTIFS.AUCUNE_POLITIQUE);
});

test("un role hors politique est nomme comme tel", () => {
  const r = moteur([BASE]).decider({ outil: OUTIL("assiduite.enregistrer_appel"), staff: STAFF("PARENT") });
  assert.equal(r.decision, DECISIONS.CONFIRMATION);
  assert.equal(r.motif, MOTIFS.ROLE_HORS_POLITIQUE);
  assert.equal(r.detail, "PARENT");
});

test("une politique suspendue cesse d'agir immediatement", () => {
  // Un retour arriere doit etre instantane, sans redeploiement.
  const m = moteur([BASE]);
  assert.equal(m.decider({ outil: OUTIL("assiduite.enregistrer_appel"), staff: STAFF() }).decision, DECISIONS.AUTOMATIQUE);
  assert.equal(m.suspendre("p-test"), true);
  const r = m.decider({ outil: OUTIL("assiduite.enregistrer_appel"), staff: STAFF() });
  assert.equal(r.decision, DECISIONS.CONFIRMATION);
  assert.equal(r.motif, MOTIFS.POLITIQUE_SUSPENDUE);
  m.suspendre("p-test", false);
  assert.equal(m.decider({ outil: OUTIL("assiduite.enregistrer_appel"), staff: STAFF() }).decision, DECISIONS.AUTOMATIQUE);
});

test("une politique inactive est ignoree", () => {
  const r = moteur([{ ...BASE, actif: false }]).decider({ outil: OUTIL("assiduite.enregistrer_appel"), staff: STAFF() });
  assert.equal(r.decision, DECISIONS.CONFIRMATION);
});

// --- Fenêtres --------------------------------------------------------------

test("hors de la fenetre horaire, la confirmation revient", () => {
  // Une saisie d'appel a 3 h du matin merite un regard humain.
  const p = { ...BASE, fenetre: { heures: [6, 20] } };
  const nuit = moteur([p], { maintenant: () => new Date("2026-11-02T03:00:00") });
  const jour = moteur([p], { maintenant: () => new Date("2026-11-02T09:00:00") });
  assert.equal(nuit.decider({ outil: OUTIL("assiduite.enregistrer_appel"), staff: STAFF() }).motif, MOTIFS.HORS_FENETRE);
  assert.equal(jour.decider({ outil: OUTIL("assiduite.enregistrer_appel"), staff: STAFF() }).decision, DECISIONS.AUTOMATIQUE);
});

test("la fenetre peut porter sur les jours de la semaine", () => {
  const p = { ...BASE, fenetre: { joursSemaine: [1, 2, 3, 4, 5] } };
  // 2026-11-01 est un dimanche.
  const d = moteur([p], { maintenant: () => new Date("2026-11-01T09:00:00") });
  assert.equal(d.decider({ outil: OUTIL("assiduite.enregistrer_appel"), staff: STAFF() }).motif, MOTIFS.HORS_FENETRE);
});

// --- Bornes de paramètres --------------------------------------------------

test("un parametre hors bornes ramene la confirmation", () => {
  const p = { ...BASE, parametres: { absents: { tailleMax: 3 }, nbHeures: { min: 0.5, max: 12 } } };
  const m = moteur([p]);
  const ok = m.decider({ outil: OUTIL("assiduite.enregistrer_appel"), params: { absents: ["a", "b"], nbHeures: 2 }, staff: STAFF() });
  assert.equal(ok.decision, DECISIONS.AUTOMATIQUE);

  const trop = m.decider({ outil: OUTIL("assiduite.enregistrer_appel"), params: { absents: ["a", "b", "c", "d"] }, staff: STAFF() });
  assert.equal(trop.motif, MOTIFS.PARAMETRE_HORS_BORNES);
  assert.match(trop.detail, /4 elements/);

  const heures = m.decider({ outil: OUTIL("assiduite.enregistrer_appel"), params: { nbHeures: 24 }, staff: STAFF() });
  assert.equal(heures.motif, MOTIFS.PARAMETRE_HORS_BORNES);
});

test("un parametre requis par la politique et absent ramene la confirmation", () => {
  const p = { ...BASE, parametres: { motif: { requis: true } } };
  assert.equal(
    moteur([p]).decider({ outil: OUTIL("assiduite.enregistrer_appel"), params: {}, staff: STAFF() }).motif,
    MOTIFS.PARAMETRE_HORS_BORNES,
  );
});

test("une liste de valeurs autorisees est respectee", () => {
  const p = { ...BASE, parametres: { statut: { valeurs: ["JUSTIFIEE"] } } };
  assert.equal(
    moteur([p]).decider({ outil: OUTIL("assiduite.enregistrer_appel"), params: { statut: "NON_JUSTIFIEE" }, staff: STAFF() }).motif,
    MOTIFS.PARAMETRE_HORS_BORNES,
  );
});

// --- Quotas ----------------------------------------------------------------

test("le quota journalier ramene la confirmation une fois atteint", () => {
  const p = { ...BASE, quotaJournalier: 2 };
  const m = moteur([p], { maintenant: () => new Date("2026-11-02T09:00:00") });
  const demande = () => m.decider({ outil: OUTIL("assiduite.enregistrer_appel"), staff: STAFF() });
  for (let i = 0; i < 2; i += 1) {
    assert.equal(demande().decision, DECISIONS.AUTOMATIQUE, `tour ${i}`);
    m.enregistrerExecution({ politique: "p-test", staff: STAFF() });
  }
  const r = demande();
  assert.equal(r.decision, DECISIONS.CONFIRMATION);
  assert.equal(r.motif, MOTIFS.QUOTA_ATTEINT);
});

test("le quota est compte PAR ACTEUR, pas globalement", () => {
  // Un plafond commun laisserait une personne consommer celui de tous.
  const m = moteur([{ ...BASE, quotaJournalier: 1 }], { maintenant: () => new Date("2026-11-02T09:00:00") });
  m.enregistrerExecution({ politique: "p-test", staff: STAFF("SURVEILLANT", "u-1") });
  assert.equal(
    m.decider({ outil: OUTIL("assiduite.enregistrer_appel"), staff: STAFF("SURVEILLANT", "u-1") }).motif,
    MOTIFS.QUOTA_ATTEINT,
  );
  assert.equal(
    m.decider({ outil: OUTIL("assiduite.enregistrer_appel"), staff: STAFF("SURVEILLANT", "u-2") }).decision,
    DECISIONS.AUTOMATIQUE,
    "un autre acteur garde son propre quota",
  );
});

test("le quota change de compteur au changement de jour", () => {
  let jour = "2026-11-02T09:00:00";
  const compteur = new CompteurMemoire();
  const m = new MoteurPolitiques({ politiques: [{ ...BASE, quotaJournalier: 1 }], compteur, maintenant: () => new Date(jour) });
  m.enregistrerExecution({ politique: "p-test", staff: STAFF() });
  assert.equal(m.decider({ outil: OUTIL("assiduite.enregistrer_appel"), staff: STAFF() }).motif, MOTIFS.QUOTA_ATTEINT);
  jour = "2026-11-03T09:00:00";
  assert.equal(m.decider({ outil: OUTIL("assiduite.enregistrer_appel"), staff: STAFF() }).decision, DECISIONS.AUTOMATIQUE);
});

test("le compteur persistant survit au redemarrage, et purge la veille", () => {
  const d = mkdtempSync(join(tmpdir(), "compteurs-"));
  try {
    const f = join(d, "compteurs.json");
    let jour = new Date("2026-11-02T09:00:00");
    const a = new CompteurJournalierPersistant({ chemin: f, horloge: () => jour });
    a.incrementer("p:u-1:2026-11-02");
    a.incrementer("p:u-1:2026-11-02");

    // Redemarrage le meme jour : le compte est retrouve.
    assert.equal(new CompteurJournalierPersistant({ chemin: f, horloge: () => jour }).compter("p:u-1:2026-11-02"), 2);

    // Redemarrage le lendemain : l'ardoise d'hier ne suit pas.
    jour = new Date("2026-11-03T09:00:00");
    const c = new CompteurJournalierPersistant({ chemin: f, horloge: () => jour });
    assert.equal(c.compter("p:u-1:2026-11-02"), 0);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

// --- Motifs d'opérations ---------------------------------------------------

test("un motif de module couvre toutes ses operations", () => {
  const m = moteur([{ ...BASE, operations: ["assiduite.*"] }]);
  assert.equal(m.decider({ outil: OUTIL("assiduite.consulter_absences"), staff: STAFF() }).decision, DECISIONS.AUTOMATIQUE);
  assert.equal(m.decider({ outil: OUTIL("discipline.consulter_incidents"), staff: STAFF() }).decision, DECISIONS.CONFIRMATION);
});

// --- Les politiques par défaut ---------------------------------------------

test("les lectures se font seules pour les personnels", () => {
  const m = moteur(POLITIQUES_DEFAUT);
  for (const role of ["SUPER_ADMIN", "DIRECTION", "SURVEILLANT", "ENSEIGNANT"]) {
    assert.equal(
      m.decider({ outil: OUTIL("assiduite.consulter_absences", "read"), params: { limite: 100 }, staff: STAFF(role) }).decision,
      DECISIONS.AUTOMATIQUE,
      role,
    );
  }
});

test("la SUPPRESSION d'une absence reste sous confirmation, pour tout le monde", () => {
  // Elle est irreversible : aucune politique par defaut ne la couvre.
  const m = moteur(POLITIQUES_DEFAUT);
  for (const role of ["SUPER_ADMIN", "DIRECTION", "SURVEILLANT"]) {
    const r = m.decider({ outil: OUTIL("assiduite.supprimer_absence", "sensitive"), staff: STAFF(role) });
    assert.equal(r.decision, DECISIONS.CONFIRMATION, role);
  }
});

test("un parent ou un eleve n'est couvert par aucune politique", () => {
  const m = moteur(POLITIQUES_DEFAUT);
  for (const role of ["PARENT", "ELEVE"]) {
    assert.equal(
      m.decider({ outil: OUTIL("assiduite.consulter_absences", "read"), staff: STAFF(role) }).decision,
      DECISIONS.CONFIRMATION,
      role,
    );
  }
});

test("les politiques sont versionnees et inspectables", () => {
  // Un administrateur doit pouvoir dire ce que l'agent a le droit de faire
  // sans lire le programme.
  const m = moteur(POLITIQUES_DEFAUT);
  for (const p of m.politiques) {
    assert.ok(p.id && typeof p.version === "number");
  }
  for (const p of POLITIQUES_DEFAUT) {
    assert.ok(p.description, `politique sans description : ${p.id}`);
    assert.equal(typeof JSON.parse(JSON.stringify(p)), "object", "une politique doit etre serialisable");
  }
});
