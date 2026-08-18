-- =============================================================================
-- 0005 — Assiduité (absences, retards) et discipline (incidents, sanctions,
--        conduite).
-- =============================================================================

CREATE TYPE statut_justification AS ENUM ('NON_JUSTIFIEE', 'JUSTIFIEE', 'EN_ATTENTE');

CREATE TYPE type_absence AS ENUM (
    'COURS',        -- absence à une séance précise
    'JOURNEE',      -- absence sur la journée entière
    'DEMI_JOURNEE'
);

CREATE TYPE gravite_incident AS ENUM ('MINEURE', 'MOYENNE', 'GRAVE', 'TRES_GRAVE');

CREATE TYPE type_sanction AS ENUM (
    'AVERTISSEMENT_ORAL',
    'AVERTISSEMENT_ECRIT',
    'RETENUE',
    'TRAVAIL_INTERET_GENERAL',
    'EXCLUSION_COURS',
    'EXCLUSION_TEMPORAIRE',
    'CONSEIL_DISCIPLINE',
    'EXCLUSION_DEFINITIVE'
);

-- --------------------------------------------------------------------------
-- Absences (UC-G01, UC-G02)
-- --------------------------------------------------------------------------
CREATE TABLE absences (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inscription_id      UUID NOT NULL REFERENCES inscriptions(id) ON DELETE CASCADE,
    periode_id          UUID NOT NULL REFERENCES periodes(id) ON DELETE CASCADE,
    type                type_absence NOT NULL DEFAULT 'COURS',
    date_absence        DATE NOT NULL,
    -- Renseigné pour une absence à un cours précis
    seance_id           UUID REFERENCES seances(id) ON DELETE SET NULL,
    matiere_id          UUID REFERENCES matieres(id) ON DELETE SET NULL,
    creneau_id          UUID REFERENCES creneaux_horaires(id),
    -- Volume horaire, base du cumul reporté sur le bulletin
    nb_heures           NUMERIC(4,2) NOT NULL DEFAULT 1.00 CHECK (nb_heures > 0),
    statut              statut_justification NOT NULL DEFAULT 'NON_JUSTIFIEE',
    motif               TEXT,
    -- Justification (UC-G04)
    justificatif_url    TEXT,
    justifiee_par       UUID REFERENCES utilisateurs(id),
    justifiee_le        TIMESTAMPTZ,
    -- Suivi de la notification aux tuteurs (UC-G05)
    parents_notifies    BOOLEAN NOT NULL DEFAULT FALSE,
    notifie_le          TIMESTAMPTZ,
    saisie_par          UUID REFERENCES utilisateurs(id),
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    modifie_le          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_absences_inscription ON absences(inscription_id, date_absence DESC);
CREATE INDEX idx_absences_periode ON absences(periode_id, statut);
CREATE INDEX idx_absences_date ON absences(date_absence DESC);
-- File d'attente des notifications à envoyer
CREATE INDEX idx_absences_a_notifier ON absences(cree_le) WHERE NOT parents_notifies;

-- --------------------------------------------------------------------------
-- Retards (UC-G03)
-- --------------------------------------------------------------------------
CREATE TABLE retards (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inscription_id      UUID NOT NULL REFERENCES inscriptions(id) ON DELETE CASCADE,
    periode_id          UUID NOT NULL REFERENCES periodes(id) ON DELETE CASCADE,
    date_retard         DATE NOT NULL,
    heure_arrivee       TIME,
    duree_minutes       SMALLINT CHECK (duree_minutes >= 0),
    matiere_id          UUID REFERENCES matieres(id) ON DELETE SET NULL,
    statut              statut_justification NOT NULL DEFAULT 'NON_JUSTIFIEE',
    motif               TEXT,
    parents_notifies    BOOLEAN NOT NULL DEFAULT FALSE,
    saisie_par          UUID REFERENCES utilisateurs(id),
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_retards_inscription ON retards(inscription_id, date_retard DESC);

-- --------------------------------------------------------------------------
-- Sorties anticipées (UC-G10)
-- --------------------------------------------------------------------------
CREATE TABLE sorties_anticipees (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inscription_id      UUID NOT NULL REFERENCES inscriptions(id) ON DELETE CASCADE,
    date_sortie         DATE NOT NULL,
    heure_sortie        TIME NOT NULL,
    motif               TEXT NOT NULL,
    -- Qui a récupéré l'élève (doit être autorisé au retrait)
    recupere_par_tuteur_id UUID REFERENCES tuteurs(id),
    autorise_par        UUID REFERENCES utilisateurs(id),
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- Incidents disciplinaires (UC-H01)
-- --------------------------------------------------------------------------
CREATE TABLE incidents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inscription_id      UUID NOT NULL REFERENCES inscriptions(id) ON DELETE CASCADE,
    periode_id          UUID NOT NULL REFERENCES periodes(id) ON DELETE CASCADE,
    date_incident       DATE NOT NULL,
    heure_incident      TIME,
    lieu                TEXT,
    gravite             gravite_incident NOT NULL DEFAULT 'MINEURE',
    description         TEXT NOT NULL,
    temoins             TEXT,
    -- Auteur du signalement (enseignant ou surveillant)
    signale_par         UUID REFERENCES utilisateurs(id),
    parents_notifies    BOOLEAN NOT NULL DEFAULT FALSE,
    notifie_le          TIMESTAMPTZ,
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_incidents_inscription ON incidents(inscription_id, date_incident DESC);
CREATE INDEX idx_incidents_gravite ON incidents(gravite, date_incident DESC);

-- --------------------------------------------------------------------------
-- Sanctions (UC-H02)
-- --------------------------------------------------------------------------
CREATE TABLE sanctions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inscription_id      UUID NOT NULL REFERENCES inscriptions(id) ON DELETE CASCADE,
    incident_id         UUID REFERENCES incidents(id) ON DELETE SET NULL,
    periode_id          UUID NOT NULL REFERENCES periodes(id) ON DELETE CASCADE,
    type                type_sanction NOT NULL,
    motif               TEXT NOT NULL,
    date_debut          DATE NOT NULL,
    date_fin            DATE,               -- pour les exclusions temporaires
    duree_jours         SMALLINT,
    -- Suivi de l'exécution (retenue effectuée, TIG réalisé…)
    executee            BOOLEAN NOT NULL DEFAULT FALSE,
    executee_le         DATE,
    -- Une exclusion temporaire ou définitive change le statut de l'élève
    impacte_statut      BOOLEAN NOT NULL DEFAULT FALSE,
    prononcee_par       UUID REFERENCES utilisateurs(id),
    parents_notifies    BOOLEAN NOT NULL DEFAULT FALSE,
    document_url        TEXT,               -- notification signée
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_sanction_dates CHECK (date_fin IS NULL OR date_fin >= date_debut)
);

CREATE INDEX idx_sanctions_inscription ON sanctions(inscription_id, date_debut DESC);

-- --------------------------------------------------------------------------
-- Conseils de discipline (UC-H03, UC-H04)
-- --------------------------------------------------------------------------
CREATE TABLE conseils_discipline (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inscription_id      UUID NOT NULL REFERENCES inscriptions(id) ON DELETE CASCADE,
    date_convocation    DATE NOT NULL,
    date_seance         DATE NOT NULL,
    motif               TEXT NOT NULL,
    participants        TEXT,
    -- Le tuteur a-t-il été convoqué et s'est-il présenté ?
    tuteur_convoque     BOOLEAN NOT NULL DEFAULT TRUE,
    tuteur_present      BOOLEAN,
    deliberation        TEXT,
    decision            TEXT,
    sanction_id         UUID REFERENCES sanctions(id) ON DELETE SET NULL,
    proces_verbal_url   TEXT,
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- Note de conduite par période (UC-H05) — reportée sur le bulletin
-- --------------------------------------------------------------------------
CREATE TABLE notes_conduite (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inscription_id      UUID NOT NULL REFERENCES inscriptions(id) ON DELETE CASCADE,
    periode_id          UUID NOT NULL REFERENCES periodes(id) ON DELETE CASCADE,
    note                NUMERIC(5,2) CHECK (note >= 0 AND note <= 20),
    appreciation        TEXT,
    attribuee_par       UUID REFERENCES utilisateurs(id),
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    modifie_le          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (inscription_id, periode_id)
);

-- --------------------------------------------------------------------------
-- Vue de synthèse de l'assiduité par période.
-- Alimente directement le bloc « assiduité » du bulletin et l'app parent.
-- --------------------------------------------------------------------------
CREATE VIEW v_assiduite_periode AS
SELECT
    i.id                                    AS inscription_id,
    p.id                                    AS periode_id,
    COALESCE(SUM(a.nb_heures) FILTER (WHERE a.statut = 'JUSTIFIEE'), 0)      AS heures_justifiees,
    COALESCE(SUM(a.nb_heures) FILTER (WHERE a.statut <> 'JUSTIFIEE'), 0)     AS heures_non_justifiees,
    COALESCE(COUNT(DISTINCT a.id), 0)                                        AS nb_absences,
    COALESCE((
        SELECT COUNT(*) FROM retards r
        WHERE r.inscription_id = i.id AND r.periode_id = p.id
    ), 0)                                                                    AS nb_retards
FROM inscriptions i
-- Jointure sur l'année : sans cette condition, on produirait une ligne par
-- inscription × toutes les périodes de toutes les années (produit cartésien).
JOIN periodes p ON p.annee_id = i.annee_id
LEFT JOIN absences a ON a.inscription_id = i.id AND a.periode_id = p.id
WHERE i.active
GROUP BY i.id, p.id;

COMMENT ON VIEW v_assiduite_periode IS
    'Cumuls d''assiduité par élève et par période — bulletin et app parent.';
