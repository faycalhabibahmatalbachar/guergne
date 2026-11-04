# Journal d'implémentation — moteur vocal

## 2026-11-04 — Phase A close, moteur choisi et mesuré

### L'environnement Altare, enfin connu

La sonde `/diagnostic/environnement` a répondu après le redémarrage :

```
python3  OUI  Python 3.13.5
ffmpeg   OUI  ffmpeg version 7.1.5-0+deb13u1
ldd      OUI  Debian GLIBC 2.41
uname    OUI  Linux 6.12 amd64
pip3     non  (introuvable dans le PATH)
opusenc  non  (introuvable dans le PATH)

coeursVisibles = 4   parallelismeDisponible = 1   charge1min = 2.54
plafond mémoire = 2355 Mo    disque libre = 70 Go
```

Deux faits décident de l'architecture :

- **Python et FFmpeg sont présents.** Rien de lourd n'a besoin d'être téléversé
  sur un lien SFTP où 48 Mo ont déjà expiré à neuf minutes. L'OGG/Opus est
  faisable avec l'outil déjà là.
- **Le quota CPU est de UN cœur effectif** (`parallelismeDisponible: 1`), pas
  quatre. `coeursVisibles` est ce que voit le conteneur, pas ce qu'il a le droit
  d'utiliser ; les confondre aurait fait surestimer la capacité d'un facteur
  quatre.

`pip3` est absent : un wheel ne s'installe donc pas, il se **déplie** dans
`/home/container` et se lance via `PYTHONPATH`. Sans pip, sans réseau au
moment de l'exécution, sans droits root.

### Moteur retenu : Piper

**Licence du moteur : GPL-3.0** (note de version v1.3.0, « Change license to
GPLv3 »). Piper est invoqué comme processus séparé, non lié à notre code.

**Distribution.** La version 1.8.0 ne publie que des wheels Python et une
archive source — vérifié par la liste des fichiers, puis en ouvrant le wheel
manylinux x86_64 : 485 entrées, 39 fichiers `.py`, une extension CPython
`espeakbridge.so`, **aucun exécutable autonome**. Piper exige donc Python, ce
que la sonde a confirmé disponible.

### Voix : une mesure a tranché, pas une préférence

| voix | nasales françaises | RTF mono-thread | retenue |
|---|---|---|---|
| `fr_FR-siwis-medium` | correctes | 0,064 | **oui** |
| `fr_FR-gilles-low` | **16 phonèmes perdus** | 0,076 | non |
| `ar_JO-kareem-medium` | — | 0,12 à 0,18 | oui, sous réserve |

Sur une phrase saturée de voyelles nasales (« Un enfant pensant en entrant dans
un grand bain commun chante une chanson »), `fr_FR-gilles-low` émet seize fois
`Missing phoneme from id map: ̃` — le tilde combinant, marqueur des
nasales. Elle est donc **à la fois plus lente et fautive** sur un trait central
du français. Le nom « low » désigne la qualité audio, pas un modèle plus léger :
les deux fichiers pèsent 63 Mo.

**Licences des voix.** `fr_FR-siwis-medium` : jeu de données SIWIS en
**CC-BY 4.0** (Edinburgh DataShare), sans mention d'usage commercial dans un
sens ni dans l'autre. `ar_JO-kareem-medium` : la carte de modèle dit seulement
« License: See URL » et renvoie à un dépôt tiers — **licence non résolue, à
trancher avant tout usage public**. Le « License: mit » affiché par Hugging
Face est celui du dépôt entier `rhasspy/piper-voices`, pas de chaque voix.

### Pourquoi un démon, et non un appel par message

Charger le modèle coûte **3,7 s en français et 7,7 s en arabe** (mesuré).
Lancer Piper à chaque réponse dépasserait l'objectif de cinq secondes avant la
première syllabe. `agent/src/voix/piper-serveur.py` charge donc les voix une
fois et sert un protocole de lignes JSON sur l'entrée standard, chaque requête
portant son identifiant et son chemin de sortie.

Le CLI de Piper sait lire stdin, mais il nomme ses fichiers par horodatage :
associer une réponse à sa requête deviendrait une devinette, et deux
générations rapprochées pourraient se confondre.

### Latences mesurées — démon, un seul thread

Modèle chargé une fois, dix générations par cas, sur un i7-8650U bridé à un
thread. **Ce n'est pas Altare** : voir la réserve plus bas.

| langue | cas | caractères | audio | P50 | P95 |
|---|---|---|---|---|---|
| fr | court | 70 | 3,72 s | **401 ms** | **435 ms** |
| fr | moyen | 223 | 11,18 s | **1 097 ms** | **1 370 ms** |
| ar | court | 56 | 6,56 s | **634 ms** | **1 266 ms** |
| ar | moyen | 111 | 12,42 s | **1 180 ms** | **1 385 ms** |

Trois demandes simultanées (français moyen) : rendues en **2,99 s** au total,
soit 1 004 / 1 974 / 2 994 ms. Elles se sérialisent, ce qui est le
comportement voulu sur un seul cœur : la première part vite plutôt que trois
réponses lentes à égalité.

Démarrage du démon avec les deux voix chargées : **8,9 s**, payé une fois.

**Réserve explicite.** Ces chiffres viennent de ma machine, pas du conteneur.
Le vCPU d'Altare est un Haswell déjà chargé à 2,54 : il faut l'attendre plus
lent. Même à trois fois plus lent, le cas « moyen » resterait sous 4 s — mais
cela reste une extrapolation, et la mesure sur Altare est à faire.

### Deux défauts trouvés en mesurant

**L'arabe échouait**, sur un obscur `# channels not specified` du module
`wave`. Cause réelle : sans encodage explicite sur stdin, le texte arabe
arrivait mutilé, espeak ne reconnaissait aucun phonème, la synthèse ne
produisait aucune trame — et l'erreur de fermeture du fichier WAV **masquait**
la vraie. Corrigé en deux temps : encodage UTF-8 déclaré sur les trois flux, et
synthèse en mémoire avant écriture, pour qu'un échec ne soit plus recouvert par
un second et qu'aucun WAV tronqué ne reste sur le disque. Une synthèse qui ne
produit qu'un en-tête est désormais signalée comme un échec, non comme un
succès vide.

### Préparation du texte pour l'oral

`agent/src/voix/texte-oral.js` dérive du texte écrit une version **dite**. La
réponse écrite canonique n'est jamais modifiée : deux versions divergentes
d'une même information scolaire seraient pires qu'une absence de voix.

Chaque transformation répond à un défaut entendu : les marqueurs Markdown ne se
prononcent plus (« étoile étoile »), une puce devient une pause, une URL
devient « un lien » au lieu d'occuper la voix dix secondes, un UUID est tu, un
matricule est groupé pour rester notable à l'oreille, les dates et les heures se
disent, `12,4` devient « 12 virgule 4 ».

Ce qui est **préservé** compte autant : les accents français et les caractères
arabes, dont le retrait changerait la prononciation — l'inverse du but.

La détection de langue se fait par l'**écriture**, non par une liste de mots :
plus sûre sur les phrases courtes, et les demandes des utilisateurs sont
courtes. Le seuil n'est pas la majorité absolue, parce qu'une réponse arabe
porte des matricules et des nombres en caractères latins. Quand rien ne permet
de trancher, la fonction rend `null` au lieu d'imposer le français.

La segmentation donne au **premier** segment une cible plus courte (140
caractères contre 320) : l'utilisateur ne mesure pas la durée totale de
génération, il mesure l'attente avant d'entendre quelque chose. On ne coupe
jamais au milieu d'une phrase — la voix tomberait là où elle devrait monter —
donc une phrase plus longue que la cible part entière plutôt que mutilée.

32 tests couvrent ce module.

### État, sans embellissement

| | état |
|---|---|
| Sonde d'environnement | **validée sur Altare** |
| Choix du moteur et des voix | **mesuré localement** |
| Démon Piper | **mesuré localement**, pas encore sur Altare |
| Préparation du texte oral | **implémentée et testée** (32 tests) |
| Conversion OGG/Opus | **non faite** — FFmpeg présent sur Altare, absent de ma machine |
| Fournisseur TTS côté Node | **non fait** |
| Intégration au moteur conversationnel | **non faite** |
| Note vocale reçue sur WhatsApp | **non vérifiée** |

530 tests agent, 0 échec.

### Reste à faire, dans l'ordre

1. L'interface de fournisseur (`synthesize`, `initialize`, `healthCheck`,
   `getCapabilities`, `shutdown`, `getMetrics`) et un `FakeTTS`.
2. Le fournisseur Piper côté Node : démarrage du démon, file, délais maximaux,
   métriques, nettoyage des fichiers temporaires.
3. La conversion OGG/Opus par FFmpeg, et sa vérification (conteneur, codec,
   échantillonnage, durée) — à faire sur Altare, FFmpeg n'étant pas ici.
4. Le branchement sur `sendAudio`, qui existe déjà et ne doit pas être doublé.
5. Le déploiement des voix : 63 Mo chacune. À télécharger **depuis le
   conteneur**, qui a du réseau, plutôt que par SFTP.
