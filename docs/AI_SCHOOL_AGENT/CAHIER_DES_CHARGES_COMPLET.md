# Cahier des charges — School AI Agent

Référence fonctionnelle et technique du projet. Fondé sur l'audit
([AUDIT_EXISTANT.md](AUDIT_EXISTANT.md)) et les décisions ([DECISIONS_TECHNIQUES.md](DECISIONS_TECHNIQUES.md)).
Transport retenu : **`whatsapp-web.js`** (DT-001).

> Statut : **v0.1 (socle)**. Les sections marquées « → doc dédié » seront détaillées
> dans leur document propre. Rien n'est présenté comme implémenté : c'est une spécification.

---

## 1. Objectif et périmètre

Permettre à **2–3 responsables** de piloter la plateforme **guergne** par une seule
conversation WhatsApp (texte, vocal, documents), sans ouvrir l'interface web.

- **Source de vérité** : la base `guergne` (Neon). L'agent **n'écrit jamais en SQL
  direct** ; il appelle les API / services métier de `guergne` avec contrôle de droits
  côté backend (brief §10, [CARTOGRAPHIE_BACKEND.md](CARTOGRAPHIE_BACKEND.md)).
- **Hors périmètre** : migrer `guergne` ; remplacer l'interface web (elle reste la
  référence et l'outil des administrateurs techniques).

## 2. Acteurs, identité et permissions

- **Responsables** (directeur, secrétaire, surveillant, admin technique) écrivent au
  **numéro unique** de l'établissement depuis leur WhatsApp personnel.
- **Identification** : mapping **JID WhatsApp → compte interne `guergne`**, sur le modèle
  de la table `links` de `moov-ai/src/db.js`. Un numéro non lié est **refusé** (brief §3.1).
- **Permissions** : se **mappent** sur le RBAC existant de `guergne`
  (table `permissions`, migration `0012`), pas de rôles parallèles. Matrice configurable,
  **jamais codée en dur dans le prompt** (brief §3.1). → [MATRICE_PERMISSIONS.md](MATRICE_PERMISSIONS.md) (à venir).
- **Changement de numéro** : procédure de re-vérification (lien rompu → ré-association contrôlée).

## 3. Interactions WhatsApp

- **Entrant** : texte, **vocal** (cœur du projet), image, PDF, Word, Excel ;
  vidéo/contact/localisation si pertinent.
- **Sortant** : texte, **note vocale** (TTS), documents (PDF/Excel/Word générés par
  `guergne`), résumés, listes, rapports, notifications.
- **Interactivité** : boutons/listes natifs **non garantis** par `whatsapp-web.js` →
  **repli menus texte numérotés** (modèle `moov-ai/src/menus.js`), confirmations par
  mot-clé. Détails et limites : [ARCHITECTURE_WHATSAPP.md](ARCHITECTURE_WHATSAPP.md) §4.
- **Règle** : toute capacité non vérifiée a un **fallback texte** et n'est pas annoncée
  comme disponible sans test (brief §3.2).

## 4. Traitement vocal et multimodal

Pipeline (brief §3.3), réutilisant `moov-ai` (Whisper/Piper/ffmpeg) :

1. réception → 2. téléchargement média → 3. contrôle format/taille → 4. **transcription (STT)**
→ 5. détection de langue → 6. compréhension → 7. extraction d'entités → 8. vérification
→ 9. préparation → 10. exécution autorisée → 11. vérification du résultat → 12. réponse.

- Langues : **français** d'abord ; **arabe / arabe tchadien à évaluer** (`toumai-chadian-arabic`)
  — aucune promesse sans test (DT-004, PLAN_DE_TESTS à venir).
- Documents/images : compréhension des fiches administratives envoyées (OCR/parse) — à spécifier.

## 5. Moteur d'agent

Architecture professionnelle (brief §5), patron `moov-ai` adapté :

1. **Compréhension d'intention** (NLU, IA multi-providers avec repli — `moov-ai/src/config.js`).
2. **Planification** : décomposer une instruction complexe en étapes.
3. **Registre d'outils métier** : chaque outil appelle une API/service `guergne` (→ §7).
4. **Moteur de permissions** : vérification **côté backend** à chaque opération.
5. **Exécution** : moteur de flux à étapes (`key/prompt/parse` — `moov-ai/src/engine.js`),
   alimenté par **`prefill`** depuis la couche IA (sauter les étapes déjà extraites du vocal).
6. **Validation du résultat** sur la source officielle (brief Règle 9).
7. **Confirmation humaine** pour les opérations sensibles (→ §8).
8. **Contexte conversationnel** (sessions bornées, timeout — `moov-ai/src/engine.js`).
9. **Erreurs** sans divulgation de données sensibles.
10. **Reprise / idempotence / traçabilité** (→ §9, §10).

**Statuts d'une mission** : `RECEIVED → UNDERSTANDING → PLANNING → WAITING_APPROVAL →
EXECUTING → VERIFYING → COMPLETED | PARTIALLY_COMPLETED | FAILED | CANCELLED`.
Une réussite **partielle** n'est **jamais** présentée comme totale (brief §11).

## 6. Modules pilotables

Chaque module de `guergne` (eleves, classes, parents, personnel, emploi-du-temps,
assiduite, discipline, notes, bulletins, finances, communication, configuration) expose
un ensemble d'**outils** (lecture / écriture ordinaire / sensible). L'inventaire détaillé
— intentions, paramètres, validations, permissions, risques, confirmations, tests — est
le **[CATALOGUE_OUTILS_AGENT.md](CATALOGUE_OUTILS_AGENT.md)** (à venir).

**Module pilote proposé : Assiduité/Absences** — c'est le cas d'usage central du brief
(« enregistre l'absence de … en 3e A aujourd'hui ») et il s'appuie sur des tables claires
(`absences`, `retards`, `eleves`, `classes`). Il servira de bout-en-bout de référence
avant d'étendre aux autres modules (brief §3 Règle : un module n'est « fait » qu'une fois
ses tests de bout en bout réussis).

## 7. Catégories de sécurité (brief §10)

- **Lecture** : consultation des données autorisées.
- **Écriture ordinaire** : opérations explicitement autorisées, avec vérification du
  résultat et journalisation (ex. enregistrer une absence).
- **Opérations sensibles** → **confirmation forte obligatoire** : suppression, modification
  massive, résultats scolaires, décisions disciplinaires, données financières, communication
  collective, changement de permissions, toute action irréversible. **L'IA ne peut jamais
  s'autoriser elle-même.** Détail : [SECURITE_ET_AUDIT.md](SECURITE_ET_AUDIT.md) (à venir).

Règles dures : aucun SQL arbitraire depuis le modèle ; aucune permission fondée sur le
prompt ; contrôle des droits **côté backend** ; protection contre l'injection de prompt
(y compris via PDF/images reçus) et les pièces jointes malveillantes.

## 8. Fiabilité des exécutions (brief §11)

Idempotence (un même vocal envoyé deux fois n'enregistre pas deux absences), déduplication
par `id` de message, file de tâches persistante, retries avec backoff, reprise après
redémarrage, vérification de l'état final. Si le backend renvoie une erreur, l'agent ne
déclare **pas** la réussite.

## 9. Traçabilité et environnement de contrôle (brief §6)

Chaque action de l'agent est journalisée (Action ID, Run ID, horodatage, expéditeur
vérifié, identité, rôle, canal, message/transcription, intention, **justification
fonctionnelle** — pas le raisonnement interne du modèle —, outil, paramètres **expurgés
des secrets**, décision de permission, confirmation, état avant/après, différence,
résultat, modèle/version, durée, corrélation). Cet environnement articule la table
`journal_audit` existante de `guergne` et le journal propre de l'agent.
→ [OBSERVABILITE.md](OBSERVABILITE.md) et [SECURITE_ET_AUDIT.md](SECURITE_ET_AUDIT.md) (à venir).

Environnement de **test** : mode simulation / dry-run, données synthétiques, comptes de
test par rôle, scénarios vocaux, tests d'autorisation, de confirmation, de concurrence, de
doublons, d'injection. → [ENVIRONNEMENT_TEST.md](ENVIRONNEMENT_TEST.md) et [PLAN_DE_TESTS.md](PLAN_DE_TESTS.md) (à venir).

## 10. Automatisations (brief §7)

Moteur de tâches planifiées/événementielles : contrôle matinal des présences saisies,
rappels aux classes manquantes, seuils d'absences répétées, statistiques hebdo/mensuelles,
alertes techniques. Chaque automatisation : fréquence/déclencheur, conditions, responsable,
permissions, historique, état, reprise, désactivation ; les tâches sensibles passent par
validation humaine. → [AUTOMATISATIONS.md](AUTOMATISATIONS.md) (à venir).

## 11. Infrastructure

Passerelle WhatsApp Node (1 réplica, session sur volume persistant, > 512 Mo),
agent + workers, base opérationnelle Neon dédiée. Hébergement **Northflank** —
audit et déploiement **en attente d'accès** ([AUDIT_NORTHFLANK.md](AUDIT_NORTHFLANK.md)).

## 12. Critère de réussite (brief §17)

Démonstration bout-en-bout : un directeur envoie un vocal « vérifie les absences de toutes
les classes, identifie les enseignants qui n'ont pas saisi, enregistre les absences que je
te donne, prépare le bilan du jour » ; l'agent identifie l'émetteur, vérifie ses droits,
comprend le vocal, analyse, demande les précisions manquantes, exécute les opérations
autorisées, **vérifie chaque écriture dans `guergne`**, génère le bilan, le renvoie, et
**tout est retrouvable** dans l'environnement de contrôle.
