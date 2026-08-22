# Notifications push — Firebase

**État : configuré et vérifié côté serveur.** Le projet Firebase existe,
l'application Android y est déclarée, `google-services.json` est en place et
la chaîne d'envoi répond. Il reste une seule étape, qui exige un téléphone :
la recette réelle.

Ce document sert désormais à deux choses — refaire la configuration si le
projet Firebase devait être recréé, et diagnostiquer une notification qui
n'arrive pas.

---

## 1. Ce qui est en place

| Élément | Valeur |
| --- | --- |
| Projet Firebase | `lycee-guergne-renaissance` |
| Numéro d'expéditeur | `326203988013` |
| Application Android | `1:326203988013:android:cbb9104dfeaffa8e3280a4` |
| Nom de paquet | `td.lyceerenaissance.lgr_parents` |
| Compte de service | `firebase-adminsdk-fbsvc@lycee-guergne-renaissance.iam.gserviceaccount.com` |
| Empreintes déclarées | SHA-1 et SHA-256 du certificat de l'école |
| Canal de notification | `lgr_defaut` — « Vie scolaire », importance haute |

Le plan **Spark (gratuit)** suffit : les notifications push n'ont jamais été
facturées, quel que soit le volume.

---

## 2. Refaire la configuration

### 2.1 Ce que Google impose de faire à la main

La **création du projet** passe obligatoirement par la console web, avec une
authentification Google interactive. C'est une limite de Google. De même pour
la génération de la clé de compte de service :

> ⚙️ Paramètres du projet → Comptes de service → Générer une nouvelle clé privée

Analytics doit rester **désactivé** : inutile ici, et il collecterait des
données de navigation liées à des mineurs.

### 2.2 Tout le reste est scripté

Trois champs du JSON téléchargé vont dans `web/.env.local` :

| Champ du JSON | Variable |
| --- | --- |
| `project_id` | `FCM_PROJECT_ID` |
| `client_email` | `FCM_CLIENT_EMAIL` |
| `private_key` | `FCM_PRIVATE_KEY` — sur **une seule ligne**, sauts échappés en `\n` |

Puis :

```bash
cd web && npm run firebase:android
```

Le script déclare l'application Android si elle manque, ajoute les empreintes
de signature si elles manquent, et écrit `google-services.json` là où Gradle
le cherche. Il est idempotent : le relancer ne duplique rien.

> **La clé de compte de service est un secret.** Elle autorise l'envoi d'une
> notification à tous les téléphones de l'établissement. Jamais dans Git,
> jamais dans un canal public. Si elle a transité par un moyen incertain, la
> révoquer depuis la console et en régénérer une.

### 2.3 Poser les variables sur Vercel

```bash
cd web && VERCEL_TOKEN=xxxxx npm run vercel:env
```

Le jeton se crée sur <https://vercel.com/account/settings/tokens> et peut être
révoqué juste après. Le script ne remplace jamais le jeu complet de variables —
c'est le piège documenté en [04 §5.2](04-ROADMAP-DEPLOIEMENT.md).

---

## 3. Vérifier

```bash
cd web && npm run fcm:test
```

Sans argument, l'essai se fait sur un destinataire volontairement inexistant.
Google répond `UNREGISTERED`, ce qui **prouve** que la requête a été
authentifiée et routée vers le bon projet avant d'échouer sur le seul élément
qu'on sait faux. Le tableau des autres réponses possibles :

| Réponse | Cause |
| --- | --- |
| `UNREGISTERED` / `INVALID_ARGUMENT` | Attendu à vide — la chaîne fonctionne |
| `401` | Identifiants refusés |
| `403` | API Cloud Messaging désactivée sur le projet |
| `404 PROJECT` | Projet introuvable |

Une fois l'application installée sur un vrai téléphone et un parent connecté :

```bash
cd web && npm run fcm:test -- --appareils
```

Le script lit les appareils enregistrés en base et envoie à chacun.

---

## 4. Le piège qui fait tout échouer en silence

Depuis Android 8, **une notification adressée à un canal qui n'existe pas est
abandonnée sans erreur**. Firebase répond « message accepté », l'école croit
avoir prévenu le parent, et le téléphone ne sonne jamais. Rien dans les
journaux.

Le serveur envoie `channel_id: "lgr_defaut"`
(`web/src/server/notifications/fcm.ts`). Ce canal est créé au démarrage de
l'application par `MainActivity.kt`. **Les deux fichiers se citent
mutuellement : ne jamais changer cette chaîne d'un seul côté.**

Trois autres points qui font échouer les notifications sans message d'erreur :

- **`POST_NOTIFICATIONS`** — obligatoire depuis Android 13, demandée au
  premier lancement. Refusée, l'application continue de fonctionner : le jeton
  reste utile si le parent accorde l'autorisation plus tard depuis les
  réglages.
- **Le jeton tourne.** Firebase le renouvelle sans prévenir — réinstallation,
  restauration, effacement des données. L'application le repousse à chaque
  démarrage **et** à chaque rotation. Sans cela, les alertes cessent d'arriver
  en silence, le pire mode de panne possible : personne ne se plaint de ne pas
  recevoir ce qu'il ignore attendre.
- **Application au premier plan.** Android n'affiche rien de lui-même dans ce
  cas. C'est `BanniereNotification` qui s'en charge.

---

## 5. Ce qui reste

**La recette réelle.** Une absence saisie dans le portail doit faire vibrer un
téléphone en moins de dix secondes. Elle demande un APK installé, un compte
parent connecté, et quelqu'un devant l'écran — c'est la seule étape que le
code ne peut pas s'auto-administrer.

---

## Pourquoi le push plutôt que le SMS

Le SMS coûte 25 F par segment. Une journée d'appel dans un établissement de
550 élèves produit une soixantaine d'absences, soit environ 80 destinataires :
**2 000 F par jour, près de 400 000 F sur une année scolaire.**

Le push est gratuit et instantané. Le SMS reste le **repli** pour les familles
sans smartphone — c'est exactement ce que fait le déclencheur
`trg_notifier_absence`, qui choisit `PUSH` quand le tuteur a un compte
applicatif et `SMS` sinon. Chaque parent qui installe l'application fait
baisser la facture de l'école.

---

## Ce à quoi ce document ne répond pas

- **Notifications iOS.** Elles exigent un compte Apple Developer à 99 $/an et
  un certificat APNs. Hors sujet tant que la diffusion se fait par APK.
- **Notifications web.** Le portail est un outil de bureau, personne n'attend
  une alerte poussée dessus.
