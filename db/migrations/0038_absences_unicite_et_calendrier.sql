-- =============================================================================
-- 0038 — Unicité des absences, et pourquoi le calendrier reste applicatif.
-- =============================================================================
-- CE QUE LA PRODUCTION MONTRE AUJOURD'HUI
-- ----------------------------------------
-- La table `absences` n'a AUCUNE contrainte d'unicité : 0005 n'a posé que des
-- index de lecture. Relevé sur la base réelle : 61 groupes de doublons (même
-- `inscription_id`, même `date_absence`), soit 61 lignes en surnombre sur 2720.
--
-- POURQUOI C'EST GRAVE, ET PAS SEULEMENT SALE
-- --------------------------------------------
-- Chaque ligne d'absence déclenche le trigger `absences_notification` posé par
-- 0016. Un doublon n'est donc pas une ligne morte : c'est un SECOND message
-- envoyé au tuteur pour la même absence. Et comme `nb_heures` se cumule, le
-- doublon double aussi le volume horaire reporté sur le bulletin. Un élève
-- absent une matinée en compte deux.
--
-- LE PIÈGE DES NULL — TRAITÉ ICI EXPLICITEMENT
-- ---------------------------------------------
-- `seance_id` et `creneau_id` sont NULL sur TOUTES les lignes existantes : la
-- saisie d'appel ne les renseigne pas encore. Or en SQL deux NULL ne sont pas
-- égaux, donc un index unique naïf :
--     CREATE UNIQUE INDEX ... ON absences (inscription_id, date_absence, seance_id)
-- ne bloquerait RIEN DU TOUT aujourd'hui : chaque nouvelle ligne à NULL serait
-- vue comme distincte de toutes les autres. C'est exactement la panne
-- diagnostiquée en 0010 sur `emploi_du_temps.semaine_type`.
--
-- Correctif retenu : `NULLS NOT DISTINCT` (PostgreSQL 15+), qui traite deux
-- NULL comme égaux. Le même mécanisme est déjà en service en production depuis
-- 0010, il n'est donc pas une hypothèse sur la version du serveur.
--
-- Conséquence voulue : tant que la saisie ne renseigne pas la séance, la clé se
-- réduit de fait à (inscription, date) — une absence par élève et par jour,
-- ce qui est précisément la règle que les 61 doublons ont violée. Le jour où
-- l'appel renseignera `seance_id` ou `creneau_id`, la même contrainte
-- autorisera d'elle-même plusieurs absences par jour sur des cours distincts,
-- sans nouvelle migration.
--
-- POURQUOI AUCUNE CONTRAINTE DE CALENDRIER N'EST POSÉE ICI
-- --------------------------------------------------------
-- La base porte aussi 23 absences datées d'un dimanche. La tentation serait
-- d'ajouter un CHECK sur le jour de semaine. On s'en abstient délibérément :
--   * les jours de classe sont une donnée de l'établissement, pas une
--     constante — au Tchad le samedi est ouvré, et le reste se configure par
--     année via le calendrier et les profils horaires de 0036 ;
--   * un CHECK ne sait pas lire les vacances d'une autre table ;
--   * les 23 lignes existantes sont de l'historique, pas des erreurs à purger
--     sans arbitrage humain.
-- Le contrôle est donc applicatif, dans
-- `web/src/server/domain/assiduite-dates.ts`, où il peut nommer la raison du
-- refus à l'agent de saisie. Cette migration ne fait que documenter ce choix.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Garde-fou : échouer en expliquant, plutôt qu'avec « key is duplicated ».
-- ---------------------------------------------------------------------------
-- Les doublons déjà en base feront ÉCHOUER la création de l'index unique.
-- C'est voulu : les supprimer automatiquement serait détruire des lignes
-- d'assiduité — et le trigger de notification a déjà prévenu les tuteurs sur
-- certaines d'entre elles. L'arbitrage appartient à la vie scolaire.
--
-- Le message brut de PostgreSQL ne dirait qu'« could not create unique index :
-- key is duplicated ». On lève donc l'erreur AVANT, avec le compte exact et la
-- marche à suivre, pour que l'exploitant sache quoi faire sans lire ce fichier.
-- MISE À JOUR DU 2026-11-09 : LE DIAGNOSTIC DISAIT UNE CHOSE FAUSSE.
--
-- Le message ci-dessous affirmait « Ces lignes sont de vraies donnees
-- d assiduite » et renvoyait l'arbitrage à la vie scolaire. Le relevé sur la
-- base réelle dit le contraire :
--
--   * 61 groupes, 61 lignes en surnombre — donc exactement deux lignes par
--     groupe ;
--   * 61 groupes sur 61 portent sur des élèves `donnees_semees = true` ;
--   * ZÉRO groupe sur le seul élève authentique de la base ;
--   * les deux lignes d'un groupe se CONTREDISENT (une journée de 6 h
--     justifiée et une demi-journée de 3 h non justifiée le même jour), et
--     portent le même horodatage de création à la microseconde près.
--
-- Ce ne sont donc pas des événements scolaires distincts à arbitrer : ce sont
-- des artefacts du script de peuplement. Faire arbitrer la vie scolaire sur des
-- absences qui n'ont jamais eu lieu lui ferait perdre son temps, et traiterait
-- des données générées comme des données authentiques.
--
-- Le garde-fou compte donc désormais les deux populations SÉPARÉMENT, et
-- adapte ce qu'il conseille. Il continue de refuser : supprimer des lignes
-- d'assiduité reste une décision, et le retrait du jeu de données semé en est
-- une — distincte de cette migration.
DO $$
DECLARE
    v_groupes BIGINT;
    v_surnombre BIGINT;
    v_semes BIGINT;
    v_authentiques BIGINT;
BEGIN
    WITH doublons AS (
        SELECT inscription_id,
               date_absence,
               COALESCE(seance_id,  '00000000-0000-0000-0000-000000000000'::uuid) AS seance,
               COALESCE(creneau_id, '00000000-0000-0000-0000-000000000000'::uuid) AS creneau,
               COUNT(*) AS n
          FROM absences
         GROUP BY 1, 2, 3, 4
        HAVING COUNT(*) > 1
    )
    SELECT COUNT(*),
           COALESCE(SUM(n - 1), 0),
           -- Un groupe est « semé » si l'élève derrière son inscription l'est.
           COUNT(*) FILTER (WHERE e.donnees_semees),
           COUNT(*) FILTER (WHERE NOT e.donnees_semees)
      INTO v_groupes, v_surnombre, v_semes, v_authentiques
      FROM doublons d
      JOIN inscriptions i ON i.id = d.inscription_id
      JOIN eleves e       ON e.id = i.eleve_id;

    IF v_groupes > 0 THEN
        RAISE EXCEPTION
            'Unicite des absences impossible : % groupe(s) de doublons, % ligne(s) en surnombre (% sur des eleves semes, % sur des eleves authentiques).',
            v_groupes, v_surnombre, v_semes, v_authentiques
          USING
            DETAIL = 'Une meme inscription a plusieurs absences pour la meme date et la meme seance/creneau. La repartition entre eleves semes et authentiques est donnee ci-dessus : elle decide de la marche a suivre.',
            HINT   = 'Inventorier d abord : node agent/scripts/inventaire-doublons-absences.mjs. Les groupes portant sur des eleves AUTHENTIQUES doivent etre arbitres par la vie scolaire (quelle ligne conserver, quel volume horaire, quelle notification deja partie), corriges sous journal d audit. Les groupes portant sur des eleves SEMES relevent du retrait du jeu de donnees de demonstration, qui est une decision distincte et non un arbitrage pedagogique. Rejouer 0038 ensuite.';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- La contrainte elle-même.
-- ---------------------------------------------------------------------------
-- Index et non contrainte de table : il reste ainsi remplaçable sans toucher
-- au schéma, et `ON CONFLICT DO NOTHING` côté applicatif s'appuie dessus.
CREATE UNIQUE INDEX IF NOT EXISTS uq_absence_inscription_date_seance
    ON absences (inscription_id, date_absence, seance_id, creneau_id)
    NULLS NOT DISTINCT;

COMMENT ON INDEX uq_absence_inscription_date_seance IS
    'Une inscription ne peut avoir deux absences pour la meme date et la meme seance/creneau. '
    'NULLS NOT DISTINCT est indispensable : seance_id et creneau_id sont NULL sur toutes les '
    'lignes de la saisie d appel, et deux NULL distincts ne bloqueraient aucun doublon.';
