-- =============================================================================
-- 0003 — Structure pédagogique : classes, inscriptions, affectations
--        des enseignants, emploi du temps.
-- =============================================================================

-- --------------------------------------------------------------------------
-- Classes
-- --------------------------------------------------------------------------
CREATE TABLE classes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    annee_id            UUID NOT NULL REFERENCES annees_scolaires(id) ON DELETE CASCADE,
    niveau_id           UUID NOT NULL REFERENCES niveaux(id),
    serie_id            UUID REFERENCES series(id),     -- NULL au collège
    libelle             TEXT NOT NULL,                  -- 'Terminale D2'
    code                TEXT NOT NULL,                  -- 'TD2'
    capacite_max        SMALLINT NOT NULL DEFAULT 60 CHECK (capacite_max > 0),
    salle_id            UUID REFERENCES salles(id),
    -- Professeur principal : signe l'appréciation générale du bulletin (UC-D03)
    professeur_principal_id UUID REFERENCES enseignants(id) ON DELETE SET NULL,
    active              BOOLEAN NOT NULL DEFAULT TRUE,
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (annee_id, code)
);

CREATE INDEX idx_classes_annee ON classes(annee_id) WHERE active;
CREATE INDEX idx_classes_niveau ON classes(niveau_id, serie_id);

-- FK différée depuis 0001 (les classes n'existaient pas encore)
ALTER TABLE evenements_calendrier
    ADD CONSTRAINT fk_evenement_classe
    FOREIGN KEY (classe_id) REFERENCES classes(id) ON DELETE CASCADE;

-- --------------------------------------------------------------------------
-- Inscriptions : rattache un élève à une classe pour une année donnée.
-- C'est le pivot de tout le système — notes, absences et bulletins
-- référencent l'inscription, pas l'élève seul.
-- --------------------------------------------------------------------------
CREATE TYPE type_inscription AS ENUM ('INSCRIPTION', 'REINSCRIPTION', 'TRANSFERT_ENTRANT');

CREATE TABLE inscriptions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eleve_id            UUID NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
    annee_id            UUID NOT NULL REFERENCES annees_scolaires(id) ON DELETE CASCADE,
    classe_id           UUID NOT NULL REFERENCES classes(id),
    type                type_inscription NOT NULL DEFAULT 'INSCRIPTION',
    numero_ordre        SMALLINT,               -- rang alphabétique dans la classe
    date_inscription    DATE NOT NULL DEFAULT CURRENT_DATE,
    -- L'élève redouble-t-il ce niveau ?
    est_redoublant      BOOLEAN NOT NULL DEFAULT FALSE,
    -- Boursier / exonéré : impacte l'échéancier (UC-K09)
    est_boursier        BOOLEAN NOT NULL DEFAULT FALSE,
    -- Date de sortie si l'élève quitte en cours d'année
    date_sortie         DATE,
    motif_sortie        TEXT,
    active              BOOLEAN NOT NULL DEFAULT TRUE,
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    modifie_le          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (eleve_id, annee_id)
);

CREATE INDEX idx_inscriptions_classe ON inscriptions(classe_id) WHERE active;
CREATE INDEX idx_inscriptions_eleve ON inscriptions(eleve_id);
CREATE INDEX idx_inscriptions_annee ON inscriptions(annee_id);

-- --------------------------------------------------------------------------
-- Changements de classe en cours d'année (UC-B06)
-- --------------------------------------------------------------------------
CREATE TABLE changements_classe (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inscription_id      UUID NOT NULL REFERENCES inscriptions(id) ON DELETE CASCADE,
    classe_origine_id   UUID NOT NULL REFERENCES classes(id),
    classe_destination_id UUID NOT NULL REFERENCES classes(id),
    motif               TEXT NOT NULL,
    date_effet          DATE NOT NULL DEFAULT CURRENT_DATE,
    decide_par          UUID REFERENCES utilisateurs(id),
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_classes_differentes CHECK (classe_origine_id <> classe_destination_id)
);

-- --------------------------------------------------------------------------
-- Affectations enseignant × classe × matière
--
-- SÉCURITÉ : cette table est la SEULE source de vérité pour déterminer
-- ce qu'un enseignant est autorisé à noter (guard, périmètre ENSEIGNANT).
-- --------------------------------------------------------------------------
CREATE TABLE affectations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    annee_id        UUID NOT NULL REFERENCES annees_scolaires(id) ON DELETE CASCADE,
    enseignant_id   UUID NOT NULL REFERENCES enseignants(id) ON DELETE CASCADE,
    classe_id       UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    matiere_id      UUID NOT NULL REFERENCES matieres(id) ON DELETE CASCADE,
    heures_semaine  NUMERIC(4,2),
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (annee_id, classe_id, matiere_id)
);

CREATE INDEX idx_affectations_enseignant ON affectations(enseignant_id, annee_id) WHERE active;
CREATE INDEX idx_affectations_classe ON affectations(classe_id, annee_id) WHERE active;

-- --------------------------------------------------------------------------
-- Emploi du temps (UC-D04)
-- --------------------------------------------------------------------------
CREATE TABLE creneaux_horaires (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    libelle     TEXT NOT NULL,          -- '07h30 - 08h25'
    heure_debut TIME NOT NULL,
    heure_fin   TIME NOT NULL,
    ordre       SMALLINT NOT NULL UNIQUE,
    CONSTRAINT chk_creneau CHECK (heure_fin > heure_debut)
);

CREATE TABLE emploi_du_temps (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    annee_id        UUID NOT NULL REFERENCES annees_scolaires(id) ON DELETE CASCADE,
    classe_id       UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    matiere_id      UUID NOT NULL REFERENCES matieres(id),
    enseignant_id   UUID REFERENCES enseignants(id) ON DELETE SET NULL,
    salle_id        UUID REFERENCES salles(id) ON DELETE SET NULL,
    jour_semaine    SMALLINT NOT NULL CHECK (jour_semaine BETWEEN 1 AND 7), -- 1 = lundi
    creneau_id      UUID NOT NULL REFERENCES creneaux_horaires(id),
    -- Semaine A / B si l'établissement alterne (NULL = toutes les semaines)
    semaine_type    CHAR(1) CHECK (semaine_type IN ('A', 'B')),
    publie          BOOLEAN NOT NULL DEFAULT FALSE,   -- visible des parents (UC-D07)
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Une classe ne peut avoir deux cours sur le même créneau
    UNIQUE (annee_id, classe_id, jour_semaine, creneau_id, semaine_type)
);

CREATE INDEX idx_edt_classe ON emploi_du_temps(classe_id, jour_semaine);
CREATE INDEX idx_edt_enseignant ON emploi_du_temps(enseignant_id, jour_semaine);

-- Détection des conflits (UC-D05) : un enseignant ou une salle ne peut être
-- à deux endroits au même moment. Index partiels tolérants aux NULL.
CREATE UNIQUE INDEX uq_edt_enseignant_creneau
    ON emploi_du_temps (annee_id, enseignant_id, jour_semaine, creneau_id,
                        COALESCE(semaine_type, '*'))
    WHERE enseignant_id IS NOT NULL;

CREATE UNIQUE INDEX uq_edt_salle_creneau
    ON emploi_du_temps (annee_id, salle_id, jour_semaine, creneau_id,
                        COALESCE(semaine_type, '*'))
    WHERE salle_id IS NOT NULL;

-- --------------------------------------------------------------------------
-- Cahier de textes / séances réellement assurées (UC-I05, UC-G09)
-- --------------------------------------------------------------------------
CREATE TABLE seances (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    emploi_du_temps_id  UUID REFERENCES emploi_du_temps(id) ON DELETE SET NULL,
    classe_id           UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    matiere_id          UUID NOT NULL REFERENCES matieres(id),
    enseignant_id       UUID REFERENCES enseignants(id) ON DELETE SET NULL,
    date_seance         DATE NOT NULL,
    creneau_id          UUID REFERENCES creneaux_horaires(id),
    -- Contenu traité (cahier de textes)
    contenu             TEXT,
    travail_a_faire     TEXT,
    -- Le cours a-t-il été assuré ?
    assuree             BOOLEAN NOT NULL DEFAULT TRUE,
    motif_non_assuree   TEXT,
    -- L'appel a-t-il été fait ? (contrôle vie scolaire)
    appel_effectue      BOOLEAN NOT NULL DEFAULT FALSE,
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_seances_classe_date ON seances(classe_id, date_seance DESC);
CREATE INDEX idx_seances_enseignant ON seances(enseignant_id, date_seance DESC);
