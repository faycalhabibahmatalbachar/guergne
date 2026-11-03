# School AI Agent — service

Agent qui pilote la plateforme **guergne** par WhatsApp. Ce dossier contient le
**cœur indépendant du transport** : tout le raisonnement, les permissions,
l'exécution et l'audit, testables **hors ligne** (sans WhatsApp, STT ni base).

Spécification : [`../docs/AI_SCHOOL_AGENT/`](../docs/AI_SCHOOL_AGENT/).

## Lancer les tests

```bash
cd agent
npm test     # = node --test  (aucune dépendance à installer)
```

État au 2026-10-31 : **18 tests, 18 passent.**

## Ce qui est construit et testé (réel)

| Brique | Fichier | Testé |
|---|---|---|
| Interface `WhatsAppProvider` + `FakeProvider` | `src/provider.js` | ✅ |
| Normalisation des messages entrants | `src/normalize.js` | ✅ |
| Identité JID → compte interne (refus des inconnus) | `src/identity.js` | ✅ |
| Idempotence (anti-doublon) | `src/idempotency.js` | ✅ |
| Journal d'audit + expurgation des secrets | `src/audit.js` | ✅ |
| Sensibilité + pré-filtre de permission | `src/guard.js` | ✅ |
| Registre d'outils + outils Assiduité (validations réelles) | `src/tools.js` | ✅ |
| Moteur d'orchestration (statuts, confirmation, exécution vérifiée) | `src/engine.js` | ✅ |

Les validations des outils Assiduité reprennent **à l'identique** celles du code
guergne (`nbHeures 0.5–12`, `dureeMinutes 0–480`, justification ≤ 200, motif ≥ 3).

## Ce qui reste à brancher (nécessite un accès ou une brique externe)

Ces éléments sont prévus **derrière les interfaces déjà en place** ; ils ne sont
pas branchés car ils demandent un accès que l'environnement actuel n'a pas :

- **`WwebjsProvider`** (whatsapp-web.js réel) — implémente `WhatsAppProvider`.
  Nécessite Chrome/Puppeteer + un **numéro WhatsApp dédié** (DT-002).
- **STT Whisper** (`transcribe`) — réutilise `moov-ai/whisper-space`.
- **Client guergne HTTP réel** (`guergne.*`) — appelle les actions/API de la
  plateforme avec authentification de service. Nécessite une **API agent** côté
  guergne (ou la réutilisation de l'API mobile) et son URL/clé.
- **NLU** (`interpret`) — appel LLM multi-providers (modèle `moov-ai/src/config.js`).
  Nécessite les clés (Groq/Gemini/Mistral/OpenRouter).
- **Stores persistants** — identité, idempotence et audit en base (Neon), à la
  place des versions mémoire.

Aucune de ces briques n'est présentée comme opérationnelle tant qu'elle n'est pas
branchée et testée (Règle 9).


## Mémoire conversationnelle Neon

La mémoire WhatsApp est désactivée par défaut. Elle s'active uniquement lorsque
`AGENT_MEMORY_ENABLED=true` et que les variables privées
`AGENT_MEMORY_DATABASE_URL`, `AGENT_MEMORY_ENCRYPTION_KEY` et
`AGENT_MEMORY_HMAC_KEY` sont configurées sur Altare.

Les messages entrants sont d'abord enregistrés comme métadonnées. Après
classification de l'intention, le texte n'est conservé que pour une conversation
générale non scolaire, si `AGENT_MEMORY_STORE_GENERAL_CHAT=true`, et si le
filtre de sécurité ne détecte ni données scolaires ni identifiants. Cette option
est désactivée par défaut. Les demandes sur les élèves, les dossiers, les notes,
les absences, les retards et les résultats métier ne sont donc pas réinjectés
dans le contexte du modèle. Les réponses issues du backend ne sont pas conservées
comme contenu conversationnel.

Les états de clarification et de confirmation nécessaires à la reprise après
redémarrage restent chiffrés et expirent après 48 heures. Les messages autorisés
ont une rétention de 30 jours. Les préférences durables sont limitées à trois
valeurs explicitement demandées : langue, style de réponse et format des rapports.
Aucun fait sur un élève n'est accepté par l'API de mémoire durable.

Commandes WhatsApp disponibles lorsque la mémoire est activée :
- `Retiens que je préfère les réponses courtes`
- `Retiens que je préfère le français`
- `Retiens que je préfère les rapports au format PDF`
- `Mémoire` pour consulter les préférences enregistrées
- `Oublie ma mémoire` pour effacer les préférences, résumés, messages et états du compte authentifié

Le contenu des messages et les paramètres temporaires sont chiffrés avec
AES-256-GCM ; les JID et identifiants de messages fournisseur sont stockés sous
forme d'empreintes HMAC-SHA256. Les clés doivent être indépendantes (32 octets),
stockées dans les variables privées d'Altare et jamais commitées.

La migration `0037_memorisation_conversationnelle_whatsapp.sql` est installée
sur la branche Neon de test `ai-school-agent-test`. Elle n'est pas appliquée à
`main` et la mémoire n'est pas activée en production.
