# Cartographie du backend scolaire `guergne`

Objet : décrire les **capacités réelles** du backend que l'agent devra piloter —
pas les pages visibles, mais les tables, les API et la couche domaine. L'agent
appellera ces interfaces ; il ne fera **jamais** de SQL direct (brief §5, §10).

> Premier passage structurel (dépôt local, branche `ai-school-agent-p0-audit`).
> Le détail par endpoint (entrées/sorties, validations, permissions) sera complété
> lors de la construction du CATALOGUE_OUTILS_AGENT.

---

## 1. Forme générale

- Monorepo : `web/` (Next.js, TypeScript), `mobile/` (app parent), `db/` (migrations SQL).
- Base : **PostgreSQL (Neon)** — secret `NEON_API_KEY` présent côté dépôt.
- ORM : **Drizzle** (schéma sous `web/src/server/db/`), **≈ 60 tables**.
- Couche serveur : `web/src/server/{auth, db, domain, export, guard, import, notifications, pdf}`.
- API HTTP : `web/src/app/api/` + Server Actions sous `web/src/app/(main)/dashboard/_actions/`.

## 2. Modules fonctionnels (`dashboard/`)

`eleves`, `classes`, `parents`, `personnel`, `emploi-du-temps`, `assiduite`,
`discipline`, `notes`, `bulletins`, `finances`, `communication`, `parametres`.

## 3. Domaines de données (tables Drizzle, extrait vérifié)

| Domaine | Tables principales |
|---|---|
| Référentiel | `annees_scolaires`, `niveaux`, `matieres`, `series` (via migration 0013), `salles`, `parametres` |
| Personnes | `eleves`, `enseignants`, `eleve_tuteur`, `inscriptions`, `pieces_dossier`, `historique_statuts` |
| Structure | `classes`, `affectations`, `emploi_du_temps`, `creneaux_horaires`, `seances`, `enseignant_matieres`, `indisponibilites`, `remplacements` |
| Évaluations | `evaluations`, `notes`, `devoirs`, `coefficients`, `moyennes_matiere`, `moyennes_generales`, `appreciations_matiere`, `bulletins`, `bulletins_annuels`, `conseils_classe`, `historique_notes` |
| Assiduité | `absences`, `retards`, `notes_conduite` |
| Discipline | `incidents`, `sanctions`, `conseils_discipline`, `convocations` |
| Finances | `paiements`, `echeances`, `exonerations`, `grilles_tarifaires` |
| Communication | `annonces`, `annonce_destinataires`, `lectures_annonces`, `messages`, `notifications`, `convocations` |
| Système | `journal_audit`, `permissions`, `codes_activation`, `jetons_rafraichissement`, `appareils`, `fichiers`, `documents_emis`, `sequences_numerotation` |

## 4. Atouts déjà en place pour l'agent (à réutiliser, pas à recréer)

- **`journal_audit`** : une traçabilité existe déjà côté plateforme. L'audit de l'agent
  (brief §6) devra s'y articuler plutôt que de la doubler.
- **`permissions` + rôles** (migration `0012_permissions_super_admin.sql`) : un modèle
  RBAC existe. La matrice de permissions WhatsApp (brief §3.1) devra s'y **mapper**, pas
  réinventer des rôles parallèles.
- **API mobile** (`api/mobile/{activation, session, appareil, enfants, annonces}`) +
  `codes_activation`/`jetons_rafraichissement`/`appareils` : le backend sait déjà
  authentifier et servir un **client externe**. C'est le point d'entrée naturel de l'agent.
- **Exports/documents** (`server/export`, `server/pdf`, `api/export`, `api/documents`,
  `api/bulletins/impression`) : génération PDF/listes déjà disponible → l'agent peut
  produire et renvoyer des documents sans nouveau moteur.

## 5. API HTTP recensées (premier inventaire)

`api/bulletins` (+ `conseil-orientation`, `impression`, `[inscriptionId]`),
`api/documents/[type]`, `api/eleves` (+ `gabarit`), `api/emploi-du-temps/[vue]`,
`api/export/{comptable,[liste]}`, `api/fichiers/[id]`, `api/identite/icone`,
`api/mobile/{activation,annonces,appareil,enfants,session}`, `api/notes` (+ `gabarit`),
`api/notifications/traiter`, `api/personnel/gabarit`.

## 6. Conséquence d'architecture

L'agent doit exposer un **registre d'outils métier** (brief §4) où chaque outil
appelle une **API/action/service existant** de `guergne` avec contrôle de droits
**côté backend**. Deux voies à arbitrer lors de l'architecture :
1. réutiliser/étendre l'**API mobile** (déjà pensée pour l'externe) ;
2. ou ajouter une **API agent dédiée** (`/api/agent/*`) côté `guergne`, authentifiée par service.

À trancher dans ARCHITECTURE_TECHNIQUE, après lecture de `server/guard` et `server/domain`.
