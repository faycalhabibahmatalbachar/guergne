# Migration de l'agent WhatsApp vers un VPS Linux

Procédure reproductible, pensée pour être exécutée deux fois : une fois à
blanc, une fois pour de bon. Elle ne suppose aucune confiance dans Altare, et
elle prévoit le retour en arrière avant d'autoriser le départ.

**Aucun serveur n'est commandé par cette procédure.** Le choix et les tarifs
relevés sont dans [CHOIX_VPS.md](CHOIX_VPS.md).

---

## 0. Ce qui ne doit jamais arriver pendant la migration

Ces quatre points passent avant le calendrier.

**Deux clients WhatsApp pour le même compte, en même temps.** C'est le risque
le plus sérieux : WhatsApp voit deux appareils se disputer la même session et
peut bannir le numéro de l'établissement. L'ancien service **s'arrête avant**
que le nouveau démarre. Jamais de recouvrement, même d'une minute, même « pour
comparer ».

**Perdre la session appairée.** `donnees/wwebjs_auth` est le seul endroit où
elle vit. Elle se copie avant tout, et on vérifie la copie par empreinte.

**Perdre les associations d'identité.** `identites.json` lie les numéros aux
comptes et aux rôles. Sans lui, l'agent refuse tout le monde. Il ne se
régénère pas : il se transporte.

**Mettre un secret dans Git.** `.env` ne quitte jamais le serveur autrement
que par un canal chiffré, et n'entre jamais dans le dépôt.

---

## 1. Inventaire de ce qui se transporte

| Chemin sur Altare | Contenu | Se transporte ? | Pourquoi |
|---|---|---|---|
| `donnees/wwebjs_auth/` | session WhatsApp appairée | **oui, en premier** | sinon il faut réappairer par QR |
| `identites.json` | numéros, comptes, rôles | **oui** | aucune régénération possible |
| `notifications.json` | file d'avis sortants | **oui** | un avis en vol ne doit ni disparaître ni repartir |
| `donnees/dedup*`, compteurs | idempotence, quotas | **oui** | un quota qui repart de zéro n'est pas un quota |
| `.env` | secrets | **oui, hors Git** | canal chiffré uniquement |
| `donnees/voix/voix/*.onnx` | 120,6 Mo de modèles | non | se retéléchargent depuis la source |
| `donnees/voix/paquets/` | ~200 Mo de roues Python | non | se réinstallent, et dépendent de l'architecture |
| `node_modules/` | dépendances npm | non | `npm ci` depuis le verrou |
| `.cache/puppeteer/` | 352 Mo de Chromium | non | se retélécharge |
| `core.*` | vidages mémoire | **jamais** | 1,60 Go d'inutile ; `LimitCORE=0` les empêche désormais |

---

## 2. Préparer le serveur

```bash
# En root, une seule fois.
bash infra/vps/preparer-serveur.sh
```

Ce que le script fait, et pourquoi chaque point y est :

- **un compte de service `guergne`, sans mot de passe et sans shell de
  connexion.** L'agent n'a aucune raison d'être root : il écrit dans deux
  répertoires et parle à WhatsApp.
- **SSH par clé seulement, mot de passe refusé, connexion root refusée.** Un
  VPS avec IPv4 publique reçoit des tentatives de connexion dans l'heure qui
  suit sa création. Ce n'est pas une précaution théorique.
- **pare-feu fermé par défaut**, sauf SSH. Le port de santé de l'agent n'est
  **pas** ouvert vers l'extérieur : il s'interroge depuis le serveur, ou par un
  tunnel SSH. Sur Altare il était exposé, faute de choix.
- **2 Go de swap.** Non pour faire tourner l'agent — il tient dans 70 Mo — mais
  pour absorber les pics de Chromium, dont le vidage mémoire mesuré atteignait
  1,19 Go. Sans swap, un pic devient un processus tué.
- **`/var/lib/guergne/tmp` comme répertoire temporaire**, sur le volume et non
  sur un tmpfs. C'est la leçon directe de l'ENOSPC : `/tmp` faisait 100 Mo sur
  Altare, personne ne le savait, et pip y dépliait 170 Mo.
- **Node 24 et Python 3.13 épinglés**, aux versions de la production actuelle.
- **FFmpeg, FFprobe, et les bibliothèques de Chromium.**
- **journald avec rétention bornée**, pour que les journaux ne remplissent pas
  le disque à la place des vidages mémoire.

---

## 3. Transférer, et vérifier

```bash
# Depuis le poste de développement. Sauvegarde locale horodatée d'abord.
bash infra/vps/sauvegarder-altare.sh            # SFTP -> ./sauvegardes/<date>/
bash infra/vps/transferer.sh <utilisateur>@<ip> # sauvegarde -> VPS, avec SHA-256
```

Chaque fichier est relu après transfert et son empreinte comparée. **Un `put`
qui ne lève pas n'est pas une preuve** — cette leçon a déjà été payée sur ce
projet, avec 160 Mo déposés dans un répertoire nommé `/undefined`.

La session WhatsApp conserve ses permissions `0700` : un répertoire de session
lisible par d'autres comptes est un vol de session en attente.

---

## 4. Installer l'application

```bash
# Sur le VPS, en root.
bash infra/vps/installer-agent.sh <branche-ou-commit>
```

- clone à un **commit exact**, jamais une branche flottante ;
- `npm ci` depuis `package-lock.json`, sans `npm audit fix` ;
- Chromium téléchargé par Puppeteer, puis **vérifié en le lançant** ;
- modèles de voix téléchargés et leur taille contrôlée ;
- `node --test` : les 638 tests doivent passer **sur le serveur**, pas
  seulement sur le poste de développement ;
- `recette-audio-reelle.mjs` : la conversion OGG/Opus éprouvée avec le vrai
  FFmpeg du serveur ;
- le service systemd installé mais **pas encore démarré**.

---

## 5. Le basculement, dans cet ordre

```bash
# 1. ARRÊTER l'ancien. C'est le point irréversible, et il vient en premier.
#    Tant qu'Altare tient la session, le nouveau service ne doit pas démarrer.
#    Depuis le panneau Altare : arrêter le serveur. Puis vérifier :
curl -s -m 10 http://se-kna02.altare.global:25278/sante    # doit échouer

# 2. Démarrer le nouveau.
systemctl enable --now guergne-agent
journalctl -u guergne-agent -f

# 3. Attendre les deux lignes qui prouvent que la session a été REPRISE,
#    et non recréée :
#      whatsapp_etat WHATSAPP_AUTHENTICATED  « session restauree et acceptee »
#      whatsapp_etat WHATSAPP_READY
#    Un QR code à cette étape signifie que la session n'a pas suivi : revenir
#    au point 6 plutôt que de scanner.

# 4. Santé, depuis le serveur lui-même.
curl -s -H "Authorization: Bearer $AGENT_SERVICE_TOKEN" localhost:8080/sante | jq

# 5. Un message texte réel depuis le téléphone SUPER_ADMIN, et sa réponse.
#    Puis une note vocale, et sa transcription dans le journal.
```

### 6. Retour en arrière

Possible **tant que rien n'a été écrit** côté scolaire par le nouveau service.

```bash
systemctl disable --now guergne-agent
```

Puis redémarrer Altare depuis son panneau. La session y est restée intacte :
le transfert l'a copiée, il ne l'a pas déplacée. Si WhatsApp a invalidé
l'appareil entre-temps, il faut un nouvel appairage par QR sur l'un des deux —
jamais sur les deux.

---

## 7. Après la migration

- **mesurer la synthèse Piper sur le nouveau serveur** et comparer aux
  22 512 ms d'Altare. C'est le chiffre qui justifiait le déménagement ; sans
  cette mesure, la migration n'est pas évaluée, elle est seulement faite.
- `/diagnostic/redemarrer` devient un confort, plus une nécessité :
  `systemctl restart guergne-agent` suffit.
- sauvegarde quotidienne de `/var/lib/guergne` hors du serveur. Une sauvegarde
  sur le disque qu'elle protège n'en est pas une.
- surveillance du service, et alerte si `WHATSAPP_READY` n'est pas atteint dans
  les cinq minutes qui suivent un démarrage.

---

## 8. Ce que cette procédure ne couvre pas

- **La base de données** reste sur Neon, inchangée. Rien ici ne la touche.
- **La plate-forme web** reste sur Vercel. Seul l'agent déménage.
- **Le numéro WhatsApp** ne change pas. Si WhatsApp refusait la session
  transportée, l'appairage par QR exige le téléphone de l'établissement :
  prévoir qu'il soit disponible le jour du basculement.
