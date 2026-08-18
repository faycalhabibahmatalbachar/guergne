-- =============================================================================
-- 0009 — Données de référence initiales (idempotent).
--        Niveaux, séries, matières, créneaux, permissions, séquences.
-- =============================================================================

-- --------------------------------------------------------------------------
-- Établissement
-- --------------------------------------------------------------------------
INSERT INTO etablissement (id, nom, sigle, ville, pays, devise)
VALUES (TRUE, 'Lycée Guergné La Renaissance', 'LGR', 'N''Djamena', 'Tchad', 'FCFA')
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------------------------------
-- Niveaux : 6ème → Terminale
-- --------------------------------------------------------------------------
INSERT INTO niveaux (code, libelle, cycle, ordre, series_applicables) VALUES
    ('6EME',      'Sixième',    'COLLEGE', 1, FALSE),
    ('5EME',      'Cinquième',  'COLLEGE', 2, FALSE),
    ('4EME',      'Quatrième',  'COLLEGE', 3, FALSE),
    ('3EME',      'Troisième',  'COLLEGE', 4, FALSE),
    ('2NDE',      'Seconde',    'LYCEE',   5, TRUE),
    ('1ERE',      'Première',   'LYCEE',   6, TRUE),
    ('TERMINALE', 'Terminale',  'LYCEE',   7, TRUE)
ON CONFLICT (code) DO NOTHING;

-- Chaînage des niveaux pour le passage en classe supérieure
UPDATE niveaux n
   SET niveau_suivant_id = s.id
  FROM niveaux s
 WHERE s.ordre = n.ordre + 1
   AND n.niveau_suivant_id IS NULL;

-- --------------------------------------------------------------------------
-- Séries du lycée
-- --------------------------------------------------------------------------
INSERT INTO series (code, libelle, description, ordre) VALUES
    ('A1', 'Série A1 — Lettres et Mathématiques',   'Littéraire à dominante mathématique', 1),
    ('A4', 'Série A4 — Lettres et Philosophie',     'Littéraire classique',                2),
    ('C',  'Série C — Mathématiques et Sciences Physiques', 'Scientifique, dominante maths', 3),
    ('D',  'Série D — Mathématiques et Sciences de la Nature', 'Scientifique, dominante SVT', 4),
    ('G',  'Série G — Techniques de Gestion',       'Enseignement technique et commercial', 5)
ON CONFLICT (code) DO NOTHING;

-- --------------------------------------------------------------------------
-- Matières
-- --------------------------------------------------------------------------
INSERT INTO matieres (code, libelle, libelle_court, ordre_bulletin, couleur) VALUES
    ('FR',    'Français',                     'Français',   1,  '#e11d48'),
    ('MATH',  'Mathématiques',                'Maths',      2,  '#2563eb'),
    ('PC',    'Physique-Chimie',              'Phys-Chim',  3,  '#7c3aed'),
    ('SVT',   'Sciences de la Vie et de la Terre', 'SVT',   4,  '#16a34a'),
    ('HG',    'Histoire-Géographie',          'Hist-Géo',   5,  '#ca8a04'),
    ('ANG',   'Anglais',                      'Anglais',    6,  '#0891b2'),
    ('AR',    'Arabe',                        'Arabe',      7,  '#059669'),
    ('PHILO', 'Philosophie',                  'Philo',      8,  '#9333ea'),
    ('ECM',   'Éducation Civique et Morale',  'ECM',        9,  '#64748b'),
    ('EPS',   'Éducation Physique et Sportive','EPS',       10, '#ea580c'),
    ('INFO',  'Informatique',                 'Info',       11, '#0284c7'),
    ('ECO',   'Économie',                     'Éco',        12, '#be123c'),
    ('COMPTA','Comptabilité',                 'Compta',     13, '#4d7c0f')
ON CONFLICT (code) DO NOTHING;

-- --------------------------------------------------------------------------
-- Créneaux horaires (journée type au Tchad : 07h00 → 17h30)
-- --------------------------------------------------------------------------
INSERT INTO creneaux_horaires (libelle, heure_debut, heure_fin, ordre) VALUES
    ('07h00 - 07h55', '07:00', '07:55', 1),
    ('07h55 - 08h50', '07:55', '08:50', 2),
    ('08h50 - 09h45', '08:50', '09:45', 3),
    ('10h00 - 10h55', '10:00', '10:55', 4),
    ('10h55 - 11h50', '10:55', '11:50', 5),
    ('11h50 - 12h45', '11:50', '12:45', 6),
    ('15h00 - 15h55', '15:00', '15:55', 7),
    ('15h55 - 16h50', '15:55', '16:50', 8),
    ('16h50 - 17h45', '16:50', '17:45', 9)
ON CONFLICT (ordre) DO NOTHING;

-- --------------------------------------------------------------------------
-- Salles : AUCUNE donnée semée volontairement.
-- Les locaux sont propres à l'établissement et seront saisis par le
-- secrétariat. Semer des salles fictives reviendrait à introduire en base une
-- donnée fausse qui finirait par être prise pour réelle.
-- --------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- Séquences de numérotation pour l'année en cours
-- --------------------------------------------------------------------------
INSERT INTO sequences_numerotation (cle, annee, prefixe, longueur) VALUES
    ('MATRICULE',             EXTRACT(YEAR FROM CURRENT_DATE)::SMALLINT, 'LGR', 4),
    ('RECU',                  EXTRACT(YEAR FROM CURRENT_DATE)::SMALLINT, 'REC', 5),
    ('CERTIFICAT_SCOLARITE',  EXTRACT(YEAR FROM CURRENT_DATE)::SMALLINT, 'CS',  4),
    ('CERTIFICAT_TRANSFERT',  EXTRACT(YEAR FROM CURRENT_DATE)::SMALLINT, 'CT',  4),
    ('CONVOCATION',           EXTRACT(YEAR FROM CURRENT_DATE)::SMALLINT, 'CV',  4)
ON CONFLICT (cle, annee) DO NOTHING;

-- =============================================================================
-- Matrice des permissions
--
-- Portées :
--   AUCUNE          — accès à tout le périmètre de l'action
--   PROPRES_CLASSES — limité aux couples (classe × matière) affectés (enseignant)
--   PROPRES_ENFANTS — limité aux élèves dont l'utilisateur est tuteur (parent)
-- =============================================================================

-- SUPER_ADMIN : accès total, déclaré explicitement plutôt qu'implicitement
INSERT INTO permissions (role, action, portee)
SELECT 'SUPER_ADMIN', a, 'AUCUNE' FROM unnest(ARRAY[
    'systeme:administrer', 'utilisateur:creer', 'utilisateur:modifier',
    'utilisateur:desactiver', 'permission:gerer', 'audit:lire',
    'sauvegarde:executer', 'parametre:modifier',
    'eleve:lire', 'eleve:creer', 'eleve:modifier',
    'note:lire', 'bulletin:lire', 'finance:lire'
]) AS a
ON CONFLICT (role, action) DO NOTHING;

-- DIRECTION : toutes les décisions métier
INSERT INTO permissions (role, action, portee)
SELECT 'DIRECTION', a, 'AUCUNE' FROM unnest(ARRAY[
    'eleve:lire', 'eleve:creer', 'eleve:modifier',
    'eleve:suspendre', 'eleve:reactiver', 'eleve:exclure', 'eleve:transferer',
    'classe:lire', 'classe:creer', 'classe:modifier',
    'note:lire', 'periode:verrouiller', 'periode:deverrouiller',
    'bulletin:lire', 'bulletin:generer', 'bulletin:publier',
    'conseil_classe:tenir', 'conseil_classe:valider', 'decision:prononcer',
    'assiduite:lire', 'discipline:lire', 'discipline:sanctionner',
    'conseil_discipline:convoquer',
    'finance:lire', 'finance:exonerer', 'finance:configurer',
    'annonce:publier', 'message:envoyer', 'convocation:emettre',
    'document:emettre', 'statistique:lire', 'audit:lire',
    'utilisateur:creer', 'utilisateur:desactiver', 'annee:cloturer'
]) AS a
ON CONFLICT (role, action) DO NOTHING;

-- CENSEUR : pilotage pédagogique
INSERT INTO permissions (role, action, portee)
SELECT 'CENSEUR', a, 'AUCUNE' FROM unnest(ARRAY[
    'eleve:lire', 'eleve:modifier',
    'classe:lire', 'classe:creer', 'classe:modifier',
    'matiere:gerer', 'coefficient:gerer', 'affectation:gerer',
    'emploi_du_temps:gerer', 'calendrier:gerer',
    'note:lire', 'evaluation:lire', 'periode:verrouiller',
    'bulletin:lire', 'bulletin:generer',
    'conseil_classe:tenir', 'conseil_classe:valider',
    'assiduite:lire', 'discipline:lire',
    'annonce:publier', 'message:envoyer',
    'document:emettre', 'statistique:lire'
]) AS a
ON CONFLICT (role, action) DO NOTHING;

-- SURVEILLANT : vie scolaire
INSERT INTO permissions (role, action, portee)
SELECT 'SURVEILLANT', a, 'AUCUNE' FROM unnest(ARRAY[
    'eleve:lire',
    'assiduite:lire', 'assiduite:saisir', 'assiduite:justifier',
    'retard:saisir', 'sortie:autoriser',
    'discipline:lire', 'discipline:signaler', 'discipline:sanctionner',
    'conduite:noter', 'eleve:suspendre',
    'message:envoyer', 'convocation:emettre', 'document:emettre'
]) AS a
ON CONFLICT (role, action) DO NOTHING;

-- SECRETARIAT : dossiers et scolarité
INSERT INTO permissions (role, action, portee)
SELECT 'SECRETARIAT', a, 'AUCUNE' FROM unnest(ARRAY[
    'eleve:lire', 'eleve:creer', 'eleve:modifier',
    'eleve:inscrire', 'eleve:reinscrire', 'eleve:transferer', 'eleve:affecter',
    'tuteur:gerer', 'piece:deposer', 'import:executer',
    'classe:lire', 'assiduite:lire', 'assiduite:justifier',
    'document:emettre', 'annonce:publier', 'tuteur:inviter',
    'bulletin:lire'
]) AS a
ON CONFLICT (role, action) DO NOTHING;

-- COMPTABLE : économat
INSERT INTO permissions (role, action, portee)
SELECT 'COMPTABLE', a, 'AUCUNE' FROM unnest(ARRAY[
    'eleve:lire',
    'finance:lire', 'finance:encaisser', 'finance:configurer',
    'finance:relancer', 'finance:exporter', 'recu:emettre',
    'message:envoyer', 'statistique:lire'
]) AS a
ON CONFLICT (role, action) DO NOTHING;

-- ENSEIGNANT : strictement limité à ses classes et matières
INSERT INTO permissions (role, action, portee)
SELECT 'ENSEIGNANT', a, 'PROPRES_CLASSES' FROM unnest(ARRAY[
    'eleve:lire',
    'evaluation:creer', 'evaluation:modifier',
    'note:lire', 'note:saisir', 'note:modifier',
    'appreciation:saisir', 'assiduite:saisir',
    'discipline:signaler', 'devoir:publier', 'ressource:publier',
    'seance:saisir', 'bulletin:lire', 'message:envoyer'
]) AS a
ON CONFLICT (role, action) DO NOTHING;

-- PARENT : lecture seule, strictement limitée à ses enfants
INSERT INTO permissions (role, action, portee)
SELECT 'PARENT', a, 'PROPRES_ENFANTS' FROM unnest(ARRAY[
    'eleve:lire', 'note:lire', 'bulletin:lire', 'bulletin:telecharger',
    'assiduite:lire', 'discipline:lire', 'emploi_du_temps:lire',
    'devoir:lire', 'ressource:lire', 'finance:lire',
    'annonce:lire', 'message:lire', 'message:envoyer'
]) AS a
ON CONFLICT (role, action) DO NOTHING;

-- ELEVE (v2) : lecture de son propre dossier
INSERT INTO permissions (role, action, portee)
SELECT 'ELEVE', a, 'PROPRES_ENFANTS' FROM unnest(ARRAY[
    'note:lire', 'bulletin:lire', 'assiduite:lire',
    'emploi_du_temps:lire', 'devoir:lire', 'ressource:lire', 'annonce:lire'
]) AS a
ON CONFLICT (role, action) DO NOTHING;

-- --------------------------------------------------------------------------
-- Paramètres applicatifs par défaut
-- --------------------------------------------------------------------------
INSERT INTO parametres (cle, valeur, description) VALUES
    ('notification_absence_immediate', 'true',  'Notifier les tuteurs dès la saisie d''une absence'),
    ('notification_note_publiee',      'true',  'Notifier lors de la publication des notes'),
    ('sms_actif',                      'false', 'Activer le canal SMS de repli (facturé)'),
    ('relance_jours_avant_echeance',   '7',     'Délai de relance avant la date limite de paiement'),
    ('arrondi_moyenne_decimales',      '2',     'Nombre de décimales des moyennes'),
    ('rang_ex_aequo_partage',          'true',  'Deux élèves à égalité partagent le même rang')
ON CONFLICT (cle) DO NOTHING;
