-- ---------------------------------------------------------------------------
-- 0032 — Recherche insensible aux accents (E-39)
-- ---------------------------------------------------------------------------
-- « Grace » doit trouver « Grâce », « Elie » doit trouver « Élie », « Djasrabe »
-- doit trouver « Djasrabé ».
--
-- POURQUOI CE N'EST PAS UN CONFORT
-- ---------------------------------
-- Les prénoms tchadiens portent des accents que personne ne tape au guichet :
-- on cherche vite, au téléphone, sur un clavier de portable. Sans cette
-- extension, la moitié du fichier devient introuvable autrement qu'en faisant
-- défiler la liste — et l'utilisateur conclut que la recherche ne marche pas.
--
-- `unaccent()` n'est pas IMMUTABLE : elle ne peut donc pas servir dans un index
-- fonctionnel sans être enveloppée. On l'accepte — le fichier compte quelques
-- centaines d'élèves, un parcours séquentiel sur ce volume est instantané, et
-- une fausse promesse d'immutabilité produirait des index silencieusement faux
-- si le dictionnaire changeait.

CREATE EXTENSION IF NOT EXISTS unaccent;
