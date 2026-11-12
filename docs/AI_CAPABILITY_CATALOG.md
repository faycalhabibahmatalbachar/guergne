# Catalogue des capacités de l'agent

> Document **généré** par `node banc/catalogue.mjs` à partir du registre des outils, de la liste blanche du backend et du catalogue de scénarios. Ne pas le modifier à la main : relancer la commande.

Généré le 2026-11-12 — sans rapport de campagne : la colonne « observé » est vide.

## Vue d'ensemble

| | |
|---|---|
| Outils au registre | 52 |
| dont lectures | 36 |
| dont écritures | 16 |
| Servis par le backend (liste blanche) | 52 / 52 |
| Visés par au moins un scénario | 52 / 52 |
| Scénarios au catalogue | 132 (180 tours) |

Trois niveaux à ne pas confondre : ce que **l'interface web** propose, ce que **le backend** sait faire, et ce que **l'agent** peut déclencher. Ce catalogue ne décrit que le troisième. Ce que l'agent ne sait PAS faire est listé à la fin.

## Domaine : assiduite

### `assiduite.consulter_absences`

- **Intention** : lister les absences enregistrees — d'une classe, d'UN eleve, d'une periode, entre deux dates, justifiees ou non
- **Risque** : lecture
- **Permission d'entrée** : `assiduite:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `listerAbsences`
- **Paramètres** : `periodeId`, `classeId`, `statut`, `eleveId`, `depuis`, `jusqua`, `limite`
- **Entités résolues automatiquement** : période, classe, élève (résolveur central)
- **Exécution** : appel `listerAbsences`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : as-01, as-02, as-03, as-04, as-05, as-08, as-14, as-15, as-16, co-04, dr-01, mt-01, mt-02, mt-07, mt-10, mt-12, mt-14, ro-01, ro-02, ro-09

### `assiduite.alertes`

- **Intention** : lister les eleves QUI DEPASSENT le seuil d'absences — depassements de seuil, eleves les plus concernes, eleves a signaler
- **Risque** : lecture
- **Permission d'entrée** : `assiduite:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `listerAlertes`
- **Paramètres** : `periodeId`
- **Entités résolues automatiquement** : période (résolveur central)
- **Exécution** : appel `listerAlertes`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : as-09

### `assiduite.consulter_retards`

- **Intention** : lister les retards enregistres — d'une classe, d'UN eleve, d'une periode ou entre deux dates
- **Risque** : lecture
- **Permission d'entrée** : `assiduite:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `listerRetards`
- **Paramètres** : `periodeId`, `classeId`, `eleveId`, `depuis`, `jusqua`, `limite`
- **Entités résolues automatiquement** : période, classe, élève (résolveur central)
- **Exécution** : appel `listerRetards`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : as-06, as-07, mt-01, mt-08, mt-10, ro-03, ro-10, ro-13

### `assiduite.tableau_de_bord`

- **Intention** : chiffres du jour : nombre d'absences et de retards aujourd'hui, total non justifie, incidents, alertes
- **Risque** : lecture
- **Permission d'entrée** : `assiduite:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `statistiquesVieScolaire`
- **Paramètres** : `periodeId`
- **Entités résolues automatiquement** : période (résolveur central)
- **Exécution** : appel `statistiquesVieScolaire`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : as-10, co-04

### `assiduite.conduite_classe`

- **Intention** : notes de conduite des eleves d'une classe sur une periode
- **Risque** : lecture
- **Permission d'entrée** : `assiduite:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `chargerConduiteClasse`
- **Paramètres** : `classeId`, `periodeId`
- **Entités résolues automatiquement** : classe, période (résolveur central)
- **Exécution** : appel `chargerConduiteClasse`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : no-08

### `assiduite.enregistrer_appel`

- **Intention** : ENREGISTRER l'appel : creer des absences pour des eleves nommes
- **Risque** : écriture (confirmation selon politique)
- **Permission d'entrée** : `assiduite:saisir` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `enregistrerAppel`
- **Paramètres** : `eleves`, `classeId`, `periodeId`, `dateAbsence`, `nbHeures`, `absents`
- **Entités résolues automatiquement** : classe, période, élèves (liste ou résultat précédent) (résolveur central)
- **Exécution** : appel `enregistrerAppel`
- **Vérification** : message du backend — pas de relecture dédiée
- **Rendu** : ⚠️ message générique
- **Scénarios** : ec-06

### `assiduite.enregistrer_retard`

- **Intention** : ENREGISTRER un retard pour un eleve nomme
- **Risque** : écriture (confirmation selon politique)
- **Permission d'entrée** : `retard:saisir` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `enregistrerRetard`
- **Paramètres** : `eleve`, `classeId`, `inscriptionId`, `periodeId`, `dateRetard`, `dureeMinutes`
- **Entités résolues automatiquement** : classe, période, élève (résolveur central)
- **Exécution** : appel `enregistrerRetard`
- **Vérification** : message du backend — pas de relecture dédiée
- **Rendu** : mis en forme
- **Scénarios** : ec-07

### `assiduite.justifier_absences`

- **Intention** : JUSTIFIER ou DEJUSTIFIER des absences existantes
- **Risque** : écriture (confirmation selon politique) — confirmation exigée
- **Permission d'entrée** : `assiduite:justifier` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `justifierEnLot`
- **Paramètres** : `eleve`, `date`, `statut`, `motif`
- **Entités résolues automatiquement** : élève (résolveur central + préparation de l'outil)
- **Exécution** : préparation (relecture au backend, récapitulatif) → appel `justifierEnLot`
- **Vérification** : relecture après écriture (`verifier`)
- **Rendu** : texte de la vérification
- **Scénarios** : ec-08

### `assiduite.supprimer_absence`

- **Intention** : SUPPRIMER une absence enregistree par erreur
- **Risque** : écriture sensible (confirmation obligatoire) — confirmation exigée
- **Permission d'entrée** : `assiduite:saisir` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `supprimerAbsence`
- **Paramètres** : `eleve`, `date`, `motif`
- **Entités résolues automatiquement** : élève (résolveur central + préparation de l'outil)
- **Exécution** : préparation (relecture au backend, récapitulatif) → appel `supprimerAbsence`
- **Vérification** : relecture après écriture (`verifier`)
- **Rendu** : mis en forme
- **Scénarios** : ec-09

## Domaine : classes

### `classes.lister`

- **Intention** : lister les classes de l'annee scolaire courante, avec leur effectif
- **Risque** : lecture
- **Permission d'entrée** : `classe:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `listerClasses`
- **Paramètres** : aucun
- **Entités résolues automatiquement** : aucune
- **Exécution** : appel `listerClasses`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : cl-01, cl-02, co-08

### `classes.eleves`

- **Intention** : liste des eleves inscrits dans une classe donnee
- **Risque** : lecture
- **Permission d'entrée** : `eleve:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `listerElevesClasse`
- **Paramètres** : `classeId`
- **Entités résolues automatiquement** : classe (résolveur central)
- **Exécution** : appel `listerElevesClasse`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : cl-02, cl-05, cl-06, el-05, el-06, mt-06

### `referentiel.niveaux`

- **Intention** : lister les niveaux d'enseignement (6eme, 5eme, ..., terminale) qui servent a creer une classe
- **Risque** : lecture
- **Permission d'entrée** : `classe:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `listerNiveaux`
- **Paramètres** : aucun
- **Entités résolues automatiquement** : aucune
- **Exécution** : appel `listerNiveaux`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : cl-07

### `classes.creer`

- **Intention** : creer une classe dans l'annee scolaire en cours
- **Risque** : écriture (confirmation selon politique) — confirmation TOUJOURS exigée
- **Permission d'entrée** : `classe:creer` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `creerClasse`
- **Paramètres** : `libelle`, `code`, `niveau`, `capaciteMax`
- **Entités résolues automatiquement** : aucune
- **Exécution** : préparation (relecture au backend, récapitulatif) → appel `creerClasse`
- **Vérification** : relecture après écriture (`verifier`)
- **Rendu** : texte de la vérification
- **Scénarios** : ec-15

### `classes.modifier`

- **Intention** : modifier le nom, le code ou la capacite d'une classe
- **Risque** : écriture (confirmation selon politique) — confirmation TOUJOURS exigée
- **Permission d'entrée** : `classe:modifier` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `modifierClasse`
- **Paramètres** : `classe`, `modifications`
- **Entités résolues automatiquement** : classe (résolveur central + préparation de l'outil)
- **Exécution** : préparation (relecture au backend, récapitulatif) → appel `modifierClasse`
- **Vérification** : relecture après écriture (`verifier`)
- **Rendu** : texte de la vérification
- **Scénarios** : ec-15

### `classes.archiver`

- **Intention** : archiver une classe sans eleve inscrit (la suppression definitive n'est pas proposee)
- **Risque** : écriture sensible (confirmation obligatoire) — confirmation TOUJOURS exigée
- **Permission d'entrée** : `classe:modifier` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `archiverClasse`
- **Paramètres** : `classe`, `motif`
- **Entités résolues automatiquement** : classe (résolveur central + préparation de l'outil)
- **Exécution** : préparation (relecture au backend, récapitulatif) → appel `archiverClasse`
- **Vérification** : relecture après écriture (`verifier`)
- **Rendu** : texte de la vérification
- **Scénarios** : ec-15

## Domaine : discipline

### `discipline.consulter_incidents`

- **Intention** : lister les incidents disciplinaires declares
- **Risque** : lecture
- **Permission d'entrée** : `discipline:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `listerIncidents`
- **Paramètres** : `periodeId`, `classeId`, `eleveId`, `depuis`, `jusqua`, `limite`
- **Entités résolues automatiquement** : période, classe, élève (résolveur central)
- **Exécution** : appel `listerIncidents`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : as-11

### `discipline.consulter_sanctions`

- **Intention** : lister les sanctions prononcees
- **Risque** : lecture
- **Permission d'entrée** : `discipline:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `listerSanctions`
- **Paramètres** : `periodeId`, `classeId`, `eleveId`, `limite`
- **Entités résolues automatiquement** : période, classe, élève (résolveur central)
- **Exécution** : appel `listerSanctions`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : as-12

## Domaine : eleves

### `eleves.rechercher`

- **Intention** : rechercher un eleve par nom, prenom ou matricule, eventuellement dans une classe
- **Risque** : lecture
- **Permission d'entrée** : `eleve:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `rechercherEleves`
- **Paramètres** : `statut`, `recherche`, `classeId`, `parPage`
- **Entités résolues automatiquement** : classe (résolveur central)
- **Exécution** : appel `rechercherEleves`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : cl-02, ec-03, el-03, el-04, el-05, el-06, el-09, el-10, el-12, el-13, mt-06, mt-14

### `eleves.statistiques`

- **Intention** : repartition des eleves par statut : combien d'inscrits, et combien ont QUITTE l'etablissement (transferes, abandons, exclus)
- **Risque** : lecture
- **Permission d'entrée** : `eleve:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `statistiquesEleves`
- **Paramètres** : `anneeId`
- **Entités résolues automatiquement** : année scolaire (résolveur central)
- **Exécution** : appel `statistiquesEleves`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : co-08, el-07, el-08, el-13

### `eleves.dossier`

- **Intention** : consulter le dossier complet d'un eleve : identite, inscription, responsables, informations manquantes
- **Risque** : lecture
- **Permission d'entrée** : `eleve:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `consulterEleve`
- **Paramètres** : `eleve`
- **Entités résolues automatiquement** : élève (résolveur central + préparation de l'outil)
- **Exécution** : préparation (relecture au backend, récapitulatif) → appel `consulterEleve`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : ec-03, el-02, el-03, el-04, el-09, el-10, el-11, el-12, mt-03, mt-14, pa-01, pa-02, pa-03

### `eleves.inscrire`

- **Intention** : creer le dossier d'un NOUVEL eleve et l'inscrire dans une classe de l'annee en cours, avec son responsable legal
- **Risque** : écriture (confirmation selon politique) — confirmation TOUJOURS exigée
- **Permission d'entrée** : `eleve:inscrire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `inscrireEleve`
- **Paramètres** : `nom`, `prenom`, `sexe`, `dateNaissance`, `classe`, `lieuNaissance`, `tuteurNom`, `tuteurPrenom`, `tuteurTelephone`, `tuteurLien`
- **Entités résolues automatiquement** : classe (résolveur central + préparation de l'outil)
- **Exécution** : préparation (relecture au backend, récapitulatif) → appel `inscrireEleve`
- **Vérification** : relecture après écriture (`verifier`)
- **Rendu** : texte de la vérification
- **Scénarios** : ec-01, ec-16

### `eleves.modifier`

- **Intention** : modifier des informations du dossier d'un eleve (identite, coordonnees, sante, ecole d'origine)
- **Risque** : écriture (confirmation selon politique) — confirmation TOUJOURS exigée
- **Permission d'entrée** : `eleve:modifier` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `modifierEleve`
- **Paramètres** : `eleve`, `modifications`
- **Entités résolues automatiquement** : élève (résolveur central + préparation de l'outil)
- **Exécution** : préparation (relecture au backend, récapitulatif) → appel `modifierEleve`
- **Vérification** : relecture après écriture (`verifier`)
- **Rendu** : texte de la vérification
- **Scénarios** : ec-02, ro-05, ro-06

### `eleves.changer_classe`

- **Intention** : deplacer un eleve dans une autre classe de la meme annee scolaire
- **Risque** : écriture (confirmation selon politique) — confirmation TOUJOURS exigée
- **Permission d'entrée** : `eleve:affecter` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `changerClasseEleve`
- **Paramètres** : `eleve`, `classe`, `motif`
- **Entités résolues automatiquement** : élève, classe (résolveur central + préparation de l'outil)
- **Exécution** : préparation (relecture au backend, récapitulatif) → appel `changerClasseEleve`
- **Vérification** : relecture après écriture (`verifier`)
- **Rendu** : texte de la vérification
- **Scénarios** : ec-03

### `eleves.archiver`

- **Intention** : archiver le dossier d'un eleve (la suppression definitive n'existe pas : l'historique est conserve)
- **Risque** : écriture sensible (confirmation obligatoire) — confirmation TOUJOURS exigée
- **Permission d'entrée** : `eleve:modifier` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `archiverEleve`
- **Paramètres** : `eleve`, `motif`
- **Entités résolues automatiquement** : élève (résolveur central + préparation de l'outil)
- **Exécution** : préparation (relecture au backend, récapitulatif) → appel `archiverEleve`
- **Vérification** : relecture après écriture (`verifier`)
- **Rendu** : texte de la vérification
- **Scénarios** : ec-12, ec-14

### `eleves.fiche`

- **Intention** : fiche COMPLETE d'un eleve : identite, age, scolarite et parcours, responsables et leurs roles, notes, assiduite, discipline, finances, pieces du dossier, historique — selon les droits de l'utilisateur
- **Risque** : lecture
- **Permission d'entrée** : `eleve:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `ficheEleve`
- **Paramètres** : `eleve`
- **Entités résolues automatiquement** : élève (résolveur central + préparation de l'outil)
- **Exécution** : préparation (relecture au backend, récapitulatif) → appel `ficheEleve`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : as-16, dr-05, dr-06, ec-03, el-01, el-02, el-03, el-04, el-09, el-10, el-11, el-12, fi-02, fi-03, fi-09, mt-03, mt-04, mt-05, mt-14, pa-01, pa-02, pa-03

### `eleves.changer_statut`

- **Intention** : enregistrer un TRANSFERT (etablissement d'accueil requis), un ABANDON de scolarite, une EXCLUSION DEFINITIVE (reference de la decision requise), une suspension (date de fin) ou une reactivation. Cloture l'inscription pour un depart
- **Risque** : écriture (confirmation selon politique) — confirmation TOUJOURS exigée
- **Permission d'entrée** : `eleve:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `changerStatutEleve`
- **Paramètres** : `eleve`, `statut`, `motif`, `etablissement`, `decision`, `dateEffet`, `dateFinPrevue`
- **Entités résolues automatiquement** : élève (résolveur central + préparation de l'outil)
- **Exécution** : préparation (relecture au backend, récapitulatif) → appel `changerStatutEleve` — champs qui doivent avoir été écrits par l'utilisateur : decision, etablissement
- **Vérification** : relecture après écriture (`verifier`)
- **Rendu** : texte de la vérification
- **Scénarios** : ec-11, ec-13

## Domaine : emploi_du_temps

### `emploi_du_temps.consulter`

- **Intention** : emploi du temps d'une classe ou d'un enseignant, eventuellement pour un seul jour
- **Risque** : lecture
- **Permission d'entrée** : `emploi_du_temps:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `chargerEmploiDuTemps`
- **Paramètres** : `classeId`, `enseignantId`, `anneeId`, `jour`
- **Entités résolues automatiquement** : classe, enseignant, année scolaire (résolveur central)
- **Exécution** : appel `chargerEmploiDuTemps`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : cl-03, cl-04, pi-06

## Domaine : etablissement

### `etablissement.annee_courante`

- **Intention** : annee scolaire en cours, avec ses dates
- **Risque** : lecture
- **Permission d'entrée** : `classe:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `anneeCourante`
- **Paramètres** : aucun
- **Entités résolues automatiquement** : aucune
- **Exécution** : appel `anneeCourante`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : mt-07, pi-03

## Domaine : finances

### `finances.statistiques`

- **Intention** : situation financiere globale : attendu, encaisse, reste du
- **Risque** : lecture
- **Permission d'entrée** : `finance:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `statistiquesFinancieres`
- **Paramètres** : `anneeId`
- **Entités résolues automatiquement** : année scolaire (résolveur central)
- **Exécution** : appel `statistiquesFinancieres`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : fi-04

### `finances.recouvrement_par_classe`

- **Intention** : SYNTHESE du recouvrement, une ligne par CLASSE (montants et taux, aucun nom d'eleve). Pour savoir QUELS eleves doivent de l'argent, utiliser finances.situations
- **Risque** : lecture
- **Permission d'entrée** : `finance:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `recouvrementParClasse`
- **Paramètres** : `anneeId`
- **Entités résolues automatiquement** : année scolaire (résolveur central)
- **Exécution** : appel `recouvrementParClasse`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : fi-05

### `finances.situations`

- **Intention** : LISTE NOMINATIVE des eleves avec ce qu'ils ont paye et ce qu'ils doivent encore — « qui n'a pas paye », « les impayes de la 2nde A », « les boursiers », « eleves en retard de paiement », ou la situation d'UN eleve
- **Risque** : lecture
- **Permission d'entrée** : `finance:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `listerSituationsFinancieres`
- **Paramètres** : `classe`, `seulementImpayes`, `enRetard`, `boursier`, `eleve`
- **Entités résolues automatiquement** : classe, élève (résolveur central + préparation de l'outil)
- **Exécution** : préparation (relecture au backend, récapitulatif) → appel `listerSituationsFinancieres`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : fi-01, fi-02, fi-03, fi-06, fi-07, fi-08, fi-09, mt-03, mt-15

## Domaine : notes

### `notes.releve`

- **Intention** : releve de notes d'un eleve pour une periode, avec les moyennes par matiere et la moyenne generale calculees selon les regles du bulletin
- **Risque** : lecture
- **Permission d'entrée** : `note:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `releveEleve`
- **Paramètres** : `eleve`, `periode`
- **Entités résolues automatiquement** : élève, période (résolveur central + préparation de l'outil)
- **Exécution** : préparation (relecture au backend, récapitulatif) → appel `releveEleve`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : mt-03, mt-11, no-01, no-02

## Domaine : notifications

### `notifications.parents`

- **Intention** : envoyer une notification aux parents : ceux d'un eleve (tous, ou un seul : « uniquement le pere »), ou un groupe (parents d'une classe, filtrables par etat de compte). Montre le devis (canaux, cout SMS) avant confirmation
- **Risque** : écriture sensible (confirmation obligatoire) — confirmation TOUJOURS exigée
- **Permission d'entrée** : `message:envoyer` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `envoyerNotificationParents`
- **Paramètres** : `eleve`, `eleves`, `responsable`, `classe`, `etat`, `titre`, `message`, `canal`
- **Entités résolues automatiquement** : élève, élèves (liste ou résultat précédent), responsable, classe (résolveur central + préparation de l'outil)
- **Exécution** : préparation (relecture au backend, récapitulatif) → appel `envoyerNotificationParents`
- **Vérification** : relecture après écriture (`verifier`)
- **Rendu** : texte de la vérification
- **Scénarios** : ec-05, mt-12, mt-13

## Domaine : parents

### `parents.tuteurs_de_l_eleve`

- **Intention** : responsables legaux rattaches a un eleve, avec leur lien de parente
- **Risque** : lecture
- **Permission d'entrée** : `eleve:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `tuteursDeLEleve`
- **Paramètres** : `eleveId`
- **Entités résolues automatiquement** : élève (résolveur central)
- **Exécution** : appel `tuteursDeLEleve`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : mt-03, pa-01, pa-02, pa-03

### `parents.rechercher`

- **Intention** : rechercher les parents et tuteurs par nom ou telephone, ou par etat de leur compte (sans compte, invite jamais connecte, actif, revoque, doublon), eventuellement dans une classe
- **Risque** : lecture
- **Permission d'entrée** : `tuteur:gerer` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `rechercherTuteurs`
- **Paramètres** : `recherche`, `etat`, `classe`, `page`
- **Entités résolues automatiquement** : classe (résolveur central + préparation de l'outil)
- **Exécution** : préparation (relecture au backend, récapitulatif) → appel `rechercherTuteurs`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : mt-09, pa-02, pa-04, pa-05, pa-07, pa-08, pa-09

### `parents.statistiques`

- **Intention** : synthese des comptes parents : combien sans compte, invites jamais connectes, actifs, revoques, avec l'application installee, doublons de telephone
- **Risque** : lecture
- **Permission d'entrée** : `tuteur:gerer` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `statistiquesParents`
- **Paramètres** : aucun
- **Entités résolues automatiquement** : aucune
- **Exécution** : appel `statistiquesParents`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : pa-04, pa-05, pa-06

### `parents.rattacher`

- **Intention** : rattacher un parent ou tuteur a un eleve. Si une fiche existe deja pour ce telephone (meme parent d'un autre enfant), elle est REUTILISEE au lieu d'en creer une nouvelle
- **Risque** : écriture (confirmation selon politique) — confirmation TOUJOURS exigée
- **Permission d'entrée** : `tuteur:gerer` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `rattacherTuteur`
- **Paramètres** : `eleve`, `telephone`, `nom`, `prenom`, `lien`, `estPrincipal`, `estTuteurLegal`, `estResponsableFinancier`, `estContactUrgence`, `autoriseRetrait`
- **Entités résolues automatiquement** : élève (résolveur central + préparation de l'outil)
- **Exécution** : préparation (relecture au backend, récapitulatif) → appel `rattacherTuteur`
- **Vérification** : relecture après écriture (`verifier`)
- **Rendu** : texte de la vérification
- **Scénarios** : ec-04, ec-17

### `parents.detacher`

- **Intention** : retirer un responsable d'un eleve (le lien seulement : la fiche du parent est conservee). Refuse si c'est le dernier responsable
- **Risque** : écriture (confirmation selon politique) — confirmation TOUJOURS exigée
- **Permission d'entrée** : `tuteur:gerer` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `detacherTuteur`
- **Paramètres** : `eleve`, `tuteur`
- **Entités résolues automatiquement** : élève, responsable (résolveur central + préparation de l'outil)
- **Exécution** : préparation (relecture au backend, récapitulatif) → appel `detacherTuteur`
- **Vérification** : relecture après écriture (`verifier`)
- **Rendu** : texte de la vérification
- **Scénarios** : ec-10

### `parents.responsabilites`

- **Intention** : changer le lien ou les responsabilites d'un responsable deja rattache : responsable principal (transfert), tuteur legal, responsable financier, contact d'urgence, autorise au retrait
- **Risque** : écriture (confirmation selon politique) — confirmation TOUJOURS exigée
- **Permission d'entrée** : `tuteur:gerer` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `modifierResponsabilitesTuteur`
- **Paramètres** : `eleve`, `tuteur`, `lien`, `estPrincipal`, `estTuteurLegal`, `estResponsableFinancier`, `estContactUrgence`, `autoriseRetrait`
- **Entités résolues automatiquement** : élève, responsable (résolveur central + préparation de l'outil)
- **Exécution** : préparation (relecture au backend, récapitulatif) → appel `modifierResponsabilitesTuteur`
- **Vérification** : relecture après écriture (`verifier`)
- **Rendu** : texte de la vérification
- **Scénarios** : ec-04

## Domaine : pedagogie

### `pedagogie.evaluations`

- **Intention** : evaluations programmees ou passees sur une periode
- **Risque** : lecture
- **Permission d'entrée** : `evaluation:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `listerEvaluations`
- **Paramètres** : `periodeId`, `classeId`, `matiereId`
- **Entités résolues automatiquement** : période, classe, matière (résolveur central)
- **Exécution** : appel `listerEvaluations`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : no-03, no-04

### `pedagogie.calendrier_evaluations`

- **Intention** : calendrier des evaluations d'une periode, avec les journees surchargees de compositions
- **Risque** : lecture
- **Permission d'entrée** : `evaluation:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `calendrierEvaluations`
- **Paramètres** : `periode`, `classe`, `type`
- **Entités résolues automatiquement** : période, classe (résolveur central + préparation de l'outil)
- **Exécution** : préparation (relecture au backend, récapitulatif) → appel `calendrierEvaluations`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : no-03, no-04

### `referentiel.classes_matieres`

- **Intention** : classes actives de l'annee et matieres enseignees
- **Risque** : lecture
- **Permission d'entrée** : `classe:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `listerClassesEtMatieres`
- **Paramètres** : aucun
- **Entités résolues automatiquement** : aucune
- **Exécution** : appel `listerClassesEtMatieres`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : cl-09

## Domaine : personnel

### `personnel.enseignants`

- **Intention** : annuaire des enseignants, avec leur statut et leur specialite
- **Risque** : lecture
- **Permission d'entrée** : `classe:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `listerEnseignants`
- **Paramètres** : `anneeId`, `recherche`
- **Entités résolues automatiquement** : année scolaire (résolveur central)
- **Exécution** : appel `listerEnseignants`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : mt-07, pi-04, pi-05

## Domaine : pilotage

### `pilotage.indicateurs`

- **Intention** : chiffres cles de l'etablissement : effectif total, nouveaux inscrits, nombre d'enseignants et de classes, presents et absents du jour, moyenne generale
- **Risque** : lecture
- **Permission d'entrée** : `statistique:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `indicateursCles`
- **Paramètres** : `anneeId`, `periodeId`
- **Entités résolues automatiquement** : année scolaire, période (résolveur central)
- **Exécution** : appel `indicateursCles`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : co-04, co-08, el-07, mt-07, pi-01, pi-08

### `pilotage.effectifs_par_niveau`

- **Intention** : repartition des effectifs par niveau, avec le detail garcons / filles
- **Risque** : lecture
- **Permission d'entrée** : `statistique:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `effectifsParNiveau`
- **Paramètres** : `anneeId`
- **Entités résolues automatiquement** : année scolaire (résolveur central)
- **Exécution** : appel `effectifsParNiveau`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : co-08, el-07, pi-02

### `pilotage.absences_par_mois`

- **Intention** : evolution mensuelle des heures d'absence, justifiees et non justifiees
- **Risque** : lecture
- **Permission d'entrée** : `statistique:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `absencesParMois`
- **Paramètres** : `anneeId`
- **Entités résolues automatiquement** : année scolaire (résolveur central)
- **Exécution** : appel `absencesParMois`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : as-13

### `pilotage.moyennes_par_classe`

- **Intention** : moyenne et taux de reussite de chaque classe
- **Risque** : lecture
- **Permission d'entrée** : `note:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `moyennesParClasse`
- **Paramètres** : `anneeId`, `periodeId`
- **Entités résolues automatiquement** : année scolaire, période (résolveur central)
- **Exécution** : appel `moyennesParClasse`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : no-06

### `pilotage.classement_classes`

- **Intention** : classement des classes par moyenne, avec l'ecart a la moyenne de l'etablissement
- **Risque** : lecture
- **Permission d'entrée** : `note:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `classementClasses`
- **Paramètres** : `anneeId`, `periodeId`
- **Entités résolues automatiquement** : année scolaire, période (résolveur central)
- **Exécution** : appel `classementClasses`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : no-05, no-06

### `pilotage.resultats_par_matiere`

- **Intention** : moyenne obtenue dans chaque matiere sur une periode
- **Risque** : lecture
- **Permission d'entrée** : `note:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `resultatsParMatiere`
- **Paramètres** : `periodeId`
- **Entités résolues automatiquement** : période (résolveur central)
- **Exécution** : appel `resultatsParMatiere`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : no-07, no-09

### `etablissement.statistiques`

- **Intention** : statistiques generales de l'etablissement (effectifs, personnel, classes)
- **Risque** : lecture
- **Permission d'entrée** : `statistique:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `statistiquesEtablissement`
- **Paramètres** : aucun
- **Entités résolues automatiquement** : aucune
- **Exécution** : appel `statistiquesEtablissement`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : co-08, el-07, mt-07, pi-01, pi-08

## Domaine : scolarite

### `referentiel.periodes`

- **Intention** : periodes (trimestres) de l'annee scolaire, avec leurs dates et l'etat de la saisie des notes
- **Risque** : lecture
- **Permission d'entrée** : `assiduite:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `listerPeriodes`
- **Paramètres** : aucun
- **Entités résolues automatiquement** : aucune
- **Exécution** : appel `listerPeriodes`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : pi-07

### `referentiel.series`

- **Intention** : series du second cycle (A, C, D...) avec leur description
- **Risque** : lecture
- **Permission d'entrée** : `classe:lire` (le backend revérifie, et peut exiger davantage)
- **Opération backend** : `listerSeries`
- **Paramètres** : aucun
- **Entités résolues automatiquement** : aucune
- **Exécution** : appel `listerSeries`
- **Vérification** : comparaison à l'oracle SQL dans le banc
- **Rendu** : mis en forme
- **Scénarios** : cl-08

## Couverture

Tous les outils du registre sont visés par au moins un scénario.

## Ce que l'agent ne sait pas faire

Constaté à l'audit du registre et du backend — ces capacités existent dans l'interface web, pas (ou pas encore) pour l'agent :

- **Notes** : saisir ou corriger une note, créer une évaluation, générer ou publier un bulletin.
- **Finances** : enregistrer ou annuler un paiement, accorder une exonération, relancer une échéance.
- **Documents** : déposer, vérifier ou lister les pièces manquantes par élève (la table `pieces_dossier` n'a ni service ni colonnes de vérification) ; lister les dossiers incomplets.
- **Parents** : inviter à l'application, générer un code d'accès (ces parcours envoient un SMS).
- **Notifications** : consulter l'historique de livraison, connaître le consentement SMS parent par parent hors devis.
- **Discipline** : déclarer un incident, prononcer une sanction, convoquer un conseil.
- **Scolarité** : réinscription d'une année sur l'autre, passage d'année, conseil de classe.
- **Personnel** : créer ou modifier un enseignant, une affectation, un emploi du temps ; gérer rôles et permissions.

Pour ces demandes l'agent doit le DIRE, sans improviser : c'est éprouvé par les scénarios `co-06` et `co-07`.
