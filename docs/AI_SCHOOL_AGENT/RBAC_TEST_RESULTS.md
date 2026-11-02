# Résultats des tests RBAC

Campagne exécutée contre la base réelle via `/api/agent/*`, avec un compte de test
par rôle. **Le backend est l'autorité** : l'agent ne peut pas s'autoriser lui-même,
et un refus du `guard` est un refus définitif.

Script : `agent/scripts/campagne-crud.mjs`. Résultat global : **42/42**.

---

## 1. Surface d'attaque de l'API

| Test | Cas | Attendu | Obtenu |
|---|---|---|---|
| T01 | Aucun jeton de service | 401 | ✅ 401 |
| T02 | Jeton de service incorrect | 401 | ✅ 401 |
| T03 | Jeton valide mais `x-acteur-id` absent | 400 | ✅ 400 |
| T04 | Acteur inexistant (UUID valide) | 403 | ✅ 403 |
| T05 | `x-acteur-id` mal formé | 400 | ✅ 400 |
| T06 | Nom d'action = `DROP TABLE eleves` | 404 | ✅ 404 |
| T07 | Action inexistante | 404 | ✅ 404 |

T06 est le test important : le modèle d'IA ne peut **pas** faire exécuter du SQL.
Il choisit un nom dans une liste blanche ; tout le reste est un 404.

## 2. Matrice des rôles, vérifiée contre le backend

| Test | Rôle | Opération | Attendu | Obtenu |
|---|---|---|---|---|
| T08 | SUPER_ADMIN | lire l'assiduité | 200 | ✅ 200 |
| T09 | DIRECTION | lire l'assiduité | 200 | ✅ 200 |
| T10 | SURVEILLANT | lire l'assiduité | 200 | ✅ 200 |
| T11 | SECRETARIAT | lire l'assiduité | 200 | ✅ 200 |
| T12 | **PARENT** | lire l'assiduité | 403 | ✅ 403 |
| T13 | **ENSEIGNANT** | lire l'assiduité | 403 | ✅ 403 |
| T14 | **DIRECTION** | saisir un retard | 403 | ✅ 403 |
| T15 | **SECRETARIAT** | saisir un retard | 403 | ✅ 403 |
| T16 | **PARENT** | saisir un retard | 403 | ✅ 403 |
| T17 | SURVEILLANT | saisir un retard | 200 | ✅ 200 |

## 3. Ce que ces tests confirment

**La DIRECTION ne peut pas saisir l'assiduité (T14).** Le constat tiré de la
matrice est maintenant **prouvé contre le backend réel** : `assiduite:saisir` et
`retard:saisir` appartiennent au SURVEILLANT (et à l'ENSEIGNANT sur ses propres
classes), pas à la direction. Le scénario du cahier des charges §17 — un directeur
qui enregistre des absences par WhatsApp — **échouerait aujourd'hui**, proprement
et avec un message clair.

C'est une **décision métier**, pas un défaut technique. Deux issues :
1. le compte du directeur cumule le rôle SURVEILLANT ;
2. la matrice accorde `assiduite:saisir` à la DIRECTION.

Je n'ai élargi aucun droit : contourner le RBAC pour faire passer un test
reviendrait à tester autre chose que le système réel.

**Le PARENT est bloqué en amont (T12, T16).** `principalParId` applique
`roleAutoriseAdministration` : un parent n'est même pas reconnu comme acteur
possible de l'API agent. Le LLM a beau demander une opération administrative, elle
n'atteint jamais la couche métier.

**L'ENSEIGNANT n'a pas `assiduite:lire` (T13)** — il détient `assiduite:saisir`
mais seulement avec la portée `PROPRES_CLASSES`. La portée est évaluée côté
`guergne` uniquement, jamais par l'agent.
