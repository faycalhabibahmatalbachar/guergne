# Résultats de la campagne CRUD + RBAC

Exécutée le 2026-10-31 15:22 contre la base réelle,
via `node agent/scripts/campagne-crud.mjs` (serveur local, API `/api/agent/*`).

**42 / 42 tests réussis.**

## Sûreté de la campagne

Le déclencheur `absences_notification` met en file une notification à chaque tuteur
dès l'insertion d'une absence, et les 549 élèves réels ont tous un tuteur. La campagne
crée donc son **propre élève de test sans tuteur**, opère uniquement dessus, puis
supprime tout. Aucune donnée de production n'a été modifiée ni supprimée — vérifié par
comparaison des compteurs avant/après.

État initial : 2720 absences, 2236 retards, 549 élèves.
État final : 2720 absences, 2236 retards, 549 élèves.

## Détail

| Test | Intitulé | Attendu | Obtenu | Statut |
|---|---|---|---|---|
| T01 | sans jeton de service | `401` | `401` | ✅ PASS |
| T02 | jeton de service incorrect | `401` | `401` | ✅ PASS |
| T03 | sans x-acteur-id | `400` | `400` | ✅ PASS |
| T04 | acteur inexistant | `403` | `403` | ✅ PASS |
| T05 | acteur mal formé | `400` | `400` | ✅ PASS |
| T06 | action hors liste blanche | `404` | `404` | ✅ PASS |
| T07 | action inexistante | `404` | `404` | ✅ PASS |
| T08 | SUPER_ADMIN lit l'assiduité | `200` | `200` | ✅ PASS |
| T09 | DIRECTION lit l'assiduité | `200` | `200` | ✅ PASS |
| T10 | SURVEILLANT lit l'assiduité | `200` | `200` | ✅ PASS |
| T11 | SECRETARIAT lit l'assiduité | `200` | `200` | ✅ PASS |
| T12 | PARENT refusé (non habilité) | `403` | `403` | ✅ PASS |
| T13 | ENSEIGNANT sans assiduite:lire | `403` | `403` | ✅ PASS |
| T14 | DIRECTION ne peut PAS saisir un retard | `403` | `403` | ✅ PASS |
| T15 | SECRETARIAT ne peut PAS saisir un retard | `403` | `403` | ✅ PASS |
| T16 | PARENT ne peut PAS saisir un retard | `403` | `403` | ✅ PASS |
| T17 | SURVEILLANT crée un retard (HTTP) | `200` | `200` | ✅ PASS |
| T18 | retard présent en base | `1` | `1` | ✅ PASS |
| T19 | audit « retard.saisi » écrit | `1` | `1` | ✅ PASS |
| T20 | SURVEILLANT crée une absence (HTTP) | `200` | `200` | ✅ PASS |
| T21 | absence présente en base | `1` | `1` | ✅ PASS |
| T22 | heures enregistrées | `2.00` | `2.00` | ✅ PASS |
| T23 | aucune notification générée (élève sans tuteur) | `0` | `0` | ✅ PASS |
| T24 | lecture HTTP | `200` | `200` | ✅ PASS |
| T25 | l'absence créée est bien lue | `true` | `true` | ✅ PASS |
| T26 | justification HTTP | `200` | `200` | ✅ PASS |
| T27 | statut modifié en base | `JUSTIFIEE` | `JUSTIFIEE` | ✅ PASS |
| T28 | motif enregistré | `certificat de test` | `certificat de test` | ✅ PASS |
| T29 | auteur de la justification tracé | `414899a0-2347-4615-b7d0-10352408c704` | `414899a0-2347-4615-b7d0-10352408c704` | ✅ PASS |
| T30 | audit « justifiee_en_lot » écrit | `1` | `1` | ✅ PASS |
| T31 | justification > 200 refusée | `422` | `422` | ✅ PASS |
| T32 | motif trop court refusé | `422` | `422` | ✅ PASS |
| T33 | suppression sans motif refusée | `422` | `422` | ✅ PASS |
| T34 | suppression HTTP | `200` | `200` | ✅ PASS |
| T35 | absence réellement supprimée en base | `0` | `0` | ✅ PASS |
| T36 | audit « absence.supprimee » écrit | `1` | `1` | ✅ PASS |
| T37 | seconde suppression (doublon) refusée proprement | `422` | `422` | ✅ PASS |
| T38 | 5 lectures simultanées | `5` | `5` | ✅ PASS |
| T39 | absences revenues à l'état initial | `2720` | `2720` | ✅ PASS |
| T40 | retards revenus à l'état initial | `2236` | `2236` | ✅ PASS |
| T41 | élèves revenus à l'état initial | `549` | `549` | ✅ PASS |
| T42 | aucune fixture résiduelle | `0` | `0` | ✅ PASS |
