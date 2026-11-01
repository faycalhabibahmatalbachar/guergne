# Rapport de recette — Agent IA du Lycée Guergné La Renaissance

Branche : `ai-school-agent-p0-audit` — 2026-11-01

**Règle appliquée dans tout ce document : code écrit, code testé, code déployé et
fonctionnalité opérationnelle sont quatre états différents.** Chacun est annoncé
séparément, et aucun n'est déclaré sans preuve reproductible.

Aucune clé, aucun numéro complet et aucune donnée scolaire réelle ne figure ici.

---

## A. Récupération Altare

### État initial constaté

| Observation | Preuve |
|---|---|
| `/sante` ne répond pas | `curl http://se-kna02.altare.global:25278/sante` → exit 7, `HTTP=000` (pas de connexion TCP) |
| Verrou présent | `donnees/instance.lock` = `{"pid":15,"vuLe":1793539614696}` |
| Dernier battement | 2026-11-01T13:26:54Z (confirmé par le `mtime` du fichier, source indépendante du contenu) |
| Session WhatsApp | `donnees/wwebjs_auth/` présent — **intacte, jamais touchée** |

Lecture faite par `agent/scripts/diag-altare.mjs`, écrit pour cette recette :
diagnostic **en lecture seule**, qui n'affiche aucune valeur de secret.

### Cause exacte

Le verrou n'est pas resté bloqué parce que le PID 15 était vivant. Il l'est
resté parce que **la boucle de redémarrage d'Altare était plus rapide que le
TTL**.

L'ancien mécanisme ne connaissait qu'un seul critère : l'âge du dernier
battement comparé à un TTL de 60 s. Après l'arrêt du processus, Altare relance
immédiatement ; chaque relance retrouvait un verrou vieux de quelques secondes,
donc « frais », donc opposable, et s'arrêtait avec le message constaté. Après
quelques échecs rapprochés, Altare a cessé de relancer. Le service est alors
resté à l'arrêt — et le verrou, lui, a continué de vieillir sans que plus
personne ne tente de le reprendre.

Trois défauts se combinaient :

1. **Le PID seul n'identifie personne.** Dans un conteneur, les numéros
   repartent de zéro et se recyclent : un PID à deux chiffres en est la
   signature. Si le nouveau processus reçoit justement le numéro inscrit, il se
   croit propriétaire et écrase le verrou d'un autre ; si un processus étranger
   hérite du numéro, il est pris pour le détenteur, indéfiniment.
2. **L'âge dépend de l'horloge.** Une horloge qui se recale au démarrage du
   conteneur peut placer `vuLe` dans l'avenir : l'âge devient négatif, donc
   toujours inférieur au TTL, et plus aucun démarrage ne réussit jamais.
3. **L'écriture n'était pas une création.** `write` + `rename` écrase sans
   condition : deux démarrages simultanés se déclaraient tous deux
   propriétaires.

### Correction appliquée

Nouveau module `agent/src/verrou.js` (`persistance.js` le réexporte).

**Le principe : la liveness est décidée par le processus, pas par l'horloge.**
Sous Linux, `/proc/<pid>/stat` donne l'état réel et l'instant de démarrage ; cet
instant sert d'identité, ce qui règle le recyclage de PID. Le TTL ne subsiste
que comme repli là où `/proc` n'existe pas.

| Exigence | Mise en œuvre |
|---|---|
| Une seule instance | Vérifiée à l'acquisition, à chaque battement, et juste avant la connexion WhatsApp |
| Création atomique | `link()`, qui échoue si la cible existe — ce que `rename` ne garantit pas |
| Contenu du verrou | `instanceId`, `pid`, `identiteProcessus`, `demarreLe`, `vuLe` |
| Existence réelle du processus | `/proc/<pid>/stat` ; zombie (`état Z`) traité comme mort |
| PID réutilisé | Comparaison de l'instant de démarrage ; à défaut, de la commande |
| Verrou actif jamais supprimé | Relecture et comparaison du contenu juste avant le remplacement |
| Remplacement atomique | `unlink` puis `link`, suivi d'une **relecture de confirmation** |
| Battement | N'actualise que le verrou dont l'`instanceId` est le nôtre |
| Libération | Vérifie l'`instanceId`, jamais le seul PID |
| Arrêt propre | SIGINT/SIGTERM → WhatsApp, HTTP, battement, verrou |
| Rafales de redémarrage | `FreinRedemarrage` : au-delà de 3 démarrages en 2 min, pause de 30 s |

Diagnostic au format demandé, sans secret ni numéro :

```
[verrou] pid=… owner=… ageMs=… processAlive=… decision=… detail=…
```

Et une sécurité supplémentaire : si le battement découvre que le verrou n'est
plus le nôtre, le processus **s'arrête immédiatement**. Une instance évincée ne
peut pas rester connectée à WhatsApp.

**Le verrou de production se répare tout seul** : `pid=15` est soit absent, soit
porté par un autre programme ; dans les deux cas la décision est `perime-mort`
ou `perime-reutilise`, et la reprise est immédiate. **Aucune suppression
manuelle n'est nécessaire** — et aucune n'a été faite.

### État du processus final

**Le code est déployé ; le service n'est pas redémarré.**

| Étape | État | Preuve |
|---|---|---|
| Code transféré par SFTP | FAIT | `src/verrou.js` présent, 2026-11-01T14:37Z |
| Configuration `.env` déposée | FAIT | 4 variables, 453 octets, **mode 600** |
| Processus démarré | **NON** | `/sante` → `HTTP=000` |

Altare n'expose **aucune route de redémarrage** : la console n'est pas un shell
et SFTP ne lance pas de processus. **Le démarrage depuis le panneau est la seule
voie, et elle appartient à l'humain.** C'est le blocage n°1 (§F).

### État WhatsApp

Session authentifiée **préservée**. `donnees/wwebjs_auth/` n'a jamais été
touché, `dedup.json` non plus, et aucun nouveau cycle d'appairage n'a été
ouvert. Aucun client WhatsApp n'a été lancé pendant cette recette.

---

## B. Fournisseurs IA

Moteur étendu de 2 à **4 fournisseurs**, tous compatibles OpenAI sur
`/chat/completions`. Les modèles par défaut ont été retenus **après
interrogation de `GET /models` avec les comptes réels** — pas d'après une
documentation, qui décrit des modèles auxquels un compte n'a pas forcément
droit.

| Fournisseur | Configuré | Authentifié | Modèle | Appel réel | Latence | Statut | Repli vérifié |
|---|---|---|---|---|---|---|---|
| **Groq** | oui | **oui** | `openai/gpt-oss-120b` | oui — « PONG » | 626 ms | disponible | oui (source) |
| **OpenRouter** | oui | **oui** | `openai/gpt-oss-120b` | oui — « PONG » | 1923 ms | disponible | **oui (cible)** |
| **Mistral** | oui | **oui** (429 ⇒ identifié) | `mistral-small-latest` | HTTP 429 | 364 ms | limité | n/a |
| **xAI (Grok)** | **non** | — | `grok-4.3` (prévu) | **non** | — | non configuré | non |

Preuve de repli **réelle**, avec une clé délibérément invalide en tête de file :

```
[trace] {"type":"fournisseur_ecarte","fournisseur":"groq","raison":"authentification"}
[trace] {"type":"llm_echec","fournisseur":"groq","categorie":"fatal","tentative":1,"erreur":"HTTP 401"}
bascule OK : openrouter a repondu apres l'echec de groq
etat groq : {"statut":"ecarte","authentifie":false,"appels":1,"echecs":1,"dernierCode":401}
```

Un seul appel sur Groq : une clé refusée n'est jamais réessayée.

### Le piège Groq / Grok

`Groq` (api.groq.com) et `Grok` de xAI (api.x.ai) sont deux produits différents
d'entreprises différentes, qui ne diffèrent que d'une lettre. Le fichier de clés
local nomme d'ailleurs `grok_api` une clé qui est **une clé Groq** — vérifié par
appel réel.

Le moteur sépare donc strictement `groq` et `xai`, accepte `GROK_API_KEY` comme
alias de `XAI_API_KEY`, et **refuse la même valeur dans les deux cases** en
l'écrivant dans les journaux au démarrage, sans jamais citer la valeur.

### Taxonomie des états

Une clé présente ne prouve rien. `/sante` publie désormais, par fournisseur :
`non_configure`, `configure`, `disponible`, `limite`, `ecarte`, `erreur`,
`desactive` — plus le modèle, le nombre d'appels, de succès, d'échecs, les
jetons et la latence moyenne.

Règle de lecture retenue après correction : **« authentifié » l'emporte sur la
dernière erreur**. Un fournisseur qui nous a déjà répondu puis a subi un 429
redevient `disponible` à la fin du cooldown, et non « en erreur » ; `erreur` est
réservé au cas où l'on n'a jamais réussi à se faire identifier.

### Transcription vocale — mécanisme de sélection distinct

La transcription **ne suit pas** l'ordre des LLM. Seuls les fournisseurs
exposant réellement `POST /audio/transcriptions` sont essayés.

| Fournisseur | Transcription | Justification |
|---|---|---|
| Groq | **oui** — `whisper-large-v3-turbo` | Présent dans `GET /models`, point testé : HTTP 200 en 841 ms |
| xAI | **non branchée** | Existe, mais sur `POST /v1/stt`, de forme différente. La déclarer compatible ferait échouer tous les messages vocaux |
| OpenRouter | **non** | Aucun point de transcription documenté |
| Mistral | **non** | Aucun sur ce compte |

**Réserve à connaître :** l'échantillon de test (0,5 s de silence) a produit
`" Sous-titrage Société Radio-Canada"` — une hallucination classique de Whisper
sur du silence. Le point d'entrée est donc prouvé joignable et authentifié, mais
**la qualité de transcription d'un vrai message vocal reste à démontrer**, et un
message vocal vide produira du texte inventé. À traiter avant d'ouvrir le canal
vocal.

### Trois défauts trouvés en éprouvant pour de vrai

Les tests unitaires ne pouvaient pas les voir ; les appels réels, si.

1. **Budget de jetons et modèles de raisonnement.** `openai/gpt-oss-120b`
   consomme son budget *avant* d'écrire : avec un plafond trop bas, il rend
   HTTP 200, un contenu vide et `finish_reason: "length"`. L'ancien code
   classait cela « transitoire » et **réessayait trois fois le même appel**, qui
   ne pouvait pas aboutir. Désormais ce cas est détecté, nommé, et passe
   directement au fournisseur suivant — un appel au lieu de trois.
2. **Mode JSON et mot-clé obligatoire.** Les API compatibles OpenAI refusent
   `response_format: json_object` en **HTTP 400** si le mot « json » n'apparaît
   dans aucun message. L'invite actuelle le contient, mais une reformulation le
   perdrait et casserait toute compréhension. La consigne JSON est maintenant
   ajoutée dans tous les cas, ce qui garantit la présence du mot.
3. **Mode JSON non documenté chez xAI.** `response_format` n'y est pas confirmé.
   L'envoyer risquerait un 400 sur chaque message : pour xAI, la consigne passe
   par l'invite, et `extraireJson` reste la dernière ligne de défense.

### Chemin de compréhension réellement emprunté en production

Les démonstrations de bout en bout appellent l'API du fournisseur **en direct**
et ne passent donc pas par le moteur : un défaut dans `ia.js` y resterait
invisible. `agent/scripts/verif-nlu.mjs` éprouve le vrai chemin
(`MoteurIA.completerJson` + invite du registre) :

```
OK  « Quelles sont les trois dernières absences ? »   -> consulter_absences {"limite":3}
OK  « Qui dépasse le seuil d'absences ? »             -> alertes {}
OK  « Montre les absences de la 6ème B. »             -> consulter_absences {classeId}
OK  « Absences non justifiées de la 3ème A. »         -> consulter_absences {classeId, statut}
OK  « Montre les absences de la 7ème Z. »             -> demande une precision
5/5
```

---

## C. Configuration `.env` sur Altare

Vérifiée **sans jamais afficher une valeur** : seuls le nom de la variable, la
longueur de sa valeur, la présence de guillemets et les espaces parasites sont
examinés.

| Contrôle | Résultat |
|---|---|
| Variables avant | `GROQ_API_KEY`, `MISTRAL_API_KEY` (2) |
| Variables après | + `OPENROUTER_API_KEY`, `AGENT_SERVICE_TOKEN` (4) |
| Syntaxe `process.loadEnvFile` | conforme |
| Guillemets, espaces parasites | aucun |
| Doublons, valeurs contradictoires | aucun |
| Permissions | **0600** |
| `.env` ignoré par Git | oui (`*.env`, `.env.*`, sauf `.env.example`) |
| Secrets dans l'historique Git | **aucun** |

**Deux corrections apportées au dépôt des secrets :**

- Le `mode: 0o600` de `put` **n'est pas honoré** par le serveur SFTP d'Altare :
  le fichier ressortait en **666**, lisible par tout le conteneur. Un `chmod`
  explicite est désormais appliqué **et vérifié** ; l'écart est signalé s'il
  persiste.
- Le script réécrit le fichier **en entier**. Il lit maintenant l'existant
  d'abord, compare les **noms** (jamais les valeurs), et **s'arrête** si une
  variable présente sur le serveur allait disparaître. Plus de réécriture en
  aveugle.

`SCHOOL_API_BASE_URL` reste **délibérément absente** : voir §D.

Recherche de secrets dans l'historique Git : `gsk_` → 0 commit, `sk-or-v1` →
0 commit, `xai-` → 1 commit, **faux positif** (une phrase de documentation
expliquant justement le piège Groq/Grok).

---

## D. Backend scolaire

**Le backend n'est pas raccordé, et il ne doit pas l'être en l'état.**

| Vérification | Résultat |
|---|---|
| `POST https://lycee-guergne-renaissance.vercel.app/api/agent/listerAlertes` | **HTTP 404** |
| `POST .../api/agent/listerClasses` | **HTTP 404** |
| `POST .../api/sante` | HTTP 405 |
| Route présente sur `origin/main` | **non** (`git ls-tree` vide) |

Le 405 sur `/api/sante` est décisif : **le déploiement est en ligne et
joignable**. Les 404 ne disent donc pas « site éteint » mais « route absente ».
La route `/api/agent/[action]` n'existe que sur la branche de travail.

**`SCHOOL_API_BASE_URL` n'a pas été renseignée.** `app.js` ne fait qu'un test de
présence (`Boolean(url && jeton)`) : la poser ferait passer `/sante` à
`backend:true` pendant que chaque appel répondrait 404. **Un faux vert est pire
qu'un rouge franc.**

Condition de déblocage, à vérifier avant de renseigner la variable : l'URL doit
répondre **401** (route présente, jeton exigé) — ni 404 (route absente), ni 503
(jeton absent côté Vercel).

Le jeton `AGENT_SERVICE_TOKEN` est en revanche **déjà déposé** sur le serveur :
sans l'URL il ne configure rien, et cela évitera un second passage le jour du
branchement.

Ce qui a été vérifié du code de la route, sur la branche (écrit et testé, **pas
déployé**) : double authentification jeton de service + `x-acteur-id`, liste
blanche d'opérations, garde `exigerPermissionPour` (AUTH → RÔLE → PÉRIMÈTRE),
comparaison du jeton en temps constant, aucune trace de pile renvoyée, aucun SQL
arbitraire.

---

## E. Liste blanche et identités

**Identifiants masqués uniquement.**

| Mesure | Valeur |
|---|---|
| Entrées transmises | 3 |
| Numéros au format valide | 3 |
| Comptes résolus dans la plateforme | 2 |
| Liaisons actives créées | **0** |
| En attente | **3** |
| Suspendus / révoqués | 0 |

Résolution faite contre la **source faisant autorité** (base de la plateforme),
**en lecture seule** :

| Numéro | Verdict | Motif |
|---|---|---|
| `235•••••737` | `ROLE_REFUSE` | compte **PARENT** — ne pilote pas l'agent |
| `235•••••226` | `ROLE_REFUSE` | compte **PARENT** — ne pilote pas l'agent |
| `235•••••262` | `INCONNU` | aucun compte de la plateforme ne porte ce numéro |

**Aucune liaison n'a été créée, et c'est le comportement correct.** Lier ces
numéros aurait donné à l'agent des comptes de parents ; leur attribuer un rôle
supérieur aurait contourné le RBAC de l'établissement. Ni l'un ni l'autre n'a
été fait.

### Ce que l'état de la plateforme révèle

| Rôle | Comptes | Observation |
|---|---|---|
| `PARENT` | 233 actifs | — |
| `SUPER_ADMIN` | 3 actifs | **aucun n'a de numéro de téléphone renseigné** |
| `SURVEILLANT` | 3 **inactifs** | comptes de test `ZZTEST-AGENT-SURVEILLANT` |
| `DIRECTION`, `CENSEUR`, `SECRETARIAT`, `COMPTABLE`, `ENSEIGNANT` | **0** | aucun compte |

Deux conséquences qui dépassent la liste blanche :

1. **Il n'existe aujourd'hui aucun compte de surveillant actif.** Or
   `assiduite:saisir` appartient au rôle `SURVEILLANT`. Personne, hormis un
   `SUPER_ADMIN`, ne peut faire l'appel.
2. **Deux comptes `SUPER_ADMIN` portent le même nom** et deux adresses
   différentes — doublon à trancher avant de désigner un auteur de
   provisionnement.

### Mécanisme livré, prêt à servir

- `agent/src/resolution-comptes.js` — canonisation des numéros (indicatif
  ajouté **seulement** à une longueur nationale, pour ne pas maquiller une
  saisie fautive), puis verdict : `inconnu`, `ambigu`, `contact_sans_compte`,
  `inactif`, `role_refuse`, `ok`. Le module ne consulte rien : il choisit parmi
  ce qu'on lui donne, donc **il ne peut rien inventer**.
- Un numéro présent à la fois comme compte et comme fiche de tuteur **n'est pas
  une ambiguïté** : c'est la même personne, avec une fiche de contact par
  enfant. Les confondre bloquerait presque tous les numéros de l'établissement.
- `ROLES_PILOTES` : les 7 rôles de personnel. `PARENT` et `ELEVE` en sont
  exclus — ouvrir le canal aux familles est une décision d'établissement, pas
  un réglage technique.
- `ROLES_AUTORISANTS` : seuls `SUPER_ADMIN` et `DIRECTION` peuvent autoriser une
  liaison. `lier()` exige un auteur réel ; **« system » est refusé**, il ne
  répond de rien devant personne.
- `agent/scripts/resoudre-identites.mjs` — rapport par défaut, dépôt seulement
  avec `--ecrire`, sauvegarde préalable, et **refus de faire disparaître une
  liaison active** non reconstituée.
- Désignation explicite possible : `"compte": "<email ou id>"` dans la liste
  privée. Le numéro devient le moyen de joindre l'agent, et l'administrateur dit
  au nom de quel compte il parle — **sans dispenser d'aucun contrôle** (le
  compte doit exister, être actif, avoir un rôle autorisé).

La liste vit dans `identites-autorisees.json`, **hors Git** (`.gitignore`
vérifié par `git check-ignore`). Aucun numéro complet n'apparaît dans un
journal, un commit ou ce rapport.

**Aucun message WhatsApp n'a été envoyé** : le service est à l'arrêt, et le test
d'envoi autorisé n'a donc pas pu être fait.

---

## F. Qualité et tests

| Mesure | Valeur |
|---|---|
| Tests automatisés | **204** |
| Réussites | **204** |
| Échecs | **0** |
| Au début de la session | 136 |
| Ajoutés | **+68** |
| Fichiers `web/` modifiés | **aucun** — cette recette n'a touché que `agent/` |
| Commits | voir ci-dessous |
| Déploiements | code + `.env` transférés ; **service non redémarré** |

Couverture du verrou — les neuf cas exigés, plus trois :

propriétaire actif · propriétaire arrêté · PID réutilisé · PID réutilisé par un
autre programme (verrou d'ancienne génération) · verrou périmé par TTL · verrou
corrompu · deux démarrages simultanés · arrêt propre · arrêt brutal puis
redémarrage · **horodatage dans l'avenir** · battement n'actualisant que le
verrou possédé · libération ne touchant jamais le verrou d'autrui.

Couverture des identités : numéro valide · numéro inconnu · compte inconnu ·
plusieurs comptes · mauvais rôle · numéro déjà associé · suspension ·
révocation · persistance après redémarrage · contact sans compte · auteur
invalide · auteur désactivé · auteur au rôle insuffisant.

Tests réels (hors unitaires) : `GET /models` sur 3 comptes · appel « PONG » par
fournisseur · réponse JSON par fournisseur · **repli réel sur 401** ·
transcription Groq (HTTP 200) · NLU par le chemin de production (5/5).

Tests isolés (base Neon de test `ep-flat-thunder`, jamais la production) :

- **Lecture** — « Montre-moi les 3 dernières absences » → `COMPLETED`,
  `OK:assiduite:lire`, 3 lignes nommées et datées depuis la base réelle.
- **Écriture** — nom volontairement abîmé « Fatim ABAKAR » → résolu en
  « Fatimé ABAKAR », vérifié par `eleveId` ; 0 → 1 absence ; réponse
  « 1 absence(s) enregistré(s). Les tuteurs seront notifiés. »
- **Confirmation** — la suppression exige `oui` : `WAITING_APPROVAL` puis
  `COMPLETED`.
- **État final** — 0 absence, identique à l'état initial.

`e2e-ecriture.mjs` **refuse de démarrer** si le serveur ne pointe pas sur la
branche de test : les 549 élèves ont tous un tuteur, et un déclencheur alimente
la file de notification à chaque absence insérée.

**Aucune notification réelle n'a été envoyée à un tuteur.**

---

## G. Blocages

### 1. Le service doit être démarré depuis le panneau Altare — *humain*

- **Cause** : Altare a cessé ses redémarrages automatiques après la boucle
  d'échecs. Aucune route de redémarrage n'existe ; la console n'est pas un
  shell, et SFTP ne lance pas de processus.
- **Preuve** : `/sante` → `HTTP=000`, alors que le code corrigé et la
  configuration sont déposés et vérifiés sur le serveur.
- **Intervention** : ouvrir le panneau Altare (serveur `lycee-whatsapp-gateway`,
  `ba6c9bf3`) et **démarrer**. Rien d'autre : le verrou se reprendra seul, la
  session WhatsApp est intacte, les dépendances et Chromium sont déjà installés.
- **À vérifier juste après**, dans les journaux puis sur `/sante` :
  `[verrou] … decision=perime-mort` (ou `perime-reutilise`) ·
  `[config] groq=present xai=absent openrouter=present mistral=present` ·
  `whatsapp":"ready"` · `"ia":true`.
- **Conséquence si non résolu** : rien ne fonctionne. Tout le reste est suspendu
  à ce démarrage.

### 2. Les numéros autorisés ne correspondent à aucun compte de personnel — *institutionnel*

- **Cause** : deux des trois numéros sont rattachés à des comptes `PARENT`, le
  troisième à aucun compte. Les 3 comptes `SUPER_ADMIN` n'ont pas de téléphone.
- **Preuve** : tableau du §E, obtenu en lecture seule sur la source autoritaire.
- **Intervention** : dire, pour chaque numéro, **au nom de quel compte** il
  parle — puis renseigner `"compte"` dans `identites-autorisees.json` et lancer
  `node agent/scripts/resoudre-identites.mjs --ecrire`. C'est une décision de
  sécurité : un numéro lié à un `SUPER_ADMIN` dispose de toute la plateforme.
- **Conséquence si non résolu** : aucun numéro n'est reconnu, donc **aucune
  opération n'est possible**, même service démarré. C'est le défaut sûr.

### 3. L'API agent n'est pas déployée — *institutionnel*

- **Cause** : la route `/api/agent/[action]` n'existe que sur
  `ai-school-agent-p0-audit`. La fusionner dans `main` met en ligne des
  **écritures d'assiduité** sur la plateforme réelle, avec le déclencheur qui
  notifie les tuteurs.
- **Preuve** : 404 sur les routes agent, 405 sur `/api/sante`, absence sur
  `origin/main`.
- **Intervention** : décider de la fusion, puis poser `AGENT_SERVICE_TOKEN` sur
  Vercel (déjà prévu dans `web/scripts/vercel-env.mjs`) — ou obtenir un jeton de
  contournement de la protection Vercel pour viser une prévisualisation.
- **Conséquence si non résolu** : l'agent comprend et répond, mais ne peut lire
  ni écrire aucune donnée scolaire depuis le serveur. `backend:false` reste la
  mention exacte.

### 4. Aucune clé xAI — *externe, mineur*

- **Cause** : `XAI_API_KEY` n'existe nulle part.
- **Preuve** : `verif-fournisseurs.mjs` → `xai : non configure`.
- **Intervention** : fournir une clé, ou acter que trois fournisseurs suffisent.
- **Conséquence si non résolu** : aucune. Trois fournisseurs fonctionnent, dont
  deux disponibles à l'instant.

### 5. Quota Mistral saturé — *externe, mineur*

- **Preuve** : HTTP 429 reproductible ; la clé est bien acceptée (un 429 vient
  d'un service qui nous a identifiés).
- **Conséquence** : Mistral ne sert pas de repli tant que le palier est saturé.
  Groq et OpenRouter couvrent le besoin.

### 6. Arbitrages ouverts — *institutionnels*

- `enregistrer_appel` est classé `WRITE`, pas `SENSITIVE` : l'absence part dès
  le premier message, **sans confirmation**, alors qu'elle notifie les tuteurs.
  Pour le parent qui reçoit le message, c'est aussi irréversible qu'une
  suppression.
- `assiduite:saisir` appartient à `SURVEILLANT`, et **aucun surveillant actif
  n'existe** sur la plateforme.
- La transcription d'un vocal silencieux produit du texte inventé (§B). Il faut
  un garde-fou avant d'ouvrir le canal vocal.

---

## H. Prochaine étape

**Dans l'ordre, et le premier conditionne tous les autres :**

1. **Démarrer le serveur depuis le panneau Altare**, puis lire `/sante` : c'est
   la seule chose qui manque pour passer de « déployé » à « opérationnel », et
   la seule qu'un humain doive faire.
2. **Désigner les comptes** des trois numéros, puis provisionner.
3. **Décider du déploiement de l'API agent**, et seulement ensuite renseigner
   `SCHOOL_API_BASE_URL` — après avoir vérifié que l'URL répond 401.

**Puis, pour faire de l'agent un véritable superviseur de la plateforme :**
créer les comptes de personnel qui manquent (aucun `DIRECTION`, `CENSEUR`,
`SECRETARIAT`, `COMPTABLE`, `ENSEIGNANT`, aucun `SURVEILLANT` actif). Le
catalogue d'outils, le RBAC et le moteur sont prêts pour sept rôles ; la
plateforme n'en peuple qu'un seul. C'est désormais là que se trouve l'écart
entre ce que l'agent sait faire et ce qu'il peut servir.
