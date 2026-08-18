# 04 — Feuille de route & déploiement

---

## 1. État d'avancement

| Lot | Contenu | État |
|-----|---------|------|
| **L0** | Recherche, benchmark, décisions d'architecture | ✅ **Fait** — `00-DECISION-TECHNIQUE.md` |
| **L0** | Catalogue des cas d'utilisation (14 modules, ~130 cas) | ✅ **Fait** — `01-CAS-UTILISATION.md` |
| **L0** | Architecture technique et modèle de sécurité | ✅ **Fait** — `02-ARCHITECTURE.md` |
| **L0** | Design system | ✅ **Fait** — `03-DESIGN-SYSTEM.md` |
| **L0** | Schéma PostgreSQL complet (9 migrations, 198 instructions) | ✅ **Fait et validé** contre la grammaire PostgreSQL |
| **L0** | Socle web installé (Next.js 16 + shadcn/ui, MIT) | ✅ **Fait** — `web/` |
| **L0** | Moteur de calcul des moyennes, rangs, mentions | ✅ **Fait, 36 tests au vert** — `web/src/server/domain/notes.ts` |
| **L1** | Base Neon provisionnée + migrations appliquées | ⏳ **Bloqué** — nécessite le compte Neon (§4) |
| **L1** | Authentification (sessions web + JWT mobile) | À faire |
| **L1** | Couche `guard` (rôles × périmètres × états) | À faire |
| **L1** | Module Élèves : inscription, dossier, statuts | À faire |
| **L2** | Module Notes : évaluations, saisie, verrouillage | À faire |
| **L2** | Module Bulletins : génération PDF, conseil de classe | À faire |
| **L3** | Assiduité + discipline + notifications | À faire |
| **L3** | Finances : échéanciers, encaissements, reçus | À faire |
| **L4** | API `/api/v1` + application Flutter parents | À faire |
| **L5** | Emploi du temps, documents, statistiques | À faire |

---

## 2. Séquencement recommandé

L'ordre n'est pas arbitraire : chaque lot débloque le suivant, et le lot 2 est celui qui produit la
**première valeur perceptible** pour l'établissement (un bulletin imprimable).

```
L1  Fondations        →  auth + guard + élèves + classes
L2  Cœur pédagogique  →  notes + bulletins            ← première valeur livrée
L3  Vie scolaire      →  assiduité + discipline + notifications
L4  Ouverture mobile  →  API v1 + app Flutter parents ← valeur perçue par les familles
L5  Compléments       →  emploi du temps + documents + pilotage
```

**Mise en service conseillée :** démarrer en production dès la fin de L2, sur **une seule classe
pilote**, pendant un trimestre. Un système scolaire se juge sur un bulletin réel, pas sur une démo.

---

## 3. Ce qui reste à décider avec l'établissement

Ces points relèvent du règlement intérieur, pas de la technique. Ils sont **paramétrables** — le
schéma les prévoit déjà — mais leurs valeurs doivent être confirmées par la direction :

| Question | Valeur par défaut retenue |
|----------|---------------------------|
| Trimestres ou semestres ? | **Trimestres** (3) |
| Pondération de la composition | Interro 1 · Devoir 1 · **Composition 2** |
| Séries ouvertes au lycée | A1, A4, C, D, G — à confirmer |
| Coefficients par matière et par série | À saisir : c'est la seule donnée que le système ne peut pas deviner |
| Seuil de passage | **10/20** |
| Seuil d'alerte absentéisme | **12 h** non justifiées |
| Nombre de tranches de paiement | **3** |
| Bloquer le bulletin en cas d'impayé ? | **Non** par défaut (activable) |
| Note de conduite sur 20 ? | Oui |

---

## 4. Provisionner la base Neon — action requise

C'est le **seul point bloquant** du projet, et il demande environ deux minutes.

1. Créer un compte sur **https://neon.tech** (plan gratuit, sans carte bancaire).
2. Créer un projet nommé `lycee-renaissance`, région **`eu-central-1` (Francfort)** — la plus proche
   du Tchad parmi les régions gratuites.
3. Copier la chaîne de connexion (« Connection string », format `postgres://…?sslmode=require`).
4. La déposer dans `web/.env.local` :

```bash
DATABASE_URL="postgres://user:mdp@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require"
```

5. Appliquer les migrations, dans l'ordre :

```bash
npm run db:migrate
```

Les 9 fichiers de `db/migrations/` sont numérotés et idempotents sur les données de référence
(`ON CONFLICT DO NOTHING`) : les rejouer ne casse rien.

> **Note de validation.** Le schéma a été vérifié contre la grammaire officielle PostgreSQL
> (`libpg-query`, 198 instructions analysées sans erreur). En revanche, la validation *sémantique*
> — existence effective des clés étrangères, cohérence des déclencheurs, exécution des vues — ne
> pourra intervenir qu'à la première application sur une base réelle. C'est l'étape 5 ci-dessus.

---

## 5. Déploiement sur Northflank

### 5.1 Préparer l'image

`next.config.mjs` doit produire une sortie autonome :

```js
export default { output: "standalone" };
```

`Dockerfile` (multi-étapes, image finale ≈ 150 Mo) :

```dockerfile
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
```

### 5.2 Configurer le service

1. Northflank → **Create service** → *Build from Git repository*.
2. Type **Combined** (build + déploiement), branche `main`, `Dockerfile` à la racine de `web/`.
3. Ressources : **0,2 vCPU / 512 Mo** suffisent (Next.js standalone, sans Chromium).
4. Port **3000**, HTTP, domaine public activé.
5. Variables d'environnement : celles listées en `02-ARCHITECTURE.md` §11.

> **Piège connu** — sur l'API Northflank comme sur Render, remplacer les variables d'environnement
> via un `PUT` **écrase l'intégralité du jeu**. Toujours relire les variables existantes et les
> renvoyer complètes, sinon les secrets absents de la requête disparaissent silencieusement.

### 5.3 Masquer le réveil de Neon

Neon met le compute en veille après inactivité ; le premier appel coûte alors ~500 ms. Une tâche
planifiée Northflank suffit à rendre cela invisible aux heures de classe :

```
*/10 6-19 * * 1-6   curl -fsS https://<domaine>/api/sante
```

Route `/api/sante` : un `SELECT 1`, sans authentification, sans écriture.

---

## 6. Sauvegarde

Le plan gratuit Neon **n'inclut pas de sauvegarde à long terme**. Pour une école, perdre les notes
d'un trimestre serait une catastrophe institutionnelle. Sauvegarde hebdomadaire hors plateforme,
via une tâche planifiée :

```bash
pg_dump "$DATABASE_URL" --format=custom --file=lgr-$(date +%F).dump
```

Conserver **au moins 3 mois** d'archives, et vérifier une restauration une fois par trimestre — une
sauvegarde jamais restaurée n'est pas une sauvegarde.

---

## 7. Budget

| Poste | Coût mensuel |
|-------|--------------|
| Neon Postgres (plan gratuit) | **0 F** |
| Northflank (plan gratuit) | **0 F** |
| Firebase Cloud Messaging | **0 F** |
| Nom de domaine `.td` ou `.com` | ~8 000 F / an |
| SMS (repli pour parents sans smartphone) | **Seul poste variable** — à cadrer avec l'établissement |

Le SMS est le seul coût réel. À ~25 F par message et 3 notifications mensuelles pour 1 500 familles,
l'ordre de grandeur est de **110 000 F / mois** si tout le monde passe par SMS. D'où la règle retenue :
**push en priorité, SMS uniquement en repli**, et paramètre `sms_actif` désactivé par défaut.
