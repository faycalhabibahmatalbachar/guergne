-- =============================================================================
-- 0001 — Référentiel : établissement, années, périodes, niveaux, séries,
--        matières, coefficients, salles.
-- Lycée Guergné La Renaissance
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --------------------------------------------------------------------------
-- Types énumérés
-- --------------------------------------------------------------------------
CREATE TYPE type_periode        AS ENUM ('TRIMESTRE', 'SEMESTRE');
CREATE TYPE cycle_scolaire      AS ENUM ('COLLEGE', 'LYCEE');
CREATE TYPE type_salle          AS ENUM ('CLASSE', 'LABORATOIRE', 'INFORMATIQUE', 'AMPHI', 'AUTRE');

-- --------------------------------------------------------------------------
-- Établissement (ligne unique — contrainte d'unicité forcée)
-- --------------------------------------------------------------------------
CREATE TABLE etablissement (
    id                  BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    nom                 TEXT NOT NULL DEFAULT 'Lycée Guergné La Renaissance',
    sigle               TEXT NOT NULL DEFAULT 'LGR',
    adresse             TEXT,
    ville               TEXT DEFAULT 'N''Djamena',
    pays                TEXT DEFAULT 'Tchad',
    telephone           TEXT,
    email               TEXT,
    site_web            TEXT,
    logo_url            TEXT,
    devise              TEXT NOT NULL DEFAULT 'FCFA',
    -- En-tête officiel imprimé sur les documents
    ministere_tutelle   TEXT DEFAULT 'Ministère de l''Éducation Nationale',
    autorisation_numero TEXT,
    -- Signataires par défaut des documents
    nom_proviseur       TEXT,
    nom_censeur         TEXT,
    -- Règles de gestion configurables
    note_maximale       NUMERIC(5,2) NOT NULL DEFAULT 20.00,
    moyenne_passage     NUMERIC(5,2) NOT NULL DEFAULT 10.00,
    seuil_alerte_absence_heures INTEGER NOT NULL DEFAULT 12,
    bloquer_bulletin_si_impaye  BOOLEAN NOT NULL DEFAULT FALSE,
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    modifie_le          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE etablissement IS 'Configuration globale. Une seule ligne (id = TRUE).';

-- --------------------------------------------------------------------------
-- Années scolaires
-- --------------------------------------------------------------------------
CREATE TABLE annees_scolaires (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    libelle         TEXT NOT NULL UNIQUE,          -- '2026-2027'
    date_debut      DATE NOT NULL,
    date_fin        DATE NOT NULL,
    type_periode    type_periode NOT NULL DEFAULT 'TRIMESTRE',
    est_courante    BOOLEAN NOT NULL DEFAULT FALSE,
    est_cloturee    BOOLEAN NOT NULL DEFAULT FALSE,
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_annee_dates CHECK (date_fin > date_debut)
);

-- Une seule année courante à la fois
CREATE UNIQUE INDEX uq_annee_courante ON annees_scolaires (est_courante) WHERE est_courante;

-- --------------------------------------------------------------------------
-- Périodes (trimestres / semestres)
-- --------------------------------------------------------------------------
CREATE TABLE periodes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    annee_id            UUID NOT NULL REFERENCES annees_scolaires(id) ON DELETE CASCADE,
    numero              SMALLINT NOT NULL,          -- 1, 2, 3
    libelle             TEXT NOT NULL,              -- '1er Trimestre'
    date_debut          DATE NOT NULL,
    date_fin            DATE NOT NULL,
    -- Fenêtre de saisie des notes
    saisie_ouverte      BOOLEAN NOT NULL DEFAULT TRUE,
    date_cloture_saisie DATE,
    -- Verrou : une fois verrouillée, aucune note n'est modifiable (UC-A03)
    est_verrouillee     BOOLEAN NOT NULL DEFAULT FALSE,
    verrouillee_le      TIMESTAMPTZ,
    verrouillee_par     UUID,
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (annee_id, numero),
    CONSTRAINT chk_periode_dates CHECK (date_fin > date_debut)
);

CREATE INDEX idx_periodes_annee ON periodes(annee_id);

-- --------------------------------------------------------------------------
-- Niveaux : 6ème → Terminale
-- --------------------------------------------------------------------------
CREATE TABLE niveaux (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT NOT NULL UNIQUE,       -- '6EME', '5EME', ... 'TERMINALE'
    libelle     TEXT NOT NULL,              -- 'Sixième'
    cycle       cycle_scolaire NOT NULL,
    ordre       SMALLINT NOT NULL UNIQUE,   -- 1 = 6ème … 7 = Terminale
    -- Niveau suivant, pour le passage automatique en fin d'année
    niveau_suivant_id UUID REFERENCES niveaux(id),
    -- Les séries ne s'appliquent qu'à partir de la 2nde
    series_applicables BOOLEAN NOT NULL DEFAULT FALSE
);

-- --------------------------------------------------------------------------
-- Séries (lycée) : A1, A4, C, D, G
-- --------------------------------------------------------------------------
CREATE TABLE series (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT NOT NULL UNIQUE,       -- 'A1', 'A4', 'C', 'D', 'G'
    libelle     TEXT NOT NULL,              -- 'Littéraire — Lettres/Langues'
    description TEXT,
    ordre       SMALLINT NOT NULL DEFAULT 0,
    active      BOOLEAN NOT NULL DEFAULT TRUE
);

-- --------------------------------------------------------------------------
-- Matières
-- --------------------------------------------------------------------------
CREATE TABLE matieres (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT NOT NULL UNIQUE,   -- 'MATH', 'FR', 'PC', 'SVT'
    libelle         TEXT NOT NULL,          -- 'Mathématiques'
    libelle_court   TEXT,                   -- 'Maths' (bulletins)
    couleur         TEXT DEFAULT '#64748b', -- repère visuel emploi du temps
    ordre_bulletin  SMALLINT NOT NULL DEFAULT 0,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- Coefficients : (matière × niveau × série)
-- Une même matière n'a pas le même poids en 2nde A et en Terminale C.
-- --------------------------------------------------------------------------
CREATE TABLE coefficients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    annee_id        UUID NOT NULL REFERENCES annees_scolaires(id) ON DELETE CASCADE,
    matiere_id      UUID NOT NULL REFERENCES matieres(id) ON DELETE CASCADE,
    niveau_id       UUID NOT NULL REFERENCES niveaux(id) ON DELETE CASCADE,
    serie_id        UUID REFERENCES series(id) ON DELETE CASCADE,  -- NULL au collège
    coefficient     NUMERIC(4,2) NOT NULL CHECK (coefficient > 0),
    -- Pondération interne du calcul de la moyenne de matière
    poids_interro       NUMERIC(4,2) NOT NULL DEFAULT 1.00,
    poids_devoir        NUMERIC(4,2) NOT NULL DEFAULT 1.00,
    poids_composition   NUMERIC(4,2) NOT NULL DEFAULT 2.00,
    obligatoire     BOOLEAN NOT NULL DEFAULT TRUE,
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unicité tolérante au NULL de serie_id (collège)
CREATE UNIQUE INDEX uq_coefficient
    ON coefficients (annee_id, matiere_id, niveau_id, COALESCE(serie_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX idx_coefficients_lookup ON coefficients(annee_id, niveau_id, serie_id);

-- --------------------------------------------------------------------------
-- Salles
-- --------------------------------------------------------------------------
CREATE TABLE salles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT NOT NULL UNIQUE,
    libelle     TEXT NOT NULL,
    type        type_salle NOT NULL DEFAULT 'CLASSE',
    capacite    SMALLINT CHECK (capacite > 0),
    batiment    TEXT,
    active      BOOLEAN NOT NULL DEFAULT TRUE
);

-- --------------------------------------------------------------------------
-- Calendrier scolaire (vacances, fériés, événements)
-- --------------------------------------------------------------------------
CREATE TYPE type_evenement AS ENUM (
    'VACANCES', 'FERIE', 'COMPOSITION', 'EXAMEN_BLANC',
    'REUNION_PARENTS', 'CONSEIL_CLASSE', 'RENTREE', 'AUTRE'
);

CREATE TABLE evenements_calendrier (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    annee_id        UUID NOT NULL REFERENCES annees_scolaires(id) ON DELETE CASCADE,
    type            type_evenement NOT NULL,
    titre           TEXT NOT NULL,
    description     TEXT,
    date_debut      DATE NOT NULL,
    date_fin        DATE NOT NULL,
    -- Ciblage optionnel
    niveau_id       UUID REFERENCES niveaux(id) ON DELETE CASCADE,
    classe_id       UUID,   -- FK ajoutée en 0003 (les classes n'existent pas encore)
    visible_parents BOOLEAN NOT NULL DEFAULT TRUE,
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_evt_dates CHECK (date_fin >= date_debut)
);

CREATE INDEX idx_evenements_annee_dates ON evenements_calendrier(annee_id, date_debut, date_fin);
