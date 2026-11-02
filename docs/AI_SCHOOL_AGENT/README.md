# School AI Agent — Pilotage de la plateforme scolaire par WhatsApp

> Agent opérationnel qui permet aux responsables de l'établissement (2–3 personnes)
> de piloter la plateforme **guergne** par une conversation WhatsApp (texte, vocal,
> documents), sans ouvrir l'interface web. L'application web reste la **source
> officielle des données** ; l'agent agit **à travers son backend**, jamais en SQL direct.

État : **P0 — Audit** (en cours). Ce dossier est la référence officielle du projet.

---

## Comment lire ce dossier

| Document | Rôle | État |
|---|---|---|
| [AUDIT_EXISTANT.md](AUDIT_EXISTANT.md) | Synthèse de l'audit, classement de l'existant | ✅ Rédigé |
| [INVENTAIRE_WHATSAPP.md](INVENTAIRE_WHATSAPP.md) | Précédents WhatsApp réels et leur stack | ✅ Rédigé |
| [INVENTAIRE_TOUMAI_AI.md](INVENTAIRE_TOUMAI_AI.md) | Briques Toumaï AI réutilisables (raisonnement, STT) | ✅ Rédigé |
| [CARTOGRAPHIE_BACKEND.md](CARTOGRAPHIE_BACKEND.md) | Modules, tables, API et couche domaine de guergne | ✅ Rédigé (1er passage) |
| [AUDIT_NORTHFLANK.md](AUDIT_NORTHFLANK.md) | Infrastructure Northflank | ⛔ Bloqué (accès indisponible) |
| [JOURNAL_IMPLEMENTATION.md](JOURNAL_IMPLEMENTATION.md) | Avancement mesurable, pas à pas | ✅ Ouvert |
| [DECISIONS_TECHNIQUES.md](DECISIONS_TECHNIQUES.md) | Registre des décisions (transport WhatsApp…) | ✅ Ouvert (DT-001 confirmé) |
| [CAHIER_DES_CHARGES_COMPLET.md](CAHIER_DES_CHARGES_COMPLET.md) | Spécification fonctionnelle et technique | ✅ v0.1 (socle) |
| [ARCHITECTURE_WHATSAPP.md](ARCHITECTURE_WHATSAPP.md) | Provider, session, concurrence | ✅ Rédigé |
| [ARCHITECTURE_TECHNIQUE.md](ARCHITECTURE_TECHNIQUE.md) | Architecture d'ensemble + contrat API agent | ✅ Rédigé |
| [CATALOGUE_OUTILS_AGENT.md](CATALOGUE_OUTILS_AGENT.md) | Registre d'outils métier (Assiduité détaillé) | ✅ Assiduité |
| [MATRICE_PERMISSIONS.md](MATRICE_PERMISSIONS.md) | Matrice réelle rôles → permissions | ✅ Rédigé |
| [Service `agent/`](../../agent/README.md) | Cœur de l'agent (code + tests, **28/28**) | ✅ Cœur testé |
| SECURITE_ET_AUDIT.md / OBSERVABILITE.md | Sécurité, traçabilité, observabilité | ⏳ À venir |
| ENVIRONNEMENT_TEST.md / PLAN_DE_TESTS.md | Simulation, dry-run, stratégie de tests | ⏳ À venir |
| AUTOMATISATIONS.md | Moteur d'automatisations | ⏳ À venir |
| NORTHFLANK_*.md | Architecture / déploiement / runbook | ⏳ À venir (dépend de l'accès) |
| ROADMAP_P0_P1_P2_P3.md | Feuille de route | ⏳ À venir |

Les documents marqués ⏳ ne sont pas encore écrits : ils dépendent soit de décisions
que seul l'établissement peut trancher (voir AUDIT_EXISTANT §6), soit d'un accès non
disponible aujourd'hui (Northflank).

## Principe de preuve

Conformément aux règles de la mission, **aucun constat n'est affirmé sans preuve**
(chemin de fichier, commit, endpoint, manifeste). Les éléments non vérifiés sont
marqués comme tels. Un service créé n'est pas un service opérationnel ; une réponse
de l'IA n'est pas une preuve de modification en base.
