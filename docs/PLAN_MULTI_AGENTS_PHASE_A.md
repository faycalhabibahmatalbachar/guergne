# Phase A — Équipe de cinq agents : audit, contrats et plan d'exécution

Lycée Guergné La Renaissance. Document de préparation, établi avant toute
modification. Rien n'a été implémenté.

Tous les chiffres de ce document ont été vérifiés contre la base de
production en lecture seule, ou lus dans le code aux lignes citées. Les
rapports des agents d'audit qui n'ont pas pu être vérifiés sont signalés comme
tels.

---

## 1. Mes capacités multi-agents réelles

Mesurées, pas supposées : quatre agents d'audit ont réellement tourné en
parallèle pour produire ce document.

| Fait | Valeur observée |
|---|---|
| Agents parallèles réellement lancés | 4 |
| Durée par agent | 2 à 6,5 min |
| Appels d'outils par agent | 16 à 27 |
| Jetons consommés par agent | 92 000 à 168 000 |

**Ce qu'un agent peut faire.** Contexte propre, lecture du code, exécution de
commandes, écriture de fichiers, exécution de tests, correction de ses propres
erreurs. Je peux lui attribuer un worktree git séparé. Je peux lui réécrire
pour le relancer avec son contexte intact.

**Les limites, qui comptent autant.**

1. **Démarrage à froid.** Un agent ne sait que ce que son brief contient. La
   qualité du brief détermine le résultat, et un brief de domaine complet fait
   plusieurs pages.
2. **Il se trompe avec assurance.** Les quatre rapports d'audit contenaient des
   déductions présentées comme des faits. Deux affirmations graves se sont
   révélées fausses ou exagérées à la vérification (détail en §3.5). C'est la
   raison pour laquelle l'Agent 5 ne peut pas se contenter de lire les
   rapports : il doit vérifier contre la base et contre le code.
3. **Pas de dialogue en cours de route.** Un agent bloqué s'arrête ; il ne peut
   pas demander un arbitrage sans rendre la main.
4. **Le parallélisme est limité par les fichiers partagés, pas par moi.** Il
   existe **28 types `Resultat*` distincts** qui redéclarent tous la même forme
   `{ok, message?, erreurs?}`. Cinq agents écrivant en même temps sur ce
   terrain produiraient des conflits garantis. La séquence compte plus que le
   parallélisme.

**Conclusion honnête :** je peux lancer cinq unités d'exécution réelles. Je ne
peux pas leur faire livrer en parallèle cinq domaines complets tels que le
cahier des charges les décrit, parce qu'ils se marcheraient dessus et parce que
le volume dépasse largement une session. Le plan de §6 est ce qui est
réellement faisable.

---

## 2. État du dépôt et de la production

La plateforme est **mature**, pas à construire. Le cahier des charges suppose
par endroits des domaines vides ; ils ne le sont pas.

| Élément | Réalité mesurée |
|---|---|
| Tables | 66 |
| Pages du tableau de bord | 48 |
| Routes API | 24 |
| Services de domaine | 9 208 lignes sur 35 fichiers |
| Rôles | 9 (`SUPER_ADMIN` 78 actions → `ELEVE` 7) |
| Domaines d'action | 41 |
| Fichiers de test (web) | 19 |
| Tests exécutés par `npm test` | 163 |
| Tests de l'agent IA | 432 |

### Données de production

| Table | Lignes |
|---|---|
| `notes` | 47 601 |
| `absences` | 2 720 |
| `retards` | 2 236 |
| `bulletins` | 1 647 (**tous publiés**) |
| `moyennes_matiere` | 15 867 |
| `moyennes_generales` | 1 647 |
| `evaluations` | 1 219 |
| `inscriptions actives` | 548 |
| `bulletins_annuels` | **0** |
| `historique_notes` | **0** |
| `sorties_anticipees` | **0** |

**Contrainte majeure :** l'année 2025-2026 est **terminée** (15 juillet 2026),
les **trois périodes sont verrouillées**, et les **1 647 bulletins sont
publiés**. Toute opération touchant la génération est donc à haut risque.

### Couverture d'intégration continue

- `npm test` = `node --test src/server/domain/*.test.ts src/lib/*.test.ts`.
  Les **6 tests** de `src/server/agent/operations.test.ts` sont **exclus par le
  glob** et ne tournent jamais.
- **Aucun workflow CI ne couvre `agent/`** : les 432 tests de l'agent IA ne
  s'exécutent jamais automatiquement.
- `web-validation.yml` ne se déclenche que sur `pull_request` touchant `web/**`.

---

## 3. Défauts confirmés, classés par gravité

### 3.1 — P0 : la génération de bulletins écrase des bulletins publiés

`web/src/server/domain/generation-bulletins.ts`

La requête de contexte lit le verrou de période à la ligne 115 :

```sql
SELECT c.libelle AS classe, p.libelle AS periode, p.est_verrouillee AS verrouillee
```

La valeur est typée, affectée à `ctx` (ligne 119)… et **jamais lue** :
`ctx.verrouillee` compte **0 occurrence** dans le fichier. Les deux `UPSERT`
(lignes 224 et 271) n'ont aucune clause filtrant `est_publie` ou
`est_verrouillee`, et l'action appelante n'en a pas davantage.

**Conséquence :** régénérer une classe écrase `moyenne_generale`, `rang`,
`mention`, `moyenne_classe` et les `moyennes_matiere` de bulletins **déjà
publiés et déjà consultés par les familles**, dans une année clôturée. Le rang
de toute la classe change avec. Le commentaire de la migration `0004` dit
pourtant qu'« un bulletin publié ne doit plus jamais changer de valeur ».

**Portée actuelle : 1 647 bulletins, 3 périodes verrouillées.**

### 3.2 — P0 : l'agent WhatsApp est muet et rien ne le remarque

```
whatsapp = connecting   instance = e72a7d5d   reconnexions = 0
attenteScanQr = false   marche = 396 min
```

Le processus est vivant, tient le verrou, et son client est figé depuis plus de
six heures sans avoir retenté une seule fois. `grep -rn "connecting"` sur
`agent/src/*.js` et `agent/app.js` ne renvoie **aucun résultat** : aucun code
ne surveille cet état. `/sante` répond `processus: "ok"` et un `200` pendant
que le service est totalement indisponible — le faux vert que ce projet refuse
partout ailleurs.

Un core dump de **1,19 Go** (`core.104`) a été écrit à 11:41:28, l'instant du
démarrage, et occupe le volume dont Chromium a besoin. Le lien de causalité
n'est pas prouvé (le quota du volume n'est pas lisible par SFTP), mais ce
fichier est inutile et doit partir.

**Travail :** un chien de garde qui force la réinitialisation du client
au-delà d'un seuil, et un `/sante` qui déclare l'état dégradé.

### 3.3 — P0 : aucune traçabilité sur 47 601 notes

`historique_notes` contient **0 ligne** pour 47 601 notes. La table n'est
alimentée que par un trigger `BEFORE UPDATE`, donc :

- aucune trace à la création ni à la suppression ;
- `note_id` est en `ON DELETE CASCADE` : supprimer une note efface son
  historique, et vider une case dans la grille supprime la note ;
- `motif` n'est jamais rempli.

Aucun écran ne lit cette table. Personne ne peut dire qui a changé une note, ni
quand, ni pourquoi.

### 3.4 — P1 : défauts confirmés mais latents

| Défaut | Preuve | Pourquoi latent |
|---|---|---|
| Un enseignant ne peut pas faire l'appel | `requirePermission("assiduite:saisir")` sans périmètre, et `enseignantCouvre` renvoie `false` sans `classeId` (ligne 90). `ENSEIGNANT` n'a pas `assiduite:lire` du tout. | **0 compte `ENSEIGNANT` actif** (pour 15 enseignants et 135 affectations en base) |
| Les évaluations `ANNULEE` entrent dans la moyenne | aucun filtre de statut dans la génération | **0 évaluation `ANNULEE`** aujourd'hui |
| `bulletins_annuels` jamais alimentée | 0 ligne | pas encore exploitée |

Ces trois défauts mordront le jour où un compte enseignant sera ouvert, où une
évaluation sera annulée, ou où le bulletin annuel sera mis en service.

### 3.5 — Corrections apportées aux rapports d'audit

Deux affirmations graves des agents n'ont pas résisté à la vérification :

1. **« Le pilotage serait vide, `moyennes_generales` n'est alimentée par
   rien. »** Faux pour les données actuelles : la table contient **1 647
   lignes**, autant que `bulletins`. Le constat sur le code reste à instruire,
   mais la conséquence annoncée n'existe pas.
2. **« Le moteur PDF est à construire. »** Faux : `@react-pdf/renderer 4.6.1`
   est installé et cinq routes produisent de vrais PDF. Le moteur est à
   **compléter**. En revanche, aucune bibliothèque `.docx` n'est installée : la
   génération Word demandée au §7 du cahier des charges n'existe pas du tout.

### 3.6 — P1 : défauts actifs, mesurés en production

| Défaut | Mesure |
|---|---|
| Doublons d'absences (aucune contrainte d'unicité) | **61 groupes, 61 lignes en surnombre** sur 2 720 — chacun ayant déclenché une notification en double aux tuteurs |
| Absences sur jour non ouvré (aucun contrôle du calendrier) | **23 absences un dimanche** |
| Numéros de documents officiels consommés par les aperçus | **9 certificats émis pour 6 élèves** ; un élève en détient 3 avec 3 numéros ; **0 PDF archivé** (`fichier_url`), donc impossible de dire lequel fait foi |
| Taux d'absentéisme faux et dérivant | dénominateur `548 × 56 semaines × 30 h = 920 640 h`, 56 semaines **calendaires** vacances comprises, dans une année finie depuis juillet. Affiche **0,39 %**. Le numérateur est figé, le dénominateur grandit chaque semaine : l'indicateur glisse vers zéro par construction |
| `sorties_anticipees` : table et permission sans aucun code | 0 ligne, 0 référence hors schéma |

---

## 4. Contrats communs — le premier livrable, avant toute implémentation

Ces contrats n'existent pas aujourd'hui. Les établir est la condition du
travail parallèle, et la tâche de l'Agent 5 avant que les autres écrivent.

### 4.1 Forme de retour unique

**Problème :** 28 types `Resultat*` distincts, redéclarant la même forme.

**Contrat :** un seul type exporté depuis un module partagé.

```ts
export type Resultat<T = void> =
  | { ok: true; donnees?: T; message?: string }
  | { ok: false; message: string; erreurs?: Record<string, string> };
```

Propriétaire : Agent 5. Les agents 1 à 4 l'importent et n'en déclarent aucun
autre.

### 4.2 Pagination et totaux

**Contrat :** toute lecture de liste rend `{ lignes, total, limite, tronque }`.
Le `total` est compté séparément des lignes, par une fonction dont les
conditions sont **partagées** avec celle qui liste — jamais dupliquées à la
main, comme c'est le cas aujourd'hui entre `listerAbsences` et
`compterAbsences`.

Précédent établi : `web/src/server/agent/operations.ts`, opération
`listerAbsences`.

### 4.3 Permissions

**Contrat :** toute action dont la portée peut être `PROPRES_CLASSES` ou
`PROPRES_ENFANTS` **doit** transmettre son périmètre :
`requirePermission(action, { classeId, eleveId, matiereId })`. Un appel sans
périmètre sur une action de portée restreinte est un refus silencieux, et c'est
exactement le défaut §3.4.

L'Agent 5 doit produire la liste exhaustive des appels fautifs ; il y en a au
moins dans l'assiduité et dans les notes.

### 4.4 Audit

**Contrat :** toute écriture passe par `journaliser` / `journaliserAtomiquement`
avec `avant`, `après` et `motif`. Aucune table d'historique ne doit dépendre
d'un trigger seul, ni être en `ON DELETE CASCADE` sur l'objet qu'elle historise.

### 4.5 Immuabilité du résultat scolaire

**Contrat :** aucun écrit sur `bulletins`, `moyennes_matiere` ou
`moyennes_generales` lorsque `bulletins.est_publie` ou
`periodes.est_verrouillee` est vrai. La réouverture exige une dépublication ou
un déverrouillage explicite, avec motif journalisé.

C'est le contrat qui ferme le défaut §3.1, et il concerne les agents 3, 4 et 5.

### 4.6 Identifiants et périmètre

- Tout identifiant est un UUID, validé avant usage.
- L'année de travail est résolue par `est_courante`, jamais codée en dur.
- Les coefficients viennent de la table `coefficients`, jamais du code — le
  bulletin du collège viole ce point aujourd'hui.

### 4.7 Frontend

- Composants : `web/src/components/ui/` (shadcn) et `web/src/components/socle/`.
  Aucun agent n'introduit une bibliothèque de composants concurrente.
- Les actions serveur vivent dans un `actions.ts` à côté de la page et
  retournent le `Resultat` de §4.1.
- Le calcul important se fait côté serveur, jamais dans le composant.

---

## 5. Les cinq agents

Chaque agent reçoit un brief complet, autonome, et respecte les contrats de §4.

### Agent 1 — P0 — Élèves et classes

**Existe déjà :** `listerEleves` avec pagination (`limit`/`offset`, plafond
100), tri par liste blanche, filtres statut/classe/niveau/année/dossier ;
dossier complet (`chargerDossierComplet`) avec identité, santé sous droits,
responsables, parcours, historique des statuts et des changements de classe ;
inscription transactionnelle avec matricule par séquence SQL ; réinscription
conservant l'historique ; import en masse avec aperçu.

**À faire, par ordre d'importance :**

1. **Détection de doublon d'élève à l'inscription manuelle** (nom + prénom +
   date de naissance, insensible aux accents et à la casse). Aujourd'hui rien
   ne l'empêche : un enfant peut recevoir deux matricules et deux échéanciers.
   Fichier : `web/src/app/(main)/dashboard/eleves/actions.ts`.
2. **Recherche tolérante** : sans accents (l'extension `unaccent` existe en
   migration 0032 mais ne sert qu'à la recherche globale), par mots multiples
   dans n'importe quel ordre, par nom et téléphone de responsable, avec
   `pg_trgm`. Fichier : `web/src/server/domain/eleves.ts`.
3. **Pièces justificatives** : la table `pieces_dossier` et la permission
   `piece:deposer` existent et ne sont **utilisées nulle part**. Nouveau module
   de domaine, puis onglet du dossier.
4. **Complétude unique** : les règles sont dupliquées entre
   `eleves/completer/page.tsx` et `vue-ensemble.tsx`, avec des listes de champs
   différentes, sans les pièces et sans lien avec `statut_dossier`.
5. **Fiabiliser la réinscription** : exiger `eleve:reinscrire` et non
   `eleve:creer`, vérifier l'année et le niveau de la classe choisie, bloquer
   les élèves `EXCLU`/`TRANSFERE`/`ABANDON`, renseigner
   `inscription_precedente_id`, clôturer l'ancienne inscription.
6. **Cohérence niveau/série/année d'une classe** : aucun contrôle applicatif,
   et `niveaux.series_applicables` n'est pas vérifié.
7. **Archivage de classe** : `classes.active` est filtré en lecture mais
   aucune action ne le modifie.
8. **Tests du domaine** : il n'en existe aucun.

### Agent 2 — P1 — Assiduité

**Existe déjà :** `listerAbsences` et `compterAbsences`, appel de classe avec
absents et retards, justification en lot de 1 à 200 avec motif et traçabilité,
alertes d'absentéisme par seuil (`v_alertes_assiduite`), notification des
tuteurs par trigger.

**À faire, par ordre d'importance :**

1. **Contrainte d'unicité sur les absences** (migration) et contrôle
   applicatif. 61 doublons existent, et chacun a notifié les tuteurs deux fois.
   Décider du traitement des 61 lignes existantes — à soumettre, pas à décider
   seul.
2. **Appel par séance.** `absences.seance_id` et `creneau_id` ne sont jamais
   renseignés ; `seances.appel_effectue`, `appel_par` et `appel_le` ne sont ni
   lus ni écrits, et l'index `idx_seances_appel_manquant` est préparé sans être
   exploité. Aujourd'hui un appel jamais fait et une classe au complet sont
   indiscernables, ce que le cahier des charges interdit explicitement.
3. **Taux de présence réel**, fondé sur l'emploi du temps, les séances et le
   calendrier scolaire — et non sur 30 h × semaines calendaires (§3.6).
   Fichier : `web/src/server/domain/pilotage.ts`.
4. **Contrôle du calendrier à la saisie** : jour ouvré, hors vacances, date
   dans la période. 23 absences un dimanche aujourd'hui.
5. **Périmètre des permissions** (§3.4 et §4.3), et contrôle d'appartenance
   dans `supprimerAbsencePour` et `justifierEnLotPour`.
6. **Workflow de justification complet** : l'état `REFUSEE` n'existe pas dans
   l'enum, `EN_ATTENTE` n'est jamais produit, `justificatif_url` n'est jamais
   écrit. Incohérence à trancher : les vues comptent `<> 'JUSTIFIEE'` comme non
   justifié, d'autres calculs comptent `= 'NON_JUSTIFIEE'` — `EN_ATTENTE`
   change donc de camp selon l'écran.
7. **Correction d'une absence ou d'un retard** : seule la suppression physique
   existe ; aucune modification de date, durée, type ou élève.
8. **Sorties anticipées** : table et permission `sortie:autoriser` sans aucun
   code.
9. **Tests du domaine** : il n'en existe aucun côté web.

### Agent 3 — P2 — Notes et résultats

Domaine le plus sensible : une erreur touche la scolarité d'un élève.

**Existe déjà, et est correct :** le moteur de calcul `notes.ts` est propre et
testé (317 lignes de tests). Il distingue rigoureusement `NOTEE`,
`ABSENT`, `ABSENT_ZERO`, `DISPENSE`, `NON_RENDU` ; une note jamais saisie est
**exclue**, jamais transformée en zéro ; l'arrondi commercial est testé jusqu'au
cas 9,995 ; le rang est olympique. Les coefficients vivent à deux niveaux
(`coefficients` par matière/niveau/série, `poids` par évaluation).

**À faire, par ordre d'importance :**

1. **Interdire l'écrasement d'un bulletin publié ou d'une période verrouillée**
   (§3.1 et §4.5). C'est le premier travail du programme entier.
2. **Traçabilité des notes** (§3.3) : journaliser la création et la suppression,
   retirer le `ON DELETE CASCADE`, remplir le motif, exiger un motif pour une
   correction après verrouillage, et offrir une vue « d'où vient cette
   moyenne ».
3. **Filtrer les statuts d'évaluation** dans le calcul : `ANNULEE` et
   `BROUILLON` y entrent aujourd'hui.
4. **Réconcilier le bulletin PDF et la moyenne stockée.** Trois divergences
   lues dans le code, à trancher avec vous car ce sont des décisions de
   règlement, pas de technique :
   - la conduite est dans les totaux affichés du PDF mais pas dans la moyenne
     générale stockée ;
   - les coefficients du collège sont codés en dur dans le PDF, contre la base
     pour la moyenne stockée ;
   - deux barèmes d'appréciation aux seuils différents coexistent, si bien
     qu'un même élève reçoit deux qualificatifs dans un même bulletin.
5. **Invalidation des moyennes** : la saisie manuelle n'invalide rien ; l'import
   supprime `moyennes_matiere` mais laisse `bulletins` et les rangs périmés.
6. **Modification d'une évaluation** : barème, poids, type, date et titre ne
   sont pas modifiables, et changer le barème après saisie n'est pas contrôlé.
7. **Complétude avant génération** : `saisiesManquantes` existe mais
   n'empêche rien ; une moyenne incomplète a l'air normale.
8. **Matrice de permissions** : ni `DIRECTION` ni `CENSEUR` n'ont `note:saisir`
   ni `evaluation:creer` — un censeur ne peut pas corriger une note.
   `note:modifier` est attribuée et jamais utilisée.
9. **Tests** : la génération et le bulletin ne sont pas testés du tout, ni
   l'alignement entre le moteur TypeScript et le SQL dupliqué de
   `moyenneFamille`.

### Agent 4 — P3 — Documents

**Existe déjà :** `@react-pdf/renderer 4.6.1`, `exceljs 4.4.0`, un gabarit
officiel commun (`server/pdf/gabarit.tsx`) avec en-tête République du Tchad,
pied de page numéroté, code de vérification et signature ; cinq routes
produisant de vrais PDF ; exports XLSX des listes et un export comptable
multi-feuilles ; numérotation par `sequences_numerotation`.

**À faire, par ordre d'importance :**

1. **Rendre l'émission idempotente** (§3.6) : l'insertion et la numérotation
   ont lieu à **chaque `GET`**, si bien qu'un simple rafraîchissement d'aperçu
   consomme un numéro officiel. Archiver le PDF (`fichier_url` est à 0 partout)
   et rejouer depuis `donnees_figees`, que rien ne relit alors que le
   commentaire du code promet une réédition identique.
2. **Vérification publique du code d'authenticité** : le code est imprimé sur
   chaque document et **aucune route ne permet de le vérifier**.
3. **Journaliser bulletins, exports et lots.** Les exports XLSX sortent des
   téléphones et des adresses sans aucune trace.
4. **Droits fins sur les bulletins du personnel** : `bulletin:lire` est exigée
   sans périmètre de classe ni d'élève, et sans contrôle de publication.
5. **Identité pilotée par la base** : `etablissement.logo_id` et `cachet_id`
   existent et ne sont pas lus ; le logo vient d'un fichier statique et le
   cachet n'est jamais apposé.
6. **Documents manquants de l'enum** : attestation de fréquentation, carte
   scolaire, convocation, notification de sanction, PV de conseils, listes
   d'appel et d'examen, palmarès.
7. **Lot asynchrone avec suivi** : le seul lot existant rend 500 bulletins en
   mémoire, en synchrone, sous une limite de 60 s.
8. **Word (.docx)** : aucune bibliothèque n'est installée. À arbitrer — le PDF
   couvre peut-être le besoin, et ajouter une dépendance pour un format dont
   personne ne se sert serait du travail inutile.
9. **Tests** : aucun test de génération.

### Agent 5 — P4 — Supervision et intégration

**Il ne lit pas les rapports : il vérifie.** C'est la leçon de §3.5, où deux
affirmations graves d'agents se sont révélées fausses.

**Avant que les autres écrivent :**

1. Établir les contrats de §4 dans un module partagé, et les faire adopter.
2. Produire la liste exhaustive des `requirePermission` appelés sans périmètre
   sur une action de portée restreinte.
3. Ajouter `src/server/agent/**/*.test.ts` au glob de `npm test` et un workflow
   CI couvrant `agent/` — sans quoi 438 tests resteront invisibles.

**Pendant :** vérifier chaque livrable contre la base et contre le code,
refuser toute intégration qui casse un contrat, et tenir la matrice de tests
d'intégration.

**Interdits qu'il fait respecter :** aucune écriture sur les données scolaires
de production ; aucune régénération de bulletin ; `AGENT_ECRITURES_ACTIVES`
reste éteint ; aucune notification réelle aux parents.

---

## 6. Exécution : vagues séquencées, pas cinq agents en roue libre

### Vague 0 — Fondations (Agent 5 seul, ~30 à 45 min)

Les contrats de §4, le glob de tests, la CI de `agent/`. **Aucun autre agent ne
démarre avant.** Tout le reste en dépend, et les lancer en parallèle
produirait quatre variantes des mêmes types.

### Vague 1 — Les trois P0 (3 agents parallèles, ~45 min)

| Agent | Travail | Fichiers |
|---|---|---|
| 3 | Interdire l'écrasement d'un bulletin publié | `generation-bulletins.ts`, `bulletins/actions.ts` |
| 5 | Chien de garde WhatsApp et `/sante` dégradé | `agent/src/`, `agent/app.js` |
| 2 | Unicité des absences + contrôle du calendrier | migration, `assiduite-ecritures.ts` |

Périmètres disjoints : pas de conflit. Chacun livre avec ses tests.

### Vagues 2 à 4 — Les domaines (4 agents parallèles, ~45 min chacune)

Agents 1 à 4 sur leurs manques respectifs, trois à quatre éléments par vague,
avec tests. L'Agent 5 vérifie et intègre entre chaque vague.

### Dépendances réelles

```
Vague 0 (contrats)
   ├── Agent 1  (élèves/classes) ──┐
   ├── Agent 2  (assiduité) ───────┼── Agent 4 (documents) : consomme leurs
   └── Agent 3  (notes) ───────────┘   données, ne les recalcule jamais
```

L'Agent 4 ne doit pas démarrer ses documents d'assiduité et de résultats avant
que les agents 2 et 3 aient figé leurs contrats de données. Ses travaux
indépendants — idempotence de l'émission, vérification du code, journalisation
— n'attendent personne et commencent en vague 1 ou 2.

### Branches

Un worktree par agent, une branche par domaine :

```
codex/agent-1-eleves-classes-p0
codex/agent-2-assiduite-p1
codex/agent-3-notes-resultats-p2
codex/agent-4-documents-p3
codex/agent-5-supervision-p4
```

**Risques de conflit git, nommés :**

- `web/src/server/guard/` — touché par les agents 1, 2, 3 et 5. **Propriétaire :
  Agent 5.** Les autres demandent.
- Le module des contrats partagés — **propriétaire : Agent 5**, en lecture seule
  pour les autres.
- `db/migrations/` — numérotation séquentielle, donc collision garantie si deux
  agents créent une migration en même temps. **L'Agent 5 attribue les numéros.**
- `web/src/server/domain/pilotage.ts` — touché par les agents 2 et 3. À
  séquencer, jamais en parallèle.
- `web/src/server/agent/operations.ts` et `agent/src/tools.js` — touchés par les
  agents 1, 2 et 3 pour exposer leurs lectures. À séquencer.

### Durée

- **Vague 0 :** 30 à 45 min.
- **Chaque vague suivante :** 45 à 60 min, vérification de l'Agent 5 comprise.
- **Première passe crédible sur les P0 et les manques les plus importants :
  3 h 30 à 5 h** d'exécution autonome.
- **Le programme du cahier des charges pris au mot** — quatre domaines
  complets, interface, API, service, validation, permissions, historique, tests
  et documentation — représente **plusieurs semaines**, pas une session. Je
  préfère vous le dire maintenant que de vous annoncer un domaine « terminé »
  qui ne l'est pas.

---

## 7. Décisions qui vous reviennent

Je ne les prendrai pas seul : ce sont des décisions de règlement scolaire ou
d'exploitation, pas de technique.

1. **Les 61 doublons d'absences existants** : les fusionner, les supprimer, ou
   les laisser en place avec un signalement ?
2. **La conduite entre-t-elle dans la moyenne générale ?** Le PDF et la valeur
   stockée répondent différemment aujourd'hui.
3. **Les coefficients du collège** : la base fait-elle foi contre le PDF, ou
   l'inverse ?
4. **Le Word (.docx)** vaut-il l'ajout d'une dépendance, ou le PDF suffit-il ?
5. **L'agent muet** : puis-je supprimer `core.104` et redémarrer Altare ?
6. **La PR vers `main`** : la branche a 10 commits d'avance et porte le
   correctif de troncature que la production attend.

---

## 8. Ce qui reste interdit pendant tout le programme

- Aucune écriture sur les dossiers, notes, absences ou inscriptions réels.
- Aucune régénération de bulletin en production : 1 647 sont publiés.
- `AGENT_ECRITURES_ACTIVES` reste éteint.
- Aucune notification réelle aux parents.
- Aucun secret affiché ni commité ; aucun numéro de téléphone dans le dépôt.
- Aucune seconde session WhatsApp.
- Aucune fusion d'un travail dont les tests échouent.
