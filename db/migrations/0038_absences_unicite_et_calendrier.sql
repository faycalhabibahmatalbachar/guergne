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
DO $$
DECLARE
    v_groupes BIGINT;
    v_surnombre BIGINT;
BEGIN
    SELECT COUNT(*), COALESCE(SUM(n - 1), 0)
      INTO v_groupes, v_surnombre
      FROM (
        SELECT COUNT(*) AS n
          FROM absences
         GROUP BY inscription_id,
                  date_absence,
                  COALESCE(seance_id,  '00000000-0000-0000-0000-000000000000'::uuid),
                  COALESCE(creneau_id, '00000000-0000-0000-0000-000000000000'::uuid)
        HAVING COUNT(*) > 1
      ) AS doublons;

    IF v_groupes > 0 THEN
        RAISE EXCEPTION
            'Unicite des absences impossible : % groupe(s) de doublons, % ligne(s) en surnombre.',
            v_groupes, v_surnombre
          USING
            DETAIL = 'Une meme inscription a plusieurs absences pour la meme date et la meme seance/creneau. Ces lignes sont de vraies donnees d assiduite : cette migration ne les touche pas.',
            HINT   = 'Inventorier d abord : node agent/scripts/inventaire-doublons-absences.mjs. Faire arbitrer chaque groupe par la vie scolaire (quelle ligne conserver, quel volume horaire retenir, quelle notification deja partie), corriger sous journal d audit, puis rejouer 0038.';
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
