-- =============================================================================
-- 0015 — Enseignants, affectations, emploi du temps.
--
-- Complète le modèle pour couvrir les §10 et §12 du cahier des charges :
-- profil enseignant, spécialités, charge horaire, indisponibilités,
-- remplacements et durée des séances.
-- =============================================================================

-- --------------------------------------------------------------------------
-- Profil enseignant
-- --------------------------------------------------------------------------
CREATE TYPE statut_enseignant AS ENUM (
    'PERMANENT',      -- fonctionnaire ou titulaire de l'établissement
    'CONTRACTUEL',
    'VACATAIRE',      -- payé à l'heure, très courant au Tchad
    'STAGIAIRE',
    'SUSPENDU',
    'RETRAITE',
    'DEMISSIONNAIRE'
);

ALTER TABLE enseignants
    ADD COLUMN IF NOT EXISTS statut              statut_enseignant NOT NULL DEFAULT 'PERMANENT',
    ADD COLUMN IF NOT EXISTS date_fin_contrat    DATE,
    ADD COLUMN IF NOT EXISTS quartier            TEXT,
    ADD COLUMN IF NOT EXISTS numero_cnps         TEXT,
    -- Volume horaire contractuel : sert de référence à la charge de travail.
    ADD COLUMN IF NOT EXISTS heures_contractuelles NUMERIC(4,1),
    ADD COLUMN IF NOT EXISTS observations        TEXT;

COMMENT ON COLUMN enseignants.heures_contractuelles IS
    'Heures hebdomadaires dues. La charge réelle se calcule depuis les affectations.';

-- La colonne `type_contrat` en texte libre faisait doublon avec `statut`.
-- On la conserve pour ne rien perdre, mais elle n''est plus alimentée.
COMMENT ON COLUMN enseignants.type_contrat IS
    'Obsolète depuis 0015 — remplacée par la colonne `statut` (énumérée).';

-- --------------------------------------------------------------------------
-- Spécialités : matières qu'un enseignant est habilité à enseigner
--
-- Distinct des affectations : un professeur peut être qualifié en maths et en
-- physique sans se voir confier les deux cette année. La spécialité guide
-- l'affectation et alerte quand on confie une matière hors compétence.
-- --------------------------------------------------------------------------
CREATE TABLE enseignant_matieres (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enseignant_id   UUID NOT NULL REFERENCES enseignants(id) ON DELETE CASCADE,
    matiere_id      UUID NOT NULL REFERENCES matieres(id) ON DELETE CASCADE,
    /* La matière principale de l'enseignant, celle de son diplôme. */
    est_principale  BOOLEAN NOT NULL DEFAULT FALSE,
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (enseignant_id, matiere_id)
);

CREATE INDEX idx_enseignant_matieres_ens ON enseignant_matieres(enseignant_id);
CREATE INDEX idx_enseignant_matieres_mat ON enseignant_matieres(matiere_id);
CREATE UNIQUE INDEX uq_matiere_principale
    ON enseignant_matieres(enseignant_id) WHERE est_principale;

-- --------------------------------------------------------------------------
-- Indisponibilités récurrentes
--
-- Un vacataire enseigne souvent dans deux établissements. Sans cette
-- information, l'emploi du temps le place sur des créneaux qu'il ne peut pas
-- assurer, et le conflit n'apparaît qu'à la rentrée.
-- --------------------------------------------------------------------------
CREATE TABLE indisponibilites (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enseignant_id   UUID NOT NULL REFERENCES enseignants(id) ON DELETE CASCADE,
    annee_id        UUID NOT NULL REFERENCES annees_scolaires(id) ON DELETE CASCADE,
    jour_semaine    SMALLINT NOT NULL CHECK (jour_semaine BETWEEN 1 AND 7),
    creneau_id      UUID REFERENCES creneaux_horaires(id) ON DELETE CASCADE,
    /* creneau_id à NULL = indisponible toute la journée. */
    motif           TEXT,
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_indisponibilite
    ON indisponibilites (annee_id, enseignant_id, jour_semaine,
                         COALESCE(creneau_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- --------------------------------------------------------------------------
-- Emploi du temps : durée d'une séance
--
-- Un cours de TP ou une composition occupe deux créneaux consécutifs. Sans
-- cette colonne, il fallait créer deux lignes distinctes, et le décompte des
-- heures devenait faux.
-- --------------------------------------------------------------------------
ALTER TABLE emploi_du_temps
    ADD COLUMN IF NOT EXISTS nb_creneaux SMALLINT NOT NULL DEFAULT 1
        CHECK (nb_creneaux BETWEEN 1 AND 4);

-- --------------------------------------------------------------------------
-- Remplacements
--
-- Un cours non assuré doit pouvoir être rattrapé ou remplacé, et la trace
-- conservée : c'est la base du suivi de l'absentéisme enseignant (UC-G09).
-- --------------------------------------------------------------------------
CREATE TABLE remplacements (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seance_id             UUID REFERENCES seances(id) ON DELETE CASCADE,
    emploi_du_temps_id    UUID REFERENCES emploi_du_temps(id) ON DELETE SET NULL,
    enseignant_absent_id  UUID NOT NULL REFERENCES enseignants(id) ON DELETE CASCADE,
    enseignant_remplacant_id UUID REFERENCES enseignants(id) ON DELETE SET NULL,
    date_cours            DATE NOT NULL,
    motif                 TEXT NOT NULL,
    /* Le cours est-il rattrapé plus tard plutôt que remplacé ? */
    date_rattrapage       DATE,
    decide_par            UUID REFERENCES utilisateurs(id),
    cree_le               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_remplacant CHECK (enseignant_remplacant_id IS DISTINCT FROM enseignant_absent_id)
);

CREATE INDEX idx_remplacements_date ON remplacements(date_cours DESC);
CREATE INDEX idx_remplacements_absent ON remplacements(enseignant_absent_id, date_cours DESC);

-- --------------------------------------------------------------------------
-- Contrôle des conflits d'emploi du temps sur séances multi-créneaux
--
-- Les index uniques posés en 0003 ne couvrent que le créneau de départ. Une
-- séance de 2 créneaux pouvait donc en chevaucher une autre sans être
-- détectée. Ce déclencheur ferme la brèche pour la classe, l'enseignant et
-- la salle simultanément.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_conflit_emploi_du_temps() RETURNS TRIGGER AS $$
DECLARE
    v_ordre_debut   SMALLINT;
    v_ordre_fin     SMALLINT;
    v_conflit       RECORD;
BEGIN
    SELECT ordre INTO v_ordre_debut FROM creneaux_horaires WHERE id = NEW.creneau_id;
    v_ordre_fin := v_ordre_debut + NEW.nb_creneaux - 1;

    SELECT e.id, c.libelle AS classe, cr.libelle AS creneau,
           en.nom AS enseignant, s.code AS salle
      INTO v_conflit
      FROM emploi_du_temps e
      JOIN creneaux_horaires cr ON cr.id = e.creneau_id
      JOIN classes c            ON c.id = e.classe_id
      LEFT JOIN enseignants en  ON en.id = e.enseignant_id
      LEFT JOIN salles s        ON s.id = e.salle_id
     WHERE e.annee_id = NEW.annee_id
       AND e.jour_semaine = NEW.jour_semaine
       AND e.id IS DISTINCT FROM NEW.id
       AND COALESCE(e.semaine_type, '*') = COALESCE(NEW.semaine_type, '*')
       -- Chevauchement de plages de créneaux
       AND cr.ordre <= v_ordre_fin
       AND cr.ordre + e.nb_creneaux - 1 >= v_ordre_debut
       -- Sur au moins une des trois ressources
       AND (
             e.classe_id = NEW.classe_id
          OR (NEW.enseignant_id IS NOT NULL AND e.enseignant_id = NEW.enseignant_id)
          OR (NEW.salle_id     IS NOT NULL AND e.salle_id     = NEW.salle_id)
       )
     LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION
            'Conflit d''emploi du temps : le créneau chevauche le cours de % (%).',
            v_conflit.classe, v_conflit.creneau
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS edt_controle_conflit ON emploi_du_temps;
CREATE TRIGGER edt_controle_conflit
    BEFORE INSERT OR UPDATE ON emploi_du_temps
    FOR EACH ROW EXECUTE FUNCTION trg_conflit_emploi_du_temps();

-- --------------------------------------------------------------------------
-- Vue : charge horaire par enseignant
--
-- Compare les heures dues au contrat, les heures affectées (déclaratif) et
-- les heures réellement posées à l'emploi du temps. L'écart entre les deux
-- dernières est le principal signal d'un emploi du temps incomplet.
-- --------------------------------------------------------------------------
CREATE VIEW v_charge_enseignant AS
SELECT
    e.id                                        AS enseignant_id,
    a.id                                        AS annee_id,
    e.heures_contractuelles,
    COALESCE(SUM(DISTINCT af.heures_semaine), 0) AS heures_affectees,
    (
        SELECT COALESCE(SUM(edt.nb_creneaux), 0)
          FROM emploi_du_temps edt
         WHERE edt.enseignant_id = e.id AND edt.annee_id = a.id
    )                                           AS creneaux_places,
    (
        SELECT count(*)
          FROM affectations x
         WHERE x.enseignant_id = e.id AND x.annee_id = a.id AND x.active
    )                                           AS nb_affectations
FROM enseignants e
CROSS JOIN annees_scolaires a
LEFT JOIN affectations af
       ON af.enseignant_id = e.id AND af.annee_id = a.id AND af.active
WHERE e.actif
GROUP BY e.id, a.id, e.heures_contractuelles;

COMMENT ON VIEW v_charge_enseignant IS
    'Charge horaire par enseignant et par année : contrat, affecté, placé.';
