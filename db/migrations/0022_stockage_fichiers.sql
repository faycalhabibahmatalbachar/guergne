-- =============================================================================
-- 0022 — Stockage des fichiers : photos d'élèves, pièces du dossier, logo.
--
-- CHOIX DE STOCKAGE
-- Le plan initial visait Cloudflare R2 (10 Go gratuits). Son ouverture exige
-- une inscription et une carte bancaire, donc une intervention humaine — ce
-- qui bloquerait la fonctionnalité pour une durée indéterminée.
--
-- On stocke donc en base, avec deux garde-fous qui rendent le choix tenable :
--   1. Compression WebP côté serveur, plafonnée à 80 ko par image.
--      2 000 élèves × 80 ko = 160 Mo, soit un tiers du quota Neon.
--   2. Table SÉPARÉE des données métier : une sauvegarde `pg_dump` peut
--      exclure `fichiers` et rester légère, et la migration vers un stockage
--      objet ne touchera que cette table.
--
-- L'accès passe par un adaptateur unique (`server/stockage.ts`) : basculer
-- vers R2 le jour où le compte existe ne modifiera qu'un fichier.
-- =============================================================================

CREATE TYPE usage_fichier AS ENUM (
    'PHOTO_ELEVE',
    'PHOTO_ENSEIGNANT',
    'PIECE_DOSSIER',
    'LOGO_ETABLISSEMENT',
    'CACHET_ETABLISSEMENT',
    'PIECE_JOINTE',
    'JUSTIFICATIF'
);

CREATE TABLE fichiers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usage           usage_fichier NOT NULL,
    nom_origine     TEXT NOT NULL,
    mime_type       TEXT NOT NULL,
    taille_octets   INTEGER NOT NULL CHECK (taille_octets > 0),
    largeur         SMALLINT,
    hauteur         SMALLINT,
    contenu         BYTEA NOT NULL,
    /* Empreinte du contenu : deux dépôts du même fichier n'occupent la place
       qu'une fois, ce qui compte quand le quota est de 500 Mo. */
    empreinte       TEXT NOT NULL,
    depose_par      UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_taille_raisonnable CHECK (taille_octets <= 2 * 1024 * 1024)
);

CREATE INDEX idx_fichiers_empreinte ON fichiers(empreinte);
CREATE INDEX idx_fichiers_usage ON fichiers(usage);

COMMENT ON TABLE fichiers IS
    'Stockage binaire. Table séparée pour qu''une sauvegarde puisse l''exclure '
    'et pour qu''une migration vers un stockage objet ne touche qu''elle.';

COMMENT ON COLUMN fichiers.empreinte IS
    'SHA-256 du contenu — déduplique les dépôts identiques.';

-- --------------------------------------------------------------------------
-- Rattachement aux entités
--
-- Les colonnes `photo_url` existantes deviennent des identifiants de fichier.
-- On ne les supprime pas : elles restent utilisables si l'établissement
-- héberge un jour ses images ailleurs et veut y pointer directement.
-- --------------------------------------------------------------------------
ALTER TABLE eleves        ADD COLUMN IF NOT EXISTS photo_id UUID REFERENCES fichiers(id) ON DELETE SET NULL;
ALTER TABLE enseignants   ADD COLUMN IF NOT EXISTS photo_id UUID REFERENCES fichiers(id) ON DELETE SET NULL;
ALTER TABLE etablissement ADD COLUMN IF NOT EXISTS logo_id   UUID REFERENCES fichiers(id) ON DELETE SET NULL;
ALTER TABLE etablissement ADD COLUMN IF NOT EXISTS cachet_id UUID REFERENCES fichiers(id) ON DELETE SET NULL;
ALTER TABLE pieces_dossier ADD COLUMN IF NOT EXISTS fichier_id UUID REFERENCES fichiers(id) ON DELETE CASCADE;

-- `fichier_url` était obligatoire ; désormais une pièce peut vivre en base.
ALTER TABLE pieces_dossier ALTER COLUMN fichier_url DROP NOT NULL;

ALTER TABLE pieces_dossier
    ADD CONSTRAINT chk_piece_a_un_contenu
    CHECK (fichier_url IS NOT NULL OR fichier_id IS NOT NULL);

-- --------------------------------------------------------------------------
-- Suppression des fichiers devenus orphelins
--
-- `ON DELETE SET NULL` détache le fichier mais le laisse en base : sur un
-- quota de 500 Mo, quelques centaines de photos d'élèves partis suffisent à
-- le saturer. Cette fonction est appelée par la sonde de santé.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION purger_fichiers_orphelins() RETURNS INTEGER AS $$
DECLARE
    v_nb INTEGER;
BEGIN
    DELETE FROM fichiers f
     WHERE NOT EXISTS (SELECT 1 FROM eleves e         WHERE e.photo_id = f.id)
       AND NOT EXISTS (SELECT 1 FROM enseignants en   WHERE en.photo_id = f.id)
       AND NOT EXISTS (SELECT 1 FROM etablissement et WHERE et.logo_id = f.id OR et.cachet_id = f.id)
       AND NOT EXISTS (SELECT 1 FROM pieces_dossier p WHERE p.fichier_id = f.id)
       -- On laisse une heure de battement : un fichier tout juste téléversé
       -- n'est pas encore rattaché à son entité.
       AND f.cree_le < now() - interval '1 hour';

    GET DIAGNOSTICS v_nb = ROW_COUNT;
    RETURN v_nb;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION purger_fichiers_orphelins IS
    'Supprime les fichiers rattachés à plus rien depuis plus d''une heure.';
