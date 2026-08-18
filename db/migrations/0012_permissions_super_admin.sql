-- =============================================================================
-- 0012 — Correctif : périmètre complet du SUPER_ADMIN.
--
-- PROBLÈME DÉTECTÉ (vérification de l'interface avec un compte réel)
-- La migration 0009 n'accordait au SUPER_ADMIN que 14 actions, essentiellement
-- techniques. Résultat : les entrées Classes, Emploi du temps, Assiduité,
-- Discipline et Communication étaient masquées dans le menu, alors que ce rôle
-- est censé pouvoir tout atteindre — notamment pour dépanner l'établissement.
--
-- CORRECTIF : le SUPER_ADMIN reçoit l'intégralité des actions existantes.
-- La requête est dérivée de la table elle-même : toute action ajoutée à un
-- autre rôle plus tard devra être accordée explicitement, mais aucune action
-- déjà connue ne peut lui manquer aujourd'hui.
-- =============================================================================

INSERT INTO permissions (role, action, portee)
SELECT DISTINCT 'SUPER_ADMIN'::role_utilisateur, p.action, 'AUCUNE'
  FROM permissions p
 WHERE p.role <> 'SUPER_ADMIN'
ON CONFLICT (role, action) DO NOTHING;

-- Actions purement techniques, qui n'appartiennent à aucun autre rôle et
-- n'auraient donc pas été reprises par la requête ci-dessus.
INSERT INTO permissions (role, action, portee)
SELECT 'SUPER_ADMIN'::role_utilisateur, a, 'AUCUNE'
  FROM unnest(ARRAY[
    'systeme:administrer',
    'permission:gerer',
    'sauvegarde:executer',
    'audit:lire',
    'parametre:modifier'
  ]) AS a
ON CONFLICT (role, action) DO NOTHING;
