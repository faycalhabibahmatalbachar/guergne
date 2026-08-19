# Lycée Guergné La Renaissance — Système de gestion scolaire

Plateforme de gestion pour un établissement secondaire tchadien, de la **6ème à la Terminale** :
une application web d'administration et une application mobile Flutter destinée aux parents.

---

## Composants

| Dossier | Contenu |
|---------|---------|
| `docs/` | Dossier projet : décisions, cas d'utilisation, architecture, design, feuille de route |
| `db/migrations/` | Schéma PostgreSQL versionné (9 migrations) |
| `web/` | Application d'administration — Next.js 16, React 19, Tailwind 4, shadcn/ui |
| `mobile/` | Application parents — Flutter (à scaffolder) |

---

## Documentation

| Document | Contenu |
|----------|---------|
| [00 — Décision technique](docs/00-DECISION-TECHNIQUE.md) | Benchmark de l'open-source scolaire et justification des choix |
| [01 — Cas d'utilisation](docs/01-CAS-UTILISATION.md) | ~130 cas répartis sur 14 modules, par acteur |
| [02 — Architecture](docs/02-ARCHITECTURE.md) | Stack, organisation du code, sécurité, API, mode hors ligne |
| [03 — Design system](docs/03-DESIGN-SYSTEM.md) | Palette, typographie, composants métier, bulletin imprimé |
| [04 — Roadmap & déploiement](docs/04-ROADMAP-DEPLOIEMENT.md) | Avancement, séquencement, Neon, hébergement, budget |
| [05 — Plan d'enrichissement](docs/05-PLAN-ENRICHISSEMENT.md) | 67 fonctionnalités recensées page par page, par priorité |

---

## Stack

- **Web** — Next.js 16 · React 19 · Tailwind CSS 4 · shadcn/ui · TypeScript
- **Base de données** — Neon PostgreSQL (plan gratuit, sans mise en pause forcée)
- **Mobile** — Flutter · Riverpod · go_router · Drift (hors ligne)
- **Hébergement** — Northflank (conteneur autonome)
- **Notifications** — Firebase Cloud Messaging, avec repli SMS

Le socle visuel est [`arhamkhnz/next-shadcn-admin-dashboard`](https://github.com/arhamkhnz/next-shadcn-admin-dashboard)
(MIT) — [démo](https://next-shadcn-admin-dashboard.vercel.app).

---

## Démarrage

```bash
cd web && npm install
```

Créer `web/.env.local` avec la chaîne de connexion Neon (voir
[04 — §4](docs/04-ROADMAP-DEPLOIEMENT.md)), puis :

```bash
npm run dev
```

### Tests du moteur de calcul

Moyennes, rangs, mentions — la partie qui doit être irréprochable :

```bash
cd web && node --test src/server/domain/notes.test.ts
```

### Validation du schéma SQL

Les 9 migrations sont vérifiées contre la grammaire officielle PostgreSQL avant toute application.

---

## Règles de gestion appliquées

Le système suit les conventions scolaires francophones, et non le modèle anglo-saxon :

- Notes **sur 20**, moyennes pondérées par **coefficient** (variable selon niveau et série)
- **Trimestres**, conseil de classe, appréciations, mentions, rang avec ex æquo
- Une **absence justifiée n'est pas un zéro** — elle est exclue du calcul
- Une matière sans note est exclue du **numérateur et du dénominateur** de la moyenne générale
- Classement olympique : deux élèves à égalité partagent le rang, le suivant est décalé
- Toute modification de note est **journalisée** ; le journal d'audit est immuable
