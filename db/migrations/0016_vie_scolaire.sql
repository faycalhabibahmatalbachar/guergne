-- =============================================================================
-- 0016 — Vie scolaire : notification automatique des absences, seuils
--        d'alerte, effet des sanctions sur le statut de l'élève.
-- =============================================================================

-- --------------------------------------------------------------------------
-- Feuille d'appel : la séance devient obligatoire pour une absence de cours
--
-- Une absence « à un cours » sans séance rattachée ne permet ni de savoir quel
-- professeur a fait l'appel, ni de recouper avec l'emploi du temps.
-- --------------------------------------------------------------------------
ALTER TABLE seances
    ADD COLUMN IF NOT EXISTS appel_par UUID REFERENCES utilisateurs(id),
    ADD COLUMN IF NOT EXISTS appel_le  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_seances_appel_manquant
    ON seances(date_seance DESC) WHERE NOT appel_effectue;

-- --------------------------------------------------------------------------
-- Notification automatique des tuteurs à la saisie d'une absence
--
-- C'est la fonctionnalité la plus attendue des familles. Elle est déclenchée
-- en base plutôt que dans l'application : une absence saisie par import, par
-- script ou par une future application enseignant doit produire la même
-- notification, sans dépendre du chemin d'écriture.
--
-- On n'ENVOIE rien ici — on met en file. L'expédition (push puis repli SMS)
-- est faite par un travailleur qui lit `notifications` en statut EN_ATTENTE.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_notifier_absence() RETURNS TRIGGER AS $$
DECLARE
    v_actif     BOOLEAN;
    v_eleve     RECORD;
    v_tuteur    RECORD;
    v_date      TEXT;
BEGIN
    -- Respecte le paramétrage de l'établissement.
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

    -- Une notification par tuteur rattaché. Le tuteur sans compte applicatif
    -- reçoit une entrée SMS : c'est le repli prévu pour les familles sans
    -- smartphone.
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
            'ABSENCE',
            CASE WHEN v_tuteur.utilisateur_id IS NOT NULL THEN 'PUSH' ELSE 'SMS' END,
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

DROP TRIGGER IF EXISTS absences_notification ON absences;
CREATE TRIGGER absences_notification
    AFTER INSERT ON absences
    FOR EACH ROW EXECUTE FUNCTION trg_notifier_absence();

-- --------------------------------------------------------------------------
-- Une sanction d'exclusion temporaire suspend l'élève
--
-- Sans ce lien, la sanction est prononcée mais l'élève reste « inscrit » :
-- la vie scolaire le compte présent et le portail parent n'annonce rien.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_sanction_statut() RETURNS TRIGGER AS $$
DECLARE
    v_eleve_id UUID;
    v_annee_id UUID;
    v_statut   statut_eleve;
BEGIN
    IF NOT NEW.impacte_statut THEN
        RETURN NEW;
    END IF;

    v_statut := CASE NEW.type
        WHEN 'EXCLUSION_TEMPORAIRE' THEN 'SUSPENDU_DISCIPLINE'::statut_eleve
        WHEN 'EXCLUSION_DEFINITIVE' THEN 'EXCLU'::statut_eleve
        ELSE NULL
    END;

    IF v_statut IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT i.eleve_id, i.annee_id INTO v_eleve_id, v_annee_id
      FROM inscriptions i WHERE i.id = NEW.inscription_id;

    INSERT INTO historique_statuts (
        eleve_id, annee_id, ancien_statut, nouveau_statut,
        motif, date_effet, date_fin_prevue, sanction_id, decide_par
    )
    SELECT v_eleve_id, v_annee_id, e.statut, v_statut,
           NEW.motif, NEW.date_debut, NEW.date_fin, NEW.id, NEW.prononcee_par
      FROM eleves e WHERE e.id = v_eleve_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sanctions_statut ON sanctions;
CREATE TRIGGER sanctions_statut
    AFTER INSERT ON sanctions
    FOR EACH ROW EXECUTE FUNCTION trg_sanction_statut();

-- --------------------------------------------------------------------------
-- Vue : alertes d'assiduité
--
-- Élèves dépassant le seuil d'heures non justifiées fixé par l'établissement.
-- Alimente le tableau de bord de la vie scolaire et déclenche les convocations.
-- --------------------------------------------------------------------------
CREATE VIEW v_alertes_assiduite AS
SELECT
    i.id                        AS inscription_id,
    e.id                        AS eleve_id,
    e.matricule,
    e.nom,
    e.prenom,
    c.id                        AS classe_id,
    c.libelle                   AS classe,
    p.id                        AS periode_id,
    p.libelle                   AS periode,
    COALESCE(SUM(a.nb_heures) FILTER (WHERE a.statut <> 'JUSTIFIEE'), 0) AS heures_non_justifiees,
    COALESCE(SUM(a.nb_heures) FILTER (WHERE a.statut = 'JUSTIFIEE'), 0)  AS heures_justifiees,
    (SELECT count(*) FROM retards r
      WHERE r.inscription_id = i.id AND r.periode_id = p.id)             AS nb_retards,
    (SELECT seuil_alerte_absence_heures FROM etablissement WHERE id)     AS seuil
FROM inscriptions i
JOIN eleves e   ON e.id = i.eleve_id
JOIN classes c  ON c.id = i.classe_id
JOIN periodes p ON p.annee_id = i.annee_id
LEFT JOIN absences a ON a.inscription_id = i.id AND a.periode_id = p.id
WHERE i.active
GROUP BY i.id, e.id, c.id, p.id
HAVING COALESCE(SUM(a.nb_heures) FILTER (WHERE a.statut <> 'JUSTIFIEE'), 0)
       >= (SELECT seuil_alerte_absence_heures FROM etablissement WHERE id);

COMMENT ON VIEW v_alertes_assiduite IS
    'Élèves ayant atteint le seuil d''absences non justifiées de l''établissement.';

-- --------------------------------------------------------------------------
-- Index de travail de la vie scolaire
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_absences_non_justifiees
    ON absences(inscription_id) WHERE statut = 'NON_JUSTIFIEE';

CREATE INDEX IF NOT EXISTS idx_incidents_periode
    ON incidents(periode_id, date_incident DESC);

CREATE INDEX IF NOT EXISTS idx_sanctions_en_cours
    ON sanctions(date_fin) WHERE NOT executee;
