# 02 — Architecture technique

---

## 1. Vue d'ensemble

```
┌──────────────────────┐        ┌──────────────────────┐
│   NAVIGATEUR         │        │   MOBILE (Flutter)   │
│   Administration     │        │   Parents            │
│   8 rôles internes   │        │   Android 7+ / iOS   │
└──────────┬───────────┘        └──────────┬───────────┘
           │ Session cookie                │ JWT (Bearer)
           │ (HttpOnly, SameSite=Lax)      │ + refresh token
           └───────────────┬───────────────┘
                           ▼
        ┌──────────────────────────────────────┐
        │      NEXT.JS 16 (Northflank)         │
        │  ┌────────────────────────────────┐  │
        │  │ UI admin — React 19 Server      │  │
        │  │ Components + shadcn/ui          │  │
        │  ├────────────────────────────────┤  │
        │  │ API REST /api/v1/*  (mobile)    │  │
        │  ├────────────────────────────────┤  │
        │  │ ▓ COUCHE AUTORISATION ▓         │  │  ← point de passage unique
        │  ├────────────────────────────────┤  │
        │  │ Services métier (domain/)       │  │
        │  │ moyennes · rangs · bulletins    │  │
        │  ├────────────────────────────────┤  │
        │  │ Drizzle ORM                     │  │
        │  └────────────────────────────────┘  │
        └───────┬──────────────┬───────────────┘
                │              │
                ▼              ▼
     ┌────────────────┐   ┌──────────────────────┐
     │  NEON Postgres │   │  Services externes   │
     │  scale-to-zero │   │  FCM (push)          │
     │  branches      │   │  Passerelle SMS      │
     └────────────────┘   └──────────────────────┘
```

**Principe directeur : un seul déployable.** L'interface d'administration et l'API mobile vivent dans
la même application Next.js. Un seul modèle de sécurité, un seul jeu de règles métier, un seul
conteneur à héberger — décisif quand le tier gratuit Northflank n'offre que 2 services.

---

## 2. Stack retenue

### 2.1 Web (administration)

| Couche | Choix | Version |
|--------|-------|---------|
| Framework | Next.js (App Router, mode `standalone`) | 16.3 |
| UI | React | 19.2 |
| Styles | Tailwind CSS | 4 |
| Composants | shadcn/ui sur Base UI + Radix | — |
| Tables | TanStack Table | 9 |
| Formulaires | React Hook Form + Zod | 7 / 4 |
| Graphiques | Recharts | 3 |
| Calendrier | FullCalendar | 7 |
| État client | Zustand | 5 |
| PDF | `@react-pdf/renderer` | à ajouter |
| ORM | Drizzle ORM + `drizzle-kit` | à ajouter |
| Qualité | Biome (lint + format) | 2.5 |

### 2.2 Mobile (parents)

| Couche | Choix |
|--------|-------|
| Framework | Flutter (canal stable) |
| État | Riverpod (`AsyncNotifier`) |
| Navigation | go_router (avec garde d'authentification) |
| HTTP | Dio (intercepteur de rafraîchissement de jeton) |
| Cache local | Drift (SQLite) — **offline-first** |
| Stockage sécurisé | flutter_secure_storage (jetons) |
| Push | firebase_messaging |
| PDF | Téléchargement + `open_filex` |
| i18n | `flutter_localizations` + ARB |

### 2.3 Infrastructure

| Élément | Choix | Coût |
|---------|-------|------|
| Base de données | Neon Postgres, région `eu-central-1` | Gratuit |
| Application | Northflank — service conteneurisé | Gratuit |
| Registre d'images | Northflank (build depuis GitHub) | Gratuit |
| Push | Firebase Cloud Messaging | Gratuit, illimité |
| SMS | Passerelle tchadienne (Moov / Airtel) | **Facturé à l'usage** |
| Fichiers | Volume applicatif + compression WebP côté serveur | Gratuit |

---

## 3. Organisation du code

```
lycee-renaissance/
├── docs/                        # ce dossier
├── db/
│   └── migrations/              # SQL versionné, appliqué par drizzle-kit
├── web/
│   └── src/
│       ├── app/
│       │   ├── (main)/
│       │   │   ├── auth/                 # connexion
│       │   │   └── dashboard/            # espace administration
│       │   │       ├── eleves/
│       │   │       ├── classes/
│       │   │       ├── notes/
│       │   │       ├── bulletins/
│       │   │       ├── assiduite/
│       │   │       ├── discipline/
│       │   │       ├── finances/
│       │   │       ├── emploi-du-temps/
│       │   │       ├── communication/
│       │   │       ├── documents/
│       │   │       ├── statistiques/
│       │   │       └── parametres/
│       │   └── api/
│       │       └── v1/                   # API consommée par Flutter
│       ├── server/
│       │   ├── db/          # schéma Drizzle + client
│       │   ├── auth/        # sessions, JWT, hachage
│       │   ├── guard/       # ▓ couche autorisation ▓
│       │   ├── domain/      # règles métier pures (testables)
│       │   │   ├── notes.ts        # moyennes, rangs, statistiques
│       │   │   ├── bulletin.ts     # composition du bulletin
│       │   │   ├── assiduite.ts
│       │   │   └── finances.ts
│       │   └── pdf/         # gabarits react-pdf
│       ├── components/      # shadcn/ui + composants métier
│       └── navigation/      # arborescence du menu latéral
└── mobile/
    └── lib/
        ├── core/            # réseau, stockage, thème, erreurs
        ├── data/            # sources distantes + locales, dépôts
        ├── domain/          # entités, cas d'usage
        └── features/        # accueil, notes, bulletins, assiduité…
```

**Règle d'architecture :** `domain/` ne connaît ni HTTP ni base de données. Le calcul d'une moyenne
générale est une fonction pure — donc testable en isolation, ce qui est indispensable : une erreur de
moyenne sur un bulletin est une faute grave vis-à-vis des familles.

---

## 4. Authentification

### 4.1 Personnel (web)

1. Identifiant + mot de passe → vérification **Argon2id**.
2. Création d'une session en base (`sessions`), cookie **HttpOnly · Secure · SameSite=Lax**, 12 h.
3. Rotation du jeton de session à chaque connexion ; révocation immédiate possible (UC-N02).
4. Pas de JWT côté web : une session en base se révoque instantanément, un JWT non.

### 4.2 Parents (mobile)

1. Le secrétariat émet un **code d'activation** rattaché au numéro de téléphone du tuteur (UC-N06).
2. Le parent saisit son numéro → reçoit un code à 6 chiffres par SMS → définit un code PIN local.
3. Le serveur délivre un **access token JWT** (15 min) + un **refresh token** (60 jours, stocké haché
   en base, à usage unique avec rotation).
4. Le PIN protège l'ouverture de l'application ; il ne remplace pas l'authentification serveur.

**Pourquoi ce dispositif :** un tuteur au Tchad change souvent de téléphone mais rarement de numéro.
L'ancrage sur le numéro, avec un code délivré par l'école, évite qu'un tiers rattache un enfant qui
n'est pas le sien.

---

## 5. Autorisation — le point critique

Toutes les requêtes traversent une fonction unique. **Aucun accès direct à la base depuis une route.**

```ts
// src/server/guard/index.ts  (extrait de principe)
export async function requirePermission(
  ctx: RequestContext,
  action: Action,          // 'notes:write', 'eleve:suspend', 'bulletin:publish'…
  scope?: Scope,           // { classeId } | { eleveId } | { matiereId }
): Promise<Principal>
```

Trois niveaux de contrôle, appliqués dans l'ordre :

1. **Rôle** — le rôle possède-t-il l'action ? (matrice `roles × actions`)
2. **Périmètre** — l'acteur est-il rattaché à la ressource ?
   - `ENSEIGNANT` → uniquement les couples (classe × matière) où il est affecté
   - `PARENT` → uniquement les élèves dont il est tuteur reconnu
3. **État** — l'opération est-elle permise dans l'état courant ?
   - saisir une note dans une période **verrouillée** → refus
   - publier un bulletin non validé en conseil de classe → refus

**Enseignements tirés d'un incident passé** (élévation de privilège sur un projet antérieur) :

- Le rôle n'est **jamais** lu depuis un champ modifiable par l'utilisateur (`user_metadata` ou
  équivalent). Il provient exclusivement de la table `utilisateurs`, côté serveur.
- Le client ne transmet jamais son rôle ; il est rechargé à chaque requête depuis la session.
- Toute action sensible est écrite dans `journal_audit` avant d'être confirmée.

---

## 6. API mobile — `/api/v1`

Conventions : JSON, dates ISO-8601 (UTC), montants en **entiers FCFA** (jamais de flottant),
pagination `?page=&limit=`, erreurs normalisées `{ error: { code, message } }`.

| Méthode | Route | Rôle | Usage |
|---------|-------|------|-------|
| POST | `/auth/demande-code` | public | Envoi du code SMS |
| POST | `/auth/verifier-code` | public | Retourne les jetons |
| POST | `/auth/rafraichir` | parent | Rotation du refresh token |
| GET | `/moi` | parent | Profil + liste des enfants |
| GET | `/eleves/{id}/synthese` | parent | Écran d'accueil en **une seule requête** |
| GET | `/eleves/{id}/notes?periode=` | parent | Notes détaillées |
| GET | `/eleves/{id}/bulletins` | parent | Bulletins publiés |
| GET | `/eleves/{id}/bulletins/{bid}/pdf` | parent | Flux PDF |
| GET | `/eleves/{id}/assiduite?periode=` | parent | Absences et retards |
| GET | `/eleves/{id}/discipline` | parent | Incidents et sanctions |
| GET | `/eleves/{id}/emploi-du-temps` | parent | Grille hebdomadaire |
| GET | `/eleves/{id}/devoirs` | parent | Travaux à venir |
| GET | `/eleves/{id}/finances` | parent | Échéancier et solde |
| GET | `/annonces` | parent | Annonces ciblées |
| POST | `/appareils` | parent | Enregistrement du jeton FCM |
| GET | `/sync?depuis=` | parent | **Delta de synchronisation offline** |

`/eleves/{id}/synthese` est volontairement dénormalisée : sur un réseau 2G, une requête à 40 ko bat
six requêtes à 8 ko.

---

## 7. Stratégie hors ligne (mobile)

1. Toute réponse serveur est écrite dans **Drift (SQLite)** avec un `synced_at`.
2. L'interface lit **toujours** la base locale d'abord → affichage instantané, même sans réseau.
3. Un appel réseau se déclenche en arrière-plan et met à jour la base locale.
4. `GET /sync?depuis=<timestamp>` ne renvoie que les enregistrements modifiés depuis.
5. Un bandeau indique « Données du 17/08 à 14h32 » lorsque la connexion est absente — l'utilisateur
   sait toujours si ce qu'il lit est à jour.
6. Le parent est en **lecture seule** : aucune file d'écriture à réconcilier, donc aucun conflit possible.

---

## 8. Sécurité — synthèse

| Menace | Parade |
|--------|--------|
| Élévation de privilège | Rôle lu côté serveur uniquement, jamais depuis le client |
| Accès aux données d'un autre élève | Contrôle de périmètre systématique (`guard`) |
| Vol de jeton mobile | Access token 15 min · refresh à usage unique avec rotation · stockage sécurisé |
| Modification frauduleuse de note | `journal_audit` immuable + verrouillage des périodes |
| Injection SQL | Drizzle, requêtes paramétrées exclusivement |
| Force brute sur le code SMS | 5 tentatives, puis verrouillage 15 min ; code valable 10 min |
| Fuite par les PDF | URL signée à durée limitée, jamais d'identifiant devinable |
| Perte de données | Export automatique hebdomadaire hors plateforme |
| Injection de dépendance malveillante | `package-lock.json` figé, Dependabot |

---

## 9. Performance

- **Index** sur toutes les clés étrangères et les colonnes de filtre (`eleve_id`, `classe_id`,
  `periode_id`, `date`).
- **Vues matérialisées** pour les moyennes et les rangs, rafraîchies à la clôture d'une période :
  le calcul du rang d'une classe de 60 élèves sur 12 matières ne doit pas être refait à chaque
  affichage de bulletin.
- **Pagination obligatoire** sur toute liste (défaut 25, maximum 100).
- **React Server Components** : les tables volumineuses sont rendues côté serveur, le navigateur ne
  reçoit que du HTML — décisif sur une connexion lente.
- **Neon scale-to-zero** : première requête après inactivité ≈ 500 ms de réveil. Un *ping* toutes les
  10 minutes pendant les heures ouvrables suffit à masquer complètement cette latence.

---

## 10. Environnements

| Environnement | Base | Application |
|---------------|------|-------------|
| Local | Branche Neon `dev` | `npm run dev` |
| Recette | Branche Neon `staging` | Service Northflank de préproduction |
| Production | Branche Neon `main` | Service Northflank de production |

Les branches Neon sont des copies instantanées de la production : on teste une migration sur des
données réelles sans risque, puis on la promeut.

---

## 11. Variables d'environnement

```
DATABASE_URL=postgres://...@ep-xxx.eu-central-1.aws.neon.tech/lycee?sslmode=require
AUTH_SECRET=                 # 32+ octets aléatoires
JWT_SECRET=                  # distinct de AUTH_SECRET
APP_URL=https://...
FCM_PROJECT_ID=
FCM_CLIENT_EMAIL=
FCM_PRIVATE_KEY=
SMS_API_URL=
SMS_API_KEY=
SMS_SENDER_ID=LGR
ETABLISSEMENT_NOM=Lycée Guergné La Renaissance
ETABLISSEMENT_DEVISE=FCFA
```
