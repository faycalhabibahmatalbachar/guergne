/**
 * Conversations : le fil d'un échange. Les références implicites (« et les
 * retards ? », « ses parents », « le 2 »), les corrections, les changements de
 * sujet, et le contexte qui périme.
 */
const classe = (code) => (p, f) => p.classeId === f.classes[code].id || "classe attendue : " + code + " — reçu " + JSON.stringify(p).slice(0, 120);
const eleveU = (p, f) => p.eleveId === f.unique.id || "élève attendu : " + f.unique.prenom + " " + f.unique.nom;
const et = (...fs) => async (p, f) => {
  for (const g of fs) {
    const r = await g(p, f);
    if (r !== true) return r;
  }
  return true;
};
const nomU = (f) => f.unique.prenom + " " + f.unique.nom;

export default [
  {
    id: "mt-01", domaine: "conversation-suivie", etiquettes: ["memoire"], capacites: ["assiduite.consulter_absences", "assiduite.consulter_retards"],
    tours: [
      { dit: "Donne-moi les absents de 6e A.", outil: "assiduite.consulter_absences", issue: "repond", appel: { action: "listerAbsences", params: classe("6A") } },
      { dit: "Et les retards ?", outil: "assiduite.consulter_retards", issue: "repond", appel: { action: "listerRetards", params: classe("6A") }, contient: [(f) => f.nombre(f.retards["6A"])] },
      { dit: "et pour la 6e B ?", outil: "assiduite.consulter_retards", issue: "repond", appel: { action: "listerRetards", params: classe("6B") }, contient: [(f) => f.nombre(f.retards["6B"])] },
    ],
  },
  {
    id: "mt-02", domaine: "conversation-suivie", etiquettes: ["memoire", "dates"], capacites: ["assiduite.consulter_absences"],
    tours: [
      { dit: "les absences de la 5e A", outil: "assiduite.consulter_absences", issue: "repond", appel: { action: "listerAbsences", params: classe("5A") } },
      {
        dit: "seulement les non justifiées",
        outil: "assiduite.consulter_absences", issue: "repond",
        appel: { action: "listerAbsences", params: et(classe("5A"), (p) => p.statut === "NON_JUSTIFIEE" || "statut attendu : NON_JUSTIFIEE") },
        contient: [(f) => f.nombre(f.absences["5A"].nonj)],
      },
      {
        dit: "pour janvier 2026",
        outil: "assiduite.consulter_absences", issue: "repond",
        // La classe et le statut restent ; seule la période change.
        appel: { action: "listerAbsences", params: et(classe("5A"), (p) => (p.statut === "NON_JUSTIFIEE" && p.depuis === "2026-01-01" && p.jusqua === "2026-01-31") || "attendu statut conservé + janvier 2026") },
      },
    ],
  },
  {
    id: "mt-03", domaine: "conversation-suivie", etiquettes: ["memoire", "pronoms"], capacites: ["eleves.fiche", "notes.releve", "parents.tuteurs_de_l_eleve", "finances.situations"],
    tours: [
      { dit: (f) => "la fiche de " + nomU(f), outil: "eleves.fiche", issue: "repond", appel: { action: "ficheEleve", params: eleveU } },
      { dit: "et ses notes ?", outil: ["notes.releve", "eleves.fiche"], issue: "repond", appel: { action: "releveEleve", params: eleveU }, contient: [/moyenne/i] },
      { dit: "qui sont ses parents ?", outil: ["parents.tuteurs_de_l_eleve", "eleves.fiche", "eleves.dossier"], issue: "repond", contient: [(f) => f.unique.tuteurs[0].nom] },
      { dit: "combien doit-il encore ?", outil: ["finances.situations", "eleves.fiche"], issue: "repond", contient: [(f) => f.nombre(f.unique.finances.reste)] },
    ],
  },
  {
    id: "mt-04", domaine: "conversation-suivie", etiquettes: ["memoire", "homonymes"], capacites: ["eleves.fiche"],
    tours: [
      {
        dit: (f) => "la fiche de " + f.homonymes.prenom + " " + f.homonymes.nom,
        outil: "eleves.fiche", issue: "clarifie",
        contient: [(f) => f.homonymes.eleves[0].matricule, (f) => f.homonymes.eleves[1].matricule],
      },
      {
        // Le menu numéroté a un sens : « 2 » désigne le second.
        dit: "2",
        issue: "repond",
        appel: { action: "ficheEleve", params: (p, f) => p.eleveId === f.homonymes.eleves[1].id || "attendu le 2e homonyme (" + f.homonymes.eleves[1].matricule + ")" },
        contient: [(f) => f.homonymes.eleves[1].matricule],
      },
    ],
  },
  {
    id: "mt-05", domaine: "conversation-suivie", etiquettes: ["memoire", "homonymes"], capacites: ["eleves.fiche"],
    tours: [
      { dit: (f) => "la fiche de " + f.homonymes.prenom + " " + f.homonymes.nom, outil: "eleves.fiche", issue: "clarifie" },
      {
        // Désigner par la classe plutôt que par le numéro.
        dit: (f) => "celle de " + f.homonymes.eleves[0].classe,
        issue: "repond",
        appel: { action: "ficheEleve", params: (p, f) => p.eleveId === f.homonymes.eleves[0].id || "attendu l'homonyme de " + f.homonymes.eleves[0].classe },
      },
    ],
  },
  {
    id: "mt-06", domaine: "conversation-suivie", etiquettes: ["memoire", "clarification"], capacites: ["classes.eleves"],
    tours: [
      { dit: "donne-moi la liste des élèves de la classe", issue: "clarifie", contient: [/classe/i] },
      { dit: "6e B", outil: ["eleves.rechercher", "classes.eleves"], issue: "repond", contient: [(f) => f.nombre(f.classes["6B"].effectif)] },
    ],
  },
  {
    id: "mt-07", domaine: "conversation-suivie", etiquettes: ["memoire", "changement-de-sujet"], capacites: ["etablissement.annee_courante", "personnel.enseignants"],
    tours: [
      { dit: "absences de la 6e A", outil: "assiduite.consulter_absences", issue: "repond" },
      { dit: "au fait, on est en quelle année scolaire ?", outil: "etablissement.annee_courante", issue: "repond", contient: [(f) => f.annee.libelle] },
      {
        dit: "et combien y a-t-il d'enseignants ?",
        outil: ["personnel.enseignants", "pilotage.indicateurs", "etablissement.statistiques"], issue: "repond",
        contient: [(f) => f.nombre(f.totaux.enseignants)],
      },
    ],
  },
  {
    id: "mt-08", domaine: "conversation-suivie", etiquettes: ["memoire", "correction"], capacites: ["assiduite.consulter_retards"],
    tours: [
      { dit: "les retards de la 6e A", outil: "assiduite.consulter_retards", issue: "repond", appel: { action: "listerRetards", params: classe("6A") } },
      { dit: "non pardon, je voulais dire la 6e B", outil: "assiduite.consulter_retards", issue: "repond", appel: { action: "listerRetards", params: classe("6B") } },
    ],
  },
  {
    id: "mt-09", domaine: "conversation-suivie", etiquettes: ["memoire"], capacites: ["parents.rechercher"],
    tours: [
      { dit: "les parents de la 4e A qui n'ont pas de compte", outil: "parents.rechercher", issue: "repond", appel: { action: "rechercherTuteurs", params: classe("4A") } },
      {
        dit: "et ceux de la 4e B ?",
        outil: "parents.rechercher", issue: "repond",
        appel: { action: "rechercherTuteurs", params: et(classe("4B"), (p) => Boolean(p.etat) || "l'état de compte devait être conservé") },
      },
    ],
  },
  {
    id: "mt-10", domaine: "conversation-suivie", etiquettes: ["memoire", "perime"], capacites: ["assiduite.consulter_retards"],
    tours: [
      { dit: "absences de la 6e A", outil: "assiduite.consulter_absences", issue: "repond", appel: { action: "listerAbsences", params: classe("6A") } },
      { attendreMs: 3 * 60 * 60 * 1000 },
      {
        // Trois heures plus tard, « et les retards ? » ne désigne plus la 6e A :
        // rattacher la demande à une classe évoquée ce matin serait une erreur.
        dit: "et les retards ?",
        appel: { action: "listerRetards", params: (p) => !p.classeId || "le contexte périmé (classe) a été réutilisé" },
      },
    ],
  },
  {
    id: "mt-11", domaine: "conversation-suivie", etiquettes: ["memoire", "pronoms"], capacites: ["notes.releve"],
    tours: [
      { dit: (f) => "relevé de notes de " + nomU(f), outil: "notes.releve", issue: "repond", appel: { action: "releveEleve", params: eleveU } },
      {
        dit: "et au premier trimestre ?",
        outil: "notes.releve", issue: "repond",
        appel: { action: "releveEleve", params: et(eleveU, (p, f) => p.periodeId === f.periodes[1].id || p.periodeNumero === 1 || "période attendue : n°1") },
      },
    ],
  },
  {
    id: "mt-12", domaine: "conversation-suivie", etiquettes: ["memoire", "multi-outils", "notification"], capacites: ["notifications.parents"],
    tours: [
      {
        dit: "les absences non justifiées de la 6e A entre le 1er et le 5 juin 2026",
        outil: "assiduite.consulter_absences", issue: "repond",
        appel: { action: "listerAbsences", params: classe("6A") },
      },
      {
        // « leurs » = les élèves du résultat précédent. Devis, puis confirmation.
        dit: "préviens leurs parents : merci de justifier l'absence de votre enfant auprès de la surveillance",
        outil: "notifications.parents", issue: "confirme",
        appel: { action: "devisNotificationParents", params: () => true },
        contient: [/destinataire|responsable|parent/i],
        absent: [/✅/],
      },
      {
        dit: "non",
        issue: "annule",
        appel: { action: "envoyerNotificationParents", jamais: true },
      },
    ],
  },
  {
    id: "mt-13", domaine: "conversation-suivie", etiquettes: ["multi-outils", "notification"], capacites: ["notifications.parents"],
    tours: [
      {
        // Une seule phrase, deux opérations : lire, puis préparer l'envoi.
        dit: "Donne-moi les élèves de 6e B qui ont des absences non justifiées entre le 1er et le 5 juin 2026 et préviens leurs parents qu'ils doivent les justifier",
        issue: "confirme",
        appel: [
          { action: "listerAbsences", params: et(classe("6B"), (p) => p.statut === "NON_JUSTIFIEE" || "statut attendu : NON_JUSTIFIEE") },
          { action: "devisNotificationParents", params: () => true },
        ],
        absent: [/✅/],
      },
      { dit: "annule", issue: "annule", appel: { action: "envoyerNotificationParents", jamais: true } },
    ],
  },
  {
    id: "mt-14", domaine: "conversation-suivie", etiquettes: ["memoire", "pronoms"], capacites: ["eleves.fiche"],
    tours: [
      { dit: (f) => "retrouve " + nomU(f), outil: ["eleves.rechercher", "eleves.dossier", "eleves.fiche"], issue: "repond", contient: [(f) => f.unique.matricule] },
      { dit: "donne-moi sa fiche complète", outil: "eleves.fiche", issue: "repond", appel: { action: "ficheEleve", params: eleveU } },
      { dit: "et ses absences ?", outil: ["assiduite.consulter_absences", "eleves.fiche"], issue: "repond", contient: [(f) => f.nombre(f.unique.assiduite.absences)] },
    ],
  },
  {
    id: "mt-15", domaine: "conversation-suivie", etiquettes: ["memoire"], capacites: ["finances.situations"],
    tours: [
      { dit: "les impayés de la 3e A", outil: "finances.situations", issue: "repond", appel: { action: "listerSituationsFinancieres", params: classe("3A") } },
      { dit: "et en 3e B ?", outil: "finances.situations", issue: "repond", appel: { action: "listerSituationsFinancieres", params: et(classe("3B"), (p) => p.seulementImpayes === true || "le filtre impayés devait être conservé") } },
    ],
  },
];
