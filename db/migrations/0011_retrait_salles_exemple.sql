-- =============================================================================
-- 0011 — Retrait des salles d'exemple.
--
-- La migration 0009 insérait 4 salles fictives (S01, S02, LAB1, INFO1) « à
-- titre d'exemple ». Une donnée inventée qui reste en base finit toujours par
-- être prise pour une donnée réelle : un emploi du temps peut y être rattaché,
-- et personne ne saura plus que la salle n'existe pas physiquement.
--
-- Règle du projet : la base ne contient que du réel. Les salles seront saisies
-- par le secrétariat à partir des locaux effectifs de l'établissement.
--
-- La suppression est conditionnée à l'absence de toute référence, pour ne
-- jamais détruire une salle qui aurait déjà été utilisée.
-- =============================================================================

DELETE FROM salles s
 WHERE s.code IN ('S01', 'S02', 'LAB1', 'INFO1')
   AND NOT EXISTS (SELECT 1 FROM classes c          WHERE c.salle_id = s.id)
   AND NOT EXISTS (SELECT 1 FROM emploi_du_temps e  WHERE e.salle_id = s.id);
