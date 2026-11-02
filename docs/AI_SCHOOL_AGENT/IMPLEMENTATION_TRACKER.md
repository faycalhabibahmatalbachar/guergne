# Suivi d'implémentation — Agent IA

Fichier de pilotage. Il guide l'exécution ; il ne la remplace pas.

**États** : 1 IDENTIFIÉ · 2 À IMPLÉMENTER · 3 EN COURS · 4 IMPLÉMENTÉ ·
5 TESTÉ LOCALEMENT · 6 TESTÉ EN INTÉGRATION · 7 TESTÉ CONTRE BACKEND ·
8 VALIDÉ SUR ALTARE · 9 VALIDÉ SUR WHATSAPP · 10 VALIDÉ EN PRODUCTION ·
11 BLOQUÉ PAR UNE DÉPENDANCE EXTERNE PRÉCISE.

Une fonctionnalité ne passe pas à un état sans la preuve de ce niveau.

---

## Socle

| ID | Fonctionnalité | Fichiers | Tests | État | Preuve |
|---|---|---|---|---|---|
| S-01 | Verrou d'instance (PID recyclé, horloge) | `src/verrou.js` | 25 | **8** | `decision=perime-reutilise` dans les logs Altare |
| S-02 | Moteur IA 4 fournisseurs + repli | `src/ia.js` | 51 | **8** | PONG réel Groq/OpenRouter, bascule sur 401 |
| S-03 | Résolution JID et LID | `src/jid.js` | 18 | **9** | `TEST AGENT` répondu depuis WhatsApp |
| S-04 | Délais maximaux, jamais de silence | `src/delai.js` | 16 | **9** | réponse reçue après la correction |
| S-05 | Contrat d'intention (conversation/outil/mission/clarifier) | `src/plan.js` | 14 | **9** | « Salut » → réponse naturelle |
| S-06 | Identités par l'annuaire du personnel | `src/resolution-comptes.js` | 24 | **9** | `decision=ALLOW role=SUPER_ADMIN` |
| S-07 | Politiques d'exécution permanentes | `src/politiques.js` | 22 | **7** | écritures automatiques sur branche de test |
| S-08 | Missions multi-étapes | `src/mission.js` | 20 | **7** | 4 étapes, 294 h, classes citées |
| S-09 | Rechargement à chaud des identités | `src/identity-store.js` | 16 | **8** | provisionnement sans redémarrage |

## Modules scolaires — outils IA

| ID | Module | Outil | Opération backend | Tests | État |
|---|---|---|---|---|---|
| M-01 | Assiduité | `consulter_absences`, `alertes`, `consulter_retards`, `tableau_de_bord`, `conduite_classe` | `listerAbsences`, `listerAlertes`, `listerRetards`, `statistiquesVieScolaire`, `chargerConduiteClasse` | structurels + e2e | **7** |
| M-02 | Discipline | `consulter_incidents`, `consulter_sanctions` | `listerIncidents`, `listerSanctions` | structurels + e2e | **7** |
| M-03 | Assiduité (écritures) | `enregistrer_appel`, `enregistrer_retard`, `justifier_absences`, `supprimer_absence` | idem, **éteintes par défaut** | e2e écriture | **7** |
| M-04 | Pilotage | `indicateurs`, `effectifs_par_niveau`, `absences_par_mois`, `moyennes_par_classe`, `classement_classes`, `resultats_par_matiere` | `pilotage.ts` | structurels + e2e | **7** |
| M-05 | Élèves | `eleves.rechercher`, `eleves.statistiques` | `listerEleves`, `statistiquesEleves` | structurels + e2e | **7** |
| M-06 | Parents | `parents.tuteurs_de_l_eleve` | `tuteursDeLEleve` | structurels + e2e | **7** |
| M-07 | Personnel | `personnel.enseignants` | `listerEnseignants` | structurels + e2e | **7** |
| M-08 | Pédagogie | `pedagogie.evaluations` | `listerEvaluations` | structurels + e2e | **7** |
| M-09 | Finances | `finances.statistiques`, `finances.recouvrement_par_classe` | `statistiquesFinancieres`, `recouvrementParClasse` | structurels + e2e | **7** |
| M-10 | Établissement | `etablissement.statistiques` | `chargerStatistiques` | structurels + e2e | **7** |

**Preuve M-01 à M-10** : `node agent/scripts/e2e-catalogue.mjs` → **21/21 outils
de lecture servis par l'API réelle et rendus lisiblement**, sur la branche Neon
de test. Chiffres obtenus : 548 élèves, 15 classes, 15 enseignants,
106 380 000 FCFA attendus.

## Backend

| ID | Besoin | Fichiers | Tests | État |
|---|---|---|---|---|
| B-01 | Séparation lecture / écriture du catalogue | `web/src/server/agent/operations.ts`, `porte.ts` | 6 | **7** |
| B-02 | Écritures éteintes par défaut | `porte.ts` | 6 | **7** |
| B-03 | 21 opérations de lecture exposées | `operations.ts` | structurels + e2e | **7** |
| B-04 | Connexion en production | PR #81 **fusionnee** | — | **11** — une variable Vercel |

## Observabilité, notifications, fiabilité

| ID | Besoin | Fichiers | État |
|---|---|---|---|
| O-01 | `runId` corrélé du transport à la réponse | `providers/wwebjs.js`, `engine.js` | **9** |
| O-02 | Raisons de refus explicites | `jid.js`, `engine.js` | **9** |
| O-03 | Empreintes salées, aucun numéro en clair | `jid.js`, `identity-store.js` | **9** |
| O-04 | Indicateurs d'autonomie sur `/sante` | `engine.js`, `app.js` | **8** |
| N-01 | Notifications aux deux responsables | `engine.js` | **7** |
| R-01 | Reprise des lectures, jamais des écritures incertaines | `mission.js` | **7** |
| R-02 | Revendication relâchée avant action métier | `engine.js`, `persistance.js` | **5** |

---

## Reste à faire

| ID | Besoin | Pourquoi ce n'est pas fait | État |
|---|---|---|---|
| T-01 | Génération de fichiers XLSX / CSV | `src/document.js`, 10 tests, piece jointe WhatsApp | **5** |
| T-02 | Écritures dans les missions | le conducteur n'accepte que des consultations, par choix de sûreté ; à ouvrir sous politique | **2** |
| T-03 | File de notifications avec reprise et déduplication | `src/notifications.js`, 14 tests | **5** |
| T-04 | Mesure de couverture chiffrée | **96,31 % lignes / 84,03 % branches** mesurees | **5** |
| T-05 | Outils d'écriture hors assiduité (élèves, notes) | aucune opération backend exposée pour l'instant ; exige B-04 | **1** |

---

## Blocage externe unique

**La route agent est EN LIGNE depuis la fusion de la PR #81** (2026-11-02).
`POST /api/agent/listerAlertes` est passé de **404** à **503** — la route
répond, et dit ce qui lui manque :

```
{"ok":false,"message":"API agent non configurée."}
```

503 signifie `AGENT_SERVICE_TOKEN` absent côté Vercel. C'est la **dernière**
action externe, et elle ne peut pas être faite depuis cet environnement : le
projet est bien lié (`web/.vercel/project.json` porte `projectId` et `orgId`),
mais aucun `VERCEL_TOKEN` n'y existe.

**Action, au choix :**

```bash
cd web && VERCEL_TOKEN=xxxxx npm run vercel:env
```

ou bien ajouter `AGENT_SERVICE_TOKEN` dans les variables d'environnement du
projet sur le tableau de bord Vercel (sa valeur est dans `web/.env.local`).

**Puis**, et seulement une fois que la route répond **401** :

```bash
node agent/scripts/altare-env.mjs --ecrire   # ajoute SCHOOL_API_BASE_URL
```

Ne pas poser `AGENT_ECRITURES_ACTIVES` : les écritures restent éteintes
jusqu'à leur recette en production.

**Ce qui est déjà prouvé, et n'attend que cette variable :** le parcours
complet « Montre les absences de la 6ème A » — référentiel, NLU, politique,
garde, base — avec l'identifiant réel `fb5fa8be-…ec39`, 100 lignes rendues,
toutes en 6ème A. Voir `agent/scripts/e2e-6eme-a.mjs`.
