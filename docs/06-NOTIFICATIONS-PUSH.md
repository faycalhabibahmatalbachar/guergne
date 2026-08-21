# Notifications push — Firebase, pas à pas

Le code d'envoi est écrit et testé (`web/src/server/notifications/fcm.ts`,
FCM HTTP v1 signé à la main, sans SDK). Il ne manque que **deux fichiers** que
seul le titulaire du compte Google peut produire.

Tant qu'ils manquent, la file reste en attente et l'écran « Traiter la file »
**refuse d'agir** plutôt que de marquer les messages envoyés. C'est
délibéré : un parent qui croit être prévenu des absences alors que rien ne
part est plus mal servi qu'un parent qui sait ne pas l'être.

---

## Réponse à « quelle clé vous faut-il pour tout faire vous-même ? »

Il n'existe pas de clé qui permette de **créer** un projet Firebase : la
création passe obligatoirement par la console web, avec une authentification
Google interactive. C'est une limite de Google, pas du projet.

En revanche, une fois le projet créé, **une clé de compte de service suffit
pour tout le reste** — et c'est ce qu'il me faut :

| Ce que je peux faire avec | Ce que vous seul pouvez faire |
| --- | --- |
| Déclarer l'application Android dans le projet | Créer le projet Firebase |
| Récupérer `google-services.json` par l'API | Générer la clé de compte de service |
| Configurer et envoyer les notifications | Accepter les conditions Google |
| Recette réelle sur téléphone | |

Autrement dit : **deux gestes de votre part, cinq minutes**, et je fais le
reste sans revenir vers vous.

---

## Faut-il réutiliser SAYIBI-AI ou créer un projet dédié ?

Vous avez déjà `SAYIBI-AI`, `canalplus`, `moovmoney`, `Nalga Bac`.

**Recommandation : un projet dédié `lycee-guergne-renaissance`.**

Réutiliser SAYIBI-AI marcherait techniquement — il suffirait d'y ajouter une
application Android. Mais :

- Les notifications de l'école partiraient depuis un projet nommé d'après un
  autre produit. Le jour où SAYIBI-AI change de main, est fermé ou dépasse son
  quota, l'école perd ses notifications sans comprendre pourquoi.
- Un projet Firebase est **gratuit et illimité en nombre**. La seule raison de
  mutualiser serait d'éviter du travail — il n'y en a pas.
- L'école est un client : ses données de notification ne doivent pas cohabiter
  avec celles de vos autres produits.

Le reste de ce document suppose un projet dédié. Si vous préférez SAYIBI-AI,
sautez l'étape 1 et déclarez simplement l'application Android dedans.

---

## Étape 1 — Créer le projet

<https://console.firebase.google.com> → **Créer un projet**

| Champ | Valeur |
| --- | --- |
| Nom | `lycee-guergne-renaissance` |
| Google Analytics | **Désactivé** |

> Analytics est inutile ici et collecterait des données de navigation liées à
> des mineurs. Le désactiver évite d'avoir à s'en justifier.

Le plan **Spark (gratuit)** suffit : les notifications push n'ont jamais été
facturées, quel que soit le volume. Inutile de passer en Blaze.

---

## Étape 2 — La clé serveur

**⚙️ Paramètres du projet → Comptes de service → Générer une nouvelle clé
privée**

Un fichier `.json` est téléchargé. **Transmettez-le-moi tel quel.** J'en
extrais trois champs que je poserai sur Vercel :

| Champ du JSON | Variable |
| --- | --- |
| `project_id` | `FCM_PROJECT_ID` |
| `client_email` | `FCM_CLIENT_EMAIL` |
| `private_key` | `FCM_PRIVATE_KEY` |

> **C'est un secret.** Il autorise l'envoi d'une notification à tous les
> téléphones de l'établissement. Jamais dans Git, jamais dans un canal public.
> Si vous le transmettez par un moyen dont vous n'êtes pas sûr, révoquez-le
> ensuite depuis la console et régénérez-en un.

---

## Étape 3 — L'application Android

**Paramètres du projet → Vos applications → Ajouter une application →
Android**

| Champ | Valeur exacte |
| --- | --- |
| Nom du package | `td.lyceerenaissance.lgr_parents` |
| Pseudo | `LGR Parents` |
| Certificat SHA-1 | ci-dessous |

**Empreintes du certificat de signature de l'école :**

```
SHA-1   41:49:8B:8E:19:32:B3:E8:4A:57:7B:A3:1E:B9:D1:4F:F8:C0:12:6A
SHA-256 EC:25:6F:B1:89:59:C1:DD:2C:5D:E8:34:8B:CA:BA:04:EE:C7:EC:73:D6:74:52:B3:FA:BA:70:68:ED:65:AF:5F
```

Le bouton **Télécharger google-services.json** apparaît. C'est le second
fichier à me transmettre.

> Le SHA-1 n'est pas requis pour le push seul ; il l'est pour la connexion
> Google et les liens profonds. Autant le renseigner tout de suite.

Si vous me donnez la clé de compte de service **avant** cette étape, je peux
créer l'application et récupérer `google-services.json` moi-même par l'API
Firebase Management — vous n'aurez alors que l'étape 2 à faire.

---

## Étape 4 — Ce que je fais à réception

1. Les trois variables `FCM_*` posées sur Vercel.
2. `google-services.json` déposé dans `mobile/android/app/`.
3. `firebase_core` et `firebase_messaging` ajoutés à l'application ; demande
   d'autorisation au premier lancement (obligatoire depuis Android 13) ;
   enregistrement du jeton auprès de `/api/mobile/appareil` — la route existe
   déjà et fonctionne.
4. Gestion des trois états : application au premier plan, en arrière-plan,
   fermée. Le troisième est celui que les intégrations ratent le plus souvent.
5. Recette réelle : une absence saisie dans le portail doit faire vibrer le
   téléphone en moins de dix secondes.
6. Nouvel APK signé.

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
