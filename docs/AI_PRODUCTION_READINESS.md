# Mise en production du cerveau de l'agent

Ce qui est prêt, ce qui ne l'est pas, dans quel ordre déployer, et comment revenir en arrière.

## État au 13 novembre 2026, 15 h 05 UTC — DÉPLOYÉ

| | Fait | Preuve |
|---|---|---|
| Fusion | `main` (26 commits d'un autre ingénieur) fusionné dans la branche, sans conflit ; `main` avancé en avance rapide à `3cc69db` | `git log origin/main` |
| Vérifications avant | 936 tests agent, 241 tests backend, typage, build (webpack) du code fusionné | — |
| Backend | Vercel Production, statut « success » sur `3cc69db` | appels réels sur le domaine : `nommerClasses` → 9 classes (identifiant, libellé, code), `listerAnnees` → 2 années, `listerRetards` → `{lignes, total}`, `rechercherTuteurs` → 200 |
| Agent | sauvegarde du code en place (`sauvegardes/altare-code-2026-11-13T14-06-27-037Z`, 153 fichiers) ; 24 fichiers déposés et vérifiés par empreinte ; redémarré à 15:03:14 UTC, de retour à 15:04:27 | `/sante` 200, WhatsApp **ready** (session conservée) ; `/diagnostic/supervision` (route nouvelle) → 200, mémoire de session active |
| Lint | erreurs préexistantes sur des lignes non modifiées (`server-only`, conditions de `parents.ts` venues de `main`) | `npx biome lint` |

Le parcours WhatsApp réel avec le nouveau cerveau n'a **pas** été éprouvé : il demande un message envoyé depuis un téléphone autorisé.

## 1. Ce qui part en production

| Composant | Contenu | Où |
|---|---|---|
| Backend web | filtres par élève et par dates (absences, retards, incidents, sanctions) ; total des retards ; recherche de parent par nom complet ; `nommerClasses` ; `listerAnnees` | Vercel (branche `main`) |
| Agent | interprète extrait ; résolveur central ; sélection d'outils (invite réduite de moitié) ; mémoire de session ; mémoire composée (si activée) ; enchaînements ; outils d'absence par élève et date ; notification d'un ensemble d'élèves ; garde-fous (« oui » orphelin, action inventée, valeurs non dites) ; supervision | Altare |

Aucune migration de base n'est nécessaire : les filtres et opérations ajoutés lisent des colonnes existantes. Les tables de la mémoire durable (`wa_*`, migrations 0037 et 0038) ne servent que si la mémoire durable est allumée.

## 2. Ordre obligatoire

1. **Le backend d'abord.** L'agent appelle `listerAbsences` avec un filtre `eleveId` que l'ancien backend ignore. L'agent refiltre lui-même par élève avant toute justification ou suppression (testé), mais une consultation « les absences de Mahamat » rendrait, sur l'ancien backend, celles de toute l'école.
2. **Puis l'agent**, avec sauvegarde du code en place (`node scripts/sauvegarde-code-altare.mjs`), comparaison par empreinte (`node scripts/comparer-altare.mjs --liste`), dépôt ciblé, redémarrage par `POST /diagnostic/redemarrer`, contrôle de `/sante`.

Le redémarrage d'Altare ne touche ni la session WhatsApp (sur le volume), ni les données. Il a pris de 30 secondes à 8 minutes selon les fois.

## 3. Variables

| Variable | Où | État | Effet |
|---|---|---|---|
| `AGENT_ECRITURES_ACTIVES` | Vercel | **absente** | toute écriture de l'agent est refusée par le backend. Les écritures n'ont été éprouvées que sur la base de test. Les allumer est une décision de la direction. |
| `AGENT_MEMORY_ENABLED` | Altare | `false` | le fil vit en mémoire vive et se perd au redémarrage. Pour l'allumer : voir `docs/AI_MEMORY_ARCHITECTURE.md`. |
| `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `MISTRAL_API_KEY` | Altare | posées | voir § 4 |
| `AGENT_BASE_URL`, `AGENT_SERVICE_TOKEN` | Vercel / Altare | posées, vérifiées le 11 novembre | — |

## 4. Le risque principal : le quota du modèle

Mesuré pendant les campagnes du 12 et 13 novembre, avec les clés de `ai_apikey.env` :

- **Groq** (`openai/gpt-oss-120b`, offre gratuite) : 8 000 jetons par minute, 1 000 requêtes et environ 200 000 jetons par jour. Avec l'ancienne invite (≈ 6 000 jetons), l'agent ne pouvait comprendre qu'**un message par minute, et une trentaine par jour**. Avec l'invite réduite (≈ 2 500 à 3 300 jetons) : environ deux messages par minute et soixante par jour.
- **OpenRouter** : le crédit gratuit de la clé est **épuisé** (HTTP 402) — consommé par les campagnes du banc.
- **Mistral** : en quota (HTTP 429) à chaque essai.

Si ces clés sont celles d'Altare, la production n'a aujourd'hui qu'un fournisseur, limité à quelques dizaines de messages par jour. Au-delà, l'agent répond « momentanément saturé, rien n'a été fait ». Trois issues possibles — toutes des décisions, aucune n'a été prise :

1. un crédit OpenRouter, ou le passage de Groq à une offre payante ;
2. un autre modèle Groq plus généreux en quota (`GROQ_MODEL`, sans changement de code) — à mesurer d'abord au banc, sa qualité de compréhension n'est pas connue ;
3. des clés distinctes pour le banc et pour la production, pour que les campagnes ne consomment plus le quota de la production.

## 5. Vérifications après déploiement

| Vérification | Comment |
|---|---|
| Le backend sert les nouvelles opérations | `POST /api/agent/nommerClasses` avec le jeton de service → 200 |
| L'agent tourne sur le nouveau code | `node scripts/comparer-altare.mjs` → tout « identique » |
| L'agent est vivant | `GET /sante` |
| La supervision répond | `GET /diagnostic/supervision` avec le jeton → 200 |
| Le parcours réel | après le scan du QR : `TEST AGENT`, puis une consultation sur WhatsApp |

## 6. Retour arrière

- **Backend** : redéployer le déploiement précédent depuis Vercel (`vercel rollback` ou l'interface), ou revenir sur `main` par un commit d'annulation. Jamais de `push --force`.
- **Agent** : redéposer le dossier produit par `sauvegarde-code-altare.mjs` avec `depot-cible.mjs`, puis redémarrer.

## 7. Ce qui n'est pas prouvé

- Le parcours WhatsApp réel avec le nouveau cerveau : WhatsApp est prêt, mais aucun message réel n'a été envoyé depuis le déploiement.
- Les écritures en production : éteintes.
- La mémoire durable en production : éteinte ; prouvée sur la base de test seulement.
- Une campagne complète du banc sur le code final : le quota du modèle ne le permet plus aujourd'hui (voir `docs/AI_TEST_CAMPAIGN_REPORT.md`).
