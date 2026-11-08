# Reprise de la campagne vocale — état concret

Ce document ne raconte pas le projet : il dit **où en est la mission vocale**,
pour qu'une nouvelle session reprenne sans refaire les mêmes investigations.
Aucune clé, aucun secret, aucune donnée de session n'y figure.

Dernière mise à jour : 2026-11-08.

## Repères

| | |
|---|---|
| Branche | `voix-bidirectionnelle` |
| Commit HEAD | `ce1b0f3` — *feat(diagnostic): instrumenter le telechargement DANS la page* |
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
| FFprobe sur média entrant | **NON TESTÉ** | ffprobe absent du poste ; le conteneur a été lu par en-tête (mono, 48 kHz, 6,98 s) — ce n'est **pas** une inspection FFprobe |
| STT français | EN COURS | transcription réelle d'une note **reçue** (groq/whisper-large-v3-turbo, 1 096 ms), mais la note ne disait que « bonjour » répété et Whisper a lu « Portuguese ». Reste à valider sur une phrase française utile |
| STT arabe | NON TESTÉ | |
| Compréhension IA depuis la voix | NON TESTÉ | le chemin existe (`src/engine.js`, ligne ~324 `getMedia` → transcription) |
| Choix d'outil depuis la voix | NON TESTÉ | |
| Exécution scolaire simulée | NON TESTÉ | |
| Mémoire / contexte en vocal | NON TESTÉ | |
| Piper français | VALIDÉ EN LOCAL | audio généré (`fr_FR-siwis-medium`) |
| Piper arabe | NON TESTÉ | modèle `ar_JO-kareem-medium` — licence à vérifier avant usage public, et ce n'est **pas** une voix tchadienne |
| Conversion OGG/Opus | VALIDÉ EN LOCAL | note vocale sortante acceptée par WhatsApp |
| Transport sortant PTT | VALIDÉ EN LOCAL | envoi réel vers le SUPER_ADMIN, `ack 2` |
| Acquittement | EN COURS | `ack 2` observé une fois ; `reply_accepted` ≠ livraison |
| Conversation française complète | NON TESTÉ | bloquée par le téléchargement entrant |
| Conversation arabe complète | NON TESTÉ | idem |
| Robustesse / doublons | NON TESTÉ | |

Le compte **assistant** se termine par `2161`, le **SUPER_ADMIN** par `3737` :
ce sont deux comptes distincts, un message du SUPER_ADMIN est bien un entrant.

## Tests

`cd agent && npm test` → **668 / 668**, dont les 6 nouveaux de
`test/media-telechargement.test.js`. Aucun test n'a été supprimé ni assoupli.
Le dernier de ces six vérifie que la rustine est posée sur `node_modules` :
c'est le garde-fou après un `npm install`.

## Prochaine action précise

1. **Installer ffmpeg / ffprobe** (absents du poste). Sans eux : pas
   d'inspection FFprobe, et pas de conversion OGG/Opus pour les réponses
   vocales sortantes. C'est le prochain blocage matériel.
2. Demander au SUPER_ADMIN **deux vraies notes vocales** — une en français
   portant une demande scolaire utile (« Combien d'élèves sont enregistrés en
   6e A ? »), une en arabe. Le téléchargement étant désormais prouvé, cette
   demande est légitime : elle valide le STT, la compréhension, le choix
   d'outil et la réponse vocale, pas la plomberie.
3. Puis, dans l'ordre : STT français utile → STT arabe → agent scolaire simulé
   (`simule: true`) → Piper fr/ar → PTT sortant → acquittements → contexte,
   permissions, erreurs, doublons.
