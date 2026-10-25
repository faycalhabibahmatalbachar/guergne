-- 0034 — Stockage de l'appréciation automatique du travail.
-- L'appréciation du barème est distincte du commentaire libre du conseil.
ALTER TABLE public.bulletins
  ADD COLUMN IF NOT EXISTS appreciation_travail TEXT;

UPDATE public.bulletins
   SET appreciation_travail = CASE
     WHEN moyenne_generale IS NULL THEN NULL
     WHEN moyenne_generale < 0 OR moyenne_generale > 20 THEN NULL
     WHEN moyenne_generale >= 18 THEN 'Excellent Travail'
     WHEN moyenne_generale >= 16 THEN 'Très bien'
     WHEN moyenne_generale >= 14 THEN 'Bien'
     WHEN moyenne_generale >= 12 THEN 'Assez-bien'
     WHEN moyenne_generale >= 11 THEN 'Passable'
     WHEN moyenne_generale >= 10 THEN 'Moyen'
     WHEN moyenne_generale >= 8 THEN 'Insuffisant'
     WHEN moyenne_generale >= 6 THEN 'Faible'
     WHEN moyenne_generale >= 5 THEN 'Très faible'
     WHEN moyenne_generale >= 3 THEN 'Médiocre'
     ELSE 'Travail nul'
   END;

COMMENT ON COLUMN public.bulletins.appreciation_travail IS
  'Appreciation automatique du travail selon le bareme officiel base sur la moyenne generale sur 20.';
