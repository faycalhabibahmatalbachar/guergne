-- =============================================================================
-- 0036 — Fondations du calendrier scolaire et des profils horaires journaliers.
--
-- Objectifs :
--   1. Distinguer les horaires selon le jour de la semaine.
--   2. Représenter les pauses sans les compter comme des cours.
--   3. Permettre des changements d'horaires datés sans écraser l'historique.
--   4. Enrichir les événements scolaires avec leur effet sur les cours,
--      leur validation et la provenance des dates officielles.
--
-- Les emplois du temps existants et le référentiel historique des créneaux
-- restent en place. Les nouveaux profils référencent les mêmes numéros de
-- créneaux logiques (1, 2, 3...) ; leurs heures réelles viennent du profil
-- applicable au jour et à la période.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Événements du calendrier : effet métier, validation et provenance.
-- ---------------------------------------------------------------------------
ALTER TABLE evenements_calendrier
    ADD COLUMN IF NOT EXISTS impact_cours TEXT NOT NULL DEFAULT 'INFORMATIF'
        CHECK (impact_cours IN ('INFORMATIF', 'SUSPENDRE_COURS', 'ORGANISATION_SPECIALE')),
    ADD COLUMN IF NOT EXISTS statut_validation TEXT NOT NULL DEFAULT 'BROUILLON'
        CHECK (statut_validation IN ('A_VERIFIER', 'BROUILLON', 'VALIDE', 'PUBLIE', 'ANNULE')),
    ADD COLUMN IF NOT EXISTS source_officielle TEXT,
    ADD COLUMN IF NOT EXISTS source_verifiee_le DATE,
    ADD COLUMN IF NOT EXISTS valide_par UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS valide_le TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS modifie_par UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS modifie_le TIMESTAMPTZ NOT NULL DEFAULT now();

-- Les anciennes entrées sont conservées, mais doivent être revérifiées avant
-- d'être utilisées comme règle officielle de fermeture. Leur type reste intact.
UPDATE evenements_calendrier
   SET impact_cours = CASE
         WHEN type::text IN ('FERIE', 'VACANCES') THEN 'SUSPENDRE_COURS'
         WHEN type::text IN ('COMPOSITION', 'EXAMEN_BLANC') THEN 'ORGANISATION_SPECIALE'
         ELSE 'INFORMATIF'
       END,
       statut_validation = 'A_VERIFIER'
 WHERE statut_validation = 'BROUILLON';

CREATE INDEX IF NOT EXISTS idx_evenements_annee_validation_dates
    ON evenements_calendrier (annee_id, statut_validation, date_debut, date_fin);

COMMENT ON COLUMN evenements_calendrier.impact_cours IS
    'Effet fonctionnel de l''événement. INFORMATIVE n''annule rien ; SUSPENDRE_COURS interdit les cours ordinaires selon la portée validée ; ORGANISATION_SPECIALE exige une planification spécifique.';
COMMENT ON COLUMN evenements_calendrier.statut_validation IS
    'Un événement ancien ou nouvellement créé n''est pas une fermeture officielle tant que sa validation n''a pas été confirmée.';
COMMENT ON COLUMN evenements_calendrier.source_officielle IS
    'Référence vérifiable de la décision, du communiqué ou du document à l''origine de la date officielle.';

-- ---------------------------------------------------------------------------
-- Profils horaires propres à une année scolaire.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profils_horaires (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    annee_id        UUID NOT NULL REFERENCES annees_scolaires(id) ON DELETE CASCADE,
    libelle         TEXT NOT NULL,
    description     TEXT,
    actif           BOOLEAN NOT NULL DEFAULT TRUE,
    cree_par        UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (annee_id, libelle),
    -- Clé composée utilisée ci-dessous pour garantir la cohérence année/profil.
    UNIQUE (id, annee_id)
);

CREATE INDEX IF NOT EXISTS idx_profils_horaires_annee_actif
    ON profils_horaires (annee_id, actif);

COMMENT ON TABLE profils_horaires IS
    'Modèle d''horaires réutilisable pour un ou plusieurs jours d''une année scolaire (ex. lundi-jeudi, vendredi).';

-- ---------------------------------------------------------------------------
-- Règles d'application : quel profil pour quel jour et quelle plage de dates.
-- Une journée n'a pas de profil par défaut tant qu'une règle n'est pas créée.
-- Cela évite d'inventer des horaires pour le samedi ou l'après-midi.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS regles_horaires_annee (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    annee_id            UUID NOT NULL REFERENCES annees_scolaires(id) ON DELETE CASCADE,
    jour_semaine        SMALLINT NOT NULL CHECK (jour_semaine BETWEEN 1 AND 7),
    profil_horaire_id   UUID NOT NULL,
    date_debut          DATE NOT NULL,
    date_fin            DATE NOT NULL,
    actif               BOOLEAN NOT NULL DEFAULT TRUE,
    cree_par            UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_regle_horaire_dates CHECK (date_fin >= date_debut),
    CONSTRAINT fk_regle_horaire_profil_annee
        FOREIGN KEY (profil_horaire_id, annee_id)
        REFERENCES profils_horaires(id, annee_id) ON DELETE CASCADE,
    UNIQUE (annee_id, jour_semaine, date_debut, date_fin)
);

CREATE INDEX IF NOT EXISTS idx_regles_horaires_date
    ON regles_horaires_annee (annee_id, jour_semaine, date_debut, date_fin)
    WHERE actif;

COMMENT ON TABLE regles_horaires_annee IS
    'Associe un profil horaire à un jour ISO et à une plage de dates inclusive. Les règles actives d''un même jour ne peuvent pas se chevaucher.';

CREATE OR REPLACE FUNCTION trg_regle_horaire_sans_chevauchement()
RETURNS TRIGGER AS $$
DECLARE
    v_debut_annee DATE;
    v_fin_annee   DATE;
BEGIN
    SELECT date_debut, date_fin
      INTO v_debut_annee, v_fin_annee
      FROM annees_scolaires
     WHERE id = NEW.annee_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Année scolaire introuvable pour la règle horaire.';
    END IF;

    IF NEW.date_debut < v_debut_annee OR NEW.date_fin > v_fin_annee THEN
        RAISE EXCEPTION 'La règle horaire doit rester dans les dates de son année scolaire.';
    END IF;

    IF NEW.actif AND EXISTS (
        SELECT 1
          FROM regles_horaires_annee r
         WHERE r.annee_id = NEW.annee_id
           AND r.jour_semaine = NEW.jour_semaine
           AND r.actif
           AND r.id IS DISTINCT FROM NEW.id
           AND daterange(r.date_debut, r.date_fin, '[]')
               && daterange(NEW.date_debut, NEW.date_fin, '[]')
    ) THEN
        RAISE EXCEPTION 'Deux profils horaires actifs se chevauchent pour ce jour de la semaine.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS regle_horaire_sans_chevauchement ON regles_horaires_annee;
CREATE TRIGGER regle_horaire_sans_chevauchement
    BEFORE INSERT OR UPDATE ON regles_horaires_annee
    FOR EACH ROW EXECUTE FUNCTION trg_regle_horaire_sans_chevauchement();

-- ---------------------------------------------------------------------------
-- Plages horaires d'un profil. Une pause est visible, mais n'est jamais une
-- séance réservable. ordre_cours reste le numéro logique du créneau utilisé
-- par emploi_du_temps.creneau_id ; ordre_affichage inclut les pauses.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plages_horaires (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profil_horaire_id   UUID NOT NULL REFERENCES profils_horaires(id) ON DELETE CASCADE,
    ordre_affichage     SMALLINT NOT NULL CHECK (ordre_affichage > 0),
    nature              TEXT NOT NULL CHECK (nature IN ('COURS', 'PAUSE')),
    libelle             TEXT NOT NULL,
    heure_debut         TIME NOT NULL,
    heure_fin           TIME NOT NULL,
    ordre_cours         SMALLINT,
    apres_ordre_cours   SMALLINT,
    creneau_id          UUID REFERENCES creneaux_horaires(id) ON DELETE RESTRICT,
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_plage_horaire_heures CHECK (heure_fin > heure_debut),
    CONSTRAINT chk_plage_horaire_nature CHECK (
        (nature = 'COURS' AND ordre_cours IS NOT NULL
            AND apres_ordre_cours IS NULL AND creneau_id IS NOT NULL)
        OR
        (nature = 'PAUSE' AND ordre_cours IS NULL
            AND apres_ordre_cours IS NOT NULL AND creneau_id IS NULL)
    ),
    UNIQUE (profil_horaire_id, ordre_affichage),
    UNIQUE (profil_horaire_id, ordre_cours),
    UNIQUE (profil_horaire_id, creneau_id)
);

CREATE INDEX IF NOT EXISTS idx_plages_horaires_profil_ordre
    ON plages_horaires (profil_horaire_id, ordre_affichage);

COMMENT ON TABLE plages_horaires IS
    'Horaires réels d''un profil : séances et pauses explicites. Les pauses ne sont pas des créneaux de cours.';

CREATE OR REPLACE FUNCTION trg_valider_plage_horaire()
RETURNS TRIGGER AS $$
DECLARE
    v_ordre_creneau SMALLINT;
BEGIN
    IF NEW.nature = 'COURS' THEN
        SELECT ordre
          INTO v_ordre_creneau
          FROM creneaux_horaires
         WHERE id = NEW.creneau_id;

        IF NOT FOUND OR v_ordre_creneau IS DISTINCT FROM NEW.ordre_cours THEN
            RAISE EXCEPTION 'Le numéro logique du cours doit correspondre à l''ordre de son créneau.';
        END IF;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM plages_horaires p
         WHERE p.profil_horaire_id = NEW.profil_horaire_id
           AND p.id IS DISTINCT FROM NEW.id
           AND p.heure_debut < NEW.heure_fin
           AND p.heure_fin > NEW.heure_debut
    ) THEN
        RAISE EXCEPTION 'Les plages d''un même profil horaire ne peuvent pas se chevaucher.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS plage_horaire_sans_chevauchement ON plages_horaires;
CREATE TRIGGER plage_horaire_sans_chevauchement
    BEFORE INSERT OR UPDATE ON plages_horaires
    FOR EACH ROW EXECUTE FUNCTION trg_valider_plage_horaire();

-- ---------------------------------------------------------------------------
-- Configuration initiale du lycée pour l'année courante, issue du document
-- transmis. On ne touche pas aux horaires des années passées ou futures.
-- Les ordres logiques 1..5 doivent exister dans le référentiel initial.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM annees_scolaires WHERE est_courante)
       AND (SELECT count(*) FROM creneaux_horaires WHERE ordre BETWEEN 1 AND 5) < 5 THEN
        RAISE EXCEPTION
            'P0 calendrier : les cinq créneaux logiques 1 à 5 doivent exister avant d''initialiser les profils horaires.';
    END IF;
END;
$$;

INSERT INTO profils_horaires (annee_id, libelle, description)
SELECT id, 'Lundi–Jeudi', 'Horaires officiels transmis par le lycée : cinq heures de cours et une récréation.'
  FROM annees_scolaires
 WHERE est_courante
ON CONFLICT (annee_id, libelle) DO NOTHING;

INSERT INTO profils_horaires (annee_id, libelle, description)
SELECT id, 'Vendredi', 'Horaires spécifiques du vendredi transmis par le lycée : cinq séances et une récréation.'
  FROM annees_scolaires
 WHERE est_courante
ON CONFLICT (annee_id, libelle) DO NOTHING;

INSERT INTO regles_horaires_annee
    (annee_id, jour_semaine, profil_horaire_id, date_debut, date_fin)
SELECT a.id, jours.jour, p.id, a.date_debut, a.date_fin
  FROM annees_scolaires a
  JOIN profils_horaires p
    ON p.annee_id = a.id AND p.libelle = 'Lundi–Jeudi'
 CROSS JOIN generate_series(1, 4) AS jours(jour)
 WHERE a.est_courante
ON CONFLICT (annee_id, jour_semaine, date_debut, date_fin) DO NOTHING;

INSERT INTO regles_horaires_annee
    (annee_id, jour_semaine, profil_horaire_id, date_debut, date_fin)
SELECT a.id, 5, p.id, a.date_debut, a.date_fin
  FROM annees_scolaires a
  JOIN profils_horaires p
    ON p.annee_id = a.id AND p.libelle = 'Vendredi'
 WHERE a.est_courante
ON CONFLICT (annee_id, jour_semaine, date_debut, date_fin) DO NOTHING;

-- Horaires du lundi au jeudi.
INSERT INTO plages_horaires
    (profil_horaire_id, ordre_affichage, nature, libelle, heure_debut, heure_fin,
     ordre_cours, apres_ordre_cours, creneau_id)
SELECT p.id, v.ordre_affichage, v.nature, v.libelle, v.heure_debut, v.heure_fin,
       v.ordre_cours, v.apres_ordre_cours, cr.id
  FROM profils_horaires p
 CROSS JOIN (VALUES
    (1::smallint, 'COURS'::text, '1ère heure'::text, TIME '07:00', TIME '08:00', 1::smallint, NULL::smallint),
    (2::smallint, 'COURS'::text, '2ème heure'::text, TIME '08:00', TIME '09:00', 2::smallint, NULL::smallint),
    (3::smallint, 'COURS'::text, '3ème heure'::text, TIME '09:00', TIME '10:00', 3::smallint, NULL::smallint),
    (4::smallint, 'PAUSE'::text, 'Récréation'::text, TIME '10:00', TIME '10:15', NULL::smallint, 3::smallint),
    (5::smallint, 'COURS'::text, '4ème heure'::text, TIME '10:15', TIME '11:15', 4::smallint, NULL::smallint),
    (6::smallint, 'COURS'::text, '5ème heure'::text, TIME '11:15', TIME '12:15', 5::smallint, NULL::smallint)
 ) AS v(ordre_affichage, nature, libelle, heure_debut, heure_fin, ordre_cours, apres_ordre_cours)
  LEFT JOIN creneaux_horaires cr ON cr.ordre = v.ordre_cours
 WHERE p.libelle = 'Lundi–Jeudi'
   AND EXISTS (SELECT 1 FROM annees_scolaires a WHERE a.id = p.annee_id AND a.est_courante)
   AND (v.nature = 'PAUSE' OR cr.id IS NOT NULL)
ON CONFLICT (profil_horaire_id, ordre_affichage) DO NOTHING;

-- Horaires du vendredi.
INSERT INTO plages_horaires
    (profil_horaire_id, ordre_affichage, nature, libelle, heure_debut, heure_fin,
     ordre_cours, apres_ordre_cours, creneau_id)
SELECT p.id, v.ordre_affichage, v.nature, v.libelle, v.heure_debut, v.heure_fin,
       v.ordre_cours, v.apres_ordre_cours, cr.id
  FROM profils_horaires p
 CROSS JOIN (VALUES
    (1::smallint, 'COURS'::text, '1ère heure'::text, TIME '07:00', TIME '07:55', 1::smallint, NULL::smallint),
    (2::smallint, 'COURS'::text, '2ème heure'::text, TIME '07:55', TIME '08:50', 2::smallint, NULL::smallint),
    (3::smallint, 'COURS'::text, '3ème heure'::text, TIME '08:50', TIME '09:45', 3::smallint, NULL::smallint),
    (4::smallint, 'PAUSE'::text, 'Récréation'::text, TIME '09:45', TIME '10:00', NULL::smallint, 3::smallint),
    (5::smallint, 'COURS'::text, '4ème heure'::text, TIME '10:00', TIME '10:55', 4::smallint, NULL::smallint),
    (6::smallint, 'COURS'::text, '5ème heure'::text, TIME '10:55', TIME '11:50', 5::smallint, NULL::smallint)
 ) AS v(ordre_affichage, nature, libelle, heure_debut, heure_fin, ordre_cours, apres_ordre_cours)
  LEFT JOIN creneaux_horaires cr ON cr.ordre = v.ordre_cours
 WHERE p.libelle = 'Vendredi'
   AND EXISTS (SELECT 1 FROM annees_scolaires a WHERE a.id = p.annee_id AND a.est_courante)
   AND (v.nature = 'PAUSE' OR cr.id IS NOT NULL)
ON CONFLICT (profil_horaire_id, ordre_affichage) DO NOTHING;
