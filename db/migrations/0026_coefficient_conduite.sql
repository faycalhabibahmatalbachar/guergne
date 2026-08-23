-- ---------------------------------------------------------------------------
-- 0026 — Coefficient de la conduite
--
-- POURQUOI
-- --------
-- Sur le bulletin de l'établissement, la conduite est une LIGNE NOTÉE au même
-- titre qu'une matière : note sur 20, coefficient 2, points au total général.
-- Dans l'exemplaire fourni, elle pèse 30 points sur les 41 du bloc des
-- matières complémentaires — c'est la note la plus lourde de ce bloc.
--
-- Or elle ne vit pas dans `matieres` mais dans `notes_conduite`, qui n'a pas
-- de colonne `coefficient`. Le bulletin l'ignorait donc entièrement, et la
-- moyenne des matières complémentaires était fausse.
--
-- Un paramètre plutôt qu'une colonne : le coefficient de la conduite est une
-- règle de l'établissement, identique pour tous les élèves et toutes les
-- classes. Le porter sur chaque ligne de `notes_conduite` reviendrait à le
-- recopier mille six cent quarante-sept fois, et à permettre qu'il diverge.
-- ---------------------------------------------------------------------------

INSERT INTO parametres (cle, valeur, description) VALUES
    ('coefficient_conduite', '2',
     'Coefficient de la note de conduite au bulletin. Zero pour l''exclure du calcul.')
ON CONFLICT DO NOTHING;
