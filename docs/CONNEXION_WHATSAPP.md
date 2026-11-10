# Connexion WhatsApp — écran, QR, sécurité et dépannage

**Lycée Guergné La Renaissance** · 2026-11-10 · branche `voix-bidirectionnelle`

Ce document décrit comment l'assistant WhatsApp s'associe au numéro de
l'établissement, où l'on scanne le code, ce qui protège ce code, et quoi faire
quand la session tombe. Il ne contient **aucun secret** et n'en citera jamais.

---

## 1. L'URL

```
/dashboard/parametres/whatsapp
```

Sur la production : `https://lycee-guergne-renaissance.vercel.app/dashboard/parametres/whatsapp`

Elle est **permanente**. Elle s'ouvre qu'un code soit disponible ou non, et c'est
justement ce qui la rend utile : avant elle, lire le QR demandait d'ouvrir une
session SFTP sur le conteneur Altare pour y chercher un jeton dans
`donnees/PAIRING_TOKEN.txt` — une manœuvre qu'on ne mène pas depuis un
téléphone, un dimanche, quand l'agent ne répond plus.

Elle est référencée dans le catalogue des paramètres
(`web/src/app/(main)/dashboard/parametres/settings-catalog.ts`, carte
`whatsapp`, groupe « FINANCES ET CONTRÔLE ») et apparaît donc dans la recherche
et la navigation, pour qui en a le droit.

## 2. Qui y a accès

Droit exigé : **`systeme:administrer`**, aujourd'hui réservé au SUPER_ADMIN.

Associer un appareil à un compte WhatsApp n'est pas un geste de gestion
scolaire : c'est la prise de contrôle technique du canal. La DIRECTION, qui
détient par décision du propriétaire **tous les droits métier**, n'a
volontairement pas celui-ci — comme elle n'a pas `permission:gerer`,
`utilisateur:modifier` ni `sauvegarde:executer`.

Le droit est vérifié **trois fois**, et non une :

| Endroit | Effet d'un refus |
|---|---|
| `page.tsx` → `exigerPage("systeme:administrer")` | 307 vers `/auth/connexion`, ou `/unauthorized` |
| `GET /api/whatsapp/etat` → `requirePermission` | 401 (non authentifié) ou 403 |
| `GET /api/whatsapp/qr` → `requirePermission` | 401 ou 403 |

Le filtrage du catalogue ne protège **rien** : il décide seulement ce qui
s'affiche dans la navigation. Les deux routes sont la vraie barrière, et elles
ne font confiance à aucun en-tête venu du navigateur.

## 3. Comment le code arrive jusqu'à l'écran

```
navigateur  ──HTTPS──▶  Next.js (Vercel)  ──HTTP──▶  agent (Altare)
  session + rôle        jeton de service,            /pairing/etat
  ne reçoit que         côté serveur uniquement      /pairing/qr
  des pixels            aucun en-tête relayé
```

- `web/src/server/whatsapp/appairage-agent.ts` — client **serveur** (`server-only`).
  Il lit `AGENT_BASE_URL` et `AGENT_SERVICE_TOKEN` dans l'environnement et pose
  lui-même l'en-tête `x-agent-service-token`. Un navigateur ne peut donc pas
  s'inventer d'autorisation en ajoutant le sien.
- `agent/src/pairing.js` — la classe `Pairing` est l'**unique** autorité sur le
  cycle de vie du QR, et `jetonDeServiceValide()` est la voie serveur-à-serveur.
- Le QR est **généré à la demande** par l'agent (`qrcode` → PNG) à partir de la
  valeur que WhatsApp vient d'émettre. Il n'est jamais stocké, ni chez l'agent,
  ni chez Next.js, ni dans le navigateur.

### Les deux voies d'authentification de l'agent, et pourquoi il en faut deux

| | Jeton d'appairage (humain) | Jeton de service (backend) |
|---|---|---|
| En-tête | `x-pairing-token` | `x-agent-service-token` |
| Origine | `donnees/PAIRING_TOKEN.txt`, mode 0600, neuf à chaque démarrage | `AGENT_SERVICE_TOKEN`, partagé avec le backend |
| Brûlé après le scan | **oui**, définitivement | **non** : c'est une identité, pas un laissez-passer |
| Compté dans la limitation par origine | oui (10 tentatives / 5 min) | non : le backend sonde toutes les 5 s |
| Comparaison | temps constant | temps constant |

Le jeton d'appairage est volontairement à usage unique : c'est la bonne règle
pour un secret remis à un humain, qui a pu être copié ou photographié. Mais
cette règle rendait l'écran d'administration inutilisable, puisqu'il doit
pouvoir lire l'état à chaque redémarrage de l'agent. D'où la seconde voie.

Elle n'ouvre **aucun pouvoir nouveau** : `AGENT_SERVICE_TOKEN` est déjà
strictement plus puissant que le QR, car il autorise les écritures scolaires.
Et il ne quitte jamais le serveur Next.js.

## 4. Les cinq états de l'écran

| État de l'agent | Ce que la page montre |
|---|---|
| `authentifie` | « WhatsApp connecté », aucun QR. Elle ne dit « le client est prêt » que si `/sante` rend `whatsapp: ready` — sinon elle le dit aussi, franchement. |
| `pret` | Le QR, les quatre étapes du scan, et le rappel que le code se renouvelle seul. |
| `expire` | « Code expiré », et la récupération automatique du suivant. **Aucun rechargement manuel.** |
| `attente` | « Authentification en cours » : l'agent démarre Chromium ou tente de restaurer la session. |
| agent injoignable | Un avertissement explicite. La page **n'affirme rien** de la session tant que l'agent ne répond pas. |

Le rafraîchissement est un **sondage** de `/api/whatsapp/etat` : 5 s quand
l'agent répond, 15 s quand il ne répond pas, et **arrêté** dès que la session
est authentifiée. Ni SSE ni WebSocket : Vercel facture les fonctions à la
durée, et une connexion persistante par onglet ouvert sur un écran de
diagnostic serait payée pour rien. Un QR vit vingt secondes ; cinq suffisent.

L'image n'est rechargée que lorsque le temps restant **remonte** — signe que
l'agent a émis un code neuf. Sans cette précaution, la page clignoterait à
chaque sondage.

## 5. Ce qui protège le code

Le QR est un **secret d'authentification** : qui le scanne lie son téléphone au
numéro de l'établissement et lit les conversations.

- HTTPS pour le navigateur (Vercel). Le saut Next.js → Altare est en **HTTP
  clair** : le panneau Altare n'offre pas de TLS. Il relie deux serveurs, pas un
  public. Le jour où Altare servira en HTTPS, seule `AGENT_BASE_URL` change.
- Authentification et autorisation vérifiées **côté serveur**, à chaque requête.
- `Cache-Control: no-store, no-cache, must-revalidate, private`, `Pragma: no-cache`,
  `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, et
  `X-Frame-Options: DENY` sur l'image — un QR dans un cadre étranger serait un
  hameçonnage prêt à l'emploi.
- **Jamais dans une URL** : une URL finit dans l'historique du navigateur et
  dans les journaux d'accès du proxy. Le paramètre `?v=` ne porte qu'un
  horodatage, pour casser le cache.
- **Jamais journalisé** : l'agent écrit `[whatsapp] QR a scanner (non journalise)`
  et rien d'autre. Aucune valeur de QR n'existe dans les journaux, la
  documentation ou Git.
- **Jamais conservé** : 60 s de validité en mémoire, puis plus rien.
- Aucun service QR externe : l'image est produite localement par `qrcode`.
- Limitation : 10 tentatives par origine et par 5 minutes, comptées **par
  adresse**, pour qu'un attaquant ne verrouille pas l'appairage du personnel.

## 6. Variables d'environnement

| Variable | Où | Rôle |
|---|---|---|
| `AGENT_BASE_URL` | Vercel (backend) | base publique de l'agent, p. ex. `http://se-kna02.altare.global:25278`. **Absente aujourd'hui** : à poser avant que l'écran soit fonctionnel en production. |
| `AGENT_SERVICE_TOKEN` | Vercel **et** `agent/.env` | **même valeur des deux côtés**. Déjà présente. |

Sans `AGENT_BASE_URL`, l'écran s'ouvre quand même et annonce précisément la
variable manquante — un nom de variable n'est pas un secret, et c'est un
diagnostic de déploiement.

## 7. La voie de secours : le lien direct de l'agent

Si le backend est indisponible, l'agent sert sa propre page d'appairage :

```bash
node agent/scripts/lien-appairage.mjs          # imprime le lien complet
node agent/scripts/lien-appairage.mjs --etat    # état seulement, sans secret
```

Le script lit `PAIRING_TOKEN.txt` par SFTP et place le jeton dans le
**fragment** de l'URL (après `#`), que le navigateur ne transmet jamais au
serveur. Le lien ne vaut qu'une fois : le secret est brûlé au scan.

⚠ Ce lien circule en **clair** (HTTP). À n'utiliser que depuis un réseau de
confiance, et en scannant sans attendre. L'écran d'administration en HTTPS est
la voie normale.

Le fichier **absent** signifie que la session est déjà authentifiée.

## 8. Persistance de la session

`LocalAuth` écrit dans `DONNEES_DIR/wwebjs_auth/session-lycee`, soit
`/home/container/donnees/wwebjs_auth/session-lycee` sur Altare — le volume
persistant du conteneur. Vérifié le 2026-11-10 : le profil existe depuis le
2026-11-01 et survit aux redémarrages du processus.

Règles tenues par le code :

- `nettoyerVerrousChrome()` retire les verrous `Singleton*` d'un Chromium tué,
  et **rien d'autre**.
- L'authentification n'est **jamais** effacée au démarrage.
- Un verrou d'instance (`donnees/instance.lock`) garantit un seul propriétaire
  du profil. **Deux clients sur un même profil LocalAuth font révoquer
  l'appareil par WhatsApp** — c'est arrivé, et cela coûte un nouveau scan.

## 9. Dépannage

### « Le QR est expiré » juste après l'avoir scanné

Le code est renouvelé toutes les vingt secondes. Une image figée — une capture
d'écran, un PNG servi une fois — est morte à l'arrivée. Utiliser l'écran, qui
remplace le code de lui-même.

### L'agent propose un QR en boucle alors qu'une session existait

Constaté le 2026-11-10 : la session enregistrée n'est plus acceptée par
WhatsApp. Diagnostic pris sur `/sante` :

```
whatsapp: "qr"   attenteScanQr: true   jamaisConnecte: true
état « qr » depuis 2026-11-10T08:09:53Z, sans interruption
transitions : APPLICATION_READY → WHATSAPP_INITIALIZING
            → WHATSAPP_ERROR « Execution context was destroyed » → WHATSAPP_INITIALIZING
```

Ce qui est **établi** :

1. Le profil est présent et persistant — aucun effacement, aucun profil neuf :
   les fichiers datent du 2026-11-01 et l'arborescence est intacte.
2. Le processus courant **n'a jamais été connecté** (`jamaisConnecte: true`).
3. La restauration de la session n'a jamais été acceptée : aucun `authenticated`,
   un `qr` immédiat, offert sans interruption depuis 08:09 UTC.
4. La dernière fois que ce profil a porté une page WhatsApp vivante est le
   **2026-11-05 à 17:24 UTC** (`Default/Network Action Predictor`).

Conclusion : **l'appareil a été délié côté WhatsApp.** La persistance n'est pas
en cause, le code non plus. Le seul remède est un scan réel — d'où cet écran.

À ne pas faire pour « réparer » : supprimer `wwebjs_auth`. Cela détruirait le
seul état de diagnostic disponible sans rien résoudre, puisque le scan serait
de toute façon nécessaire.

### Un piège de mesure, pour mémoire

L'IndexedDB de `web.whatsapp.com` grossissait de plusieurs mégaoctets pendant
l'épisode — ce qui ressemble à une session qui synchronise. C'en est une
mauvaise lecture : la **page QR** charge elle aussi tout l'applicatif WhatsApp
Web et écrit dans IndexedDB. Seul `/sante` tranche, parce qu'il rapporte l'état
de la machine à états, et non l'activité du disque.

### Incohérence d'état à signaler

`/sante` rend `whatsappDetaille.etat = "WHATSAPP_INITIALIZING"` alors que
`etatHistorique = "qr"` et `attenteQr = true`. L'événement `qr` appelle
`machine.qrPropose()`, mais l'état détaillé reste celui du lancement. Ce n'est
pas une panne — l'écran s'appuie sur l'appairage, pas sur ce champ — mais le
champ détaillé est trompeur et mériterait d'être corrigé.

## 10. Tests

| Suite | Fichier | Nombre |
|---|---|---|
| `Pairing` (unitaire) | `agent/test/pairing.test.js` | 21 |
| Routes d'appairage (HTTP réel) | `agent/test/pairing-http.test.js` | 17 |

Couvert : réception du QR, renouvellement, expiration, refus sans jeton, refus
d'un jeton invalide, 429 après acharnement, limitation par origine, absence du
QR dans l'état public et dans la page, image PNG réelle (nombre magique
vérifié), en-têtes anti-cache sur toutes les réponses, brûlure du jeton après
authentification, refus de ressusciter un jeton brûlé, méthode HTTP incorrecte,
et pour la voie de service : acceptation, refus d'un faux, refus d'un préfixe
correct, refus quand aucun secret n'est configuré, en-tête non textuel, survie
à l'authentification, et non-consommation de la limitation.

Suite complète de l'agent : **781 / 781** au 2026-11-10.

### Ce qui n'est PAS validé

| Point | Statut | Pourquoi |
|---|---|---|
| Scan réel par un téléphone | **NON VALIDÉ** | aucun téléphone n'a scanné ; `authenticated` puis `ready` restent à constater |
| L'écran contre l'agent **d'Altare** | **BLOQUÉ** | Altare exécute un `app.js` du 2026-11-05, sans la voie de service. Un déploiement de l'agent est nécessaire. |
| L'écran dans un navigateur authentifié | **PARTIEL** | garde-fous prouvés (401, 401, 307 vers la connexion) ; le rendu sous session n'a pas été observé |

Prouvé en revanche, sur un `app.js` réel lancé en local sur un profil jetable :
401 sans jeton, 401 avec un faux jeton de service, 200 avec le bon et en-têtes
anti-cache corrects, 409 `attente` quand aucun QR n'existe.
