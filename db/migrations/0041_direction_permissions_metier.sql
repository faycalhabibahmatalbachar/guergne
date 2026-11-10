-- =============================================================================
-- 0041 — La DIRECTION reçoit toutes les permissions MÉTIER de l'établissement.
-- =============================================================================
-- DÉCISION DU PROPRIÉTAIRE, 2026-11-10
-- -------------------------------------
-- « DIRECTION doit être un véritable administrateur métier global de
-- l'établissement », sans restriction artificielle de périmètre. Les droits
-- TECHNIQUES et de SÉCURITÉ restent réservés au SUPER_ADMIN.
--
-- CE QUE LA BASE MONTRE AVANT CETTE MIGRATION
-- --------------------------------------------
-- Relevé le 2026-11-10 sur `br-calm-art` (base de test, année 2025-2026,
-- migration 0040 absente), par `agent/scripts/audit-permissions.mjs` :
--
--   SUPER_ADMIN  78 droits      DIRECTION    36 droits      écart : 42
--   CENSEUR      23             SECRETARIAT  17
--   SURVEILLANT  14             ENSEIGNANT   14 (PROPRES_CLASSES)
--   PARENT       13 (PROPRES_ENFANTS)        COMPTABLE     9
--   ELEVE         7 (PROPRES_ENFANTS)
--
-- Les 36 droits de la DIRECTION portent TOUS la portée `AUCUNE` : il n'y a
-- aucun périmètre restrictif à lever, contrairement à ce qu'on pouvait
-- craindre. Le vocabulaire de la base et celui du code coïncident exactement
-- (78 actions de part et d'autre).
--
-- L'ÉCART DE 42 SE RÉPARTIT EN 39 + 3, ET NON 38 + 4
-- ---------------------------------------------------
-- La passation classait `utilisateur:modifier` parmi les droits réservés, par
-- crainte qu'il mélange gestion administrative et administration des
-- privilèges. L'audit du code montre que ce n'est pas le cas. Ce droit garde
-- EXACTEMENT trois choses, et aucune n'est un privilège :
--
--   1. `modifierEnseignant`            — dossier administratif d'un enseignant
--      (web/src/app/(main)/dashboard/personnel/actions.ts)
--        matricule, nom, statut, heures contractuelles, observations.
--   2. `definirPhotoEnseignant` / `retirerPhotoEnseignant`
--      (web/src/app/(main)/dashboard/eleves/[id]/photo-actions.ts)
--        la photographie d'un enseignant.
--   3. `GET /api/fichiers/[id]`        — lecture du document d'un enseignant,
--      où `utilisateur:creer` est une alternative SUFFISANTE — et la DIRECTION
--      le possède déjà. Ce chemin lui est donc ouvert de toute façon.
--
-- Le changement de RÔLE, lui, ne passe nulle part par `utilisateur:modifier`.
-- Il vit dans `personnel/actions-compte.ts`, sous `utilisateur:creer`, et son
-- schéma est borné : `const ROLES_AUTORISES = ["ENSEIGNANT"]`. Aucune élévation
-- de privilège n'y est possible, et la DIRECTION détient déjà ce droit ainsi
-- que `utilisateur:desactiver`.
--
-- Autrement dit, refuser `utilisateur:modifier` à la DIRECTION ne protégeait
-- RIEN — le droit strictement plus puissant lui est déjà accordé — et lui
-- interdisait de corriger le dossier d'un enseignant. C'est exactement la
-- « restriction artificielle » que la décision du propriétaire écarte, et le
-- cas que son instruction prévoyait : « au lieu de priver DIRECTION de la
-- gestion métier des comptes ». Aucune séparation de capacité n'est nécessaire,
-- puisqu'il n'y a rien à séparer. Il est donc accordé, comme droit métier de
-- gestion du personnel.
--
-- LES TROIS DROITS RÉELLEMENT RÉSERVÉS
-- -------------------------------------
--   permission:gerer      modifier la matrice, donc s'attribuer n'importe quel
--                         droit : la seule véritable élévation de privilège.
--   systeme:administrer   administration technique de la plateforme, dont
--                         l'appairage WhatsApp (voir docs/CONNEXION_WHATSAPP.md).
--   sauvegarde:executer   sauvegardes et restaurations de la base.
--
-- `parametre:modifier` et `import:executer` sont classés MÉTIER : ouvrir une
-- année, régler des périodes ou importer une liste d'élèves sont des gestes de
-- gestion d'établissement, pas d'administration technique.
--
-- POURQUOI LA LISTE EST DÉRIVÉE ET NON RECOPIÉE
-- ----------------------------------------------
-- Le besoin exprimé est l'ÉVOLUTIVITÉ : « éviter que chaque nouveau module
-- oublie le rôle DIRECTION ». Une liste de 39 noms recopiée ici serait périmée
-- au premier module suivant. L'insertion part donc des droits du SUPER_ADMIN
-- moins les trois réservés : tout droit métier existant est couvert, sans
-- qu'aucun ne puisse être oublié par distraction.
--
-- Le risque symétrique — accorder par dérivation quelque chose d'inattendu —
-- est fermé par les garde-fous : si le résultat n'est pas exactement
-- « SUPER_ADMIN moins 3, toutes portées AUCUNE, et aucun autre rôle touché »,
-- la migration lève et la transaction est annulée.
--
-- REJOUABLE. `ON CONFLICT DO NOTHING` sur la contrainte d'unicité
-- `permissions_role_action_key (role, action)`. Un second passage n'insère rien
-- et les garde-fous repassent.
--
-- RETOUR ARRIÈRE : `db/rollback/0041_direction_permissions_metier.sql`.
-- =============================================================================

-- --------------------------------------------------------------------------
-- Les trois droits réservés, nommés une seule fois et réutilisés partout.
-- Une table temporaire plutôt qu'une liste répétée : trois copies d'une même
-- liste finissent par en avoir deux versions.
-- --------------------------------------------------------------------------
CREATE TEMPORARY TABLE _0041_reserves (action TEXT PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _0041_reserves (action) VALUES
    ('permission:gerer'),
    ('systeme:administrer'),
    ('sauvegarde:executer');

-- État des autres rôles AVANT, pour prouver qu'aucun n'a bougé.
CREATE TEMPORARY TABLE _0041_avant AS
SELECT role, count(*) AS n
  FROM permissions
 WHERE role <> 'DIRECTION'
 GROUP BY role;

-- --------------------------------------------------------------------------
-- L'octroi : tous les droits du SUPER_ADMIN, sauf les trois réservés.
-- Portée explicitement `AUCUNE` : la décision est un périmètre GLOBAL.
-- --------------------------------------------------------------------------
INSERT INTO permissions (role, action, portee)
SELECT 'DIRECTION', p.action, 'AUCUNE'
  FROM permissions p
 WHERE p.role = 'SUPER_ADMIN'
   AND p.action NOT IN (SELECT action FROM _0041_reserves)
ON CONFLICT (role, action) DO NOTHING;

-- --------------------------------------------------------------------------
-- Garde-fous. Chacun répond à une façon précise de se tromper.
-- --------------------------------------------------------------------------
DO $$
DECLARE
    v_sa        INTEGER;
    v_dir       INTEGER;
    v_interdits INTEGER;
    v_portees   INTEGER;
    v_derive    INTEGER;
    v_bouge     TEXT;
    v_reserves  INTEGER;
BEGIN
    SELECT count(*) INTO v_sa  FROM permissions WHERE role = 'SUPER_ADMIN';
    SELECT count(*) INTO v_dir FROM permissions WHERE role = 'DIRECTION';

    -- 1. AUCUN des trois droits réservés chez la DIRECTION. C'est l'invariant
    --    de sécurité : s'il tombe, tout le reste est sans importance.
    SELECT count(*) INTO v_interdits
      FROM permissions
     WHERE role = 'DIRECTION'
       AND action IN (SELECT action FROM _0041_reserves);
    IF v_interdits <> 0 THEN
        RAISE EXCEPTION '0041 : la DIRECTION detient % droit(s) reserve(s) au SUPER_ADMIN', v_interdits;
    END IF;

    -- 2. Les trois réservés restent le propre du SUPER_ADMIN : aucun autre rôle
    --    ne doit les porter non plus, sinon la réserve est une fiction.
    SELECT count(*) INTO v_reserves
      FROM permissions
     WHERE action IN (SELECT action FROM _0041_reserves)
       AND role <> 'SUPER_ADMIN';
    IF v_reserves <> 0 THEN
        RAISE EXCEPTION '0041 : % attribution(s) d''un droit reserve a un role autre que SUPER_ADMIN', v_reserves;
    END IF;

    -- 3. Le compte attendu : exactement le SUPER_ADMIN moins les trois.
    --    Un écart signale soit un droit oublié, soit un droit en trop.
    IF v_dir <> v_sa - 3 THEN
        RAISE EXCEPTION '0041 : DIRECTION a % droits, % attendus (SUPER_ADMIN % moins 3 reserves)',
            v_dir, v_sa - 3, v_sa;
    END IF;

    -- 4. Aucun droit de la DIRECTION hors du périmètre du SUPER_ADMIN : la
    --    dérivation ne doit pas avoir laissé d'orphelin d'un état antérieur.
    SELECT count(*) INTO v_derive
      FROM permissions d
     WHERE d.role = 'DIRECTION'
       AND NOT EXISTS (
           SELECT 1 FROM permissions s WHERE s.role = 'SUPER_ADMIN' AND s.action = d.action
       );
    IF v_derive <> 0 THEN
        RAISE EXCEPTION '0041 : % droit(s) de la DIRECTION inconnus du SUPER_ADMIN', v_derive;
    END IF;

    -- 5. Périmètre GLOBAL : une portée restrictive viderait la décision de son
    --    sens, en limitant la direction à ses propres classes ou enfants.
    SELECT count(*) INTO v_portees
      FROM permissions WHERE role = 'DIRECTION' AND portee <> 'AUCUNE';
    IF v_portees <> 0 THEN
        RAISE EXCEPTION '0041 : % droit(s) de la DIRECTION a portee restreinte', v_portees;
    END IF;

    -- 6. NON-RÉGRESSION : aucun autre rôle n'a changé. Un INSERT mal filtré
    --    aurait pu servir un droit à PARENT ou à ENSEIGNANT, et ce serait
    --    passé inaperçu — c'est le défaut le plus coûteux de cette migration.
    SELECT string_agg(format('%s %s->%s', a.role, a.n, c.n), ', ')
      INTO v_bouge
      FROM _0041_avant a
      JOIN (SELECT role, count(*) AS n FROM permissions WHERE role <> 'DIRECTION' GROUP BY role) c
        ON c.role = a.role
     WHERE a.n <> c.n;
    IF v_bouge IS NOT NULL THEN
        RAISE EXCEPTION '0041 : des roles autres que DIRECTION ont change : %', v_bouge;
    END IF;
    -- Et aucun rôle apparu ou disparu.
    IF (SELECT count(DISTINCT role) FROM permissions WHERE role <> 'DIRECTION')
       <> (SELECT count(*) FROM _0041_avant) THEN
        RAISE EXCEPTION '0041 : le nombre de roles autres que DIRECTION a change';
    END IF;

    RAISE NOTICE '0041 : DIRECTION a % droits metier (SUPER_ADMIN %, 3 reserves), toutes portees AUCUNE',
        v_dir, v_sa;
END $$;
