# P0 — Fondations critiques du calendrier scolaire et de l'emploi du temps

**Statut :** spécification initiale — aucune migration ni modification applicative n'est encore appliquée en production.  
**Dépôt :** `faycalhabibahmatalbachar/guergne`  
**Branche :** `codex/p0-calendrier-annuel-fondations`

## 1. Objectif

Faire du calendrier annuel la source de vérité des dates scolaires. La grille hebdomadaire reste un modèle réutilisable ; les jours réels et leurs exceptions déterminent quels cours doivent effectivement avoir lieu.

La fondation doit être définie avant l'implémentation, car la grille actuelle utilise un référentiel global de créneaux alors que le document fourni par le lycée prévoit des horaires différents selon les jours.

## 2. Source horaire fournie par le lycée

Les créneaux ci-dessous proviennent du document « Emploi du temps.docx » fourni pour ce chantier.

### Du lundi au jeudi

| Séance | Début | Fin |
|---|---:|---:|
| 1re heure | 07:00 | 08:00 |
| 2e heure | 08:00 | 09:00 |
| 3e heure | 09:00 | 10:00 |
| Récréation | 10:00 | 10:15 |
| 4e heure | 10:15 | 11:15 |
| 5e heure | 11:15 | 12:15 |

### Vendredi

| Séance | Début | Fin |
|---|---:|---:|
| 1re heure | 07:00 | 07:55 |
| 2e heure | 07:55 | 08:50 |
| 3e heure | 08:50 | 09:45 |
| Récréation | 09:45 | 10:00 |
| 4e heure | 10:00 | 10:55 |
| 5e heure | 10:55 | 11:50 |

### Règles de lecture à préserver

- La récréation est une pause, pas un cours, et ne doit pas être comptabilisée dans le volume horaire pédagogique.
- Les horaires du lundi au jeudi ne doivent pas être remplacés par ceux du vendredi, ni inversement.
- Le document ne précise pas l'organisation du samedi ni d'éventuels cours l'après-midi. Ces créneaux doivent donc rester **non configurés** jusqu'à validation par le lycée ; ne pas inventer une règle de fermeture.
- Les horaires fournis constituent la configuration initiale demandée, mais doivent ensuite être modifiables par une personne autorisée, avec historique des changements et date d'effet.

## 3. Constat technique initial

Le code consulté dans `main` comprend déjà :

- `annees_scolaires` avec dates de début et de fin ;
- `evenements_calendrier` avec catégories comme vacances, jour férié, composition, examen blanc, réunion, conseil de classe, rentrée et autre ;
- `creneaux_horaires`, référentiel global avec `ordre` unique et horaires de début/fin ;
- `emploi_du_temps`, qui rattache une grille hebdomadaire à un jour de semaine et à un créneau ;
- les vues hebdomadaires par classe, enseignant et salle ;
- une vue journalière et une première logique de remplacements ;
- un calendrier des évaluations séparé.

**Écart à résoudre :** les créneaux initialisés dans `db/migrations/0009_seed_referentiel.sql` utilisent des durées et horaires différents du document fourni et comprennent aussi des créneaux l'après-midi. La grille affiche une liste commune de créneaux pour plusieurs jours. Ce modèle ne représente pas fidèlement deux profils horaires différents sans évolution du modèle de données et de l'affichage.

## 4. Règles d'architecture proposées

### 4.1 Année scolaire et génération des dates

- Toute année scolaire possède des dates de début et de fin validées.
- La vue annuelle génère chaque date dans cet intervalle, en respectant l'ordre réel des jours, les fins de mois et les années bissextiles.
- L'année courante est un choix par défaut, jamais une contrainte qui interdit de consulter une année future ou archivée.
- La génération est idempotente : la relancer ne duplique pas les événements ni les cours.
- Une année future peut être préparée sans modifier l'année en cours.

### 4.2 Calendrier et événements

- Réutiliser `evenements_calendrier` après audit de ses usages ; ne pas créer une deuxième table concurrente pour les mêmes événements.
- Distinguer l'événement informatif de l'événement qui bloque les cours.
- Pour chaque événement, prévoir une portée (établissement, niveau, classe, si pertinent enseignants), un intervalle inclusif, une règle d'effet, un état de validation et des informations de provenance.
- Les événements officiels (jours fériés et décisions de calendrier scolaire) doivent conserver la source, la date de vérification et l'auteur de validation. Ne jamais déduire une date officielle non publiée.
- Un changement de calendrier ne supprime pas silencieusement une séance récurrente : il produit une exception datée, une alerte ou une opération de report clairement traçable.
- Les exceptions ponctuelles peuvent suspendre une journée, un cours ou une plage horaire ; une réouverture exceptionnelle doit être explicitement autorisée.
- Les événements multi-jours s'affichent sur chacune des dates concernées et gardent une fiche unique.

### 4.3 Profils horaires par jour

- Introduire des profils ou règles horaires configurables par jour de semaine et, si nécessaire, par période de validité dans l'année.
- Chaque profil distingue les séances de cours des pauses et définit l'ordre, le début, la fin et le libellé.
- La grille de planning doit rendre les plages propres à chaque colonne/jour ; elle ne doit plus imposer un unique tableau de créneaux identiques à tous les jours lorsque les horaires diffèrent.
- Préserver une migration des créneaux existants et des emplois du temps déjà enregistrés ; aucun effacement destructif ni changement silencieux des cours publiés.
- Les contrôles de conflits utilisent les intervalles temporels réels et les durées des séances, pas seulement un numéro de créneau.
- Le modèle doit supporter une évolution ultérieure des horaires en cours d'année avec une date d'effet, sans réécrire l'historique.

### 4.4 Affichage et publication

- Prévoir les vues année, mois, semaine datée, journée et liste chronologique.
- Afficher les libellés d'événements directement sur les dates/cartes concernées, avec une légende et un statut compréhensible.
- Sur chaque séance réelle, afficher la matière, la classe, le professeur, la salle, l'horaire exact et les éventuelles exceptions, absences ou remplacements.
- Distinguer brouillon, validé et publié ; conserver la version publiée antérieure.
- La publication aux familles n'expose que les données explicitement prévues pour elles.

## 5. Découpage P0 proposé

| ID | Chantier | Livrable | Critère d'acceptation |
|---|---|---|---|
| P0-01 | Cartographie du code et des données | Inventaire des pages, actions, requêtes, tables, contraintes, tests et dépendances | Les points d'entrée et risques sont identifiés avant changement de schéma |
| P0-02 | Profils horaires par jour | Modèle de données et migration rétrocompatible | Le lundi-jeudi et le vendredi peuvent avoir des créneaux distincts ; pause exclue des cours |
| P0-03 | Moteur de dates annuelles | Fonctions déterministes et tests unitaires | Dates exactes entre bornes, année bissextile, changement de mois et plages inclusives |
| P0-04 | Modèle d'événements scolaires | Contrat de données et validations | Férié/vacances/fermeture/examen distinguent affichage et effet sur les cours |
| P0-05 | Application des exceptions | Service de résolution d'une journée réelle | Un événement peut modifier la journée sans altérer la règle hebdomadaire ni effacer les anciennes versions |
| P0-06 | Calendrier annuel en lecture | Vues année et mois, détails d'événement et filtres | L'année choisie, les événements multi-jours et leurs libellés sont exacts |
| P0-07 | Intégration à la grille hebdomadaire et journalière | Grilles alignées sur les profils réels | Les heures et événements affichés correspondent au calendrier applicable à la date |
| P0-08 | Contrôles, sécurité et recette | Tests d'intégration et scénarios métier | Aucun conflit temporel, accès non autorisé ni donnée publiée incohérente dans les cas testés |

## 6. Tests d'acceptation minimum

1. Vérifier les six intervalles du lundi au jeudi, dont la pause 10:00–10:15.
2. Vérifier les six intervalles du vendredi, dont la pause 09:45–10:00.
3. Vérifier que les pauses ne sont ni réservables comme cours ni incluses dans les heures enseignées.
4. Vérifier qu'aucun horaire du samedi ou de l'après-midi n'est inventé par défaut.
5. Générer un calendrier sur une année bissextile et sur une année traversant deux années civiles.
6. Afficher un jour férié sur toutes ses dates applicables et empêcher la pose d'un cours ordinaire lorsque la règle le prévoit.
7. Appliquer un événement ciblé à une classe sans affecter les autres classes.
8. Modifier une date officielle après validation et vérifier que la modification est historisée.
9. Reprogrammer un cours sans supprimer ni modifier la récurrence hebdomadaire d'origine.
10. Vérifier les conflits d'enseignant, de classe et de salle sur les intervalles horaires réels.
11. Vérifier les vues des années future, courante et archivée.
12. Vérifier les permissions, l'audit, les exports et la publication destinée aux familles.

## 7. Conditions avant déploiement

- Les migrations sont versionnées, rétrocompatibles autant que possible et testées sur une base de test.
- La configuration fournie est vérifiée par le responsable du lycée avant d'être publiée.
- Les jours fériés officiels et dates exceptionnelles ne sont alimentés qu'à partir de sources vérifiables et validées.
- Les anciens emplois du temps et leurs versions publiées restent consultables.
- Build, lint, tests unitaires et tests d'intégration passent avant merge.
- Aucun changement n'est envoyé directement en production depuis cette branche : il passe par une PR et une recette.

## 8. Hors périmètre de ce premier socle

La gestion complète des absences, la recherche optimisée de remplaçants, les notifications, les rapports avancés et l'optimisation automatique des cours restent les chantiers suivants (P1/P2). P0 doit d'abord établir des dates et horaires fiables auxquels ces fonctions pourront se fier.
