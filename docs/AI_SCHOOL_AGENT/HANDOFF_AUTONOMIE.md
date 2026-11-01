# HANDOFF — reprise de session

**À lire en premier. Ne refais pas d'audit général : tout ce qui suit est vérifié.**

Dernier commit : `d107fb9` · Branche : `ai-school-agent-p0-audit` · 1er novembre 2026.

---

## 1. Ce qui FONCTIONNE en production — ne pas y toucher

La passerelle WhatsApp est **en ligne et authentifiée**. Vérifié par l'état réel
du service, pas par déduction :

```
http://se-kna02.altare.global:25278/sante
{"processus":"ok","whatsapp":"ready","appairage":"authentifie",
 "appairageOuvert":false,"memoireMo":112}
```

| Élément | État |
|---|---|
| Serveur Altare `ba6c9bf3` | actif, `node /home/container/index.js` |
| Node | 24.22.1 |
| Chromium | 146.0.7680.31, en cache persistant |
| Session WhatsApp | **authentifiée**, 43 fichiers dans `donnees/wwebjs_auth/session-lycee/` |
| Persistance | **prouvée** : redémarrage à 01:06:11 → `session prete` sans nouveau scan |
| Verrou d'instance | actif |
| Jeton d'appairage | brûlé et supprimé après usage |

**Interdits absolus** : supprimer `donnees/`, lancer une seconde instance sur le
même numéro, reconstruire la passerelle, changer de transport.

## 1 bis. RECTIFICATIF — l'API agent n'a JAMAIS été déployée

La version précédente de ce document annonçait l'API agent « déjà en
production ». **C'est faux, et c'est ce qui bloquait le LOT 1.**

Vérifié, pas déduit :

```
POST https://lycee-guergne-renaissance.vercel.app/api/agent/listerAlertes
→ HTTP 404 (page Next « Page not found »)
```

404, et non 401 ou 503 : la route n'existe pas dans la build déployée.
`git ls-tree origin/main -- web/src/app/api/agent` est **vide** — le fichier
n'existe que sur cette branche. « En production » désignait le *noyau partagé*
(`assiduite-ecritures.ts`), pas la route.

Conséquence : `SCHOOL_API_BASE_URL` ne doit **pas** être renseignée vers
l'URL publique. `backendConfigure` n'est qu'un booléen de présence
(`app.js`) : la renseigner ferait passer `/sante` à `backend:true` pendant que
chaque appel répondrait 404. **Un faux vert est pire qu'un rouge franc.**

Les déploiements de prévisualisation Vercel existent bien pour chaque commit de
la branche, mais ils sont derrière l'**authentification Vercel**
(`vercel_auth_enabled:true`) : Altare ne peut pas les atteindre.

## 2. Ce qui est DÉJÀ FAIT — ne pas recommencer

### Audit (terminé, documenté)
Plateforme guergne cartographiée **depuis le code**, pas les menus :
**150 actions serveur**, **28 routes d'API**, **123 fonctions de domaine**,
**78 permissions**, **9 rôles**. Script reproductible :
`node agent/scripts/audit-plateforme.mjs`.

**Constat qui borne le projet** : sur 78 permissions, 47 sont exigées
directement, 8 dynamiquement, et **23 ne sont citées nulle part** — la
fonctionnalité métier n'existe pas. Le catalogue d'outils ne peut donc couvrir
que **55 capacités**. Détail : `FULL_PLATFORM_AUDIT.md`.

### Code livré et testé — **127 tests, 127 réussites** (`cd agent && npm test`)

| Module | Rôle |
|---|---|
| `src/engine.js` | orchestration, statuts, confirmation, exécution vérifiée |
| `src/tools.js` | outils Assiduité, validations identiques à guergne |
| `src/permissions-matrix.js` | reflet de la matrice réelle (pré-filtre) |
| `src/guergne-client.js` | client HTTP vers `/api/agent/*` |
| `src/resolveur.js` | résolution élèves/classes, homonymes, défauts STT |
| `src/ia.js` | Groq + repli Mistral, disjoncteur 401/429/5xx |
| `src/persistance.js` | déduplication + verrou, survivent au redémarrage |
| `src/pairing.js` | QR sécurisé, jeton brûlé, page d'appairage |
| `src/providers/wwebjs.js` | transport réel, config Chromium de moov-ai |
| `src/identity-store.js` | associations numéro → compte, persistantes |
| `referentiel.js` | listes réelles classes/périodes, cache **par acteur** |
| `index.js` | **amorçage** : installe deps + Chromium, puis `app.js` |
| `app.js` | application (ex-`index.js`) |

### Côté guergne — écrit et testé, mais **PAS déployé** (cf. §1 bis)
`web/src/app/api/agent/[action]/route.ts` — API agent **lecture + écriture**,
double authentification (jeton de service + `x-acteur-id`), liste blanche,
en-têtes de sécurité. Testée : **42/42** contre la base réelle, en local.
Depuis, deux lectures de référentiel s'y ajoutent (`listerClasses`,
`listerPeriodes`), vérifiées contre la base réelle : 15 classes, 3 trimestres.

⚠️ **Ce fichier n'existe que sur cette branche.** « En production » ne vaut que
pour le noyau partagé ci-dessous, jamais pour cette route.

`web/src/server/domain/assiduite-ecritures.ts` — noyau partagé entre l'écran web
et l'agent. **Un bug de production y a été corrigé** : `justifierEnLot` était
cassé (Drizzle aplatit les tableaux dans un template `sql`) — la justification
en lot ne marchait pas non plus depuis l'interface web.

### Infrastructure
- Branche Neon de test **`ai-school-agent-test`** (`br-calm-art-b18uihy2`),
  isolation prouvée. Voir `NEON_TEST_ENVIRONMENT.md`.
- 8 branches Neon obsolètes supprimées (PR #7–#14 fusionnées).
- Northflank : **aucun plan gratuit** sur ce compte. Abandonné au profit
  d'Altare, qui fonctionne.

## 3. PIÈGES déjà payés — ne pas les repayer

1. **`node --check` ne détecte pas une `ReferenceError`.** Il a laissé passer
   `join is not defined`. Pour valider un fichier : le **charger réellement**
   (`node app.js` avec un `DONNEES_DIR` temporaire ; il doit atteindre
   `[demarrage] connexion WhatsApp`).
2. **SFTP Altare est LENT** — plusieurs minutes. Ne pas conclure au blocage et
   relancer : j'ai diagnostiqué trois faux gels et lancé des transferts
   concurrents. **Un transfert à la fois**, et attendre.
3. **`c.mkdir(chemin, true)`** (récursif) est très lent → utiliser le
   **non récursif**. C'est ce qui faisait « disparaître » `src/providers/`.
4. **`c.get(chemin)` sans destination se bloque.** Toujours
   `c.get(distant, fichierLocal)`.
5. **Git Bash convertit `/`** en chemin Windows → préfixer `MSYS_NO_PATHCONV=1`.
6. **SHA-256 brut diverge** entre git (LF) et disque (CRLF) → comparer aussi le
   contenu normalisé.
7. **Le champ Startup d'Altare est inutilisable** → l'amorçage est dans
   `index.js`. Le panneau lance `node /home/container/index.js`, point final.
8. **La console Altare n'est pas un shell** : elle écrit sur l'entrée standard
   de Node. N'y envoyez jamais `npm ci`.
9. **Les 549 élèves ont tous un tuteur**, et un déclencheur notifie à chaque
   absence insérée → toute écriture de test exige une fixture **sans tuteur**,
   ou la branche Neon isolée.
10. **Le journal d'audit est immuable** (`audit_pas_de_update`) → un compte de
    test ayant tracé ne peut plus être supprimé, seulement désactivé.
11. **Le piège 1 se paie aussi sur les gabarits adjacents.** Deux littéraux de
    gabarit collés — `` `a` `b` `` sans `+` — forment un *appel de gabarit
    balisé* : syntaxiquement valide, `node --check` ne dit rien, et l'erreur
    (`is not a function`) ne survient qu'à l'exécution. Pire : l'invite du NLU
    vivait dans une fonction fléchée, donc évaluée **seulement à l'arrivée d'un
    message**. Elle est désormais dans `ToolRegistry.invitePourNlu()`, où un
    test l'évalue vraiment.
12. **La prise de contact SFTP demandait plus de 20 s.** Le `readyTimeout`
    d'origine expirait et ressemblait au gel du piège 2. Il est passé à
    **120 s**, réglable par `ALTARE_READY_TIMEOUT_MS`. Depuis, la connexion
    aboutit — et c'est ainsi qu'on a vu que le vrai problème était
    l'authentification.
13. **Les paramètres facultatifs doivent être annoncés comme tels au modèle.**
    Sans le mot « facultatif », le LLM les traitait en obligatoires et réclamait
    un UUID de période pour une simple liste d'alertes.

## 4. PROCHAINE TÂCHE EXACTE

### LOT 1 — état réel : le cerveau pense, mais il n'a pas encore de corps distant

Ce qui a été **prouvé contre la base réelle et le vrai LLM**, en local
(`next dev` + branche Neon de `web/.env.local`) :

| Demande en français | Résultat réel |
|---|---|
| « les 3 dernières absences » | 3 lignes nommées et datées (**était : 100**) |
| « qui dépasse le seuil ? » | 45 alertes, heures et seuil (**était : une question sur un UUID**) |
| « absences de la 6ème B » | 100 lignes, **toutes** en 6ème B |
| « non justifiées en troisieme a » | 72 lignes en 3ème A — déformation STT exacte |
| « alertes du deuxième trimestre » | 16 alertes, contre 45 toutes périodes |
| « absences de la 7ème Z » | demande laquelle, **cite les vraies classes**, n'invente rien |

Clés IA **validées par appel réel** (aucune valeur affichée) :

| Fournisseur | Verdict |
|---|---|
| Groq (`ai_apikey.env:grok_api`) | **HTTP 200**, `openai/gpt-oss-120b`, répond « PONG », ~1 s |
| Mistral (`ai_apikey.env:mistral_ai`) | **HTTP 429** « Rate limit exceeded » — la clé s'authentifie (un mauvais jeton donnerait 401), mais le palier gratuit est saturé. Repli réel mais peu fiable. |

**Ce qui reste, et pourquoi c'est bloqué — deux barrières, pas une :**

1. **Le SFTP Altare refuse les identifiants.** `altare.env` ne permet plus de se
   connecter, donc **impossible de déposer `/home/container/.env`**, donc
   `ia:true` est hors d'atteinte depuis cette session.

   ```
   getConnection: All configured authentication methods failed
   ```

   Ce n'est **pas** la lenteur documentée au piège 2 : la prise de contact
   réussit maintenant (le délai est passé à 120 s, cf. plus bas), c'est
   l'authentification qui échoue. Essayé deux fois, à plusieurs minutes
   d'intervalle. Le parsing de `altare.env` est propre (aucun guillemet, aucun
   espace de bord, mot de passe de 19 caractères). **Le mot de passe SFTP a
   changé ou expiré** — sur Heliactyl/Pterodactyl, c'est celui du compte du
   panneau. Il faut le relire dans le panneau Altare, ou y poser directement
   les variables.

2. **Aucune URL joignable ne sert `/api/agent/*`** (cf. §1 bis). Pour obtenir un
   vrai `backend:true`, il faut l'une des deux :
   - fusionner la branche dans `main` → déploiement de production, **et** poser
     `AGENT_SERVICE_TOKEN` dans l'environnement Vercel, sinon la route répond
     503. C'est une **décision institutionnelle** : cela met en ligne des
     écritures d'assiduité sur la plateforme réelle de l'école, avec le
     déclencheur qui notifie les tuteurs. Non fait sans arbitrage explicite.
   - ou un jeton de contournement de protection pour les prévisualisations
     (réglage de projet Vercel).

   `vercel:env` gère désormais `AGENT_SERVICE_TOKEN` : dès qu'un `VERCEL_TOKEN`
   existe, `VERCEL_TOKEN=xxx npm run vercel:env` la pose. La CLI Vercel n'est
   **pas** authentifiée sur ce poste (aucun `auth.json`).

### Si tu reprends ici, dans cet ordre

1. **Demander les deux choses à l'utilisateur, ensemble** : le mot de passe SFTP
   Altare actuel (ou qu'il pose lui-même les variables dans le panneau), et sa
   décision sur le déploiement de l'API agent. Ce sont les deux seuls verrous.
2. Dès que le SFTP répond : `node agent/scripts/altare-env.mjs --ecrire`, puis
   redémarrer depuis le panneau (l'amorçage lit `.env` au démarrage, il n'y a
   **aucune route de redémarrage** dans `app.js`), puis `curl .../sante` →
   attendre `ia:true`.
3. Ne renseigner `SCHOOL_API_BASE_URL` **qu'après** avoir vérifié par un
   `POST /api/agent/listerAlertes` que l'URL répond 401 (service configuré) et
   non 404 (route absente) ni 503 (jeton manquant côté Vercel).

### Trous connus dans le catalogue — à traiter en LOT 5

- **`controleSaisies` n'existe pas côté API.** L'outil est dans le registre
  (`tools.js`) *et* dans le client (`guergne-client.js`), mais absent de la
  liste blanche de la route : tout appel partirait en 404. Soit l'implémenter,
  soit le retirer du registre — en l'état il promet une capacité absente.
- **`resolveur.js` n'est toujours pas branché pour les ÉLÈVES.** Les classes et
  les périodes sont résolues par `referentiel.js` (le modèle recopie un
  identifiant réel). Les élèves, non : il n'existe pas de recherche d'élève par
  nom dans la liste blanche, seulement `listerElevesClasse(classeId)`. C'est le
  verrou du **LOT 3** (écritures d'assiduité) : on ne peut pas poser une absence
  sans résoudre « Mahamat Adam » en `inscriptionId`. Le chemin est tracé :
  `listerElevesClasse` existe, et `resoudreEleve()` est écrit et testé.
- Le registre n'expose que l'Assiduité. L'audit borne le maximum atteignable à
  **55 capacités** (cf. `FULL_PLATFORM_AUDIT.md`).

## 5. Commandes de reprise

```bash
cd agent && npm test                      # doit afficher 127/127
node agent/scripts/audit-plateforme.mjs   # regenere l'inventaire
curl -s http://se-kna02.altare.global:25278/sante   # etat reel du service
MSYS_NO_PATHCONV=1 node agent/scripts/altare.mjs ls .   # arborescence distante
```

Chaîne réelle de bout en bout (lecture) — le plus utile pour vérifier d'un coup
que le cerveau fonctionne. LLM, API et base sont réels ; seul WhatsApp est
simulé :

```bash
cd web && npm run dev
```

```bash
node agent/scripts/e2e-lecture.mjs "les alertes du deuxieme trimestre"
```

Déposer la configuration privée sur Altare, dès que le SFTP répond. Sans
`--ecrire`, la commande n'affiche qu'un plan et n'écrit rien :

```bash
node agent/scripts/altare-env.mjs
```

```bash
node agent/scripts/altare-env.mjs --ecrire
```

Secrets locaux (jamais commités) : `altare.env`, `ai_apikey.env`,
`web/.env.local`, `web/.env.test.local`.

## 6. Barrières humaines restantes

1. **Mot de passe SFTP Altare** — les identifiants de `altare.env` sont
   **refusés** (`All configured authentication methods failed`, deux essais à
   plusieurs minutes d'intervalle). C'est la barrière qui bloque `ia:true`, et
   la seule. À relire dans le panneau, ou bien poser les variables directement
   dans le panneau.
2. **Déploiement de l'API agent** — décision institutionnelle : fusionner dans
   `main` met en ligne les écritures d'assiduité sur la plateforme réelle de
   l'école, avec le déclencheur qui notifie les tuteurs. **Rien n'a été fusionné
   ni déployé.** Exige aussi `AGENT_SERVICE_TOKEN` côté Vercel — géré par
   `vercel:env`, mais la CLI Vercel n'est pas authentifiée sur ce poste.
3. **Correspondance numéro → compte Guergné** : l'utilisation des numéros est
   déjà autorisée par l'utilisateur ; seule la résolution non ambiguë des IDs et
   rôles réels reste à faire via les sources Guergné. Ce n'est plus une demande
   d'autorisation à lui soumettre.
4. **Arbitrage `assiduite:saisir`** pour la DIRECTION.
5. **TLS** : l'appairage a transité en HTTP. Le jeton est brûlé, donc sans
   valeur, mais un futur appairage mérite HTTPS.
6. **Budget** : aucune dépense engagée, aucune autorisée. Inchangé.
