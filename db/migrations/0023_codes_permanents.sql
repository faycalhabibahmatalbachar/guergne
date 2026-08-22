-- ---------------------------------------------------------------------------
-- 0023 — Codes d'activation permanents
--
-- POURQUOI
-- --------
-- Un code d'activation normal est à usage unique et toute nouvelle demande
-- invalide la précédente. C'est exactement ce qu'il faut en production : un
-- code communiqué par erreur cesse d'être utilisable.
--
-- Mais pendant le développement, il faut un compte sur lequel se reconnecter
-- indéfiniment — après chaque réinstallation de l'application, après chaque
-- effacement des données. Deux mauvaises façons de le faire :
--
--   1. Une variable d'environnement « code de secours » acceptée par la route
--      d'authentification. C'est une porte dérobée : elle vit dans le code,
--      s'applique à tous les numéros, et personne ne se souvient de la retirer.
--
--   2. Régénérer un code à la main à chaque fois. Insupportable en pratique,
--      donc contourné, donc on retombe sur la solution 1.
--
-- La solution retenue déplace le problème dans la DONNÉE plutôt que dans le
-- code : un drapeau sur la ligne du code. La route d'authentification reste
-- identique pour tout le monde ; seule la consommation et l'invalidation sont
-- suspendues pour ces lignes-là.
--
-- L'avantage décisif est l'auditabilité. Pour savoir quels comptes disposent
-- d'un accès permanent, il suffit de regarder :
--
--     SELECT telephone FROM codes_activation WHERE permanent;
--
-- Et pour le retirer, un DELETE suffit — sans redéploiement, sans relecture
-- du code, sans se demander si une variable traîne quelque part.
-- ---------------------------------------------------------------------------

ALTER TABLE codes_activation
    ADD COLUMN permanent BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN codes_activation.permanent IS
    'Code de développement : jamais consommé, jamais invalidé par une nouvelle '
    'demande. À supprimer avant la mise en service réelle.';

-- Un seul code permanent par numéro : deux codes permanents concurrents sur la
-- même ligne téléphonique rendraient imprévisible celui qui répond.
CREATE UNIQUE INDEX uq_code_permanent_telephone
    ON codes_activation (telephone)
 WHERE permanent;

-- ---------------------------------------------------------------------------
-- Recensement
--
-- Une vue plutôt qu'une requête à retenir : elle apparaît dans l'explorateur
-- de schéma, ce qui rend l'existence de ces accès difficile à oublier.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_acces_permanents AS
SELECT c.telephone,
       u.nom,
       u.prenom,
       u.role,
       c.cree_le,
       c.expire_le
  FROM codes_activation c
  LEFT JOIN utilisateurs u ON u.telephone = c.telephone
 WHERE c.permanent;

COMMENT ON VIEW v_acces_permanents IS
    'Comptes disposant d''un code d''activation permanent. Doit être VIDE en '
    'exploitation réelle.';
