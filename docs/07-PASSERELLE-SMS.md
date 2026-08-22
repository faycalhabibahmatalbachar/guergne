# Passerelle SMS — 235SMS sur Northflank

## Le problème, en une phrase

Un parent ouvre l'application, tape son numéro, attend le code — et rien
n'arrive. Le mode SMS est sur `journal` : le code est calculé, stocké, tracé,
mais jamais expédié. Tant que la passerelle n'est pas branchée, **aucun parent
ne peut se connecter seul**.

---

## Contournement immédiat, sans SMS

Le secrétariat peut communiquer le code de vive voix. Dans le portail :

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

### 1.0 La voie rapide : le gabarit déjà écrit

Tout le service est décrit dans `235SMS/northflank/template-api.json`, au
format « infrastructure as code » de Northflank. Il n'y a pas à recomposer les
réglages à la main.

Il ne manque qu'un **jeton d'API Northflank**, à créer dans
*Account settings → API tokens* (portée : l'équipe qui hébergera le service) :

```bash
npx @northflank/cli login --token <jeton>
cd 235SMS && npx @northflank/cli apply -f northflank/template-api.json
```

Le paragraphe 1.1 décrit les mêmes réglages pour qui préfère le tableau de
bord, et sert de référence si le gabarit doit être modifié.

### 1.1 Créer le service

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

### 1.2 Variables d'environnement

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

### 1.3 Contrôle de santé

**Settings → Health checks** : chemin `/health`, méthode GET, port 3000.

### 1.4 Vérifier

```bash
curl https://<votre-service>.northflank.app/health
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
SMS_API_URL     = https://<votre-service>.northflank.app/v1/messages
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
curl https://<service>.northflank.app/health

# 2. Un SMS est accepté et mis en file
curl -X POST https://<service>.northflank.app/v1/messages \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"to":"+235XXXXXXXX","body":"Test LGR","priority":"otp"}'
```

Une réponse `202` avec un `id` signifie « accepté et mis en file » — **pas
« envoyé »**. L'envoi réel dépend du téléphone passerelle. Suivre le statut :

```bash
curl https://<service>.northflank.app/v1/messages/<id> \
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
