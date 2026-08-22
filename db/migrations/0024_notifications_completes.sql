-- ---------------------------------------------------------------------------
-- 0024 — Toutes les notifications aux parents
--
-- POURQUOI
-- --------
-- L'énumération `type_notification` compte treize valeurs. Deux seulement
-- étaient produites : ABSENCE et NOTE_PUBLIEE. Les onze autres existaient dans
-- le type, dans l'application mobile qui sait les afficher, et dans l'esprit de
-- tout le monde — mais rien ne les créait. Un parent dont l'enfant recevait une
-- sanction, était convoqué, ou dont l'échéance arrivait à terme n'apprenait
-- rien.
--
-- LE DÉFAUT DE FOND, CORRIGÉ ICI
-- ------------------------------
-- Les deux déclencheurs existants choisissaient le canal ainsi :
--
--     CASE WHEN t.utilisateur_id IS NOT NULL THEN 'PUSH' ELSE 'SMS' END
--
-- Autrement dit : « ce tuteur a un compte, donc il a l'application ». C'est
-- faux. Avoir un compte veut dire que le secrétariat a créé un accès ; avoir
-- l'application veut dire que le parent l'a installée, ouverte, autorisé les
-- notifications, et que son jeton est parvenu au serveur. Entre les deux, il y
-- a tout ce qui peut ne pas arriver.
--
-- Conséquence mesurée le 22/08/2026 : quatre-vingt-neuf notifications PUSH en
-- attente pour un seul appareil enregistré. Quatre-vingt-huit familles que
-- l'école croyait prévenues, et dont le `telephone` était laissé NULL — donc
-- même pas rattrapables par SMS.
--
-- La règle devient : **PUSH si un appareil actif porte un jeton, SMS sinon.**
-- C'est l'état de fait qui décide, pas une intention.
--
-- CE QUI N'EST PAS FAIT ICI
-- -------------------------
-- Les échéances de paiement ne sont pas un événement mais une date qui
-- approche : aucun déclencheur ne peut s'en charger. Une fonction appelable
-- est fournie (`fn_relancer_echeances`), à brancher sur la tâche planifiée qui
-- vide déjà la file.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. Le choix du canal, en un seul endroit
--
-- Recopié dans chaque déclencheur, il finirait par diverger — c'est exactement
-- ce qui est arrivé aux deux premiers. Une fonction, et les onze suivants en
-- héritent.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_canal_tuteur(p_tuteur_id UUID)
RETURNS canal_notification AS $$
DECLARE
    v_joignable_push BOOLEAN;
    v_accepte_sms    BOOLEAN;
BEGIN
    SELECT EXISTS (
             SELECT 1
               FROM appareils a
               JOIN tuteurs t ON t.utilisateur_id = a.utilisateur_id
              WHERE t.id = p_tuteur_id
                AND a.actif
                AND a.jeton_fcm IS NOT NULL
           ),
           COALESCE(t2.accepte_sms, TRUE)
      INTO v_joignable_push, v_accepte_sms
      FROM tuteurs t2
     WHERE t2.id = p_tuteur_id;

    IF v_joignable_push THEN
        RETURN 'PUSH'::canal_notification;
    END IF;

    IF v_accepte_sms THEN
        RETURN 'SMS'::canal_notification;
    END IF;

    -- Ni application, ni consentement SMS : la notification est déposée dans
    -- l'application pour le jour où le parent l'installera. Elle n'est jamais
    -- perdue, elle attend.
    RETURN 'IN_APP'::canal_notification;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION fn_canal_tuteur IS
    'Canal reellement joignable pour ce tuteur : PUSH si un appareil actif porte un jeton, SMS si consenti, IN_APP sinon.';


-- ---------------------------------------------------------------------------
-- 2. Poser une notification pour tous les tuteurs d'un élève
--
-- `p_parametre` permet à l'établissement de couper un type d'alerte sans
-- toucher au code : une ligne dans `parametres`, et le déclencheur se tait.
-- Absent de la table, le paramètre vaut « actif » — on ne perd pas une alerte
-- parce qu'une ligne de configuration manque.
--
-- `p_financier` restreint aux responsables financiers : inutile d'annoncer un
-- reçu de paiement à un oncle autorisé à venir chercher l'enfant.
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
    v_actif  BOOLEAN;
    v_tuteur RECORD;
    v_canal  canal_notification;
    v_posees INTEGER := 0;
BEGIN
    IF p_parametre IS NOT NULL THEN
        SELECT valeur = 'true' INTO v_actif FROM parametres WHERE cle = p_parametre;
        IF NOT COALESCE(v_actif, TRUE) THEN
            RETURN 0;
        END IF;
    END IF;

    FOR v_tuteur IN
        SELECT t.id, t.utilisateur_id, t.telephone
          FROM eleve_tuteur et
          JOIN tuteurs t ON t.id = et.tuteur_id
         WHERE et.eleve_id = p_eleve_id
           AND (NOT p_financier OR et.est_responsable_financier)
    LOOP
        v_canal := fn_canal_tuteur(v_tuteur.id);

        INSERT INTO notifications (
            destinataire_id, telephone, eleve_id, type, canal,
            titre, corps, route_cible, donnees
        ) VALUES (
            v_tuteur.utilisateur_id,
            -- Le numéro accompagne TOUJOURS une notification SMS, et jamais une
            -- notification push : c'est ce qui permet à l'expéditeur de savoir
            -- où envoyer sans refaire la jointure.
            CASE WHEN v_canal = 'SMS' THEN v_tuteur.telephone END,
            p_eleve_id,
            p_type,
            v_canal,
            p_titre,
            p_corps,
            p_route,
            p_donnees
        );

        v_posees := v_posees + 1;
    END LOOP;

    RETURN v_posees;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_notifier_tuteurs IS
    'Depose une notification pour chaque tuteur d''un eleve, sur le canal reellement joignable.';


-- ---------------------------------------------------------------------------
-- 3. Les deux déclencheurs existants, réécrits
--
-- Ils ne choisissent plus le canal eux-mêmes. Au passage, les notes publiées
-- ne s'adressaient qu'au tuteur principal : les deux parents d'un élève ont le
-- même droit de savoir, et le tuteur « principal » n'est qu'une convention
-- administrative pour savoir qui appeler en premier.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_notifier_absence() RETURNS TRIGGER AS $$
DECLARE
    v_eleve RECORD;
BEGIN
    SELECT e.id, e.nom, e.prenom INTO v_eleve
      FROM inscriptions i JOIN eleves e ON e.id = i.eleve_id
     WHERE i.id = NEW.inscription_id;

    PERFORM fn_notifier_tuteurs(
        v_eleve.id,
        'ABSENCE'::type_notification,
        'Absence signalée',
        format('%s %s a été absent(e) le %s (%s h).',
               v_eleve.prenom, v_eleve.nom,
               to_char(NEW.date_absence, 'DD/MM/YYYY'), NEW.nb_heures),
        format('/eleves/%s/assiduite', v_eleve.id),
        jsonb_build_object('absence_id', NEW.id, 'date', NEW.date_absence),
        'notification_absence_immediate'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION trg_notifier_notes_publiees() RETURNS TRIGGER AS $$
DECLARE
    v_matiere TEXT;
    v_eleve   RECORD;
BEGIN
    IF NEW.statut <> 'PUBLIEE' OR OLD.statut = 'PUBLIEE' THEN
        RETURN NEW;
    END IF;

    SELECT libelle INTO v_matiere FROM matieres WHERE id = NEW.matiere_id;

    FOR v_eleve IN
        SELECT DISTINCT e.id, e.prenom
          FROM notes n
          JOIN inscriptions i ON i.id = n.inscription_id
          JOIN eleves e       ON e.id = i.eleve_id
         WHERE n.evaluation_id = NEW.id
    LOOP
        PERFORM fn_notifier_tuteurs(
            v_eleve.id,
            'NOTE_PUBLIEE'::type_notification,
            'Nouvelle note publiée',
            format('%s : la note de %s (%s) est disponible.',
                   v_eleve.prenom, v_matiere, NEW.titre),
            format('/eleves/%s/notes', v_eleve.id),
            jsonb_build_object('evaluation_id', NEW.id),
            'notification_note_publiee'
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ---------------------------------------------------------------------------
-- 4. RETARD
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_notifier_retard() RETURNS TRIGGER AS $$
DECLARE
    v_eleve RECORD;
BEGIN
    SELECT e.id, e.nom, e.prenom INTO v_eleve
      FROM inscriptions i JOIN eleves e ON e.id = i.eleve_id
     WHERE i.id = NEW.inscription_id;

    PERFORM fn_notifier_tuteurs(
        v_eleve.id,
        'RETARD'::type_notification,
        'Retard signalé',
        format('%s est arrivé(e) en retard le %s (%s min).',
               v_eleve.prenom, to_char(NEW.date_retard, 'DD/MM/YYYY'), NEW.duree_minutes),
        format('/eleves/%s/assiduite', v_eleve.id),
        jsonb_build_object('retard_id', NEW.id, 'date', NEW.date_retard),
        'notification_retard'
    );

    UPDATE retards SET parents_notifies = TRUE WHERE id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS retards_notification ON retards;
CREATE TRIGGER retards_notification
    AFTER INSERT ON retards
    FOR EACH ROW EXECUTE FUNCTION trg_notifier_retard();


-- ---------------------------------------------------------------------------
-- 5. INCIDENT
--
-- Les incidents mineurs ne partent pas : un bavardage en classe ne justifie pas
-- de faire sonner le téléphone d'un parent au travail. Le seuil est un
-- paramètre, pas une constante — un établissement peut vouloir tout signaler.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_notifier_incident() RETURNS TRIGGER AS $$
DECLARE
    v_eleve  RECORD;
    v_seuil  TEXT;
BEGIN
    SELECT COALESCE(valeur, 'MOYENNE') INTO v_seuil
      FROM parametres WHERE cle = 'notification_incident_gravite_min';

    IF NEW.gravite::text = 'MINEURE' AND COALESCE(v_seuil, 'MOYENNE') <> 'MINEURE' THEN
        RETURN NEW;
    END IF;

    SELECT e.id, e.prenom INTO v_eleve
      FROM inscriptions i JOIN eleves e ON e.id = i.eleve_id
     WHERE i.id = NEW.inscription_id;

    PERFORM fn_notifier_tuteurs(
        v_eleve.id,
        'INCIDENT'::type_notification,
        'Incident signalé',
        format('%s : incident du %s. %s',
               v_eleve.prenom, to_char(NEW.date_incident, 'DD/MM/YYYY'),
               left(NEW.description, 120)),
        format('/eleves/%s/discipline', v_eleve.id),
        jsonb_build_object('incident_id', NEW.id, 'gravite', NEW.gravite),
        'notification_incident'
    );

    UPDATE incidents SET parents_notifies = TRUE, notifie_le = now() WHERE id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS incidents_notification ON incidents;
CREATE TRIGGER incidents_notification
    AFTER INSERT ON incidents
    FOR EACH ROW EXECUTE FUNCTION trg_notifier_incident();


-- ---------------------------------------------------------------------------
-- 6. SANCTION
--
-- Une sanction se notifie toujours, quelle qu'elle soit : elle a des
-- conséquences concrètes — un enfant exclu trois jours doit être gardé.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_notifier_sanction() RETURNS TRIGGER AS $$
DECLARE
    v_eleve RECORD;
BEGIN
    SELECT e.id, e.prenom INTO v_eleve
      FROM inscriptions i JOIN eleves e ON e.id = i.eleve_id
     WHERE i.id = NEW.inscription_id;

    PERFORM fn_notifier_tuteurs(
        v_eleve.id,
        'SANCTION'::type_notification,
        'Sanction prononcée',
        format('%s : %s du %s%s. Motif : %s',
               v_eleve.prenom,
               replace(NEW.type::text, '_', ' '),
               to_char(NEW.date_debut, 'DD/MM/YYYY'),
               CASE WHEN NEW.date_fin IS NOT NULL
                    THEN ' au ' || to_char(NEW.date_fin, 'DD/MM/YYYY') ELSE '' END,
               left(NEW.motif, 100)),
        format('/eleves/%s/discipline', v_eleve.id),
        jsonb_build_object('sanction_id', NEW.id, 'type', NEW.type)
    );

    UPDATE sanctions SET parents_notifies = TRUE WHERE id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sanctions_notification ON sanctions;
CREATE TRIGGER sanctions_notification
    AFTER INSERT ON sanctions
    FOR EACH ROW EXECUTE FUNCTION trg_notifier_sanction();


-- ---------------------------------------------------------------------------
-- 7. BULLETIN_PUBLIE
--
-- Sur passage à publié seulement. Un bulletin peut être regénéré plusieurs fois
-- avant le conseil de classe ; seule la publication intéresse la famille.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_notifier_bulletin() RETURNS TRIGGER AS $$
DECLARE
    v_eleve   RECORD;
    v_periode TEXT;
BEGIN
    IF NOT NEW.est_publie OR COALESCE(OLD.est_publie, FALSE) THEN
        RETURN NEW;
    END IF;

    SELECT e.id, e.prenom INTO v_eleve
      FROM inscriptions i JOIN eleves e ON e.id = i.eleve_id
     WHERE i.id = NEW.inscription_id;

    SELECT libelle INTO v_periode FROM periodes WHERE id = NEW.periode_id;

    PERFORM fn_notifier_tuteurs(
        v_eleve.id,
        'BULLETIN_PUBLIE'::type_notification,
        'Bulletin disponible',
        format('%s : le bulletin du %s est publié. Moyenne %s, rang %s sur %s.',
               v_eleve.prenom, v_periode,
               to_char(NEW.moyenne_generale, 'FM99D99'),
               NEW.rang, NEW.effectif_classe),
        format('/eleves/%s/bulletins', v_eleve.id),
        jsonb_build_object('bulletin_id', NEW.id, 'periode_id', NEW.periode_id),
        'notification_bulletin_publie'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bulletins_notification ON bulletins;
CREATE TRIGGER bulletins_notification
    AFTER UPDATE OF est_publie ON bulletins
    FOR EACH ROW EXECUTE FUNCTION trg_notifier_bulletin();


-- ---------------------------------------------------------------------------
-- 8. PAIEMENT_RECU
--
-- Le reçu part au responsable financier seulement, et jamais pour un paiement
-- annulé. C'est aussi une protection contre la fraude au guichet : le parent
-- reçoit le montant encaissé en son nom, et peut le contester.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_notifier_paiement() RETURNS TRIGGER AS $$
DECLARE
    v_eleve RECORD;
BEGIN
    IF NEW.annule THEN
        RETURN NEW;
    END IF;

    SELECT e.id, e.prenom INTO v_eleve
      FROM inscriptions i JOIN eleves e ON e.id = i.eleve_id
     WHERE i.id = NEW.inscription_id;

    PERFORM fn_notifier_tuteurs(
        v_eleve.id,
        'PAIEMENT_RECU'::type_notification,
        'Paiement enregistré',
        format('Reçu %s : %s F encaissés le %s pour %s.',
               NEW.numero_recu,
               to_char(NEW.montant_fcfa, 'FM999G999G999'),
               to_char(NEW.date_paiement, 'DD/MM/YYYY'),
               v_eleve.prenom),
        format('/eleves/%s/finances', v_eleve.id),
        jsonb_build_object('paiement_id', NEW.id, 'recu', NEW.numero_recu),
        NULL,
        TRUE
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS paiements_notification ON paiements;
CREATE TRIGGER paiements_notification
    AFTER INSERT ON paiements
    FOR EACH ROW EXECUTE FUNCTION trg_notifier_paiement();


-- ---------------------------------------------------------------------------
-- 9. CONVOCATION
--
-- Une convocation vise UN tuteur nommé : on ne passe donc pas par
-- `fn_notifier_tuteurs`, qui les prendrait tous.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_notifier_convocation() RETURNS TRIGGER AS $$
DECLARE
    v_eleve   RECORD;
    v_tuteur  RECORD;
    v_canal   canal_notification;
BEGIN
    SELECT id, prenom, nom INTO v_eleve FROM eleves WHERE id = NEW.eleve_id;
    SELECT id, utilisateur_id, telephone INTO v_tuteur FROM tuteurs WHERE id = NEW.tuteur_id;

    IF v_tuteur.id IS NULL THEN
        RETURN NEW;
    END IF;

    v_canal := fn_canal_tuteur(v_tuteur.id);

    INSERT INTO notifications (
        destinataire_id, telephone, eleve_id, type, canal,
        titre, corps, route_cible, donnees
    ) VALUES (
        v_tuteur.utilisateur_id,
        CASE WHEN v_canal = 'SMS' THEN v_tuteur.telephone END,
        v_eleve.id,
        'CONVOCATION'::type_notification,
        v_canal,
        'Convocation',
        format('Vous êtes convoqué(e) le %s à %s%s, au sujet de %s. Motif : %s',
               to_char(NEW.date_rdv, 'DD/MM/YYYY'),
               to_char(NEW.heure_rdv, 'HH24hMI'),
               COALESCE(' (' || NEW.lieu || ')', ''),
               v_eleve.prenom,
               left(NEW.motif, 100)),
        format('/eleves/%s', v_eleve.id),
        jsonb_build_object('convocation_id', NEW.id, 'date_rdv', NEW.date_rdv)
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS convocations_notification ON convocations;
CREATE TRIGGER convocations_notification
    AFTER INSERT ON convocations
    FOR EACH ROW EXECUTE FUNCTION trg_notifier_convocation();


-- ---------------------------------------------------------------------------
-- 10. CHANGEMENT_STATUT
--
-- Exclusion, transfert, radiation, réintégration. C'est la notification la plus
-- lourde de conséquences du système : elle ne se coupe pas par paramètre.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_notifier_changement_statut() RETURNS TRIGGER AS $$
DECLARE
    v_eleve RECORD;
BEGIN
    IF NEW.ancien_statut = NEW.nouveau_statut THEN
        RETURN NEW;
    END IF;

    SELECT id, prenom INTO v_eleve FROM eleves WHERE id = NEW.eleve_id;

    PERFORM fn_notifier_tuteurs(
        v_eleve.id,
        'CHANGEMENT_STATUT'::type_notification,
        'Changement de situation',
        format('%s : situation scolaire passée de %s à %s le %s.%s',
               v_eleve.prenom,
               replace(NEW.ancien_statut::text, '_', ' '),
               replace(NEW.nouveau_statut::text, '_', ' '),
               to_char(NEW.date_effet, 'DD/MM/YYYY'),
               COALESCE(' Motif : ' || left(NEW.motif, 100), '')),
        format('/eleves/%s', v_eleve.id),
        jsonb_build_object('historique_id', NEW.id, 'nouveau_statut', NEW.nouveau_statut)
    );

    UPDATE historique_statuts SET parents_notifies = TRUE WHERE id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS historique_statuts_notification ON historique_statuts;
CREATE TRIGGER historique_statuts_notification
    AFTER INSERT ON historique_statuts
    FOR EACH ROW EXECUTE FUNCTION trg_notifier_changement_statut();


-- ---------------------------------------------------------------------------
-- 11. DEVOIR
--
-- Un devoir vise une CLASSE : la notification part à tous les tuteurs de tous
-- les élèves inscrits. C'est le seul déclencheur qui produise du volume — d'où
-- le paramètre, désactivé par défaut. Trente devoirs par semaine multipliés par
-- deux tuteurs feraient soixante SMS hebdomadaires par famille.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_notifier_devoir() RETURNS TRIGGER AS $$
DECLARE
    v_actif   BOOLEAN;
    v_matiere TEXT;
    v_eleve   RECORD;
BEGIN
    IF NOT NEW.publie OR COALESCE(OLD.publie, FALSE) THEN
        RETURN NEW;
    END IF;

    SELECT valeur = 'true' INTO v_actif FROM parametres WHERE cle = 'notification_devoir';
    IF NOT COALESCE(v_actif, FALSE) THEN
        RETURN NEW;
    END IF;

    SELECT libelle INTO v_matiere FROM matieres WHERE id = NEW.matiere_id;

    FOR v_eleve IN
        SELECT e.id, e.prenom
          FROM inscriptions i
          JOIN eleves e ON e.id = i.eleve_id
         WHERE i.classe_id = NEW.classe_id
    LOOP
        PERFORM fn_notifier_tuteurs(
            v_eleve.id,
            'DEVOIR'::type_notification,
            'Devoir à rendre',
            format('%s — %s : « %s », à rendre le %s.',
                   v_eleve.prenom, v_matiere, left(NEW.titre, 60),
                   to_char(NEW.date_remise, 'DD/MM/YYYY')),
            format('/eleves/%s/devoirs', v_eleve.id),
            jsonb_build_object('devoir_id', NEW.id)
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS devoirs_notification ON devoirs;
CREATE TRIGGER devoirs_notification
    AFTER INSERT OR UPDATE OF publie ON devoirs
    FOR EACH ROW EXECUTE FUNCTION trg_notifier_devoir();


-- ---------------------------------------------------------------------------
-- 12. ECHEANCE_PAIEMENT — une date, pas un événement
--
-- Aucun déclencheur ne peut se réveiller parce qu'une date approche. Cette
-- fonction est appelée par la tâche planifiée qui vide déjà la file.
--
-- Deux garde-fous, sans lesquels une école harcèlerait ses familles :
--   - une seule relance par échéance et par palier (J-7, J-1, J+3, J+15) ;
--   - `derniere_relance_le` empêche deux relances le même jour, quel que soit
--     le nombre d'appels de la fonction.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_relancer_echeances() RETURNS INTEGER AS $$
DECLARE
    v_actif   BOOLEAN;
    v_ech     RECORD;
    v_eleve   RECORD;
    v_reste   INTEGER;
    v_jours   INTEGER;
    v_titre   TEXT;
    v_corps   TEXT;
    v_posees  INTEGER := 0;
BEGIN
    SELECT valeur = 'true' INTO v_actif FROM parametres WHERE cle = 'notification_echeance';
    IF NOT COALESCE(v_actif, TRUE) THEN
        RETURN 0;
    END IF;

    FOR v_ech IN
        SELECT ec.*, (ec.date_limite - CURRENT_DATE) AS jours
          FROM echeances ec
         -- `statut_echeance` ne connaît pas « réglée » : les valeurs soldées
         -- sont PAYE et EXONERE. Le montant restant est vérifié en plus, une
         -- échéance pouvant être PARTIEL et pourtant entièrement couverte par
         -- une exonération.
         WHERE ec.statut NOT IN ('PAYE', 'EXONERE')
           AND ec.montant_du_fcfa > ec.montant_paye_fcfa + ec.montant_exonere_fcfa
           AND (ec.date_limite - CURRENT_DATE) IN (7, 1, -3, -15)
           AND (ec.derniere_relance_le IS NULL
                OR ec.derniere_relance_le::date < CURRENT_DATE)
    LOOP
        SELECT e.id, e.prenom INTO v_eleve
          FROM inscriptions i JOIN eleves e ON e.id = i.eleve_id
         WHERE i.id = v_ech.inscription_id;

        v_reste := v_ech.montant_du_fcfa - v_ech.montant_paye_fcfa - v_ech.montant_exonere_fcfa;
        v_jours := v_ech.jours;

        IF v_jours > 0 THEN
            v_titre := 'Échéance à venir';
            v_corps := format('%s : %s, %s F à régler avant le %s (dans %s jour(s)).',
                              v_eleve.prenom, v_ech.libelle,
                              to_char(v_reste, 'FM999G999G999'),
                              to_char(v_ech.date_limite, 'DD/MM/YYYY'), v_jours);
        ELSE
            v_titre := 'Échéance dépassée';
            v_corps := format('%s : %s, %s F restaient dus au %s. Merci de régulariser.',
                              v_eleve.prenom, v_ech.libelle,
                              to_char(v_reste, 'FM999G999G999'),
                              to_char(v_ech.date_limite, 'DD/MM/YYYY'));
        END IF;

        v_posees := v_posees + fn_notifier_tuteurs(
            v_eleve.id,
            'ECHEANCE_PAIEMENT'::type_notification,
            v_titre,
            v_corps,
            format('/eleves/%s/finances', v_eleve.id),
            jsonb_build_object('echeance_id', v_ech.id, 'jours', v_jours),
            NULL,
            TRUE
        );

        UPDATE echeances
           SET nb_relances = COALESCE(nb_relances, 0) + 1,
               derniere_relance_le = now()
         WHERE id = v_ech.id;
    END LOOP;

    RETURN v_posees;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_relancer_echeances IS
    'Relance les echeances impayees a J-7, J-1, J+3 et J+15. A appeler une fois par jour.';


-- ---------------------------------------------------------------------------
-- 13. Paramètres
--
-- Posés explicitement plutôt que laissés au défaut : ils doivent apparaître
-- dans l'écran de configuration pour que l'établissement sache qu'ils existent.
-- ---------------------------------------------------------------------------
INSERT INTO parametres (cle, valeur, description) VALUES
    ('notification_retard',              'true',
     'Prevenir les tuteurs a chaque retard saisi.'),
    ('notification_incident',            'true',
     'Prevenir les tuteurs des incidents de discipline.'),
    ('notification_incident_gravite_min','MOYENNE',
     'Gravite minimale notifiee : MINEURE, MOYENNE, GRAVE ou TRES_GRAVE.'),
    ('notification_bulletin_publie',     'true',
     'Prevenir a la publication d''un bulletin.'),
    ('notification_echeance',            'true',
     'Relancer les echeances impayees a J-7, J-1, J+3 et J+15.'),
    -- Seul type désactivé par défaut : voir le volume attendu en §11.
    ('notification_devoir',              'false',
     'Prevenir a chaque devoir publie. Desactive : volume eleve.')
ON CONFLICT DO NOTHING;


-- ---------------------------------------------------------------------------
-- 14. Recensement
--
-- Quels types sont réellement branchés, et par quoi. Sans cette vue, la seule
-- façon de le savoir est de relire treize déclencheurs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_couverture_notifications AS
SELECT t.type,
       t.source,
       t.parametre,
       COALESCE(p.valeur, 'true (défaut)') AS etat,
       COALESCE(n.total, 0)                AS deja_produites
  FROM (VALUES
        ('ABSENCE',           'déclencheur absences',            'notification_absence_immediate'),
        ('RETARD',            'déclencheur retards',             'notification_retard'),
        ('NOTE_PUBLIEE',      'déclencheur evaluations',         'notification_note_publiee'),
        ('BULLETIN_PUBLIE',   'déclencheur bulletins',           'notification_bulletin_publie'),
        ('INCIDENT',          'déclencheur incidents',           'notification_incident'),
        ('SANCTION',          'déclencheur sanctions',           NULL),
        ('ECHEANCE_PAIEMENT', 'fn_relancer_echeances (planifié)','notification_echeance'),
        ('PAIEMENT_RECU',     'déclencheur paiements',           NULL),
        ('CONVOCATION',       'déclencheur convocations',        NULL),
        ('CHANGEMENT_STATUT', 'déclencheur historique_statuts',  NULL),
        ('DEVOIR',            'déclencheur devoirs',             'notification_devoir'),
        ('ANNONCE',           'action serveur Communication',    NULL),
        ('AUTRE',             'codes d''activation, comptes',    NULL)
       ) AS t(type, source, parametre)
  LEFT JOIN parametres p ON p.cle = t.parametre
  LEFT JOIN (SELECT type::text AS type, count(*) AS total
               FROM notifications GROUP BY 1) n ON n.type = t.type;

COMMENT ON VIEW v_couverture_notifications IS
    'Les treize types de notification, leur source et leur etat d''activation.';
