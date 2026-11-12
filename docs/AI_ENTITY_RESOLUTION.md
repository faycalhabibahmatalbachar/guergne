# Résolution des entités

Comment « 6e A », « Amina », « le 2e trimestre » ou « M. Hassan » deviennent des identifiants. Code : `agent/src/resolution-parametres.js`. Tests : `agent/test/resolution-parametres.test.js` (30 tests).

## Le principe

Le modèle écrit ce que l'utilisateur a dit. Il ne voit aucun identifiant et n'en produit aucun. Le résolveur, appelé par le moteur avant la validation, compare chaque nom aux données relues au backend, sous les droits de l'acteur. Trois issues seulement :

- **un seul candidat** : l'identifiant est posé ;
- **plusieurs** : une question avec les candidats ; la réponse est comprise au tour suivant ;
- **aucun** : c'est dit, avec ce qui existe.

Jamais d'identifiant inventé. Jamais de choix entre deux homonymes.

## Ce qui est résolu

| Entité | Ce qu'on peut dire | Source | Règle |
|---|---|---|---|
| Classe | « 6e A », « sixième a », « la sixième à », « classe de 6ème A », « 6A », « Tle D » | `listerClasses` (cache 15 min) | Code exact d'abord, puis libellé canonique, puis proximité ≥ 0,75. « la 6e » avec deux divisions → question. |
| Période | « 1er trimestre », « T2 », « troisième », `3` | `listerPeriodes` | Ordinal ou libellé. Sans période dite : la période de la date (écriture) ou la période en cours, à défaut la dernière commencée (lecture) — annoncée dans la réponse. |
| Élève | nom, prénom, les deux dans n'importe quel ordre, matricule entier ou par sa fin, avec fautes | `rechercherEleves` | Recherche entière, puis mot par mot, puis par début de mot ; la comparaison approchée tranche. Deux fiches au nom identique → toujours une question. Une classe dite restreint la recherche. |
| Élèves d'un appel | « Mahamat, Fatimé et Ousmane » | `listerElevesClasse` | Dans l'effectif de la classe ; sans classe dite, celle de l'élève. |
| Enseignant | « Mme Abdelkerim », « Fatimé ABDELKERIM » | `listerEnseignants` | Proximité sur nom, prénom, matricule. |
| Matière | « Mathématiques » | `listerClassesEtMatieres` | Proximité sur le libellé. |
| Année scolaire | « 2024-2025 » | `listerAnnees` | L'année en cours ne se précise pas. Une année absente est dite absente : jamais l'année en cours servie sous son nom. |
| Responsable | « le père », un prénom, un téléphone | fiche de l'élève | Résolu dans l'outil (`tools-parents.js`), parmi les responsables DE CET élève. |
| Absence | élève + jour | `listerAbsences` | Résolue dans l'outil. Plusieurs absences le même jour : la suppression est refusée. |

## Les références au fil

Le modèle désigne ce dont on vient de parler par trois jetons, jamais par un identifiant :

| Jeton | Sens | Si le fil ne le porte pas |
|---|---|---|
| `@eleve_courant` | l'élève dont on parle (« sa fiche », « ses parents ») | question : « De quel élève parlez-vous ? » |
| `@classe_courante` | la classe dont on parle | question |
| `@eleves_du_resultat` | les élèves que la dernière consultation a listés (« leurs parents ») | question. Si la liste était tronquée, c'est signalé. |

Filet de sécurité : si l'outil exige un élève, que le modèle n'en a mis aucun, et que le message porte un possessif (« ses », « son », « il »…), l'élève du fil est repris. Un article (« de la semaine ») ne compte pas : ce défaut a été observé puis corrigé.

## Les réponses aux questions de choix

`choisir(choix, texte)` comprend, sans modèle : « 2 », « le 2 », « la deuxième », « le premier », « le dernier », un matricule entier ou sa fin, une classe (« celle de 6e B »), ou assez du libellé pour ne désigner qu'un candidat. Une réponse qui ne départage pas ne choisit personne : la question tombe et le message est traité comme une demande nouvelle.

## Ce que le résolveur ne fait pas

- Il ne résout pas une évaluation par son intitulé : aucun outil d'écriture sur les évaluations n'existe.
- Il ne devine pas une abréviation trop lointaine (« maths » pour « Mathématiques » est à 0,38 de proximité) : il pose la question.
- Il ne garde aucun nom en mémoire : le foyer ne contient que des identifiants (`foyer.js`, `validerFoyer`).
