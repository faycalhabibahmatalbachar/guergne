-- ---------------------------------------------------------------------------
-- 0037 — Traçabilité complète des notes : création, modification, suppression
-- ---------------------------------------------------------------------------
-- `historique_notes` existe depuis 0004 avec cette phrase en commentaire :
-- « Une note modifiée sans trace est une porte ouverte à la fraude. » Elle
-- contient pourtant 0 ligne pour 47 601 notes, et ce n'est pas un hasard :
--
--   1. Le déclencheur ne couvrait que BEFORE UPDATE. Une note CRÉÉE puis
--      SUPPRIMÉE ne laissait rien — or c'est exactement le chemin d'une
--      falsification : on efface la note gênante, on en ressaisit une autre,
--      et l'historique reste vide parce qu'aucune UPDATE n'a eu lieu.
--   2. `note_id` était en ON DELETE CASCADE. Même si une trace avait été
--      écrite, supprimer la note l'aurait emportée avec elle. Un historique
--      qui disparaît avec son objet n'est pas un historique.
--
-- ON NE FABRIQUE AUCUN PASSÉ
-- ---------------------------
-- Les 47 601 notes déjà saisies n'ont pas d'historique et n'en recevront pas.
-- Inventer des lignes « MODIFICATION » datées d'aujourd'hui pour des notes
-- saisies il y a des mois produirait une preuve fausse — pire que l'absence
-- de preuve, parce qu'elle a l'air d'une preuve. La traçabilité commence à
-- l'application de cette migration, et le dire est plus honnête que de
-- combler le trou.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Ce que l'historique doit savoir dire tout seul.
--
-- `operation` : sans elle, une ligne dont l'ancienne valeur est NULL est
-- indistinguable d'une création et d'une modification depuis un statut
-- ABSENT. La question « cette note a-t-elle été supprimée ? » doit avoir une
-- réponse lisible.
--
-- `evaluation_id` et `inscription_id` sont des COPIES, délibérément SANS
-- clé étrangère. C'est tout l'intérêt : la trace doit survivre à la
-- disparition de ce qu'elle désigne. Une référence contrainte ferait
-- échouer l'écriture de la trace au moment même d'une suppression en
-- cascade — c'est-à-dire précisément quand on en a besoin.
-- ---------------------------------------------------------------------------
ALTER TABLE historique_notes
    ADD COLUMN IF NOT EXISTS operation TEXT NOT NULL DEFAULT 'MODIFICATION',
    ADD COLUMN IF NOT EXISTS evaluation_id UUID,
    ADD COLUMN IF NOT EXISTS inscription_id UUID;

ALTER TABLE historique_notes
    DROP CONSTRAINT IF EXISTS chk_historique_operation;
ALTER TABLE historique_notes
    ADD CONSTRAINT chk_historique_operation
        CHECK (operation IN ('CREATION', 'MODIFICATION', 'SUPPRESSION'));

COMMENT ON COLUMN historique_notes.operation IS
    'CREATION, MODIFICATION ou SUPPRESSION. Une ancienne valeur NULL ne suffit pas à distinguer une création d''une modification depuis un statut sans note.';
COMMENT ON COLUMN historique_notes.evaluation_id IS
    'Copie non contrainte de notes.evaluation_id : la trace doit rester lisible après la suppression de la note, voire de l''évaluation.';
COMMENT ON COLUMN historique_notes.inscription_id IS
    'Copie non contrainte de notes.inscription_id, pour savoir de quel élève parlait une trace orpheline.';

-- ---------------------------------------------------------------------------
-- `note_id` devient facultatif, et la suppression de la note le met à NULL
-- au lieu d'emporter la trace.
--
-- Le nom de la contrainte est cherché dans le catalogue plutôt que codé en
-- dur : 0004 l'a laissée nommer par PostgreSQL, et une base recréée par
-- Drizzle pourrait la nommer autrement. Les lignes existantes sont
-- conservées — il n'y en a aucune aujourd'hui, mais une migration qui ne
-- vaut que pour une table vide est une migration qu'on ne peut pas rejouer.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_nom TEXT;
BEGIN
    SELECT con.conname INTO v_nom
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = con.conkey[1]
     WHERE rel.relname = 'historique_notes'
       AND con.contype = 'f'
       AND array_length(con.conkey, 1) = 1
       AND att.attname = 'note_id';

    IF v_nom IS NOT NULL THEN
        EXECUTE format('ALTER TABLE historique_notes DROP CONSTRAINT %I', v_nom);
    END IF;
END $$;

ALTER TABLE historique_notes ALTER COLUMN note_id DROP NOT NULL;

ALTER TABLE historique_notes
    DROP CONSTRAINT IF EXISTS historique_notes_note_id_fkey;
ALTER TABLE historique_notes
    ADD CONSTRAINT historique_notes_note_id_fkey
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL;

COMMENT ON COLUMN historique_notes.note_id IS
    'NULL lorsque la note a été supprimée : la trace lui survit, et operation vaut alors SUPPRESSION sur sa dernière ligne.';

-- Retrouver l'historique d'un élève passe désormais par la copie d'identité,
-- la note pouvant avoir disparu.
CREATE INDEX IF NOT EXISTS idx_historique_notes_identite
    ON historique_notes (inscription_id, evaluation_id, modifie_le DESC);

-- ---------------------------------------------------------------------------
-- Le déclencheur couvre les trois opérations.
--
-- POURQUOI TROIS MOMENTS DIFFÉRENTS
-- ----------------------------------
--   INSERT  : APRÈS. Avant, la note n'existe pas encore et la clé étrangère
--             `note_id` refuserait la trace.
--   UPDATE  : AVANT, comme en 0004, parce que la fonction ajuste `modifie_le`
--             sur la ligne en cours d'écriture.
--   DELETE  : AVANT. La note existe encore, donc la trace peut la référencer ;
--             la suppression qui suit met `note_id` à NULL (ON DELETE SET
--             NULL) et la trace reste.
--
-- `motif` RESTE VIDE ICI, ET CE N'EST PAS UN OUBLI
-- -------------------------------------------------
-- PostgreSQL ne connaît ni l'utilisateur applicatif ni la raison de son
-- geste : aucune variable de session n'est posée par l'application. Le
-- déclencheur garantit qu'AUCUNE écriture n'échappe à la trace, quel que
-- soit le chemin ; le QUI et le POURQUOI sont consignés par
-- `journaliserAtomiquement` dans `journal_audit`, dans la même transaction.
-- Les deux se complètent : l'un ne peut pas être contourné, l'autre sait
-- nommer l'acteur. Faire croire que ce déclencheur connaît le motif serait
-- inventer une preuve.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_journaliser_note() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO historique_notes (
            note_id, evaluation_id, inscription_id, operation,
            ancienne_valeur, nouvelle_valeur, ancien_statut, nouveau_statut, modifie_par
        ) VALUES (
            NEW.id, NEW.evaluation_id, NEW.inscription_id, 'CREATION',
            NULL, NEW.valeur, NULL, NEW.statut, NEW.saisie_par
        );
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        -- `modifie_par` reste NULL : celui qui supprime n'est pas forcément
        -- celui qui avait saisi, et recopier `saisie_par` attribuerait la
        -- suppression à la mauvaise personne. L'acteur est dans journal_audit.
        INSERT INTO historique_notes (
            note_id, evaluation_id, inscription_id, operation,
            ancienne_valeur, nouvelle_valeur, ancien_statut, nouveau_statut, modifie_par
        ) VALUES (
            OLD.id, OLD.evaluation_id, OLD.inscription_id, 'SUPPRESSION',
            OLD.valeur, NULL, OLD.statut, NULL, NULL
        );
        RETURN OLD;
    END IF;

    -- UPDATE : on ne trace que ce qui change la note elle-même. Corriger une
    -- appréciation n'est pas modifier un résultat, et noyer l'historique de
    -- lignes identiques le rendrait illisible au moment d'une contestation.
    IF (OLD.valeur IS DISTINCT FROM NEW.valeur)
       OR (OLD.statut IS DISTINCT FROM NEW.statut) THEN
        INSERT INTO historique_notes (
            note_id, evaluation_id, inscription_id, operation,
            ancienne_valeur, nouvelle_valeur, ancien_statut, nouveau_statut, modifie_par
        ) VALUES (
            NEW.id, NEW.evaluation_id, NEW.inscription_id, 'MODIFICATION',
            OLD.valeur, NEW.valeur, OLD.statut, NEW.statut, NEW.saisie_par
        );
        NEW.modifie_le := now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Le déclencheur de 0004 ne portait que sur UPDATE : on le remplace plutôt
-- que d'en ajouter un second, pour qu'il n'existe qu'un seul endroit où la
-- règle est écrite.
DROP TRIGGER IF EXISTS notes_journalisation ON notes;
CREATE TRIGGER notes_journalisation
    BEFORE UPDATE OR DELETE ON notes
    FOR EACH ROW EXECUTE FUNCTION trg_journaliser_note();

DROP TRIGGER IF EXISTS notes_journalisation_creation ON notes;
CREATE TRIGGER notes_journalisation_creation
    AFTER INSERT ON notes
    FOR EACH ROW EXECUTE FUNCTION trg_journaliser_note();
