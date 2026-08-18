-- =============================================================================
-- 0002 — Personnes : utilisateurs, authentification, enseignants, élèves,
--        tuteurs et leurs liaisons.
-- =============================================================================

-- --------------------------------------------------------------------------
-- Types
-- --------------------------------------------------------------------------
CREATE TYPE role_utilisateur AS ENUM (
    'SUPER_ADMIN', 'DIRECTION', 'CENSEUR', 'SURVEILLANT',
    'SECRETARIAT', 'COMPTABLE', 'ENSEIGNANT', 'PARENT', 'ELEVE'
);

CREATE TYPE sexe_type AS ENUM ('M', 'F');

CREATE TYPE lien_parente AS ENUM (
    'PERE', 'MERE', 'TUTEUR', 'ONCLE', 'TANTE',
    'GRAND_PARENT', 'FRERE_SOEUR', 'AUTRE'
);

CREATE TYPE statut_eleve AS ENUM (
    'PRE_INSCRIT',          -- dossier en cours de constitution
    'INSCRIT',              -- scolarisé, situation normale
    'SUSPENDU_DISCIPLINE',  -- exclusion temporaire (UC-C01)
    'SUSPENDU_IMPAYE',      -- suspension pour impayés (UC-C04)
    'EXCLU',                -- exclusion définitive (UC-C03)
    'TRANSFERE',            -- parti vers un autre établissement (UC-B07)
    'ABANDON',              -- abandon de scolarité (UC-B09)
    'DIPLOME'               -- a terminé le cycle
);

-- --------------------------------------------------------------------------
-- Utilisateurs (comptes d'accès — personnel, enseignants, parents)
--
-- SÉCURITÉ : le rôle est stocké ICI et nulle part ailleurs. Il n'est jamais
-- lu depuis une source modifiable par le client.
-- --------------------------------------------------------------------------
CREATE TABLE utilisateurs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email               TEXT UNIQUE,
    telephone           TEXT UNIQUE,            -- identifiant principal des parents
    mot_de_passe_hash   TEXT,                   -- Argon2id ; NULL pour les parents (code SMS)
    role                role_utilisateur NOT NULL,
    nom                 TEXT NOT NULL,
    prenom              TEXT NOT NULL,
    photo_url           TEXT,
    actif               BOOLEAN NOT NULL DEFAULT TRUE,
    doit_changer_mdp    BOOLEAN NOT NULL DEFAULT FALSE,
    derniere_connexion  TIMESTAMPTZ,
    -- Anti force brute
    tentatives_echouees SMALLINT NOT NULL DEFAULT 0,
    verrouille_jusqua   TIMESTAMPTZ,
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    modifie_le          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_identifiant CHECK (email IS NOT NULL OR telephone IS NOT NULL)
);

CREATE INDEX idx_utilisateurs_role ON utilisateurs(role) WHERE actif;
CREATE INDEX idx_utilisateurs_telephone ON utilisateurs(telephone) WHERE telephone IS NOT NULL;

-- --------------------------------------------------------------------------
-- Sessions web (révocables instantanément — voir 02-ARCHITECTURE §4.1)
-- --------------------------------------------------------------------------
CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    utilisateur_id  UUID NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    jeton_hash      TEXT NOT NULL UNIQUE,       -- SHA-256 du jeton du cookie
    adresse_ip      INET,
    user_agent      TEXT,
    expire_le       TIMESTAMPTZ NOT NULL,
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_utilisateur ON sessions(utilisateur_id);
CREATE INDEX idx_sessions_expiration ON sessions(expire_le);

-- --------------------------------------------------------------------------
-- Jetons de rafraîchissement (mobile) — usage unique + rotation
-- --------------------------------------------------------------------------
CREATE TABLE jetons_rafraichissement (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    utilisateur_id  UUID NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    jeton_hash      TEXT NOT NULL UNIQUE,
    appareil_id     TEXT,
    revoque         BOOLEAN NOT NULL DEFAULT FALSE,
    -- Chaînage : détecte le rejeu d'un jeton déjà consommé
    remplace_par    UUID REFERENCES jetons_rafraichissement(id),
    expire_le       TIMESTAMPTZ NOT NULL,
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jetons_utilisateur ON jetons_rafraichissement(utilisateur_id) WHERE NOT revoque;

-- --------------------------------------------------------------------------
-- Codes d'activation / connexion par SMS (UC-N06, UC-P01)
-- --------------------------------------------------------------------------
CREATE TABLE codes_activation (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telephone       TEXT NOT NULL,
    code_hash       TEXT NOT NULL,              -- jamais le code en clair
    tentatives      SMALLINT NOT NULL DEFAULT 0,
    consomme        BOOLEAN NOT NULL DEFAULT FALSE,
    expire_le       TIMESTAMPTZ NOT NULL,       -- 10 minutes
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_codes_telephone ON codes_activation(telephone, cree_le DESC);

-- --------------------------------------------------------------------------
-- Enseignants
-- --------------------------------------------------------------------------
CREATE TABLE enseignants (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    utilisateur_id      UUID UNIQUE REFERENCES utilisateurs(id) ON DELETE SET NULL,
    matricule           TEXT NOT NULL UNIQUE,
    nom                 TEXT NOT NULL,
    prenom              TEXT NOT NULL,
    sexe                sexe_type,
    date_naissance      DATE,
    telephone           TEXT,
    email               TEXT,
    adresse             TEXT,
    diplome             TEXT,
    specialite          TEXT,
    date_embauche       DATE,
    type_contrat        TEXT,               -- 'PERMANENT', 'VACATAIRE', 'CONTRACTUEL'
    photo_url           TEXT,
    actif               BOOLEAN NOT NULL DEFAULT TRUE,
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    modifie_le          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_enseignants_actif ON enseignants(actif);

-- --------------------------------------------------------------------------
-- Élèves
-- Le matricule est immuable et suit l'élève toute sa scolarité (UC-B02).
-- --------------------------------------------------------------------------
CREATE TABLE eleves (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    matricule           TEXT NOT NULL UNIQUE,   -- 'LGR-2026-0001'
    nom                 TEXT NOT NULL,
    prenom              TEXT NOT NULL,
    sexe                sexe_type NOT NULL,
    date_naissance      DATE NOT NULL,
    lieu_naissance      TEXT,
    nationalite         TEXT DEFAULT 'Tchadienne',
    -- Numéro d'acte de naissance (exigé par l'administration)
    acte_naissance_numero TEXT,
    adresse             TEXT,
    quartier            TEXT,
    photo_url           TEXT,
    -- Informations utiles à l'infirmerie
    groupe_sanguin      TEXT,
    allergies           TEXT,
    observations_medicales TEXT,
    -- Provenance
    ecole_origine       TEXT,
    -- Statut courant — dénormalisé pour la performance, historisé dans
    -- historique_statuts (voir 0008)
    statut              statut_eleve NOT NULL DEFAULT 'PRE_INSCRIT',
    date_premiere_inscription DATE,
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    modifie_le          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_naissance CHECK (date_naissance < CURRENT_DATE)
);

CREATE INDEX idx_eleves_statut ON eleves(statut);
CREATE INDEX idx_eleves_nom ON eleves(nom, prenom);
-- Recherche instantanée (UC-B10) : matricule, nom, prénom
CREATE INDEX idx_eleves_recherche ON eleves
    USING gin (to_tsvector('french', matricule || ' ' || nom || ' ' || prenom));

-- --------------------------------------------------------------------------
-- Tuteurs (parents et responsables légaux)
-- --------------------------------------------------------------------------
CREATE TABLE tuteurs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    utilisateur_id      UUID UNIQUE REFERENCES utilisateurs(id) ON DELETE SET NULL,
    nom                 TEXT NOT NULL,
    prenom              TEXT NOT NULL,
    sexe                sexe_type,
    telephone           TEXT NOT NULL,
    telephone_secondaire TEXT,
    email               TEXT,
    profession          TEXT,
    employeur           TEXT,
    adresse             TEXT,
    quartier            TEXT,
    piece_identite      TEXT,           -- type + numéro
    -- Le tuteur a-t-il activé l'application mobile ?
    app_activee         BOOLEAN NOT NULL DEFAULT FALSE,
    app_activee_le      TIMESTAMPTZ,
    -- Canal de repli si l'app n'est pas installée (UC-J04)
    accepte_sms         BOOLEAN NOT NULL DEFAULT TRUE,
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    modifie_le          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tuteurs_telephone ON tuteurs(telephone);

-- --------------------------------------------------------------------------
-- Liaison élève ↔ tuteur
--
-- SÉCURITÉ : cette table est la SEULE source de vérité pour déterminer
-- quels élèves un parent est autorisé à consulter (guard, périmètre PARENT).
-- --------------------------------------------------------------------------
CREATE TABLE eleve_tuteur (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eleve_id            UUID NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
    tuteur_id           UUID NOT NULL REFERENCES tuteurs(id) ON DELETE CASCADE,
    lien                lien_parente NOT NULL,
    -- Tuteur principal : destinataire prioritaire des communications
    est_principal       BOOLEAN NOT NULL DEFAULT FALSE,
    -- Responsable du paiement des frais
    est_responsable_financier BOOLEAN NOT NULL DEFAULT FALSE,
    -- Autorisé à récupérer l'élève à la sortie
    autorise_retrait    BOOLEAN NOT NULL DEFAULT TRUE,
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (eleve_id, tuteur_id)
);

CREATE INDEX idx_eleve_tuteur_eleve ON eleve_tuteur(eleve_id);
CREATE INDEX idx_eleve_tuteur_tuteur ON eleve_tuteur(tuteur_id);
-- Un seul tuteur principal par élève
CREATE UNIQUE INDEX uq_tuteur_principal ON eleve_tuteur(eleve_id) WHERE est_principal;

-- --------------------------------------------------------------------------
-- Pièces jointes du dossier élève (UC-L07)
-- --------------------------------------------------------------------------
CREATE TYPE type_piece AS ENUM (
    'ACTE_NAISSANCE', 'PHOTO', 'BULLETIN_ANTERIEUR', 'CERTIFICAT_TRANSFERT',
    'CERTIFICAT_MEDICAL', 'PIECE_IDENTITE_TUTEUR', 'JUSTIFICATIF_ABSENCE', 'AUTRE'
);

CREATE TABLE pieces_dossier (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eleve_id        UUID NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
    type            type_piece NOT NULL,
    libelle         TEXT NOT NULL,
    fichier_url     TEXT NOT NULL,
    taille_octets   INTEGER,
    mime_type       TEXT,
    depose_par      UUID REFERENCES utilisateurs(id),
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pieces_eleve ON pieces_dossier(eleve_id);
