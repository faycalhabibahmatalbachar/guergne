-- =============================================================================
-- 0041 — RETOUR ARRIÈRE : la DIRECTION revient à ses 36 droits d'origine.
-- =============================================================================
-- Ce fichier vit dans `db/rollback/`, et NON dans `db/migrations/`.
-- C'est délibéré : `web/scripts/migrate.mjs` fait
--     readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort()
-- Il joue donc TOUT fichier `.sql` du dossier des migrations. Laissé là, ce
-- fichier aurait annulé 0041 aussitôt après son application.
--
-- À JOUER À LA MAIN, et seulement pour revenir sur la décision du propriétaire.
--
-- CE QU'IL FAIT, ET CE QU'IL NE PEUT PAS FAIRE
-- ---------------------------------------------
-- Il retire de la DIRECTION tout droit qui n'appartient pas à l'état relevé le
-- 2026-11-10 — les 36 droits ci-dessous, mesurés, nommés un par un. Il ne
-- « défait » donc pas une liste : il RESTAURE un état connu. C'est la seule
-- façon correcte de revenir en arrière, car entre-temps la matrice a pu
-- recevoir d'autres droits par d'autres migrations, et une simple négation de
-- 0041 les emporterait ou les laisserait au hasard.
--
-- Ce qu'il ne peut pas défaire : les opérations déjà réalisées PAR la direction
-- grâce à ces droits. Une inscription faite reste faite ; retirer le droit
-- n'annule pas l'acte. L'audit (`journaliser`) en garde la trace, et c'est là
-- qu'il faut regarder, pas ici.
--
-- Il ne touche aucun autre rôle, et le vérifie.
-- =============================================================================

-- --------------------------------------------------------------------------
-- L'état d'origine, relevé le 2026-11-10 sur br-calm-art ET br-red-waterfall
-- (identique sur les deux branches). 36 droits, tous en portée `AUCUNE`.
-- --------------------------------------------------------------------------
CREATE TEMPORARY TABLE _0041_origine (action TEXT PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _0041_origine (action) VALUES
    ('annee:cloturer'),            ('annonce:publier'),         ('assiduite:lire'),
    ('audit:lire'),                ('bulletin:generer'),        ('bulletin:lire'),
    ('bulletin:publier'),          ('classe:creer'),            ('classe:lire'),
    ('classe:modifier'),           ('conseil_classe:tenir'),    ('conseil_classe:valider'),
    ('conseil_discipline:convoquer'), ('convocation:emettre'),  ('decision:prononcer'),
    ('discipline:lire'),           ('discipline:sanctionner'),  ('document:emettre'),
    ('eleve:creer'),               ('eleve:exclure'),           ('eleve:lire'),
    ('eleve:modifier'),            ('eleve:reactiver'),         ('eleve:suspendre'),
    ('eleve:transferer'),          ('finance:configurer'),      ('finance:exonerer'),
    ('finance:lire'),              ('message:envoyer'),         ('note:lire'),
    ('notification:configurer'),   ('periode:deverrouiller'),   ('periode:verrouiller'),
    ('statistique:lire'),          ('utilisateur:creer'),       ('utilisateur:desactiver');

-- Les autres rôles, AVANT, pour prouver qu'ils ne bougent pas.
CREATE TEMPORARY TABLE _0041_avant AS
SELECT role, count(*) AS n
  FROM permissions
 WHERE role <> 'DIRECTION'
 GROUP BY role;

DO $$
DECLARE
    v_attendu INTEGER;
    v_present INTEGER;
BEGIN
    SELECT count(*) INTO v_attendu FROM _0041_origine;
    -- Un garde-fou AVANT de supprimer : si l'état d'origine listé ici n'est pas
    -- intégralement présent, c'est que la matrice a divergé depuis le relevé.
    -- Restaurer à l'aveugle retirerait alors des droits sans les rendre.
    SELECT count(*) INTO v_present
      FROM _0041_origine o
     WHERE EXISTS (SELECT 1 FROM permissions p WHERE p.role = 'DIRECTION' AND p.action = o.action);
    IF v_present <> v_attendu THEN
        RAISE EXCEPTION
            '0041 rollback : % des % droits d''origine sont presents. La matrice a diverge du releve du 2026-11-10 ; relisez-la avant de restaurer.',
            v_present, v_attendu;
    END IF;
END $$;

DELETE FROM permissions
 WHERE role = 'DIRECTION'
   AND action NOT IN (SELECT action FROM _0041_origine);

DO $$
DECLARE
    v_dir   INTEGER;
    v_bouge TEXT;
BEGIN
    SELECT count(*) INTO v_dir FROM permissions WHERE role = 'DIRECTION';
    IF v_dir <> (SELECT count(*) FROM _0041_origine) THEN
        RAISE EXCEPTION '0041 rollback : DIRECTION a % droits, % attendus',
            v_dir, (SELECT count(*) FROM _0041_origine);
    END IF;

    SELECT string_agg(format('%s %s->%s', a.role, a.n, c.n), ', ')
      INTO v_bouge
      FROM _0041_avant a
      JOIN (SELECT role, count(*) AS n FROM permissions WHERE role <> 'DIRECTION' GROUP BY role) c
        ON c.role = a.role
     WHERE a.n <> c.n;
    IF v_bouge IS NOT NULL THEN
        RAISE EXCEPTION '0041 rollback : des roles autres que DIRECTION ont change : %', v_bouge;
    END IF;

    RAISE NOTICE '0041 rollback : DIRECTION ramenee a % droits', v_dir;
END $$;

-- Le registre garde la trace de l'application de 0041. Le retirer permet de la
-- rejouer ; le laisser rend le retour arrière définitif pour `migrate.mjs`.
-- Ligne volontairement commentée : c'est une décision, pas un effet de bord.
-- DELETE FROM _migrations WHERE nom = '0041_direction_permissions_metier.sql';
