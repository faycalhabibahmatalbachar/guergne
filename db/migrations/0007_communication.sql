-- =============================================================================
-- 0007 — Communication : annonces, messages, notifications push et SMS,
--        appareils mobiles, documents émis.
-- =============================================================================

CREATE TYPE cible_diffusion AS ENUM (
    'TOUS', 'NIVEAU', 'CLASSE', 'ELEVE', 'ENSEIGNANTS', 'PERSONNEL'
);

CREATE TYPE canal_notification AS ENUM ('PUSH', 'SMS', 'EMAIL', 'IN_APP');

CREATE TYPE statut_envoi AS ENUM ('EN_ATTENTE', 'ENVOYE', 'ECHOUE', 'LU');

CREATE TYPE type_notification AS ENUM (
    'ABSENCE', 'RETARD', 'NOTE_PUBLIEE', 'BULLETIN_PUBLIE',
    'INCIDENT', 'SANCTION', 'ECHEANCE_PAIEMENT', 'PAIEMENT_RECU',
    'ANNONCE', 'CONVOCATION', 'CHANGEMENT_STATUT', 'DEVOIR', 'AUTRE'
);

-- --------------------------------------------------------------------------
-- Annonces (UC-J01)
-- --------------------------------------------------------------------------
CREATE TABLE annonces (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    annee_id        UUID NOT NULL REFERENCES annees_scolaires(id) ON DELETE CASCADE,
    titre           TEXT NOT NULL,
    contenu         TEXT NOT NULL,
    cible           cible_diffusion NOT NULL DEFAULT 'TOUS',
    niveau_id       UUID REFERENCES niveaux(id) ON DELETE CASCADE,
    classe_id       UUID REFERENCES classes(id) ON DELETE CASCADE,
    piece_jointe_url TEXT,
    -- Une annonce épinglée reste en tête de liste dans l'app
    epinglee        BOOLEAN NOT NULL DEFAULT FALSE,
    -- Publication différée
    publier_le      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expire_le       TIMESTAMPTZ,
    publiee         BOOLEAN NOT NULL DEFAULT TRUE,
    -- Déclencher un push en plus de l'affichage in-app
    envoyer_push    BOOLEAN NOT NULL DEFAULT TRUE,
    publiee_par     UUID REFERENCES utilisateurs(id),
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_annonces_publication ON annonces(publier_le DESC) WHERE publiee;
CREATE INDEX idx_annonces_classe ON annonces(classe_id) WHERE classe_id IS NOT NULL;

-- --------------------------------------------------------------------------
-- Messages ciblés (UC-J02) — école ↔ tuteur
-- --------------------------------------------------------------------------
CREATE TABLE messages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expediteur_id       UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    destinataire_id     UUID REFERENCES utilisateurs(id) ON DELETE CASCADE,
    -- Contexte : le message concerne cet élève
    eleve_id            UUID REFERENCES eleves(id) ON DELETE SET NULL,
    objet               TEXT NOT NULL,
    contenu             TEXT NOT NULL,
    piece_jointe_url    TEXT,
    -- Fil de discussion
    message_parent_id   UUID REFERENCES messages(id) ON DELETE CASCADE,
    lu                  BOOLEAN NOT NULL DEFAULT FALSE,
    lu_le               TIMESTAMPTZ,
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_destinataire ON messages(destinataire_id, cree_le DESC);
CREATE INDEX idx_messages_non_lus ON messages(destinataire_id) WHERE NOT lu;

-- --------------------------------------------------------------------------
-- Appareils mobiles enregistrés (jetons FCM)
-- --------------------------------------------------------------------------
CREATE TABLE appareils (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    utilisateur_id  UUID NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    jeton_fcm       TEXT NOT NULL UNIQUE,
    plateforme      TEXT NOT NULL,          -- 'android' | 'ios'
    modele          TEXT,
    version_app     TEXT,
    langue          TEXT NOT NULL DEFAULT 'fr',
    actif           BOOLEAN NOT NULL DEFAULT TRUE,
    derniere_utilisation TIMESTAMPTZ NOT NULL DEFAULT now(),
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_appareils_utilisateur ON appareils(utilisateur_id) WHERE actif;

-- --------------------------------------------------------------------------
-- Notifications — journal unifié de tout ce qui part vers les familles.
--
-- Une seule table pour push, SMS et in-app : cela permet de savoir
-- exactement ce qui a été envoyé à qui, par quel canal, et si ça a abouti.
-- --------------------------------------------------------------------------
CREATE TABLE notifications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    destinataire_id     UUID REFERENCES utilisateurs(id) ON DELETE CASCADE,
    -- Destinataire SMS même sans compte applicatif (UC-J04)
    telephone           TEXT,
    eleve_id            UUID REFERENCES eleves(id) ON DELETE SET NULL,
    type                type_notification NOT NULL,
    canal               canal_notification NOT NULL,
    titre               TEXT NOT NULL,
    corps               TEXT NOT NULL,
    -- Écran à ouvrir au clic sur la notification
    route_cible         TEXT,
    donnees             JSONB,
    statut              statut_envoi NOT NULL DEFAULT 'EN_ATTENTE',
    tentatives          SMALLINT NOT NULL DEFAULT 0,
    erreur              TEXT,
    envoye_le           TIMESTAMPTZ,
    lu_le               TIMESTAMPTZ,
    -- Coût SMS, pour le suivi budgétaire
    cout_fcfa           INTEGER,
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_destinataire CHECK (destinataire_id IS NOT NULL OR telephone IS NOT NULL)
);

CREATE INDEX idx_notifications_destinataire ON notifications(destinataire_id, cree_le DESC);
-- File d'attente d'envoi
CREATE INDEX idx_notifications_file ON notifications(cree_le)
    WHERE statut = 'EN_ATTENTE';
CREATE INDEX idx_notifications_eleve ON notifications(eleve_id, cree_le DESC);

-- --------------------------------------------------------------------------
-- Accusés de lecture des annonces (UC-J06)
-- --------------------------------------------------------------------------
CREATE TABLE lectures_annonces (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    annonce_id      UUID NOT NULL REFERENCES annonces(id) ON DELETE CASCADE,
    utilisateur_id  UUID NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    lu_le           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (annonce_id, utilisateur_id)
);

-- --------------------------------------------------------------------------
-- Convocations (UC-J05, UC-H03)
-- --------------------------------------------------------------------------
CREATE TABLE convocations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eleve_id        UUID REFERENCES eleves(id) ON DELETE CASCADE,
    tuteur_id       UUID REFERENCES tuteurs(id) ON DELETE CASCADE,
    motif           TEXT NOT NULL,
    date_rdv        DATE NOT NULL,
    heure_rdv       TIME,
    lieu            TEXT,
    convoque_par    UUID REFERENCES utilisateurs(id),
    document_url    TEXT,
    -- Suivi de présence
    honoree         BOOLEAN,
    compte_rendu    TEXT,
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_convocations_date ON convocations(date_rdv DESC);

-- --------------------------------------------------------------------------
-- Documents officiels émis (UC-L01 → UC-L08)
--
-- Toute pièce officielle sortie de l'établissement est numérotée et tracée.
-- --------------------------------------------------------------------------
CREATE TYPE type_document AS ENUM (
    'CERTIFICAT_SCOLARITE',
    'CERTIFICAT_TRANSFERT',
    'ATTESTATION_FREQUENTATION',
    'CARTE_SCOLAIRE',
    'BULLETIN',
    'BULLETIN_ANNUEL',
    'RECU_PAIEMENT',
    'CONVOCATION',
    'NOTIFICATION_SANCTION',
    'PV_CONSEIL_CLASSE',
    'PV_CONSEIL_DISCIPLINE',
    'LISTE_APPEL',
    'LISTE_EXAMEN',
    'PALMARES',
    'AUTRE'
);

CREATE TABLE documents_emis (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type            type_document NOT NULL,
    numero          TEXT NOT NULL UNIQUE,       -- 'CS-2026-0042'
    eleve_id        UUID REFERENCES eleves(id) ON DELETE SET NULL,
    classe_id       UUID REFERENCES classes(id) ON DELETE SET NULL,
    annee_id        UUID REFERENCES annees_scolaires(id) ON DELETE SET NULL,
    libelle         TEXT NOT NULL,
    fichier_url     TEXT,
    -- Contenu figé au moment de l'émission : un certificat réédité doit être
    -- identique à l'original, même si les données ont changé depuis.
    donnees_figees  JSONB,
    emis_par        UUID REFERENCES utilisateurs(id),
    emis_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Vérification d'authenticité par QR code
    code_verification TEXT UNIQUE
);

CREATE INDEX idx_documents_eleve ON documents_emis(eleve_id, emis_le DESC);
CREATE INDEX idx_documents_type ON documents_emis(type, emis_le DESC);
