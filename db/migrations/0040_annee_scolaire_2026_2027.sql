-- =============================================================================
-- 0040 — Ouverture de l'année scolaire 2026-2027.
-- =============================================================================
-- CE QUE LA BASE MONTRE AVANT CETTE MIGRATION
-- --------------------------------------------
-- Relevé sur la base réelle le 2026-11-08 :
--
--   annees_scolaires : une seule ligne, « 2025-2026 », du 2025-10-01 au
--                      2026-07-15, est_courante = true ;
--   periodes         : 3 trimestres, tous avec saisie_ouverte = false ;
--   aucune période ne couvre la date du jour ;
--   0 absence datée d'aujourd'hui ou après.
--
-- Autrement dit l'exercice de la base est terminé depuis juillet 2026, alors
-- que nous sommes en novembre. Toute opération quotidienne — « qui est absent
-- ce matin ? », « enregistre cette absence », « l'emploi du temps de demain » —
-- est donc sans objet : il n'y a ni année, ni période, ni saisie ouverte pour
-- aujourd'hui. Ce n'est pas un défaut de l'assistant, c'est l'état des données.
--
-- POURQUOI UNE MIGRATION ET NON UN APPEL AU BACKEND
-- --------------------------------------------------
-- La règle du projet est que l'agent n'écrit jamais en base directement : il
-- passe par `POST /api/agent/{action}`, qui applique AUTH → RÔLE → PÉRIMÈTRE.
-- Mais ce backend n'expose AUCUNE route de création d'année ou de période
-- (vérifié : `web/src/app/api/` ne contient rien de tel). L'ouverture d'un
-- exercice est un acte d'administration du référentiel, et la voie native du
-- projet pour cela est la migration SQL versionnée, jouée dans sa propre
-- transaction par `web/scripts/migrate.mjs`. C'est donc celle-ci.
--
-- LA BASCULE DE `est_courante` EST IMPOSÉE PAR LA BASE
-- ----------------------------------------------------
-- `uq_annee_courante` est un index UNIQUE PARTIEL :
--     CREATE UNIQUE INDEX uq_annee_courante ON annees_scolaires (est_courante)
--         WHERE est_courante
-- Une seule année peut donc être courante. Insérer 2026-2027 en « courante »
-- sans basculer 2025-2026 à false ÉCHOUERAIT. Cette bascule est volontaire et
-- limitée à un drapeau : aucune absence, aucune note, aucun bulletin, aucune
-- inscription de 2025-2026 n'est modifié. `est_cloturee` reste à false — la
-- clôture d'un exercice est une décision distincte, qui verrouille les
-- bulletins, et elle n'est pas prise ici.
--
-- SAISIE OUVERTE : UN SEUL TRIMESTRE
-- -----------------------------------
-- `periodes.saisie_ouverte` vaut `true` PAR DÉFAUT. Insérer les trois
-- trimestres sans préciser ce champ ouvrirait donc la saisie sur toute l'année,
-- y compris sur des trimestres à venir — ce qui autoriserait à saisir une
-- absence en avril 2027. On pose donc la valeur explicitement : ouverte
-- uniquement sur le trimestre qui couvre la date du jour.
--
-- CE QUE CETTE MIGRATION NE DÉBLOQUE PAS
-- ---------------------------------------
-- Une absence exige `inscription_id` ET `periode_id`. Or une inscription exige
-- `annee_id` + `classe_id`, et une classe exige `annee_id`. La chaîne est donc :
--
--     année -> classes -> inscriptions -> absences
--
-- Après cette migration, 2026-2027 aura ses périodes mais 0 classe et 0
-- inscription. L'enregistrement d'absences restera impossible jusqu'au passage
-- d'année. Et ce passage — qui monte en 5ème A, qui redouble, qui a quitté
-- l'établissement — est une décision de la direction, pas une déduction
-- technique. Il fera l'objet d'une migration distincte, sur données validées.
--
-- RÉVERSIBILITÉ
-- --------------
-- `periodes.annee_id` est `ON DELETE CASCADE` : supprimer l'année retire ses
-- trois périodes, et le retour arrière est propre TANT QUE rien n'y est
-- rattaché. Dès la première absence saisie sur ce trimestre, le CASCADE
-- l'emporterait aussi — le rollback cesse alors d'être anodin. Voir
-- `0040_annee_scolaire_2026_2027.rollback.sql`.
--
-- DATES
-- ------
-- Calendrier proposé par la direction, à confronter au calendrier interne de
-- l'établissement. Il n'est PAS issu d'une source officielle :
--     année       2026-10-01 -> 2027-05-29
--     trimestre 1 2026-10-01 -> 2026-12-22
--     trimestre 2 2027-01-05 -> 2027-04-01
--     trimestre 3 2027-04-10 -> 2027-05-29
-- Les interruptions (2026-12-23 au 2027-01-04, puis 2027-04-02 au 2027-04-09)
-- sont des dates SCOLAIRES INTERNES. Elles relèvent de
-- `evenements_calendrier` (type VACANCES) et ne sont pas posées ici. Les jours
-- FÉRIÉS NATIONAUX ne le sont pas davantage : faute de source officielle
-- tchadienne vérifiable, les inventer serait pire que les omettre.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. L'année précédente cesse d'être courante.
--    Filtré sur le libellé : on ne touche que celle-là, et seulement si elle
--    est encore marquée courante. Rejouable sans effet.
-- ---------------------------------------------------------------------------
UPDATE annees_scolaires
   SET est_courante = false
 WHERE libelle = '2025-2026'
   AND est_courante;

-- ---------------------------------------------------------------------------
-- 2. L'année 2026-2027.
--    `ON CONFLICT (libelle)` : la migration est rejouable, et un second
--    passage ne crée pas de doublon — `annees_scolaires_libelle_key` le
--    refuserait de toute façon, mais avec une erreur qui arrêterait tout.
-- ---------------------------------------------------------------------------
INSERT INTO annees_scolaires (libelle, date_debut, date_fin, type_periode, est_courante, est_cloturee)
VALUES ('2026-2027', DATE '2026-10-01', DATE '2027-05-29', 'TRIMESTRE', true, false)
ON CONFLICT (libelle) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Les trois trimestres.
--    `saisie_ouverte` est calculée, et non écrite en dur : la migration reste
--    juste si elle est jouée un autre jour. Seul le trimestre qui couvre la
--    date d'application est ouvert à la saisie.
--
--    `ON CONFLICT (annee_id, numero)` s'appuie sur `periodes_annee_id_numero_key`.
-- ---------------------------------------------------------------------------
INSERT INTO periodes (annee_id, numero, libelle, date_debut, date_fin, saisie_ouverte)
SELECT a.id,
       p.numero,
       p.libelle,
       p.date_debut,
       p.date_fin,
       (CURRENT_DATE BETWEEN p.date_debut AND p.date_fin) AS saisie_ouverte
  FROM annees_scolaires a
  CROSS JOIN (VALUES
        (1::smallint, '1er Trimestre',  DATE '2026-10-01', DATE '2026-12-22'),
        (2::smallint, '2ème Trimestre', DATE '2027-01-05', DATE '2027-04-01'),
        (3::smallint, '3ème Trimestre', DATE '2027-04-10', DATE '2027-05-29')
      ) AS p(numero, libelle, date_debut, date_fin)
 WHERE a.libelle = '2026-2027'
ON CONFLICT (annee_id, numero) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Garde-fous : la migration se refuse plutôt que de laisser un état faux.
--    Chaque vérification porte sur ce que la base contient APRÈS les
--    insertions, dans la même transaction. Un échec ici annule tout.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_annee uuid;
    v_periodes int;
    v_ouvertes int;
    v_courantes int;
BEGIN
    SELECT id INTO v_annee FROM annees_scolaires WHERE libelle = '2026-2027';
    IF v_annee IS NULL THEN
        RAISE EXCEPTION '0040 : l''annee 2026-2027 est absente apres insertion';
    END IF;

    SELECT count(*) INTO v_periodes FROM periodes WHERE annee_id = v_annee;
    IF v_periodes <> 3 THEN
        RAISE EXCEPTION '0040 : % periode(s) au lieu de 3', v_periodes;
    END IF;

    -- Une seule saisie ouverte, et c'est celle qui couvre aujourd'hui.
    SELECT count(*) INTO v_ouvertes
      FROM periodes
     WHERE annee_id = v_annee AND saisie_ouverte;
    IF v_ouvertes > 1 THEN
        RAISE EXCEPTION '0040 : % periodes ouvertes a la saisie, une seule est attendue', v_ouvertes;
    END IF;

    -- L'invariant que l'index protege deja, verifie explicitement : une seule
    -- annee courante dans toute la table.
    SELECT count(*) INTO v_courantes FROM annees_scolaires WHERE est_courante;
    IF v_courantes <> 1 THEN
        RAISE EXCEPTION '0040 : % annee(s) courante(s), une seule est attendue', v_courantes;
    END IF;

    -- Aucune donnee de 2025-2026 ne doit avoir bouge : on verifie que ses
    -- periodes sont intactes et toujours rattachees a elle.
    IF (SELECT count(*) FROM periodes p
          JOIN annees_scolaires a ON a.id = p.annee_id
         WHERE a.libelle = '2025-2026') <> 3 THEN
        RAISE EXCEPTION '0040 : les periodes de 2025-2026 ne sont plus au nombre de 3';
    END IF;

    RAISE NOTICE '0040 : annee 2026-2027 ouverte, % periodes, % a la saisie', v_periodes, v_ouvertes;
END $$;
