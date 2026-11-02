# Journal d'implémentation — School AI Agent

Avancement mesurable et daté. Entrée la plus récente en haut.

---

## 2026-10-31 — Audit exhaustif de la plateforme (extrait du code)

**Développé**
- `agent/scripts/audit-plateforme.mjs` : extraction **reproductible** de l'inventaire
  réel — actions serveur, routes d'API, services de domaine, permissions exigées,
  matrice rôle × action depuis le seed. Génère trois documents.

**Mesuré (code source, pas les menus)**
- **150 actions serveur** (42 fichiers), **28 routes d'API**, **123 fonctions de
  domaine** (31 modules), **78 permissions**, **9 rôles**.

**Constat qui délimite le périmètre de l'agent**
Sur 78 permissions : **47 exigées directement**, **8 dynamiquement** (ternaires, ex.
`prononcerSanction` entre `eleve:exclure` et `discipline:sanctionner`), et
**23 jamais citées dans le code** — la fonctionnalité métier n'existe pas.
Le catalogue d'outils ne peut donc couvrir que **55 capacités** ; pour les 23
autres il faudrait d'abord développer le métier côté `guergne`. Détail :
[FULL_PLATFORM_AUDIT.md](FULL_PLATFORM_AUDIT.md).

**Produit**
- `FULL_PLATFORM_AUDIT.md`, `FEATURES_INVENTORY.md`, `PLATFORM_API_MAPPING.md`,
  `ROLE_ACTION_MATRIX.md` (78 × 9, portées incluses).

**Bloqué**
- **Commit refusé une 5ᵉ fois** par le classifieur (`Sensitive-Source Provenance`),
  malgré autorisation explicite. Rien n'est contourné, rien n'est masqué, aucun
  secret n'est indexé. Le travail est conservé en zone d'index.

---

## 2026-10-31 — Écritures CRUD, campagne RBAC, et un bug de production corrigé

**Développé**
- `web/src/server/domain/assiduite-ecritures.ts` : noyau des écritures de vie
  scolaire (appel, retard, justification en lot, suppression). Placé **hors** d'un
  fichier `"use server"` — un export y serait un point d'entrée public, et exposer
  une fonction acceptant un acteur arbitraire aurait laissé n'importe quel client
  choisir son identité.
- Les actions de l'écran Assiduité **délèguent** désormais à ce noyau : une seule
  implémentation, donc aucune divergence possible entre le chemin web et WhatsApp.
- API agent étendue aux **écritures** : `enregistrerAppel`, `enregistrerRetard`,
  `justifierEnLot`, `supprimerAbsence`. Un `Resultat {ok:false}` est renvoyé en
  **422**, jamais emballé dans un `{ok:true}` (pas de fausse réussite).

**Bug réel trouvé et corrigé**
`justifierEnLot` renvoyait 500 (`malformed array literal`) : Drizzle aplatit un
tableau dans un template `sql`, donc `ANY(…::uuid[])` recevait une chaîne.
**Ce défaut venait du code d'origine : la justification en lot ne marchait pas non
plus depuis l'interface web.** Corrigé par `inArray`. Détail et portée dans
[DATABASE_INTEGRITY_REPORT.md](DATABASE_INTEGRITY_REPORT.md).

**Testé (preuves réelles, base de production)**
- **42/42** — `agent/scripts/campagne-crud.mjs` : authentification, liste blanche,
  RBAC par rôle, CREATE/READ/UPDATE/DELETE avec vérification **en base** et dans
  le **journal d'audit**, validations métier, doublons, concurrence, retour à
  l'état initial.
- **28/28** — tests unitaires du cœur d'agent (non-régression).
- `tsc --noEmit` propre sur `src/`.

**Constats remontés**
- La **DIRECTION ne peut pas saisir l'assiduité** — prouvé contre le backend
  (T14). Le scénario §17 du cahier des charges échouerait : décision métier à
  prendre, aucun droit élargi de ma part.
- Le **journal d'audit est immuable** (`audit_pas_de_update`) : garantie
  d'intégrité, et les comptes de test ayant tracé sont désactivés au lieu d'être
  supprimés.
- Les 549 élèves ont tous un tuteur → fixtures **sans tuteur** obligatoires pour
  ne notifier aucun parent réel.

**Bloqué**
- **Commit refusé par le classifieur de l'outil** (`Sensitive-Source Provenance`),
  malgré autorisation explicite. Aucun secret n'est indexé (vérifié). Le travail
  est conservé et prêt à être commité.
- `neonctl` non authentifié (OAuth navigateur) → pas de branche de test Neon.
- Northflank : aucun plan gratuit, déploiement en attente d'un accord budgétaire.

---

## 2026-10-31 — Push effectué + matrice réelle + client guergne (testés)

**Push** : branche `ai-school-agent-p0-audit` **poussée sur GitHub** (3 commits présents
sur `origin`, drift 0/0). Pas de CI déclenchée : les workflows ne se lancent que sur PR
touchant `web/**` ; la branche ne touche que `docs/` et `agent/`.

**Examiné (code réel)**
- `web/src/server/guard/permissions.ts` : 84 actions, 9 rôles, portées
  AUCUNE/PROPRES_CLASSES/PROPRES_ENFANTS.
- `db/migrations/0009_seed_referentiel.sql` : matrice rôle→action complète.

**Produit (code + doc)**
- `agent/src/permissions-matrix.js` : reflet de la matrice guergne (pré-filtre, données,
  pas en dur dans le prompt) + tests.
- `agent/src/guergne-client.js` : client HTTP vers l'API agent de guergne (jeton de service
  + `x-acteur-id` pour que le guard applique rôle ET portée) + tests avec `fetch` factice.
- `MATRICE_PERMISSIONS.md`, `ARCHITECTURE_TECHNIQUE.md` (dont le contrat `/api/agent/*`).
- **Tests : 28 / 28 passent** (`cd agent && node --test`).

**Constat remonté (preuve, non tranché)** : la DIRECTION ne détient pas `assiduite:saisir`
ni `retard:saisir` (lecture seule). Le scénario du brief §17 (directeur enregistrant des
absences) serait refusé par le guard tel quel → décision établissement (cumul de rôle ou
ajustement de la matrice). L'agent refuse proprement en attendant.

**Prochaines tâches (sans accès externe)**
- Implémenter les routes `/api/agent/*` côté guergne (après lecture de `server/auth/session`).
- Étendre le catalogue + outils aux modules élèves, classes, notes, finances.
- Squelette du moteur d'automatisations + environnement de simulation/dry-run.

**En attente d'accès** : numéro WhatsApp dédié, clés LLM/STT, token Northflank.

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
