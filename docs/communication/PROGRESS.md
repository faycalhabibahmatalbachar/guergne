# Journal
## 26 octobre 2026 — initialisation
- Lu la mission jointe, retrouvé le dépôt local, vérifié main par GitHub et fetch.
- Créé un worktree isolé feat/communication-v2, sans altérer l'autre session.
- Lu web/AGENTS.md et la documentation Next.js locale (Server Actions, Route Handlers).
- Sources officielles Gentelella déjà intégrées dans web/src/vendor/gentelella-v4.
- Réutilisé les dépendances locales sans copier de variables d'environnement.
- Baseline npm test exécutée : échecs préexistants ; sortie brute evidence/baseline-tests.txt.
- Prochaine action exacte : terminer les références audit, écrire tests de sécurité/états et garde d'expédition avant tout traitement.

## 26 octobre 2026 — lots audit, P0/P1 et interface de recette
- Audit O1–O17 et benchmark ciblé documentés sans transformer les chiffres de capture en mesures.
- Suspension fail-closed placée avant les adaptateurs SMS et FCM ; le fournisseur `journal` ne peut plus produire un faux succès.
- Outbox V2 réversible : transitions auditées, réservation atomique, idempotence, baux, reprise, expiration et accusés monotones.
- Campagnes de recette isolées ; audience serveur, doublons exclus, numéros suspects, segments GSM-7/Unicode, budget et confirmation transactionnels.
- Journal paginé serveur et composeur FR/AR rendus avec les CSS, panneaux, boutons et tables Gentelella officiels ; numéros masqués avant sérialisation.
- Correctifs transverses : notification décochée par défaut, coût segmenté en FCFA, raccourci Ctrl/⌘+K traduit, contrôle destinataire sur lecture de message et lien parent-élève.
- Revue hostile : corrigé (1) la simulation qui polluait initialement les tables réelles, (2) le déclassement par webhook désordonné, (3) l'IDOR de lecture de message, (4) l'estimation sans signature, (5) un jeton de bail rejouable.
- Preuves : 6/6 tests de domaine ; migrations up/down et pannes injectées PASS ; 5 000 lignes simulées PASS ; typecheck PASS. Test complet : 159/160, seul échec Gmail préexistant.
- Prochaine action exacte : créer une branche Neon de recette, y exécuter `db/communication-v2/up.sql`, activer uniquement la simulation, puis effectuer Lighthouse/axe et parcours authentifié. Aucune production.
