# Journal d'implémentation — School AI Agent

Avancement mesurable et daté. Entrée la plus récente en haut.

---

## 2026-10-31 — Audit Assiduité + cœur d'agent testé (code réel)

**Examiné (code réel de guergne)**
- `web/src/app/(main)/dashboard/assiduite/actions.ts` : `enregistrerAppel`,
  `enregistrerRetard`, `justifierEnLot`, `supprimerAbsence`, `signalerIncident`,
  `prononcerSanction`, `marquerSanctionExecutee` — avec leurs schémas et règles.
- `web/src/server/domain/vie-scolaire.ts` : lectures (`listerAbsences`, `listerAlertes`,
  `listerRetards`, `listerIncidents`, `listerSanctions`, `statistiquesVieScolaire`…).
- `web/src/server/guard` : `requirePermission` (AUTH → RÔLE → PÉRIMÈTRE), autorité réelle.
- Permissions réelles : `assiduite:lire|saisir|justifier`, `retard:saisir`,
  `discipline:signaler|sanctionner`, `eleve:exclure`.

**Produit (code)**
- Nouveau service `agent/` (Node ESM, sans dépendance) : `provider`, `normalize`,
  `identity`, `idempotency`, `audit`, `guard`, `tools` (outils Assiduité), `engine`.
- Tests `agent/test/` : **18 tests, 18 passent** (`node --test`).
- Doc `CATALOGUE_OUTILS_AGENT.md` (Assiduité : outils, scénarios, validations, tests).

**Preuves**
- `cd agent && node --test` → `tests 18 / pass 18 / fail 0`.
- Scénarios couverts : refus numéro inconnu, idempotence, écriture tracée avant/après,
  droit manquant bloqué, params invalides sans écriture, suppression sensible confirmée,
  annulation, clarification, transcription vocale, échec backend non maquillé en réussite.

**Bloqué / en attente d'accès**
- **Push de la branche** `ai-school-agent-p0-audit` : refusé par le classifieur du mode
  auto de l'outil (« Out-of-Place Publication »), bien qu'autorisé par l'utilisateur.
  Commits présents en local ; à pousser via approbation ou `git push` manuel.
- Branchement réel (whatsapp-web.js, STT Whisper, client HTTP guergne, LLM, stores Neon)
  en attente des accès correspondants (numéro dédié, clés, API agent côté guergne).

**Prochaines tâches (auto-enchaînées)**
- Implémenter le client guergne réel (HTTP) + décider API mobile vs API agent dédiée.
- Brancher le NLU (interpret) et le STT derrière les interfaces.
- Étendre le catalogue aux autres modules (élèves, classes, notes, finances…).
- Débloquer Northflank pour l'infra.

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
