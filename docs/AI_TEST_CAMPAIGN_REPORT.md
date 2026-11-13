# Rapport des campagnes du banc d'essai

Toutes les campagnes ont été jouées contre le **vrai** agent (moteur, interprète, modèle de langage, résolveur, backend, base de TEST `br-calm-art-b18uihy2`), seul le transport WhatsApp étant remplacé. Mode d'emploi : `docs/AI_EVALUATION_FRAMEWORK.md`. Rapports bruts : `agent/banc/rapports/` (non versionnés : ils contiennent des données de la base de test).

## Les campagnes, et à quel code elles correspondent

| Campagne | Code | Catalogue | Joués | Réussis | Partiels | Échoués | Note |
|---|---|---|---|---|---|---|---|
| `0-reference` | `1a8e4d2` — avant la mission, sans mémoire ni résolveur | 132 | 132 | 73 | 33 | 21 | 5 non exécutés (aucun surveillant actif) |
| `1-resolveur-memoire` | résolveur + mémoire, première version | 132 | 73 | 69 | — | — | interrompue (coupure SQL de l'oracle) |
| `2-complet` | + corrections de description | 132 | 62 | 58 | — | — | interrompue (verrou de fichier Windows) |
| `3-complet` | `f576cdb` | **190** | 190 | 145 | 17 | 28 | 20 tours perdus : modèle saturé (non distingués à l'époque) |
| `5-rejeu` | cycle 4 (`25a2101`) | 190 | 45 (les non-réussis de `3`) | 37 | 7 | 1 | invite réduite : aucune saturation |
| `6` à `9` | cycles 5 et 6 | 190 | 2 à 8 (rejeux ciblés) | — | — | — | voir `docs/AI_FAILURE_ANALYSIS.md` |
| `10-final` | `2c0ae50` (code déployé) | 190 | 65 | 60 / 62 jugés | 0 | 2 | **arrêtée au 65e scénario : quota quotidien du modèle épuisé** ; 3 scénarios non jugés |

## La comparaison qui a un sens

Les périmètres diffèrent (132 puis 190 scénarios) et la campagne finale n'a pas pu aller au bout. La seule comparaison honnête porte sur **les mêmes scénarios** :

| Sur les 62 scénarios jugés par la campagne finale | Référence (`0`) | Cycle 3 (`3`) | Final (`10`) |
|---|---|---|---|
| Réussis | **42** | 60 | **60** |

Ces 62 scénarios couvrent les lectures : élèves, classes, parents, notes, assiduité, début des finances. Les conversations multi-tours, les écritures, la robustesse et les variantes n'ont **pas** été rejouées sur le code final. Leur dernière mesure complète est celle du cycle 3, complétée par les rejeux ciblés des cycles 4 à 6.

## Mesures

| Mesure | Cycle 3 (190 scénarios) | Final (62 jugés) |
|---|---|---|
| Compréhension (intention + outil) | 86,7 % (360/415) | 98,3 % (118/120) |
| Résolution des entités | 71,9 % (69/96) | 100 % (21/21) |
| Réponses exactes, contre l'oracle SQL | 91,0 % (325/357) | 100 % (115/115) |
| État réel conforme, relu en SQL | 88,6 % (39/44) | — (aucune écriture dans l'échantillon) |
| Clarifications inutiles | 21 tours | 0 |
| Paramètres techniques montrés | **0** / 251 tours | **0** / 62 |
| Fausses annonces de réussite | **0** | **0** |
| Latence par tour (p50 · p95) | 3,5 s · 11,5 s | 4,8 s · 17,0 s |
| Jetons par appel au modèle | 6 023 | **3 844** (−36 %) |

La latence a augmenté parce que la campagne finale n'avait plus qu'un fournisseur (Groq), souvent en attente de son quota par minute. Ce n'est pas un effet du code.

Les rejeux ciblés des cycles 4 à 6 ont fait passer **43 des 45** scénarios non réussis du cycle 3 à « réussi ». Les deux restants sont décrits plus bas.

## Ce qui est démontré

- **Résolution sans identifiant.** Aucune des 313 réponses observées depuis le cycle 3 ne montre un UUID ni un nom de paramètre, et aucune ne demande un identifiant.
- **Aucune fausse réussite.** Aucune action n'est annoncée sans avoir eu lieu, et toute écriture annoncée est relue en SQL. Le seul cas observé (cycle 3, « la mère a été ajoutée ») venait d'un « oui » laissé au modèle. Il est corrigé et couvert par un test.
- **Mémoire de conversation.**
  - Isolement et confirmations : 12 tests (`test/memoire-isolation.test.js`).
  - Reprise après redémarrage sur la vraie mémoire Neon, avec le vrai modèle : 12 constats sur 12 (`npm run agent:memoire`).
- **Écritures.** Les 17 scénarios d'écriture (inscription, modification, changement de classe, rattachement, responsabilités, notification, appel, retard, justification, suppression, détachement, transfert, archivage, exclusion, création de classe) sont relus en SQL. Au cycle 3 : 13 réussis. Les quatre autres ont été corrigés et rejoués aux cycles 4 à 6.
- **Droits.** Un surveillant ne lit pas les finances et ne peut ni exclure ni inscrire. Le statut de l'élève est vérifié en base après le refus.
- **Pannes.**
  - Une panne du backend, un résultat vide, une lenteur, une classe inconnue ou un référentiel indisponible sont dits tels quels, sans rien inventer.
  - Une écriture « acceptée » mais non relue est annoncée « non vérifiée » (scénario `ro-06`).

## Ce qui reste

| Scénario | Ce qui se passe | Statut |
|---|---|---|
| `el-08` « répartition des élèves par statut » | le modèle monte une mission au lieu d'appeler `eleves.statistiques` ; la réponse reste juste mais indirecte | défaut de compréhension mineur |
| `as-10` « le point de la vie scolaire aujourd'hui » | le modèle choisit les indicateurs de l'établissement plutôt que le tableau de bord de l'assiduité | défaut de compréhension mineur ; la réponse est réelle, pas inventée |
| `ec-15` | le modèle fabrique parfois une mission de deux écritures à partir de « elle a été créée pour un essai » | refusée par le moteur, qui l'explique ; rien n'est écrit |
| Variantes très télégraphiques | stabilité à confirmer sur une campagne complète | non rejouées sur le code final |
| Scénarios 66 à 190 | non rejoués sur le code final | **quota du modèle** |

## Pourquoi la campagne finale n'a pas pu aller au bout

Les quotas des fournisseurs de modèle, mesurés le 13 novembre :
- **Groq** : 8 000 jetons par minute, environ 200 000 par jour.
- **OpenRouter** : crédit gratuit épuisé (HTTP 402).
- **Mistral** : en quota (HTTP 429).

Une campagne complète coûte environ 215 appels, soit plus de 800 000 jetons même avec l'invite réduite. Elle ne tient plus dans une journée de quota. Pour la terminer :

```bash
cd agent && node banc/lancer.mjs --etiquette 10-final --reprendre
```

à relancer chaque jour : elle repart du 66e scénario. Il faut au préalable démarrer le backend de recette (voir `docs/AI_EVALUATION_FRAMEWORK.md`).
