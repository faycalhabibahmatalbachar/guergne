-- =============================================================================
-- 0019 — Finances : intégrité comptable, génération d'échéancier, recouvrement.
--
-- RAPPEL : tous les montants sont des ENTIERS en FCFA. Le franc CFA n'a pas de
-- subdivision utilisée ; un flottant introduirait des erreurs d'arrondi sur des
-- sommes qui doivent tomber juste au centime près.
-- =============================================================================

-- --------------------------------------------------------------------------
-- Un paiement ne peut pas dépasser le reste dû de son échéance
--
-- Le déclencheur de 0006 recalculait le statut, mais rien n'empêchait
-- d'imputer 200 000 F sur une échéance de 150 000 F : le trop-perçu
-- disparaissait silencieusement et la comptabilité devenait fausse.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_controler_paiement() RETURNS TRIGGER AS $$
DECLARE
    v_du        INTEGER;
    v_paye      INTEGER;
    v_exonere   INTEGER;
    v_reste     INTEGER;
    v_libelle   TEXT;
BEGIN
    -- Une écriture d'annulation (montant négatif) n'est pas contrôlée ici :
    -- elle vient corriger une erreur, pas encaisser.
    IF NEW.montant_fcfa <= 0 OR NEW.echeance_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT montant_du_fcfa, montant_paye_fcfa, montant_exonere_fcfa, libelle
      INTO v_du, v_paye, v_exonere, v_libelle
      FROM echeances WHERE id = NEW.echeance_id;

    v_reste := v_du - v_paye - v_exonere;

    IF NEW.montant_fcfa > v_reste THEN
        RAISE EXCEPTION
            'Montant supérieur au reste dû sur « % » : % F encaissés pour % F restants.',
            v_libelle, NEW.montant_fcfa, v_reste
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS paiements_controle ON paiements;
CREATE TRIGGER paiements_controle
    BEFORE INSERT ON paiements
    FOR EACH ROW EXECUTE FUNCTION trg_controler_paiement();

-- --------------------------------------------------------------------------
-- Report automatique du paiement sur l'échéance
--
-- Sans cela, l'encaissement et la mise à jour du solde étaient deux écritures
-- distinctes que l'application devait penser à faire toutes les deux. Un oubli
-- dans un seul chemin de code, et l'élève apparaît débiteur alors qu'il a payé.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_imputer_paiement() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.echeance_id IS NULL THEN
        RETURN NEW;
    END IF;

    UPDATE echeances
       SET montant_paye_fcfa = montant_paye_fcfa + NEW.montant_fcfa
     WHERE id = NEW.echeance_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS paiements_imputation ON paiements;
CREATE TRIGGER paiements_imputation
    AFTER INSERT ON paiements
    FOR EACH ROW EXECUTE FUNCTION trg_imputer_paiement();

-- --------------------------------------------------------------------------
-- Un paiement encaissé n'est jamais supprimé
--
-- Règle comptable de base : une erreur se corrige par une écriture
-- d'annulation, pas par un effacement. Supprimer une ligne de caisse rend
-- tout rapprochement impossible et ouvre la porte au détournement.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_paiement_non_supprimable() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION
        'Un paiement ne se supprime pas. Enregistrez une écriture d''annulation.'
        USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS paiements_pas_de_delete ON paiements;
CREATE TRIGGER paiements_pas_de_delete
    BEFORE DELETE ON paiements
    FOR EACH ROW EXECUTE FUNCTION trg_paiement_non_supprimable();

-- --------------------------------------------------------------------------
-- Vue : recouvrement par classe
--
-- Le comptable et la direction ont besoin de savoir où en est la collecte,
-- classe par classe, pas élève par élève.
-- --------------------------------------------------------------------------
CREATE VIEW v_recouvrement_classe AS
SELECT
    c.id                                    AS classe_id,
    c.libelle                               AS classe,
    c.annee_id,
    count(DISTINCT i.id)                    AS effectif,
    COALESCE(SUM(e.montant_du_fcfa), 0)     AS total_du_fcfa,
    COALESCE(SUM(e.montant_paye_fcfa), 0)   AS total_paye_fcfa,
    COALESCE(SUM(e.montant_exonere_fcfa), 0) AS total_exonere_fcfa,
    COALESCE(SUM(e.montant_du_fcfa - e.montant_paye_fcfa - e.montant_exonere_fcfa), 0)
                                            AS reste_du_fcfa,
    count(DISTINCT i.id) FILTER (
        WHERE EXISTS (
            SELECT 1 FROM echeances x
             WHERE x.inscription_id = i.id
               AND x.statut = 'EN_RETARD'
        )
    )                                       AS nb_eleves_en_retard
FROM classes c
LEFT JOIN inscriptions i ON i.classe_id = c.id AND i.active
LEFT JOIN echeances e    ON e.inscription_id = i.id
GROUP BY c.id;

COMMENT ON VIEW v_recouvrement_classe IS
    'État de la collecte des frais, classe par classe.';

-- --------------------------------------------------------------------------
-- Rafraîchissement quotidien du statut « en retard »
--
-- Le statut d'une échéance était figé à sa dernière écriture : une échéance
-- non payée dont la date limite passe restait « à payer » indéfiniment.
-- Cette fonction est appelée par la sonde de santé, une fois par jour.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rafraichir_echeances_en_retard() RETURNS INTEGER AS $$
DECLARE
    v_nb INTEGER;
BEGIN
    UPDATE echeances
       SET statut = 'EN_RETARD'
     WHERE date_limite < CURRENT_DATE
       AND statut IN ('A_PAYER', 'PARTIEL')
       AND montant_du_fcfa > montant_paye_fcfa + montant_exonere_fcfa;

    GET DIAGNOSTICS v_nb = ROW_COUNT;
    RETURN v_nb;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION rafraichir_echeances_en_retard IS
    'Bascule en EN_RETARD les échéances dont la date limite est dépassée.';

-- --------------------------------------------------------------------------
-- Index de travail du comptable
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_paiements_annules
    ON paiements(annule_paiement_id) WHERE annule_paiement_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_echeances_relance
    ON echeances(derniere_relance_le) WHERE statut IN ('A_PAYER', 'PARTIEL', 'EN_RETARD');
