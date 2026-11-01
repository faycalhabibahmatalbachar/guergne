# HANDOFF — reprise de session

**À lire en premier. Ne refais pas d'audit général : tout ce qui suit est vérifié.**

Dernier commit : `1d9db85` · Branche : `ai-school-agent-p0-audit` · 1er novembre 2026.

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

### Code livré et testé — **106 tests, 106 réussites** (`cd agent && npm test`)

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
| `index.js` | **amorçage** : installe deps + Chromium, puis `app.js` |
| `app.js` | application (ex-`index.js`) |

### Côté guergne (déjà en production)
`web/src/app/api/agent/[action]/route.ts` — API agent **lecture + écriture**,
double authentification (jeton de service + `x-acteur-id`), liste blanche,
en-têtes de sécurité. Testée : **42/42** contre la base réelle.

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

## 4. PROCHAINE TÂCHE EXACTE

### LOT 1 — rendre le cerveau opérationnel (bloquant pour tout le reste)

`/sante` renvoie `{"configuration":{"backend":false,"ia":false}}`. Le transport
marche, mais l'agent ne peut rien faire.

À définir dans les **variables Altare** (panneau → Démarrage), ou dans un `.env`
privé à la racine que l'amorçage charge déjà :

| Variable | Rôle |
|---|---|
| `SCHOOL_API_BASE_URL` | URL publique de guergne (Vercel) |
| `AGENT_SERVICE_TOKEN` | **déjà dans `web/.env.local`** — même valeur |
| `GROQ_API_KEY` | clé Groq (validée : LLM + Whisper) |
| `MISTRAL_API_KEY` | repli (validée, mais **429 en palier gratuit**) |

Puis vérifier que `/sante` passe à `backend:true, ia:true`.

### LOT 2 (suite) — provisionner les responsables

Le mécanisme est fait et testé ; il reste à **créer les associations**. Elles
vivent dans `donnees/identites.json` **sur le serveur**, jamais dans le dépôt.

Il manque, pour chaque numéro, l'**identifiant du compte guergne** et son rôle.
Les numéros seuls ne suffisent pas, et **aucun numéro ne doit être commité**.

Rappel de la matrice : `assiduite:saisir` appartient au **SURVEILLANT**, pas à la
DIRECTION — le scénario du cahier des charges (directeur enregistrant des
absences) échouerait. Arbitrage métier en attente, à ne pas contourner.

### Ensuite
LOT 3 (assiduité de bout en bout sur la branche Neon isolée), puis LOT 4
(planificateur multi-étapes), puis LOT 6 (voix).

## 5. Commandes de reprise

```bash
cd agent && npm test                      # doit afficher 106/106
node agent/scripts/audit-plateforme.mjs   # regenere l'inventaire
curl -s http://se-kna02.altare.global:25278/sante   # etat reel du service
MSYS_NO_PATHCONV=1 node agent/scripts/altare.mjs ls .   # arborescence distante
```

Secrets locaux (jamais commités) : `altare.env`, `ai_apikey.env`,
`web/.env.local`, `web/.env.test.local`.

## 6. Barrières humaines restantes

1. **Variables Altare** — panneau web, session navigateur personnelle.
2. **Identifiants des comptes guergne** des quatre responsables.
3. **Arbitrage `assiduite:saisir`** pour la DIRECTION.
4. **TLS** : l'appairage a transité en HTTP. Le jeton est brûlé, donc sans
   valeur, mais un futur appairage mérite HTTPS.
5. **Budget** : aucune dépense engagée, aucune autorisée.
