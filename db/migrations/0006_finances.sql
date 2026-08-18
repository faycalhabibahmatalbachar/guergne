-- =============================================================================
-- 0006 — Finances : grilles tarifaires, échéanciers, encaissements,
--        exonérations, reçus.
--
-- RÈGLE ABSOLUE : tous les montants sont des ENTIERS en FCFA.
-- Le franc CFA n'a pas de subdivision utilisée ; un flottant introduirait
-- des erreurs d'arrondi sur des sommes qui doivent tomber juste.
-- =============================================================================

CREATE TYPE nature_frais AS ENUM (
    'INSCRIPTION',      -- droits d'inscription (nouveaux élèves)
    'REINSCRIPTION',
    'SCOLARITE',        -- frais de scolarité annuels
    'APE',              -- Association des Parents d'Élèves
    'TENUE',
    'EXAMEN',           -- frais d'examen (BEPC, BAC)
    'FOURNITURES',
    'TRANSPORT',
    'CANTINE',
    'AUTRE'
);

CREATE TYPE mode_paiement AS ENUM (
    'ESPECES',
    'MOBILE_MONEY',     -- Moov Money / Airtel Money — dominant au Tchad
    'VIREMENT',
    'CHEQUE',
    'AUTRE'
);

CREATE TYPE statut_echeance AS ENUM ('A_PAYER', 'PARTIEL', 'PAYE', 'EN_RETARD', 'EXONERE');

-- --------------------------------------------------------------------------
-- Grille tarifaire par niveau (UC-K01)
-- --------------------------------------------------------------------------
CREATE TABLE grilles_tarifaires (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    annee_id            UUID NOT NULL REFERENCES annees_scolaires(id) ON DELETE CASCADE,
    niveau_id           UUID NOT NULL REFERENCES niveaux(id) ON DELETE CASCADE,
    serie_id            UUID REFERENCES series(id) ON DELETE CASCADE,
    nature              nature_frais NOT NULL,
    libelle             TEXT NOT NULL,
    montant_fcfa        INTEGER NOT NULL CHECK (montant_fcfa >= 0),
    -- Frais obligatoire ou optionnel (cantine, transport)
    obligatoire         BOOLEAN NOT NULL DEFAULT TRUE,
    -- Ne s'applique qu'aux nouveaux inscrits, ou qu'aux réinscrits
    applicable_nouveaux BOOLEAN NOT NULL DEFAULT TRUE,
    applicable_anciens  BOOLEAN NOT NULL DEFAULT TRUE,
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_grilles_annee_niveau ON grilles_tarifaires(annee_id, niveau_id);

-- --------------------------------------------------------------------------
-- Tranches de paiement (UC-K02) — généralement 3 échéances
-- --------------------------------------------------------------------------
CREATE TABLE tranches (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    annee_id            UUID NOT NULL REFERENCES annees_scolaires(id) ON DELETE CASCADE,
    numero              SMALLINT NOT NULL,
    libelle             TEXT NOT NULL,          -- '1ère tranche'
    date_limite         DATE NOT NULL,
    -- Part du total exigible à cette échéance (en pourcentage)
    pourcentage         NUMERIC(5,2) NOT NULL CHECK (pourcentage > 0 AND pourcentage <= 100),
    UNIQUE (annee_id, numero)
);

-- --------------------------------------------------------------------------
-- Échéancier de l'élève (UC-K03) — généré à l'inscription
-- --------------------------------------------------------------------------
CREATE TABLE echeances (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inscription_id      UUID NOT NULL REFERENCES inscriptions(id) ON DELETE CASCADE,
    tranche_id          UUID REFERENCES tranches(id) ON DELETE SET NULL,
    nature              nature_frais NOT NULL,
    libelle             TEXT NOT NULL,
    montant_du_fcfa     INTEGER NOT NULL CHECK (montant_du_fcfa >= 0),
    montant_paye_fcfa   INTEGER NOT NULL DEFAULT 0 CHECK (montant_paye_fcfa >= 0),
    -- Remise ou exonération appliquée (UC-K09)
    montant_exonere_fcfa INTEGER NOT NULL DEFAULT 0 CHECK (montant_exonere_fcfa >= 0),
    date_limite         DATE NOT NULL,
    statut              statut_echeance NOT NULL DEFAULT 'A_PAYER',
    -- Relances déjà envoyées (UC-K08)
    nb_relances         SMALLINT NOT NULL DEFAULT 0,
    derniere_relance_le TIMESTAMPTZ,
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    modifie_le          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_paye_coherent CHECK (montant_paye_fcfa + montant_exonere_fcfa <= montant_du_fcfa)
);

CREATE INDEX idx_echeances_inscription ON echeances(inscription_id);
CREATE INDEX idx_echeances_statut ON echeances(statut, date_limite);
-- Liste des impayés (UC-K07)
CREATE INDEX idx_echeances_impayees ON echeances(date_limite)
    WHERE statut IN ('A_PAYER', 'PARTIEL', 'EN_RETARD');

-- --------------------------------------------------------------------------
-- Paiements encaissés (UC-K04)
--
-- Un paiement n'est jamais modifié ni supprimé : une erreur se corrige par
-- une écriture d'annulation. C'est la règle comptable de base.
-- --------------------------------------------------------------------------
CREATE TABLE paiements (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inscription_id      UUID NOT NULL REFERENCES inscriptions(id) ON DELETE RESTRICT,
    echeance_id         UUID REFERENCES echeances(id) ON DELETE SET NULL,
    numero_recu         TEXT NOT NULL UNIQUE,   -- 'REC-2026-00001'
    montant_fcfa        INTEGER NOT NULL CHECK (montant_fcfa <> 0),
    mode                mode_paiement NOT NULL,
    -- Référence externe : numéro de transaction Mobile Money, n° de chèque
    reference_externe   TEXT,
    date_paiement       DATE NOT NULL DEFAULT CURRENT_DATE,
    -- Qui a payé
    paye_par_tuteur_id  UUID REFERENCES tuteurs(id) ON DELETE SET NULL,
    nom_payeur          TEXT,
    -- Écriture d'annulation : montant négatif pointant sur le paiement annulé
    annule              BOOLEAN NOT NULL DEFAULT FALSE,
    annule_paiement_id  UUID REFERENCES paiements(id),
    motif_annulation    TEXT,
    observations        TEXT,
    encaisse_par        UUID REFERENCES utilisateurs(id),
    recu_url            TEXT,                   -- PDF du reçu (UC-K05)
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_paiements_inscription ON paiements(inscription_id, date_paiement DESC);
CREATE INDEX idx_paiements_date ON paiements(date_paiement DESC);
CREATE INDEX idx_paiements_recu ON paiements(numero_recu);

-- --------------------------------------------------------------------------
-- Exonérations et remises (UC-K09)
-- --------------------------------------------------------------------------
CREATE TYPE motif_exoneration AS ENUM (
    'BOURSE', 'FRATRIE', 'CAS_SOCIAL', 'ENFANT_PERSONNEL', 'MERITE', 'AUTRE'
);

CREATE TABLE exonerations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inscription_id      UUID NOT NULL REFERENCES inscriptions(id) ON DELETE CASCADE,
    nature              nature_frais,           -- NULL = toutes natures
    motif               motif_exoneration NOT NULL,
    justification       TEXT NOT NULL,
    -- Soit un pourcentage, soit un montant fixe
    pourcentage         NUMERIC(5,2) CHECK (pourcentage > 0 AND pourcentage <= 100),
    montant_fcfa        INTEGER CHECK (montant_fcfa > 0),
    accorde_par         UUID REFERENCES utilisateurs(id),
    date_accord         DATE NOT NULL DEFAULT CURRENT_DATE,
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_exoneration_valeur CHECK (
        (pourcentage IS NOT NULL AND montant_fcfa IS NULL)
        OR (pourcentage IS NULL AND montant_fcfa IS NOT NULL)
    )
);

-- --------------------------------------------------------------------------
-- Vue : situation financière d'un élève (UC-K06)
-- Consommée par le web (comptabilité) et par l'app parent.
-- --------------------------------------------------------------------------
CREATE VIEW v_situation_financiere AS
SELECT
    e.inscription_id,
    SUM(e.montant_du_fcfa)                          AS total_du_fcfa,
    SUM(e.montant_paye_fcfa)                        AS total_paye_fcfa,
    SUM(e.montant_exonere_fcfa)                     AS total_exonere_fcfa,
    SUM(e.montant_du_fcfa - e.montant_paye_fcfa - e.montant_exonere_fcfa) AS reste_du_fcfa,
    COUNT(*) FILTER (WHERE e.statut = 'EN_RETARD')  AS nb_echeances_en_retard,
    MIN(e.date_limite) FILTER (
        WHERE e.statut IN ('A_PAYER', 'PARTIEL', 'EN_RETARD')
    )                                               AS prochaine_echeance
FROM echeances e
GROUP BY e.inscription_id;

-- --------------------------------------------------------------------------
-- Mise à jour automatique du statut d'une échéance après encaissement
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_maj_statut_echeance() RETURNS TRIGGER AS $$
DECLARE
    v_restant INTEGER;
BEGIN
    v_restant := NEW.montant_du_fcfa - NEW.montant_paye_fcfa - NEW.montant_exonere_fcfa;

    IF v_restant <= 0 THEN
        NEW.statut := CASE
            WHEN NEW.montant_exonere_fcfa >= NEW.montant_du_fcfa THEN 'EXONERE'
            ELSE 'PAYE'
        END;
    ELSIF NEW.montant_paye_fcfa > 0 THEN
        NEW.statut := CASE
            WHEN NEW.date_limite < CURRENT_DATE THEN 'EN_RETARD'
            ELSE 'PARTIEL'
        END;
    ELSE
        NEW.statut := CASE
            WHEN NEW.date_limite < CURRENT_DATE THEN 'EN_RETARD'
            ELSE 'A_PAYER'
        END;
    END IF;

    NEW.modifie_le := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER echeances_maj_statut
    BEFORE INSERT OR UPDATE OF montant_paye_fcfa, montant_exonere_fcfa, date_limite
    ON echeances
    FOR EACH ROW EXECUTE FUNCTION trg_maj_statut_echeance();
