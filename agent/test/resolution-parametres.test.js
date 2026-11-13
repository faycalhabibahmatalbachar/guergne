/**
 * Le résolveur central : ce qui est NOMMÉ devient ce qui est IDENTIFIÉ — ou une
 * question, jamais une supposition.
 *
 * Chaque test fixe un défaut observé dans la campagne de référence du banc
 * (`banc/rapports/0-reference`) ou une règle que la mission impose : pas d'UUID
 * demandé, pas de choix arbitraire entre homonymes, pas d'identifiant inventé.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { JETONS, Resolveur, choisir } from "../src/resolution-parametres.js";
import { Referentiel } from "../src/referentiel.js";
import { ToolRegistry, ASSIDUITE_TOOLS } from "../src/tools.js";
import { extraireFoyer, parametresLisibles } from "../src/foyer.js";
import { contexteDates, contexteFil } from "../src/interprete.js";

const id = (n) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const CLASSES = [
  { id: id(1), libelle: "6ème A", code: "6A" },
  { id: id(2), libelle: "6ème B", code: "6B" },
  { id: id(3), libelle: "5ème A", code: "5A" },
  { id: id(4), libelle: "Terminale D", code: "TD" },
];
const PERIODES = [
  { id: id(11), numero: 1, libelle: "1er Trimestre", dateDebut: "2025-10-01", dateFin: "2026-01-03" },
  { id: id(12), numero: 2, libelle: "2ème Trimestre", dateDebut: "2026-01-04", dateFin: "2026-04-08" },
  { id: id(13), numero: 3, libelle: "3ème Trimestre", dateDebut: "2026-04-09", dateFin: "2026-07-15" },
];
const ELEVES = [
  { id: id(21), nom: "ABAKAR", prenom: "Amina", matricule: "LGR-2025-1230", classeId: id(1), classeLibelle: "6ème A" },
  { id: id(22), nom: "ABAKAR", prenom: "Amina", matricule: "LGR-2025-1274", classeId: id(2), classeLibelle: "6ème B" },
  { id: id(23), nom: "DJIMET", prenom: "Achta", matricule: "LGR-2025-1127", classeId: id(3), classeLibelle: "5ème A" },
  { id: id(24), nom: "MAHAMAT", prenom: "Ousmane", matricule: "LGR-2025-1001", classeId: id(1), classeLibelle: "6ème A" },
];
const ENSEIGNANTS = [
  { id: id(31), nom: "ABDELKERIM", prenom: "Fatimé", matricule: "ENS-003", matierePrincipale: "Français" },
  { id: id(32), nom: "HASSAN", prenom: "Idriss", matricule: "ENS-004", matierePrincipale: "Mathématiques" },
];

function monter({ classes = CLASSES, periodes = PERIODES, eleves = ELEVES, enPanne = false, maintenant = () => new Date("2026-11-12T10:00:00Z") } = {}) {
  const appels = [];
  const guergne = {
    listerClasses: async () => (enPanne ? { ok: false, message: "500" } : { ok: true, data: classes }),
    listerPeriodes: async () => (enPanne ? { ok: false, message: "500" } : { ok: true, data: periodes }),
    // Comme le backend : sous-chaîne sur le nom, le prénom, les deux, ou le matricule.
    rechercherEleves: async (p) => {
      appels.push(["rechercherEleves", p]);
      const r = String(p.recherche ?? "").toLowerCase();
      const lignes = eleves.filter(
        (e) =>
          (!p.classeId || e.classeId === p.classeId) &&
          [e.nom, e.prenom, `${e.prenom} ${e.nom}`, `${e.nom} ${e.prenom}`, e.matricule].some((x) => x.toLowerCase().includes(r)),
      );
      return { ok: true, data: { lignes, total: lignes.length } };
    },
    consulterEleve: async ({ eleveId }) => {
      const e = eleves.find((x) => x.id === eleveId);
      return e ? { ok: true, data: { eleve: e, inscription: { classeId: e.classeId, classeLibelle: e.classeLibelle } } } : { ok: false, message: "introuvable" };
    },
    listerElevesClasse: async ({ classeId }) => ({ ok: true, data: eleves.filter((e) => e.classeId === classeId).map((e) => ({ ...e, eleveId: e.id, inscriptionId: "insc-" + e.id })) }),
    listerEnseignants: async () => ({ ok: true, data: ENSEIGNANTS }),
    listerClassesEtMatieres: async () => ({ ok: true, data: { classes, matieres: [{ id: id(41), libelle: "Mathématiques" }, { id: id(42), libelle: "Français" }] } }),
    anneeCourante: async () => ({ ok: true, data: { libelle: "2025-2026" } }),
    listerAnnees: async () => ({ ok: true, data: [{ id: id(51), libelle: "2025-2026" }, { id: id(52), libelle: "2024-2025" }] }),
  };
  const resolveur = new Resolveur({ guergne, referentiel: new Referentiel({ guergne }), maintenant });
  const registre = new ToolRegistry(ASSIDUITE_TOOLS);
  const resoudre = (outil, params, extra = {}) => resolveur.resoudre({ outil: registre.get(outil), params, staff: { id: "acteur" }, ...extra });
  return { resoudre, appels, registre };
}

// --- classes ----------------------------------------------------------------

test("une classe dite devient son identifiant, quelle que soit la façon de la dire", async () => {
  const { resoudre } = monter();
  for (const dit of ["6e A", "6eme a", "sixième A", "la sixième à", "classe de 6ème A", "6A", "en 6e A"]) {
    const r = await resoudre("assiduite.consulter_absences", { classe: dit });
    assert.equal(r.statut, "ok", dit + " → " + JSON.stringify(r));
    assert.equal(r.params.classeId, id(1), dit);
    assert.equal(r.params.classe, undefined);
  }
});

test("« la 6e » : deux classes, donc une question avec les deux — jamais un choix", async () => {
  const { resoudre } = monter();
  const r = await resoudre("assiduite.consulter_absences", { classe: "6e" });
  assert.equal(r.statut, "clarifier");
  assert.deepEqual(r.choix.candidats.map((c) => c.libelle), ["6ème A", "6ème B"]);
  assert.equal(r.choix.champ, "classeId");
});

test("une classe inconnue est dite inconnue, avec celles qui existent", async () => {
  const { resoudre } = monter();
  const r = await resoudre("assiduite.consulter_absences", { classe: "CM2" });
  assert.equal(r.statut, "clarifier");
  assert.match(r.question, /CM2/);
  assert.match(r.question, /6ème A/);
  assert.doesNotMatch(r.question, /UUID|identifiant/i);
});

test("un identifiant de classe que le référentiel ne connaît pas est refusé, pas transmis", async () => {
  const { resoudre } = monter();
  const r = await resoudre("assiduite.consulter_absences", { classeId: id(999) });
  assert.equal(r.statut, "clarifier");
});

test("référentiel en panne : aucune classe inventée, et pas de demande d'UUID", async () => {
  const { resoudre } = monter({ enPanne: true });
  const r = await resoudre("assiduite.consulter_absences", { classe: "6e A" });
  assert.equal(r.statut, "clarifier");
  assert.doesNotMatch(r.question, /UUID|identifiant/i);
});

test("un outil qui déclare `classe` reçoit l'identifiant dans `classe`", async () => {
  const { resoudre } = monter();
  const r = await resoudre("finances.situations", { classe: "terminale D", seulementImpayes: true });
  assert.equal(r.params.classe, id(4));
  assert.equal(r.params.seulementImpayes, true);
});

// --- périodes ---------------------------------------------------------------

test("une période dite devient son identifiant", async () => {
  const { resoudre } = monter();
  for (const [dit, attendu] of [["1er trimestre", id(11)], ["T2", id(12)], ["troisième trimestre", id(13)], ["2ème Trimestre", id(12)], [3, id(13)]]) {
    const r = await resoudre("assiduite.consulter_absences", { periode: dit });
    assert.equal(r.params.periodeId, attendu, String(dit));
  }
});

test("sans période dite, une lecture qui en exige une retient la période en cours — et le dit", async () => {
  const { resoudre } = monter({ maintenant: () => new Date("2026-02-10T10:00:00Z") });
  const r = await resoudre("pilotage.resultats_par_matiere", {});
  assert.equal(r.params.periodeId, id(12));
  assert.match(r.notes.join(" "), /2ème Trimestre/);
});

test("après la fin de l'année, la période par défaut est la dernière commencée", async () => {
  const { resoudre } = monter();
  const r = await resoudre("pilotage.resultats_par_matiere", {});
  assert.equal(r.params.periodeId, id(13));
});

test("une écriture datée prend la période qui contient sa date", async () => {
  const { resoudre } = monter();
  const r = await resoudre("assiduite.enregistrer_appel", { eleves: "Ousmane MAHAMAT", classe: "6e A", dateAbsence: "2026-03-10", nbHeures: 2 });
  assert.equal(r.statut, "ok", JSON.stringify(r));
  assert.equal(r.params.periodeId, id(12));
  assert.deepEqual(r.params.absents, ["insc-" + id(24)]);
});

test("une date hors de toute période n'est pas enregistrée dans une période au hasard", async () => {
  const { resoudre } = monter();
  const r = await resoudre("assiduite.enregistrer_appel", { eleves: "Ousmane MAHAMAT", classe: "6e A", dateAbsence: "2026-11-12" });
  assert.equal(r.statut, "clarifier");
  assert.match(r.question, /aucune période/);
});

test("« la semaine dernière » rangée dans `periode` ne bloque pas quand les dates sont données", async () => {
  const { resoudre } = monter();
  const r = await resoudre("assiduite.consulter_absences", { periode: "semaine dernière", depuis: "2026-11-02", jusqua: "2026-11-08" });
  assert.equal(r.statut, "ok");
  assert.equal(r.params.periodeId, undefined);
  assert.equal(r.params.depuis, "2026-11-02");
});

// --- élèves -----------------------------------------------------------------

test("un élève sans homonyme est identifié par son nom, dans les deux ordres", async () => {
  const { resoudre } = monter();
  for (const dit of ["Achta DJIMET", "DJIMET Achta", "achta djimet", "l'élève Achta DJIMET"]) {
    const r = await resoudre("eleves.fiche", { eleve: dit });
    assert.equal(r.params.eleveId, id(23), dit + " → " + JSON.stringify(r));
  }
});

test("deux homonymes parfaits : une question avec leur classe et leur matricule", async () => {
  const { resoudre } = monter();
  const r = await resoudre("eleves.fiche", { eleve: "Amina ABAKAR" });
  assert.equal(r.statut, "clarifier");
  assert.equal(r.choix.candidats.length, 2);
  assert.match(r.question, /6ème A/);
  assert.match(r.question, /LGR-2025-1274/);
  assert.equal(r.choix.champ, "eleveId");
});

test("la classe dite départage les homonymes", async () => {
  const { resoudre } = monter();
  const r = await resoudre("assiduite.consulter_absences", { eleve: "Amina ABAKAR", classe: "6e B" });
  assert.equal(r.statut, "ok", JSON.stringify(r));
  assert.equal(r.params.eleveId, id(22));
});

test("une faute de frappe ou de dictée est rattrapée, et dite", async () => {
  const { resoudre } = monter();
  const r = await resoudre("eleves.fiche", { eleve: "Achta DJIME" });
  assert.equal(r.params.eleveId, id(23));
  const r2 = await resoudre("eleves.fiche", { eleve: "Acta Djimet" });
  assert.equal(r2.params.eleveId, id(23));
  assert.match(r2.notes.join(" "), /Achta DJIMET/);
});

test("un matricule, entier ou par sa fin", async () => {
  const { resoudre } = monter();
  assert.equal((await resoudre("eleves.fiche", { eleve: "LGR-2025-1127" })).params.eleveId, id(23));
  assert.equal((await resoudre("eleves.fiche", { eleve: "matricule 1127" })).params.eleveId, id(23));
  assert.equal((await resoudre("eleves.fiche", { eleve: "1127" })).params.eleveId, id(23));
});

test("un élève introuvable est dit introuvable", async () => {
  const { resoudre } = monter();
  const r = await resoudre("eleves.fiche", { eleve: "Zzyzx Qwertov" });
  assert.equal(r.statut, "clarifier");
  assert.match(r.question, /Aucun élève/);
});

test("un retard sans classe dite : la classe est celle de l'élève", async () => {
  const { resoudre } = monter();
  const r = await resoudre("assiduite.enregistrer_retard", { eleve: "Ousmane MAHAMAT", dateRetard: "2026-03-11", dureeMinutes: 15 });
  assert.equal(r.statut, "ok", JSON.stringify(r));
  assert.equal(r.params.classeId, id(1));
  assert.equal(r.params.inscriptionId, "insc-" + id(24));
  assert.equal(r.params.periodeId, id(12));
});

// --- enseignants, matières, années -----------------------------------------

test("un enseignant nommé devient son identifiant", async () => {
  const { resoudre } = monter();
  for (const dit of ["Fatimé ABDELKERIM", "Mme Abdelkerim", "abdelkerim"]) {
    const r = await resoudre("emploi_du_temps.consulter", { enseignant: dit });
    assert.equal(r.params.enseignantId, id(31), dit);
  }
});

test("une matière nommée devient son identifiant", async () => {
  const { resoudre } = monter();
  const r = await resoudre("pedagogie.evaluations", { matiere: "maths", periode: "T1" });
  assert.equal(r.statut, "clarifier", "« maths » est trop loin de « Mathématiques » pour être deviné");
  const r2 = await resoudre("pedagogie.evaluations", { matiere: "Mathematiques", periode: "T1" });
  assert.equal(r2.params.matiereId, id(41));
});

test("une autre année scolaire : la sienne si elle existe, jamais l'année en cours sous son nom", async () => {
  const { resoudre } = monter();
  assert.equal((await resoudre("pilotage.indicateurs", { annee: "2024-2025" })).params.anneeId, id(52));
  assert.equal((await resoudre("pilotage.indicateurs", { annee: "2025-2026" })).params.anneeId, undefined);
  const r = await resoudre("pilotage.indicateurs", { annee: "2019-2020" });
  assert.equal(r.statut, "clarifier");
  assert.match(r.question, /2019-2020/);
});

// --- le foyer et ses jetons -------------------------------------------------

test("@eleve_courant désigne l'élève du fil — et une question s'il n'y en a pas", async () => {
  const { resoudre } = monter();
  const r = await resoudre("notes.releve", { eleve: JETONS.ELEVE }, { foyer: { eleveId: id(23) } });
  assert.equal(r.params.eleveId, id(23));
  const sans = await resoudre("notes.releve", { eleve: JETONS.ELEVE }, { foyer: null });
  assert.equal(sans.statut, "clarifier");
});

test("@eleves_du_resultat désigne les élèves listés ; tronqué, il le signale", async () => {
  const { resoudre } = monter();
  const r = await resoudre("notifications.parents", { eleves: JETONS.ELEVES, message: "Réunion demain" }, { foyer: { eleveIds: [id(21), id(23)], eleveIdsTronques: true } });
  assert.deepEqual(r.params.eleveIds, [id(21), id(23)]);
  assert.match(r.notes.join(" "), /tronquée/);
  const vide = await resoudre("notifications.parents", { eleves: JETONS.ELEVES, message: "x" }, { foyer: { eleveIds: [] } });
  assert.equal(vide.statut, "clarifier");
});

test("un possessif sans élève nommé reprend l'élève du fil ; un article défini, non", async () => {
  const { resoudre } = monter();
  const avec = await resoudre("assiduite.consulter_absences", {}, { foyer: { eleveId: id(23) }, texte: "et ses absences ?" });
  assert.equal(avec.params.eleveId, id(23));
  // « la » dans « de la semaine » n'est pas un pronom : défaut observé au banc.
  const sans = await resoudre("assiduite.consulter_retards", { depuis: "2026-11-09" }, { foyer: { eleveId: id(23) }, texte: "les retards de la semaine" });
  assert.equal(sans.params.eleveId, undefined);
});

// --- réponses aux questions de choix ---------------------------------------

test("« 2 », « le deuxième », une classe, un matricule : la réponse désigne un candidat", () => {
  const choix = {
    champ: "eleveId",
    candidats: [
      { id: "a", libelle: "Amina ABAKAR — 6ème A (LGR-2025-1230)", matricule: "LGR-2025-1230", classe: "6ème A", indices: ["LGR-2025-1230"] },
      { id: "b", libelle: "Amina ABAKAR — 6ème B (LGR-2025-1274)", matricule: "LGR-2025-1274", classe: "6ème B", indices: ["LGR-2025-1274"] },
    ],
  };
  assert.equal(choisir(choix, "2").id, "b");
  assert.equal(choisir(choix, "le 1").id, "a");
  assert.equal(choisir(choix, "la deuxième").id, "b");
  assert.equal(choisir(choix, "le premier").id, "a");
  assert.equal(choisir(choix, "celle de 6e B").id, "b");
  assert.equal(choisir(choix, "LGR-2025-1230").id, "a");
  assert.equal(choisir(choix, "le 1274").id, "b");
  assert.equal(choisir(choix, "5"), null, "un numéro hors liste ne désigne personne");
  assert.equal(choisir(choix, "Amina"), null, "une réponse qui ne départage pas ne choisit pas");
  assert.equal(choisir(choix, "combien d'élèves en 5e A ?"), null);
});

// --- ce que le modèle voit du fil ------------------------------------------

test("le foyer ne garde que des identifiants, et remplace la liste d'élèves à chaque résultat", () => {
  const outil = { name: "assiduite.consulter_absences" };
  const f = extraireFoyer(outil, { classeId: id(1), statut: "NON_JUSTIFIEE" }, { lignes: [{ eleveId: id(21), nom: "X" }, { eleveId: id(21) }, { eleveId: id(23) }], total: 40 });
  assert.deepEqual(f.eleveIds, [id(21), id(23)]);
  assert.equal(f.eleveIdsTronques, true);
  assert.equal(f.classeId, id(1));
  assert.doesNotMatch(JSON.stringify(f), /"nom"/);
  assert.deepEqual(extraireFoyer(outil, {}, { lignes: [], total: 0 }).eleveIds, []);
  assert.equal(extraireFoyer({ name: "eleves.rechercher" }, {}, { lignes: [{ id: id(23) }], total: 1 }).eleveId, id(23));
});

test("le fil montré au modèle parle en libellés et en jetons, jamais en identifiants", () => {
  const listes = { classes: CLASSES, periodes: PERIODES };
  assert.deepEqual(parametresLisibles({ classeId: id(1), periodeId: id(12), eleveId: id(23), statut: "NON_JUSTIFIEE", depuis: "2026-01-01", absenceIds: ["x"], cleEnvoi: "k" }, listes), {
    classe: "6ème A", periode: "2ème Trimestre", eleve: "@eleve_courant", statut: "NON_JUSTIFIEE", depuis: "2026-01-01",
  });
  const fil = contexteFil({ lastTask: { tool: "assiduite.consulter_absences", params: { classeId: id(1) } }, foyer: { eleveId: id(23), eleveIds: [id(21), id(23)] } }, listes);
  assert.match(fil, /"classe":"6ème A"/);
  assert.match(fil, /@eleve_courant/);
  assert.match(fil, /liste 2 eleve\(s\)/);
  assert.doesNotMatch(fil, /[0-9a-f]{8}-0000-4000/);
  assert.equal(contexteFil({}, listes), null);
});

test("la date du jour et les intervalles usuels sont donnés au modèle, calculés", () => {
  const t = contexteDates(new Date("2026-11-12T09:00:00Z"));
  assert.match(t, /jeudi 2026-11-12/);
  assert.match(t, /Cette semaine : du 2026-11-09 au 2026-11-15/);
  assert.match(t, /semaine derniere : du 2026-11-02 au 2026-11-08/);
  assert.match(t, /mois dernier : du 2026-10-01 au 2026-10-31/);
  // Un dimanche appartient à la semaine qui se termine, pas à la suivante.
  assert.match(contexteDates(new Date("2026-11-15T09:00:00Z")), /Cette semaine : du 2026-11-09 au 2026-11-15/);
  // 23 h 30 UTC, c'est déjà le lendemain à N'Djamena.
  assert.match(contexteDates(new Date("2026-11-12T23:30:00Z")), /vendredi 2026-11-13/);
});

test("aucun identifiant technique dans le registre que voit le modèle", () => {
  const texte = new ToolRegistry(ASSIDUITE_TOOLS).invitePourNlu();
  assert.doesNotMatch(texte, /UUID/);
  assert.doesNotMatch(texte, /\b(classeId|periodeId|eleveId|enseignantId|matiereId|anneeId|absenceIds?|inscriptionId)\b/);
});

// --- Régressions du cycle 4 (campagne 3-complet) ----------------------------

test("« la sixième à » : la lettre A mal transcrite est rendue à la classe", async () => {
  const { resoudre } = monter();
  const r = await resoudre("assiduite.consulter_absences", { classe: "sixième" }, { texte: "donne moi les absence de la sixième à" });
  assert.equal(r.params.classeId, id(1), JSON.stringify(r));
  const sans = await resoudre("assiduite.consulter_absences", { classe: "sixième" }, { texte: "les absences de la sixième" });
  assert.equal(sans.statut, "clarifier", "sans la lettre, « la sixième » reste ambiguë");
});

test("« 6e » n'est pas le code d'une classe : c'est un niveau, donc une question", async () => {
  const { resoudre } = monter({ classes: [...CLASSES, { id: id(9), libelle: "6E", code: "6E" }] });
  const r = await resoudre("assiduite.consulter_absences", { classe: "6e" });
  assert.equal(r.statut, "clarifier");
  assert.equal((await resoudre("assiduite.consulter_absences", { classe: "6A" })).params.classeId, id(1));
});

test("une classe tout juste créée est trouvée : la liste est relue une fois", async () => {
  const classes = [...CLASSES];
  const { resoudre } = monter({ classes });
  await resoudre("assiduite.consulter_absences", { classe: "6e A" }); // remplit le cache
  classes.push({ id: id(8), libelle: "Banc Gamma", code: "BG9" });
  const r = await resoudre("classes.modifier", { classe: "Banc Gamma", modifications: { capaciteMax: 35 } });
  assert.equal(r.statut, "ok", JSON.stringify(r));
});

test("les homonymes sont proposés dans l'ordre des matricules : « le 2 » est reproductible", async () => {
  const { resoudre } = monter({ eleves: [ELEVES[1], ELEVES[0], ELEVES[2]] });
  const r = await resoudre("eleves.fiche", { eleve: "Amina ABAKAR" });
  assert.deepEqual(r.choix.candidats.map((c) => c.matricule), ["LGR-2025-1230", "LGR-2025-1274"]);
});

test("sans `classe:lire`, l'acteur reçoit au moins les noms des classes", async () => {
  const guergne = {
    listerClasses: async () => ({ ok: false, message: "Accès refusé" }),
    nommerClasses: async () => ({ ok: true, data: CLASSES.map(({ id: i, libelle, code }) => ({ id: i, libelle, code })) }),
    listerPeriodes: async () => ({ ok: true, data: PERIODES }),
  };
  const r = await new Referentiel({ guergne }).pour("surveillant");
  assert.equal(r.classes.length, CLASSES.length);
});

// --- Régressions du cycle 5 (rejeu 5-rejeu) ---------------------------------

test("une liste d'élèves donnée à un outil qui ne la filtre pas devient leur classe, jamais l'école entière", async () => {
  const { resoudre } = monter();
  const r = await resoudre("assiduite.consulter_absences", { eleves: JETONS.ELEVES, depuis: "2026-06-01", jusqua: "2026-06-05" }, { foyer: { classeId: id(1), eleveIds: [id(21), id(24)] } });
  assert.equal(r.statut, "ok", JSON.stringify(r));
  assert.equal(r.params.classeId, id(1));
  assert.equal(r.params.eleveIds, undefined);
  const seul = await resoudre("assiduite.consulter_absences", { eleves: JETONS.ELEVES }, { foyer: { eleveIds: [id(23)] } });
  assert.equal(seul.params.eleveId, id(23));
  const sansClasse = await resoudre("assiduite.consulter_absences", { eleves: JETONS.ELEVES }, { foyer: { eleveIds: [id(21), id(23)] } });
  assert.equal(sansClasse.statut, "clarifier");
});

test("un trimestre qui ne contient pas les dates demandées est écarté : les dates l'emportent", async () => {
  const { resoudre } = monter();
  const r = await resoudre("assiduite.consulter_absences", { periode: "1er trimestre", depuis: "2026-06-01", jusqua: "2026-06-05" });
  assert.equal(r.params.periodeId, undefined);
  assert.match(r.notes.join(" "), /dates/);
  const coherent = await resoudre("assiduite.consulter_absences", { periode: "3e trimestre", depuis: "2026-06-01", jusqua: "2026-06-05" });
  assert.equal(coherent.params.periodeId, id(13));
});

test("« la terminale à » : la lettre A, même si le modèle n'a transmis que « terminale »", async () => {
  const { resoudre } = monter({ classes: [...CLASSES, { id: id(5), libelle: "Terminale A", code: "TA" }] });
  const r = await resoudre("emploi_du_temps.consulter", { classe: "terminale" }, { texte: "l'emploi du temps de la terminale à" });
  assert.equal(r.params.classeId, id(5), JSON.stringify(r));
});
