# Journal d'implémentation — School AI Agent

Avancement mesurable et daté. Entrée la plus récente en haut.

---

## 2026-10-31 — P0 : décision transport + socle de spécification

**Décidé**
- **DT-001 : transport WhatsApp = `whatsapp-web.js`** (choix de l'établissement), risque
  de bannissement accepté, mitigé par l'abstraction `WhatsAppProvider` + numéro dédié +
  débit limité + plan de bascule Cloud API.

**Examiné (code réel, via API GitHub)**
- `moov-ai/src/{engine,router,security,config,db}.js` : moteur de flux à étapes avec
  `prefill` (pont NLU→exécution), routeur indépendant du transport, IA multi-providers
  avec rotation/repli, table `links` (JID→compte), `tx()` atomique, PIN/OTP sans log.

**Produit**
- `DECISIONS_TECHNIQUES.md`, `ARCHITECTURE_WHATSAPP.md`, `CAHIER_DES_CHARGES_COMPLET.md` (v0.1 socle).
- README index mis à jour.

**Actions restantes**
- Détail par doc : CATALOGUE_OUTILS_AGENT (module pilote Assiduité d'abord), MATRICE_PERMISSIONS,
  SECURITE_ET_AUDIT, OBSERVABILITE, ENVIRONNEMENT_TEST, PLAN_DE_TESTS, AUTOMATISATIONS,
  ARCHITECTURE_TECHNIQUE, ROADMAP.
- Décisions ouvertes : DT-002 numéro dédié ; budget IA/STT.
- Débloquer Northflank pour compléter son audit.

---

## 2026-10-31 — P0 : audit de l'existant (1er passage)

**Examiné**
- Dépôt local `guergne` : fichiers suivis, contenu, historique git `--all`.
- Les 32 dépôts du compte GitHub (métadonnées).
- Manifestes réels de `moov-ai`, `canalplus-whatsapp-bot`, `toumai-whatsapp-calling` (via API GitHub).
- Structure backend de `guergne` : tables Drizzle, migrations, modules, API, couche serveur.
- Disponibilité de l'accès Northflank.

**Produit** (branche `ai-school-agent-p0-audit`)
- `docs/AI_SCHOOL_AGENT/` : `README.md`, `AUDIT_EXISTANT.md`, `INVENTAIRE_WHATSAPP.md`,
  `INVENTAIRE_TOUMAI_AI.md`, `CARTOGRAPHIE_BACKEND.md`, `AUDIT_NORTHFLANK.md`, ce journal.
- Mémoire de session mise à jour (compte GitHub récupéré).

**Résultats clés (preuves dans les docs)**
- `guergne` ne contient **aucune** brique WhatsApp/IA (fichiers, contenu, historique).
- Précédents WhatsApp **fonctionnels** : `moov-ai` et `canalplus-whatsapp-bot`, tous deux
  sur **`whatsapp-web.js`** (pas Baileys, pas wa-automate — description obsolète corrigée).
- `moov-ai` apporte un patron d'agent + pipeline vocal (Whisper/Piper/ffmpeg) + IA
  multi-providers (Groq/Gemini/Mistral/OpenRouter). `canalplus-whatsapp-bot` apporte la
  persistance de session et des templates Northflank.
- Backend `guergne` mûr : ≈60 tables, 12 modules, `journal_audit` + `permissions` + API
  mobile déjà en place → points d'ancrage pour l'agent.

**Bloqué**
- **Northflank** : aucun accès (CLI/token/config absents). Voir `AUDIT_NORTHFLANK.md`.

**Décisions en attente de l'établissement** (voir `AUDIT_EXISTANT.md` §6)
- Transport WhatsApp : `whatsapp-web.js` (réutilisable, non officiel, risque de bannissement)
  vs **WhatsApp Business Cloud API** (officielle, payante).
- Numéro dédié ; premier module livré (recommandé : assiduité) ; budget IA/STT/hébergement.

**Actions restantes**
- Cloner `moov-ai` + `toumai-web` pour confirmer le moteur réutilisable (endpoints, mémoire, STT).
- Lire `web/src/server/guard` et `server/domain` pour trancher API mobile vs API agent dédiée.
- Rédiger `CAHIER_DES_CHARGES_COMPLET.md` une fois les décisions §6 cadrées.
- Débloquer Northflank (token/CLI/connecteur) pour compléter son audit.
