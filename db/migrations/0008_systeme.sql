-- =============================================================================
-- 0008 — Système : permissions, journal d'audit, historique des statuts,
--        séquences de numérotation.
-- =============================================================================

-- --------------------------------------------------------------------------
-- Matrice des permissions (UC-N04)
--
-- Le rôle reste la source d'autorité (colonne `role` de `utilisateurs`).
-- Cette table décrit ce que chaque rôle a le droit de faire ; elle est
-- chargée en mémoire au démarrage et vérifiée par la couche `guard`.
-- --------------------------------------------------------------------------
CREATE TABLE permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role        role_utilisateur NOT NULL,
    action      TEXT NOT NULL,          -- 'notes:write', 'eleve:suspend'…
    -- Restriction de périmètre appliquée en plus du contrôle de rôle
    -- 'AUCUNE' | 'PROPRES_CLASSES' | 'PROPRES_ENFANTS'
    portee      TEXT NOT NULL DEFAULT 'AUCUNE',
    UNIQUE (role, action)
);

CREATE INDEX idx_permissions_role ON permissions(role);

-- --------------------------------------------------------------------------
-- Journal d'audit (UC-N05)
--
-- Table en append-only : aucune mise à jour, aucune suppression.
-- Toute action sensible y est écrite AVANT d'être confirmée à l'utilisateur.
-- --------------------------------------------------------------------------
CREATE TABLE journal_audit (
    id              BIGSERIAL PRIMARY KEY,
    utilisateur_id  UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    -- Copie du rôle et du nom au moment de l'action : si le compte est
    -- supprimé plus tard, la trace reste exploitable.
    role_acteur     role_utilisateur,
    nom_acteur      TEXT,
    action          TEXT NOT NULL,          -- 'note.modifiee', 'eleve.exclu'
    entite          TEXT NOT NULL,          -- nom de la table concernée
    entite_id       UUID,
    -- Contexte métier, pour retrouver l'élève concerné sans jointure
    eleve_id        UUID,
    valeurs_avant   JSONB,
    valeurs_apres   JSONB,
    motif           TEXT,
    adresse_ip      INET,
    user_agent      TEXT,
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_utilisateur ON journal_audit(utilisateur_id, cree_le DESC);
CREATE INDEX idx_audit_entite ON journal_audit(entite, entite_id, cree_le DESC);
CREATE INDEX idx_audit_eleve ON journal_audit(eleve_id, cree_le DESC);
CREATE INDEX idx_audit_date ON journal_audit(cree_le DESC);

-- Interdiction stricte de modifier ou supprimer une entrée d'audit
CREATE OR REPLACE FUNCTION trg_audit_immuable() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Le journal d''audit est immuable : ni modification ni suppression.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_pas_de_update
    BEFORE UPDATE OR DELETE ON journal_audit
    FOR EACH ROW EXECUTE FUNCTION trg_audit_immuable();

-- --------------------------------------------------------------------------
-- Historique des statuts d'élève (UC-C05)
--
-- Suspension, réactivation, exclusion, transfert : chaque transition est
-- conservée avec son motif et son auteur.
-- --------------------------------------------------------------------------
CREATE TABLE historique_statuts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eleve_id            UUID NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
    annee_id            UUID REFERENCES annees_scolaires(id) ON DELETE SET NULL,
    ancien_statut       statut_eleve,
    nouveau_statut      statut_eleve NOT NULL,
    motif               TEXT NOT NULL,
    -- Pour les suspensions temporaires
    date_effet          DATE NOT NULL DEFAULT CURRENT_DATE,
    date_fin_prevue     DATE,
    -- Pièce justifiant la décision (PV de conseil de discipline…)
    document_url        TEXT,
    sanction_id         UUID REFERENCES sanctions(id) ON DELETE SET NULL,
    decide_par          UUID REFERENCES utilisateurs(id),
    parents_notifies    BOOLEAN NOT NULL DEFAULT FALSE,
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_historique_statuts_eleve ON historique_statuts(eleve_id, cree_le DESC);

-- Report automatique du dernier statut sur la fiche élève
CREATE OR REPLACE FUNCTION trg_appliquer_statut() RETURNS TRIGGER AS $$
BEGIN
    UPDATE eleves
       SET statut = NEW.nouveau_statut,
           modifie_le = now()
     WHERE id = NEW.eleve_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER historique_statuts_application
    AFTER INSERT ON historique_statuts
    FOR EACH ROW EXECUTE FUNCTION trg_appliquer_statut();

-- --------------------------------------------------------------------------
-- Séquences de numérotation (matricules, reçus, documents)
--
-- Une table plutôt qu'une séquence Postgres : la numérotation redémarre à 1
-- chaque année scolaire, et le format est lisible par l'administration.
-- --------------------------------------------------------------------------
CREATE TABLE sequences_numerotation (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cle         TEXT NOT NULL,          -- 'MATRICULE', 'RECU', 'CERTIFICAT_SCOLARITE'
    annee       SMALLINT NOT NULL,
    prefixe     TEXT NOT NULL,          -- 'LGR', 'REC', 'CS'
    dernier_numero INTEGER NOT NULL DEFAULT 0,
    longueur    SMALLINT NOT NULL DEFAULT 4,   -- '0001'
    UNIQUE (cle, annee)
);

-- Attribution atomique du numéro suivant.
-- FOR UPDATE verrouille la ligne : deux inscriptions simultanées ne peuvent
-- pas obtenir le même matricule.
CREATE OR REPLACE FUNCTION prochain_numero(p_cle TEXT, p_annee SMALLINT)
RETURNS TEXT AS $$
DECLARE
    v_numero INTEGER;
    v_prefixe TEXT;
    v_longueur SMALLINT;
BEGIN
    UPDATE sequences_numerotation
       SET dernier_numero = dernier_numero + 1
     WHERE cle = p_cle AND annee = p_annee
    RETURNING dernier_numero, prefixe, longueur
      INTO v_numero, v_prefixe, v_longueur;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Séquence introuvable : % (année %)', p_cle, p_annee;
    END IF;

    RETURN v_prefixe || '-' || p_annee || '-' || lpad(v_numero::TEXT, v_longueur, '0');
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------------
-- Paramètres applicatifs libres
-- --------------------------------------------------------------------------
CREATE TABLE parametres (
    cle         TEXT PRIMARY KEY,
    valeur      TEXT NOT NULL,
    description TEXT,
    modifie_le  TIMESTAMPTZ NOT NULL DEFAULT now(),
    modifie_par UUID REFERENCES utilisateurs(id)
);

-- --------------------------------------------------------------------------
-- Mise à jour générique de `modifie_le`
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_modifie_le() RETURNS TRIGGER AS $$
BEGIN
    NEW.modifie_le := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'etablissement', 'utilisateurs', 'enseignants', 'eleves', 'tuteurs',
        'inscriptions', 'evaluations', 'appreciations_matiere',
        'notes_conduite', 'absences'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER %I_modifie_le BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION trg_modifie_le()', t, t);
    END LOOP;
END $$;
