/**
 * Consultations, domaine par domaine. Un tour, une demande, comme on l'écrit
 * sur WhatsApp : avec des abréviations, des fautes, sans identifiant.
 *
 * `f` est l'oracle SQL (banc/faits.mjs). `u` = f.unique, un élève sans homonyme.
 */
const classe = (code, champ = "classeId") => (p, f) => p[champ] === f.classes[code].id || "classe attendue : " + code + " (" + f.classes[code].id + ")";
const periode = (n) => (p, f) => p.periodeId === f.periodes[n].id || p.periodeNumero === n || "période attendue : n°" + n;
const eleveU = (p, f) => p.eleveId === f.unique.id || "élève attendu : " + f.unique.prenom + " " + f.unique.nom + " (" + f.unique.id + ")";
const et = (...fs) => async (p, f) => {
  for (const g of fs) {
    const r = await g(p, f);
    if (r !== true) return r;
  }
  return true;
};
const nomU = (f) => f.unique.prenom + " " + f.unique.nom;

export default [
  // ------------------------------------------------------------------ élèves
  {
    id: "el-01", domaine: "eleves", capacites: ["eleves.fiche"],
    tours: [{
      dit: (f) => "Donne-moi la fiche complète de " + nomU(f),
      outil: "eleves.fiche", issue: "repond",
      appel: { action: "ficheEleve", params: eleveU },
      contient: [(f) => f.unique.matricule, (f) => f.unique.classe, /Responsables/],
    }],
  },
  {
    id: "el-02", domaine: "eleves", capacites: ["eleves.fiche"], etiquettes: ["matricule"],
    tours: [{
      dit: (f) => "fiche de l'élève " + f.unique.matricule,
      outil: ["eleves.fiche", "eleves.dossier"], issue: "repond",
      contient: [(f) => f.unique.nom, (f) => f.unique.classe],
    }],
  },
  {
    id: "el-03", domaine: "eleves", capacites: ["eleves.dossier"],
    tours: [{
      dit: (f) => "Retrouve le dossier de " + nomU(f),
      outil: ["eleves.dossier", "eleves.fiche", "eleves.rechercher"], issue: "repond",
      contient: [(f) => f.unique.matricule],
    }],
  },
  {
    id: "el-04", domaine: "eleves", capacites: ["eleves.rechercher"],
    tours: [{
      dit: (f) => "Dans quelle classe est " + nomU(f) + " ?",
      outil: ["eleves.rechercher", "eleves.dossier", "eleves.fiche"], issue: "repond",
      contient: [(f) => f.unique.classe],
    }],
  },
  {
    id: "el-05", domaine: "eleves", capacites: ["classes.eleves"],
    tours: [{
      dit: "Quels élèves sont inscrits en 6e A ?",
      outil: ["classes.eleves", "eleves.rechercher"], issue: "repond",
      contient: [(f) => f.nombre(f.classes["6A"].effectif)],
      absent: [/6ème B/],
    }],
  },
  {
    id: "el-06", domaine: "eleves", capacites: ["classes.eleves"], etiquettes: ["fautes"],
    tours: [{
      dit: "liste des eleves de la sixieme b stp",
      outil: ["classes.eleves", "eleves.rechercher"], issue: "repond",
      contient: [(f) => f.nombre(f.classes["6B"].effectif)],
    }],
  },
  {
    id: "el-07", domaine: "eleves", capacites: ["pilotage.indicateurs"],
    tours: [{
      dit: "Combien d'élèves sont inscrits cette année ?",
      outil: ["pilotage.indicateurs", "etablissement.statistiques", "eleves.statistiques", "pilotage.effectifs_par_niveau"], issue: "repond",
      contient: [(f) => f.nombre(f.totaux.inscrits)],
    }],
  },
  {
    id: "el-08", domaine: "eleves", capacites: ["eleves.statistiques"],
    tours: [{
      dit: "répartition des élèves par statut",
      outil: "eleves.statistiques", issue: "repond",
      contient: [/inscrit/i],
    }],
  },
  {
    id: "el-09", domaine: "eleves", capacites: ["eleves.rechercher"], etiquettes: ["inconnu"],
    tours: [{
      dit: "Retrouve l'élève Zzyzx Qwertov",
      outil: ["eleves.rechercher", "eleves.dossier", "eleves.fiche"],
      contient: [/aucun/i],
      absent: [/matricule LGR/],
    }],
  },
  {
    id: "el-10", domaine: "eleves", capacites: ["eleves.rechercher"], etiquettes: ["homonymes"],
    tours: [{
      dit: (f) => "Retrouve " + f.homonymes.prenom + " " + f.homonymes.nom,
      outil: ["eleves.rechercher", "eleves.dossier", "eleves.fiche"],
      // Deux élèves portent ce nom : les DEUX doivent être montrés, aucun choisi.
      contient: [(f) => f.homonymes.eleves[0].matricule, (f) => f.homonymes.eleves[1].matricule],
    }],
  },
  {
    id: "el-11", domaine: "eleves", capacites: ["eleves.fiche"], etiquettes: ["fautes"],
    tours: [{
      // Une lettre perdue dans le nom, comme le rend une transcription vocale.
      dit: (f) => "la fiche de " + f.unique.prenom + " " + f.unique.nom.slice(0, -1),
      outil: ["eleves.fiche", "eleves.dossier"], issue: "repond",
      appel: { action: "ficheEleve", params: eleveU },
    }],
  },
  {
    id: "el-12", domaine: "eleves", capacites: ["eleves.rechercher"], etiquettes: ["matricule"],
    tours: [{
      // Le matricule dicté sans son préfixe.
      dit: (f) => "retrouve l'élève matricule " + f.unique.matricule.split("-").pop(),
      outil: ["eleves.rechercher", "eleves.dossier", "eleves.fiche"], issue: "repond",
      contient: [(f) => f.unique.nom],
    }],
  },
  {
    id: "el-13", domaine: "eleves", capacites: ["eleves.statistiques"],
    tours: [{
      // Aucun outil ne liste « les partis » d'un coup : trois recherches par statut.
      dit: "Quels élèves ont quitté l'établissement ?",
      outil: ["mission", "eleves.rechercher"], issue: "repond",
      appel: { action: "rechercherEleves", params: (p) => ["TRANSFERE", "ABANDON", "EXCLU"].includes(p.statut) || "une recherche par statut de départ était attendue" },
    }],
  },

  // ----------------------------------------------------------------- classes
  {
    id: "cl-01", domaine: "classes", capacites: ["classes.lister"],
    tours: [{ dit: "Liste toutes les classes", outil: "classes.lister", issue: "repond", contient: [/6ème A/, /Terminale D/, (f) => f.nombre(f.classes["TD"].effectif)] }],
  },
  {
    id: "cl-02", domaine: "classes", capacites: ["classes.lister"],
    tours: [{
      dit: "Combien d'élèves en 6e A ?",
      outil: ["classes.lister", "classes.eleves", "eleves.rechercher"], issue: "repond",
      contient: [(f) => f.nombre(f.classes["6A"].effectif)],
    }],
  },
  {
    id: "cl-03", domaine: "classes", capacites: ["emploi_du_temps.consulter"],
    tours: [{
      dit: "emploi du temps de la 3e A",
      outil: "emploi_du_temps.consulter", issue: "repond",
      appel: { action: "chargerEmploiDuTemps", params: classe("3A") },
    }],
  },
  {
    id: "cl-04", domaine: "classes", capacites: ["emploi_du_temps.consulter"],
    tours: [{
      dit: "qu'est-ce que la 4ème B a comme cours le lundi ?",
      outil: "emploi_du_temps.consulter", issue: "repond",
      appel: { action: "chargerEmploiDuTemps", params: et(classe("4B"), (p) => /lundi/i.test(String(p.jour)) || "jour attendu : lundi") },
    }],
  },
  {
    id: "cl-05", domaine: "classes", capacites: ["classes.eleves"], etiquettes: ["inconnu"],
    tours: [{
      dit: "liste des élèves de la classe de CM2",
      issue: "clarifie",
      appel: { action: "listerElevesClasse", jamais: true },
      contient: [/CM2|ne retrouve|n'existe|introuvable/i],
    }],
  },
  {
    id: "cl-06", domaine: "classes", capacites: ["classes.eleves"], etiquettes: ["ambigu"],
    tours: [{
      // « la 5e » : il y en a deux. Choisir serait une faute.
      dit: "donne moi les élèves de la 5e",
      issue: "clarifie",
      contient: [/5ème A/, /5ème B/],
    }],
  },
  { id: "cl-07", domaine: "classes", capacites: ["referentiel.niveaux"], tours: [{ dit: "quels sont les niveaux d'enseignement ?", outil: "referentiel.niveaux", issue: "repond", contient: [/6/, /Terminale/i] }] },
  { id: "cl-08", domaine: "classes", capacites: ["referentiel.series"], tours: [{ dit: "quelles séries existent au second cycle ?", outil: "referentiel.series", issue: "repond" }] },
  { id: "cl-09", domaine: "classes", capacites: ["referentiel.classes_matieres"], tours: [{ dit: "quelles matières sont enseignées ?", outil: "referentiel.classes_matieres", issue: "repond", contient: [/Math/i] }] },

  // ----------------------------------------------------------------- parents
  {
    id: "pa-01", domaine: "parents", capacites: ["parents.tuteurs_de_l_eleve"],
    tours: [{
      dit: (f) => "Qui sont les parents de " + nomU(f) + " ?",
      outil: ["parents.tuteurs_de_l_eleve", "eleves.fiche", "eleves.dossier"], issue: "repond",
      contient: [(f) => f.unique.tuteurs[0].nom, (f) => f.unique.tuteurs[0].telephone],
    }],
  },
  {
    id: "pa-02", domaine: "parents", capacites: ["parents.tuteurs_de_l_eleve"],
    tours: [{
      dit: (f) => "Retrouve le père de " + nomU(f),
      outil: ["parents.tuteurs_de_l_eleve", "eleves.fiche", "eleves.dossier", "parents.rechercher"], issue: "repond",
      contient: [(f) => f.unique.tuteurs.find((t) => t.lien === "PERE").prenom],
    }],
  },
  {
    id: "pa-03", domaine: "parents", capacites: ["parents.tuteurs_de_l_eleve"],
    tours: [{
      dit: (f) => "Qui est le responsable principal de " + nomU(f) + " ?",
      outil: ["parents.tuteurs_de_l_eleve", "eleves.fiche", "eleves.dossier"], issue: "repond",
      contient: [(f) => f.unique.tuteurs.find((t) => t.est_principal).prenom, /principal/i],
    }],
  },
  {
    id: "pa-04", domaine: "parents", capacites: ["parents.rechercher"],
    tours: [{
      dit: "Quels parents n'ont pas de compte ?",
      outil: ["parents.rechercher", "parents.statistiques"], issue: "repond",
      contient: [async (f) => f.nombre(await f.parentsSansCompte())],
    }],
  },
  {
    id: "pa-05", domaine: "parents", capacites: ["parents.rechercher"],
    tours: [{
      dit: "Montre-moi les parents qui n'ont pas encore activé leur compte",
      outil: ["parents.rechercher", "parents.statistiques"], issue: "repond",
    }],
  },
  { id: "pa-06", domaine: "parents", capacites: ["parents.statistiques"], tours: [{ dit: "Combien de parents ont installé l'application ?", outil: "parents.statistiques", issue: "repond", contient: [/application/i] }] },
  {
    id: "pa-07", domaine: "parents", capacites: ["parents.rechercher"], etiquettes: ["telephone"],
    tours: [{
      dit: (f) => "à qui appartient le numéro " + f.unique.tuteurs[0].telephone + " ?",
      outil: "parents.rechercher", issue: "repond",
      contient: [(f) => f.unique.tuteurs[0].nom],
    }],
  },
  {
    id: "pa-08", domaine: "parents", capacites: ["parents.rechercher"],
    tours: [{
      dit: (f) => "Quels enfants sont rattachés au parent " + f.unique.tuteurs[0].prenom + " " + f.unique.tuteurs[0].nom + " ?",
      outil: "parents.rechercher", issue: "repond",
      contient: [(f) => f.unique.prenom],
    }],
  },
  {
    id: "pa-09", domaine: "parents", capacites: ["parents.rechercher"],
    tours: [{
      dit: "les parents de la 5e A qui n'ont pas de compte",
      outil: "parents.rechercher", issue: "repond",
      appel: { action: "rechercherTuteurs", params: et(classe("5A"), (p) => p.etat === "SANS_COMPTE" || /sans/i.test(String(p.etat)) || "état attendu : sans compte") },
    }],
  },

  // ------------------------------------------------------------------- notes
  {
    id: "no-01", domaine: "notes", capacites: ["notes.releve"],
    tours: [{
      dit: (f) => "Donne-moi le relevé de notes de " + nomU(f),
      outil: "notes.releve", issue: "repond",
      appel: { action: "releveEleve", params: eleveU },
      contient: [/moyenne/i],
    }],
  },
  {
    id: "no-02", domaine: "notes", capacites: ["notes.releve"],
    tours: [{
      dit: (f) => "les notes de " + nomU(f) + " au 2e trimestre",
      outil: "notes.releve", issue: "repond",
      appel: { action: "releveEleve", params: et(eleveU, periode(2)) },
      contient: [/2ème Trimestre/i],
    }],
  },
  {
    id: "no-03", domaine: "notes", capacites: ["pedagogie.calendrier_evaluations"],
    tours: [{ dit: "Quelles évaluations sont programmées ?", outil: ["pedagogie.calendrier_evaluations", "pedagogie.evaluations"], issue: "repond" }],
  },
  {
    id: "no-04", domaine: "notes", capacites: ["pedagogie.evaluations"],
    tours: [{
      dit: "les évaluations de la 3e A au premier trimestre",
      outil: ["pedagogie.evaluations", "pedagogie.calendrier_evaluations"], issue: "repond",
      contient: [/3ème A/],
      absent: [/3ème B/, /2ème Trimestre/],
    }],
  },
  { id: "no-05", domaine: "notes", capacites: ["pilotage.classement_classes"], tours: [{ dit: "classement des classes par moyenne", outil: "pilotage.classement_classes", issue: "repond", contient: [/6ème A/] }] },
  {
    id: "no-06", domaine: "notes", capacites: ["pilotage.moyennes_par_classe"],
    tours: [{
      dit: "moyennes par classe au 1er trimestre",
      outil: ["pilotage.moyennes_par_classe", "pilotage.classement_classes"], issue: "repond",
      appel: { action: "moyennesParClasse", params: periode(1) },
    }],
  },
  {
    id: "no-07", domaine: "notes", capacites: ["pilotage.resultats_par_matiere"],
    tours: [{
      dit: "résultats par matière du deuxième trimestre",
      outil: "pilotage.resultats_par_matiere", issue: "repond",
      appel: { action: "resultatsParMatiere", params: periode(2) },
      contient: [/Math/i],
    }],
  },
  {
    id: "no-08", domaine: "notes", capacites: ["assiduite.conduite_classe"],
    tours: [{
      dit: "notes de conduite de la 6e B au 1er trimestre",
      outil: "assiduite.conduite_classe", issue: "repond",
      appel: { action: "chargerConduiteClasse", params: et(classe("6B"), periode(1)) },
    }],
  },
  {
    id: "no-09", domaine: "notes", capacites: ["pilotage.resultats_par_matiere"],
    tours: [{
      // Aucune période dite : celle de l'outil par défaut, pas une question.
      dit: "quelles matières ont les moins bons résultats ?",
      outil: "pilotage.resultats_par_matiere", issue: "repond",
    }],
  },

  // --------------------------------------------------------------- assiduité
  {
    id: "as-01", domaine: "assiduite", capacites: ["assiduite.consulter_absences"],
    tours: [{
      dit: "Donne-moi les absents de 6e A.",
      outil: "assiduite.consulter_absences", issue: "repond",
      appel: { action: "listerAbsences", params: classe("6A") },
      contient: [(f) => f.nombre(f.absences["6A"].total)],
    }],
  },
  {
    id: "as-02", domaine: "assiduite", capacites: ["assiduite.consulter_absences"],
    tours: [{
      dit: "Liste les absences non justifiées de 6e A",
      outil: "assiduite.consulter_absences", issue: "repond",
      appel: { action: "listerAbsences", params: et(classe("6A"), (p) => p.statut === "NON_JUSTIFIEE" || "statut attendu : NON_JUSTIFIEE") },
      contient: [(f) => f.nombre(f.absences["6A"].nonj)],
      absent: [/— .*, justifiée/],
    }],
  },
  {
    id: "as-03", domaine: "assiduite", capacites: ["assiduite.consulter_absences"], etiquettes: ["dates"],
    tours: [{
      dit: "absences non justifiées de la 5ème B entre le 1er et le 15 mars 2026",
      outil: "assiduite.consulter_absences", issue: "repond",
      appel: {
        action: "listerAbsences",
        params: et(classe("5B"), (p) => (p.depuis === "2026-03-01" && p.jusqua === "2026-03-15" && p.statut === "NON_JUSTIFIEE") || "attendu depuis=2026-03-01 jusqua=2026-03-15 statut=NON_JUSTIFIEE"),
      },
    }],
  },
  {
    id: "as-04", domaine: "assiduite", capacites: ["assiduite.consulter_absences"], etiquettes: ["fautes"],
    tours: [{
      dit: "abscences non justifié 6eme a",
      outil: "assiduite.consulter_absences", issue: "repond",
      appel: { action: "listerAbsences", params: et(classe("6A"), (p) => p.statut === "NON_JUSTIFIEE" || "statut attendu : NON_JUSTIFIEE") },
    }],
  },
  {
    id: "as-05", domaine: "assiduite", capacites: ["assiduite.consulter_absences"],
    tours: [{
      dit: "absences de la terminale D au troisième trimestre",
      outil: "assiduite.consulter_absences", issue: "repond",
      appel: { action: "listerAbsences", params: et(classe("TD"), periode(3)) },
    }],
  },
  {
    id: "as-06", domaine: "assiduite", capacites: ["assiduite.consulter_retards"],
    tours: [{
      dit: "les retards de la 4e A",
      outil: "assiduite.consulter_retards", issue: "repond",
      appel: { action: "listerRetards", params: classe("4A") },
      contient: [(f) => f.nombre(f.retards["4A"])],
    }],
  },
  {
    id: "as-07", domaine: "assiduite", capacites: ["assiduite.consulter_retards"], etiquettes: ["dates"],
    tours: [{
      // Aujourd'hui = jeudi 12 novembre 2026 : la semaine va du 9 au 15.
      dit: "Donne-moi les retards de la semaine",
      outil: "assiduite.consulter_retards", issue: "repond",
      appel: { action: "listerRetards", params: (p) => (p.depuis === "2026-11-09" && (!p.jusqua || p.jusqua >= "2026-11-12")) || "attendu depuis=2026-11-09 (semaine en cours)" },
    }],
  },
  {
    id: "as-08", domaine: "assiduite", capacites: ["assiduite.consulter_absences"], etiquettes: ["dates"],
    tours: [{
      dit: "Fais-moi le bilan des absences de la semaine dernière",
      outil: ["assiduite.consulter_absences", "mission"], issue: "repond",
      appel: { action: "listerAbsences", params: (p) => (p.depuis === "2026-11-02" && p.jusqua === "2026-11-08") || "attendu 2026-11-02 → 2026-11-08" },
    }],
  },
  { id: "as-09", domaine: "assiduite", capacites: ["assiduite.alertes"], tours: [{ dit: "quels élèves dépassent le seuil d'absences ?", outil: "assiduite.alertes", issue: "repond" }] },
  { id: "as-10", domaine: "assiduite", capacites: ["assiduite.tableau_de_bord"], tours: [{ dit: "le point de la vie scolaire aujourd'hui", outil: "assiduite.tableau_de_bord", issue: "repond" }] },
  {
    id: "as-11", domaine: "assiduite", capacites: ["discipline.consulter_incidents"],
    tours: [{
      dit: "les incidents de la 3e B",
      outil: "discipline.consulter_incidents", issue: "repond",
      appel: { action: "listerIncidents", params: classe("3B") },
      contient: [(f) => (f.incidents["3B"] ? f.nombre(f.incidents["3B"]) : /aucun/i)],
    }],
  },
  {
    id: "as-12", domaine: "assiduite", capacites: ["discipline.consulter_sanctions"],
    tours: [{ dit: "quelles sanctions ont été prononcées ?", outil: "discipline.consulter_sanctions", issue: "repond", contient: [(f) => (f.totaux.sanctions ? f.nombre(f.totaux.sanctions) : /aucun/i)] }],
  },
  { id: "as-13", domaine: "assiduite", capacites: ["pilotage.absences_par_mois"], tours: [{ dit: "évolution des absences mois par mois", outil: "pilotage.absences_par_mois", issue: "repond" }] },
  {
    id: "as-14", domaine: "assiduite", capacites: ["assiduite.consulter_absences"], etiquettes: ["multi-outils"],
    tours: [{
      dit: "Compare les absences de la 6e A et de la 6e B",
      outil: "mission", issue: "repond",
      contient: [(f) => f.nombre(f.absences["6A"].total), (f) => f.nombre(f.absences["6B"].total)],
    }],
  },
  {
    id: "as-15", domaine: "assiduite", capacites: ["assiduite.consulter_absences"], etiquettes: ["tronque"],
    tours: [{
      // 2 720 absences : la réponse doit dire qu'elle n'en montre qu'une partie.
      dit: "montre-moi toutes les absences de l'année",
      outil: "assiduite.consulter_absences", issue: "repond",
      contient: [/affichées sur|de plus|sur 2/i],
    }],
  },
  {
    id: "as-16", domaine: "assiduite", capacites: ["assiduite.consulter_absences"],
    tours: [{
      dit: (f) => "les absences de " + nomU(f),
      outil: ["assiduite.consulter_absences", "eleves.fiche"], issue: "repond",
      contient: [(f) => f.nombre(f.unique.assiduite.absences)],
    }],
  },

  // ---------------------------------------------------------------- finances
  {
    id: "fi-01", domaine: "finances", capacites: ["finances.situations"],
    tours: [{
      dit: "Qui n'a pas payé ses frais ?",
      outil: "finances.situations", issue: "repond",
      appel: { action: "listerSituationsFinancieres", params: (p) => p.seulementImpayes === true || "seulementImpayes attendu" },
    }],
  },
  {
    id: "fi-02", domaine: "finances", capacites: ["finances.situations"],
    tours: [{
      dit: (f) => "Donne-moi la situation financière de " + nomU(f),
      outil: ["finances.situations", "eleves.fiche"], issue: "repond",
      contient: [(f) => f.nombre(f.unique.finances.reste)],
    }],
  },
  {
    id: "fi-03", domaine: "finances", capacites: ["finances.situations"],
    tours: [{
      dit: (f) => "Combien reste-t-il à payer pour " + nomU(f) + " ?",
      outil: ["finances.situations", "eleves.fiche"], issue: "repond",
      contient: [(f) => f.nombre(f.unique.finances.reste)],
    }],
  },
  { id: "fi-04", domaine: "finances", capacites: ["finances.statistiques"], tours: [{ dit: "où en est-on financièrement ?", outil: "finances.statistiques", issue: "repond", contient: [/FCFA/] }] },
  { id: "fi-05", domaine: "finances", capacites: ["finances.recouvrement_par_classe"], tours: [{ dit: "état du recouvrement classe par classe", outil: "finances.recouvrement_par_classe", issue: "repond", contient: [/6ème A/] }] },
  {
    id: "fi-06", domaine: "finances", capacites: ["finances.situations"],
    tours: [{
      dit: "les impayés de la 2nde A",
      outil: "finances.situations", issue: "repond",
      appel: { action: "listerSituationsFinancieres", params: et(classe("2A"), (p) => p.seulementImpayes === true || "seulementImpayes attendu") },
      absent: [/2nde B/],
    }],
  },
  {
    id: "fi-07", domaine: "finances", capacites: ["finances.situations"],
    tours: [{
      dit: "quels sont les élèves boursiers ?",
      outil: "finances.situations", issue: "repond",
      appel: { action: "listerSituationsFinancieres", params: (p) => p.boursier === true || "boursier attendu" },
    }],
  },
  {
    id: "fi-08", domaine: "finances", capacites: ["finances.situations"],
    tours: [{
      dit: "élèves en retard de paiement en Terminale A",
      outil: "finances.situations", issue: "repond",
      appel: { action: "listerSituationsFinancieres", params: et(classe("TA"), (p) => p.enRetard === true || p.seulementImpayes === true || "enRetard attendu") },
    }],
  },
  {
    id: "fi-09", domaine: "finances", capacites: ["eleves.fiche"],
    tours: [{
      dit: (f) => "Quels paiements ont été enregistrés pour " + nomU(f) + " ?",
      outil: ["eleves.fiche", "finances.situations"], issue: "repond",
      contient: [(f) => f.nombre(f.unique.finances.paye)],
    }],
  },

  // ---------------------------------------------------- pilotage, personnel
  { id: "pi-01", domaine: "pilotage", capacites: ["pilotage.indicateurs"], tours: [{ dit: "donne-moi les chiffres clés de l'établissement", outil: ["pilotage.indicateurs", "etablissement.statistiques"], issue: "repond", contient: [(f) => f.nombre(f.totaux.inscrits)] }] },
  { id: "pi-02", domaine: "pilotage", capacites: ["pilotage.effectifs_par_niveau"], tours: [{ dit: "effectifs par niveau avec garçons et filles", outil: "pilotage.effectifs_par_niveau", issue: "repond" }] },
  { id: "pi-03", domaine: "pilotage", capacites: ["etablissement.annee_courante"], tours: [{ dit: "on est en quelle année scolaire ?", outil: "etablissement.annee_courante", issue: "repond", contient: [(f) => f.annee.libelle] }] },
  { id: "pi-04", domaine: "pilotage", capacites: ["personnel.enseignants"], tours: [{ dit: "liste des enseignants", outil: "personnel.enseignants", issue: "repond", contient: [(f) => f.nombre(f.totaux.enseignants)] }] },
  {
    id: "pi-05", domaine: "pilotage", capacites: ["personnel.enseignants"],
    tours: [{
      dit: (f) => "retrouve l'enseignant " + f.enseignant.nom,
      outil: "personnel.enseignants", issue: "repond",
      contient: [(f) => f.enseignant.prenom],
    }],
  },
  {
    id: "pi-06", domaine: "pilotage", capacites: ["emploi_du_temps.consulter"], etiquettes: ["enseignant"],
    tours: [{
      dit: (f) => "emploi du temps de l'enseignant " + f.enseignant.prenom + " " + f.enseignant.nom,
      outil: "emploi_du_temps.consulter", issue: "repond",
      appel: { action: "chargerEmploiDuTemps", params: (p, f) => p.enseignantId === f.enseignant.id || "enseignant attendu : " + f.enseignant.id },
    }],
  },
  { id: "pi-07", domaine: "pilotage", capacites: ["referentiel.periodes"], tours: [{ dit: "quelles sont les périodes de l'année ?", outil: "referentiel.periodes", issue: "repond", contient: [/1er Trimestre/, /3ème Trimestre/] }] },
  { id: "pi-08", domaine: "pilotage", capacites: ["etablissement.statistiques"], tours: [{ dit: "statistiques générales de l'établissement", outil: ["etablissement.statistiques", "pilotage.indicateurs"], issue: "repond" }] },
];
