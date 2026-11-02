-- ---------------------------------------------------------------------------
-- 0039 — Recherche d'élèves sans accents, et détection des doublons (P0)
-- ---------------------------------------------------------------------------
-- La liste des élèves cherchait avec un ILIKE brut sur un seul motif collé :
-- « Benedicte » ne trouvait pas « Bénédicte », et « Mahamat Ali » ne trouvait
-- rien du tout, le nom et le prénom étant dans deux colonnes. La requête
-- découpe désormais la saisie en mots et compare `unaccent()` des deux côtés,
-- comme le fait déjà la palette de recherche globale (migration 0032).
--
-- CE QUE CETTE MIGRATION PEUT INDEXER, ET CE QU'ELLE REFUSE D'INDEXER
-- -------------------------------------------------------------------
-- `unaccent()` n'est pas IMMUTABLE : son dictionnaire est un fichier, pas une
-- constante. On ne peut donc pas l'employer dans un index fonctionnel sans
-- l'envelopper dans une fonction qui MENTIRAIT sur son immutabilité — et un
-- index bâti sur un mensonge devient silencieusement faux le jour où le
-- dictionnaire change. La migration 0032 a tranché : on l'accepte, le fichier
-- compte quelques centaines d'élèves et un parcours séquentiel y est
-- instantané. Cette migration ne revient pas sur ce choix.
--
-- Restent les index qui sont, eux, exacts :
--
-- 1. Le matricule est comparé SANS `unaccent` — il ne porte pas d'accent. Un
--    index trigramme le rend donc utilisable pour un `ILIKE '%...%'`, qui est
--    la forme que prend la recherche d'un reçu dont le parent ne lit qu'un
--    fragment.
-- 2. La date de naissance devient un critère de lecture à chaque inscription
--    manuelle : la détection de doublon ramène les élèves nés le même jour,
--    puis compare les identités normalisées en mémoire. Sans index, chaque
--    inscription relirait la table entière.

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_eleves_matricule_trgm
  ON eleves USING gin (matricule gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_eleves_date_naissance
  ON eleves (date_naissance);
