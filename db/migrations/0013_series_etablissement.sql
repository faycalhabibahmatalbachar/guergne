-- =============================================================================
-- 0013 — Séries réellement utilisées par le Lycée Guergné La Renaissance.
--
-- Le référentiel initial (0009) reprenait la nomenclature large du secondaire
-- tchadien (A1, A4, C, D, G). L'établissement fonctionne en réalité ainsi :
--     2nde       : indifférenciée (« 2nde U »), série facultative
--     1ère       : S (scientifique) ou L (littéraire)
--     Terminale  : A (littéraire) ou D (scientifique)
--
-- On ajoute donc S, L et A. On ne SUPPRIME rien : C, G et A1/A4 restent
-- disponibles si une filière ouvre plus tard, et sont simplement désactivables
-- depuis l'écran Paramètres (colonne `active`).
--
-- La série reste facultative sur une classe (`classes.serie_id` est nullable),
-- ce qui couvre la 2nde indifférenciée et tout le collège.
-- =============================================================================

INSERT INTO series (code, libelle, description, ordre, active) VALUES
    ('S', 'Série S — Scientifique',  'Première scientifique',  1, TRUE),
    ('L', 'Série L — Littéraire',    'Première littéraire',    2, TRUE),
    ('A', 'Série A — Littéraire',    'Terminale littéraire',   3, TRUE)
ON CONFLICT (code) DO NOTHING;

-- Réordonnancement pour que l'écran de saisie présente les séries dans l'ordre
-- où l'établissement les utilise réellement.
UPDATE series SET ordre = 4 WHERE code = 'D';
UPDATE series SET ordre = 5 WHERE code = 'C';
UPDATE series SET ordre = 6 WHERE code = 'G';
UPDATE series SET ordre = 7, active = FALSE WHERE code IN ('A1', 'A4');

-- --------------------------------------------------------------------------
-- Volume horaire hebdomadaire par matière : présent dans le cahier des
-- charges (§11) mais absent du modèle initial.
-- --------------------------------------------------------------------------
ALTER TABLE coefficients
    ADD COLUMN IF NOT EXISTS volume_horaire NUMERIC(4,1);

COMMENT ON COLUMN coefficients.volume_horaire IS
    'Heures hebdomadaires de la matière pour ce niveau et cette série.';

-- --------------------------------------------------------------------------
-- Statut « CANDIDAT » : première étape du parcours d'inscription
-- (Candidat → Préinscrit → Inscrit), demandé au §7 du cahier des charges.
-- Et « ARCHIVE », état terminal après clôture définitive du dossier.
-- --------------------------------------------------------------------------
ALTER TYPE statut_eleve ADD VALUE IF NOT EXISTS 'CANDIDAT' BEFORE 'PRE_INSCRIT';
ALTER TYPE statut_eleve ADD VALUE IF NOT EXISTS 'ARCHIVE';
