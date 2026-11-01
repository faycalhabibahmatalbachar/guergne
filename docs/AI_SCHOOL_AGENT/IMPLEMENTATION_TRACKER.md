# Suivi d'implémentation — Agent IA

Fichier de pilotage. Il guide l'exécution ; il ne la remplace pas.

**États** : 1 IDENTIFIÉ · 2 À IMPLÉMENTER · 3 EN COURS · 4 IMPLÉMENTÉ ·
5 TESTÉ LOCALEMENT · 6 TESTÉ EN INTÉGRATION · 7 TESTÉ CONTRE BACKEND ·
8 VALIDÉ SUR ALTARE · 9 VALIDÉ SUR WHATSAPP · 10 VALIDÉ EN PRODUCTION ·
11 BLOQUÉ PAR UNE DÉPENDANCE EXTERNE PRÉCISE.

Une fonctionnalité ne passe pas à un état sans la preuve de ce niveau.

---

## Socle

| ID | Fonctionnalité | Fichiers | Tests | État | Preuve |
|---|---|---|---|---|---|
| S-01 | Verrou d'instance (PID recyclé, horloge) | `src/verrou.js` | 25 | **8** | `decision=perime-reutilise` dans les logs Altare |
| S-02 | Moteur IA 4 fournisseurs + repli | `src/ia.js` | 51 | **8** | PONG réel Groq/OpenRouter, bascule sur 401 |
| S-03 | Résolution JID et LID | `src/jid.js` | 18 | **9** | `TEST AGENT` répondu depuis WhatsApp |
| S-04 | Délais maximaux, jamais de silence | `src/delai.js` | 16 | **9** | réponse reçue après la correction |
| S-05 | Contrat d'intention (conversation/outil/mission/clarifier) | `src/plan.js` | 14 | **9** | « Salut » → réponse naturelle |
| S-06 | Identités par l'annuaire du personnel | `src/resolution-comptes.js` | 24 | **9** | `decision=ALLOW role=SUPER_ADMIN` |
| S-07 | Politiques d'exécution permanentes | `src/politiques.js` | 22 | **7** | écritures automatiques sur branche de test |
| S-08 | Missions multi-étapes | `src/mission.js` | 20 | **7** | 4 étapes, 294 h, classes citées |
| S-09 | Rechargement à chaud des identités | `src/identity-store.js` | 16 | **8** | provisionnement sans redémarrage |

## Modules scolaires — outils IA

| ID | Module | Outil | Opération backend | Tests | État |
|---|---|---|---|---|---|
| M-01 | Assiduité | `consulter_absences`, `alertes`, `consulter_retards`, `tableau_de_bord`, `conduite_classe` | `listerAbsences`, `listerAlertes`, `listerRetards`, `statistiquesVieScolaire`, `chargerConduiteClasse` | structurels + e2e | **7** |
| M-02 | Discipline | `consulter_incidents`, `consulter_sanctions` | `listerIncidents`, `listerSanctions` | structurels + e2e | **7** |
| M-03 | Assiduité (écritures) | `enregistrer_appel`, `enregistrer_retard`, `justifier_absences`, `supprimer_absence` | idem, **éteintes par défaut** | e2e écriture | **7** |
| M-04 | Pilotage | `indicateurs`, `effectifs_par_niveau`, `absences_par_mois`, `moyennes_par_classe`, `classement_classes`, `resultats_par_matiere` | `pilotage.ts` | structurels + e2e | **7** |
| M-05 | Élèves | `eleves.rechercher`, `eleves.statistiques` | `listerEleves`, `statistiquesEleves` | structurels + e2e | **7** |
| M-06 | Parents | `parents.tuteurs_de_l_eleve` | `tuteursDeLEleve` | structurels + e2e | **7** |
| M-07 | Personnel | `personnel.enseignants` | `listerEnseignants` | structurels + e2e | **7** |
| M-08 | Pédagogie | `pedagogie.evaluations` | `listerEvaluations` | structurels + e2e | **7** |
| M-09 | Finances | `finances.statistiques`, `finances.recouvrement_par_classe` | `statistiquesFinancieres`, `recouvrementParClasse` | structurels + e2e | **7** |
| M-10 | Établissement | `etablissement.statistiques` | `chargerStatistiques` | structurels + e2e | **7** |

**Preuve M-01 à M-10** : `node agent/scripts/e2e-catalogue.mjs` → **21/21 outils
de lecture servis par l'API réelle et rendus lisiblement**, sur la branche Neon
de test. Chiffres obtenus : 548 élèves, 15 classes, 15 enseignants,
106 380 000 FCFA attendus.

## Backend

| ID | Besoin | Fichiers | Tests | État |
|---|---|---|---|---|
| B-01 | Séparation lecture / écriture du catalogue | `web/src/server/agent/operations.ts`, `porte.ts` | 6 | **7** |
| B-02 | Écritures éteintes par défaut | `porte.ts` | 6 | **7** |
| B-03 | 21 opérations de lecture exposées | `operations.ts` | structurels + e2e | **7** |
| B-04 | Connexion en production | — | — | **11** — voir blocage ci-dessous |

## Observabilité, notifications, fiabilité

| ID | Besoin | Fichiers | État |
|---|---|---|---|
| O-01 | `runId` corrélé du transport à la réponse | `providers/wwebjs.js`, `engine.js` | **9** |
| O-02 | Raisons de refus explicites | `jid.js`, `engine.js` | **9** |
| O-03 | Empreintes salées, aucun numéro en clair | `jid.js`, `identity-store.js` | **9** |
| O-04 | Indicateurs d'autonomie sur `/sante` | `engine.js`, `app.js` | **8** |
| N-01 | Notifications aux deux responsables | `engine.js` | **7** |
| R-01 | Reprise des lectures, jamais des écritures incertaines | `mission.js` | **7** |
| R-02 | Revendication relâchée avant action métier | `engine.js`, `persistance.js` | **5** |

---

## Reste à faire

| ID | Besoin | Pourquoi ce n'est pas fait | État |
|---|---|---|---|
| T-01 | Génération de fichiers PDF / XLSX | à implémenter ; les rapports sont aujourd'hui du texte WhatsApp | **2** |
| T-02 | Écritures dans les missions | le conducteur n'accepte que des consultations, par choix de sûreté ; à ouvrir sous politique | **2** |
| T-03 | File de notifications avec reprise et déduplication | l'envoi est direct, sans file | **2** |
| T-04 | Mesure de couverture chiffrée | `node --experimental-test-coverage` à câbler et consigner | **2** |
| T-05 | Outils d'écriture hors assiduité (élèves, notes) | aucune opération backend exposée pour l'instant ; exige B-04 | **1** |

---

## Blocage externe unique

**B-04 — l'API agent n'est pas en production.**

`POST https://lycee-guergne-renaissance.vercel.app/api/agent/listerAlertes`
répond **404** : la route n'existe que sur `ai-school-agent-p0-audit`.
`/api/sante` répond 405, ce qui prouve que le déploiement est en ligne — c'est
bien la route qui manque, pas le site.

**Ce qui a été fait pour lever ce blocage sans risque :** le catalogue est
désormais scindé par risque, et les écritures sont **éteintes par défaut**
(`AGENT_ECRITURES_ACTIVES` absent ⇒ 403 `ECRITURES_DESACTIVEES`). Fusionner la
branche met donc en ligne **les consultations seules**. Les écritures restent
dans le dépôt, testées, et s'ouvrent par une variable d'environnement — un
retour arrière est un changement de configuration, pas un déploiement.

**Action externe restante :** fusionner la PR, puis poser `SCHOOL_API_BASE_URL`
et `AGENT_SERVICE_TOKEN` sur Vercel. Vérifier avant de renseigner l'URL qu'elle
répond **401** (route présente, jeton exigé) et non 404 ni 503.
