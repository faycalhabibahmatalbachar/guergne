# Registre de finalisation — agent scolaire

**Lycée Guergné La Renaissance** · ouvert le 2026-11-11 · branche `voix-bidirectionnelle`

Registre VIVANT. Une ligne ne passe à un état que sur preuve, et la preuve est
citée. Un code qui existe n'est pas « terminé » ; un commit n'est pas un
déploiement ; un déploiement n'est pas une vérification en production.

États : NON AUDITÉ · AUDITÉ · EN COURS · IMPLÉMENTÉ · TESTÉ · VALIDÉ SUR TEST ·
DÉPLOYÉ · VALIDÉ EN PRODUCTION · BLOQUÉ

---

## 0. État des environnements au 2026-11-11

| Élément | État | Preuve |
|---|---|---|
| Branche de travail | `voix-bidirectionnelle` = `main` = `4265f0b` (2026-11-12) | `git ls-remote` : même hash pour les deux refs |
| Production web (Vercel) | **DÉPLOYÉE** : `3b6a003`, puis `b683cdd`, `3b7301a`, `4265f0b` | statut Vercel `success` pour chacun ; `/api/whatsapp/etat` passe de 404 à 401 ; nouvelles routes de l'agent en 401 sans jeton |
| Base servie par la production | **`br-red-waterfall-b1ajf6iu` — PROUVÉ** | appel réel du backend de production (jeton de service, lecture) : année `2026-2027` et trimestres 01/10–22/12/2026, données qui n'existent que sur cette branche (0040) |
| Base de test | `br-calm-art-b18uihy2` (année 2025-2026) | `web/.env.development.local` |
| Migration 0041 en production | **APPLIQUÉE** le 2026-11-11 | essai à blanc, puis application ; DIRECTION 36 → 75 droits, les 8 autres rôles identiques (diff des comptes avant/après) |
| Migrations en attente, prod ET test | 0033, 0037_notes_tracabilite, 0038, 0039 | `_migrations` relu sur les deux branches ; le code livré tourne sans elles (recettes vertes sur test) |
| Écritures de l'agent en production | **ÉTEINTES** | `inscrireEleve` sur la prod : `ECRITURES_DESACTIVEES` |
| Agent Altare | **DÉPLOYÉ ET EXÉCUTÉ** le 2026-11-12 | sauvegarde vérifiée du code précédent (139 fichiers) ; 42 fichiers déposés et relus par empreinte ; redémarrage par `/diagnostic/redemarrer` ; la voie d'appairage par jeton de service (absente de l'ancienne version) répond 200 ; processus stable depuis 12:09 UTC |
| WhatsApp | **EN ATTENTE DE SCAN** — appareil délié côté WhatsApp | `/sante` : `whatsapp: qr`, `attenteScanQr: true` ; profil LocalAuth intact (`session WhatsApp : 1 entrée`) |
| Accès Vercel (CLI) | **BLOQUÉ** — en attente de `npx vercel login` par le propriétaire | nécessaire pour poser `AGENT_BASE_URL` |

## 1. Lots

### LOT 1 — Reprise et état réel · VALIDÉ

Git à jour, les cinq commits de contrôle présents. `main` portait trois commits
absents de la branche (mémoire conversationnelle e61202c, recherche sans
accents d2479b1) : intégrés par `3b6a003`, sans réécriture d'historique.
Conflits résolus en gardant les deux apports ; la confirmation durcie n'a pas
été affaiblie (6 tests de jonction, `agent/test/memoire-confirmation.test.js`).

### LOT 2 — Altare et supervision WhatsApp · EN COURS

| Élément | État | Détail |
|---|---|---|
| Écran `/dashboard/parametres/whatsapp` | DÉPLOYÉ | routes `etat` et `qr` en production (401 sans session) |
| `AGENT_BASE_URL` dans Vercel | BLOQUÉ | accès Vercel requis |
| Code de l'agent sur Altare | DÉPLOYÉ ET EXÉCUTÉ | voir §0 ; retour arrière : `sauvegardes/altare-code-2026-11-11T20-21-19-297Z` via `depot-cible.mjs` |
| Rustines whatsapp-web.js au démarrage | DÉPLOYÉ | `index.js` les pose à chaque démarrage : `npm ci --ignore-scripts` les effaçait sans les rejouer |
| Scan réel | BLOQUÉ (téléphone) | choix du propriétaire : scanner depuis l'écran HTTPS |
| `.wwebjs_cache` distant | AUDITÉ — laissé en place | cache de versions HTML que la bibliothèque écrit elle-même ; les deux fichiers venus d'un poste local y sont de même nature, sans donnée de session |
| `sonde-espace.tmp` (20 Mo) | AUDITÉ — laissé en place | sonde d'espace d'une session précédente ; à retirer lors d'une intervention de maintenance |

### LOT 3 — Les huit opérations sans outil · VALIDÉ EN PRODUCTION (lecture)

Commit `2f92a76`. 46 outils (38 → 46), 46 opérations.

| Outil | Opération | Contrat modifié | Test | Recette test | Production |
|---|---|---|---|---|---|
| `parents.rechercher` | `rechercherTuteurs` | + `etat`, `classeId` | oui | 227 invités = Neon ; 46 parents de 1ère L = Neon | déployé |
| `parents.statistiques` | `statistiquesParents` | — | oui | 742 / 509 = Neon | **répond** (742 fiches) |
| `notes.releve` | `releveEleve` | relevé détaillé, `eleveId` + `periodeNumero` | oui | 10 matières, 30 notes = Neon ; moyenne 10,45 = bulletin | déployé |
| `pedagogie.calendrier_evaluations` | `calendrierEvaluations` | période résolue | oui | 406 = Neon | déployé |
| `finances.situations` | `listerSituationsFinancieres` | + `enRetard`, `boursier` | oui | 47 impayés, 3 706 000 FCFA = Neon | déployé |
| `referentiel.periodes` | `listerPeriodes` | — | oui | 3 = Neon | **répond** (T1 2026-10-01 → 2026-12-22) |
| `referentiel.classes_matieres` | `listerClassesEtMatieres` | — | oui | 15 classes, 13 matières = Neon | déployé |
| `referentiel.series` | `listerSeries` | — | oui | 6 = Neon | **répond** (6 séries) |

Refus vérifiés : un PARENT n'obtient ni la synthèse des comptes parents ni les
situations financières. Recette : `node agent/scripts/recette-scolarite-reel.mjs --base http://localhost:3100` (19/19).

### LOT 4 — Cartographie de l'entité Élève · EN COURS

Opération `ficheEleve` (backend, `web/src/server/domain/fiche-eleve.ts`) et
outil `eleves.fiche` (`agent/src/fiche-eleve.js`). Ils emploient les MÊMES
chargeurs que la page de référence `/dashboard/eleves/[id]`
(`chargerDossierComplet`, `chargerDossierScolarite`, période de
`chargerStatistiques`) et les MÊMES droits, section par section.

| Section | État | Source | Remarque |
|---|---|---|---|
| 1. Vue d'ensemble | VALIDÉ SUR TEST | fiche complète | âge calculé, dossier incomplet signalé champ par champ |
| 2. Identité | VALIDÉ SUR TEST | `eleves` | santé réservée à SUPER_ADMIN, DIRECTION, CENSEUR, SURVEILLANT (même liste que la page) |
| 3. Scolarité | VALIDÉ SUR TEST | inscription active + parcours | changement de classe : outil `eleves.changer_classe` existant |
| 4. Parents et tuteurs | VALIDÉ SUR TEST | `eleve_tuteur` | rôles distincts : principal, légal, financier, urgence, retrait ; 2 = Neon |
| 5. Documents | **AUDITÉ — à construire** | `pieces_dossier` | la table existe, **aucun service ne la lit ni ne l'écrit**, et elle n'a ni statut de vérification, ni vérificateur, ni motif de rejet. La fiche dit quelles pièces existent, jamais leur URL. Relève du LOT 8 |
| 6. Notes | VALIDÉ SUR TEST | relevé + évolution | relevé détaillé : `notes.releve` (LOT 3) |
| 7. Assiduité | VALIDÉ SUR TEST | absences, retards | |
| 8. Finances | VALIDÉ SUR TEST | échéances, paiements | facturé, payé, exonéré, reste distingués ; montants des paiements annulés exclus |
| 9. Historique | VALIDÉ SUR TEST | statuts, changements de classe, `journal_audit` | journal réservé à `audit:lire` |

Masquage par rôle : **non éprouvé sur données réelles**. La base de test n'a
que trois rôles actifs (SUPER_ADMIN, DIRECTION, PARENT) : les deux premiers
voient tout, le troisième est refusé à l'entrée. Le prouver exigerait un compte
factice, ce que les règles du projet excluent. Couvert par les tests unitaires
du rendu et par la lecture du code (`peut(acteur, …)` par section).

Recette : 23/23 (`recette-scolarite-reel.mjs`, section 9 bis).

### LOT 5 — Parents et responsabilités · VALIDÉ SUR TEST

| Capacité | Opération / outil | État | Preuve |
|---|---|---|---|
| Rattacher un parent (nouveau ou existant) | `rattacherTuteur` / `parents.rattacher` | VALIDÉ SUR TEST | recette 24/24 |
| Réutiliser la fiche d'un parent déjà connu | action web corrigée | VALIDÉ SUR TEST | numéro écrit autrement → toujours 1 fiche, 2 enfants |
| Refuser un double rattachement | action web corrigée | VALIDÉ SUR TEST | « Ce parent est déjà rattaché à cet élève » |
| Changer lien et responsabilités | `modifierResponsabilitesTuteur` (NOUVELLE action) / `parents.responsabilites` | VALIDÉ SUR TEST | un seul principal relu ; audit avant/après |
| Transfert du responsable principal | idem | VALIDÉ SUR TEST | retirer le titre sans successeur : refusé |
| Retirer un responsable | `detacherTuteur` / `parents.detacher` | VALIDÉ SUR TEST | fiche conservée ; dernier responsable : refusé |
| Lister, filtrer par état de compte | `parents.rechercher` (LOT 3) | VALIDÉ EN PRODUCTION (lecture) | |
| Invitations, codes, révocation | `inviterTuteur`, `renvoyerCode`, `revoquerAcces` existent | AUDITÉ — non exposés | impliquent un envoi de SMS : à brancher avec le LOT 6 (consentement, devis) |

Défauts corrigés dans l'action web (donc aussi pour l'écran) :
`existantId` était accepté puis ignoré ; le parent n'était retrouvé que sur un
téléphone écrit à l'identique ; un double rattachement finissait en erreur
générique.

### LOT 6 — Notifications aux parents · VALIDÉ SUR TEST

Opérations `devisNotificationParents` (lecture) et `envoyerNotificationParents`
(écriture), qui appellent TELLES QUELLES les actions de l'écran « Notifier un
groupe » ; outil `notifications.parents`.

| Exigence | État | Preuve (recette réelle, base de test) |
|---|---|---|
| Cibler exactement (« uniquement le père de… », « les deux responsables », « parents de 4e B non activés ») | VALIDÉ SUR TEST | sélection d'UN identifiant pour « le père » |
| Devis avant le oui : joignables, canaux, coût SMS | VALIDÉ SUR TEST | 1 SMS, 50 FCFA |
| Consentement SMS respecté | VALIDÉ SUR TEST | sans `accepte_sms` : « aucun parent joignable », rien proposé |
| Audience et coût figés entre devis et envoi | IMPLÉMENTÉ | empreinte + plafonds transmis ; refus côté action web |
| Idempotence | VALIDÉ SUR TEST | même clé d'envoi : aucun doublon |
| « En file », jamais « délivré » | VALIDÉ SUR TEST | compte rendu de `verifier` |
| Envoi réel de SMS | **NON FAIT, volontairement** | passerelle SMS neutralisée pendant la recette ; aucune famille contactée |
| Suivi de livraison (envoyé / délivré / échoué) | AUDITÉ — à exposer | colonnes `statut`, `envoye_le`, `erreur` de `notifications` |

Recette : `recette-parents-reel.mjs`, 30/30 (sections 1 à 7).

### LOT 7 — Situation scolaire · VALIDÉ SUR TEST

Opération `changerStatutEleve` → action `changerStatut` de l'écran (historique
des statuts, clôture de l'inscription pour un départ, audit, notifications).
Outil `eleves.changer_statut`.

| Exigence | État | Preuve (recette 41/41) |
|---|---|---|
| Transfert : établissement d'accueil exigé, inscription close, destination enregistrée | VALIDÉ SUR TEST | statut TRANSFERE, 0 inscription active, destination relue, audit `eleve.transfere` |
| Certificat de transfert | EXISTANT | lien `/api/documents/certificat-transfert/{eleveId}` donné après vérification (droit `document:emettre`) |
| Abandon | IMPLÉMENTÉ | même parcours que le transfert |
| Exclusion définitive : décision de l'autorité compétente exigée | VALIDÉ SUR TEST | sans référence : non préparée ; la référence entre dans le motif historisé |
| Aucune décision sur un élève parti | VALIDÉ SUR TEST | refus par l'agent ET par l'API |
| Statuts hors liste (DIPLOME…) | VALIDÉ SUR TEST | refus de la route |
| Droit réel par statut | IMPLÉMENTÉ | exigé par l'action (`eleve:exclure`, `eleve:transferer`, `eleve:suspendre`, `eleve:reactiver`) |

Défaut trouvé par la recette : la fiche présentait la DERNIÈRE inscription
sans dire qu'elle était close — un élève transféré se lisait « inscrit en
3e A ». La fiche porte désormais `active`, la date, le motif et la destination
de sortie, et l'affiche.

### LOTS 8 et 9 · NON COMMENCÉS

Documents (à construire : `pieces_dossier` n'a ni service ni statut de
vérification), notes et finances en écriture ; intelligence conversationnelle.

## 2. Tests

| Suite | Résultat | Date |
|---|---|---|
| agent (`npm test`) | 837 / 837 | 2026-11-11 |
| web (`npm test`) | 241 / 241 | 2026-11-11 |
| web `tsc --noEmit` | aucune erreur | 2026-11-11 |
| recette réelle des 8 outils (base de test) | 19 / 19 | 2026-11-11 |
| lecture réelle sur la production (3 outils + refus d'écriture) | conforme | 2026-11-11 |

## 3. Retour arrière

| Changement | Retour arrière |
|---|---|
| Web en production | Vercel → Deployments → *Promote* du déploiement de `e61202c` |
| 0041 | `db/rollback/0041_direction_permissions_metier.sql` (jamais exécuté ; ses 36 droits d'origine vérifiés contre la base) |
| Agent Altare | dossier de sauvegarde produit par `sauvegarde-code-altare.mjs`, redéposé par `depot-cible.mjs` |
