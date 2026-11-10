# Passation — Claude Code compte 1 → compte 2

**Lycée Guergné La Renaissance** · rédigé le 2026-11-10 · branche `voix-bidirectionnelle`

Ce document est le point d'entrée unique. Il ne contient **aucun secret**. Les
chiffres qu'il cite ont été mesurés ; ceux qui ne l'ont pas été sont dits tels.
Le prompt à donner à la nouvelle session est dans
[`PROMPT_REPRISE_CLAUDE_COMPTE_2.md`](PROMPT_REPRISE_CLAUDE_COMPTE_2.md).

Statuts employés : **VALIDÉ** (preuve d'exécution disponible) · **PARTIEL** ·
**NON VALIDÉ** · **BLOQUÉ** (accès ou décision).

---

## A. Le projet et son architecture réelle

Plateforme de gestion scolaire + assistant IA sur WhatsApp pour la direction.

```
                     ┌────────────────────────── Neon PostgreSQL ──────────────────────────┐
                     │  br-red-waterfall  (production présumée)   br-calm-art  (dev / test) │
                     └───────────────▲──────────────────────────────────────▲──────────────┘
                                     │ SQL (Drizzle)                         │
   web/  (Next.js 16, Turbopack) ────┘  ← seul composant qui parle à Neon    │
     ├─ interface d'administration                                           │
     └─ POST /api/agent/{action}  ← jeton de service + x-acteur-id           │
              ▲                                                               │
              │ HTTP (GuergneHttpClient)                                      │
   agent/ (Node.js) ──────────────────────────────────────────────────────────┘ (jamais directement)
     ├─ WhatsApp : whatsapp-web.js 1.34.7 + Puppeteer + Chromium (LocalAuth)
     ├─ IA : Groq (STT + LLM), OpenRouter / Mistral en repli
     ├─ Voix : Piper (fr_FR-siwis, ar_JO-kareem) + FFmpeg/FFprobe
     └─ ResponseOrchestrator : TEXT_ONLY par défaut
```

- **L'agent ne touche jamais Neon.** Il appelle le backend, qui applique
  AUTH → RÔLE → PÉRIMÈTRE. Ce principe n'est pas négociable.
- **Production** : backend sur Vercel (`lycee-guergne-renaissance.vercel.app`,
  projet `prj_o5eaz…`) ; agent WhatsApp sur Altare (`node /home/container/index.js`
  → `app.js`).
- **Développement** : Windows, `C:\Users\hp\Desktop\Projects\lycee-renaissance`.
  Le profil WhatsApp `LocalAuth` est un profil Chrome **Windows** (pas WSL).

## B. Ce qui a été développé (par ordre chronologique de la branche)

| Chantier | Statut | Où |
|---|---|---|
| Téléchargement des notes vocales (`mimetype` manquant → `InvalidMediaFileType`) | VALIDÉ sur une vraie note reçue | `agent/src/providers/wwebjs.js`, `agent/scripts/rustine-wwebjs.mjs` |
| FFmpeg 9.0.2 / FFprobe installés sous Windows | VALIDÉ | `C:\Users\hp\.local\ffmpeg\…\bin` |
| Piper sous Windows (wheel par plate-forme) | VALIDÉ (fr + ar générés) | `agent/src/voix/installation.js` |
| ResponseOrchestrator : une réponse, texte par défaut, présence, file, idempotence | VALIDÉ EN LOCAL | `agent/src/reponse/*` |
| Barrière anti-rejeu de l'historique WhatsApp au démarrage | VALIDÉ EN LOCAL | `agent/src/providers/wwebjs.js` (`_surMessage`) |
| Année scolaire 2026-2027 (migration 0040) | VALIDÉ, **sur br-red-waterfall seulement** | `db/migrations/0040_*.sql` |
| Outils emploi du temps, classes, année courante | VALIDÉ (recette réelle 13/13) | `agent/src/tools-pilotage.js` |
| Identification de la branche de production | PARTIEL (preuve indirecte) | `agent/scripts/identifier-branche-production.mjs` |
| **CRUD élèves et classes pour l'agent** | VALIDÉ sur la base de test (45/45) | voir C |

Historique détaillé : [`MASTER_VALIDATION_METIER.md`](MASTER_VALIDATION_METIER.md),
[`REPRISE_SESSION_VOCALE.md`](REPRISE_SESSION_VOCALE.md).

## C. Le CRUD élèves et classes

Les écritures **existaient déjà** dans les actions de l'interface web. Elles ont été
**empruntées**, pas réécrites : l'agent passe par l'action web exacte, exécutée au
nom d'un acteur vérifié. Détail : [`CRUD_AGENT.md`](CRUD_AGENT.md).

```
WhatsApp → agent : preparer → récapitulatif → « oui » net → exécuter → verifier
   → POST /api/agent/{action}              jeton + x-acteur-id
   → principalParId                         compte actif, rôle habilité
   → exigerPermissionPour                   matrice + périmètre
   → executerEnTantQue(acteur, actionWeb)   web/src/server/auth/acteur-delegue.ts
        → requirePermission                 2ᵉ contrôle par l'action elle-même
        → transaction + audit               au nom de l'acteur réel
```

Archiver, jamais détruire : `supprimerClasse` (un `DELETE` en cascade) n'est
**pas** exposé — la route répond 404.

## D. Routes et opérations exposées à l'agent

Une seule route : `POST /api/agent/{action}` (`web/src/app/api/agent/[action]/route.ts`).
Registre : `web/src/server/agent/operations.ts` — **35 lectures, 11 écritures**
(compté dans le fichier le 2026-11-10).

| Écritures | Droit requis |
|---|---|
| `enregistrerAppel`, `supprimerAbsence` | `assiduite:saisir` |
| `enregistrerRetard` | `retard:saisir` |
| `justifierEnLot` | `assiduite:justifier` |
| `inscrireEleve` | `eleve:inscrire` |
| `modifierEleve`, `archiverEleve` | `eleve:modifier` |
| `changerClasseEleve` | `eleve:affecter` |
| `creerClasse` | `classe:creer` |
| `modifierClasse`, `archiverClasse` | `classe:modifier` |

Toutes **éteintes** tant que `AGENT_ECRITURES_ACTIVES=true` n'est pas posée sur le
déploiement : réponse `403` + `code: ECRITURES_DESACTIVEES`.

Lectures notables : `rechercherEleves`, `consulterEleve`, `listerClasses`
(accepte `anneeId`), `listerElevesClasse`, `chargerEmploiDuTemps` (rend les
heures), `anneeCourante`, `listerPeriodes`, `listerNiveaux`, `listerSeries`,
`listerAbsences`, `listerRetards`, pilotage, finances.

## E. Fichiers et modules importants

| Chemin | Rôle |
|---|---|
| `web/src/app/api/agent/[action]/route.ts` | la route : jeton, acteur, liste blanche, guard |
| `web/src/server/agent/operations.ts` | registre des opérations exposées |
| `web/src/server/agent/porte.ts` | interrupteur `AGENT_ECRITURES_ACTIVES` |
| `web/src/server/auth/acteur-delegue.ts` | acteur délégué (`AsyncLocalStorage`) |
| `web/src/server/auth/session.ts` | `sessionCourante()` lit d'abord l'acteur délégué |
| `web/src/server/guard/index.ts` | `requirePermission`, `exigerPermissionPour` |
| `web/src/server/domain/classes-ecritures.ts` | archivage d'une classe |
| `web/src/server/db/erreurs-pg.ts` | code PostgreSQL rangé par Drizzle dans `cause` |
| `web/src/app/(main)/dashboard/eleves/actions.ts` | inscrire, modifier, changer de classe, statut |
| `web/src/app/(main)/dashboard/parametres/actions.ts` | créer / modifier une classe |
| `agent/src/engine.js` | moteur : NLU, préparer, confirmation, exécution, relecture |
| `agent/src/confirmation.js` | ce qu'un « oui » autorise |
| `agent/src/tools.js` · `tools-pilotage.js` · `tools-dossiers.js` | registre des 38 outils |
| `agent/src/guergne-client.js` | client HTTP du backend |
| `agent/src/resolveur.js` · `referentiel.js` | résolution des noms et des classes |
| `agent/src/reponse/` | orchestrateur, politique de sortie, présence, regroupement |
| `agent/src/providers/wwebjs.js` | transport WhatsApp |
| `agent/app.js` · `agent/index.js` | démarrage (Altare lance `index.js`) |
| `db/migrations/` · `db/rollback/` | **seul** système de migrations ; rollbacks hors du dossier joué |

## F. Contrats des outils IA

Un outil (`agent/src/tools*.js`) déclare : `name`, `description`, `permission`,
`sensitivity` (`read` / `write` / `sensitive`), `action` (= nom de l'opération du
backend), `parametres` (**uniquement** ceux que la route honore), `validate`,
`summarize`, et selon le cas :

- `rendre(data, params)` — mise en forme WhatsApp d'une lecture ;
- `preparer(params, {guergne, ctx})` — résout noms et libellés contre le backend,
  complète les paramètres, rend `{ok, params, texte}` ou `{ok:false, message}` ;
- `confirmationObligatoire: true` — aucune politique ni le modèle ne peut s'en passer ;
- `verifier({result, params, guergne, ctx})` — relit après écriture.

Les outils de dossier acceptent un **nom** (« Mahamat Ahmat », « sixième A ») :
jamais d'UUID demandé à l'utilisateur. Un test structurel vérifie que chaque
`action` existe côté backend, et un autre fige l'inventaire (38 outils, 29 avec
rendu) — tout ajout doit y être **constaté**.

## G. Confirmation et relecture

`agent/src/confirmation.js` — une confirmation est liée à une opération, un
utilisateur, une conversation ; paramètres **gelés** + empreinte ; usage unique ;
**5 minutes** (`AGENT_CONFIRMATION_TTL_MS`) ; seules des formes **nettes**
confirment (« oui », « je confirme », « نعم »…). « Oui mais en 5e B » n'est **pas**
une confirmation : l'attente tombe. Toute autre phrase l'abandonne.

Après une écriture, `verifier` relit. Si le serveur dit « ok » et que la relecture
ne le confirme pas, l'agent l'annonce, ne rejoue rien et l'audit local note
`UNVERIFIED`. Le téléphone et l'e-mail de l'élève ne sont pas relisibles
(`chargerDossier` ne les rend pas) : annoncés « non relisibles ».

## H. Permissions et rôles

La matrice est **en base**, table `permissions` — pas dans le code. Relevé du
2026-11-10, **identique sur les deux branches** :

| Rôle | Droits (nombre) | Écriture élèves / classes |
|---|---|---|
| SUPER_ADMIN | 78 | tout |
| DIRECTION | 36 | `eleve:modifier`, `classe:creer`, `classe:modifier` seulement |
| SECRETARIAT | — | `eleve:inscrire`, `eleve:modifier`, `eleve:affecter` |
| CENSEUR | — | comme DIRECTION |
| SURVEILLANT, ENSEIGNANT, COMPTABLE | — | lecture |
| PARENT | — | refusé avant la matrice (rôle non habilité à l'administration) |

**Décision définitive du propriétaire (2026-11-10) : la DIRECTION reçoit toutes
les permissions MÉTIER.** Il lui en manque 42 ; la liste exacte et le partage
métier / technique sont dans le prompt de reprise, §6. Ne **pas** reposer la
question.

## I. Tests

| Suite | Commande | Résultat au 2026-11-10 |
|---|---|---|
| Agent (unitaires + moteur + intégration) | `cd agent && npm test` | **771 / 771** |
| Recette CRUD réelle (base de test) | `cd agent && node scripts/recette-crud-reel.mjs` | **45 / 45** |
| Recette lectures réelles | `cd agent && node scripts/recette-backend-reel.mjs` | **13 / 13** |
| Typage backend | `cd web && npx tsc --noEmit -p .` | propre |
| Lint backend (fichiers touchés) | `cd web && npx biome lint <fichiers>` | 0 diagnostic nouveau (13 antérieurs) |
| Build production | `cd web && npm run build` | **réussi** — voir N, cache `.next` |

La recette CRUD exige un backend **dédié**, écritures activées, SMS et push vidés :

```bash
cd web
AGENT_ECRITURES_ACTIVES=true SMS_API_URL= SMS_API_KEY= FCM_PROJECT_ID= FCM_CLIENT_EMAIL= FCM_PRIVATE_KEY= npx next dev -p 3100
```

Puis le nettoyage : `node scripts/recette-crud-reel.mjs --nettoyer <fichier>`.
**Sous Windows, arrêter l'enveloppe ne tue pas `next dev`** : vérifier le port 3100
et tuer l'arbre de processus (`taskkill /PID <pid> /T /F`). Un serveur écritures
activées est resté une heure en vie lors de cette séance (sans écriture constatée).

## J. Git

- Dépôt : `https://github.com/faycalhabibahmatalbachar/guergne`
- Branche : **`voix-bidirectionnelle`**, partie de `main` au commit `90d7a65`
  (2026-11-01). `main` a avancé de 3 commits depuis ; **non fusionnée**.
- Commits du chantier CRUD : `e402cae`, `2bab23d`, `6ad3c69`, `f65c3b7`, `4f0609b`.
- Avant cette passation, la branche **n'avait jamais été poussée** (77 commits
  locaux). Le résultat du push est consigné dans le rapport de clôture.

## K. Environnements (sans secrets)

| Fichier (hors Git) | Contenu | Base |
|---|---|---|
| `web/.env.local` | `DATABASE_URL`(_DIRECT), `AGENT_SERVICE_TOKEN`, SMS, FCM, `AUTH_SECRET`… | `br-red-waterfall` |
| `web/.env.development.local` | `DATABASE_URL`(_DIRECT) | `br-calm-art` |
| `web/.env.test.local` | `DATABASE_URL_TEST` | `br-calm-art` |
| `agent/.env` | `SCHOOL_API_BASE_URL=http://localhost:3000`, `AGENT_SERVICE_TOKEN`, `AGENT_REPONSE_VOCALE=texte` | via le backend local |
| `ai_apikey.env` (racine) | clés Groq / Mistral / OpenRouter | — |
| `altare.env` (racine) | accès SFTP Altare | — |

**Piège** : `next dev` charge `.env.development.local` **avant** `.env.local`. Le
backend local lit donc `br-calm-art`, et l'agent local avec lui. `next build` lit
`.env.local` (production) : forcer la base de test pour un build local.

Clés IA : `. infra/local/profil-ia.sh` (avec `GUERGNE_CLES` pointant vers
`ai_apikey.env`) identifie chaque clé par son **préfixe** — `grok_api` est une clé
**Groq**. FFmpeg : ajouter `C:\Users\hp\.local\ffmpeg\ffmpeg-9.0.2-full_build\bin`
au `PATH` du shell Bash.

## L. Les deux branches Neon

| | `br-red-waterfall-b1ajf6iu` | `br-calm-art-b18uihy2` |
|---|---|---|
| Rôle | **production présumée** | développement / test |
| Fichier | `.env.local` | `.env.development.local`, `.env.test.local` |
| Année courante | **2026-2027** | 2025-2026 |
| Migration 0040 | appliquée | **absente** |
| Activité distante depuis la bifurcation (2026-11-01 15:18 UTC) | 13 audits + 5 sessions | aucune |
| Données | 549 élèves dont **1 authentique** ; 548 semés (`donnees_semees`) | idem |

La production est identifiée par **preuve indirecte** (divergence d'activité). La
variable `DATABASE_URL` de Vercel Production **n'a pas été lue** (aucun accès).

## M. Blocages de production

1. **Preuve directe Vercel ↔ Neon** — BLOQUÉ (accès Vercel).
2. **Écritures** — éteintes partout ; ne pas poser `AGENT_ECRITURES_ACTIVES=true`
   en production avant 1, et avant relecture de la matrice de production.
3. **Aucun déploiement** du travail de cette branche : ni Vercel, ni Altare.
4. **Passage d'année 2026-2027** — 0 classe, 0 inscription : il n'existe qu'un
   élève authentique. Décision et registre réels de l'établissement requis.
5. **Parcours WhatsApp réel d'une écriture** — NON VALIDÉ (exige un message du SUPER_ADMIN).

## N. Défauts connus non corrigés

| Défaut | Où | Gravité |
|---|---|---|
| Détection d'unicité morte (code 23505 dans `cause`) | `dashboard/finances/actions.ts`, `parents/actions.ts`, `parents/actions-creation.ts`, `personnel/actions.ts`, `personnel/actions-non-enseignants.ts` | message générique au lieu de « existe déjà » ; utiliser `estViolationUnicite` |
| Migrations en attente : `0033`, `0037_notes_tracabilite`, `0038`, `0039` | `db/migrations/` | **ne pas** lancer `npm run db:migrate` en bloc : `0038` échouera (61 doublons d'absences, tous semés) |
| Registre `_migrations` : 2 entrées sans fichier (`0037_memorisation…`, `0038_contexte…`) | base | collision de numérotation antérieure |
| `next build` échoue sur `next/font/google` si un cache `.next` de `next dev` est présent | `web/.next` | supprimer `web/.next` avant le build |
| `next dev` réécrit `web/AGENTS.md` (bloc Next.js) | `web/AGENTS.md` | restaurer avant commit (`git checkout -- web/AGENTS.md`) |
| Message zod brut « expected string, received undefined » sur une date manquante | `eleves/actions.ts` (schéma) | l'agent valide avant ; visible seulement hors agent |
| Changement de classe vers une autre année : refus codé, **non éprouvé** | base de test à une seule année | à tester sur une base à deux années |
| 13 diagnostics Biome antérieurs | `session.ts`, `operations.ts`, `eleves/actions.ts`, `personnel.ts` | antérieurs à la branche |

## O. Tâches restantes, par priorité

1. **DIRECTION : toutes les permissions métier** sur la base de test (migration
   `0041`, rollback, recette des refus et des accès) — voir le prompt §6.
2. Corriger la détection d'unicité dans les 5 fichiers restants (N).
3. Preuve directe Vercel ↔ Neon ; relire `permissions` en production.
4. Parcours WhatsApp réel : lecture, puis une écriture confirmée, sur l'environnement de test.
5. Traiter `0038` (retrait du jeu semé ou arbitrage), puis `0033`, `0037`, `0039`.
6. Déploiement contrôlé, écritures éteintes, puis activation.

## P. Reprendre immédiatement

```bash
git fetch origin
git switch voix-bidirectionnelle
cd agent && npm ci && npm test          # attendu : 771 / 771
cd ../web && npm ci && npx tsc --noEmit -p .
```

Puis lire, dans cet ordre : ce document, le
[prompt de reprise](PROMPT_REPRISE_CLAUDE_COMPTE_2.md), [`CRUD_AGENT.md`](CRUD_AGENT.md),
la fin de [`MASTER_VALIDATION_METIER.md`](MASTER_VALIDATION_METIER.md), et `web/AGENTS.md`.
**Ne rien refaire de la section B.**
