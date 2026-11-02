# Session d'exécution intensive — 31 octobre 2026

Branche : `ai-school-agent-p0-audit`. Objectif : passer de la spécification à
l'exécution technique (configuration, intégration, déploiement, validation).

---

## LOT 0 — Accès vérifiés

| Ressource | État | Preuve |
|---|---|---|
| Git / branche | ✅ `ai-school-agent-p0-audit`, sync `origin` | drift 0/0, HEAD `5d789f2` |
| Node.js | ✅ v24.16.0 | `node --version` |
| GitHub | ✅ `faycalhabibahmatalbachar`, scopes repo/workflow | `gh auth status` |
| Northflank CLI | ✅ v0.15.0, authentifié | `northflank list projects` → projet `default` |
| Neon | ✅ connexion réelle vérifiée | lecture sur la base (voir LOT 3) |
| Clé IA | ✅ **Groq** (et non xAI) | `/v1/models` HTTP 200 |

## LOT 1 — Clés IA : audit et validation réelle

### Correction factuelle importante
`grok.env` ne contient **qu'une variable** (`grok_api`). Malgré son nom, **ce n'est
pas une clé xAI/Grok** : elle ne commence pas par `xai-` et l'API xAI la refuse
(HTTP 400). Testée contre quatre fournisseurs, elle est **valide chez Groq** (HTTP 200)
et refusée par OpenRouter/Mistral/OpenAI (401). C'est exactement la confusion
Grok ≠ Groq annoncée dans le brief.

### Sécurité du secret
`grok.env` n'était **pas** couvert par `.gitignore` (les motifs `.env`/`.env.*` ne
matchent pas `grok.env`). Corrigé : ajout de `grok.env` et `*.env`. Vérifié par
`git check-ignore` et absent de tout l'historique (`git log --all -- grok.env` vide).
Aucune valeur de clé n'a été affichée ni passée en argument de commande (fichier de
config `curl` hors dépôt).

### Modèles réellement disponibles sur le compte Groq
- **STT** : `whisper-large-v3`, `whisper-large-v3-turbo`
- **LLM** : `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`, `allam-2-7b` (arabe)
- **TTS** : `canopylabs/orpheus-arabic-saudi`, `canopylabs/orpheus-v1-english`

→ **Une seule clé couvre LLM + STT + TTS arabe.** Architecture simple et économique :
pas besoin d'un second fournisseur pour démarrer.

### Test LLM réel (extraction d'intention)
Modèle `openai/gpt-oss-120b`, température 0, sur la phrase du critère final :
« Vérifie les absences de toutes les classes et enregistre l'absence de Mahamat Adam
en 3e A aujourd'hui. » → réponse :

```json
{"tool":"assiduite.enregistrer_appel","params":{"dateAbsence":"2026-10-31","classe":"3e A","eleve":"Mahamat Adam"}}
```

Outil et paramètres corrects, date relative résolue. 699 tokens.

### Test STT réel (français)
Vocal généré localement (voix Windows `Microsoft Hortense`, fr-FR, 195 Ko) puis
transcrit par les deux modèles, **~1,4 s** chacun :

> « Enregistre l'absence de **Mahama** Adam en troisième **à** aujourd'hui. »

**Constat déterminant** : même avec une voix de synthèse nette, le STT mutile
le **nom propre** (`Mahamat` → `Mahama`) et la **désignation de classe**
(`3e A` → `troisième à`). Avec un accent tchadien réel, ce sera pire.

→ **Conséquence de conception (validée par la preuve)** : l'agent ne doit jamais
agir sur le texte brut du STT. Il doit résoudre l'élève et la classe par
**correspondance floue sur la liste réelle** (`listerElevesClasse`) puis faire
**confirmer** avant écriture. C'est déjà la règle du `CATALOGUE_OUTILS_AGENT`;
elle est maintenant appuyée par un test.

## LOT 2 — Northflank : ⛔ bloqué par une décision de facturation

Projet `default` **entièrement vide** (0 service, 0 addon, 0 volume, 0 groupe de
secrets) — aucun risque de doublon.

**Aucun plan gratuit n'existe sur ce compte** (`amountPerMonth == 0` → 0 résultat) :

| Plan | CPU | RAM | Coût |
|---|---|---|---|
| `nf-compute-10` | 0,1 | 256 Mo | 2,70 $/mois |
| `nf-compute-20` | 0,2 | 512 Mo | 5,40 $/mois |
| `nf-compute-50` | 0,5 | 1 Go | **12 $/mois** |
| `nf-compute-100-2` | 1 | 2 Go | 24 $/mois |

Or `whatsapp-web.js` lance **Chromium** : 512 Mo ont provoqué des OOM sur
`canalplus-whatsapp-bot` (preuve dans `session-store.js`). Le minimum viable est donc
**1 Go**, soit `nf-compute-50` à **12 $/mois**, plus le stockage persistant de la
session WhatsApp.

**Je n'ai créé aucun service** : la consigne est de ne pas engager d'abonnement payant
sans autorisation explicite. Ce n'est pas un blocage technique mais budgétaire.

→ **Une seule décision attendue** : autoriser ~12 $/mois (architecture mono-service :
passerelle + agent + worker dans un seul conteneur, le plus économique) ou indiquer un
autre plafond. Dès l'accord, je crée et déploie.

## LOT 3 — Neon : connexion vérifiée sur la base réelle

Lecture effectuée (aucune écriture) :

```
PostgreSQL 17.11 — base neondb — rôle neondb_owner
eleves 549 | classes 15 | inscriptions 549 | absences 2720
retards 2236 | permissions 211 | journal_audit 1006 | periodes 3
```

**Constat de sécurité** : la connexion applicative utilise `neondb_owner`
(propriétaire). Le brief demande de ne pas employer un superutilisateur quand un rôle
restreint suffit → prévoir un rôle dédié en lecture/écriture limitée pour le service agent.

**Branche de test Neon** : non créée — nécessite la clé API Neon (présente comme secret
GitHub `NEON_API_KEY`, dont la valeur n'est pas lisible depuis ici) ou `neonctl`
authentifié. Ne pas tester sur la production : à débloquer avant les tests d'écriture.

## LOT 4 — API agent dans guergne : implémentée et testée en réel

### Ce qui a été construit
- `web/src/server/auth/session.ts` → **`principalParId(utilisateurId)`** : charge un
  `Principal` sans cookie, avec les mêmes contrôles (compte actif, rôle habilité).
- `web/src/server/guard/index.ts` → **`exigerPermissionPour(principal, action, perimetre)`** :
  extraction du contrôle existant pour l'appliquer à un `Principal` déjà résolu.
  `requirePermission` y délègue — **comportement inchangé**, aucune duplication de la
  logique de sécurité.
- `web/src/app/api/agent/[action]/route.ts` → **l'API agent**.

### Principes de sécurité appliqués
- **Deux authentifications** : `Authorization: Bearer <AGENT_SERVICE_TOKEN>` pour le
  service, `x-acteur-id` pour la personne au nom de qui on agit. Le jeton de service ne
  confère **aucun** droit métier.
- **Liste blanche** d'opérations : le modèle choisit un nom dans une liste, jamais une
  requête. Tout nom hors liste → 404. Aucun SQL arbitraire possible.
- Comparaison du jeton **à temps constant**, `cache-control: no-store`, pas de trace
  d'erreur renvoyée au client, refus total si `AGENT_SERVICE_TOKEN` n'est pas configuré.
- Première livraison volontairement **en lecture seule** (8 opérations). Les écritures
  viendront après extraction d'un noyau commun avec les actions serveur, pour qu'il
  n'existe jamais deux chemins d'écriture divergents.

### Tests HTTP réels (serveur lancé, base réelle)

| Cas | Attendu | Obtenu |
|---|---|---|
| Sans jeton | 401 | ✅ 401 |
| Mauvais jeton | 401 | ✅ 401 |
| Jeton valide, sans `x-acteur-id` | 400 | ✅ 400 |
| Acteur de rôle **PARENT** | 403 | ✅ 403 |
| Action hors liste blanche | 404 | ✅ 404 |
| SUPER_ADMIN, `listerAbsences` | 200 + données | ✅ 200 (Zenaba TOGBE, LGR-2025-1056, 6ème B) |

`npx tsc --noEmit` : **aucune erreur**. Biome : propre sur les fichiers touchés.

### Démonstration bout-en-bout (lecture) — `agent/scripts/e2e-lecture.mjs`

Chaîne réelle, sans simulation hormis le transport WhatsApp :

```
message → NLU Groq (gpt-oss-120b) → moteur d'agent → GuergneHttpClient
        → POST /api/agent/listerAbsences → base Neon réelle
STATUT   : COMPLETED
OUTIL    : assiduite.consulter_absences
PERM     : OK:assiduite:lire
DONNEES  : 100 lignes réelles (Zenaba TOGBE 6ème B, Mariam BENDOUNGA 5ème A, …)
```

**Défaut relevé** : le LLM n'a pas transmis le paramètre `limite` (« 3 dernières »
ignoré, 100 lignes renvoyées). À corriger par un prompt d'outillage plus strict et une
validation de complétude des paramètres.

### Fournisseur de repli
Le fichier de clés (renommé `ai_apikey.env` en cours de session) contient aussi
`mistral_ai` : clé **valide** (55 modèles). Un repli Groq → Mistral est donc possible.

### Non-régression
Suite du service agent : **28 tests, 28 passent**.

## Interventions attendues de votre part (une ligne chacune)

1. **Northflank** : autoriser ~12 $/mois (`nf-compute-50`) pour le service unique, ou fixer un autre plafond.
2. **Neon** : fournir `neonctl` authentifié ou la clé API, pour créer une **branche de test** (indispensable avant tout test d'écriture).
3. **WhatsApp** : numéro dédié + scan du QR, le moment venu.

Tout le reste avance sans vous.
