-- =============================================================================
-- 0018 — Évaluations et notes : cycle de vie, verrouillage, intégrité.
--
-- Couvre les §19 et §20 du cahier des charges.
-- =============================================================================

-- --------------------------------------------------------------------------
-- Cycle de vie d'une évaluation
--
-- Une évaluation n'existe pas d'un coup : elle est préparée, programmée,
-- passée, corrigée, puis ses notes sont publiées aux familles. Sans cet état,
-- impossible de distinguer « le professeur n'a pas encore saisi » de « la
-- classe a eu 0 » — distinction pourtant essentielle avant un conseil.
-- --------------------------------------------------------------------------
CREATE TYPE statut_evaluation AS ENUM (
    'BROUILLON',    -- en préparation, invisible des autres
    'PROGRAMMEE',   -- annoncée, visible des familles au calendrier
    'PASSEE',       -- l'épreuve a eu lieu, correction en cours
    'CORRIGEE',     -- toutes les notes sont saisies
    'PUBLIEE',      -- notes visibles des familles
    'ANNULEE'
);

ALTER TABLE evaluations
    ADD COLUMN IF NOT EXISTS statut          statut_evaluation NOT NULL DEFAULT 'BROUILLON',
    ADD COLUMN IF NOT EXISTS duree_minutes   SMALLINT CHECK (duree_minutes > 0),
    ADD COLUMN IF NOT EXISTS publiee_le      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS publiee_par     UUID REFERENCES utilisateurs(id);

CREATE INDEX IF NOT EXISTS idx_evaluations_statut
    ON evaluations(classe_id, statut) WHERE statut <> 'PUBLIEE';

-- --------------------------------------------------------------------------
-- Une note ne peut pas dépasser le barème de son évaluation
--
-- La contrainte de 0004 vérifiait seulement `valeur >= 0`. Rien n'empêchait
-- de saisir 25 sur un barème de 20 — faute de frappe banale qui fausse
-- silencieusement toute une moyenne.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_controler_note() RETURNS TRIGGER AS $$
DECLARE
    v_bareme        NUMERIC(5,2);
    v_verrouillee   BOOLEAN;
    v_periode_bloq  BOOLEAN;
    v_titre         TEXT;
BEGIN
    SELECT e.bareme, e.est_verrouillee, p.est_verrouillee, e.titre
      INTO v_bareme, v_verrouillee, v_periode_bloq, v_titre
      FROM evaluations e
      JOIN periodes p ON p.id = e.periode_id
     WHERE e.id = NEW.evaluation_id;

    IF NEW.valeur IS NOT NULL AND NEW.valeur > v_bareme THEN
        RAISE EXCEPTION 'Note % supérieure au barème de l''évaluation « % » (/%).',
            NEW.valeur, v_titre, v_bareme
            USING ERRCODE = 'check_violation';
    END IF;

    -- Le verrou de période est la garantie qu'un bulletin publié ne change
    -- plus. Il prime sur toute autorisation applicative.
    IF COALESCE(v_periode_bloq, FALSE) THEN
        RAISE EXCEPTION 'La période est verrouillée : les notes ne sont plus modifiables.'
            USING ERRCODE = 'check_violation';
    END IF;

    IF COALESCE(v_verrouillee, FALSE) THEN
        RAISE EXCEPTION 'L''évaluation « % » est verrouillée.', v_titre
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notes_controle ON notes;
CREATE TRIGGER notes_controle
    BEFORE INSERT OR UPDATE OF valeur, statut ON notes
    FOR EACH ROW EXECUTE FUNCTION trg_controler_note();

-- --------------------------------------------------------------------------
-- Une note appartient forcément à un élève de la classe évaluée
--
-- Sans ce contrôle, une erreur d'identifiant pouvait rattacher la note d'un
-- élève de Terminale à une composition de 6ème, sans que rien ne le signale.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_note_meme_classe() RETURNS TRIGGER AS $$
DECLARE
    v_classe_eval UUID;
    v_classe_insc UUID;
BEGIN
    SELECT classe_id INTO v_classe_eval FROM evaluations WHERE id = NEW.evaluation_id;
    SELECT classe_id INTO v_classe_insc FROM inscriptions WHERE id = NEW.inscription_id;

    IF v_classe_eval IS DISTINCT FROM v_classe_insc THEN
        RAISE EXCEPTION 'Cet élève n''appartient pas à la classe évaluée.'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notes_meme_classe ON notes;
CREATE TRIGGER notes_meme_classe
    BEFORE INSERT ON notes
    FOR EACH ROW EXECUTE FUNCTION trg_note_meme_classe();

-- --------------------------------------------------------------------------
-- Vue : avancement de la saisie
--
-- Répond à la question posée avant chaque conseil de classe : qui n'a pas
-- encore saisi ses notes ? Sans elle, il faut ouvrir chaque matière une à une.
-- --------------------------------------------------------------------------
CREATE VIEW v_avancement_saisie AS
SELECT
    e.id                AS evaluation_id,
    e.titre,
    e.type,
    e.date_evaluation,
    e.statut,
    e.classe_id,
    c.libelle           AS classe,
    e.matiere_id,
    m.libelle           AS matiere,
    e.periode_id,
    en.id               AS enseignant_id,
    en.nom              AS enseignant_nom,
    (SELECT count(*) FROM inscriptions i
      WHERE i.classe_id = e.classe_id AND i.active)                 AS effectif,
    (SELECT count(*) FROM notes n WHERE n.evaluation_id = e.id)     AS nb_saisies,
    (SELECT count(*) FROM notes n
      WHERE n.evaluation_id = e.id AND n.statut = 'NOTEE')          AS nb_notees
FROM evaluations e
JOIN classes c   ON c.id = e.classe_id
JOIN matieres m  ON m.id = e.matiere_id
LEFT JOIN enseignants en ON en.id = e.enseignant_id;

COMMENT ON VIEW v_avancement_saisie IS
    'Avancement de la saisie des notes par évaluation — préparation des conseils de classe.';
