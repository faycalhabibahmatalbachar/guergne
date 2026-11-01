# Rapport de recette — Agent IA du Lycée Guergné La Renaissance

Branche : `ai-school-agent-p0-audit` — 2026-11-01

**Règle appliquée dans tout ce document : code écrit, code testé, code déployé et
fonctionnalité opérationnelle sont quatre états différents.** Chacun est annoncé
séparément, et aucun n'est déclaré sans preuve reproductible.

Aucune clé, aucun numéro complet et aucune donnée scolaire réelle ne figure ici.

---

## 0 bis. Incident « l'agent ne répond plus » — le silence

Après la correction d'identité, le refus « Numéro non autorisé » a cessé — et
**plus aucune réponse n'est arrivée**. Aucune ligne `identity_resolution`,
aucun appel IA, aucun envoi. Le processus paraissait sain, `/sante` répondait,
WhatsApp était `ready`.

### A. Cause racine

**Ce n'était pas une exception** — celles-là étaient attrapées et journalisées.
C'était une **promesse qui ne se résout jamais**.

`getContactLidAndPhone`, introduit pour résoudre les identifiants LID, traverse
Puppeteer jusqu'à la page WhatsApp, qui interroge le réseau. Si cette requête
reste en suspens, le traitement du message reste en suspens avec elle, **pour
toujours**. Rien ne le signale : ni erreur, ni délai, ni trace.

Le changement de symptôme le prouve. Avant, le refus arrivait — donc l'envoi
fonctionnait. Après, silence total — donc le message se perdait **avant**
l'envoi, dans du code qui venait d'être ajouté, et sur le seul chemin nouveau :
la résolution LID, placée juste avant le journal d'identification.

**Une attente sans borne est un échec qui ne dit pas son nom.**

### B. Correctifs

| Fichier | Correctif |
|---|---|
| `src/delai.js` *(nouveau)* | `avecDelai` borne toute dépendance externe. `defaut` n'absorbe **que** le dépassement : masquer une vraie erreur recréerait le problème. Le minuteur est toujours nettoyé. |
| `src/providers/wwebjs.js` | Résolution LID bornée à 10 s, envoi à 30 s. Journaux `message_received`, `message_normalized`, `handler_started/completed/error`, `reply_started/accepted/failed`. |
| `src/engine.js` | Enveloppe qui garantit **toujours** une réponse ; revendication de déduplication relâchée si l'échec précède toute action métier ; commande `TEST AGENT`. |
| `src/persistance.js`, `src/idempotency.js` | `oublier(id)` — relâcher une revendication, et que cela survive au redémarrage. |
| `app.js` | Journal d'étape corrélé et état des dépendances pour le diagnostic. |

**Un message obtient désormais toujours une réponse.** Pour l'utilisateur, le
silence et la panne se ressemblent : il renvoie son message, ce qui ne change
rien. Toute défaillance devient un message explicite et une entrée d'audit.

### C. Déduplication — ni silence, ni double écriture

La revendication se relâche quand l'échec précède toute action métier : la
marquer vue à vie condamnait un message pour une panne d'une seconde. Elle est
**conservée** dès qu'une écriture a pu aboutir — rejouer une absence en
créerait une seconde dans le dossier d'un élève. Trois états sont désormais
tracés : `message_id_missing`, `message_duplicate_detected`,
`message_id_claimed`.

### D. Observabilité corrélée

Un `runId` naît à la réception et accompagne le message jusqu'à la réponse.
Les identifiants de message sont **empreintés** : un identifiant WhatsApp porte
le numéro du correspondant, le journaliser tel quel reviendrait à publier des
numéros.

### E. Commande `TEST AGENT`

Déterministe, placée **avant** le LLM et le backend, réservée aux identités
autorisées, sans écriture ni notification. Elle prouve la chaîne
réception → identité → envoi quand tout le reste est en panne :

```
Agent WhatsApp connecte. Identite reconnue : <role>.
Service IA : <etat verifie>. Backend scolaire : <etat>.
```

L'état annoncé est ce qui est **vérifié**, pas ce qui est configuré : une clé
présente ne prouve pas qu'elle fonctionne.

### F. Tests

**267 tests** (251 avant cet incident), dont : une promesse qui ne se résout
jamais est bornée · un défaut n'absorbe pas une vraie erreur · le minuteur ne
retient pas le processus · une compréhension qui lève, et une qui n'aboutit
jamais, ne produisent pas de silence · un envoi qui échoue ne masque pas la
cause · un échec avant action métier relâche la revendication · un échec après
la conserve · un vrai doublon reste ignoré · `TEST AGENT` sans LLM ni backend ·
`TEST AGENT` refusé à un inconnu · une phrase ordinaire ne la déclenche pas ·
le `runId` du transport traverse toutes les étapes.

### G. Livraison

| Élément | État |
|---|---|
| Commit | `a1f4dd5` |
| Push | **confirmé** sur `ai-school-agent-p0-audit` |
| Déploiement Altare | **vérifié par condensat** — 8 fichiers identiques au commit |
| Version chargée | **en attente d'un redémarrage** |

---

## 0. Incident `REFUSED_UNKNOWN` — identification des responsables

Le service démarrait, WhatsApp atteignait `ready`, le magasin chargeait son
association active, et **tout message était refusé**. Neuf refus consécutifs.

### A. Cause exacte

Le refus naît à `agent/src/engine.js`, étape 2 : `identity.resolve(msg.fromJid)`
rend `null`. Deux causes distinctes se superposaient, et il fallait les séparer.

**Cause latente — un identifiant LID n'est pas un numéro.**
L'agent comparait la partie numérique de `msg.from` à la liste blanche. Cela ne
vaut que pour `…@c.us`. Depuis la migration de WhatsApp vers les identifiants
LID, un message peut arriver de `…@lid`, dont la partie gauche est un
identifiant interne de WhatsApp : **elle ne désigne aucun abonné
téléphonique**. La comparer à la liste blanche a deux issues, toutes deux
fausses :

- aucune correspondance, et un responsable pourtant autorisé est refusé ;
- une correspondance fortuite, et un inconnu obtient le compte d'un autre.

**Cause immédiate probable — le numéro testé n'est pas celui qui est lié.**
Le magasin déployé contient une seule association : `235•••••226`
(ABDOULAYE ABDELHALIM, compte DIRECTION). Le numéro `235•••••737`
(HABIB FAYCAL) n'a toujours **aucun compte d'accès au portail**, donc aucune
association — un refus `UNKNOWN_NUMBER` y est le comportement correct, pas un
défaut.

Ces deux causes ne se départagent pas par raisonnement : il y fallait une
preuve, et l'audit n'en donnait aucune. Il n'écrivait que `REFUSED_UNKNOWN`,
sans jamais dire de quel numéro ni pour quelle raison. **C'est le défaut
d'observabilité qui a rendu l'incident opaque**, autant que le défaut de code.

### B. Correctifs

| Fichier | Correctif |
|---|---|
| `src/jid.js` *(nouveau)* | Sépare ce qui porte un numéro de ce qui n'en porte pas. Refuse **catégoriquement** d'utiliser la partie gauche d'un LID en repli. |
| `src/providers/wwebjs.js` | `resoudreLid()` via `getContactLidAndPhone` — mécanisme officiel de `whatsapp-web.js` 1.34. Résultat mis en cache ; un échec n'est jamais gravé. |
| `src/engine.js` | Résout le vrai numéro **avant** de consulter la liste blanche ; émet le journal d'identification ; porte la raison du refus dans l'audit. |
| `src/identity-store.js` | `empreintes(sel)` — le calcul vit **dans** le magasin, pour que le numéro brut n'en sorte jamais. |
| `app.js` | Branche le journal, écrit les empreintes des associations au démarrage, et corrige l'ordre IA affiché. |

Groupes, diffusions et JID invalides ont désormais leur propre refus au lieu de
se fondre dans « numéro inconnu ». **Un refus d'identité n'est jamais présenté
comme un refus de permission.**

Raisons désormais distinguées : `INVALID_JID`, `NORMALIZATION_FAILED`,
`GROUP_NOT_SUPPORTED`, `BROADCAST_NOT_SUPPORTED`, `LID_NOT_RESOLVED`,
`UNKNOWN_NUMBER`, `IDENTITY_SUSPENDED`, `IDENTITY_REVOKED`.

**Comment l'incident se diagnostiquera désormais.** Au démarrage, chaque
association écrit son empreinte salée ; à chaque message, le journal
d'identification écrit celle de l'expéditeur. Deux empreintes identiques
signifient « c'est le bon numéro, regardez l'état de l'association » ; deux
empreintes différentes signifient « le message vient d'un autre numéro ». Aucun
numéro complet n'apparaît, et le sel est neuf à chaque démarrage — l'empreinte
sert à comparer, pas à identifier durablement.

```json
{"type":"identity_resolution","run":"run_…","jidType":"lid","viaLid":true,
 "numeroMasque":"235•••••226","empreinte":"…","normalisation":"success",
 "associationPersistante":"active","role":"DIRECTION","decision":"ALLOW","raison":null}
```

### C. Identités — état au 2026-11-01

| Numéro | État | Ce qui manque |
|---|---|---|
| `235•••••226` | **Autorisé et déployé** | rien — compte DIRECTION actif |
| `235•••••737` | **En attente** | fiche DIRECTEUR active, mais aucun compte portail |
| `235•••••262` | **Inconnu** | absent de l'annuaire du personnel |

Aucun numéro PARENT n'a été réintroduit. Aucune identité n'a été fabriquée.

### D. Tests

**247 tests passent** (216 avant cet incident), dont 31 nouveaux sur
l'identification.

JID et numérotation : `@c.us` · `@s.whatsapp.net` · `@lid` résolu · `@lid` non
résolu · `@lid` rendant un LID · `@lid` levant une exception · `@g.us` ·
`broadcast` · suffixe d'appareil · serveur inconnu · JID vide, nul, sans
arobase · **LID dont les chiffres valent un numéro autorisé**.

Liste blanche : autorisé et actif · inconnu · suspendu · révoqué · persistance
après redémarrage · exactitude du compte associé · journal sans aucun numéro
complet · empreinte du message égale à celle du magasin.

RBAC, avec le compte DIRECTION réel : `assiduite:lire` **autorisé et servi**,
`assiduite:saisir` **refusé** (`DENIED:assiduite:saisir`), refus tracé.

Le test de sécurité central : **un LID dont la partie numérique vaut un numéro
autorisé reste refusé.** Sans lui, la correction pourrait être défaite sans que
rien ne le signale.

### E. Livraison

| Élément | État |
|---|---|
| Branche | `ai-school-agent-p0-audit` |
| Commit du correctif | `1d98798` |
| Push GitHub | **refusé par la politique de permissions de la session** — en attente d'autorisation |
| Déploiement SFTP Altare | **fait** — `src/jid.js`, `engine.js`, `app.js`, `wwebjs.js`, `identity-store.js` |
| Version chargée par le processus | **l'ancienne** — le processus tourne depuis 3 h, un redémarrage est nécessaire |

### F. Résultat final

**Pas encore.** Le correctif est écrit, testé et transféré, mais **le processus
en cours exécute toujours l'ancien code**. Deux actes restent, et aucun n'est
technique :

1. **Redémarrer le service depuis le panneau Altare** pour charger le correctif.
2. **Créer le compte portail de HABIB FAYCAL** (bouton « Gérer » dans l'annuaire
   administratif) pour que `235•••••737` puisse être lié.

Après le redémarrage, `235•••••226` doit être reconnu quel que soit l'adressage
WhatsApp. Il répondra toutefois « Backend scolaire non configuré » : l'API agent
n'est toujours pas déployée (§D), ce qui est un blocage distinct et déjà
documenté.

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
| Magasin d'identités déposé | FAIT | `donnees/identites.json`, 301 octets, mode 600, 1 liaison |
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
| Comptes résolus | 1 |
| **Liaisons actives créées** | **1** — déployée sur le serveur |
| En attente | 2 |
| Suspendus / révoqués | 0 |

### Le piège qu'il fallait éviter

Chercher un numéro parmi les comptes paraît naturel. C'est faux ici, et
dangereux. Constaté sur la plateforme réelle :

| Numéro | Annuaire du personnel | Table des comptes |
|---|---|---|
| `235•••••737` | **HABIB FAYCAL**, DIRECTEUR | un compte **PARENT** au nom d'**Abakar ABAKAR** |
| `235•••••226` | **ABDOULAYE ABDELHALIM**, DIRECTEUR | **deux** comptes : un DIRECTION et un PARENT |

Pour `•••737`, le compte qui porte le numéro appartient à **quelqu'un d'autre**.
Une résolution par téléphone aurait fait parler un directeur au nom d'un parent.

La chaîne faisant autorité est donc, et elle seule :

```
numero -> fiche de l'annuaire du personnel -> compte RATTACHE par l'etablissement -> role
```

Le rôle vient du compte que l'établissement a lui-même rattaché à la fiche,
jamais d'une correspondance de numéro. Les correspondances trouvées dans la
table des comptes ne servent qu'à **signaler la collision**.

Deux annuaires sont interrogés : `personnels_non_enseignants` (administratif et
technique) et `enseignants`.

### Résultat, numéro par numéro

| Numéro | Verdict | Détail |
|---|---|---|
| `235•••••226` | **OK — LIÉ** | ABDOULAYE ABDELHALIM, DIRECTEUR → compte **DIRECTION** actif |
| `235•••••737` | `PERSONNEL_SANS_COMPTE` | HABIB FAYCAL, DIRECTEUR, fiche active — **aucun compte d'accès au portail** |
| `235•••••262` | `INCONNU` | absent de l'annuaire comme de la table des comptes |

L'agent **ne crée pas de compte** : c'est un acte d'administration de la
plateforme, avec mot de passe et traçabilité propres. Pour `•••737`, un clic sur
« Gérer » dans l'annuaire administratif suffit — ou la désignation explicite
d'un compte existant dans la liste privée.

Provisionnement : `donnees/identites.json` déposé sur le serveur, **301 octets,
mode 600**, 1 liaison active, auteur **SUPER_ADMIN** réel (et non la personne
liée elle-même, pour éviter l'auto-autorisation). `lier()` refuse « system ».

### Tests réels, numéro par numéro

Éprouvés sur le fichier **téléchargé depuis le serveur** — celui que le service
lira — et non sur une copie locale.

| Contrôle | `•••737` | `•••226` | `•••262` |
|---|---|---|---|
| 1. présent dans la liste blanche | oui | oui | oui |
| 2. format normalisé (11 chiffres) | OK | OK | OK |
| 3-4. compte réel, rôle et état | — | **DIRECTION actif** | — |
| 5. association active | non (attendu) | **OK** | non (attendu) |
| 6. `resolve()` | null | **même compte** | null |
| 7. refus si non associé | **REFUSED_UNKNOWN** | — | **REFUSED_UNKNOWN** |
| 8a. pré-filtre de permission | — | **OK:assiduite:lire** | — |
| 8b. donnée servie par le backend réel | — | **OK — « Absences — 2 résultats »** | — |
| 9. écriture refusée (preuve inverse) | — | **DENIED:assiduite:saisir** | — |

**Un détour instructif.** Au premier passage, le pré-filtre de l'agent
autorisait `assiduite:lire` mais le garde de la plateforme refusait. Non pas
parce que `DIRECTION` manquait de droits, mais **parce que ce compte vient de la
production et que la branche de test ne le connaissait pas** : un acteur inconnu
est refusé malgré un jeton de service valide, et le refus est explicite, jamais
un succès silencieux. Bon comportement — mais la chaîne restait non démontrée.

Un **compte de recette** a donc été créé dans la branche de test
(`agent/scripts/compte-test.mjs`), portant le même identifiant que le compte de
production pour que le magasin déployé le résolve réellement. Le script refuse
catégoriquement d'écrire ailleurs que sur la branche de test, marque le compte
`ZZTEST-AGENT-DIRECTION` sur un domaine `example.invalid`, et ne lui pose
**aucun mot de passe** : il ne peut pas se connecter au portail, il ne sert qu'à
l'API agent. `--retirer` le supprime.

La chaîne complète est alors démontrée, dans les deux sens :

```
lecture   OK:assiduite:lire       → « Absences — 2 résultats : … »
ecriture  DENIED:assiduite:saisir → refusee, et tracee dans l'audit
```

**Le rôle n'est pas décoratif** : le directeur lié consulte l'assiduité et ne
peut pas la saisir.

J'ai vérifié que la matrice locale ne ment pas, contre la table `permissions`
faisant autorité :

```
DIRECTION    assiduite:lire     AUCUNE     → la matrice de l'agent dit true  ✔
DIRECTION    assiduite:saisir   (absente)  → la matrice de l'agent dit false ✔
```

**Témoin positif**, avec un acteur que la branche de test connaît, pour ne pas
ne prouver que des refus :

```
perm=OK:assiduite:lire  statut=COMPLETED
• Zenaba TOGBE (6ème B) — 2026-07-14, 3.00 h, justifiée
```

**Refus** (sur une copie — le fichier du serveur n'est jamais modifié) :
numéro inconnu refusé · suspendu refusé, état explicite · réactivé reconnu ·
révoqué refusé · **toujours refusé après redémarrage** · fichier du serveur
inchangé, vérifié octet pour octet.

**Aucun message WhatsApp n'a été envoyé** : le service est à l'arrêt, le
transport est simulé, tout le reste est réel.

### Ce que l'état de la plateforme révèle

| Rôle | Comptes | Observation |
|---|---|---|
| `PARENT` | 233 actifs | — |
| `SUPER_ADMIN` | 3 actifs | aucun n'a de numéro de téléphone |
| `DIRECTION` | 1 actif | rattaché à l'annuaire administratif |
| `SURVEILLANT` | 3 **inactifs** | comptes de test `ZZTEST-AGENT-SURVEILLANT` |
| `CENSEUR`, `SECRETARIAT`, `COMPTABLE`, `ENSEIGNANT` | **0** | aucun compte |

Annuaires : 3 fiches administratives (2 avec téléphone, 1 avec un compte) et
15 enseignants semés, dont **aucun n'a de compte**.

Trois conséquences qui dépassent la liste blanche :

1. **Aucun surveillant actif n'existe.** Or `assiduite:saisir` appartient à
   `SURVEILLANT`, `ENSEIGNANT` (sur ses propres classes) et `SUPER_ADMIN`.
   **`DIRECTION` ne l'a pas** : le directeur lié peut consulter l'assiduité,
   pas la saisir.
2. **La contrainte d'unicité du téléphone est contournable par la mise en
   forme.** Deux comptes portent le même numéro sous deux écritures
   différentes, et `utilisateurs_telephone_key` ne l'a pas vu.
3. **Les 15 enseignants n'ont aucun compte** : aucun ne peut saisir d'appel.

## F. Qualité et tests

| Mesure | Valeur |
|---|---|
| Tests automatisés | **267** |
| Réussites | **267** |
| Échecs | **0** |
| Au début de la session | 136 |
| Ajoutés | **+131** |
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
invalide · auteur désactivé · auteur au rôle insuffisant · **résolution par
l'annuaire du personnel** · **personnel sans compte** · **collision de numéro
signalée mais jamais utilisée**.

### Catalogue d'outils — un piège retiré, cinq capacités ouvertes

`assiduite.controle_saisies` était au catalogue, dans le client, et proposé au
modèle — mais **aucune route ne le servait**. Chaque appel serait parti en 404,
après que l'agent l'eut annoncé à l'utilisateur. Aucune fonction de domaine ne
le soutenait non plus : il a été **retiré**, plutôt que d'inventer une route.

À l'inverse, cinq lectures que la route servait depuis l'origine n'étaient
offertes par aucun outil. Elles le sont désormais, avec leurs paramètres réels
et leur mise en forme :

| Outil | Action | Permission |
|---|---|---|
| `assiduite.consulter_retards` | `listerRetards` | `assiduite:lire` |
| `assiduite.tableau_de_bord` | `statistiquesVieScolaire` | `assiduite:lire` |
| `assiduite.conduite_classe` | `chargerConduiteClasse` | `assiduite:lire` |
| `discipline.consulter_incidents` | `listerIncidents` | `discipline:lire` |
| `discipline.consulter_sanctions` | `listerSanctions` | `discipline:lire` |

Le catalogue passe de 7 à **11 outils**, dont 7 lectures.

**Le vrai correctif est le garde-fou**, pas la correction. Trois tests
structurels lisent maintenant le fichier de la route et le client, au lieu de
figer des attentes à la main — c'est précisément parce qu'elles étaient figées
à la main que le défaut a survécu : toute action d'outil absente de la liste
blanche, et toute méthode du client que la route ne sert pas, font désormais
échouer la recette.

Les 7 lectures ont été appelées une par une contre l'API réelle
(`e2e-catalogue.mjs`) : **7/7 servies et rendues lisiblement**, aucune ne
répondant « Opération effectuée ».

### Écritures : les deux qui n'avaient jamais tourné

`enregistrer_retard` et `justifier_absences` étaient écrits, testés
unitairement, exposés au modèle — et **jamais exécutés une seule fois** contre
la vraie base. « Écrit » n'est pas « éprouvé ».
`e2e-retard-justification.mjs` les exécute, avec un nom volontairement abîmé :

```
Retard enregistre : 15 min, le 2026-11-01.      → 0 → 1, bon eleve, bonne duree
1 absence(s) enregistré(s). Les tuteurs...      → NON_JUSTIFIEE
Justifier 1 absence(s) → « oui »                → JUSTIFIEE
Absence supprimee (motif : …) → « oui »         → retiree
etat final : 0 retard, 0 absence  (etat initial identique)
```

Au passage, deux écritures répondaient encore « ✅ Opération effectuée. » : le
noyau ne renvoie aucun message pour le retard ni pour la suppression. La
confirmation se formule désormais à partir des paramètres — une suppression
irréversible mérite mieux qu'un accusé générique.

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

### 2. Deux des trois numéros ne sont pas encore liables — *administratif*

- **Cause** : `235•••737` (HABIB FAYCAL, DIRECTEUR) a une fiche **active** dans
  l'annuaire administratif mais **aucun compte d'accès au portail**.
  `235•••262` n'apparaît ni dans l'annuaire, ni dans la table des comptes.
- **Preuve** : tableau du §E, obtenu en lecture seule sur la source autoritaire.
- **Intervention** : pour `•••737`, créer le compte depuis « **Gérer** » dans
  l'annuaire administratif — c'est un clic, et c'est un acte d'administration
  que l'agent ne doit pas faire à votre place. Pour `•••262`, créer la fiche ou
  désigner un compte existant. Puis relancer
  `node agent/scripts/resoudre-identites.mjs --auteur <email> --ecrire`.
- **Conséquence si non résolu** : ces deux numéros restent inconnus et refusés.
  Le troisième (`•••226`, DIRECTION) fonctionne déjà.

### 2 bis. Collisions de numéros dans la table des comptes — *donnée à corriger*

- **Cause** : un même numéro désigne deux personnes différentes. La contrainte
  `utilisateurs_telephone_key` est contournée par la mise en forme (`+235 68…`
  contre `68…`).
- **Preuve** : `•••737` porté par un compte PARENT au nom d'**Abakar ABAKAR**,
  alors que l'annuaire l'attribue à **HABIB FAYCAL** ; `•••226` porté par deux
  comptes.
- **Intervention** : nettoyer ces doublons, et normaliser les téléphones avant
  insertion pour que l'unicité porte sur les chiffres seuls.
- **Conséquence si non résolu** : aucune pour l'agent — il résout par l'annuaire
  et signale la collision sans jamais l'utiliser. Mais toute autre
  fonctionnalité qui chercherait un compte par téléphone se tromperait de
  personne.

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
   la seule qu'un humain doive faire. Le magasin d'identités déposé sera chargé
   à ce démarrage, et `ABDOULAYE ABDELHALIM` sera reconnu.
2. **Créer le compte d'accès de `HABIB FAYCAL`** depuis « Gérer » dans
   l'annuaire administratif, puis relancer le provisionnement.
3. **Décider du déploiement de l'API agent**, et seulement ensuite renseigner
   `SCHOOL_API_BASE_URL` — après avoir vérifié que l'URL répond 401.

**Puis, pour faire de l'agent un véritable superviseur de la plateforme :**
donner un compte aux personnes qui doivent s'en servir. Le catalogue d'outils,
le RBAC et le moteur sont prêts pour sept rôles ; la plateforme compte
aujourd'hui 1 compte DIRECTION, 3 SUPER_ADMIN, aucun surveillant actif et
aucun compte pour ses 15 enseignants. **Le directeur lié peut consulter
l'assiduité, mais pas la saisir** — `assiduite:saisir` appartient à
`SURVEILLANT`, `ENSEIGNANT` et `SUPER_ADMIN`. C'est désormais là, et non dans le
code de l'agent, que se trouve l'écart entre ce qu'il sait faire et ce qu'il
peut servir.
