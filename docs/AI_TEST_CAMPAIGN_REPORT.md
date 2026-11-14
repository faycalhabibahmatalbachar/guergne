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

## Campagne finale terminée — 14 novembre 2026 (Gemini ajouté)

La campagne `10-final` a été reprise le 14 novembre avec `--reprendre`. Les 62 scénarios déjà jugés le 13 sont conservés. Les 3 que le quota avait empêché de lire (fi-06, fi-07, fi-08) ont été rejoués, ainsi que les 125 restants. **Les 190 scénarios sont joués.**

| | Scénarios |
|---|---|
| Réussis (campagne `10-final`) | 184 / 190 |
| Partiels | 4 |
| Échoués | 2 |
| Restant à exécuter | **0** |
| Après rejeu des 6 non-réussis sur le code corrigé (`10-final-rejeu`) | **187 réussis, 2 partiels, 1 échoué** |

Mesures de `10-final` (251 tours) : compréhension 99,1 %, résolution des entités 97,9 %, réponses exactes contre l'oracle SQL 99,7 %, état réel conforme 93,3 %, workflows multi-outils 4/4, clarifications inutiles 3 tours sur 222, **paramètres techniques montrés : 0**, latence p50 3,6 s et p95 9,7 s.

**Une fausse annonce de réussite détectée, puis corrigée.** Dans ec-14, la question intercalée « combien d'élèves en Banc Zeta ? » faisait bien tomber la confirmation d'archivage. Mais le modèle, relisant l'historique, **reproposait l'archivage à l'identique**, et le « oui » suivant l'exécutait. Corrections :
- le moteur refuse de resoumettre une écriture que ce même message vient d'abandonner (même outil, même empreinte) ;
- le modèle est prévenu que l'opération est abandonnée.

Le rejeu sur le code corrigé réussit, et un test de régression a été ajouté (`test/memoire-isolation.test.js`).

**Ce qui reste après rejeu :**

| Scénario | Ce qui se passe | Gravité |
|---|---|---|
| el-08 « répartition des élèves par statut » | mission de recherches par statut au lieu de `eleves.statistiques` ; les chiffres donnés sont réels | mineure |
| ec-15 (dernier tour) « archive la classe Banc Gamma, elle a été créée pour un essai » | le modèle demande une précision au lieu d'archiver ; rien n'est écrit | mineure, sans risque |
| va-sans-indirect « quels responsables n'ont jamais été inscrits sur l'appli ? » | compris comme « invités jamais connectés » (227) au lieu de « sans compte » (511) ; la formulation est ambiguë | interprétation |

### Fournisseurs du modèle (14 novembre, appels réels)

| Fournisseur | Modèle | Appels | Réussis | Échecs | Cause des échecs |
|---|---|---|---|---|---|
| Groq | openai/gpt-oss-120b | 88 | 40 | 48 | quota de 8 000 jetons par minute (HTTP 429, refroidissement de quelques secondes) |
| Gemini | gemini-3.5-flash | 43 | 21 | 22 | 429 et 503 « forte demande » chez Google |
| Gemini | gemini-3.5-flash-lite | 113 | 100 | 13 | 429 ponctuels |
| OpenRouter | openai/gpt-oss-120b | 1 | 0 | 1 | HTTP 402 : aucun crédit sur le compte |
| Mistral | mistral-small-latest | 13 | 0 | 13 | HTTP 429 permanent |

Sur la reprise, seuls **5 refroidissements** ont été nécessaires et **1 tour** a été perdu (cv-05, rejoué ensuite avec succès). Aucun achat, aucun crédit, aucun abonnement.

**Modèles Gemini éprouvés** (clé de `ai_apikey.env`, 38 modèles listés), sur trois demandes réelles de l'agent :
- gemini-3.5-flash-lite : 3/3, ~1,0 s ;
- gemini-flash-lite-latest : 3/3, ~1,1 s ;
- gemini-3-flash-preview : 3/3, ~2,1 s ;
- gemini-3.5-flash : 3/3, ~2,6 s ;
- gemini-3.1-flash-lite : 3/3, ~8,6 s ;
- gemini-3.8-flash : saturé (503, délais) ;
- gemini 2.0 et 2.5 : fermés aux nouveaux comptes (404).

**Défaut d'intégration trouvé et corrigé.** L'interface compatible OpenAI de Gemini ne garde qu'**un seul** message système. Le registre des outils, le fil de la conversation et les dates étaient ignorés en silence : 59 jetons lus au lieu de 3 000, et des réponses inventées. Le moteur fusionne désormais les messages système pour Gemini (`systemeUnique`, testé).

**Comparabilité.** Les 62 premiers scénarios ont été mesurés le 13 novembre (Groq et OpenRouter, code `2c0ae50`). Les 128 suivants l'ont été le 14 (Groq et Gemini, même code plus l'intégration Gemini). Les 6 rejeux l'ont été sur le code incluant le garde-fou d'ec-14. Le modèle qui répond change d'un tour à l'autre selon les quotas : c'est le comportement de la production, que la campagne mesure tel quel.

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
