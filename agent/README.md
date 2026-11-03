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


## Mémoire conversationnelle Neon (v1)

La mémoire WhatsApp est désactivée par défaut. Elle s'active uniquement lorsque
`AGENT_MEMORY_ENABLED=true` et que les variables `AGENT_MEMORY_DATABASE_URL`,
`AGENT_MEMORY_ENCRYPTION_KEY` et `AGENT_MEMORY_HMAC_KEY` sont configurées dans
le fichier privé `/home/container/.env` sur Altare.

Les deux clés cryptographiques sont indépendantes et font 32 octets chacune
(base64 ou hexadécimal). Ne jamais les commiter ni les afficher dans les journaux.
Les contenus de messages et les paramètres conversationnels sont chiffrés avec
AES-256-GCM ; le JID WhatsApp et l'identifiant de message du fournisseur sont
stockés sous forme d'empreintes HMAC-SHA256. La fenêtre transmise au modèle est
limitée aux 12 derniers messages. Les faits mémorisés sont limités aux catégories
non sensibles autorisées ; les données scolaires restent consultées dans le
backend métier avec les permissions habituelles.

La migration `db/migrations/0037_memorisation_conversationnelle_whatsapp.sql`
est déjà appliquée sur la branche Neon de test `ai-school-agent-test`. Elle ne
doit être appliquée à `main` qu'après validation et approbation de la PR.
