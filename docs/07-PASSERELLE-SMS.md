# Passerelle SMS — 235SMS sur Northflank

## Le problème, en une phrase

La passerelle est en ligne depuis le 22/08/2026 et le portail lui parle. Il
manque le dernier maillon : **un téléphone Android muni d'une SIM tchadienne**,
qui vient relever la file et expédie réellement les SMS. Sans lui, les messages
s'accumulent sans jamais partir — voir §4.

Et même avec lui, **46 % des tuteurs resteront injoignables par SMS** : la
passerelle n'achemine pas les numéros Moov. Voir §1.1.

---

## Contournement immédiat, sans SMS

Tant que le téléphone passerelle n'est pas branché — et durablement, pour les
familles Moov — le secrétariat communique le code de vive voix. Dans le
portail :

**Parents → choisir le tuteur → Inviter**

Le code à six chiffres s'affiche à l'écran. Il reste valable **7 jours**. Le
parent le saisit dans l'application ; rien ne vérifie qu'il l'a reçu par SMS.

C'est un fonctionnement acceptable pour une poignée de comptes, pas pour 737
tuteurs à la rentrée.

---

## Pourquoi 235SMS plutôt qu'un agrégateur international

| | 235SMS | Twilio |
| --- | --- | --- |
| Coût unitaire vers le Tchad | prix d'un SMS national | tarif international |
| Numéros destinataires | tous | uniquement ceux vérifiés un par un en essai |
| Acheminement | carte SIM locale | opérateur étranger, filtrage fréquent |

Twilio est inutilisable ici : son essai gratuit n'envoie qu'aux numéros
préalablement vérifiés dans la console, ce qui supposerait de valider 737
numéros à la main.

---

## Architecture

```
Portail LGR (Vercel)
      │  POST /v1/messages       Authorization: Bearer sk_live_…
      ▼
API 235SMS (Northflank)  ──┐
      │                     │  base Neon « sms-gateway »
      │  file d'attente     │
      ▼                     │
Application 235SMS Gateway ─┘
  (téléphone Android, SIM tchadienne)
      │  GET  /internal/jobs/claim
      │  POST /internal/jobs/{id}/complete
      ▼
   SMS envoyé depuis la SIM
```

Le téléphone est l'expéditeur réel. L'API n'est qu'une file d'attente : elle
ne sait pas envoyer de SMS, elle sait seulement les mettre en attente et
attendre qu'une passerelle vienne les chercher.

---

## 1. Déployer l'API sur Northflank

Render a suspendu le service pour impayé ; la base, elle, est intacte sur
Neon — les 50 organisations, 40 utilisateurs et 542 messages sont là. Il n'y a
donc **rien à migrer**, seulement à redéployer le calcul.

### 1.0 État : déployé le 22/08/2026

Le service **tourne et répond**. `GET /health` renvoie `{"ok":true}`, et la
clé de l'école authentifie correctement contre `/v1/messages`.

| | |
| --- | --- |
| Projet Northflank | `sms235`, région **europe-west-frankfurt** |
| Service | `sms235-api` (combined : build + déploiement) |
| Dépôt | `faycalhabibahmatalbachar/235SMS`, branche `main` |
| URL publique | `https://http--sms235-api--2qfdcm6qfq4g.code.run` |
| Groupe de secrets | `sms235-api-secrets`, priorité 10, non restreint |
| Contrôles de santé | `/health` en `readinessProbe` et `livenessProbe`, port 3000 |
| Base | Neon `sms-gateway` (`morning-thunder-48544734`), **eu-west-2**, chaîne poolée |
| Compte de l'école | organisation « Lycee Guergne La Renaissance », **exemptée de prélèvement** |

Francfort avait été choisi pour se co-localiser avec Neon `eu-central-1`, où
vit la base du portail. **La base de la passerelle, elle, est à Londres**
(`eu-west-2`) : le service et sa base sont donc séparés d'une dizaine de
millisecondes. C'est sans commune mesure avec les 1 672 ms mesurés hors région
sur le portail, et négligeable devant la latence d'un réseau mobile tchadien —
le service n'a pas été déplacé pour autant.

> **Le CLI Northflank n'a pas de commande `apply`.** Le gabarit
> `northflank/template-api.json` n'est donc pas applicable tel quel ; le
> service a été créé par `create service combined` avec la même spécification.
> Le gabarit reste la référence documentaire des réglages.

> **Piège rencontré à la création du groupe de secrets.** L'API attend les
> variables sous `secrets.variables`. Passées sous `data`, elles sont
> **ignorées silencieusement** : le groupe est créé, la réponse est un 200, et
> il est vide. Toujours relire le groupe après écriture plutôt que de faire
> confiance au code de retour.

### 1.0 bis Facturation de l'école

L'organisation porte `wallet_unlimited = true` : son solde est affiché mais
n'est plus prélevé. C'est la situation réelle — l'établissement paie la SIM,
pas le message.

Un très gros solde faisait office de contournement, mais la colonne
`wallet_balance_fcfa` est un `integer` : elle plafonne à 2 147 483 647. Ce
n'était donc pas « illimité » mais « grand », et surtout le compte paraissait
prépayé alors qu'il ne l'est pas.

Le recensement de ces comptes tient dans une vue : `v_organisations_illimitees`.

**Le crédit est prélevé à la mise en file, pas à l'expédition.** Une annulation
rembourse désormais ce qui avait été pris — ce n'était pas le cas avant le
22/08, et la remise en ordre de ce jour-là a coûté 9 750 F pour des messages
dont aucun n'est parti.

### 1.1 Couverture Moov — la restriction qui coupait la moitié des familles

> **Levé le 22/08/2026.** Une seconde SIM Moov a été mise en service et le
> refus a été retiré de 235SMS (commit `c290037`). Les préfixes acceptés sont
> désormais 3, 6, 8 et 9. La section reste ici parce qu'elle explique une
> décision structurante, et parce que le refus était recopié côté navigateur
> dans le portail développeur — une seule des deux copies corrigée aurait donné
> un tableau de bord refusant ce que l'API accepte.

`normalizeAndValidateChadNumber`, dans 235SMS, n'acceptait que les préfixes **6
et 8 (Airtel)** et refusait **3 et 9 (Moov)** avec `unsupported_operator_moov`.
Ce n'était pas une panne : c'était une limite de couverture, faute de SIM
capable d'atteindre ces numéros.

Sur les 89 tuteurs joignables actuellement enregistrés :

| Opérateur | Tuteurs | Part |
| --- | --- | --- |
| Airtel (6, 8) | 48 | 54 % |
| **Moov (3, 9)** | **41** | **46 %** |

Autrement dit, **près d'un parent sur deux ne pouvait pas recevoir son code
d'activation par SMS**. Avant la levée, deux voies seulement :

1. **La notification poussée**, une fois l'application installée — mais
   l'installation demande justement un code d'activation. L'amorçage passe donc
   nécessairement par le secrétariat.
2. **Le secrétariat**, qui lit le code à voix haute depuis *Parents → Inviter*.

Trois issues possibles, à trancher par l'établissement :

- **Un second téléphone passerelle avec une SIM Moov**, et la levée du refus
  côté 235SMS. C'est la seule solution qui rend le SMS universel.
- **Accepter l'amorçage manuel** pour les 41 familles Moov, puis basculer sur
  le push. C'est gratuit et cela ne coûte qu'une fois.
- **Ne pas compter sur le SMS** et faire du push le canal principal.

### 1.2 bis Tâche planifiée

`CRON_SECRET` n'était posée que localement. La route
`/api/notifications/traiter` répondait donc **503 en production** — elle reste
fermée sans secret, pour qu'une route ouverte ne permette à personne de faire
dépenser des SMS à l'école. La variable est désormais en ligne, et la file peut
être vidée par une tâche planifiée :

```
*/15 6-19 * * 1-6   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET"                       https://lycee-guergne-renaissance.vercel.app/api/notifications/traiter
```

Le plan Hobby de Vercel n'autorise qu'un cron par jour : cette tâche doit vivre
ailleurs — Northflank, où le service SMS tourne déjà.

### 1.2 Incident du 22/08 — vidage accidentel de la file

Le branchement de la passerelle a rencontré un arriéré de plusieurs jours.
Le vidage a expédié **195 messages pour 125 destinataires** : soixante-deux
parents étaient en file deux ou trois fois pour le même message.

Aucun n'a été remis — le téléphone passerelle n'était pas connecté — et les 195
ont été annulés. Personne n'a rien reçu, aucun crédit n'a été consommé.

Trois causes, toutes corrigées :

1. **Pas de clé d'idempotence.** `traiterFile` expédie puis enregistre ; entre
   les deux, Vercel coupe la fonction à 60 secondes. Le message était parti,
   son enregistrement ne l'était pas, la notification repartait au vidage
   suivant. Chaque envoi porte désormais l'identifiant de la notification en
   `Idempotency-Key` — 235SMS renvoie alors le message d'origine au lieu d'en
   créer un second.
2. **Les refus définitifs étaient rejoués.** Les 129 refus Moov repassaient
   trois fois chacun. `ResultatSms.definitif` les classe maintenant en échec du
   premier coup ; seuls 429 et 402 restent rejouables.
3. **Le bouton « Traiter la file » partait au premier clic**, sans annoncer le
   volume ni le coût. Il demande maintenant confirmation en affichant les deux.

**Le coût affiché par le portail était faux de moitié** : 25 F par SMS alors
que 235SMS en facture 50. Corrigé dans `web/src/lib/tarifs.ts`, désormais seule
source du tarif pour le serveur comme pour l'interface.

### 1.3 Créer le service (référence)

Northflank → **Create new → Service → Combined (build + deploy)**

| Réglage | Valeur |
| --- | --- |
| Dépôt | `github.com/faycalhabibahmatalbachar/235SMS` |
| Branche | `main` |
| Build type | Dockerfile |
| Dockerfile | `/apps/api/Dockerfile` |
| Contexte de build | `/` (racine — le Dockerfile lit tout le monorepo) |
| Port | `3000`, HTTP, **public** |
| Plan | `nf-compute-20` suffit |

> Le contexte doit être la **racine**, pas `apps/api`. Le Dockerfile copie
> `pnpm-workspace.yaml` et `packages/shared` : depuis `apps/api` il ne les
> trouverait pas et le build échouerait à l'installation des dépendances.

Un gabarit prêt à importer se trouve dans `235SMS/northflank/template-api.json`
(**Create new → From template → Upload file**).

### 1.4 Variables d'environnement

Non sensibles :

```
NODE_ENV=production
PORT=3000
DASHBOARD_ORIGIN=https://lycee-guergne-renaissance.vercel.app,https://two35sms.vercel.app
```

Secrets — à saisir dans un **Secret Group** :

| Variable | Où la prendre |
| --- | --- |
| `DATABASE_URL` | Neon → projet **sms-gateway** → Connection string (pooled) |
| `JWT_SECRET` | en générer un : `openssl rand -base64 32` |
| `API_SECRETS_ENCRYPTION_KEY` | idem, ≥ 32 caractères |
| `REDIS_URL` | **facultatif** — sans lui, les limites de débit passent en mémoire |

`REDIS_URL` peut rester vide : le code retombe explicitement sur un compteur
en mémoire. Sur une seule instance, c'est équivalent.

### 1.5 Contrôle de santé

**Settings → Health checks** : chemin `/health`, méthode GET, port 3000.

### 1.6 Vérifier

```bash
curl https://http--sms235-api--2qfdcm6qfq4g.code.run/health
```

---

## 2. Ouvrir le compte de l'école

Une fois l'API en ligne :

```bash
node --env-file .env apps/api/scripts/provisionner-client.mjs "Lycee Guergne La Renaissance" 10000
```

Le script crée l'organisation, le projet et la clé API, puis affiche la clé
**une seule fois** — seul son condensé argon2 est conservé, exactement comme
pour une clé créée depuis le tableau de bord.

`10000` est le crédit de départ en francs : à 50 F le SMS, cela couvre 200
envois. Au-delà, recharger depuis l'espace d'administration 235SMS.

---

## 3. Configurer le portail de l'école

Sur Vercel → projet `lycee-guergne-renaissance` → **Settings → Environment
Variables** :

```
SMS_FOURNISSEUR = generique
SMS_API_URL     = https://http--sms235-api--2qfdcm6qfq4g.code.run/v1/messages
SMS_API_KEY     = sk_live_…            (la clé affichée à l'étape 2)
SMS_SENDER_ID   = LGR
```

Puis redéployer.

### Ce qui a dû être corrigé pour que cela fonctionne

L'adaptateur générique envoyait le texte sous la clé `message`. 235SMS attend
`body`, et le refuse en 400 s'il manque. Le message était donc **perdu sans
erreur visible côté école**. Les deux clés sont désormais envoyées, ainsi que
plusieurs alias : changer de fournisseur ne demandera pas de retoucher le code.

Les codes de connexion partent en priorité `otp`, le reste en
`transactional` : un parent qui attend son code devant l'écran ne doit pas
passer derrière une campagne de relance d'impayés.

---

## 4. Brancher le téléphone passerelle

Sur le téléphone où **235SMS Gateway** est installée :

1. Ouvrir l'application.
2. Champ **URL du serveur** : remplacer `https://two35sms-api.onrender.com`
   par l'URL Northflank.
3. **Enregistrer l'appareil** — l'application obtient un jeton `dvc_…`.
4. **Lier à une organisation** : coller la clé `sk_live_…` de l'école.
5. Vérifier que la SIM est détectée et que le statut passe à *en ligne*.

Réglages du téléphone, à ne pas négliger :

- **Désactiver l'optimisation de batterie** pour l'application. Android
  suspend les applications en arrière-plan : la passerelle cesserait de
  relever la file au bout de quelques minutes, sans rien signaler.
- Laisser le téléphone **branché sur secteur**.
- Forfait SMS suffisant sur la SIM.

---

## 5. Recette de bout en bout

```bash
# 1. L'API répond
curl https://http--sms235-api--2qfdcm6qfq4g.code.run/health

# 2. Un SMS est accepté et mis en file
curl -X POST https://http--sms235-api--2qfdcm6qfq4g.code.run/v1/messages \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"to":"+235XXXXXXXX","body":"Test LGR","priority":"otp"}'
```

Une réponse `202` avec un `id` signifie « accepté et mis en file » — **pas
« envoyé »**. L'envoi réel dépend du téléphone passerelle. Suivre le statut :

```bash
curl https://http--sms235-api--2qfdcm6qfq4g.code.run/v1/messages/<id> \
  -H "Authorization: Bearer sk_live_…"
```

`queued` → `sent` quand le téléphone l'a relevé et expédié.

3. Depuis l'application des parents : saisir un numéro, demander le code, et
   vérifier qu'il arrive sur le téléphone du parent.

---

## Ce qui reste à surveiller

- **Le téléphone passerelle est un point de défaillance unique.** S'il
  s'éteint, plus aucun SMS ne part. La file, elle, ne perd rien : les
  messages attendent. Prévoir un second téléphone si l'école dépend
  vraiment du SMS.
- **Le crédit de l'organisation.** À zéro, les messages sont différés avec le
  motif `insufficient_wallet` — ils ne sont pas perdus, mais ils ne partent
  plus.
- **Le coût.** 25 F par segment côté école (paramètre `COUT_SMS_FCFA`), 50 F
  côté 235SMS. Ces deux valeurs doivent être alignées avec ce que l'école
  facture réellement, sinon le suivi budgétaire du portail est faux.
