# Inventaire des fonctionnalités réelles

Extrait **du code source** par `agent/scripts/audit-plateforme.mjs` — aucune
fonctionnalité déduite d'un menu ou supposée.

- **150 actions serveur** réparties dans 42 fichiers
- **28 routes d'API**
- **123 fonctions de service** dans 31 modules de domaine
- **78 permissions** déclarées, dont **42** effectivement exigées dans le code

## Actions serveur, par module

| Fichier | Fonction | Permission exigée |
|---|---|---|
| `web/src/app/(main)/auth/actions.ts` | `connexion` | — |
| `web/src/app/(main)/auth/actions.ts` | `deconnexion` | — |
| `web/src/app/(main)/auth/actions.ts` | `changerMotDePasse` | — |
| `web/src/app/(main)/auth/reinitialisation/actions.ts` | `demanderReinitialisation` | — |
| `web/src/app/(main)/auth/reinitialisation/actions.ts` | `confirmerReinitialisation` | — |
| `assiduite/actions.ts` | `enregistrerAppel` | `assiduite:saisir` |
| `assiduite/actions.ts` | `supprimerAbsence` | `assiduite:saisir` |
| `assiduite/actions.ts` | `enregistrerRetard` | `retard:saisir` |
| `assiduite/actions.ts` | `signalerIncident` | `discipline:signaler` |
| `assiduite/actions.ts` | `prononcerSanction` | — |
| `assiduite/actions.ts` | `marquerSanctionExecutee` | `discipline:sanctionner` |
| `assiduite/actions.ts` | `justifierEnLot` | `assiduite:justifier` |
| `bulletins/actions-blocage.ts` | `leverBlocage` | `finance:exonerer` |
| `bulletins/actions-blocage.ts` | `retablirBlocage` | `finance:exonerer` |
| `bulletins/actions-blocage.ts` | `definirReglageBlocage` | `finance:configurer` |
| `bulletins/actions-conseil.ts` | `enregistrerAvis` | `bulletin:generer` |
| `bulletins/actions-conseil.ts` | `publierClasse` | `bulletin:publier` |
| `bulletins/actions-conseil.ts` | `depublierClasse` | `bulletin:publier` |
| `bulletins/actions.ts` | `genererPourClasse` | `bulletin:generer` |
| `classes/eleves-actions.ts` | `rechercherElevesClasses` | `classe:lire`, `eleve:lire` |
| `communication/actions.ts` | `publierAnnonce` | `annonce:publier` |
| `communication/actions.ts` | `basculerAnnonce` | `annonce:publier` |
| `communication/actions.ts` | `epinglerAnnonce` | `annonce:publier` |
| `communication/actions.ts` | `envoyerMessage` | `message:envoyer` |
| `communication/actions.ts` | `marquerMessageLu` | `message:lire` |
| `communication/actions.ts` | `traiterFileNotifications` | `notification:configurer` |
| `discipline/actions-conduite.ts` | `enregistrerConduite` | `discipline:sanctionner` |
| `discipline/actions-conseil.ts` | `convoquerConseil` | `conseil_discipline:convoquer` |
| `discipline/actions-conseil.ts` | `enregistrerDeliberation` | `conseil_discipline:convoquer` |
| `discipline/actions-conseil.ts` | `annulerConvocation` | `conseil_discipline:convoquer` |
| `eleves/actions-import.ts` | `analyserFichierEleves` | `eleve:inscrire` |
| `eleves/actions-import.ts` | `importerEleves` | `eleve:inscrire` |
| `eleves/actions-lot.ts` | `changerClasseEnLot` | `eleve:affecter` |
| `eleves/actions-reinscription.ts` | `preparerReinscription` | `eleve:creer` |
| `eleves/actions-reinscription.ts` | `reinscrire` | `eleve:creer` |
| `eleves/actions.ts` | `inscrireEleve` | `eleve:inscrire` |
| `eleves/actions.ts` | `rechercherParentsInscription` | `eleve:inscrire` |
| `eleves/actions.ts` | `validerDossier` | `eleve:inscrire` |
| `eleves/actions.ts` | `changerClasse` | `eleve:affecter` |
| `eleves/actions.ts` | `changerStatut` | — |
| `eleves/actions.ts` | `rattacherTuteur` | `tuteur:gerer` |
| `eleves/actions.ts` | `detacherTuteur` | `tuteur:gerer` |
| `eleves/actions.ts` | `chargerDossierPourModification` | `eleve:modifier` |
| `eleves/actions.ts` | `modifierEleve` | `eleve:modifier` |
| `eleves/actions.ts` | `rechercherTuteurParTelephone` | `tuteur:gerer` |
| `eleves/[id]/photo-actions.ts` | `definirPhotoEleve` | `eleve:modifier` |
| `eleves/[id]/photo-actions.ts` | `retirerPhotoEleve` | `eleve:modifier` |
| `eleves/[id]/photo-actions.ts` | `definirPhotoEnseignant` | `utilisateur:modifier` |
| `eleves/[id]/photo-actions.ts` | `retirerPhotoEnseignant` | `utilisateur:modifier` |
| `eleves/_components/apercu-eleve-actions.ts` | `chargerApercuEleve` | `eleve:lire` |
| `emploi-du-temps/actions-deplacement.ts` | `deplacerCours` | `emploi_du_temps:gerer` |
| `emploi-du-temps/actions-remplacement.ts` | `declarerRemplacement` | `emploi_du_temps:gerer` |
| `emploi-du-temps/actions-remplacement.ts` | `annulerRemplacement` | `emploi_du_temps:gerer` |
| `emploi-du-temps/calendrier/actions.ts` | `creerEvenementCalendrier` | `emploi_du_temps:gerer` |
| `emploi-du-temps/calendrier/actions.ts` | `modifierEvenementCalendrier` | `emploi_du_temps:gerer` |
| `emploi-du-temps/calendrier/actions.ts` | `validerEvenementCalendrier` | `emploi_du_temps:gerer` |
| `emploi-du-temps/calendrier/actions.ts` | `publierEvenementCalendrier` | `emploi_du_temps:gerer` |
| `emploi-du-temps/calendrier/actions.ts` | `annulerEvenementCalendrier` | `emploi_du_temps:gerer` |
| `finances/actions.ts` | `definirTarif` | `finance:configurer` |
| `finances/actions.ts` | `supprimerTarif` | `finance:configurer` |
| `finances/actions.ts` | `definirTranche` | `finance:configurer` |
| `finances/actions.ts` | `genererEcheanciers` | `finance:configurer` |
| `finances/actions.ts` | `encaisser` | `finance:encaisser` |
| `finances/actions.ts` | `annulerPaiement` | `finance:encaisser` |
| `finances/actions.ts` | `exonerer` | `finance:exonerer` |
| `notes/actions-import.ts` | `analyserFichierNotes` | `note:saisir` |
| `notes/actions-import.ts` | `importerNotes` | `note:saisir` |
| `notes/actions.ts` | `creerEvaluation` | `evaluation:creer` |
| `notes/actions.ts` | `changerStatutEvaluation` | — |
| `notes/actions.ts` | `basculerVerrouEvaluation` | `periode:verrouiller` |
| `notes/actions.ts` | `enregistrerNotes` | `note:saisir` |
| `notes/actions.ts` | `dupliquerEvaluation` | `evaluation:creer` |
| `notes/appreciations/actions.ts` | `enregistrerAppreciations` | `note:saisir` |
| `parametres/actions.ts` | `creerAnnee` | `annee:cloturer` |
| `parametres/actions.ts` | `definirAnneeCourante` | `annee:cloturer` |
| `parametres/actions.ts` | `cloturerAnnee` | `annee:cloturer` |
| `parametres/actions.ts` | `modifierPeriode` | `periode:verrouiller` |
| `parametres/actions.ts` | `basculerVerrouPeriode` | — |
| `parametres/actions.ts` | `creerSerie` | `matiere:gerer` |
| `parametres/actions.ts` | `modifierSerie` | `matiere:gerer` |
| `parametres/actions.ts` | `basculerSerie` | `matiere:gerer` |
| `parametres/actions.ts` | `creerMatiere` | `matiere:gerer` |
| `parametres/actions.ts` | `modifierMatiere` | `matiere:gerer` |
| `parametres/actions.ts` | `basculerMatiere` | `matiere:gerer` |
| `parametres/actions.ts` | `definirCoefficient` | `coefficient:gerer` |
| `parametres/actions.ts` | `copierCoefficients` | `coefficient:gerer` |
| `parametres/actions.ts` | `creerClasse` | `classe:creer` |
| `parametres/actions.ts` | `modifierClasse` | `classe:modifier` |
| `parametres/actions.ts` | `supprimerClasse` | `classe:modifier` |
| `parametres/etablissement/actions.ts` | `enregistrerIdentiteLycee` | `parametre:modifier` |
| `parametres/notifications/actions.ts` | `definirPolitique` | `notification:configurer` |
| `parametres/notifications/actions.ts` | `definirSeuilIncident` | `notification:configurer` |
| `parametres/parents/actions.ts` | `reglerValiditeInvitations` | `parametre:modifier` |
| `parents/actions-creation.ts` | `creerCompteParent` | `tuteur:gerer` |
| `parents/actions-creation.ts` | `rechercherEleves` | `tuteur:gerer` |
| `parents/actions-groupe.ts` | `apercuNotificationsGroupe` | `message:envoyer`, `tuteur:gerer` |
| `parents/actions-groupe.ts` | `envoyerNotificationsGroupe` | `message:envoyer`, `tuteur:gerer` |
| `parents/actions-invitations-classe.ts` | `previsualiserInvitationsClasse` | `tuteur:inviter` |
| `parents/actions-invitations-classe.ts` | `confirmerInvitationsClasse` | `tuteur:inviter` |
| `parents/actions-notification.ts` | `apercuNotificationParent` | `message:envoyer` |
| `parents/actions-notification.ts` | `envoyerNotificationParent` | `message:envoyer` |
| `parents/actions.ts` | `inviterTuteur` | `tuteur:inviter` |
| `parents/actions.ts` | `inviterClasse` | `tuteur:inviter` |
| `parents/actions.ts` | `renvoyerCode` | — |
| `parents/actions.ts` | `revoquerAcces` | `tuteur:gerer` |
| `parents/actions.ts` | `modifierCoordonnees` | `tuteur:gerer` |
| `parents/actions.ts` | `modifierProfilTuteur` | `tuteur:gerer` |
| `parents/actions.ts` | `supprimerTuteurOrphelin` | `tuteur:gerer` |
| `parents/familles/doublons/actions.ts` | `enregistrerExamenDoublon` | `tuteur:gerer`, `audit:lire` |
| `parents/[id]/actions.ts` | `programmerSmsParent` | `message:envoyer` |
| `parents/[id]/actions.ts` | `rattacherEnfantParent` | `tuteur:gerer`, `eleve:modifier` |
| `parents/[id]/actions.ts` | `mettreAJourRolesFamiliaux` | `tuteur:gerer`, `eleve:modifier` |
| `personnel/actions-compte.ts` | `creerCompteEnseignant` | `utilisateur:creer` |
| `personnel/actions-compte.ts` | `reinitialiserMotDePasse` | `utilisateur:creer` |
| `personnel/actions-compte.ts` | `basculerCompte` | `utilisateur:creer` |
| `personnel/actions-import.ts` | `analyserFichierEnseignants` | `utilisateur:creer` |
| `personnel/actions-import.ts` | `importerEnseignants` | `utilisateur:creer` |
| `personnel/actions-non-enseignants.ts` | `creerPersonnelNonEnseignant` | `utilisateur:creer` |
| `personnel/actions-non-enseignants.ts` | `modifierPersonnelNonEnseignant` | `utilisateur:creer` |
| `personnel/actions-non-enseignants.ts` | `basculerPersonnelNonEnseignant` | `utilisateur:desactiver` |
| `personnel/actions-non-enseignants.ts` | `creerComptePersonnel` | `utilisateur:creer` |
| `personnel/actions-non-enseignants.ts` | `gererComptePersonnel` | — |
| `personnel/actions.ts` | `creerEnseignant` | `utilisateur:creer` |
| `personnel/actions.ts` | `modifierEnseignant` | `utilisateur:modifier` |
| `personnel/actions.ts` | `basculerEnseignant` | `utilisateur:desactiver` |
| `personnel/actions.ts` | `definirSpecialite` | `affectation:gerer` |
| `personnel/actions.ts` | `retirerSpecialite` | `affectation:gerer` |
| `personnel/actions.ts` | `affecter` | `affectation:gerer` |
| `personnel/actions.ts` | `retirerAffectation` | `affectation:gerer` |
| `personnel/actions.ts` | `ajouterIndisponibilite` | `emploi_du_temps:gerer` |
| `personnel/actions.ts` | `retirerIndisponibilite` | `emploi_du_temps:gerer` |
| `personnel/actions.ts` | `creerSalle` | `parametre:modifier` |
| `personnel/actions.ts` | `basculerSalle` | `parametre:modifier` |
| `personnel/actions.ts` | `poserCours` | `emploi_du_temps:gerer` |
| `personnel/actions.ts` | `retirerCours` | `emploi_du_temps:gerer` |
| `personnel/actions.ts` | `publierEmploiDuTemps` | `emploi_du_temps:gerer` |
| `_actions/notifier-classe-canal.ts` | `apercuClasseCanal` | `message:envoyer` |
| `_actions/notifier-classe-canal.ts` | `notifierClasseCanal` | `message:envoyer` |
| `_actions/notifier-classe-canal.ts` | `apercuElevesCanal` | `message:envoyer` |
| `_actions/notifier-classe-canal.ts` | `notifierElevesCanal` | `message:envoyer` |
| `_actions/notifier.ts` | `apercuEleve` | `message:envoyer` |
| `_actions/notifier.ts` | `apercuClasse` | `message:envoyer` |
| `_actions/notifier.ts` | `notifierEleve` | `message:envoyer` |
| `_actions/notifier.ts` | `notifierClasse` | `message:envoyer` |
| `_actions/notifier.ts` | `apercuSelection` | `message:envoyer` |
| `_actions/notifier.ts` | `notifierSelection` | `message:envoyer` |
| `_actions/recherche.ts` | `rechercheGlobale` | — |
| `web/src/server/server-actions.ts` | `getValueFromCookie` | — |
| `web/src/server/server-actions.ts` | `setValueToCookie` | — |
| `web/src/server/server-actions.ts` | `getPreference` | — |

## Services de domaine

- `appreciations-travail.ts` : `libelleAppreciationTravail`
- `appreciations.ts` : `chargerAppreciationsClasse`, `avancementAppreciations`
- `assiduite-ecritures.ts` : `messagesZod`, `enregistrerAppelPour`, `supprimerAbsencePour`, `enregistrerRetardPour`, `justifierEnLotPour`
- `audit.ts` : `nettoyerFiltres`, `listerAudit`, `famillesAudit`, `acteursAudit`
- `bulletin-donnees.ts` : `appreciationMoyenne`, `chargerBulletin`
- `caisse.ts` : `libelleMode`, `journalDeCaisse`, `historiqueExonerations`, `reglageBlocage`, `blocagesBulletin`
- `calendrier-scolaire.ts` : `parserDateISO`, `jourSemaineISO`, `genererDatesCalendrier`, `evenementsPourDate`
- `communication.ts` : `listerAnnonces`, `listerMessages`, `etatFileNotifications`, `listerNotifications`, `listerElevesActifs`, `listerTuteursAvecCompte`
- `conseil-discipline.ts` : `listerConseils`, `dossierDiscipline`, `statistiquesDiscipline`
- `dossier-eleve.ts` : `chargerDossierScolarite`
- `dossier.ts` : `chargerDossierComplet`
- `doublons-parents.ts` : `listerGroupesNumerosPartages`, `comparerNumerosPartages`
- `eleves.ts` : `listerEleves`, `chargerDossier`, `listerAnneesEleves`, `statistiquesEleves`, `listerClassesCourantes`
- `emploi-du-temps.ts` : `controleHoraire`, `grilleImpression`
- `evaluations.ts` : `listerEvaluations`, `chargerGrilleSaisie`, `releveEleve`, `statistiquesEvaluation`, `calendrierEvaluations`
- `familles.ts` : `listerFamilles`
- `finances.ts` : `listerTarifs`, `listerTranches`, `listerSituations`, `listerEcheances`, `listerPaiements`, `statistiquesFinancieres`, `recouvrementParClasse`
- `generation-bulletins.ts` : `genererBulletins`, `saisiesManquantes`
- `horaires-scolaires.ts` : `chargerPlagesHorairesScolaires`
- `identite-lycee.ts` : `chargerIdentiteLycee`
- `mobile.ts` : `enfantsDuTuteur`, `releveDeLEleve`, `periodesDeLEleve`, `choisirPeriode`, `assiduiteDeLEleve`, `financesDeLEleve`, `annoncesDuTuteur`, `marquerAnnonceLue`, `emploiDuTempsDeLEleve`
- `notes.ts` : `arrondir`, `calculerMoyenneMatiere`, `calculerMoyenneGenerale`, `construireMoyenneMatiere`, `calculerRangs`, `calculerStatistiquesClasse`, `proposerMention`
- `parametres.ts` : `listerAnnees`, `listerPeriodes`, `listerSeries`, `listerNiveaux`, `listerMatieres`, `listerCoefficients`, `compterCoefficients`, `listerClassesAnnee`, `dureeInvitationJours`
- `parents.ts` : `construireFiltreTuteurs`, `listerTuteurs`, `statistiquesParents`, `tuteursDeLEleve`, `numeroTuteurDejaUtilise`, `telephoneDisponible`, `chargerDossierTuteur`
- `personnel-non-enseignant.ts` : `listerPersonnelNonEnseignant`
- `personnel.ts` : `listerEnseignants`, `chargerFicheEnseignant`, `listerCreneaux`, `chargerEmploiDuTemps`, `listerSalles`, `listerClassesEtMatieres`, `enseignantDeLAffectation`
- `pilotage.ts` : `indicateursCles`, `effectifsParNiveau`, `absencesParMois`, `moyennesParClasse`, `classementClasses`, `resultatsParMatiere`, `evolutionRecouvrement`, `alertes`
- `remplacements.ts` : `coursDuJour`, `enseignantsDisponibles`, `listerRemplacements`
- `suivi-notifications-parents.ts` : `lireSuiviParents`
- `tableau-de-bord.ts` : `chargerAnneeCourante`, `chargerStatistiques`, `etapesDemarrage`
- `vie-scolaire.ts` : `listerElevesClasse`, `listerAbsences`, `listerAlertes`, `listerRetards`, `listerIncidents`, `listerSanctions`, `statistiquesVieScolaire`, `chargerConduiteClasse`
