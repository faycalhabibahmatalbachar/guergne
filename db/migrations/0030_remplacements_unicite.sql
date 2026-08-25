-- ---------------------------------------------------------------------------
-- 0030 — Un seul remplacement par cours et par date (E-49)
-- ---------------------------------------------------------------------------
-- La table `remplacements` est déclarée depuis 0015 et n'a jamais été branchée.
-- En la mettant en service, il manque la contrainte qui empêche de déclarer
-- deux fois le même cours le même jour.
--
-- POURQUOI C'EST PLUS QU'UNE PROPRETÉ DE BASE
-- --------------------------------------------
-- Le suivi de l'absentéisme enseignant compte des lignes. Sans unicité, un
-- censeur qui corrige sa saisie — il s'était trompé de remplaçant — ajoute une
-- seconde ligne au lieu de rectifier la première, et le professeur absent une
-- fois en compte deux. Le bilan de fin de trimestre devient une accusation
-- fausse.
--
-- L'unicité porte sur (cours, date) et non sur (professeur, date) : un
-- professeur absent toute la journée manque quatre cours distincts, qui se
-- remplacent séparément et peuvent l'être par quatre collègues différents.
--
-- INDEX PARTIEL, PARCE QUE `emploi_du_temps_id` EST NULLABLE
-- -----------------------------------------------------------
-- La colonne est en ON DELETE SET NULL : supprimer un cours de la grille ne
-- doit pas effacer l'historique des heures perdues. Ces lignes orphelines
-- restent hors de la contrainte — deux NULL ne sont de toute façon pas égaux
-- en SQL, mais l'index partiel le dit explicitement et reste plus petit.

CREATE UNIQUE INDEX IF NOT EXISTS uq_remplacement_cours_date
    ON remplacements (emploi_du_temps_id, date_cours)
    WHERE emploi_du_temps_id IS NOT NULL;
