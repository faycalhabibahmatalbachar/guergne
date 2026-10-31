# Architecture technique

Vue d'ensemble du School AI Agent et de son articulation avec `guergne`.
Transport : `whatsapp-web.js` (DT-001). Détail WhatsApp : [ARCHITECTURE_WHATSAPP.md](ARCHITECTURE_WHATSAPP.md).

---

## 1. Composants

```
WhatsApp ─(whatsapp-web.js)─► Passerelle (Node, 1 réplica, session sur volume)
                                     │ message normalisé
                                     ▼
   ┌─────────────────────────── Agent (service agent/) ───────────────────────────┐
   │ identité → idempotence → STT → NLU → validation → permission(pré-filtre)      │
   │ → confirmation(sensible) → exécution → vérification → compte rendu → audit    │
   └───────────────────────────────────┬──────────────────────────────────────────┘
                                        │ HTTP (GuergneHttpClient)
                                        ▼
                          guergne : POST /api/agent/{action}
                          guard (AUTH→RÔLE→PÉRIMÈTRE) ── autorité des droits
                                        │
                                   Postgres Neon (données scolaires — source de vérité)

   Base opérationnelle de l'agent (Neon dédié) : liens identité, contexte,
   journal d'audit, idempotence, planifications d'automatisation.
```

## 2. Séparation des responsabilités

- **Passerelle** : transport + normalisation uniquement. Aucune logique métier.
- **Agent** (`agent/`) : raisonnement, validation, pré-filtre de permission, confirmation,
  orchestration, audit. Indépendant du transport (interfaces injectées).
- **guergne** : **seule** source de vérité des données scolaires et **seule autorité**
  des droits (le `guard`). L'agent n'accède jamais à la base scolaire directement.
- **Base opérationnelle de l'agent** : uniquement l'état propre de l'agent (jamais une
  copie durable des données scolaires au-delà du contexte conversationnel borné).

## 3. Contrat de l'API agent (côté guergne — à implémenter)

Point d'intégration unique. Une route par action métier, derrière le `guard`.

```
POST {baseUrl}/api/agent/{action}
Headers:
  authorization: Bearer <SERVICE_TOKEN>      # authentifie le service agent
  x-acteur-id:   <uuid utilisateur guergne>  # l'opérateur au nom de qui on agit
Body:   JSON des paramètres de l'action
Réponse 2xx: { ok: boolean, message?: string, data?: any }
Réponse 403: droits insuffisants (le guard a refusé)
Réponse 4xx/5xx: échec — jamais présenté comme réussite (Règle 9)
```

- `x-acteur-id` permet au `guard` d'appliquer rôle **et portée** (PROPRES_CLASSES,
  PROPRES_ENFANTS) exactement comme pour une session web : **aucun privilège d'agent**.
- `SERVICE_TOKEN` authentifie le service, pas l'opérateur : les deux sont requis.
- Les `action` correspondent aux fonctions réelles (`enregistrerAppel`, `justifierEnLot`,
  `supprimerAbsence`, `listerAbsences`…). Côté agent, elles sont déjà câblées dans
  `agent/src/guergne-client.js` (testé avec un `fetch` factice).

**Décision ouverte** : exposer ces routes sous `/api/agent/*` **ou** réutiliser/étendre
l'`/api/mobile/*` existant (déjà pensé pour l'externe). À trancher après lecture de
`server/auth/session` (comment injecter un acteur côté service sans session navigateur).

## 4. État d'implémentation (preuves)

| Élément | État | Preuve |
|---|---|---|
| Cœur agent (orchestration, statuts, confirmation, audit) | ✅ codé + testé | `agent/`, 28 tests |
| Outils Assiduité + validations réelles | ✅ codé + testé | `agent/src/tools.js` |
| Matrice de permissions (reflet guergne) | ✅ codé + testé | `agent/src/permissions-matrix.js` |
| Client HTTP guergne (contrat ci-dessus) | ✅ codé + testé (fetch factice) | `agent/src/guergne-client.js` |
| Routes `/api/agent/*` côté guergne | ⏳ à implémenter | — |
| `WwebjsProvider` réel | ⏳ accès requis | numéro dédié, Chrome |
| STT Whisper / NLU LLM | ⏳ accès requis | modèle, clés |
| Stores persistants (Neon) | ⏳ à brancher | — |
| Infra Northflank | ⛔ accès requis | [AUDIT_NORTHFLANK.md](AUDIT_NORTHFLANK.md) |
