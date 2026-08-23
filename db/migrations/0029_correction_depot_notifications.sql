-- ---------------------------------------------------------------------------
-- 0029 — Deux corrections au dépôt des notifications
--
-- Trouvées en éprouvant les cinq politiques sur un élève réel, avant mise en
-- service. Aucune n'était visible à la lecture du code.
--
-- 1. LE COMPTEUR ÉTAIT GLOBAL, PAS PAR TUTEUR
--
--    `v_posees` s'accumule sur toute la boucle. Le test « aucun canal n'a
--    fonctionné pour ce tuteur » s'écrivait `v_posees = 0`, ce qui n'est vrai
--    que pour le PREMIER tuteur. À partir du second, le repli ne se
--    déclenchait plus jamais — et un parent sans application ni SMS ne
--    recevait rien du tout, silencieusement.
--
-- 2. UN DÉPÔT SANS DESTINATAIRE NI NUMÉRO EST IMPOSSIBLE
--
--    `chk_destinataire` exige l'un ou l'autre, et elle a raison : une
--    notification sans compte ni téléphone n'atteindra jamais personne. Or le
--    repli IN_APP l'ignorait et tentait l'insertion pour des tuteurs sans
--    compte — la transaction entière échouait, emportant l'événement qui
--    l'avait déclenchée. Une absence saisie n'aurait alors pas été enregistrée.
--
--    Le repli n'a de sens que si un COMPTE existe : c'est lui qui affichera la
--    notification le jour où le parent installera l'application. Sans compte et
--    sans SMS, il n'y a rien à faire — et le dire est plus honnête que de
--    stocker un message que personne ne lira.
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
    v_actif        BOOLEAN;
    v_politique    politique_canal;
    v_tuteur       RECORD;
    v_joignable    canal_notification;
    v_pour_tuteur  INTEGER;
    v_posees       INTEGER := 0;
BEGIN
    IF p_parametre IS NOT NULL THEN
        SELECT valeur = 'true' INTO v_actif FROM parametres WHERE cle = p_parametre;
        IF NOT COALESCE(v_actif, TRUE) THEN
            RETURN 0;
        END IF;
    END IF;

    SELECT politique INTO v_politique
      FROM politiques_notification WHERE type = p_type;
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
        v_pour_tuteur := 0;
        v_joignable := fn_canal_tuteur(v_tuteur.id);

        -- --- Push ------------------------------------------------------------
        IF v_politique IN ('PUSH_SINON_SMS', 'PUSH_ET_SMS', 'PUSH_SEUL')
           AND v_joignable = 'PUSH'
           AND v_tuteur.utilisateur_id IS NOT NULL THEN
            INSERT INTO notifications (
                destinataire_id, telephone, eleve_id, type, canal,
                titre, corps, route_cible, donnees
            ) VALUES (
                v_tuteur.utilisateur_id, NULL, p_eleve_id, p_type,
                'PUSH'::canal_notification, p_titre, p_corps, p_route, p_donnees
            );
            v_pour_tuteur := v_pour_tuteur + 1;
        END IF;

        -- --- SMS --------------------------------------------------------------
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
            v_pour_tuteur := v_pour_tuteur + 1;
        END IF;

        -- --- Rien n'a pu partir pour CE tuteur ---------------------------------
        -- Le message est déposé dans son application, pour le jour où il s'y
        -- connectera. Uniquement s'il a un compte : sans compte ni numéro, il
        -- n'existe aucun endroit où le lui montrer, et `chk_destinataire`
        -- refuserait la ligne — emportant avec elle l'événement déclencheur.
        IF v_pour_tuteur = 0 AND v_tuteur.utilisateur_id IS NOT NULL THEN
            INSERT INTO notifications (
                destinataire_id, telephone, eleve_id, type, canal,
                titre, corps, route_cible, donnees
            ) VALUES (
                v_tuteur.utilisateur_id, NULL, p_eleve_id, p_type,
                'IN_APP'::canal_notification, p_titre, p_corps, p_route, p_donnees
            );
            v_pour_tuteur := v_pour_tuteur + 1;
        END IF;

        v_posees := v_posees + v_pour_tuteur;
    END LOOP;

    RETURN v_posees;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Qui reste hors d'atteinte
--
-- Ni compte, ni consentement SMS : ces tuteurs ne recevront jamais rien, quelle
-- que soit la politique. Le secrétariat doit pouvoir les lister pour les
-- rappeler, plutôt que de découvrir le problème quand un parent se plaint.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_tuteurs_injoignables AS
SELECT t.id, t.nom, t.prenom, t.telephone,
       t.utilisateur_id IS NOT NULL AS a_un_compte,
       t.accepte_sms,
       (SELECT count(*) FROM eleve_tuteur et WHERE et.tuteur_id = t.id) AS nb_enfants
  FROM tuteurs t
 WHERE t.utilisateur_id IS NULL
   AND (t.telephone IS NULL OR NOT COALESCE(t.accepte_sms, TRUE));

COMMENT ON VIEW v_tuteurs_injoignables IS
    'Tuteurs sans compte ET sans SMS : aucune notification ne peut les atteindre.';
