/**
 * Une même intention, dite de huit façons.
 *
 * Chaque intention garde ses attentes (outil, entités, réponse comparée à
 * l'oracle) ; seule la formulation change : formelle, parlée, fautive, brève,
 * indirecte, dictée, etc. Les résultats se comparent donc d'une variante à
 * l'autre — c'est la robustesse de la COMPRÉHENSION qui est mesurée ici, pas
 * une capacité de plus.
 */
const classe = (code) => (p, f) => p.classeId === f.classes[code].id || "classe attendue : " + code + " — reçu " + JSON.stringify(p).slice(0, 100);
const eleveU = (p, f) => p.eleveId === f.unique.id || "élève attendu : " + f.unique.prenom + " " + f.unique.nom;
const et = (...fs) => async (p, f) => {
  for (const g of fs) {
    const r = await g(p, f);
    if (r !== true) return r;
  }
  return true;
};
const N = (f) => f.unique.prenom + " " + f.unique.nom;
const n = (f) => N(f).toLowerCase();

const INTENTIONS = [
  {
    cle: "va-abs", domaine: "variantes-assiduite", capacites: ["assiduite.consulter_absences"],
    attendu: {
      outil: "assiduite.consulter_absences", issue: "repond",
      appel: { action: "listerAbsences", params: et(classe("4B"), (p) => p.statut === "NON_JUSTIFIEE" || "statut attendu : NON_JUSTIFIEE") },
      contient: [(f) => f.nombre(f.absences["4B"].nonj)],
    },
    dits: [
      ["formel", "Veuillez me communiquer la liste des absences non justifiées de la classe de 4ème B."],
      ["parle", "dis, tu peux me sortir les absences pas justifiées de la 4e B ?"],
      ["fautes", "abscence non justifier 4eme b"],
      ["bref", "4e B absences non justifiées"],
      ["indirect", "j'aimerais savoir qui, en 4ème B, a manqué sans fournir de justificatif"],
      ["vocal", "alors euh donne moi les absences non justifiées de la quatrième b voilà"],
      ["inverse", "les non justifiées, pour les absences, en 4e B"],
      ["sms", "abs non justif 4B svp"],
    ],
  },
  {
    cle: "va-ret", domaine: "variantes-assiduite", capacites: ["assiduite.consulter_retards"],
    attendu: { outil: "assiduite.consulter_retards", issue: "repond", appel: { action: "listerRetards", params: classe("2A") }, contient: [(f) => f.nombre(f.retards["2A"])] },
    dits: [
      ["formel", "Je souhaite consulter les retards enregistrés pour la classe de seconde A."],
      ["parle", "c'est qui les retardataires en 2nde A ?"],
      ["fautes", "retar de la segonde a"],
      ["bref", "retards 2nde A"],
      ["indirect", "en seconde A, quels élèves sont arrivés après la sonnerie ?"],
      ["vocal", "montre moi les retards de la seconde à s'il te plaît"],
    ],
  },
  {
    cle: "va-fiche", domaine: "variantes-eleves", capacites: ["eleves.fiche"],
    attendu: { outil: ["eleves.fiche", "eleves.dossier"], issue: "repond", contient: [(f) => f.unique.matricule, (f) => f.unique.classe] },
    dits: [
      ["formel", (f) => "Pourriez-vous m'afficher la fiche complète de l'élève " + N(f) + " ?"],
      ["parle", (f) => "sors-moi tout ce que t'as sur " + N(f)],
      ["minuscules", (f) => "fiche " + n(f)],
      ["inverse", (f) => f.unique.nom + " " + f.unique.prenom + ", sa fiche complète"],
      ["indirect", (f) => "j'ai besoin de voir le dossier scolaire de " + N(f) + " avant de recevoir ses parents"],
      ["vocal", (f) => "euh la fiche de l'élève " + n(f) + " s'il te plaît"],
    ],
  },
  {
    cle: "va-eff", domaine: "variantes-classes", capacites: ["classes.eleves"],
    attendu: { outil: ["classes.eleves", "eleves.rechercher", "classes.lister"], issue: "repond", contient: [(f) => f.nombre(f.classes["3B"].effectif)] },
    dits: [
      ["formel", "Quel est l'effectif de la classe de 3ème B ?"],
      ["parle", "ils sont combien en 3e B ?"],
      ["fautes", "conbien d'eleve en troisiem b"],
      ["bref", "effectif 3B"],
      ["indirect", "la 3ème B, ça fait combien d'inscrits au total ?"],
      ["liste", "liste-moi les élèves de troisième B"],
    ],
  },
  {
    cle: "va-fin", domaine: "variantes-finances", capacites: ["finances.situations"],
    attendu: {
      outil: "finances.situations", issue: "repond",
      appel: { action: "listerSituationsFinancieres", params: et(classe("1S"), (p) => p.seulementImpayes === true || p.enRetard === true || "filtre impayés attendu") },
      absent: [/1ère L/],
    },
    dits: [
      ["formel", "Merci de m'indiquer les élèves de 1ère S dont la scolarité n'est pas soldée."],
      ["parle", "qui doit encore de l'argent en première S ?"],
      ["fautes", "impayé 1ere s"],
      ["bref", "impayés 1S"],
      ["indirect", "en 1ère S, quelles familles n'ont pas fini de payer ?"],
    ],
  },
  {
    cle: "va-solde", domaine: "variantes-finances", capacites: ["finances.situations"],
    attendu: { outil: ["finances.situations", "eleves.fiche"], issue: "repond", contient: [(f) => f.nombre(f.unique.finances.reste)] },
    dits: [
      ["formel", (f) => "Quel est le solde restant dû pour l'élève " + N(f) + " ?"],
      ["parle", (f) => N(f) + " il doit encore combien ?"],
      ["indirect", (f) => "la famille de " + N(f) + " est-elle à jour de ses frais ?"],
      ["bref", (f) => "reste à payer " + n(f)],
    ],
  },
  {
    cle: "va-par", domaine: "variantes-parents", capacites: ["parents.tuteurs_de_l_eleve"],
    attendu: { outil: ["parents.tuteurs_de_l_eleve", "eleves.fiche", "eleves.dossier"], issue: "repond", contient: [(f) => f.unique.tuteurs[0].telephone] },
    dits: [
      ["formel", (f) => "Quelles sont les coordonnées des responsables légaux de " + N(f) + " ?"],
      ["parle", (f) => "c'est quoi le numéro des parents de " + N(f) + " ?"],
      ["indirect", (f) => "je dois appeler la famille de " + N(f) + ", qui dois-je joindre ?"],
      ["bref", (f) => "parents " + n(f)],
      ["vocal", (f) => "retrouve moi les responsables de " + n(f)],
    ],
  },
  {
    cle: "va-notes", domaine: "variantes-notes", capacites: ["notes.releve"],
    attendu: { outil: ["notes.releve", "eleves.fiche"], issue: "repond", appel: { action: "releveEleve", params: eleveU }, contient: [/moyenne/i] },
    dits: [
      ["formel", (f) => "Je souhaite consulter les résultats scolaires de " + N(f) + "."],
      ["parle", (f) => "il a quoi comme notes " + N(f) + " ?"],
      ["indirect", (f) => "comment se débrouille " + N(f) + " en classe, côté résultats ?"],
      ["bref", (f) => "relevé " + n(f)],
    ],
  },
  {
    cle: "va-sans", domaine: "variantes-parents", capacites: ["parents.rechercher"],
    attendu: { outil: ["parents.rechercher", "parents.statistiques"], issue: "repond", contient: [(f) => f.nombre(f.totaux.parents_sans_compte)] },
    dits: [
      ["formel", "Combien de parents ne disposent pas encore d'un compte sur l'application ?"],
      ["parle", "y a combien de parents qui ont pas de compte ?"],
      ["bref", "parents sans compte"],
      ["indirect", "quels responsables n'ont jamais été inscrits sur l'appli ?"],
    ],
  },
  {
    cle: "va-edt", domaine: "variantes-classes", capacites: ["emploi_du_temps.consulter"],
    attendu: { outil: "emploi_du_temps.consulter", issue: "repond", appel: { action: "chargerEmploiDuTemps", params: classe("TA") } },
    dits: [
      ["formel", "Veuillez m'afficher l'emploi du temps de la Terminale A."],
      ["parle", "ils ont quoi comme cours les terminale A ?"],
      ["bref", "edt Tle A"],
      ["vocal", "l'emploi du temps de la terminale à"],
    ],
  },
];

const variantes = INTENTIONS.flatMap((i) =>
  i.dits.map(([style, dit]) => ({
    id: i.cle + "-" + style,
    domaine: i.domaine,
    capacites: i.capacites,
    etiquettes: ["variante", style],
    tours: [{ dit, ...i.attendu }],
  })),
);

// --- Conversations longues : les dialogues de référence de la mission --------
const conversations = [
  {
    id: "cv-01", domaine: "conversation-suivie", etiquettes: ["memoire", "multi-outils", "notification"], capacites: ["classes.eleves", "assiduite.consulter_absences", "notifications.parents"],
    tours: [
      { dit: "Liste les élèves de 6e A.", outil: ["classes.eleves", "eleves.rechercher"], issue: "repond", contient: [(f) => f.nombre(f.classes["6A"].effectif)] },
      { dit: "Parmi eux, lesquels ont été absents entre le 1er et le 5 juin 2026 ?", outil: "assiduite.consulter_absences", issue: "repond", appel: { action: "listerAbsences", params: et(classe("6A"), (p) => (p.depuis === "2026-06-01" && p.jusqua === "2026-06-05") || "dates attendues : 1er au 5 juin 2026") } },
      {
        dit: "Et ceux qui n'ont pas justifié ?",
        outil: "assiduite.consulter_absences", issue: "repond",
        appel: { action: "listerAbsences", params: et(classe("6A"), (p) => (p.statut === "NON_JUSTIFIEE" && p.depuis === "2026-06-01") || "statut NON_JUSTIFIEE et dates conservées attendus") },
        contient: [async (f) => f.nombre(await f.compterAbsences({ code: "6A", depuis: "2026-06-01", jusqua: "2026-06-05", statut: "NON_JUSTIFIEE" }))],
      },
      {
        dit: "Prépare une notification pour leurs parents : merci de justifier l'absence de votre enfant.",
        outil: "notifications.parents", issue: "confirme",
        appel: { action: "devisNotificationParents", params: (p) => (p.selection?.mode === "ids" && p.selection.ids.length > 0) || "une sélection nominative de responsables était attendue" },
        absent: [/✅/],
      },
      { dit: "non, annule", issue: "annule", appel: { action: "envoyerNotificationParents", jamais: true } },
    ],
  },
  {
    id: "cv-02", domaine: "conversation-suivie", etiquettes: ["memoire", "pronoms"], capacites: ["eleves.dossier", "notes.releve"],
    tours: [
      { dit: (f) => "Donne-moi le dossier de " + N(f) + ".", outil: ["eleves.dossier", "eleves.fiche"], issue: "repond", contient: [(f) => f.unique.matricule] },
      { dit: "Quelle est sa classe ?", issue: "repond", contient: [(f) => f.unique.classe] },
      { dit: "Et ses résultats ?", outil: ["notes.releve", "eleves.fiche"], issue: "repond", appel: { action: "releveEleve", params: eleveU } },
      { dit: "Quels sont ses retards ?", outil: ["assiduite.consulter_retards", "eleves.fiche"], issue: "repond", contient: [(f) => (f.unique.assiduite.retards ? f.nombre(f.unique.assiduite.retards) : /aucun/i)] },
    ],
  },
  {
    id: "cv-03", domaine: "conversation-suivie", etiquettes: ["memoire"], capacites: ["assiduite.consulter_absences"],
    tours: [
      { dit: "les absences non justifiées de la 3e A", outil: "assiduite.consulter_absences", issue: "repond", appel: { action: "listerAbsences", params: classe("3A") } },
      {
        dit: "fais pareil pour la 3e B",
        outil: "assiduite.consulter_absences", issue: "repond",
        appel: { action: "listerAbsences", params: et(classe("3B"), (p) => p.statut === "NON_JUSTIFIEE" || "le filtre non justifiées devait être conservé") },
        contient: [(f) => f.nombre(f.absences["3B"].nonj)],
      },
    ],
  },
  {
    id: "cv-04", domaine: "conversation-suivie", etiquettes: ["memoire", "nouveau-sujet"], capacites: ["assiduite.consulter_retards"],
    tours: [
      { dit: "absences de la 6e A", outil: "assiduite.consulter_absences", issue: "repond", appel: { action: "listerAbsences", params: classe("6A") } },
      { dit: "nouveau sujet", issue: "repond", contient: [/z[ée]ro/i] },
      {
        // Le fil est fermé : « et les retards ? » ne peut plus désigner la 6e A.
        dit: "et les retards ?",
        appel: { action: "listerRetards", params: (p) => !p.classeId || "le fil fermé par « nouveau sujet » a été réutilisé" },
      },
    ],
  },
  {
    id: "cv-05", domaine: "conversation-suivie", etiquettes: ["memoire", "homonymes"], capacites: ["notes.releve"],
    tours: [
      { dit: (f) => "relevé de notes de " + f.homonymes.prenom + " " + f.homonymes.nom, issue: "clarifie", contient: [(f) => f.homonymes.eleves[0].matricule] },
      { dit: "le deuxième", issue: "repond", appel: { action: "releveEleve", params: (p, f) => p.eleveId === f.homonymes.eleves[1].id || "attendu le 2e homonyme" } },
      { dit: "et ses absences ?", issue: "repond", appel: { action: "listerAbsences", params: (p, f) => p.eleveId === f.homonymes.eleves[1].id || "attendu les absences du même élève" } },
    ],
  },
  {
    id: "cv-06", domaine: "conversation-suivie", etiquettes: ["memoire", "dates"], capacites: ["assiduite.consulter_absences"],
    tours: [
      { dit: (f) => "les absences de " + N(f), outil: ["assiduite.consulter_absences", "eleves.fiche"], issue: "repond", appel: { action: "listerAbsences", params: eleveU }, contient: [(f) => f.nombre(f.unique.assiduite.absences)] },
      { dit: "seulement entre le 1er janvier et le 31 mars 2026", outil: "assiduite.consulter_absences", issue: "repond", appel: { action: "listerAbsences", params: et(eleveU, (p) => (p.depuis === "2026-01-01" && p.jusqua === "2026-03-31") || "dates attendues") } },
    ],
  },
];

export default [...variantes, ...conversations];
