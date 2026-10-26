# Communication V2 — plan de travail
Base : 4516039812a79790ff0b507c99b2d71fed075e3c (main, 26 octobre 2026).
Branche : feat/communication-v2. Aucun déploiement, aucun accès à des secrets ni à la base de production.

| Lot | Acceptation avant code | État |
|---|---|---|
| Audit | O1–O17 référencés, chaîne et événements reconstruits | Fait, sans données production |
| Benchmark | Sources primaires publiques, pratiques adaptées | Fait, périmètre ciblé |
| P0 | Suspension globale, simulation sans réseau, réclamation atomique, baux, reprises, IN_APP immédiat pour nouvelles lignes, historique intact | Implémenté en recette |
| P1 | Segments avec signature, budgets et confirmation serveur, compteurs exhaustifs, masquage avant sérialisation | Implémenté en recette |
| P2 | Audience vérifiée serveur, aperçu et coût, FR/AR, brouillons, programmation | Partiel : composeur/recette, pièces jointes/RSVP à faire |
| P3 | Gentelella officiel, filtres/pagination serveur, détail et actions tracées | Partiel : journal/recette, annonces avancées à faire |
| P4 | Contrôles événements existants sans doublon, restrictions | À faire |
| P5 | Fils et périmètres, modération et pilotage | À faire |
| Adversarial | Pannes, 5000 simulés, sécurité, couverture, build, accessibilité | Partiel : base/domaine faits ; navigateur et fournisseur non certifiés |

À chaque reprise : lire PLAN.md puis PROGRESS.md. Un critère non mesuré reste non certifié.
