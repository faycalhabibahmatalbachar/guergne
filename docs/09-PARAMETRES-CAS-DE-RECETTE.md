# Centre Paramètres — Spécification et cas de recette

**Produit :** Lycée Guergné La Renaissance (LGR), établissement unique, 6e à Terminale.  
**Source de vérité :** modules existants dans `web/src/app/(main)/dashboard`, table singleton `etablissement`, référentiels et permissions PostgreSQL.  
**Portée :** administration du lycée, pas une plateforme multi-écoles.  
**Convention :** [EN PLACE] = code repéré dans le dépôt ; [ÉTAPE SUIVANTE] = réalisation à planifier ; [À ÉPROUVER] = code présent, mais validation métier/recette complémentaire requise.  
**P0** = sécurité et cohérence ; **P1** = opérations scolaires essentielles ; **P2** = confort et pilotage. Les cas marqués « à réaliser » ne sont pas implémentés par ce document.

## Principes transversaux non négociables

- L'écran Paramètres n'exécute pas les opérations métier courantes : inscrire un élève reste dans Élèves, encaisser dans Finances, envoyer une annonce dans Communication.
- Ne pas mélanger `parametre:modifier`, `notification:configurer`, `finance:configurer`, `audit:lire`. Contrôle des droits sur chaque *lecture* et sur chaque *écriture*.
- Un seul établissement `id=true`. Ni sélecteur d'établissement, ni création d'annexe fictive, ni choix public/privé.
- Les montants sont en FCFA sans centimes ; les notes se calculent sur 20 avec coefficients par niveau/série.
- Toute mutation sensible doit valider le serveur, journaliser avant/après, ne pas divulguer les secrets ni les codes d'invitation.
- Déterminer explicitement la portée et l'année scolaire ; aucune propagation silencieuse aux années clôturées.
- Si un canal de communication échoue, l'affichage ne doit jamais déclarer « délivré » sans accusé.
- Les données déjà publiées (bulletins, reçus, sanctions signifiées) restent traçables même si les réglages changent.
- Aucune action à coût SMS non estimé ou non autorisé ; respect du consentement par destinataire.

## A. Identité et documents institutionnels (P0–P1)

| ID | Cas et résultat attendu | Priorité |
|---|---|---|
| PAR-001 | Ouvrir la fiche unique et lire nom, sigle, devise sans sélection d'école | P0 |
| PAR-002 | Modifier adresse, ville, pays, téléphone, e-mail et site HTTPS, puis relire les valeurs enregistrées | P0 |
| PAR-003 | Modifier tutelle administrative, référence d'autorisation, proviseur et censeur | P0 |
| PAR-004 | Rejeter e-mail erroné, URL HTTP, URL avec identifiants, téléphone malformé et valeurs excessives | P0 |
| PAR-005 | Rejeter un champ inconnu tentant de changer nom légal, sigle ou devise par API | P0 |
| PAR-006 | Refuser lecture/écriture à un rôle sans `parametre:modifier` ; aucune fuite de données via réponse d'erreur | P0 |
| PAR-007 | Préserver des versions vérifiables des bulletins déjà remis ; vérifier qu'une réexportation PDF n'altère pas silencieusement la version historique | P0 |
| PAR-008 | Comparer avant/après dans le journal d'audit ; éviter les données techniques en cas d'échec | P0 |
| PAR-009 | Télécharger/imprimer un aperçu A4 du papier à en-tête utilisant les vraies données | P1 |
| PAR-010 | Déposer/remplacer logo et cachet par flux privé, valider taille/MIME, prévisualiser et révoquer | P1 |
| PAR-011 | Définir signataire délégué pour une période avec auteur, motif et date de fin ; ne pas falsifier l'historique | P1 |
| PAR-012 | Bloquer la publication d'un document officiel si l'identité minimale ou la signature requise manque | P1 |

## B. Année scolaire, périodes et clôture (P0)

| ID | Cas et résultat attendu | Priorité |
|---|---|---|
| PAR-013 | Créer l'année 2026-2027 avec dates cohérentes et périodes créées automatiquement | P0 |
| PAR-014 | Rejeter une année inversée, doublonnée ou avec deux années « courantes » | P0 |
| PAR-015 | Ajuster le calendrier de chaque trimestre sans dates contradictoires ni chevauchement | P0 |
| PAR-016 | Verrouiller la saisie d'une période et constater que la modification de notes est réellement bloquée | P0 |
| PAR-017 | Autoriser déverrouillage seulement au rôle habilité, avec motif et audit | P0 |
| PAR-018 | Exiger confirmation et motif avant clôture ; refuser de clôturer l'année courante | P0 |
| PAR-019 | Après clôture, bloquer les modifications de notes et de barèmes de l'année | P0 |
| PAR-020 | Créer l'année suivante sans modifier les inscriptions et bulletins historiques | P0 |
| PAR-021 | Copier coefficients/classes sélectionnés avec prévisualisation des doublons et résolution explicite | P1 |
| PAR-022 | Vérifier « avant clôture » : bulletins non publiés, évaluations incomplètes, encaissements non rapprochés | P1 |

## C. Matières, séries, coefficients et barèmes (P0–P1)

| ID | Cas et résultat attendu | Priorité |
|---|---|---|
| PAR-023 | Créer/éditer/désactiver une matière sans altérer son historique dans les bulletins | P0 |
| PAR-024 | Créer et renommer une série tout en conservant son code référencé par les classes | P0 |
| PAR-025 | Empêcher la désactivation d'une série utilisée par une classe en activité | P0 |
| PAR-026 | Associer coefficient, volume horaire et poids interro/devoir/composition par niveau/série/année | P0 |
| PAR-027 | Refuser valeurs négatives, nulles interdites, poids excessifs et édition d'année clôturée | P0 |
| PAR-028 | Vérifier qu'un changement de coefficient ne réécrit pas rétroactivement un bulletin figé | P0 |
| PAR-029 | Présenter l'impact du changement sur les moyennes avant confirmation | P1 |
| PAR-030 | Repérer matière obligatoire sans coefficient et coefficient affecté à une matière inactive | P1 |
| PAR-031 | Copier les coefficients d'une autre année, montrer ajouts/remplacements et demander confirmation | P1 |

## D. Classes, capacité, affectation et horaires (P0–P1)

| ID | Cas et résultat attendu | Priorité |
|---|---|---|
| PAR-032 | Créer une classe pour l'année courante, niveau et série compatibles | P0 |
| PAR-033 | Interdire réduction de capacité sous l'effectif actuel et suppression de classe avec élèves | P0 |
| PAR-034 | Eviter double interface concurrente : Paramètres règle la structure, Classes pilote les élèves | P0 |
| PAR-035 | Associer professeur principal et salle, détecter les conflits de responsabilité et capacité | P1 |
| PAR-036 | Configurer créneaux, pauses et jours de cours ; refuser chevauchements et heures inversées | P1 |
| PAR-037 | Mettre à jour emploi du temps uniquement après vérification enseignants/salles disponibles | P1 |
| PAR-038 | Afficher les changements d'horaires aux parents sans générer de SMS implicite | P1 |

## E. Parents, familles et accès (P0–P1)

| ID | Cas et résultat attendu | Priorité |
|---|---|---|
| PAR-039 | Changer la validité des nouveaux codes de 1 à 30 jours, sans modifier les codes déjà émis | P0 |
| PAR-040 | Générer un nouveau code cryptographiquement aléatoire, stocker uniquement son empreinte, invalider l'ancien | P0 |
| PAR-041 | Vérifier expiration, utilisation unique, mauvais code et tentative de réemploi | P0 |
| PAR-042 | Refuser la réattribution d'un téléphone à une autre famille sans contrôle des doublons | P0 |
| PAR-043 | Distinguer responsable principal, financier, autorisé au retrait, sans fusion abusive | P0 |
| PAR-044 | Révoquer l'accès d'un parent sans retirer la filiation ni effacer l'historique scolaire | P0 |
| PAR-045 | Envoyer une invitation individuelle avec consentement et coût communiqué au guichet | P0 |
| PAR-046 | Prévisualiser les invitations de classe et confirmer destinataires/coût ; aucune relance involontaire | P0 |
| PAR-047 | Suivre statuts en attente/envoyé/échoué/lu (si supporté), ne pas exposer le corps contenant un code | P0 |
| PAR-048 | Fusionner deux fiches en doublon seulement après examen des enfants, téléphones et accès existants | P1 |
| PAR-049 | Définir canal préféré du responsable dans le respect des consentements et des urgences justifiées | P1 |
| PAR-050 | Valider une demande de changement de téléphone avec preuve, révoquer les accès obsolètes | P1 |

## F. Notifications, SMS et communication (P0–P1)

| ID | Cas et résultat attendu | Priorité |
|---|---|---|
| PAR-051 | Choisir pour chaque événement : app sinon SMS, app + SMS, app, SMS, désactivé | P0 |
| PAR-052 | Recalculer destinataires joignables, consentants, SMS prévus et coût **avant** confirmation | P0 |
| PAR-053 | Refuser la politique SMS si crédit/budget plafond épuisé ; afficher l'alternative gratuite | P0 |
| PAR-054 | Définir une enveloppe mensuelle FCFA et une limite de sécurité par opération | P0 |
| PAR-055 | Classer les événements urgents (sanction, convocation) sans contourner consentement et droit d'envoi | P0 |
| PAR-056 | Configurer heures de silence et exceptions urgentes documentées | P1 |
| PAR-057 | Dédupliquer un événement, bloquer les doubles clics et garantir les reprises sans double facturation | P0 |
| PAR-058 | Distinguer émis/accepté fournisseur/livré/échoué/lu si accusés disponibles | P0 |
| PAR-059 | Gérer retentatives bornées et journal de remise ; aucun statut « reçu » inventé | P0 |
| PAR-060 | Envoyer à un parent, une sélection, une classe ou toute l'école via le module Communication, pas Paramètres | P1 |
| PAR-061 | Tester un canal avec un destinataire autorisé en affichant le coût exact et sans utiliser de données élèves | P1 |
| PAR-062 | Configurer modèles de message avec variables autorisées et prévisualisation anti-fuite | P1 |

## G. Notes, bulletins, conseils et publication (P0–P1)

| ID | Cas et résultat attendu | Priorité |
|---|---|---|
| PAR-063 | Conserver le barème sur 20 et les formules identiques entre Notes, Bulletins et PDF | P0 |
| PAR-064 | Corriger une note avant verrouillage en conservant auteur, ancienne et nouvelle valeur | P0 |
| PAR-065 | Rejeter correction après clôture sans déverrouillage autorisé et journalisé | P0 |
| PAR-066 | Empêcher la publication d'un bulletin si les notes attendues sont manquantes | P0 |
| PAR-067 | Distinguer génération, validation, publication et notification aux familles | P0 |
| PAR-068 | Gérer arrêt ou reprise de publication par période sans rendre invisibles les bulletins déjà publiés | P0 |
| PAR-069 | Activer ou désactiver la retenue pour impayé en réutilisant **la règle unique** du backend | P0 |
| PAR-070 | Choisir seuil FCFA ; montrer les élèves concernés avant publication | P0 |
| PAR-071 | Lever la retenue d'un élève par un acteur habilité, avec motif, sans annuler la dette | P0 |
| PAR-072 | En cas de paiement régularisé, actualiser l'éligibilité de publication | P0 |
| PAR-073 | Permettre réédition contrôlée d'un bulletin figé : version, motif, approbation, traçabilité | P1 |
| PAR-074 | Garantir cohérence entre rangs, ex æquo, appréciations, orientation et PDF | P1 |

## H. Finance, caisse et recouvrement (P0–P1)

| ID | Cas et résultat attendu | Priorité |
|---|---|---|
| PAR-075 | Tarifs par niveau et année, tranches/échéanciers, pas de rétroactivité silencieuse | P0 |
| PAR-076 | Refuser tranches dont la somme ne correspond pas au total attendu | P0 |
| PAR-077 | Calculer échéances avec paiement partiel, exonération, solde, retards et pénalités explicitement admises | P0 |
| PAR-078 | Interdire un encaissement négatif ou excédant des limites incohérentes sans règle définie | P0 |
| PAR-079 | Numéroter les reçus de façon unique et rendre les annulations traçables, sans suppression du reçu originel | P0 |
| PAR-080 | Maintenir le journal de caisse espèces séparé des virements/mobile money | P0 |
| PAR-081 | Vérifier une exonération par droit spécifique et audit, sans fuite à un enseignant | P0 |
| PAR-082 | Configurer relance avant/après échéance selon politique SMS et consentement | P1 |
| PAR-083 | Tester changement de tarif et de règle de bulletin sur deux années scolaires indépendantes | P1 |

## I. Assiduité et discipline (P0–P1)

| ID | Cas et résultat attendu | Priorité |
|---|---|---|
| PAR-084 | Définir seuil d'absence/retard par événement sans notifications intempestives | P1 |
| PAR-085 | Distinguer absence justifiée/non justifiée/retard pour compter correctement les alertes | P0 |
| PAR-086 | Justifier plusieurs jours sans effacer les appels historiques | P0 |
| PAR-087 | Définir les catégories d'incidents et seuil de gravité minimal notifié | P0 |
| PAR-088 | Restreindre la lecture des incidents sensibles, sanctions et justificatifs selon rôle | P0 |
| PAR-089 | Conserver motif et circuit d'approbation lors d'une sanction grave | P0 |
| PAR-090 | Garantir que les parents ne voient que les incidents de leurs propres enfants | P0 |

## J. Utilisateurs, habilitations, sessions et sécurité (P0)

| ID | Cas et résultat attendu | Priorité |
|---|---|---|
| PAR-091 | Présenter matrice des droits pour Superadmin, Direction, Censeur, Surveillant, Secrétariat, Comptable, Enseignant et Parent | P0 |
| PAR-092 | Refuser une route et une action côté serveur si l'action requise manque, même quand l'URL est saisie à la main | P0 |
| PAR-093 | Distinguer accès général, propres classes et propres enfants pour chaque dossier | P0 |
| PAR-094 | Modifier une permission en invalidant le cache serveur immédiatement sur tous les processus concernés | P0 |
| PAR-095 | Exiger contrôle renforcé pour accorder `permission:gerer` ou `systeme:administrer` | P0 |
| PAR-096 | Désactiver le compte d'un agent en révoquant immédiatement ses sessions | P0 |
| PAR-097 | Examiner les connexions récentes, changements de mot de passe et échecs répétés sans afficher les secrets | P1 |
| PAR-098 | Journal d'audit : filtres, historique paginé, aucune modification/suppression des entrées | P0 |
| PAR-099 | Exporter un périmètre limité du journal avec permissions, masquage des coordonnées et durée de conservation | P1 |

## K. Données, sauvegardes et continuité (P0–P2)

| ID | Cas et résultat attendu | Priorité |
|---|---|---|
| PAR-100 | Vérifier migration de la base, santé des dépendances et version active sans exposer les clés privées | P0 |
| PAR-101 | Produire une sauvegarde chiffrée avec droit dédié, contrôle de complétude et journal d'exécution | P1 |
| PAR-102 | Tester la restauration en environnement isolé avant de modifier la production | P1 |
| PAR-103 | Définir politiques de rétention : dossiers élèves, journaux, SMS, justificatifs et documents officiels | P1 |
| PAR-104 | Proposer import/export validé avec prévisualisation, erreurs de ligne, reprise et déduplication | P1 |
| PAR-105 | Contrôler disponibilité de l'application parents et file des notifications sans exposer les codes | P1 |
| PAR-106 | Configurer fuseau Afrique/Ndjamena et formats de dates selon une source unique | P1 |
| PAR-107 | Vérifier chaque modification sensible au travers de tests d'intégration avec une base isolée | P0 |
| PAR-108 | Test E2E smartphone/tablette/ordinateur, clavier, lecteur d'écran, statut vide/erreur et perte de connexion | P1 |

## Matrice cible des responsabilités

| Réglage | Superadmin | Direction | Censeur | Secrétariat | Comptable |
|---|---|---|---|---|---|
| Identité institutionnelle et contacts | Modifier | Proposer/valider selon politique | Lire | Lire | Lire |
| Années et périodes | Configurer | Valider | Administrer la pédagogie | Lire | Lire |
| Matières, séries, coefficients | Administrer | Valider | Administrer | Lire | — |
| Invitation parents / anti-doublon | Configurer | Valider les cas sensibles | Lire | Inviter selon droit | — |
| Notification et budget SMS | Configurer | Décider | Émettre selon droit | Émettre selon droit | Consulter coûts |
| Retenue des bulletins et seuil | Configurer | Autoriser | Consulter impact pédagogique | — | Configurer selon droit |
| Habilitations et sécurité | Administrer | Consultation limitée | — | — | — |
| Audit | Lire | Lire selon droit | Périmètre si prévu | — | Périmètre si prévu |

**Attention :** cette matrice est une *cible à faire approuver*, pas une déclaration de permissions déjà actives. La table `permissions` de la base et les gardes serveur prévalent.

## Tests d'acceptation transversaux à automatiser

1. Un Superadmin autorisé modifie les coordonnées ; la base, l'affichage de Paramètres et le prochain PDF reflètent les données, le journal inscrit l'avant/après.
2. Un rôle sans permission ouvre directement l'URL des paramètres sensibles : refus de lecture et d'écriture.
3. Un parent ne peut pas accéder à la fiche d'un enfant qui n'est pas rattaché à son compte, même avec l'UUID deviné.
4. Modifier la validité du code d'activation agit sur les nouveaux codes uniquement ; les codes existants conservent leur expiration.
5. Double clic sur une invitation ou un SMS ne produit pas deux coûts, ni deux notifications du même événement.
6. Changement de canal sur ABSENCE et SANCTION ne modifie pas l'historique de livraison passé.
7. Une classe contenant des élèves ne peut pas être supprimée ; sa capacité ne descend pas sous l'effectif.
8. Une année clôturée bloque réellement les notes et les coefficients, pas seulement le bouton à l'écran.
9. Égalité de moyennes, ABS, absence de composition, coefficients et arrondis concordent entre tableaux et bulletins PDF.
10. Une retenue d'impayé s'applique avant publication, pas rétroactivement aux bulletins déjà émis.
11. Révocation de l'accès d'un ancien membre du personnel coupe ses sessions, ses permissions et ses accès aux documents.
12. Sauvegarde, restauration et exports avec données sensibles ne s'exécutent pas sur un simple lien public.
13. Chaque page reste utilisable à 320 px de large sans actions critiques masquées ; formulaires et confirmations accessibles au clavier.
14. Une erreur fournisseur SMS ou indisponibilité réseau affiche une information exacte et permet une reprise sûre.

## Ordre de livraison conseillé

- **Lot 0 — sécurité et déploiement :** stabiliser CI/Vercel, séparer droits, bloquer les écritures d'années closes, tests de régression.
- **Lot 1 — identité / parents :** fiche unique, invitations, sécurité codes, détection des doublons.
- **Lot 2 — gouvernance pédagogique :** périodes, coefficients, prérequis et prévisualisation des impacts.
- **Lot 3 — notifications :** budgets, politiques, consentements, file d'envoi et statuts honnêtes.
- **Lot 4 — bulletins / finances :** retenue cohérente, tarifs, reçus, exonérations, historique.
- **Lot 5 — habilitations / résilience :** rôles, sessions, journal, sauvegardes, diagnostics.
- **Lot 6 — validation :** recette multi-rôles, mobile/desktop, traitement des erreurs et supervision.

**Règle de livraison :** un écran n'est « terminé » que si lecture, écriture, autorisation serveur, validation, audit, états vides/erreur, réactivité mobile et effet métier réel sont démontrés. Le CI vert ne prouve pas à lui seul un déploiement en production.
