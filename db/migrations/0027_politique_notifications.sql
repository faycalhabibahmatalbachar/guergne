-- ---------------------------------------------------------------------------
-- 0027 — Politique de notification, type par type
--
-- CE QUI N'ALLAIT PAS
-- -------------------
-- Le canal était imposé par une règle unique, écrite dans le code :
-- « push si un appareil est enregistré, SMS sinon ». Elle est raisonnable, mais
-- elle ne convient pas à tous les événements :
--
--   - Une **exclusion** doit partir par les DEUX canaux. Un parent qui n'ouvre
--     pas son application ce jour-là doit quand même être joint.
--   - Un **devoir publié** ne justifie aucun SMS : trente par semaine et deux
--     tuteurs par élève, c'est soixante messages facturés par famille.
--   - Une **relance d'impayé** part par SMS même si le parent a l'application :
--     c'est le canal qu'on peut produire en cas de litige.
--
-- Une seule règle pour treize situations, c'était forcément faux quelque part.
--
-- CE QUE CETTE MIGRATION APPORTE
-- -------------------------------
-- Une politique PAR TYPE, modifiable depuis l'écran de configuration, sans
-- redéploiement. Cinq valeurs, qui couvrent tous les cas rencontrés :
--
--   PUSH_SINON_SMS  le comportement actuel : gratuit d'abord, SMS en repli
--   PUSH_ET_SMS     les deux, pour ce qui ne peut pas être manqué
--   PUSH_SEUL       jamais de SMS, quoi qu'il arrive — pour le volume
--   SMS_SEUL        toujours un SMS, même si l'application est installée
--   AUCUN           coupé, sans toucher au déclencheur
-- ---------------------------------------------------------------------------

CREATE TYPE politique_canal AS ENUM (
    'PUSH_SINON_SMS',
    'PUSH_ET_SMS',
    'PUSH_SEUL',
    'SMS_SEUL',
    'AUCUN'
);

CREATE TABLE politiques_notification (
    type          type_notification PRIMARY KEY,
    politique     politique_canal   NOT NULL DEFAULT 'PUSH_SINON_SMS',
    libelle       TEXT              NOT NULL,
    description   TEXT,
    -- Coût indicatif affiché à l'écran : ce qu'un envoi de ce type coûte à
    -- l'établissement quand il part en SMS. Sans ce repère, personne ne peut
    -- arbitrer entre « prévenir » et « dépenser ».
    volume_attendu TEXT,
    modifie_le    TIMESTAMPTZ       NOT NULL DEFAULT now(),
    modifie_par   UUID REFERENCES utilisateurs(id)
);

COMMENT ON TABLE politiques_notification IS
    'Canal retenu pour chaque type d''evenement. Modifiable sans redeploiement.';

-- ---------------------------------------------------------------------------
-- Les treize types, avec une politique choisie pour chacun
--
-- Les valeurs ne sont pas uniformes, et c'est tout l'intérêt : chacune répond à
-- la question « que se passe-t-il si la famille ne le lit pas ? ».
-- ---------------------------------------------------------------------------
INSERT INTO politiques_notification (type, politique, libelle, description, volume_attendu) VALUES
    ('ABSENCE', 'PUSH_SINON_SMS', 'Absence signalée',
     'Un parent doit savoir le jour même que son enfant n''était pas en classe.',
     'Quotidien'),

    ('RETARD', 'PUSH_SEUL', 'Retard signalé',
     'Fréquent et peu grave. Le SMS coûterait plus que l''information ne vaut.',
     'Quotidien, volume élevé'),

    ('NOTE_PUBLIEE', 'PUSH_SINON_SMS', 'Note publiée',
     'Attendu par les familles, sans urgence.',
     'Hebdomadaire'),

    ('BULLETIN_PUBLIE', 'PUSH_ET_SMS', 'Bulletin publié',
     'Trois fois l''an, et c''est le document qui compte le plus. Les deux canaux.',
     'Trimestriel'),

    ('INCIDENT', 'PUSH_SINON_SMS', 'Incident de discipline',
     'Selon la gravité retenue dans les paramètres.',
     'Occasionnel'),

    ('SANCTION', 'PUSH_ET_SMS', 'Sanction prononcée',
     'A des conséquences concrètes : un enfant exclu trois jours doit être gardé.',
     'Occasionnel'),

    ('ECHEANCE_PAIEMENT', 'SMS_SEUL', 'Relance de paiement',
     'Par SMS même si l''application est installée : c''est la trace qu''on peut produire.',
     'Mensuel'),

    ('PAIEMENT_RECU', 'PUSH_SINON_SMS', 'Paiement encaissé',
     'Protège aussi contre la fraude au guichet : le payeur voit le montant enregistré.',
     'Mensuel'),

    ('CONVOCATION', 'PUSH_ET_SMS', 'Convocation',
     'Un rendez-vous manqué fait perdre une demi-journée à tout le monde.',
     'Occasionnel'),

    ('CHANGEMENT_STATUT', 'PUSH_ET_SMS', 'Changement de situation',
     'Exclusion, transfert, radiation. La notification la plus lourde du système.',
     'Rare'),

    ('DEVOIR', 'PUSH_SEUL', 'Devoir publié',
     'Trente par semaine et deux tuteurs par élève : jamais de SMS.',
     'Quotidien, volume très élevé'),

    ('ANNONCE', 'PUSH_SINON_SMS', 'Annonce de l''établissement',
     'Le canal est choisi à l''envoi depuis la page Communication.',
     'Ponctuel'),

    ('AUTRE', 'SMS_SEUL', 'Code d''activation et compte',
     'Un parent qui attend son code n''a par définition pas encore l''application.',
     'À l''inscription');

-- ---------------------------------------------------------------------------
-- Le dépôt d'une notification consulte désormais la politique
--
-- La signature ne change pas : les onze déclencheurs continuent d'appeler la
-- fonction telle quelle. `p_parametre` reste accepté — il coupe toujours un
-- type via `parametres` — mais la politique décide du canal.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_notifier_tuteurs(
    p_eleve_id   UUID,
    p_type       type_notification,
    p_titre      TEXT,
    p_corps      TEXT,
    p_route      TEXT,
    p_donnees    JSONB DEFAULT '{}'::jsonb,
    p_parametre  TEXT  DEFAULT NULL,
    p_financier  BOOLEAN DEFAULT FALSE
) RETURNS INTEGER AS $$
DECLARE
    v_actif      BOOLEAN;
    v_politique  politique_canal;
    v_tuteur     RECORD;
    v_joignable  canal_notification;
    v_posees     INTEGER := 0;
BEGIN
    IF p_parametre IS NOT NULL THEN
        SELECT valeur = 'true' INTO v_actif FROM parametres WHERE cle = p_parametre;
        IF NOT COALESCE(v_actif, TRUE) THEN
            RETURN 0;
        END IF;
    END IF;

    SELECT politique INTO v_politique
      FROM politiques_notification WHERE type = p_type;

    -- Un type absent de la table garde l'ancien comportement : ajouter une
    -- valeur à l'énumération ne doit pas faire taire silencieusement ses
    -- notifications.
    v_politique := COALESCE(v_politique, 'PUSH_SINON_SMS');

    IF v_politique = 'AUCUN' THEN
        RETURN 0;
    END IF;

    FOR v_tuteur IN
        SELECT t.id, t.utilisateur_id, t.telephone, t.accepte_sms
          FROM eleve_tuteur et
          JOIN tuteurs t ON t.id = et.tuteur_id
         WHERE et.eleve_id = p_eleve_id
           AND (NOT p_financier OR et.est_responsable_financier)
    LOOP
        v_joignable := fn_canal_tuteur(v_tuteur.id);

        -- --- Push -----------------------------------------------------------
        -- Uniquement si le tuteur est RÉELLEMENT joignable ainsi : une
        -- notification push sans appareil n'arrive nulle part et reste en file.
        IF v_politique IN ('PUSH_SINON_SMS', 'PUSH_ET_SMS', 'PUSH_SEUL')
           AND v_joignable = 'PUSH' THEN
            INSERT INTO notifications (
                destinataire_id, telephone, eleve_id, type, canal,
                titre, corps, route_cible, donnees
            ) VALUES (
                v_tuteur.utilisateur_id, NULL, p_eleve_id, p_type,
                'PUSH'::canal_notification, p_titre, p_corps, p_route, p_donnees
            );
            v_posees := v_posees + 1;
        END IF;

        -- --- SMS -------------------------------------------------------------
        -- `PUSH_SINON_SMS` n'envoie de SMS que si le push a échoué à l'être ;
        -- `PUSH_ET_SMS` et `SMS_SEUL` en envoient toujours. Dans tous les cas,
        -- le consentement du tuteur prime.
        IF v_tuteur.telephone IS NOT NULL
           AND COALESCE(v_tuteur.accepte_sms, TRUE)
           AND (
                v_politique IN ('SMS_SEUL', 'PUSH_ET_SMS')
                OR (v_politique = 'PUSH_SINON_SMS' AND v_joignable <> 'PUSH')
           ) THEN
            INSERT INTO notifications (
                destinataire_id, telephone, eleve_id, type, canal,
                titre, corps, route_cible, donnees
            ) VALUES (
                v_tuteur.utilisateur_id, v_tuteur.telephone, p_eleve_id, p_type,
                'SMS'::canal_notification, p_titre, p_corps, p_route, p_donnees
            );
            v_posees := v_posees + 1;
        END IF;

        -- --- Ni l'un ni l'autre ----------------------------------------------
        -- La notification est déposée dans l'application : elle attend le jour
        -- où le parent l'installera, plutôt que d'être perdue.
        IF v_posees = 0 OR v_joignable = 'IN_APP' THEN
            IF NOT EXISTS (
                SELECT 1 FROM notifications
                 WHERE eleve_id = p_eleve_id AND type = p_type
                   AND destinataire_id IS NOT DISTINCT FROM v_tuteur.utilisateur_id
                   AND cree_le > now() - interval '1 minute'
            ) THEN
                INSERT INTO notifications (
                    destinataire_id, telephone, eleve_id, type, canal,
                    titre, corps, route_cible, donnees
                ) VALUES (
                    v_tuteur.utilisateur_id, NULL, p_eleve_id, p_type,
                    'IN_APP'::canal_notification, p_titre, p_corps, p_route, p_donnees
                );
                v_posees := v_posees + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN v_posees;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Recensement, enrichi de la politique
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS v_couverture_notifications;

CREATE VIEW v_couverture_notifications AS
SELECT p.type::text                     AS type,
       p.libelle,
       p.politique::text                AS politique,
       p.volume_attendu,
       p.description,
       COALESCE(n.total, 0)             AS deja_produites,
       COALESCE(n.cout, 0)              AS cout_total_fcfa
  FROM politiques_notification p
  LEFT JOIN (
        SELECT type::text AS type, count(*) AS total, COALESCE(sum(cout_fcfa), 0) AS cout
          FROM notifications GROUP BY 1
       ) n ON n.type = p.type::text;

COMMENT ON VIEW v_couverture_notifications IS
    'Les treize types, leur politique de canal, leur volume produit et leur cout.';
