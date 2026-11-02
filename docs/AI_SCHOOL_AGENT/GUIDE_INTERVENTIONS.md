# Guide des deux interventions restantes

État relevé le 2026-11-02 par `node agent/scripts/verif-production.mjs`.
Ce guide ne décrit que des gestes que je ne peux pas faire moi-même, faute
d'accès. Tout le reste est déjà fait.

**Contrôle unique, à lancer après chaque intervention :**

```bash
node agent/scripts/verif-production.mjs
```

Il ne corrige rien — il constate, et dit l'étape suivante. Un outil qui répare
en même temps qu'il mesure ne permet plus de savoir ce qui était cassé.

---

## 1. VERCEL — poser `AGENT_SERVICE_TOKEN`

### Le projet

| | |
|---|---|
| Domaine servi | `https://lycee-guergne-renaissance.vercel.app` |
| Identification | `projectId` et `orgId` dans `web/.vercel/project.json` |
| Dossier racine du projet Vercel | `web/` |
| Framework, région | Next.js, `fra1` (voir `web/vercel.json`) |

Le script cible le projet **par son `projectId`**, pas par son nom : aucune
ambiguïté possible sur la cible.

### La variable

| | |
|---|---|
| Nom | `AGENT_SERVICE_TOKEN` |
| Environnements | **production, preview, development** — les trois |
| Emplacement de la valeur | fichier `web/.env.local`, ligne commençant par `AGENT_SERVICE_TOKEN=` |
| Longueur attendue | 64 caractères |
| À ne jamais faire | la recopier dans un message, un commit ou un journal |

`web/.env.local` est ignoré par Git (`*.env`, `.env.*`), vérifié.

### Procédure A — par script *(recommandée)*

```bash
cd web && VERCEL_TOKEN=xxxxx npm run vercel:env
```

Le jeton Vercel se crée sur <https://vercel.com/account/settings/tokens>, et
peut être **révoqué immédiatement après**. Il n'est ni écrit sur disque ni
journalisé par le script. Celui-ci lit la valeur dans `web/.env.local`, la pose
sur les trois environnements, et n'affiche qu'un aperçu tronqué.

Pour voir ce qu'il ferait sans rien écrire :

```bash
cd web && VERCEL_TOKEN=xxxxx npm run vercel:env -- --liste
```

### Procédure B — par le tableau de bord

1. Ouvrir le projet qui sert `lycee-guergne-renaissance.vercel.app`.
2. **Settings → Environment Variables → Add New**.
3. Name : `AGENT_SERVICE_TOKEN`. Value : la valeur lue dans `web/.env.local`.
4. Cocher **Production**, **Preview** et **Development**.
5. Save.

### Le redéploiement — obligatoire

Une variable ajoutée ne s'applique **pas** au déploiement déjà en ligne. Il
faut en produire un nouveau :

- tableau de bord : **Deployments → … → Redeploy** sur le dernier déploiement
  de `main` ;
- ou bien dites-le-moi : je pousse un commit vide sur `main`, ce qui déclenche
  un déploiement sans modifier une ligne de code.

### Vérification

```bash
node agent/scripts/verif-production.mjs
```

Attendu : `POST /api/agent/listerAlertes -> HTTP 401`.

| Réponse | Signification |
|---|---|
| **401** | route déployée **et** protégée — état visé |
| 503 | la variable n'est pas prise en compte : le redéploiement manque |
| 404 | la route n'est pas déployée (ne devrait plus arriver) |

**N'ajoutez pas `AGENT_ECRITURES_ACTIVES`.** Sans elle, les écritures de
l'agent répondent `403 ECRITURES_DESACTIVEES`. C'est ce qui rend cette mise en
production sans danger pour les dossiers scolaires.

### Retour arrière Vercel

Supprimer `AGENT_SERVICE_TOKEN` et redéployer : la route répond de nouveau 503
et ne sert plus rien. Aucune donnée n'est touchée, aucune migration n'est
embarquée.

---

## 2. ALTARE — redémarrer la passerelle WhatsApp

### Le service

| | |
|---|---|
| Nom | `lycee-whatsapp-gateway` |
| Identifiant | `ba6c9bf3` |
| Nœud | `se-kna02` |
| Port | `25278` |
| Répertoire | `/home/container` |
| Commande de démarrage | `node /home/container/index.js` |
| Runtime | Node.js 24.22.1 |

### Vérifications préalables — déjà faites

```
10 fichiers identiques au depot
.env : GROQ_API_KEY, MISTRAL_API_KEY, OPENROUTER_API_KEY, AGENT_SERVICE_TOKEN
identites : 2 active(s) — roles SUPER_ADMIN, DIRECTION
session WhatsApp : donnees/wwebjs_auth present
```

Le code déposé correspond exactement à `42f73ac`. **Le processus en mémoire,
lui, tourne depuis 310 minutes avec un code antérieur** : `/sante` affiche
`politiques chargees = 0` et aucune file de notifications. C'est toute la
raison de ce redémarrage.

### La commande

**Il n'existe aucune commande distante.** Heliactyl, la console d'Altare,
n'expose pas d'API client, et SFTP transfère des fichiers sans lancer de
processus. Le seul chemin est le panneau :

> Console du serveur `lycee-whatsapp-gateway` → bouton **Restart**.

Préférez **Restart** à Stop puis Start : un arrêt propre envoie `SIGTERM`, ce
qui laisse l'agent fermer WhatsApp, vider la file de notifications et libérer
son verrou.

### Ce que vous devez voir au démarrage

```
[config] groq=present xai=absent openrouter=present mistral=present
[config] ordre=groq>openrouter>mistral
[verrou] pid=… decision=perime-mort      (ou perime-reutilise)
[identites] 2 association(s) active(s)
[politique] lectures-vie-scolaire v1 active
[politique] appel-quotidien v1 active
[politique] justification-assiduite v1 active
[notifications] {"total":0,"en_attente":0,"envoyee":0,"abandonnee":0}
[whatsapp] session prete
```

Les trois lignes `[politique]` et la ligne `[notifications]` sont la preuve que
le nouveau code est bien chargé. **Si elles manquent, le redémarrage n'a pas
pris.**

### Vérification

```bash
node agent/scripts/verif-production.mjs
```

Attendu : `politiques chargees = 3` et une file de notifications présente.

### Retour arrière Altare

Deux points de retour sont étiquetés dans Git :

| Étiquette | Contenu |
|---|---|
| `deploiement-2026-11-02` | l'état actuellement déposé (`42f73ac`) |
| `agent-avant-file-notifications` | l'état précédent (`90d7a65`), sans la file |

```bash
git checkout agent-avant-file-notifications -- agent/
node agent/scripts/altare.mjs upload
# puis Restart depuis le panneau
git checkout deploiement-2026-11-02 -- agent/   # pour revenir en avant
```

**Ne supprimez jamais** `donnees/wwebjs_auth/` (session WhatsApp),
`donnees/identites.json` (associations) ni `donnees/dedup.json`. Le transfert
les exclut déjà, et le verrou d'instance se répare seul : un PID mort ou
recyclé est repris sans intervention.

---

## 3. GIT — où se trouve exactement quoi

| Référence | Commit | Contenu |
|---|---|---|
| `main` | `924981c` | fusion de la PR #81 — **tout ce que Vercel déploie** |
| `ai-school-agent-p0-audit` | `42f73ac` | + file de notifications, + preuve 6ème A |

**Les deux commits présents sur la branche et absents de `main` :**

| Commit | Portée |
|---|---|
| `2a32100` | file de notifications — `agent/` uniquement |
| `42f73ac` | preuve 6ème A et suivi — `agent/` et `docs/` |

```
git diff --name-only origin/main..HEAD -- web/   →   AUCUN fichier
```

### Les trois états, à ne pas confondre

| État | Où | Quoi |
|---|---|---|
| **Fusionné** (`main`, `924981c`) | GitHub + Vercel | l'API de consultation, en ligne |
| **Poussé** (branche, `42f73ac`) | GitHub + disque Altare | file de notifications, documents, 25 outils |
| **Exécuté** | mémoire du processus Altare | **code antérieur** — d'où le redémarrage |

**`2a32100` n'est pas dans `main`, et c'est sans conséquence** : il ne touche
aucun fichier de `web/`. Vercel sert déjà tout ce dont il a besoin. Une
seconde fusion n'est nécessaire que pour la propreté de l'historique, pas pour
la production.

---

## 4. Après vos deux interventions

Je prendrai le relais, en lecture seule :

1. poser `SCHOOL_API_BASE_URL` sur Altare via `altare-env.mjs`, une fois la
   route confirmée à **401** ;
2. rejouer le parcours « absences de la 6ème A » **contre la production**, avec
   l'identifiant réel `fb5fa8be-…ec39` ;
3. éprouver les notifications sur `68663737` et `68881226`, un message par
   numéro, clairement identifié comme test et sans aucune donnée d'élève ;
4. distinguer, dans le compte rendu, *accepté par la passerelle* de *livré* —
   une promesse résolue ne prouve pas une livraison.

Aucune écriture dans les dossiers scolaires. T-02 reste en attente.
