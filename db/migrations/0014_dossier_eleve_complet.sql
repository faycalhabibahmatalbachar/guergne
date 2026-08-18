-- =============================================================================
-- 0014 — Complétion du dossier élève, des tuteurs et de l'inscription.
--
-- Écarts relevés entre le cahier des charges (§5 à §9) et le modèle initial.
-- =============================================================================

-- --------------------------------------------------------------------------
-- Élève : coordonnées propres, situation particulière, contact d'urgence
--
-- Un lycéen de Terminale a souvent son propre téléphone ; c'est par lui que
-- l'établissement le joint le plus vite. Le contact d'urgence, lui, n'est pas
-- toujours le tuteur : il doit pouvoir être saisi séparément.
-- --------------------------------------------------------------------------
ALTER TABLE eleves
    ADD COLUMN IF NOT EXISTS telephone              TEXT,
    ADD COLUMN IF NOT EXISTS email                  TEXT,
    ADD COLUMN IF NOT EXISTS situation_particuliere TEXT,
    ADD COLUMN IF NOT EXISTS urgence_nom            TEXT,
    ADD COLUMN IF NOT EXISTS urgence_telephone      TEXT,
    ADD COLUMN IF NOT EXISTS urgence_lien           TEXT;

COMMENT ON COLUMN eleves.situation_particuliere IS
    'Handicap, situation sociale, aménagement d''examen — information sensible, '
    'réservée à la direction et à la vie scolaire.';

-- --------------------------------------------------------------------------
-- Tuteurs : rôle légal et contact d'urgence
--
-- « Tuteur principal » (destinataire des communications), « responsable
-- financier » (qui paie) et « tuteur légal » (qui signe) sont trois rôles
-- distincts qui ne reposent pas forcément sur la même personne.
-- --------------------------------------------------------------------------
ALTER TABLE eleve_tuteur
    ADD COLUMN IF NOT EXISTS est_tuteur_legal    BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS est_contact_urgence BOOLEAN NOT NULL DEFAULT FALSE;

-- --------------------------------------------------------------------------
-- Inscription : numéro de dossier, validation administrative, transfert
--
-- Le matricule identifie l'ÉLÈVE pour toute sa scolarité. Le numéro
-- d'inscription identifie le DOSSIER d'une année donnée : il figure sur la
-- fiche d'inscription et sur les reçus.
-- --------------------------------------------------------------------------
CREATE TYPE statut_dossier AS ENUM (
    'BROUILLON',        -- saisie en cours
    'A_VALIDER',        -- dossier déposé, en attente de contrôle
    'VALIDE',           -- pièces vérifiées, inscription ferme
    'INCOMPLET',        -- pièces manquantes, retour au secrétariat
    'REFUSE'
);

ALTER TABLE inscriptions
    ADD COLUMN IF NOT EXISTS numero_inscription TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS statut_dossier     statut_dossier NOT NULL DEFAULT 'A_VALIDER',
    ADD COLUMN IF NOT EXISTS validee_par        UUID REFERENCES utilisateurs(id),
    ADD COLUMN IF NOT EXISTS validee_le         TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS observations       TEXT,
    -- Transfert sortant (§9 du cahier des charges)
    ADD COLUMN IF NOT EXISTS etablissement_destination TEXT,
    -- Passage en classe supérieure : trace de la décision d'où vient l'élève
    ADD COLUMN IF NOT EXISTS inscription_precedente_id UUID REFERENCES inscriptions(id);

CREATE INDEX IF NOT EXISTS idx_inscriptions_dossier ON inscriptions(statut_dossier)
    WHERE statut_dossier <> 'VALIDE';

-- --------------------------------------------------------------------------
-- Séquence du numéro d'inscription pour l'année civile en cours
-- --------------------------------------------------------------------------
INSERT INTO sequences_numerotation (cle, annee, prefixe, longueur)
VALUES ('INSCRIPTION', EXTRACT(YEAR FROM CURRENT_DATE)::SMALLINT, 'INS', 4)
ON CONFLICT (cle, annee) DO NOTHING;

-- --------------------------------------------------------------------------
-- Contrôle de capacité de classe
--
-- La capacité était déclarative : rien n'empêchait d'inscrire un 61ème élève
-- dans une classe de 60. Le contrôle applicatif ne suffit pas — deux
-- inscriptions simultanées peuvent le contourner. On le pose donc en base.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_controler_capacite() RETURNS TRIGGER AS $$
DECLARE
    v_effectif  INTEGER;
    v_capacite  SMALLINT;
    v_libelle   TEXT;
BEGIN
    IF NOT NEW.active THEN
        RETURN NEW;
    END IF;

    SELECT capacite_max, libelle INTO v_capacite, v_libelle
      FROM classes WHERE id = NEW.classe_id;

    SELECT count(*) INTO v_effectif
      FROM inscriptions
     WHERE classe_id = NEW.classe_id
       AND active
       AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF v_effectif >= v_capacite THEN
        RAISE EXCEPTION 'La classe % est complète (% places).', v_libelle, v_capacite
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inscriptions_controle_capacite ON inscriptions;
CREATE TRIGGER inscriptions_controle_capacite
    BEFORE INSERT OR UPDATE OF classe_id, active ON inscriptions
    FOR EACH ROW EXECUTE FUNCTION trg_controler_capacite();

-- --------------------------------------------------------------------------
-- Note sur les statuts d'élève
--
-- Le cahier des charges liste « réinscrit » et « actif » comme statuts.
-- Ils ne sont volontairement PAS ajoutés à l'énumération :
--   - « actif » est le sens même de INSCRIT ; deux valeurs pour un seul état
--     obligeraient chaque requête à tester les deux, et l'oubli d'un des deux
--     produirait des effectifs faux ;
--   - « réinscrit » n'est pas un état de l'élève mais la NATURE de son
--     inscription de l'année : c'est déjà `inscriptions.type = 'REINSCRIPTION'`.
-- Un élève réinscrit est donc INSCRIT, avec une inscription de type
-- REINSCRIPTION — l'information est conservée sans ambiguïté.
-- --------------------------------------------------------------------------
