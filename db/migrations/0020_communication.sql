-- =============================================================================
-- 0020 — Communication : ciblage des annonces, file d'expédition,
--        notifications métier au-delà des absences.
-- =============================================================================

-- --------------------------------------------------------------------------
-- File d'expédition : ce qui manquait pour qu'un travailleur puisse envoyer
--
-- La table `notifications` savait quoi envoyer, mais pas comment gérer un
-- échec : sans date de prochaine tentative, un SMS en échec était soit rejoué
-- en boucle, soit jamais.
-- --------------------------------------------------------------------------
ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS prochaine_tentative_le TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS reference_externe      TEXT;

COMMENT ON COLUMN notifications.prochaine_tentative_le IS
    'Report exponentiel après échec : 1 min, 5 min, 25 min, puis abandon.';

-- L'index de file d'attente doit trier par échéance, pas par date de création :
-- une notification reportée ne doit pas bloquer les suivantes.
DROP INDEX IF EXISTS idx_notifications_file;
CREATE INDEX idx_notifications_file
    ON notifications(prochaine_tentative_le)
 WHERE statut = 'EN_ATTENTE';

-- --------------------------------------------------------------------------
-- Ciblage d'une annonce par élève
--
-- Le modèle initial ciblait « tous », un niveau ou une classe. Il manquait le
-- cas le plus courant après l'annonce générale : le message à une poignée de
-- familles précises (retard de paiement, convocation de groupe).
-- --------------------------------------------------------------------------
CREATE TABLE annonce_destinataires (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    annonce_id  UUID NOT NULL REFERENCES annonces(id) ON DELETE CASCADE,
    eleve_id    UUID NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
    cree_le     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (annonce_id, eleve_id)
);

CREATE INDEX idx_annonce_destinataires ON annonce_destinataires(annonce_id);

-- --------------------------------------------------------------------------
-- Mise en file des notifications d'une annonce
--
-- Une annonce publiée avec `envoyer_push` doit atteindre les tuteurs des
-- élèves ciblés. On calcule la population concernée une seule fois, au moment
-- de la publication : recalculer à l'envoi donnerait des résultats différents
-- si un élève change de classe entre-temps.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION diffuser_annonce(p_annonce_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_annonce   RECORD;
    v_nb        INTEGER := 0;
BEGIN
    SELECT * INTO v_annonce FROM annonces WHERE id = p_annonce_id;
    IF NOT FOUND OR NOT v_annonce.envoyer_push THEN
        RETURN 0;
    END IF;

    INSERT INTO notifications (
        destinataire_id, telephone, eleve_id, type, canal,
        titre, corps, route_cible, donnees
    )
    SELECT DISTINCT
        t.utilisateur_id,
        CASE WHEN t.utilisateur_id IS NULL AND t.accepte_sms THEN t.telephone END,
        e.id,
        'ANNONCE'::type_notification,
        (CASE WHEN t.utilisateur_id IS NOT NULL THEN 'PUSH' ELSE 'SMS' END)::canal_notification,
        v_annonce.titre,
        v_annonce.contenu,
        format('/annonces/%s', v_annonce.id),
        jsonb_build_object('annonce_id', v_annonce.id)
      FROM eleves e
      JOIN inscriptions i   ON i.eleve_id = e.id AND i.active
      JOIN classes c        ON c.id = i.classe_id
      JOIN eleve_tuteur et  ON et.eleve_id = e.id
      JOIN tuteurs t        ON t.id = et.tuteur_id
     WHERE i.annee_id = v_annonce.annee_id
       AND (
             v_annonce.cible = 'TOUS'
          OR (v_annonce.cible = 'NIVEAU' AND c.niveau_id = v_annonce.niveau_id)
          OR (v_annonce.cible = 'CLASSE' AND c.id = v_annonce.classe_id)
          OR (v_annonce.cible = 'ELEVE'  AND EXISTS (
                SELECT 1 FROM annonce_destinataires ad
                 WHERE ad.annonce_id = v_annonce.id AND ad.eleve_id = e.id))
       )
       -- Le tuteur principal suffit pour une annonce générale : inonder les
       -- deux parents du même message coûte double en SMS sans rien apporter.
       AND (v_annonce.cible <> 'TOUS' OR et.est_principal);

    GET DIAGNOSTICS v_nb = ROW_COUNT;
    RETURN v_nb;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION diffuser_annonce IS
    'Met en file les notifications d''une annonce selon son ciblage.';

-- --------------------------------------------------------------------------
-- Notification à la publication des notes d'une évaluation
--
-- Prévu au cahier des charges (« Nouvelle note publiée »). Comme pour les
-- absences, le déclenchement est en base : la publication passe par plusieurs
-- chemins et doit toujours prévenir les familles.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_notifier_notes_publiees() RETURNS TRIGGER AS $$
DECLARE
    v_actif   BOOLEAN;
    v_matiere TEXT;
BEGIN
    IF NEW.statut <> 'PUBLIEE' OR OLD.statut = 'PUBLIEE' THEN
        RETURN NEW;
    END IF;

    SELECT valeur = 'true' INTO v_actif
      FROM parametres WHERE cle = 'notification_note_publiee';
    IF NOT COALESCE(v_actif, TRUE) THEN
        RETURN NEW;
    END IF;

    SELECT libelle INTO v_matiere FROM matieres WHERE id = NEW.matiere_id;

    INSERT INTO notifications (
        destinataire_id, telephone, eleve_id, type, canal,
        titre, corps, route_cible, donnees
    )
    SELECT
        t.utilisateur_id,
        CASE WHEN t.utilisateur_id IS NULL AND t.accepte_sms THEN t.telephone END,
        e.id,
        'NOTE_PUBLIEE'::type_notification,
        (CASE WHEN t.utilisateur_id IS NOT NULL THEN 'PUSH' ELSE 'SMS' END)::canal_notification,
        'Nouvelle note publiée',
        format('%s : la note de %s (%s) est disponible.', e.prenom, v_matiere, NEW.titre),
        format('/eleves/%s/notes', e.id),
        jsonb_build_object('evaluation_id', NEW.id)
      FROM notes n
      JOIN inscriptions i  ON i.id = n.inscription_id
      JOIN eleves e        ON e.id = i.eleve_id
      JOIN eleve_tuteur et ON et.eleve_id = e.id AND et.est_principal
      JOIN tuteurs t       ON t.id = et.tuteur_id
     WHERE n.evaluation_id = NEW.id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS evaluations_notification ON evaluations;
CREATE TRIGGER evaluations_notification
    AFTER UPDATE OF statut ON evaluations
    FOR EACH ROW EXECUTE FUNCTION trg_notifier_notes_publiees();

-- --------------------------------------------------------------------------
-- Vue : file d'expédition prête à traiter
-- --------------------------------------------------------------------------
CREATE VIEW v_file_notifications AS
SELECT n.id, n.canal, n.type, n.titre, n.corps, n.route_cible, n.donnees,
       n.telephone, n.destinataire_id, n.tentatives, n.eleve_id,
       (SELECT array_agg(a.jeton_fcm) FROM appareils a
         WHERE a.utilisateur_id = n.destinataire_id AND a.actif) AS jetons_fcm
  FROM notifications n
 WHERE n.statut = 'EN_ATTENTE'
   AND n.prochaine_tentative_le <= now()
   AND n.tentatives < 3
 ORDER BY n.cree_le;

COMMENT ON VIEW v_file_notifications IS
    'Notifications prêtes à être expédiées, avec les jetons FCM du destinataire.';
