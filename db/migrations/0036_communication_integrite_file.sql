-- ---------------------------------------------------------------------------
-- 0036 — Intégrité de la communication et réservation atomique de la file
-- ---------------------------------------------------------------------------
-- 1) Les notifications internes ne doivent pas occuper la file d'expédition.
-- 2) Une ligne PUSH/SMS ne peut être réservée que par un seul worker à la fois.
-- 3) La diffusion d'une annonce doit appliquer la politique active, respecter
--    le consentement SMS, ignorer les classes inactives et ne jamais créer une
--    notification sans destinataire.
-- ---------------------------------------------------------------------------

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS traitement_id UUID,
  ADD COLUMN IF NOT EXISTS traitement_le TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_file_sortie
  ON notifications (prochaine_tentative_le, cree_le)
  WHERE statut = 'EN_ATTENTE'::statut_envoi
    AND canal IN ('PUSH'::canal_notification, 'SMS'::canal_notification);

CREATE INDEX IF NOT EXISTS idx_notifications_annonce_id
  ON notifications ((donnees ->> 'annonce_id'))
  WHERE donnees ? 'annonce_id';

CREATE OR REPLACE VIEW v_file_notifications AS
SELECT n.id, n.canal, n.type, n.titre, n.corps, n.route_cible, n.donnees,
       n.telephone, n.destinataire_id, n.tentatives, n.eleve_id,
       (SELECT array_agg(a.jeton_fcm)
          FROM appareils a
         WHERE a.utilisateur_id = n.destinataire_id
           AND a.actif AND a.jeton_fcm IS NOT NULL) AS jetons_fcm
  FROM notifications n
 WHERE n.statut = 'EN_ATTENTE'::statut_envoi
   AND n.canal IN ('PUSH'::canal_notification, 'SMS'::canal_notification)
   AND n.prochaine_tentative_le <= now()
   AND n.tentatives < 3
   AND (n.traitement_id IS NULL OR n.traitement_le IS NULL
        OR n.traitement_le < now() - interval '10 minutes')
 ORDER BY n.prochaine_tentative_le, n.cree_le;

COMMENT ON VIEW v_file_notifications IS
  'File sortante uniquement (PUSH/SMS), éléments prêts et non réservés par un worker actif.';

COMMENT ON COLUMN notifications.traitement_id IS
  'Identifiant du worker ayant réservé la notification pour éviter les traitements concurrents.';
COMMENT ON COLUMN notifications.traitement_le IS
  'Début de réservation du worker; un bail expiré après 10 minutes peut être repris.';

CREATE OR REPLACE FUNCTION diffuser_annonce(p_annonce_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_annonce      RECORD;
    v_politique    politique_canal;
    v_contact      RECORD;
    v_posees       INTEGER := 0;
    v_pour_contact INTEGER;
BEGIN
    SELECT * INTO v_annonce FROM annonces WHERE id = p_annonce_id;
    IF NOT FOUND OR NOT v_annonce.envoyer_push THEN
        RETURN 0;
    END IF;

    SELECT politique INTO v_politique
      FROM politiques_notification
     WHERE type = 'ANNONCE'::type_notification;
    v_politique := COALESCE(v_politique, 'PUSH_SINON_SMS');

    IF v_politique = 'AUCUN' THEN
        RETURN 0;
    END IF;

    FOR v_contact IN
        SELECT DISTINCT ON (i.eleve_id, t.id)
               i.eleve_id, t.id AS tuteur_id, t.utilisateur_id,
               t.telephone, COALESCE(t.accepte_sms, TRUE) AS accepte_sms,
               COALESCE(u.actif AND u.role::text = 'PARENT', FALSE) AS compte_actif,
               EXISTS (
                   SELECT 1 FROM appareils a
                    WHERE a.utilisateur_id = t.utilisateur_id
                      AND a.actif AND a.jeton_fcm IS NOT NULL
               ) AS push_disponible
          FROM inscriptions i
          JOIN classes c ON c.id = i.classe_id
          JOIN eleve_tuteur et ON et.eleve_id = i.eleve_id
          JOIN tuteurs t ON t.id = et.tuteur_id
          LEFT JOIN utilisateurs u ON u.id = t.utilisateur_id
         WHERE i.annee_id = v_annonce.annee_id
           AND i.active
           AND c.annee_id = v_annonce.annee_id
           AND c.active
           AND (
                 v_annonce.cible = 'TOUS'
              OR (v_annonce.cible = 'NIVEAU' AND c.niveau_id = v_annonce.niveau_id)
              OR (v_annonce.cible = 'CLASSE' AND c.id = v_annonce.classe_id)
              OR (v_annonce.cible = 'ELEVE' AND EXISTS (
                    SELECT 1 FROM annonce_destinataires ad
                     WHERE ad.annonce_id = v_annonce.id
                       AND ad.eleve_id = i.eleve_id))
           )
           AND (v_annonce.cible <> 'TOUS' OR et.est_principal)
         ORDER BY i.eleve_id, t.id
    LOOP
        v_pour_contact := 0;

        -- PUSH seulement si l'application du parent possède un jeton actif.
        IF v_contact.compte_actif
           AND v_contact.push_disponible
           AND v_politique IN ('PUSH_SINON_SMS', 'PUSH_ET_SMS', 'PUSH_SEUL') THEN
            INSERT INTO notifications (
                destinataire_id, telephone, eleve_id, type, canal,
                titre, corps, route_cible, donnees
            ) VALUES (
                v_contact.utilisateur_id, NULL, v_contact.eleve_id,
                'ANNONCE'::type_notification, 'PUSH'::canal_notification,
                v_annonce.titre, v_annonce.contenu,
                format('/annonces/%s', v_annonce.id),
                jsonb_build_object('annonce_id', v_annonce.id)
            );
            v_pour_contact := v_pour_contact + 1;
        END IF;

        -- Le SMS suit la politique du lycée ET le consentement enregistré.
        IF v_contact.telephone IS NOT NULL
           AND v_contact.accepte_sms
           AND (
                v_politique IN ('SMS_SEUL', 'PUSH_ET_SMS')
                OR (v_politique = 'PUSH_SINON_SMS' AND NOT v_contact.push_disponible)
           ) THEN
            INSERT INTO notifications (
                destinataire_id, telephone, eleve_id, type, canal,
                titre, corps, route_cible, donnees
            ) VALUES (
                v_contact.utilisateur_id, v_contact.telephone, v_contact.eleve_id,
                'ANNONCE'::type_notification, 'SMS'::canal_notification,
                v_annonce.titre, v_annonce.contenu,
                format('/annonces/%s', v_annonce.id),
                jsonb_build_object('annonce_id', v_annonce.id)
            );
            v_pour_contact := v_pour_contact + 1;
        END IF;

        -- Repli interne uniquement pour un compte actif : jamais de ligne
        -- sans compte ni numéro (la contrainte chk_destinataire l'interdit).
        IF v_pour_contact = 0 AND v_contact.compte_actif THEN
            INSERT INTO notifications (
                destinataire_id, telephone, eleve_id, type, canal,
                titre, corps, route_cible, donnees
            ) VALUES (
                v_contact.utilisateur_id, NULL, v_contact.eleve_id,
                'ANNONCE'::type_notification, 'IN_APP'::canal_notification,
                v_annonce.titre, v_annonce.contenu,
                format('/annonces/%s', v_annonce.id),
                jsonb_build_object('annonce_id', v_annonce.id)
            );
            v_pour_contact := v_pour_contact + 1;
        END IF;

        v_posees := v_posees + v_pour_contact;
    END LOOP;

    RETURN v_posees;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION diffuser_annonce IS
  'Diffuse une annonce selon la politique active, les inscriptions et les canaux réellement disponibles.';
