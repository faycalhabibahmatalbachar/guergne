# Prompt de reprise — Claude Code compte 2

*À coller tel quel dans la nouvelle session. Rédigé le 2026-11-10 par la session
précédente, qui a épuisé son quota. Aucun secret ici.*

---

Tu reprends le développement de l'assistant IA scolaire du **Lycée Guergné La
Renaissance**, au point exact où la session précédente s'est arrêtée. Ton travail
est de **continuer**, pas de recommencer : tout ce qui est listé au §2 est fait,
testé et commité. Le refaire serait une perte de temps et un risque de régression.

## 1. Récupérer l'état

```bash
cd C:\Users\hp\Desktop\Projects\lycee-renaissance
git fetch origin
git switch voix-bidirectionnelle        # branche de travail ; NE PAS partir de main
git log --oneline -8                    # doit montrer 4f0609b, f65c3b7, 6ad3c69, 2bab23d, e402cae
cd agent && npm ci && npm test          # attendu : 771 / 771
cd ../web && npm ci && npx tsc --noEmit -p .   # attendu : aucune erreur
```

Si un de ces résultats diffère, **arrête-toi et comprends pourquoi** avant de coder.

### Fichiers à lire avant toute modification, dans cet ordre

1. `docs/PASSATION_CLAUDE_COMPTE_2.md` — l'état complet, sections A à P.
2. `docs/CRUD_AGENT.md` — registre des opérations, droits, mise en service.
3. `docs/MASTER_VALIDATION_METIER.md` — la fin du fichier (sections du 2026-11-10).
4. `web/AGENTS.md` — conventions du backend (Next.js 16 : lire `node_modules/next/dist/docs/` avant de coder du Next).
5. `web/src/server/agent/operations.ts`, `web/src/app/api/agent/[action]/route.ts`,
   `web/src/server/auth/acteur-delegue.ts`, `agent/src/engine.js`,
   `agent/src/confirmation.js`, `agent/src/tools-dossiers.js`.

## 2. Ce qui est TERMINÉ et PROUVÉ — ne pas refaire

| Fait | Preuve |
|---|---|
| CRUD élèves et classes exposé à l'agent (7 écritures, 3 lectures) | recette réelle **45/45** sur la base de test |
| Acteur délégué : l'agent emprunte les actions web exactes | idem + 0 duplication de logique métier |
| Archivage au lieu de suppression ; `supprimerClasse` non exposé | route → 404, vérifié |
| Confirmation durcie (expiration, oui net, attente abandonnée) | 10 tests + 13 tests moteur dont un **témoin** |
| `preparer` (noms → identifiants relus) et `verifier` (relecture) | tests moteur + recette |
| Client : vrai motif des refus (`ECRITURES_DESACTIVEES`, erreurs 422) | 4 tests |
| `changerClasse` : même année, classe active ; refus métier lisibles | recette réelle |
| Unicité reconnue (code 23505 dans `cause`) — dans `eleves` et `parametres` | recette réelle |
| Emploi du temps (avec heures), classes, année courante pour l'agent | recette lectures **13/13** |
| Téléchargement des notes vocales, Piper Windows, FFmpeg, orchestrateur TEXT_ONLY, barrière anti-rejeu | voir `docs/REPRISE_SESSION_VOCALE.md` |
| Migration 0040 (année 2026-2027) | appliquée sur `br-red-waterfall` |
| Base de test restituée après la recette | 549 élèves (1 authentique intact), 15 classes, 0 résidu |

**Commits à conserver** (ne jamais réécrire, ne jamais forcer) : `e402cae`,
`2bab23d`, `6ad3c69`, `f65c3b7`, `4f0609b`, et tout l'historique de la branche.

## 3. Ce qu'il ne faut SURTOUT PAS faire

- Reconstruire le projet, refaire un audit complet, ou réécrire le CRUD.
- Connecter l'agent directement à Neon : il passe **toujours** par `POST /api/agent/{action}`.
- Créer un second système de permissions : la matrice est la table `permissions`.
- Écrire dans `br-red-waterfall` (production présumée) sans autorisation nominative.
- Poser `AGENT_ECRITURES_ACTIVES=true` en production, déployer sur Vercel ou Altare.
- Lancer `npm run db:migrate` en bloc : il jouerait `0033`, `0037`, `0038`, `0039`,
  et `0038` échouera (61 doublons d'absences). Utiliser
  `node agent/scripts/appliquer-migration.mjs <fichier> --essai` puis sans `--essai`.
- Mettre un fichier de rollback dans `db/migrations/` : `migrate.mjs` joue tout `*.sql`.
- Traiter les données `donnees_semees = true` comme authentiques. 548 élèves sur 549 sont semés.
- Exporter une fonction qui accepte un acteur depuis un fichier `"use server"` (point d'entrée public).
- Afficher, copier ou commiter un secret, une chaîne de connexion, `.env*`, `node_modules`, `.next`.
- Reposer la question des droits de la DIRECTION : elle est tranchée (§6).

## 4. Règles de validation

- **Un HTTP 200 ne prouve rien.** Toute écriture se vérifie par l'API, par une
  requête SQL indépendante, et par sa ligne d'audit — comme
  `agent/scripts/recette-crud-reel.mjs`.
- **Un refus se vérifie pour SA raison**, pas seulement parce qu'il refuse. La
  session précédente a eu trois tests verts pour de mauvaises raisons ; ils ont
  été corrigés — ne pas réintroduire ce travers.
- **Un test qui ne peut pas s'exécuter le dit** (« NON EXÉCUTÉ »), il ne disparaît pas.
- **Un test de garde contre une politique doit avoir un témoin** qui prouve que la
  garde est bien ce qui protège.
- **Ne jamais annoncer** qu'une chose est faite, poussée ou validée sans preuve
  d'exécution (sortie de commande, état SQL, confirmation du serveur Git).
- Tout ajout d'outil se constate dans l'inventaire de
  `agent/test/outils-robustesse.test.js` (aujourd'hui 38 outils, 29 avec rendu).

## 5. Sécurité opérationnelle de la recette

La recette d'écriture tourne **uniquement** contre `br-calm-art`, avec un backend
dédié, SMS et push vidés (la base de test a 20 notifications en attente) :

```bash
cd web
AGENT_ECRITURES_ACTIVES=true SMS_API_URL= SMS_API_KEY= FCM_PROJECT_ID= FCM_CLIENT_EMAIL= FCM_PRIVATE_KEY= npx next dev -p 3100
cd ../agent && node scripts/recette-crud-reel.mjs
node scripts/recette-crud-reel.mjs --nettoyer <fichier-rendu-par-la-recette>
```

Le script refuse de lui-même une base `br-red-waterfall`, ou un backend qui
n'annonce pas la même année courante que la base de test.

**À la fin, tuer l'arbre de processus du serveur** : sous Windows, arrêter
l'enveloppe Bash laisse `next dev` vivant (`Get-NetTCPConnection -LocalPort 3100`,
puis `taskkill /PID <pid> /T /F`). Un serveur à écritures activées oublié est un risque.

Avant un `next build` : supprimer `web/.next` (sinon 10 erreurs `next/font/google`),
et forcer la base de test (sinon le build lit `.env.local`, la production).
Après un `next dev` : `git checkout -- web/AGENTS.md` (Next réécrit un bloc).

## 6. Décision métier DÉFINITIVE : la DIRECTION reçoit toutes les permissions métier

Décision du propriétaire du projet, 2026-11-10. **Ne pas la rediscuter.** La
DIRECTION doit pouvoir inscrire et réinscrire, changer de classe, gérer élèves,
classes, parents, assiduité, discipline, emploi du temps, personnel,
communication, gestion scolaire, rapports et pilotage — sans restriction
artificielle de périmètre. Les permissions **techniques et de sécurité** restent
réservées.

### L'écart mesuré (table `permissions`, identique sur les deux branches)

SUPER_ADMIN : 78 droits. DIRECTION : 36. **Il en manque 42 à la DIRECTION.**

**À accorder — 38 droits métier :**

```
affectation:gerer   annonce:lire        appreciation:saisir  assiduite:justifier
assiduite:saisir    bulletin:telecharger calendrier:gerer    coefficient:gerer
conduite:noter      devoir:lire         devoir:publier       discipline:signaler
eleve:affecter      eleve:inscrire      eleve:reinscrire     emploi_du_temps:gerer
emploi_du_temps:lire evaluation:creer   evaluation:lire      evaluation:modifier
finance:encaisser   finance:exporter    finance:relancer     import:executer
matiere:gerer       message:lire        note:modifier        note:saisir
parametre:modifier  piece:deposer       recu:emettre         ressource:lire
ressource:publier   retard:saisir       seance:saisir        sortie:autoriser
tuteur:gerer        tuteur:inviter
```

**À NE PAS accorder — 4 droits techniques / de sécurité, réservés au SUPER_ADMIN :**

| Droit | Pourquoi |
|---|---|
| `permission:gerer` | modifier la matrice = s'attribuer n'importe quel droit (élévation de privilège) |
| `systeme:administrer` | administration technique de la plateforme |
| `sauvegarde:executer` | sauvegardes et restaurations de la base |
| `utilisateur:modifier` | comptes et rôles : changer le rôle d'un compte contourne la matrice |

`parametre:modifier` (paramètres scolaires) et `import:executer` (import d'élèves)
sont classés **métier** : ce sont des gestes de gestion de l'établissement. Si
l'audit du code montre que l'un d'eux ouvre en réalité un réglage technique ou de
sécurité, le documenter et le traiter comme le tableau ci-dessus.

### Comment l'appliquer

1. **Auditer** la table `permissions` (colonnes, contrainte d'unicité, déclencheurs)
   et chaque usage des 38 droits dans `web/src` — confirmer qu'aucun n'est technique.
2. Écrire `db/migrations/0041_direction_permissions_metier.sql` :
   `INSERT … ON CONFLICT DO NOTHING`, rejouable, avec garde-fous `RAISE EXCEPTION`
   (DIRECTION n'obtient **aucun** des 4 droits réservés ; total attendu 74).
   Son rollback dans `db/rollback/0041_*.sql` (hors du dossier joué).
3. L'appliquer **sur `br-calm-art` seulement** :
   `node agent/scripts/appliquer-migration.mjs 0041_… --essai` puis sans `--essai`.
   ⚠ Ce script lit `web/.env.local` (**production**) : le faire pointer vers la
   base de test (paramètre ou variable) **avant** de l'utiliser pour 0041.
4. Recette réelle : un compte DIRECTION **actif** (il en existe un sur la base de
   test) **inscrit** un élève de synthèse, le **change de classe**, l'**archive** —
   chaque étape vérifiée en SQL et en audit ; et il est **refusé** sur
   `permission:gerer` / `utilisateur:modifier`. Mettre à jour
   `agent/scripts/recette-crud-reel.mjs` : le test « DIRECTION refusée » devient
   « DIRECTION autorisée », et un refus sur un droit réservé le remplace.
5. Côté agent, ajuster la matrice de pré-filtre (`MatricePermissions`) si elle
   restreint encore la DIRECTION — le backend reste l'autorité.
6. Production : **ne pas** appliquer 0041 sur `br-red-waterfall` sans autorisation
   explicite du propriétaire et sans la preuve directe Vercel ↔ Neon.

## 7. Prochaines tâches, dans l'ordre

1. **§6** — permissions de la DIRECTION sur la base de test, prouvées.
2. **Unicité** : remplacer le test sur `message` par `estViolationUnicite`
   (`web/src/server/db/erreurs-pg.ts`) dans `dashboard/finances/actions.ts`,
   `parents/actions.ts`, `parents/actions-creation.ts`, `personnel/actions.ts`,
   `personnel/actions-non-enseignants.ts`.
3. **Preuve directe** Vercel Production ↔ `br-red-waterfall` (préfixe `ep-…` de
   `DATABASE_URL` uniquement) — demander l'accès au propriétaire si nécessaire.
4. **Parcours WhatsApp réel** sur l'environnement de test : une lecture, puis une
   écriture confirmée, avec relecture et audit. Exige un message du SUPER_ADMIN
   (`+235 68663737`) ; préparer tout le reste avant de le lui demander.
5. **Migrations en attente** : `0038` (61 doublons d'absences, tous semés) puis
   `0033`, `0037_notes_tracabilite`, `0039` — une par une, `--essai` d'abord.
6. **Mise en service** : déploiement écritures éteintes, lectures prouvées en
   production, puis activation — procédure dans `docs/CRUD_AGENT.md` §7.

## 8. Consignes d'accélération

- **Réutiliser** : `recette-crud-reel.mjs`, `recette-backend-reel.mjs`,
  `baseline-neon.mjs`, `appliquer-migration.mjs`, `identifier-branche-production.mjs`
  existent et sont éprouvés. Les étendre plutôt que d'en écrire d'autres.
- **Suivre les motifs en place** : une écriture du backend = action web existante
  appelée via `executerEnTantQue` ; un outil d'écriture = `preparer` +
  `confirmationObligatoire` + `verifier` (voir `agent/src/tools-dossiers.js`).
- **Ne pas re-auditer** ce que `PASSATION_CLAUDE_COMPTE_2.md` établit déjà ;
  revérifier seulement ce dont dépend la tâche en cours.
- **Commits petits et cohérents**, messages en français expliquant le *pourquoi* ;
  pousser régulièrement sur `voix-bidirectionnelle` (jamais `--force`).
- **Mettre à jour** `docs/MASTER_VALIDATION_METIER.md` et ce dossier de passation
  à chaque étape importante.

## 9. Limites de production (non négociables sans accord explicite)

- Pas d'écriture sur `br-red-waterfall`, pas de migration de production.
- Pas d'activation de `AGENT_ECRITURES_ACTIVES` en production.
- Pas de déploiement Vercel ni Altare ; pas de redémarrage d'Altare.
- Pas de session WhatsApp écrasée, pas de nouveau QR si la session est authentifiée.
- Pas de dépense, pas de nouveau service payant.
- Pas de suppression de données authentiques ; archivage plutôt que suppression.

L'objectif reste un assistant scolaire réellement opérationnel pour la direction —
prouvé, sûr, et sans réécrire ce qui fonctionne déjà.
