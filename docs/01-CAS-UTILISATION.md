# 01 — Catalogue des cas d'utilisation

**Lycée Guergné La Renaissance** — 6ème → Terminale
Chaque cas porte un identifiant stable `UC-xxx` réutilisé dans le code, les tests et la roadmap.

---

## 1. Acteurs du système

| Code | Acteur | Portée | Canal |
|------|--------|--------|-------|
| `SUPER_ADMIN` | Super administrateur (éditeur / mainteneur) | Tout, y compris configuration technique et journal d'audit | Web |
| `DIRECTION` | Proviseur / Directeur | Tout le périmètre métier, validation des décisions graves | Web |
| `CENSEUR` | Censeur / Directeur des études | Pédagogie : classes, matières, notes, bulletins, conseils de classe | Web |
| `SURVEILLANT` | Surveillant général / Vie scolaire | Assiduité, retards, discipline, conduite | Web (+ saisie rapide mobile v2) |
| `SECRETARIAT` | Secrétariat / Scolarité | Dossiers élèves, inscriptions, transferts, documents | Web |
| `COMPTABLE` | Comptable / Économat | Frais de scolarité, tranches, encaissements, relances | Web |
| `ENSEIGNANT` | Professeur | Ses classes et ses matières uniquement | Web (+ mobile v2) |
| `PARENT` | Parent / Tuteur légal | Ses enfants uniquement | **Mobile Flutter** (+ web en lecture) |
| `ELEVE` | Élève | Son propre dossier — **v2** | Mobile |

**Règle d'or de sécurité :** un acteur ne voit jamais au-delà de son périmètre. Un enseignant ne
consulte pas les notes d'une classe qui ne lui est pas affectée ; un parent ne voit que ses enfants
rattachés. Cette règle est appliquée côté serveur, pas côté interface (cf. `02-ARCHITECTURE.md` §5).

---

## 2. Module A — Référentiel & année scolaire

| ID | Cas d'utilisation | Acteurs | Détail |
|----|-------------------|---------|--------|
| UC-A01 | Créer une année scolaire | DIRECTION, CENSEUR | Ex. « 2026-2027 », dates de début/fin, année courante |
| UC-A02 | Définir les périodes | CENSEUR | 3 trimestres (ou 2 semestres) avec dates d'ouverture/clôture de saisie |
| UC-A03 | Verrouiller / déverrouiller une période | CENSEUR, DIRECTION | Après clôture, plus aucune note modifiable sans déverrouillage tracé |
| UC-A04 | Gérer les niveaux | CENSEUR | 6ème, 5ème, 4ème, 3ème, 2nde, 1ère, Terminale |
| UC-A05 | Gérer les séries | CENSEUR | A (A1/A4), C, D, G — applicables à partir de la 2nde |
| UC-A06 | Gérer les matières | CENSEUR | Français, Maths, PC, SVT, HG, Anglais, Arabe, Philosophie, EPS, ECM, Informatique… |
| UC-A07 | Définir les coefficients par niveau/série | CENSEUR | Un même intitulé de matière a des coefficients différents en 2nde A et en Terminale C |
| UC-A08 | Gérer les salles | SECRETARIAT | Capacité, type (classe, labo, salle informatique) |
| UC-A09 | Configurer l'établissement | DIRECTION | Nom, logo, en-tête des bulletins, signataires, cachet, devise (FCFA) |
| UC-A10 | Dupliquer la configuration d'une année sur la suivante | CENSEUR | Reprise des matières, coefficients, classes — gain de temps à la rentrée |

---

## 3. Module B — Inscriptions, réinscriptions, mouvements

| ID | Cas d'utilisation | Acteurs | Détail |
|----|-------------------|---------|--------|
| UC-B01 | **Inscrire** un nouvel élève | SECRETARIAT | Dossier complet : état civil, lieu/date de naissance, sexe, nationalité, photo, école d'origine, pièces jointes (acte de naissance, bulletin précédent, certificat de transfert) |
| UC-B02 | Générer le matricule | Système | Format `LGR-{année}-{séquence}`, unique et immuable |
| UC-B03 | Rattacher un ou plusieurs tuteurs | SECRETARIAT | Père / mère / tuteur — avec lien de parenté, téléphone, profession, tuteur principal, autorisation de retrait |
| UC-B04 | **Réinscrire** un élève (année suivante) | SECRETARIAT | Reprise du dossier, affectation au niveau supérieur ou redoublement |
| UC-B05 | Affecter un élève à une classe | SECRETARIAT, CENSEUR | Contrôle de la capacité maximale de la classe |
| UC-B06 | Changer un élève de classe en cours d'année | CENSEUR | Motif obligatoire, historisé ; les notes déjà saisies suivent l'élève |
| UC-B07 | **Transférer** un élève vers un autre établissement | SECRETARIAT, DIRECTION | Édition du certificat de transfert + bulletin de sortie ; statut → `TRANSFERE` |
| UC-B08 | Enregistrer une **arrivée en cours d'année** | SECRETARIAT | Reprise des moyennes de l'établissement d'origine (optionnel) |
| UC-B09 | Enregistrer un **abandon** | SECRETARIAT | Statut → `ABANDON`, date et motif |
| UC-B10 | Rechercher un élève | Tous (selon périmètre) | Par matricule, nom, classe, statut — recherche instantanée |
| UC-B11 | Importer une promotion depuis Excel/CSV | SECRETARIAT | Import en masse à la rentrée, avec rapport d'erreurs ligne à ligne |
| UC-B12 | Consulter le dossier complet d'un élève | SECRETARIAT, DIRECTION, CENSEUR | Vue 360° : identité, tuteurs, scolarité, notes, absences, discipline, finances |

---

## 4. Module C — Statuts de l'élève (suspension, exclusion, réactivation)

| ID | Cas d'utilisation | Acteurs | Détail |
|----|-------------------|---------|--------|
| UC-C01 | **Suspendre** un élève | SURVEILLANT + DIRECTION | Exclusion temporaire : durée, motif, date de retour prévue. L'élève reste inscrit. |
| UC-C02 | **Réactiver** un élève suspendu | DIRECTION, SURVEILLANT | Retour effectif, traçabilité de la décision |
| UC-C03 | **Exclure définitivement** un élève | DIRECTION uniquement | Décision de conseil de discipline, motif obligatoire, notification aux tuteurs |
| UC-C04 | Suspendre pour **impayés** | COMPTABLE + DIRECTION | Statut distinct de la suspension disciplinaire ; levée automatique au paiement |
| UC-C05 | Consulter l'historique des statuts | DIRECTION, SECRETARIAT | Chronologie complète, qui a décidé quoi et quand |
| UC-C06 | Notifier les tuteurs d'un changement de statut | Système | Push + SMS de repli |

**Statuts possibles :** `INSCRIT` · `SUSPENDU_DISCIPLINE` · `SUSPENDU_IMPAYE` · `EXCLU` · `TRANSFERE` · `ABANDON` · `DIPLOME` · `PRE_INSCRIT`

---

## 5. Module D — Structure pédagogique & emploi du temps

| ID | Cas d'utilisation | Acteurs | Détail |
|----|-------------------|---------|--------|
| UC-D01 | Créer une classe | CENSEUR | Niveau + série + libellé (ex. « Terminale D2 »), capacité, professeur principal |
| UC-D02 | Affecter un enseignant à (classe × matière) | CENSEUR | Base de tout le contrôle d'accès enseignant |
| UC-D03 | Désigner le professeur principal | CENSEUR | Il signe l'appréciation générale du bulletin |
| UC-D04 | Construire l'emploi du temps | CENSEUR | Grille hebdomadaire : jour, créneau, matière, enseignant, salle |
| UC-D05 | Détecter les conflits d'emploi du temps | Système | Enseignant ou salle doublement occupés → blocage à la saisie |
| UC-D06 | Consulter l'emploi du temps | Tous | Vue classe / vue enseignant / vue salle |
| UC-D07 | Publier l'emploi du temps aux parents | CENSEUR | Devient visible dans l'app mobile |
| UC-D08 | Gérer le calendrier scolaire | CENSEUR | Vacances, jours fériés, examens blancs, compositions |

---

## 6. Module E — Évaluations & notes

| ID | Cas d'utilisation | Acteurs | Détail |
|----|-------------------|---------|--------|
| UC-E01 | Créer une évaluation | ENSEIGNANT | Type, matière, classe, date, barème (/20 par défaut), pondération |
| UC-E02 | **Saisir les notes** en masse | ENSEIGNANT | Grille classe entière, saisie clavier rapide, absent = `ABS`, non noté = vide |
| UC-E03 | Modifier une note avant clôture | ENSEIGNANT | Chaque modification est journalisée (ancienne valeur, nouvelle, auteur, horodatage) |
| UC-E04 | Verrouiller les notes d'une période | CENSEUR | Après cette action, l'enseignant ne peut plus modifier |
| UC-E05 | Calculer la moyenne d'une matière | Système | `(Σ notes interro × poids + composition × poids) / Σ poids` — formule configurable |
| UC-E06 | Calculer la moyenne générale | Système | `Σ (moyenne matière × coefficient) / Σ coefficients` |
| UC-E07 | Calculer le **rang** de l'élève | Système | Rang dans la classe, avec gestion des ex æquo |
| UC-E08 | Calculer les statistiques de classe | Système | Moyenne de classe, plus forte, plus faible, écart-type, taux de réussite (≥ 10/20) |
| UC-E09 | Consulter le relevé de notes d'un élève | ENSEIGNANT, CENSEUR, PARENT | Détail par matière et par évaluation |
| UC-E10 | Saisir l'appréciation par matière | ENSEIGNANT | Texte libre + appréciation codifiée |
| UC-E11 | Détecter les notes manquantes | CENSEUR | Tableau de bord « qui n'a pas encore saisi » avant le conseil de classe |
| UC-E12 | Importer des notes depuis Excel | ENSEIGNANT | Gabarit téléchargeable pré-rempli avec la liste de la classe |

**Types d'évaluation :** `INTERROGATION` · `DEVOIR` · `COMPOSITION` · `EXAMEN_BLANC` · `TP` · `ORAL`

---

## 7. Module F — Bulletins & conseil de classe

| ID | Cas d'utilisation | Acteurs | Détail |
|----|-------------------|---------|--------|
| UC-F01 | Générer les bulletins d'une classe | CENSEUR | Génération en lot, PDF conforme à l'en-tête de l'établissement |
| UC-F02 | Prévisualiser un bulletin | CENSEUR, DIRECTION | Avant publication |
| UC-F03 | Saisir l'appréciation générale | ENSEIGNANT (prof. principal) | Une par élève et par période |
| UC-F04 | Tenir le **conseil de classe** | CENSEUR, DIRECTION | Écran dédié : liste des élèves, moyennes, rangs, absences, décision pour chacun |
| UC-F05 | Attribuer une **mention** | Conseil de classe | Félicitations · Encouragements · Tableau d'honneur · Avertissement travail · Avertissement conduite · Blâme |
| UC-F06 | **Publier** les bulletins aux parents | DIRECTION | Bascule explicite : tant que non publié, invisible côté mobile |
| UC-F07 | Télécharger un bulletin en PDF | PARENT, SECRETARIAT | Depuis le mobile ou le web |
| UC-F08 | Éditer le bulletin annuel | CENSEUR | Synthèse des 3 trimestres + moyenne annuelle |
| UC-F09 | Prononcer la **décision de fin d'année** | DIRECTION | Admis en classe supérieure · Redouble · Exclu · Réorienté |
| UC-F10 | Éditer le **procès-verbal** du conseil de classe | CENSEUR | PDF signé, archivé |
| UC-F11 | Éditer le **palmarès** / tableau d'honneur | CENSEUR | Classement de la classe ou du niveau |

**Contenu du bulletin :** en-tête établissement · identité et matricule de l'élève · classe et effectif ·
période · tableau (matière, coefficient, notes, moyenne, moyenne de classe, min, max, rang, appréciation,
professeur) · moyenne générale · rang · moyenne de la classe · assiduité (heures d'absence justifiées et
non justifiées, retards) · conduite · appréciation générale · mention · décision · signatures.

---

## 8. Module G — Assiduité (absences & retards)

| ID | Cas d'utilisation | Acteurs | Détail |
|----|-------------------|---------|--------|
| UC-G01 | Faire l'appel d'un cours | ENSEIGNANT | Un clic par élève, pré-rempli « présent » |
| UC-G02 | Saisir une absence à la journée | SURVEILLANT | Absence longue sans passer cours par cours |
| UC-G03 | Enregistrer un **retard** | SURVEILLANT | Heure d'arrivée, motif |
| UC-G04 | **Justifier** une absence | SURVEILLANT, SECRETARIAT | Motif, pièce jointe (certificat médical), auteur de la justification |
| UC-G05 | Notifier immédiatement les parents | Système | Push + SMS le jour même — **fonction la plus attendue par les familles** |
| UC-G06 | Consulter le cumul d'absences | Tous (selon périmètre) | Heures justifiées / non justifiées, par période et par matière |
| UC-G07 | Alerter au-delà d'un seuil | Système | Ex. > 12 h non justifiées → alerte automatique au surveillant général |
| UC-G08 | Éditer le relevé d'assiduité | SURVEILLANT | Par élève, classe ou niveau |
| UC-G09 | Suivre l'absentéisme des enseignants | CENSEUR, DIRECTION | Cours non assurés, remplacements |
| UC-G10 | Signaler une sortie anticipée | SURVEILLANT | Avec autorisation du tuteur |

---

## 9. Module H — Discipline & conduite

| ID | Cas d'utilisation | Acteurs | Détail |
|----|-------------------|---------|--------|
| UC-H01 | Enregistrer un incident | ENSEIGNANT, SURVEILLANT | Date, lieu, description, gravité, témoins |
| UC-H02 | Prononcer une sanction | SURVEILLANT, DIRECTION | Avertissement oral/écrit · retenue · travail d'intérêt général · exclusion temporaire · conseil de discipline |
| UC-H03 | Convoquer un conseil de discipline | DIRECTION | Convocation PDF des tuteurs |
| UC-H04 | Enregistrer la décision du conseil | DIRECTION | Peut déclencher UC-C01 ou UC-C03 |
| UC-H05 | Attribuer la **note de conduite** | SURVEILLANT | /20 par période, reportée sur le bulletin |
| UC-H06 | Notifier les parents d'un incident | Système | Push + SMS |
| UC-H07 | Consulter le dossier disciplinaire | DIRECTION, SURVEILLANT, PARENT (le sien) | Historique complet |
| UC-H08 | Éditer les statistiques de discipline | DIRECTION | Par classe, par type d'incident, évolution |

---

## 10. Module I — Devoirs, ressources & travail personnel

| ID | Cas d'utilisation | Acteurs | Détail |
|----|-------------------|---------|--------|
| UC-I01 | Publier un devoir à faire | ENSEIGNANT | Matière, classe, énoncé, date de remise, pièce jointe |
| UC-I02 | Consulter les devoirs à venir | PARENT, ELEVE | Vue calendrier dans l'app mobile |
| UC-I03 | Publier un support de cours | ENSEIGNANT | PDF, image |
| UC-I04 | Annoncer une composition | ENSEIGNANT, CENSEUR | Calendrier des compositions visible des familles |
| UC-I05 | Suivre le cahier de textes | ENSEIGNANT, CENSEUR | Contenu réellement traité par séance |
| UC-I06 | Contrôler la progression pédagogique | CENSEUR | Comparaison programme prévu / traité |

---

## 11. Module J — Communication

| ID | Cas d'utilisation | Acteurs | Détail |
|----|-------------------|---------|--------|
| UC-J01 | Publier une annonce générale | DIRECTION, SECRETARIAT | Toute l'école, un niveau, une classe |
| UC-J02 | Envoyer un message ciblé | DIRECTION, CENSEUR, ENSEIGNANT | À un tuteur, une classe, un groupe |
| UC-J03 | Recevoir une notification push | PARENT | Note publiée, absence, bulletin, échéance de paiement |
| UC-J04 | **Repli SMS** si l'app n'est pas installée | Système | Décision structurante : beaucoup de tuteurs n'ont pas de smartphone |
| UC-J05 | Convoquer un tuteur | DIRECTION, SURVEILLANT | Convocation PDF + notification |
| UC-J06 | Accuser réception d'une communication | PARENT | La direction voit qui a lu |
| UC-J07 | Diffuser le calendrier des événements | SECRETARIAT | Rentrée, compositions, réunions de parents, congés |
| UC-J08 | Consulter l'historique des échanges | DIRECTION | Journal complet |

---

## 12. Module K — Finances (frais de scolarité)

| ID | Cas d'utilisation | Acteurs | Détail |
|----|-------------------|---------|--------|
| UC-K01 | Définir la grille tarifaire | COMPTABLE, DIRECTION | Par niveau : inscription, scolarité, APE, tenue, examens — en FCFA |
| UC-K02 | Définir les tranches de paiement | COMPTABLE | Généralement 3 échéances, avec dates limites |
| UC-K03 | Générer les échéanciers | Système | À l'inscription / réinscription |
| UC-K04 | Enregistrer un encaissement | COMPTABLE | Espèces, mobile money, virement, chèque — avec référence |
| UC-K05 | Éditer un **reçu** | COMPTABLE | PDF numéroté, remis au tuteur |
| UC-K06 | Consulter le solde d'un élève | COMPTABLE, DIRECTION, PARENT | Payé / restant dû / en retard |
| UC-K07 | Lister les impayés | COMPTABLE | Filtres par classe, par ancienneté du retard |
| UC-K08 | Relancer les familles | COMPTABLE | Push + SMS automatiques avant et après échéance |
| UC-K09 | Accorder une **exonération** ou une remise | DIRECTION | Bourse, fratrie, cas social — motif obligatoire |
| UC-K10 | Suivre les recettes | DIRECTION, COMPTABLE | Encaissé par période, par classe, par nature de frais |
| UC-K11 | Bloquer le bulletin en cas d'impayé | DIRECTION | **Option** activable/désactivable dans la configuration |
| UC-K12 | Exporter la comptabilité | COMPTABLE | CSV / Excel |

---

## 13. Module L — Documents & attestations

| ID | Cas d'utilisation | Acteurs | Détail |
|----|-------------------|---------|--------|
| UC-L01 | Éditer un **certificat de scolarité** | SECRETARIAT | PDF signé |
| UC-L02 | Éditer un **certificat de transfert** | SECRETARIAT | Pour changement d'établissement |
| UC-L03 | Éditer une **attestation de fréquentation** | SECRETARIAT | |
| UC-L04 | Éditer une **carte scolaire** | SECRETARIAT | Avec photo et matricule |
| UC-L05 | Éditer la **liste d'appel** d'une classe | SURVEILLANT | PDF imprimable |
| UC-L06 | Éditer les **listes d'examen** | SECRETARIAT | Répartition par salle, numéro de table |
| UC-L07 | Archiver une pièce au dossier | SECRETARIAT | Acte de naissance, bulletins antérieurs, certificat médical |
| UC-L08 | Numéroter et journaliser chaque document émis | Système | Traçabilité : qui a émis quoi, quand, pour qui |

---

## 14. Module M — Pilotage & statistiques

| ID | Cas d'utilisation | Acteurs | Détail |
|----|-------------------|---------|--------|
| UC-M01 | Tableau de bord direction | DIRECTION | Effectifs, taux de présence, taux de recouvrement, moyennes par niveau |
| UC-M02 | Effectifs par classe, niveau, sexe | DIRECTION, SECRETARIAT | Avec évolution |
| UC-M03 | Analyse des résultats par matière | CENSEUR | Identifier les matières en difficulté |
| UC-M04 | Comparer les classes d'un même niveau | CENSEUR, DIRECTION | |
| UC-M05 | Suivre l'évolution d'un élève | ENSEIGNANT, PARENT | Courbe des moyennes sur les 3 trimestres |
| UC-M06 | Statistiques d'assiduité | SURVEILLANT, DIRECTION | Taux d'absentéisme par classe |
| UC-M07 | Taux de réussite / redoublement / abandon | DIRECTION | Indicateurs de fin d'année |
| UC-M08 | Exporter un rapport | DIRECTION | PDF / Excel, pour le ministère ou les partenaires |

---

## 15. Module N — Administration système

| ID | Cas d'utilisation | Acteurs | Détail |
|----|-------------------|---------|--------|
| UC-N01 | Créer un compte utilisateur | SUPER_ADMIN, DIRECTION | Avec rôle et périmètre |
| UC-N02 | Activer / désactiver un compte | SUPER_ADMIN, DIRECTION | Départ d'un agent → coupure immédiate |
| UC-N03 | Réinitialiser un mot de passe | SUPER_ADMIN | Lien à usage unique |
| UC-N04 | Gérer les rôles et permissions | SUPER_ADMIN | Matrice rôle × ressource × action |
| UC-N05 | Consulter le **journal d'audit** | SUPER_ADMIN, DIRECTION | Toute modification sensible : note, statut, paiement, sanction |
| UC-N06 | Inviter un tuteur sur l'app mobile | SECRETARIAT | Code d'activation lié au numéro de téléphone |
| UC-N07 | Sauvegarder / restaurer la base | SUPER_ADMIN | Export périodique hors plateforme |
| UC-N08 | Clôturer l'année scolaire | DIRECTION | Archivage, passage à l'année suivante |

---

## 16. Parcours mobile parent (application Flutter)

Le parent est l'utilisateur le plus nombreux et le moins technicien. Son application est délibérément
**réduite à l'essentiel, rapide et utilisable hors ligne**.

| ID | Écran / parcours | Contenu |
|----|------------------|---------|
| UC-P01 | Activation du compte | Numéro de téléphone + code reçu par SMS. Pas de mot de passe à retenir à la première ouverture. |
| UC-P02 | Sélecteur d'enfant | Bascule immédiate si plusieurs enfants scolarisés |
| UC-P03 | Accueil | Moyenne du trimestre, rang, absences du mois, prochaine échéance de paiement, dernières annonces |
| UC-P04 | Notes | Par matière, avec le détail des évaluations et l'appréciation du professeur |
| UC-P05 | Bulletins | Consultation et **téléchargement PDF**, conservé hors ligne |
| UC-P06 | Assiduité | Absences et retards, statut justifié / non justifié |
| UC-P07 | Discipline | Incidents, sanctions, note de conduite |
| UC-P08 | Emploi du temps | Grille de la semaine |
| UC-P09 | Devoirs | Travaux à rendre et compositions à venir |
| UC-P10 | Paiements | Échéancier, montant restant dû, historique des reçus |
| UC-P11 | Messages | Annonces de l'école et messages ciblés |
| UC-P12 | Notifications | Push temps réel ; historique consultable |
| UC-P13 | Mode hors ligne | Toute donnée déjà consultée reste lisible sans réseau ; synchronisation au retour du signal |
| UC-P14 | Multi-langue | Français (arabe en v2) |

---

## 17. Contraintes non fonctionnelles

| Contrainte | Exigence |
|------------|----------|
| **Réseau** | Le Tchad connaît des connexions 2G/3G instables. L'app mobile doit être pleinement consultable hors ligne ; le web doit rester utilisable sous 200 kb/s. |
| **Coupures de courant** | Aucune donnée perdue en cas de déconnexion brutale pendant une saisie de notes (brouillon local). |
| **Parc téléphonique** | Android majoritaire, souvent en version ancienne → cible **Android 7+**, APK léger. |
| **Parents sans smartphone** | Le SMS est un canal de premier plan, pas un accessoire. |
| **Coût** | Zéro coût d'infrastructure en régime de croisière (Neon + Northflank + FCM gratuits). Seul le SMS est facturable. |
| **Volumétrie cible** | ~1 500 élèves, ~80 enseignants, ~2 500 tuteurs, ~250 000 notes par an. Tient largement dans 0,5 Go. |
| **Langue** | Interface, données et documents en français. |
| **Sauvegarde** | Export hebdomadaire automatique hors plateforme. |
| **Traçabilité** | Toute modification de note, de statut ou de paiement est journalisée et non répudiable. |
