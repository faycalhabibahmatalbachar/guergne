# 00 — Rapport de recherche & décision technique

**Projet :** Système de gestion scolaire — Lycée Guergné La Renaissance
**Date :** 18 août 2026
**Périmètre :** 6ème → Terminale (collège + lycée, système francophone tchadien)
**Chef de projet :** décisions arrêtées ci-dessous, sans validation préalable requise.

---

## 1. Question posée

> « Trouver un site web prêt à l'emploi pour l'administration, très professionnel, riche en design. »

J'ai benchmarké l'écosystème open-source (GitHub, SourceForge, Capterra, listes communautaires SIS)
selon 6 critères éliminatoires :

| # | Critère | Pourquoi c'est éliminatoire |
|---|---------|------------------------------|
| C1 | Modèle scolaire **francophone** (moyennes /20, coefficients, trimestres, conseil de classe, rang) | Un SIS anglo-saxon raisonne en GPA / credits / semesters. Le réécrire coûte plus cher que partir de zéro. |
| C2 | **API REST** exploitable par une app Flutter | Sans API, pas d'app parents. |
| C3 | Compatible **PostgreSQL managé** + **conteneur Northflank** | Contrainte d'hébergement gratuit. |
| C4 | **Design 2026** (pas une UI PHP de 2012) | Exigence explicite : « très professionnel, très riche en design ». |
| C5 | **Licence** permissive | GPL contamine, AGPL bloque toute exploitation SaaS ultérieure. |
| C6 | **Maintenu** en 2026 | Un dépôt mort = dette technique immédiate. |

---

## 2. Résultats du benchmark

### 2.1 Les SIS « complets » (candidats sérieux)

| Solution | Stack | ★ | Licence | Verdict |
|----------|-------|---|---------|---------|
| [RosarioSIS](https://github.com/francoisjacquet/rosariosis) | PHP + PostgreSQL | 641 | GPL-2.0 | ❌ **C1** modèle US · **C2** API = plugin payant · **C4** UI datée. *Le mieux traduit en français et le plus vivant (commit du 18/08/2026) — mais l'adapter au bulletin tchadien impose de réécrire le moteur de notes.* |
| [Frappe Education](https://github.com/frappe/education) | Frappe/Python + MariaDB + Redis + workers | ~570 | GPL-3.0 | ❌ **C3 rédhibitoire** : exige MariaDB + Redis + 3 workers. Impossible sur Northflank gratuit (2 services), incompatible Postgres managé. |
| [OpenEduCat](https://github.com/openeducat/openeducat_erp) | Odoo/Python | ~505 | LGPL/AGPL | ❌ Dépend d'un Odoo complet. Modèle universitaire. |
| [Gibbon](https://gibbonedu.org) | PHP + MySQL | — | GPL-3.0 | ❌ **C1/C2/C4**. Modèle international britannique. |
| [openSIS](https://github.com/OS4ED/openSIS-Classic) | PHP + MySQL | — | GPL | ❌ **C6** peu actif · **C1** K-12 américain. |
| [Unifiedtransform](https://github.com/changeweb/Unifiedtransform) | Laravel | ~2k | GPL-3.0 | ❌ **C2** pas d'API mobile · **C1** modèle non francophone. |
| Fedena | Ruby on Rails | — | Apache (community) | ❌ Finance et multi-campus réservés à l'édition **payante**. |

### 2.2 Les projets « école » modernes (Next.js / React / Flutter)

Vérifiés un par un via l'API GitHub — **aucun n'est exploitable en production** :

| Dépôt | ★ | Réalité constatée |
|-------|---|-------------------|
| [safak/full-stack-school](https://github.com/safak/full-stack-school) (Lama Dev) | 874 | Projet **tutoriel YouTube**. 7 commits, aucune licence, auth Clerk. Démo protégée par login. **Utile comme référence UX métier uniquement.** |
| [biprodas/school-erp](https://github.com/biprodas/school-erp) | 49 | Squelette. |
| [zxmodren/Nextjs-SchoolManagementSystem-Template](https://github.com/zxmodren/Nextjs-SchoolManagementSystem-Template) | 44 | Template figé depuis 2024. |
| [hamidukarimi/SchoolOS-backend](https://github.com/hamidukarimi/SchoolOS-backend) | 38 | Backend seul, incomplet. |
| [vidyalayaone](https://github.com/vidyalayaone/vidyalayaone) | 17 | Très jeune. |
| [MiladJoodi/School_Management_Dashboard_UI_Design](https://github.com/MiladJoodi/School_Management_Dashboard_UI_Design) | 15 | **UI seule, aucune logique.** [Démo](https://dash-school.vercel.app/admin) |
| akashmahlaz/School-Management-System | 1 | **2 commits.** README trompeur : il promet « Next.js 15 + Supabase », le code correspondant n'existe pas. |
| [Yassin522/SchoolMate-App](https://github.com/Yassin522/SchoolMate-App) (Flutter) | 24 | Démo étudiante Firebase, sans licence. |

### 2.3 Conclusion du benchmark

> **Il n'existe aucun système scolaire prêt à l'emploi qui soit à la fois professionnel visuellement,
> francophone dans son modèle de notation, et doté d'une API pour une app mobile.**
>
> Le choix n'est donc pas « adopter ou construire », mais **« sur quel socle visuel construire »**.
> C'est là que l'open-source apporte l'essentiel de la valeur : les *dashboards admin* génériques de
> 2026 sont excellents, très supérieurs à ce que produirait un design maison.

---

## 3. Décision : socle visuel retenu

### ✅ [arhamkhnz/next-shadcn-admin-dashboard](https://github.com/arhamkhnz/next-shadcn-admin-dashboard)

**Démo live (vérifiée en direct) : https://next-shadcn-admin-dashboard.vercel.app**

| Critère | Valeur |
|---------|--------|
| Étoiles | 2 900 ★ · 587 forks |
| Licence | **MIT** — aucune contrainte |
| Stack | **Next.js 16.3 · React 19.2 · Tailwind CSS 4 · shadcn/ui + Base UI · TypeScript** |
| Vendor lock | **Aucun** — pas de Clerk, pas de backend imposé |
| Maintenu | Oui, activement |

**Ce qu'il apporte immédiatement, déjà designé :**

- Dashboard **`academy`** (déjà orienté enseignement) + 8 autres variantes
- **`users`** et **`roles`** — gestion des comptes et des permissions
- **`calendar`** (FullCalendar 7) → emploi du temps
- **`invoice`** → frais de scolarité, reçus, tranches
- **`file-manager`** → dossiers élèves, pièces jointes
- **`mail`** + **`chat`** → communication avec les parents
- **`kanban`**, **`tasks`**, **`profile`**, **`auth v1/v2`**, **palette de commandes (⌘J)**
- **Tables de données professionnelles** : tri, filtres, pagination, sélection, export (TanStack Table)
- **Thèmes** clair/sombre + presets de couleurs (on y greffe l'identité du lycée)
- Charts Recharts 3, formulaires React Hook Form + Zod 4

**Vérification faite :** la démo charge, la palette de commandes répond, les tables sont réellement
interactives (tri / filtre / pagination). Ce n'est pas une maquette morte.

### Références secondaires (inspiration, pas dépendances)

| Ressource | Usage |
|-----------|-------|
| [safak/full-stack-school](https://github.com/safak/full-stack-school) | Référence **UX métier** : arborescence admin / prof / élève / parent |
| [puikinsh/kiaalap](https://github.com/puikinsh/kiaalap) — [démo](https://colorlib.com/polygon/kiaalap/index.html) | Template admin **spécialisé éducation** (MIT, 328★) — inspiration écrans notes / présences |
| [Kiranism/next-shadcn-dashboard-starter](https://github.com/Kiranism/next-shadcn-dashboard-starter) | 6 800★, excellent — **écarté** car auth **Clerk** imposée (facturée au-delà du seuil gratuit) |
| [TailAdmin](https://github.com/TailAdmin/free-nextjs-admin-dashboard) | Déjà présent en local (`_ref-tailadmin`) — banque de composants d'appoint |

---

## 4. Décision : base de données

**Contrainte rencontrée :** le compte Supabase `chadconnect` est **plafonné à 2 projets actifs** sur
le plan gratuit, tous deux occupés par de la **production** :

- `sayibi ai` (Toumaï / ChadGPT) — `cndqdqnpqdgbfsqjvmgn`
- `canalplus` — `okqvppxwbpzvrcscbmdi`

Les deux projets en pause (`Nalga Bac`, `chadconnect`) **ne libèrent rien** : Supabase ne compte que
les projets *actifs*. Provisionner une 3ème base Supabase aurait donc imposé de mettre en pause un
service en production — exclu.

### ✅ Neon Postgres (validé)

| Critère | Neon (gratuit) | Supabase (gratuit) |
|---------|----------------|--------------------|
| Projets | **100** | 2 |
| Stockage | 0,5 Go / projet | 0,5 Go total |
| Mise en pause forcée | **Non** (scale-to-zero + réveil automatique) | **Oui, après 7 jours** ⚠️ |
| Compute | 100 CU-h/mois, autoscale jusqu'à 2 CU | Compute fixe permanent |
| Branches DB | 10 par projet (une branche de test = une branche Git) | — |
| Auth intégrée | Neon Auth (60k MAU) | Supabase Auth (50k MAU) |

**Pourquoi Neon gagne ici :** la mise en pause automatique de Supabase après 7 jours d'inactivité est
**rédhibitoire pour une école**. Pendant les grandes vacances (juillet → septembre, plus de 8 semaines
sans trafic), la base se met en pause et l'application tombe — il faut alors une réactivation manuelle
depuis le tableau de bord. Neon se réveille tout seul à la première requête. Bonus : le scale-to-zero
épouse exactement le profil d'usage d'un lycée (pics 7h–18h en semaine, quasi nul la nuit et le week-end).

**Conséquence d'architecture :** on n'utilise ni Supabase Auth ni les politiques RLS Supabase. La
sécurité remonte donc **dans la couche API** (voir `02-ARCHITECTURE.md`) — ce qui est de toute façon
préférable pour un domaine à 8 rôles, où une politique RLS récursive serait un nid à failles.
Le schéma reste du **PostgreSQL standard** : migrable vers Supabase ou un VPS sans réécriture.

---

## 5. Décisions arrêtées (récapitulatif)

| Sujet | Décision | Justification courte |
|-------|----------|----------------------|
| Stratégie | **Construire sur socle visuel MIT**, pas adopter un SIS | Aucun SIS ne gère le bulletin francophone + API mobile |
| Web admin | Next.js 16 · React 19 · Tailwind 4 · shadcn/ui | Socle `next-shadcn-admin-dashboard` (MIT) |
| Base de données | **Neon Postgres** | Pas de pause forcée (vacances scolaires), 100 projets |
| ORM / migrations | **Drizzle ORM** + SQL versionné | Typage TS bout-en-bout, migrations lisibles, portable |
| Authentification | **Auth applicative** (sessions web + JWT mobile) dans Next.js | 8 rôles → autorisation centralisée et auditable |
| API mobile | **REST versionnée** `/api/v1/*` servie par Next.js | Un seul déployable, un seul modèle de sécurité |
| Mobile parents | **Flutter** + Riverpod + go_router + cache offline (Drift) | Réseau tchadien instable → offline-first obligatoire |
| Notifications push | **Firebase Cloud Messaging** | Illimité et gratuit, contrairement à OneSignal (plafond 10k abonnés) |
| Notifications de repli | **SMS** | Tous les parents n'ont pas de smartphone — cf. `01-CAS-UTILISATION.md` |
| Bulletins PDF | **@react-pdf/renderer** | Pur JS, pas de Chromium → tient dans un conteneur gratuit |
| Hébergement | **Northflank** (conteneur Next.js standalone) | Pas de mise en veille forcée sur le tier gratuit |
| Langue | **Français** (UI, données, PDF) ; arabe en option v2 | Contexte tchadien bilingue |

---

## 6. Ce qui a été écarté, et pourquoi (traçabilité)

- **Puppeteer pour les PDF** → Chromium consomme ~300 Mo de RAM, incompatible avec un conteneur
  gratuit. Remplacé par `@react-pdf/renderer`.
- **RLS PostgreSQL comme unique garde-fou** → sur 8 rôles avec héritage (parent → enfants → classes →
  notes), les politiques deviennent récursives et coûteuses. Ce motif a déjà produit une faille
  d'élévation de privilège sur un projet précédent. L'autorisation est donc **explicite, centralisée
  côté serveur et testable**.
- **Clerk / Auth0** → gratuits jusqu'à un seuil, puis facturés au MAU. Une école a une croissance
  d'utilisateurs linéaire et garantie.
- **OneSignal** → plafond de 10 000 abonnés sur le plan gratuit. FCM est illimité.
- **Firebase Firestore** → modèle documentaire inadapté à un domaine massivement relationnel
  (notes × matières × périodes × coefficients × classes).
