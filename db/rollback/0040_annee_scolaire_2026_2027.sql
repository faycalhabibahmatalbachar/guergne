-- =============================================================================
-- 0040 — RETOUR ARRIÈRE de l'ouverture de l'année 2026-2027.
-- =============================================================================
-- Ce fichier vit dans `db/rollback/`, et NON dans `db/migrations/`.
-- C'est délibéré : `web/scripts/migrate.mjs` fait
--     readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort()
-- Il joue donc TOUT fichier `.sql` du dossier des migrations, sans distinguer
-- un nom de rollback. Laissé là, ce fichier aurait été exécuté comme une
-- migration — et, l'ordre alphabétique plaçant « .rollback.sql » avant
-- « .sql », il aurait été joué puis marqué comme appliqué, donc jamais
-- rejouable le jour où on en aurait réellement besoin.
--
-- À JOUER À LA MAIN, ET SEULEMENT APRÈS AVOIR LU L'AVERTISSEMENT
-- ---------------------------------------------------------------
-- `periodes.annee_id`, `absences.periode_id`, `retards.periode_id`,
-- `evaluations.periode_id`, `bulletins.periode_id`… sont TOUS en
-- `ON DELETE CASCADE`. Supprimer l'année 2026-2027 supprime donc en cascade :
--
--     ses 3 périodes, puis TOUTE absence, tout retard, toute évaluation,
--     tout bulletin, toute moyenne et toute sanction qui y seraient rattachés.
--
-- Tant que rien n'a été saisi sur 2026-2027, ce retour arrière est propre et
-- ne retire que les 4 lignes créées par 0040. Dès la première absence saisie,
-- il devient DESTRUCTEUR.
--
-- Le bloc de contrôle ci-dessous refuse donc de supprimer l'année si quoi que
-- ce soit y est rattaché. Pour forcer malgré tout, il faut supprimer ces
-- données sciemment, une par une, et en répondre.
-- =============================================================================

DO $$
DECLARE
    v_annee uuid;
    v_rattache int := 0;
    v_n int;
    v_table text;
BEGIN
    SELECT id INTO v_annee FROM annees_scolaires WHERE libelle = '2026-2027';
    IF v_annee IS NULL THEN
        RAISE NOTICE 'rollback 0040 : aucune annee 2026-2027, rien a faire';
        RETURN;
    END IF;

    -- On compte ce qui pend aux périodes de cette année, table par table.
    FOR v_table IN
        SELECT unnest(ARRAY['absences','retards','evaluations','bulletins',
                            'moyennes_generales','moyennes_matiere','notes_conduite',
                            'appreciations_matiere','incidents','sanctions','conseils_classe'])
    LOOP
        EXECUTE format(
            'SELECT count(*) FROM %I t JOIN periodes p ON p.id = t.periode_id WHERE p.annee_id = $1',
            v_table
        ) INTO v_n USING v_annee;
        IF v_n > 0 THEN
            RAISE NOTICE 'rollback 0040 : % ligne(s) dans %', v_n, v_table;
            v_rattache := v_rattache + v_n;
        END IF;
    END LOOP;

    -- Et ce qui pend directement à l'année.
    FOR v_table IN
        SELECT unnest(ARRAY['classes','inscriptions','emploi_du_temps','affectations',
                            'coefficients','profils_horaires','regles_horaires_annee',
                            'evenements_calendrier','annonces','grilles_tarifaires','tranches',
                            'indisponibilites'])
    LOOP
        EXECUTE format('SELECT count(*) FROM %I WHERE annee_id = $1', v_table) INTO v_n USING v_annee;
        IF v_n > 0 THEN
            RAISE NOTICE 'rollback 0040 : % ligne(s) dans %', v_n, v_table;
            v_rattache := v_rattache + v_n;
        END IF;
    END LOOP;

    IF v_rattache > 0 THEN
        RAISE EXCEPTION
            'rollback 0040 refuse : % ligne(s) sont rattachees a 2026-2027. '
            'Les supprimer par CASCADE detruirait des donnees saisies.', v_rattache;
    END IF;

    -- Rien n'y pend : on retire l'année (ses 3 périodes partent en cascade).
    DELETE FROM annees_scolaires WHERE id = v_annee;
    RAISE NOTICE 'rollback 0040 : annee 2026-2027 et ses 3 periodes supprimees';

    -- On rend à 2025-2026 son drapeau. L'ordre compte : l'index unique partiel
    -- `uq_annee_courante` interdirait deux annees courantes simultanement.
    UPDATE annees_scolaires SET est_courante = true WHERE libelle = '2025-2026';
    RAISE NOTICE 'rollback 0040 : 2025-2026 redevient courante';

    -- Le temoin de migration part aussi, sinon `migrate.mjs` croirait 0040
    -- toujours appliquee et refuserait de la rejouer. La table `_migrations`
    -- n'a que deux colonnes, `nom` (cle primaire) et `applique_le`.
    DELETE FROM _migrations WHERE nom LIKE '0040%';
END $$;
