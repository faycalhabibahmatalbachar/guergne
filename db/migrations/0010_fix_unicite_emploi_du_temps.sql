-- =============================================================================
-- 0010 — Correctif : unicité des créneaux d'emploi du temps.
--
-- PROBLÈME DÉTECTÉ (test de bout en bout sur base réelle)
-- La contrainte de 0003 :
--     UNIQUE (annee_id, classe_id, jour_semaine, creneau_id, semaine_type)
-- ne bloquait PAS deux cours de la même classe sur le même créneau.
--
-- Cause : en PostgreSQL, deux NULL sont considérés comme DISTINCTS dans une
-- contrainte d'unicité. Or `semaine_type` vaut NULL dans le cas nominal
-- (établissement sans alternance semaine A / semaine B) — c'est-à-dire le cas
-- de LOIN le plus fréquent. La contrainte ne servait donc jamais.
--
-- Les index sur l'enseignant et la salle, eux, utilisaient déjà
-- COALESCE(semaine_type, '*') et fonctionnaient correctement.
--
-- CORRECTIF : `NULLS NOT DISTINCT` (PostgreSQL 15+) traite deux NULL comme
-- égaux, ce qui rétablit le comportement attendu.
-- =============================================================================

-- Le nom auto-généré est tronqué à 63 caractères par PostgreSQL et n'est donc
-- pas prévisible : on retrouve la contrainte par ses colonnes.
DO $$
DECLARE
    v_nom TEXT;
BEGIN
    SELECT con.conname INTO v_nom
      FROM pg_constraint con
     WHERE con.conrelid = 'emploi_du_temps'::regclass
       AND con.contype  = 'u'
       AND con.conkey @> ARRAY[
             (SELECT attnum FROM pg_attribute
               WHERE attrelid = 'emploi_du_temps'::regclass AND attname = 'classe_id'),
             (SELECT attnum FROM pg_attribute
               WHERE attrelid = 'emploi_du_temps'::regclass AND attname = 'creneau_id')
           ]::smallint[]
     LIMIT 1;

    IF v_nom IS NOT NULL THEN
        EXECUTE format('ALTER TABLE emploi_du_temps DROP CONSTRAINT %I', v_nom);
    END IF;
END $$;

ALTER TABLE emploi_du_temps
    ADD CONSTRAINT uq_edt_classe_creneau
    UNIQUE NULLS NOT DISTINCT (annee_id, classe_id, jour_semaine, creneau_id, semaine_type);

COMMENT ON CONSTRAINT uq_edt_classe_creneau ON emploi_du_temps IS
    'Une classe ne peut avoir deux cours sur le même créneau. NULLS NOT DISTINCT '
    'est indispensable : semaine_type est NULL quand l''établissement n''alterne pas.';
