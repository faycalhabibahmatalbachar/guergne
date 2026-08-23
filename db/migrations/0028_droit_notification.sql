-- ---------------------------------------------------------------------------
-- 0028 — Droit de configurer les notifications
--
-- POURQUOI UN DROIT À PART
-- ------------------------
-- Choisir si une absence part par SMS ou seulement dans l'application est un
-- arbitrage entre prévenir les familles et dépenser : c'est une décision de
-- chef d'établissement, pas d'administrateur technique.
--
-- Or `parametre:modifier` n'est accordé qu'au super-administrateur, et il
-- ouvre aussi les années scolaires, les périodes et les coefficients — des
-- réglages qui, mal touchés, cassent les bulletins. Élargir ce droit à la
-- direction pour lui permettre de régler les SMS lui donnerait tout le reste
-- avec.
-- ---------------------------------------------------------------------------

INSERT INTO permissions (role, action, portee) VALUES
    ('SUPER_ADMIN', 'notification:configurer', 'AUCUNE'),
    ('DIRECTION',   'notification:configurer', 'AUCUNE')
ON CONFLICT DO NOTHING;
