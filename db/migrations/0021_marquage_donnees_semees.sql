-- =============================================================================
-- 0021 — Marquage des données semées.
--
-- Le peuplement automatique crée un établissement complet et cohérent, ce qui
-- rend l'application démontrable et testable. Mais ces enregistrements ne sont
-- PAS des données saisies par l'établissement : les confondre serait la porte
-- ouverte à des bulletins imprimés pour des élèves qui n'existent pas.
--
-- Un drapeau explicite permet de les retirer d'une commande, sans jamais
-- toucher à ce qui a été saisi à la main.
-- =============================================================================

ALTER TABLE eleves       ADD COLUMN IF NOT EXISTS donnees_semees BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE enseignants  ADD COLUMN IF NOT EXISTS donnees_semees BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tuteurs      ADD COLUMN IF NOT EXISTS donnees_semees BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE classes      ADD COLUMN IF NOT EXISTS donnees_semees BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE salles       ADD COLUMN IF NOT EXISTS donnees_semees BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE annonces     ADD COLUMN IF NOT EXISTS donnees_semees BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS donnees_semees BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN eleves.donnees_semees IS
    'Enregistrement créé par le peuplement automatique. `npm run db:purger` le retire.';

-- Index partiels : la purge et les statistiques ne parcourent que les lignes
-- concernées, qui sont l'exception une fois l'établissement en production.
CREATE INDEX IF NOT EXISTS idx_eleves_semees      ON eleves(id)      WHERE donnees_semees;
CREATE INDEX IF NOT EXISTS idx_enseignants_semees ON enseignants(id) WHERE donnees_semees;
CREATE INDEX IF NOT EXISTS idx_classes_semees     ON classes(id)     WHERE donnees_semees;

-- --------------------------------------------------------------------------
-- Contrainte d'unicité manquante sur les coefficients
--
-- Le peuplement rejoue la grille pour chaque classe d'un même niveau : sans
-- `ON CONFLICT` fonctionnel, la 6ème B dupliquait les coefficients de la 6ème A
-- et la moyenne générale se retrouvait divisée par un dénominateur doublé.
-- L'index unique de 0001 couvrait bien le cas, mais `ON CONFLICT DO NOTHING`
-- sans cible ne s'y accroche pas de façon fiable : on nomme la contrainte.
-- --------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_coefficient_nomme
    ON coefficients (annee_id, matiere_id, niveau_id,
                     COALESCE(serie_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Idem pour les tranches, rejouées à chaque exécution du peuplement.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tranche_annee_numero
    ON tranches (annee_id, numero);

-- Et pour la grille tarifaire : une même nature ne doit exister qu'une fois
-- par couple (année, niveau).
CREATE UNIQUE INDEX IF NOT EXISTS uq_tarif_annee_niveau_nature
    ON grilles_tarifaires (annee_id, niveau_id, nature);
