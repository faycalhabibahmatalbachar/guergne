# Reprise de la campagne vocale — état concret

Ce document ne raconte pas le projet : il dit **où en est la mission vocale**,
pour qu'une nouvelle session reprenne sans refaire les mêmes investigations.
Aucune clé, aucun secret, aucune donnée de session n'y figure.

Dernière mise à jour : 2026-11-08.

## Repères

| | |
|---|---|
| Branche | `voix-bidirectionnelle` |
| Commit HEAD | `e7dbce8` — *fix(voix): le telechargement PTT exigeait un mimetype que personne ne passait* |
| Dépôt | `C:\Users\hp\Desktop\Projects\lycee-renaissance` (le travail se fait côté Windows : le profil WhatsApp y a été créé) |
| `whatsapp-web.js` | **1.34.7**, épinglée — ne pas changer sans nécessité démontrée |
| Backend scolaire | **simulé** pendant toute la campagne (`simule: true`) |
| Altare | **aucune intervention** pendant la campagne |

## Les instruments de mesure (à conserver)

- `agent/scripts/ecoute-vocale-locale.mjs` — sonde de la surface de
  téléchargement (`== 5 bis ==`), exécutée avant tout message : elle dit quels
  modules de la page existent, au lieu de l'apprendre en perdant une note vocale.
- `agent/scripts/diagnostic-telechargement-ptt.mjs` — rejoue le téléchargement
  sur une note vocale **déjà présente** dans le magasin de la page.
- `agent/scripts/sonde-contrat-media.mjs` — a lu le **contrat réel** de
  `downloadAndMaybeDecrypt` dans la page, et c'est elle qui a tranché le défaut.
- `agent/scripts/preuve-telechargement-ptt.mjs` — charge l'historique, puis
  fait passer une vraie note vocale par `getMedia()` : octets, mimetype,
  en-tête, SHA-256. C'est la preuve, pas un journal.

Aucun de ces scripts n'envoie, ne supprime ni ne modifie quoi que ce soit.

## Le défaut `InvalidMediaFileType` — RÉSOLU le 2026-11-08

```text
InvalidMediaFileType: Unexpected mimetype application/octet-stream for media type ptt
```

**Cause réelle, mesurée et non supposée :** WhatsApp Web **valide** le type du
média qu'il télécharge. L'appel ne transmet pas de `mimetype`, il retombe donc
sur `application/octet-stream`, qui n'est pas un type audio acceptable pour un
`ptt` — et il refuse. Le message, lui, **déclare** `audio/ogg; codecs=opus`.

La sonde `sonde-contrat-media.mjs`, dans la page, sur une vraie note vocale :

| Appel | Résultat |
|---|---|
| les six champs de la bibliothèque | `InvalidMediaFileType` |
| les mêmes **+ `mimetype` du message** | **15 871 octets**, en-tête `OggS` |

C'est la seule différence entre les deux appels. Aucun type n'a été inventé :
`mimetype` est celui que le message porte lui-même.

Chemin d'appel (lu dans les sources installées) :
`Message.downloadMedia()` → `node_modules/whatsapp-web.js/src/structures/Message.js:560`
→ `window.require('WAWebDownloadManager').downloadManager.downloadAndMaybeDecrypt({…})`.

**Correction, en deux endroits et un seul défaut :**

1. `agent/src/providers/wwebjs.js` — `_telechargerParDirectPath()` transmet
   désormais `mimetype` (notre voie directe, celle que l'agent emprunte).
2. `agent/scripts/rustine-wwebjs.mjs` — nouvelle rustine
   `media-mimetype-telechargement`, épinglée sur la version **1.34.7**, ancrée
   au caractère près, idempotente : la voie de la bibliothèque reste le second
   recours, elle ne doit pas ramener le défaut. `node_modules` n'étant pas
   versionné, **relancer la rustine après chaque `npm install`** (le postinstall
   le fait).

**Preuve du bout de la chaîne** (`preuve-telechargement-ptt.mjs`, sur une note
vocale **réellement reçue**, aucune nouvelle note demandée) :

```text
media_downloaded  voie: direct_path  octets: 13871  mimetype: audio/ogg; codecs=opus
en-tete OggS     sha256 8abcbc611bcf3f0565e66b4ac3892a1b6072b8b47ac6499b7611bbeda4804199
conteneur ogg / opus, mono, 48 000 Hz, 6,98 s (OpusHead + OpusTags, 5 pages)
STT reel : groq/whisper-large-v3-turbo, 1 096 ms
```

Deux pièges rencontrés en chemin, à ne pas réapprendre :

- `client.getChats()` échoue ici sur la même erreur minifiée d'une lettre
  (« r ») que `downloadMedia()` : les modèles de la page ne traversent pas la
  passerelle Puppeteer avec leurs accesseurs.
- Interroger le magasin juste après « ready » est un tirage au sort (un essai
  voyait 10 notes vocales, le suivant zéro). Il faut **charger** l'historique
  dans la page, comme le fait `Chat.fetchMessages` :
  `require('WAWebChatLoadMessages').loadEarlierMsgs({ chat })` sur les modèles
  de `WAWebChatCollection`. C'est une lecture : rien n'est envoyé.

## Interdits

- Ne pas transformer arbitrairement le MIME en `audio/ogg`.
- Ne pas contourner la validation interne de WhatsApp Web.
- Ne pas modifier `node_modules` sans passer par `scripts/rustine-wwebjs.mjs`
  (postinstall), avec version épinglée et test de régression.
- Ne pas supprimer `.env`, `ai_apikey.env`, `wwebjs_auth_local`, les identités,
  les données scolaires, les modèles vocaux.
- Ne jamais lancer deux clients Chromium sur le même profil LocalAuth.
- Ne pas demander une nouvelle note vocale avant que le téléchargement soit
  techniquement prêt.
- Ne pas toucher Altare.

## Environnement — ce qui a été réparé le 2026-11-08

- **Le disque C: n'avait plus que 9 Mo libres.** C'est ce qui tronquait
  l'extraction de Chromium, faisait planter le navigateur et cassait les tests
  (`ENOSPC` dans `voix-moteur.test.js`). Libéré : l'archive Chromium téléchargée
  (191 Mo) et le cache npm (`npm cache clean --force`, 6,7 Go) — **que des
  caches, aucune donnée du projet**. 5,2 Go libres après coup. Restent
  disponibles si besoin : `%LOCALAPPDATA%\Temp` (~10 Go) et le cache pip
  (~700 Mo), que je n'ai pas touchés.
- L'extracteur de Puppeteer lui-même échoue silencieusement sur ce poste : il
  s'arrête juste avant `chrome.exe`. Contournement qui marche :
  `tar -xf <zip> -C <dossier de version>`.

- Le Chromium de Puppeteer **avait disparu** du cache
  (`C:\Users\hp\.cache\puppeteer\chrome\win64-146.0.7680.31` : extraction
  tronquée, 4,6 Mo, pas de `chrome.exe`). Réinstallé **à la même version**
  146.0.7680.31, celle qui a créé le profil (`Last Version` du profil), pour ne
  pas faire migrer la session par un Chrome plus récent.
- `ffmpeg` / `ffprobe` : **absents du PATH Windows** (l'entrée WinGet est
  périmée, le paquet n'est plus là). À installer avant la validation audio
  (étape P5), sinon FFprobe ne pourra rien prouver.
- WSL2 Ubuntu existe mais ne contient ni chromium, ni ffmpeg : le travail reste
  côté Windows, où vit le profil WhatsApp.

## L'environnement était coupé en deux — réuni le 2026-11-08

C'est la découverte la plus importante de cette étape, et elle explique pourquoi
aucun aller-retour vocal n'avait jamais pu être démontré :

- la **session WhatsApp** vit dans un profil Chrome **Windows** ;
- **Piper et ses deux voix** étaient installés **dans WSL**
  (`/home/hp/.guergne/voix/`), avec un wheel `manylinux`.

Deux moitiés : le transport ne pouvait pas appeler le moteur vocal. On n'a pas
déplacé la session — elle est authentifiée et précieuse. On a rendu
l'installation capable de poser Piper là où tourne le transport :

- `src/voix/installation.js` — un wheel **par plate-forme** (`WHEELS`,
  `wheelPour()`), les cinq noms relevés sur les publications réelles de
  `v1.8.0`. Une plate-forme sans wheel est **nommée**, jamais devinée : poser
  le wheel Linux sous Windows « réussirait » et n'échouerait qu'à la première
  synthèse. `python3` n'existe pas sous Windows : le nom de l'exécutable est
  désormais un paramètre.
- `src/voix/piper-serveur.py` — `os.statvfs` n'existe pas sous Windows. Chaque
  mesure d'espace y rendait une `AttributeError`, faisant passer un poste sain
  pour un volume en erreur, au moment précis où l'espace **était** le vrai
  problème. Repli sur `shutil.disk_usage` ; les inodes, sans équivalent
  Windows, sont déclarés inconnus plutôt qu'inventés.
- `scripts/ecoute-vocale-locale.mjs` — passe par `installerPiper` (idempotent),
  comme `app.js`. Un seul chemin d'installation, pas deux.

Les deux modèles ont été **copiés depuis WSL** plutôt que retéléchargés
(126 Mo épargnés), et leurs empreintes SHA-256 diffèrent : ce sont bien deux
voix distinctes, malgré une taille identique (63 201 294 octets chacune).

### FFmpeg / FFprobe

`winget` a échoué sur un 504 de GitHub ; l'archive a été prise directement.
Installés en **9.0.2** dans `C:\Users\hp\.local\ffmpeg\…\bin`, ajouté au PATH
utilisateur. `ffplay.exe` et la documentation ont été retirés : 230 Mo inutiles
sur un disque déjà saturé.

L'espace est resté le fil rouge de la séance : après le cache npm (6,7 Go), il a
fallu purger le **cache pip** (705 Mo, wheels retéléchargeables). Il reste
~1,2 Go. `%LOCALAPPDATA%\Temp` (~10 Go) n'a pas été touché.

## L'orchestrateur de réponse — 2026-11-08

### Le défaut : personne ne décidait du format

L'assistant répondait **deux fois** : une réponse écrite, puis une note vocale
redisant la même chose. Ce n'était pas un module fautif, c'était l'absence de
décision centrale. Le moteur appelle `provider.sendText` depuis une quinzaine
d'endroits (`src/engine.js`), et `avecVoix` enveloppait ce transport pour
ajouter une note vocale à **chacun** de ces appels — avec pour défaut
`AGENT_REPONSE_VOCALE = texte_et_voix`. Le format n'était pas choisi : il était
un effet de bord.

### Référence consultée : moov-ai, pas Toumaï

Le mécanisme décrit comme « celui de Toumaï AI » n'a pas été trouvé dans les
dépôts Toumaï locaux (`toumai-saas`, `toumai-admin`, `toumai-github`,
`toumai-web-backup-before-purge` : aucun appel de présence WhatsApp). Il est en
revanche bien présent dans **`moov-ai/src/services/presence.js`** (142 lignes),
et dans `canalplus-whatsapp-bot/index.js`. C'est donc cette implémentation qui a
servi de référence — il ne faut pas croire avoir inspecté Toumaï.

Repris de moov-ai :

- l'indicateur est **best-effort** : un ornement ne doit jamais empêcher une
  réponse de partir ;
- il faut le **rafraîchir** pendant une opération longue (WhatsApp l'oublie) ;
- `clearState` dans un `finally`, sur tous les chemins de sortie.

**Volontairement NON repris** : `TYPING_MS_PER_CHAR = 45` — une attente
proportionnelle à la longueur du texte, pour imiter une vitesse de frappe
humaine. L'assistant est un automate ; le faire passer pour une personne n'est
pas une amélioration, et un délai qui ne correspond à aucun calcul ne fait que
retarder une réponse déjà prête. Ici l'indicateur dure exactement le temps du
travail réel.

### Le contrat de présence, lu dans la version installée

`Chat.sendStateTyping()` / `sendStateRecording()` / `clearState()`
(`node_modules/whatsapp-web.js/src/structures/Chat.js:252-276`) appellent toutes
`window.WWebJS.sendChatstate('typing' | 'recording' | 'stop', chatId)`, qui
(`Utils.js:1219`) fabrique un WID puis appelle
`WAWebChatStateBridge.sendChatStateComposing / Recording / Paused`. La
documentation de la bibliothèque indique que l'état « dure 25 secondes ».

`ControleurPresence` appelle **la fonction de page directement**, avec le JID
déjà connu, plutôt que `Chat.sendStateTyping()` : cette dernière commence par
retrouver le `Chat`, et c'est exactement le détour qui casse ici — `getChats()`
échoue sur l'erreur minifiée d'une lettre. Même contrat, sans le détour fragile.

### Architecture

```
message reçu → identité → file par conversation → regroupement
   → agent + outils → ORCHESTRATEUR (filtre, politique, idempotence)
   → envoi → acquittement
```

| Fichier | Rôle |
|---|---|
| `src/reponse/politique-sortie.js` | la décision de format, pure et déterministe. `texte_seul` par défaut ; détection des demandes explicites en français et en arabe ; préférence retenue seulement si posée pour durer |
| `src/reponse/presence.js` | les indicateurs, branchés sur le travail réel ; un seul état actif par destinataire ; arrêt idempotent |
| `src/reponse/orchestrateur.js` | le point de passage obligatoire : filtre, file par conversation, idempotence, modes, replis, mesures |
| `src/reponse/regroupement.js` | les fragments successifs (« les absences » + « de la 6e A ») en une seule demande ; fenêtre 1,2 s, plafond 5 s |
| `src/voix/porte-voix.js` | `fabriquerVoix()` extrait pour que l'orchestrateur produise la voix **sans dupliquer** le code ; défaut passé de `texte_et_voix` à `texte` |
| `app.js`, `scripts/ecoute-vocale-locale.mjs` | branchés sur l'orchestrateur, plus sur `avecVoix` seul |

Le point de passage est un `Proxy` sur `sendText` : les quinze appels du moteur
passent par la décision sans qu'aucun ne soit modifié — et sans risque d'en
oublier un. **Un test vérifie qu'il n'existe aucun chemin d'envoi parallèle**
dans `engine.js`.

### Ce qui est garanti, et mesuré

- une réponse logique → **un** envoi ; aucune synthèse n'est même *lancée* en
  mode texte ;
- doublon refusé (clef posée **avant** l'envoi : un envoi ambigu n'est jamais
  rejoué à l'aveugle) ;
- réponse obsolète abandonnée si un message plus récent est arrivé ;
- conversations sérialisées, isolées entre elles, file jamais rompue par un
  échec ;
- indicateurs arrêtés sur **tous** les chemins — succès, refus, exception ;
- « enregistre un audio » **seulement** pendant une vraie synthèse ;
- `accepté` n'est jamais présenté comme `livré`.

### Deux défauts trouvés en écrivant les tests

`\b` est une frontière **ASCII**. Elle ne correspond jamais devant « à » ou
« é », ni après une lettre arabe. Conséquences réelles, attrapées par les
tests : « Dis-le moi à l'oral » n'était pas reconnu ; « réponds en vocal et par
écrit » était lu comme une demande de **texte seul** — l'inverse de la demande ;
et « من الصف السادس » n'était pas vu comme un fragment. Corrigé par des
lookarounds Unicode. Un motif trop large posait l'autre défaut : « les absences
en audio-visuel » déclenchait une note vocale.

## État réel des fonctions

Statuts autorisés : NON TESTÉ · EN COURS · ÉCHEC · VALIDÉ EN LOCAL ·
VALIDÉ EN INTÉGRATION · VALIDÉ EN PRODUCTION.

| Fonction | Statut | Preuve |
|---|---|---|
| Réception WhatsApp (événement entrant) | VALIDÉ EN LOCAL | `message_received`, `typeMessage: ptt`, `aMedia: true` sur une vraie note vocale |
| Identification SUPER_ADMIN | VALIDÉ EN LOCAL | identité résolue sur le message entrant réel |
| Permission (décision) | VALIDÉ EN LOCAL | décision `ALLOW` tracée |
| Téléchargement PTT entrant | **VALIDÉ EN LOCAL** | note vocale **reçue** : 13 871 octets, `voie: direct_path`, en-tête `OggS`, SHA-256 relevé |
| Décryptage | VALIDÉ EN LOCAL | les octets déchiffrés forment un Ogg/Opus lisible (`OpusHead`, `OpusTags`, 5 pages) |
| FFprobe sur média entrant | **VALIDÉ EN LOCAL** | inspection réelle : `ogg`/`opus`, 48 000 Hz, mono, 6,980 s, 13 871 octets, 15 897 b/s ; décodage intégral `-xerror` sans erreur |
| STT français | EN COURS | transcription réelle d'une note **reçue** (groq/whisper-large-v3-turbo, 1 096 ms), mais la note ne disait que « bonjour » répété et Whisper a lu « Portuguese ». Reste à valider sur une phrase française utile |
| STT arabe | NON TESTÉ | |
| Compréhension IA depuis la voix | NON TESTÉ | le chemin existe (`src/engine.js`, ligne ~324 `getMedia` → transcription) |
| Choix d'outil depuis la voix | NON TESTÉ | |
| Exécution scolaire simulée | NON TESTÉ | |
| Mémoire / contexte en vocal | NON TESTÉ | |
| Piper français | VALIDÉ EN LOCAL | généré **sous Windows** : WAV 22 050 Hz mono, 5,201 s, 229 420 octets, 653 ms de génération |
| Piper arabe | VALIDÉ EN LOCAL | généré **sous Windows** : WAV 22 050 Hz mono, 7,779 s, 343 084 octets, 1 152 ms. Modèle `ar_JO-kareem-medium` : voix **jordanienne**, pas tchadienne ; licence à vérifier avant usage public |
| Conversion OGG/Opus | VALIDÉ EN LOCAL | `versOggOpus` puis `verifierOggOpus` : fr 16 254 o / 5,208 s, ar 24 749 o / 7,785 s, 48 kHz mono, `valide: true`, aucun grief |
| Transport sortant PTT | VALIDÉ EN LOCAL | envoi réel vers le SUPER_ADMIN, `ack 2` |
| Acquittement | EN COURS | `ack 2` observé une fois ; `reply_accepted` ≠ livraison |
| Conversation française complète | NON TESTÉ | bloquée par le téléchargement entrant |
| Conversation arabe complète | NON TESTÉ | idem |
| Robustesse / doublons | **VALIDÉ EN LOCAL** | doublon entrant, réponse obsolète, envoi ambigu non rejoué, file non rompue par un échec — tests réels, pas sur WhatsApp |
| Réponse unique (anti-doublon texte/voix) | **VALIDÉ EN LOCAL** | intégration avec le vrai `Agent` : 1 envoi, 0 synthèse lancée en mode texte |
| Politique de format (3 modes) | **VALIDÉ EN LOCAL** | `texte_seul` par défaut ; demandes explicites fr + ar ; replis mesurés |
| Indicateurs d'activité | **VALIDÉ EN LOCAL** | arrêt sur tous les chemins ; « enregistre un audio » seulement pendant une synthèse. **Non vérifié sur un vrai téléphone** |
| Regroupement des fragments | **VALIDÉ EN LOCAL** | « les absences » + « de la 6e A » → une demande, une consultation, une réponse |

Le compte **assistant** se termine par `2161`, le **SUPER_ADMIN** par `3737` :
ce sont deux comptes distincts, un message du SUPER_ADMIN est bien un entrant.

## Tests

`cd agent && npm test` → **718 / 718**, dont 6 de `test/media-telechargement.test.js`,
31 de `test/reponse-orchestrateur.test.js`, 10 de `test/reponse-regroupement.test.js`
et 7 d'**intégration** (`test/reponse-integration.test.js` : le vrai `Agent`,
ses permissions et son registre d'outils, traversant l'orchestrateur)
et 2 de `test/voix-moteur.test.js` sur le choix du wheel par plate-forme. Aucun test n'a été supprimé ni assoupli.
Le dernier de ces six vérifie que la rustine est posée sur `node_modules` :
c'est le garde-fou après un `npm install`.

## Comment relancer l'écoute

```bash
export GUERGNE_CLES=/c/Users/hp/Desktop/Projects/lycee-renaissance/ai_apikey.env
. infra/local/profil-ia.sh
export PATH="$PATH:/c/Users/hp/.local/ffmpeg/ffmpeg-9.0.2-full_build/bin"
cd agent && node scripts/ecoute-vocale-locale.mjs --numero 23568663737 --role SUPER_ADMIN
```

Un seul processus à la fois sur le profil LocalAuth. L'écoute annonce elle-même
`ENVIRONNEMENT PRÊT` après avoir vérifié chromium, page, downloadMedia, stt et
piper. Elle a affiché ces cinq `OK` le 8 novembre.

## Prochaine action précise

1. Demander au SUPER_ADMIN **une note vocale française** portant une demande
   scolaire naturelle (« Combien d'élèves sont inscrits en sixième A ? »). Le
   téléchargement, FFprobe, FFmpeg et Piper étant prouvés, cette demande est
   légitime : elle valide le STT, la compréhension, le choix d'outil et la
   réponse vocale — pas la plomberie.
2. Puis **une note vocale arabe distincte**.
3. Enfin : contexte conversationnel, permissions (positif et négatif), erreurs
   audio, doublons, et le rapport final par fonction.
