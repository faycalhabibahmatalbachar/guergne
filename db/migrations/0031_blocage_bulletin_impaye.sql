-- ---------------------------------------------------------------------------
-- 0031 — Retenue du bulletin en cas d'impayé (E-58)
-- ---------------------------------------------------------------------------
-- L'établissement retient le bulletin d'un élève dont la scolarité n'est pas
-- réglée. C'est une pratique réelle, et elle doit être outillée : faite à la
-- main, elle repose sur la mémoire du secrétariat, qui retient le mauvais
-- élève une fois sur cinq et laisse passer les autres.
--
-- DÉSACTIVÉE PAR DÉFAUT
-- ----------------------
-- Le paramètre vaut 'non' à l'installation. Activer une rétention de document
-- à l'insu du chef d'établissement serait lui imposer une politique qu'il n'a
-- pas choisie — et la première fois qu'un parent à jour verrait son bulletin
-- retenu, c'est le logiciel entier qui perdrait sa crédibilité.
--
-- LA RETENUE PORTE SUR LA PUBLICATION, PAS SUR LA LECTURE INTERNE
-- ----------------------------------------------------------------
-- Le censeur doit voir le bulletin pour tenir son conseil de classe, même
-- impayé. C'est la remise à la FAMILLE qui est suspendue. Et un bulletin déjà
-- publié n'est jamais repris : un document remis est remis, le faire
-- disparaître d'une application se lirait comme une panne, pas comme une
-- sanction.
--
-- UN SEUIL DE TOLÉRANCE, PARCE QUE ZÉRO N'EST PAS UN SEUIL
-- ---------------------------------------------------------
-- Un reliquat de 500 F sur 150 000 F n'est pas un impayé, c'est un arrondi de
-- caisse. Retenir un bulletin pour cela ferait perdre plus de temps en
-- explications que la somme n'en vaut.

INSERT INTO parametres (cle, valeur, description)
VALUES
  ('bulletin_blocage_impaye', 'non',
   'Retenir la publication du bulletin quand la scolarite n''est pas reglee (oui/non).'),
  ('bulletin_blocage_seuil_fcfa', '0',
   'Reste du en dessous duquel le bulletin est publie malgre tout (tolerance de caisse).')
ON CONFLICT (cle) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Levée individuelle de la retenue
-- ---------------------------------------------------------------------------
-- Indispensable, et pas une échappatoire : un cas social, un dossier de bourse
-- en cours d'instruction, un parent en litige de bonne foi. Sans levée
-- possible, le secrétariat contournerait la règle en désactivant le paramètre
-- pour toute l'école — et on perdrait à la fois la règle et la trace.
--
-- Les colonnes vivent sur le bulletin et non dans une table à part : la levée
-- vaut pour CE bulletin, pour CETTE période. Elle ne se reconduit pas d'un
-- trimestre à l'autre, sinon une exception accordée une fois deviendrait
-- permanente sans que personne ne la redécide.
--
-- La régénération des bulletins ne touche que les nombres (moyennes, rang) :
-- une levée accordée survit donc à un recalcul, comme l'appréciation du
-- conseil.

ALTER TABLE bulletins
    ADD COLUMN IF NOT EXISTS blocage_leve_par  UUID REFERENCES utilisateurs(id),
    ADD COLUMN IF NOT EXISTS blocage_leve_le   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS motif_levee       TEXT;

-- Un motif est exigé dès qu'une levée est enregistrée : « levé par le censeur »
-- sans raison écrite ne se défend pas devant un parent qui, lui, a payé.
ALTER TABLE bulletins
    DROP CONSTRAINT IF EXISTS chk_levee_motivee;
ALTER TABLE bulletins
    ADD CONSTRAINT chk_levee_motivee CHECK (
        blocage_leve_par IS NULL
        OR (motif_levee IS NOT NULL AND btrim(motif_levee) <> '')
    );
