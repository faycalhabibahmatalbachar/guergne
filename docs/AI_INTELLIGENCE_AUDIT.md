# Audit du cerveau de l'agent

État du code au 12 novembre 2026, branche `voix-bidirectionnelle`. Ce document décrit ce que fait réellement l'agent quand il reçoit un message, ce qui n'allait pas, et ce qui a été changé. Les chiffres viennent du banc d'essai (`docs/AI_TEST_CAMPAIGN_REPORT.md`).

## 1. Le parcours d'un message

| # | Étape | Où | Ce qui s'y passe |
|---|---|---|---|
| 1 | Réception | `src/providers/wwebjs.js` | Message WhatsApp → forme stable (`normalizeIncoming`). |
| 2 | Doublon | `engine.js` § 1 | Un identifiant de message n'est traité qu'une fois. |
| 3 | Identité | `engine.js` § 2, `jid.js` | Le numéro (résolu si c'est un LID) doit être dans le magasin d'identités. Groupes et diffusions : refusés **sans réponse**. |
| 4 | Voix | `engine.js` § 3 | Note vocale → transcription, contrôle de qualité. |
| 5 | Mémoire | `memoire-vive.js`, `memoire-composee.js`, `memory.js` | Le fil de CETTE conversation (acteur + numéro) est chargé. |
| 6 | Commandes directes | `engine.js` | `TEST AGENT`, « nouveau sujet », préférences de mémoire : sans modèle. |
| 7 | Confirmation en attente | `confirmation.js` | « oui / non » comparé à l'empreinte de l'action préparée. |
| 8 | Choix en attente | `resolution-parametres.js` → `choisir` | « 2 », « celle de 6e B » comparé aux candidats montrés : sans modèle. |
| 9 | Compréhension | `interprete.js` | L'invite est assemblée, le modèle rend un plan JSON. |
| 10 | Contrat | `plan.js` | Le plan est validé : outil, mission, conversation ou clarification. |
| 11 | Résolution des entités | `resolution-parametres.js` | Les noms deviennent des identifiants, ou une question. |
| 12 | Valeurs non dites | `engine.js` § 5 ter | Une décision, un établissement d'accueil que l'utilisateur n'a pas écrits sont retirés. |
| 13 | Validation | `tool.validate`, `manques.js` | Ce qui manque est nommé en clair. |
| 14 | Permission | `permissions-matrix.js` | Pré-filtre ; le backend reste l'autorité. |
| 15 | Préparation | `tool.preparer` | Relecture au backend, récapitulatif. |
| 16 | Politique / confirmation | `politiques.js`, `confirmation.js` | Exécution directe ou attente d'un « oui ». |
| 17 | Exécution | `guergne-client.js` → `/api/agent/{action}` | Jeton de service + acteur réel ; garde, action serveur, base. |
| 18 | Vérification | `tool.verifier` | Relecture après écriture. Échec = « non vérifié », jamais « réussi ». |
| 19 | Réponse | `tool.rendre`, `rendu.js` | Mise en forme pour un téléphone, totaux réels annoncés. |
| 20 | Fil | `foyer.js` | Les entités du tour (identifiants) entrent dans le fil. |
| 21 | Enchaînement | `engine.js` `_conduireOutil` | Si le plan portait une suite (`puis`), elle repasse par 11 → 20. |
| 22 | Supervision | `supervision.js` | Intention, outil, issue, durée — sans contenu. |

## 2. Ce que le modèle voit

Vérifié à l'exécution, pas à la lecture du code : `node banc/invite.mjs "et les retards ?"` affiche l'invite assemblée.

Sept blocs, dans cet ordre : le contrat de réponse et le registre des 52 outils ; les libellés des classes et des périodes ; la date du jour et les intervalles usuels ; le fil de la conversation ; les préférences mémorisées et une éventuelle question en suspens ; les derniers messages de l'utilisateur ; le message.

Deux propriétés, toutes deux testées (`test/resolution-parametres.test.js`) :

- **aucun identifiant technique** : ni UUID, ni nom de paramètre en `…Id` ;
- **aucune donnée scolaire** : le modèle planifie, il ne lit pas. Les résultats d'une consultation ne lui sont jamais renvoyés.

Taille : environ 19 500 caractères pour le registre, soit près de 6 000 jetons par appel.

## 3. Défauts trouvés, composant responsable, correction

Mesurés par la campagne de référence (132 scénarios, moteur du commit `1a8e4d2`, sans mémoire) : 73 réussis, 33 partiels, 21 échoués, 5 non exécutés.

| Défaut observé | Composant responsable | Correction |
|---|---|---|
| L'interprète réel vivait dans `app.js` : impossible à éprouver sans lancer WhatsApp. | Assemblage | Extrait dans `src/interprete.js`, construit à l'identique par `app.js` et par le banc. |
| « Quel est l'identifiant (UUID) de la classe 6e A ? » — le modèle recopiait des UUID depuis son invite, ou les réclamait. | Registre + invite | Le registre montre des mots ; le résolveur central fait les identifiants. |
| Aucun contexte entre deux messages : « et ses notes ? » → « De quel élève ? ». | Mémoire éteinte par défaut | Mémoire de session en mémoire vive, toujours active ; foyer d'entités. |
| « 2 » après un menu d'homonymes n'était pas compris. | Aucune mémoire du menu | Question de choix persistée, réponse comparée aux candidats. |
| « les retards de la semaine » : intervalle deviné, ou ignoré. | Invite sans date ; backend sans filtre | Date et intervalles donnés au modèle ; filtres par dates et par élève ajoutés au backend. |
| « Nous sommes en 2026-2027 » répondu de mémoire (la base dit 2025-2026). | Garde-fou trop étroit | Une année scolaire citée en conversation est rejetée comme donnée inventée. |
| « Retards — 100 résultats » quand il y en a 209. | Opération backend sans total | L'opération rend lignes et total. |
| Chaque responsable affiché « lien non précisé », jamais principal. | Rendu lisant des champs inexistants | Rendu aligné sur les champs réels (`lien`, `estPrincipal`). |
| « Précisez : Information requise. Information requise. » | Message de validation | `manques.js` nomme chaque information manquante. |
| Justifier ou supprimer une absence exigeait son identifiant. | Contrat d'outil | Désignation par élève et date ; relecture avant et après. |
| Une exclusion sans décision passait en confirmation : le modèle avait rédigé la décision. | Aucun contrôle de provenance | `ditParLUtilisateur` : la valeur doit figurer dans les messages de l'utilisateur. |
| Une mission (« les absents de 6e A et préviens leurs parents ») était refusée. | Missions limitées aux lectures, sans résolution | Enchaînement `puis` ; étapes de mission résolues et préparées. |
| Une consultation sans rendu répondait « ✅ Opération effectuée ». | Repli du moteur | Message honnête ; rendus ajoutés. |
| Chercher un parent par « prénom nom » ne rendait personne. | Filtre SQL du backend | Recherche sur le nom complet, dans les deux ordres. |
| « Numéro non autorisé » aurait été écrit dans un groupe. | Refus d'identité | Groupes et diffusions : aucun message. |
| Une confirmation relue après redémarrage était toujours rejetée. | Mémoire durable sans empreinte | Empreinte, expiration et acteur persistés avec l'attente. |
| Le journal d'audit grossissait sans limite en mémoire. | `audit.js` | Borné à 500 entrées. |

## 4. Ce qui reste vrai et qu'il faut savoir

- **Le modèle est joint par trois fournisseurs en repli.** Groq d'abord ; son quota par minute est vite atteint avec une invite de 6 000 jetons, et la majorité des appels passe par OpenRouter, plus lent. C'est la première cause de latence.
- **La mémoire durable est éteinte en production** (`AGENT_MEMORY_ENABLED=false`). Le fil vit en mémoire vive : il se perd au redémarrage. Le code de reprise est prouvé sur la base de test ; l'activer en production est une décision d'exploitation (voir `docs/AI_PRODUCTION_READINESS.md`).
- **Les écritures de l'agent sont éteintes en production** (`AGENT_ECRITURES_ACTIVES` absent). Toutes les écritures mesurées l'ont été sur la base de test.
- **Les limites de capacité** sont listées à la fin de `docs/AI_CAPABILITY_CATALOG.md`.
