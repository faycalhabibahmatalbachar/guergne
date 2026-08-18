-- =============================================================================
-- 0004 — Évaluations, notes, moyennes, bulletins, conseils de classe.
--        C'est le cœur métier du système.
-- =============================================================================

CREATE TYPE type_evaluation AS ENUM (
    'INTERROGATION',    -- interrogation écrite, courte
    'DEVOIR',           -- devoir surveillé
    'COMPOSITION',      -- composition de fin de trimestre (poids fort)
    'EXAMEN_BLANC',     -- BEPC / BAC blanc
    'TP',               -- travaux pratiques
    'ORAL'
);

CREATE TYPE mention_bulletin AS ENUM (
    'FELICITATIONS',
    'ENCOURAGEMENTS',
    'TABLEAU_HONNEUR',
    'AVERTISSEMENT_TRAVAIL',
    'AVERTISSEMENT_CONDUITE',
    'BLAME',
    'AUCUNE'
);

CREATE TYPE decision_fin_annee AS ENUM (
    'ADMIS',              -- passe en classe supérieure
    'ADMIS_CONDITION',    -- passage sous condition
    'REDOUBLE',
    'EXCLU',
    'REORIENTE',          -- changement de série
    'EN_ATTENTE'
);

-- --------------------------------------------------------------------------
-- Évaluations (UC-E01)
-- --------------------------------------------------------------------------
CREATE TABLE evaluations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    annee_id        UUID NOT NULL REFERENCES annees_scolaires(id) ON DELETE CASCADE,
    periode_id      UUID NOT NULL REFERENCES periodes(id) ON DELETE CASCADE,
    classe_id       UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    matiere_id      UUID NOT NULL REFERENCES matieres(id),
    enseignant_id   UUID REFERENCES enseignants(id) ON DELETE SET NULL,
    type            type_evaluation NOT NULL,
    titre           TEXT NOT NULL,              -- 'Interrogation n°2 — Dérivées'
    date_evaluation DATE NOT NULL,
    bareme          NUMERIC(5,2) NOT NULL DEFAULT 20.00 CHECK (bareme > 0),
    -- Poids de cette évaluation à l'intérieur de son type
    poids           NUMERIC(4,2) NOT NULL DEFAULT 1.00 CHECK (poids > 0),
    -- Exclure du calcul de la moyenne (évaluation blanche, entraînement)
    compte_dans_moyenne BOOLEAN NOT NULL DEFAULT TRUE,
    observations    TEXT,
    -- Verrou propre à l'évaluation (indépendant du verrou de période)
    est_verrouillee BOOLEAN NOT NULL DEFAULT FALSE,
    cree_par        UUID REFERENCES utilisateurs(id),
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
    modifie_le      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_evaluations_classe_periode ON evaluations(classe_id, periode_id);
CREATE INDEX idx_evaluations_matiere ON evaluations(matiere_id, periode_id);
CREATE INDEX idx_evaluations_enseignant ON evaluations(enseignant_id);

-- --------------------------------------------------------------------------
-- Notes (UC-E02)
--
-- `valeur` est NULL lorsque l'élève était absent : une absence n'est PAS un
-- zéro. Le statut porte l'information, le calcul de moyenne exclut la note.
-- --------------------------------------------------------------------------
CREATE TYPE statut_note AS ENUM (
    'NOTEE',        -- note saisie
    'ABSENT',       -- absent à l'évaluation (exclu de la moyenne)
    'ABSENT_ZERO',  -- absence non justifiée sanctionnée par 0 (compte)
    'DISPENSE',     -- dispensé (EPS sur certificat médical)
    'NON_RENDU'     -- travail non remis → 0
);

CREATE TABLE notes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evaluation_id   UUID NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
    inscription_id  UUID NOT NULL REFERENCES inscriptions(id) ON DELETE CASCADE,
    valeur          NUMERIC(5,2) CHECK (valeur >= 0),
    statut          statut_note NOT NULL DEFAULT 'NOTEE',
    appreciation    TEXT,
    saisie_par      UUID REFERENCES utilisateurs(id),
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
    modifie_le      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (evaluation_id, inscription_id),
    -- Une note « NOTEE » doit porter une valeur, et réciproquement
    CONSTRAINT chk_note_coherente CHECK (
        (statut = 'NOTEE' AND valeur IS NOT NULL)
        OR (statut <> 'NOTEE')
    )
);

CREATE INDEX idx_notes_inscription ON notes(inscription_id);
CREATE INDEX idx_notes_evaluation ON notes(evaluation_id);

-- --------------------------------------------------------------------------
-- Historique des modifications de note (UC-E03)
-- Une note modifiée sans trace est une porte ouverte à la fraude.
-- --------------------------------------------------------------------------
CREATE TABLE historique_notes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id         UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    ancienne_valeur NUMERIC(5,2),
    nouvelle_valeur NUMERIC(5,2),
    ancien_statut   statut_note,
    nouveau_statut  statut_note,
    motif           TEXT,
    modifie_par     UUID REFERENCES utilisateurs(id),
    modifie_le      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_historique_notes_note ON historique_notes(note_id, modifie_le DESC);

-- Déclencheur : toute modification de valeur ou de statut est journalisée
CREATE OR REPLACE FUNCTION trg_journaliser_note() RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.valeur IS DISTINCT FROM NEW.valeur)
       OR (OLD.statut IS DISTINCT FROM NEW.statut) THEN
        INSERT INTO historique_notes (
            note_id, ancienne_valeur, nouvelle_valeur,
            ancien_statut, nouveau_statut, modifie_par
        ) VALUES (
            NEW.id, OLD.valeur, NEW.valeur,
            OLD.statut, NEW.statut, NEW.saisie_par
        );
        NEW.modifie_le := now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notes_journalisation
    BEFORE UPDATE ON notes
    FOR EACH ROW EXECUTE FUNCTION trg_journaliser_note();

-- --------------------------------------------------------------------------
-- Appréciations par matière (UC-E10)
-- --------------------------------------------------------------------------
CREATE TABLE appreciations_matiere (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inscription_id  UUID NOT NULL REFERENCES inscriptions(id) ON DELETE CASCADE,
    periode_id      UUID NOT NULL REFERENCES periodes(id) ON DELETE CASCADE,
    matiere_id      UUID NOT NULL REFERENCES matieres(id) ON DELETE CASCADE,
    enseignant_id   UUID REFERENCES enseignants(id) ON DELETE SET NULL,
    appreciation    TEXT NOT NULL,
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
    modifie_le      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (inscription_id, periode_id, matiere_id)
);

-- --------------------------------------------------------------------------
-- Moyennes par matière — résultat calculé, figé à la clôture de période.
--
-- Pourquoi matérialiser : recalculer 12 matières × 60 élèves à chaque
-- affichage de bulletin est inutilement coûteux, et surtout un bulletin
-- publié ne doit plus jamais changer de valeur.
-- --------------------------------------------------------------------------
CREATE TABLE moyennes_matiere (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inscription_id      UUID NOT NULL REFERENCES inscriptions(id) ON DELETE CASCADE,
    periode_id          UUID NOT NULL REFERENCES periodes(id) ON DELETE CASCADE,
    matiere_id          UUID NOT NULL REFERENCES matieres(id) ON DELETE CASCADE,
    moyenne             NUMERIC(5,2),
    coefficient         NUMERIC(4,2) NOT NULL,
    points              NUMERIC(7,2),           -- moyenne × coefficient
    rang_matiere        SMALLINT,               -- rang dans la classe pour cette matière
    -- Statistiques de la classe, pour la colonne comparative du bulletin
    moyenne_classe      NUMERIC(5,2),
    note_min_classe     NUMERIC(5,2),
    note_max_classe     NUMERIC(5,2),
    nb_evaluations      SMALLINT NOT NULL DEFAULT 0,
    calcule_le          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (inscription_id, periode_id, matiere_id)
);

CREATE INDEX idx_moy_matiere_periode ON moyennes_matiere(periode_id, matiere_id);

-- --------------------------------------------------------------------------
-- Moyennes générales (UC-E06, UC-E07, UC-E08)
-- --------------------------------------------------------------------------
CREATE TABLE moyennes_generales (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inscription_id      UUID NOT NULL REFERENCES inscriptions(id) ON DELETE CASCADE,
    periode_id          UUID NOT NULL REFERENCES periodes(id) ON DELETE CASCADE,
    moyenne             NUMERIC(5,2),
    total_points        NUMERIC(8,2),
    total_coefficients  NUMERIC(6,2),
    rang                SMALLINT,
    -- Ex æquo : deux élèves à 14,25 partagent le rang 3
    est_ex_aequo        BOOLEAN NOT NULL DEFAULT FALSE,
    effectif_classe     SMALLINT,
    -- Statistiques de la classe
    moyenne_classe      NUMERIC(5,2),
    moyenne_min_classe  NUMERIC(5,2),
    moyenne_max_classe  NUMERIC(5,2),
    calcule_le          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (inscription_id, periode_id)
);

CREATE INDEX idx_moy_gen_periode ON moyennes_generales(periode_id, rang);

-- --------------------------------------------------------------------------
-- Conseils de classe (UC-F04)
-- --------------------------------------------------------------------------
CREATE TABLE conseils_classe (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classe_id       UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    periode_id      UUID NOT NULL REFERENCES periodes(id) ON DELETE CASCADE,
    date_conseil    DATE NOT NULL,
    president       TEXT,                   -- généralement le proviseur
    secretaire      TEXT,
    participants    TEXT,
    observations    TEXT,
    -- Le conseil est-il clos ? Tant qu'il ne l'est pas, on peut modifier
    est_valide      BOOLEAN NOT NULL DEFAULT FALSE,
    valide_par      UUID REFERENCES utilisateurs(id),
    valide_le       TIMESTAMPTZ,
    proces_verbal_url TEXT,                 -- PDF archivé (UC-F10)
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (classe_id, periode_id)
);

-- --------------------------------------------------------------------------
-- Bulletins (UC-F01 → UC-F07)
-- --------------------------------------------------------------------------
CREATE TABLE bulletins (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inscription_id      UUID NOT NULL REFERENCES inscriptions(id) ON DELETE CASCADE,
    periode_id          UUID NOT NULL REFERENCES periodes(id) ON DELETE CASCADE,
    conseil_classe_id   UUID REFERENCES conseils_classe(id) ON DELETE SET NULL,
    -- Synthèse figée au moment de la génération
    moyenne_generale    NUMERIC(5,2),
    rang                SMALLINT,
    effectif_classe     SMALLINT,
    moyenne_classe      NUMERIC(5,2),
    -- Assiduité reportée sur le bulletin
    heures_absence_justifiees       NUMERIC(6,2) NOT NULL DEFAULT 0,
    heures_absence_non_justifiees   NUMERIC(6,2) NOT NULL DEFAULT 0,
    nb_retards          SMALLINT NOT NULL DEFAULT 0,
    note_conduite       NUMERIC(5,2),
    -- Décisions du conseil
    appreciation_generale TEXT,
    mention             mention_bulletin NOT NULL DEFAULT 'AUCUNE',
    decision            decision_fin_annee,     -- renseigné au 3ème trimestre
    -- Cycle de publication : tant que non publié, invisible côté mobile (UC-F06)
    est_publie          BOOLEAN NOT NULL DEFAULT FALSE,
    publie_le           TIMESTAMPTZ,
    publie_par          UUID REFERENCES utilisateurs(id),
    pdf_url             TEXT,
    genere_le           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (inscription_id, periode_id)
);

CREATE INDEX idx_bulletins_publie ON bulletins(inscription_id) WHERE est_publie;
CREATE INDEX idx_bulletins_periode ON bulletins(periode_id);

-- --------------------------------------------------------------------------
-- Bulletin annuel (UC-F08) : synthèse des trois trimestres
-- --------------------------------------------------------------------------
CREATE TABLE bulletins_annuels (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inscription_id      UUID NOT NULL UNIQUE REFERENCES inscriptions(id) ON DELETE CASCADE,
    moyenne_t1          NUMERIC(5,2),
    moyenne_t2          NUMERIC(5,2),
    moyenne_t3          NUMERIC(5,2),
    moyenne_annuelle    NUMERIC(5,2),
    rang_annuel         SMALLINT,
    effectif_classe     SMALLINT,
    decision            decision_fin_annee NOT NULL DEFAULT 'EN_ATTENTE',
    mention             mention_bulletin NOT NULL DEFAULT 'AUCUNE',
    appreciation        TEXT,
    -- Niveau d'affectation pour l'année suivante
    niveau_suivant_id   UUID REFERENCES niveaux(id),
    est_publie          BOOLEAN NOT NULL DEFAULT FALSE,
    pdf_url             TEXT,
    genere_le           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- Devoirs à faire & ressources (UC-I01, UC-I03)
-- --------------------------------------------------------------------------
CREATE TABLE devoirs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classe_id       UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    matiere_id      UUID NOT NULL REFERENCES matieres(id),
    enseignant_id   UUID REFERENCES enseignants(id) ON DELETE SET NULL,
    titre           TEXT NOT NULL,
    consigne        TEXT,
    date_publication DATE NOT NULL DEFAULT CURRENT_DATE,
    date_remise     DATE NOT NULL,
    fichier_url     TEXT,
    publie          BOOLEAN NOT NULL DEFAULT TRUE,
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_devoirs_classe_date ON devoirs(classe_id, date_remise);

CREATE TABLE ressources_pedagogiques (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classe_id       UUID REFERENCES classes(id) ON DELETE CASCADE,
    matiere_id      UUID REFERENCES matieres(id) ON DELETE CASCADE,
    enseignant_id   UUID REFERENCES enseignants(id) ON DELETE SET NULL,
    titre           TEXT NOT NULL,
    description     TEXT,
    fichier_url     TEXT NOT NULL,
    taille_octets   INTEGER,
    mime_type       TEXT,
    visible_parents BOOLEAN NOT NULL DEFAULT TRUE,
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now()
);
