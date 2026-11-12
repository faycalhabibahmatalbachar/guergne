# Supervision de l'agent

Code : `agent/src/supervision.js`. Tests : `agent/test/supervision.test.js`. Route : `GET /diagnostic/supervision` sur l'agent.

## Ce qu'elle permet de savoir

| Question | Champ du rapport |
|---|---|
| Quels outils servent le plus, le moins ? | `outilsLesPlusUtilises`, `outilsLesMoinsUtilises` |
| Quels outils échouent ? | `outilsQuiEchouent` (taux d'échec, écritures non vérifiées) |
| Quelles demandes ne sont pas comprises ? | `demandesMalComprises` (plan rejeté, et pourquoi), `intentions`, `rejets` |
| Où la résolution d'entité bloque-t-elle ? | `erreursDeResolution` (outil, champs, nombre de candidats) |
| Qu'est-ce qui est lent ? | `operationsLentes` (plus de 8 s), `outilsLents` |
| Quelles erreurs rend le backend ? | `erreursBackend` (outil, nature de l'erreur) |
| Quelles conversations ont été interrompues ? | `conversationsInterrompues` |
| Combien de confirmations attendent ? | `confirmationsEnAttente`, `memoire.etatsEnAttente` |
| Que s'est-il passé dans une conversation ? | `dernieresConversations` : suite d'étapes typées |
| L'agent travaille-t-il seul ? | `autonomie` (opérations automatiques, confirmations demandées) |
| Quel fournisseur de modèle répond ? | `ia` (statut, appels, latence, jetons par fournisseur) |

Une conversation tracée ressemble à ceci :

```json
{ "run": "run_x", "intention": "outil", "outil": "eleves.fiche", "role": "DIRECTION",
  "etapes": [{ "etape": "intention:outil:eleves.fiche", "ms": 1900 }, { "etape": "resolution:clarifier" }],
  "resultat": "CLARIFICATION", "dureeMs": 2400 }
```

## Ce qui n'y entre pas

Aucun texte de message, aucun paramètre d'outil, aucun nom, aucun numéro, aucun jeton, aucun QR. Une erreur du backend est réduite à sa nature (`droits`, `introuvable`, `reseau`, `erreur_interne_backend`, `parametre_refuse`, `ecritures_desactivees`, `verification`, `refus_metier`), parce que son texte peut nommer quelqu'un. C'est testé : le rapport ne doit contenir ni nom ni paramètre.

Le journal d'audit en mémoire, qui lui porte messages et paramètres, est désormais borné à 500 entrées.

## Lire le rapport

```bash
curl -s -H "Authorization: Bearer $AGENT_SERVICE_TOKEN" http://<agent>/diagnostic/supervision
```

Le jeton de service est exigé. Le rapport est en mémoire : il repart de zéro à chaque redémarrage (`depuis` donne l'heure de départ).

## Ce qui manque

- **Pas d'écran.** Le rapport est un JSON ; l'écran d'administration (`/dashboard/parametres/whatsapp`) ne l'affiche pas encore.
- **Pas d'historique.** Rien n'est persisté : la supervision décrit le processus en cours.
- **Pas d'alerte.** Aucun seuil ne prévient quelqu'un.

Pour une analyse fine d'une demande précise, le banc (`npm run agent:parler`) rejoue la conversation avec la trace complète, sur la base de test.
