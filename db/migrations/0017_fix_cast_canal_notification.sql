-- =============================================================================
-- 0017 — Correctif : transtypage du canal de notification.
--
-- PROBLÈME DÉTECTÉ (recette de la vie scolaire)
-- La fonction de 0016 construisait le canal par un CASE :
--     CASE WHEN ... THEN 'PUSH' ELSE 'SMS' END
-- PostgreSQL type ce résultat en `text`, alors que la colonne attend
-- l'énumération `canal_notification`. Toute saisie d'absence échouait donc
-- avec « column "canal" is of type canal_notification but expression is of
-- type text » — c'est-à-dire que la fonctionnalité la plus attendue des
-- familles était totalement bloquée.
--
-- CORRECTIF : transtypage explicite du CASE.
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_notifier_absence() RETURNS TRIGGER AS $$
DECLARE
    v_actif     BOOLEAN;
    v_eleve     RECORD;
    v_tuteur    RECORD;
    v_date      TEXT;
BEGIN
    SELECT valeur = 'true' INTO v_actif
      FROM parametres WHERE cle = 'notification_absence_immediate';

    IF NOT COALESCE(v_actif, TRUE) THEN
        RETURN NEW;
    END IF;

    SELECT e.id, e.nom, e.prenom
      INTO v_eleve
      FROM inscriptions i
      JOIN eleves e ON e.id = i.eleve_id
     WHERE i.id = NEW.inscription_id;

    v_date := to_char(NEW.date_absence, 'DD/MM/YYYY');

    FOR v_tuteur IN
        SELECT t.id, t.telephone, t.utilisateur_id, t.accepte_sms
          FROM eleve_tuteur et
          JOIN tuteurs t ON t.id = et.tuteur_id
         WHERE et.eleve_id = v_eleve.id
    LOOP
        INSERT INTO notifications (
            destinataire_id, telephone, eleve_id, type, canal,
            titre, corps, route_cible, donnees
        ) VALUES (
            v_tuteur.utilisateur_id,
            CASE WHEN v_tuteur.utilisateur_id IS NULL AND v_tuteur.accepte_sms
                 THEN v_tuteur.telephone END,
            v_eleve.id,
            'ABSENCE'::type_notification,
            (CASE WHEN v_tuteur.utilisateur_id IS NOT NULL THEN 'PUSH' ELSE 'SMS' END)::canal_notification,
            'Absence signalée',
            format('%s %s a été absent(e) le %s (%s h).',
                   v_eleve.prenom, v_eleve.nom, v_date, NEW.nb_heures),
            format('/eleves/%s/assiduite', v_eleve.id),
            jsonb_build_object('absence_id', NEW.id, 'date', NEW.date_absence)
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
