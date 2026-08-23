-- ---------------------------------------------------------------------------
-- 0025 — Regroupement des matières sur le bulletin
--
-- POURQUOI
-- --------
-- Le bulletin de l'établissement — celui qu'il imprime réellement — ne liste
-- pas les matières à plat. Il les regroupe en trois blocs, chacun suivi de sa
-- propre moyenne :
--
--     Matières littéraires ......... Français, Arabe, Anglais, Histoire, Géo
--     Moyenne des Matières Littéraires        14 (coeff)      9,64
--
--     Matières scientifiques ....... Maths, Physique-Chimie, S.V.T
--     Moyenne des Matières Scientifiques       8              9,88
--
--     Matières complémentaires ..... Éducation islamique, Conduite
--     Moyenne des Matières Complémentaires     3             13,67
--
--     Total                                   25            255,00
--
-- Ce regroupement n'est pas cosmétique : c'est sur la moyenne littéraire ou
-- scientifique que le conseil de classe fonde une orientation en série A ou D.
-- Sans lui, le bulletin produit par le portail ne serait pas celui que
-- l'établissement remet aux familles, et il faudrait continuer à le recopier à
-- la main.
--
-- POURQUOI UNE COLONNE ET NON UNE TABLE
-- --------------------------------------
-- Une matière appartient à un et un seul bloc, et la liste des blocs ne change
-- pas d'une année à l'autre. Une table de rattachement ajouterait une jointure
-- à chaque bulletin pour modéliser une relation qui n'a jamais varié.
-- ---------------------------------------------------------------------------

CREATE TYPE groupe_bulletin AS ENUM ('LITTERAIRE', 'SCIENTIFIQUE', 'COMPLEMENTAIRE');

ALTER TABLE matieres
    ADD COLUMN groupe_bulletin groupe_bulletin NOT NULL DEFAULT 'COMPLEMENTAIRE';

COMMENT ON COLUMN matieres.groupe_bulletin IS
    'Bloc du bulletin imprime. Chaque bloc porte sa propre moyenne, sur laquelle le conseil fonde une orientation.';

-- ---------------------------------------------------------------------------
-- Rattachement des matières existantes
--
-- Le défaut est COMPLEMENTAIRE — le bloc le moins engageant : une matière
-- oubliée apparaîtra au bulletin sans fausser la moyenne littéraire ni la
-- moyenne scientifique, qui décident d'une orientation.
-- ---------------------------------------------------------------------------
UPDATE matieres SET groupe_bulletin = 'LITTERAIRE'
 WHERE code IN ('FR', 'AR', 'ANG', 'HG', 'PHILO');

UPDATE matieres SET groupe_bulletin = 'SCIENTIFIQUE'
 WHERE code IN ('MATH', 'PC', 'SVT', 'INFO');

UPDATE matieres SET groupe_bulletin = 'COMPLEMENTAIRE'
 WHERE code IN ('ECM', 'EPS', 'ECO', 'COMPTA');

-- ---------------------------------------------------------------------------
-- Vue de contrôle
--
-- Le rattachement se vérifie d'un coup d'œil plutôt qu'en relisant treize
-- lignes d'UPDATE. Une matière au mauvais bloc décale une moyenne
-- d'orientation, et cela ne se voit qu'au conseil de classe.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_matieres_bulletin AS
SELECT groupe_bulletin,
       count(*)                              AS nb_matieres,
       string_agg(libelle, ', ' ORDER BY ordre_bulletin, libelle) AS matieres
  FROM matieres
 WHERE active
 GROUP BY groupe_bulletin;

COMMENT ON VIEW v_matieres_bulletin IS
    'Repartition des matieres actives entre les trois blocs du bulletin.';
