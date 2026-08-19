# Notifications push — ce qu'il reste à fournir

Le code d'envoi est écrit et testé (`web/src/server/notifications/fcm.ts`).
Il ne manque que **deux fichiers**, que seul le titulaire du compte Google de
l'école peut produire. Ce document dit exactement où les prendre.

Tant qu'ils manquent, la file de notifications reste en attente et l'écran
« Traiter la file » **refuse d'agir** plutôt que de marquer les messages
comme envoyés — c'est délibéré : un parent qui croit être prévenu des absences
alors que rien ne part est plus mal servi qu'un parent qui sait ne pas l'être.

---

## 1. Créer le projet Firebase

<https://console.firebase.google.com> → **Créer un projet**

- Nom : `Lycee Guergne La Renaissance`
- Google Analytics : **désactivé** (inutile ici, et cela évite une collecte de
  données sur des mineurs)

---

## 2. Fichier n° 1 — la clé serveur

Elle autorise le portail à envoyer des notifications.

**Paramètres du projet** (roue dentée) → onglet **Comptes de service** →
**Générer une nouvelle clé privée** → un fichier `.json` est téléchargé.

Transmettez ce fichier tel quel. Il contient trois champs que je poserai sur
Vercel :

| Champ du JSON  | Variable d'environnement |
| -------------- | ------------------------ |
| `project_id`   | `FCM_PROJECT_ID`         |
| `client_email` | `FCM_CLIENT_EMAIL`       |
| `private_key`  | `FCM_PRIVATE_KEY`        |

> **Ce fichier est un secret.** Il permet d'envoyer une notification à tous les
> téléphones de l'établissement. Il ne doit jamais être commité ni transmis
> par un canal public.

---

## 3. Fichier n° 2 — la configuration de l'application Android

Elle permet au téléphone de s'enregistrer auprès de Firebase.

**Paramètres du projet** → **Vos applications** → **Ajouter une application** →
icône **Android**, puis :

| Champ demandé                     | Valeur à saisir                     |
| --------------------------------- | ----------------------------------- |
| Nom du package Android            | `td.lyceerenaissance.lgr_parents`   |
| Pseudo de l'application           | `LGR Parents`                       |
| Certificat de signature SHA-1     | voir ci-dessous                     |

**Empreintes du certificat de signature de l'établissement :**

```
SHA-1   41:49:8B:8E:19:32:B3:E8:4A:57:7B:A3:1E:B9:D1:4F:F8:C0:12:6A
SHA-256 EC:25:6F:B1:89:59:C1:DD:2C:5D:E8:34:8B:CA:BA:04:EE:C7:EC:73:D6:74:52:B3:FA:BA:70:68:ED:65:AF:5F
```

Firebase propose alors de télécharger **`google-services.json`**. C'est le
second fichier à me transmettre.

> Le SHA-1 n'est indispensable que pour la connexion Google et les liens
> profonds. Le push fonctionne sans lui — mais autant le renseigner tout de
> suite, cela évitera d'y revenir.

---

## 4. Ce que je ferai à réception

1. `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` posés sur Vercel.
2. `google-services.json` déposé dans `mobile/android/app/`.
3. Ajout de `firebase_core` et `firebase_messaging` à l'application, demande
   d'autorisation au premier lancement, enregistrement du jeton auprès de
   `/api/mobile/appareil` (la route existe déjà).
4. Essai réel : une absence saisie dans le portail doit faire vibrer le
   téléphone en moins de dix secondes.
5. Nouvel APK signé.

---

## Pourquoi le push et pas seulement le SMS

Le SMS coûte 25 F par message. Une seule journée d'appel dans un établissement
de 550 élèves peut produire 60 absences, soit environ 80 destinataires —
2 000 F par jour, 400 000 F sur une année scolaire.

Le push est gratuit et instantané. Le SMS reste le **repli** pour les familles
sans smartphone : c'est exactement ce que fait le déclencheur
`trg_notifier_absence`, qui choisit `PUSH` quand le tuteur a un compte
applicatif et `SMS` sinon.

---

## Passerelle SMS

Indépendante de Firebase. L'adaptateur accepte trois modes
(`web/src/server/notifications/sms.ts`) :

| `SMS_FOURNISSEUR` | Usage                                                     |
| ----------------- | --------------------------------------------------------- |
| `journal`         | mode actuel — rien n'est envoyé, tout est tracé            |
| `generique`       | toute passerelle acceptant un POST JSON — **recommandé**   |
| `twilio`          | essai gratuit, mais n'envoie qu'aux numéros vérifiés       |

**Recommandation : `generique` branché sur 235SMS.** Twilio facture cher le
Tchad et n'accepte, en essai, que des numéros préalablement vérifiés un par
un — inutilisable pour 737 tuteurs.

Variables à fournir pour le mode générique :

```
SMS_FOURNISSEUR=generique
SMS_API_URL=https://…/envoyer
SMS_API_KEY=…
SMS_EXPEDITEUR=LGR
```
