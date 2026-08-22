# 05 — Plan d'enrichissement, page par page

**Objet :** recenser, pour chaque écran livré, ce qui manque pour atteindre le
niveau d'un ERP scolaire complet — puis l'exécuter par vagues.

**Méthode :** chaque fonctionnalité porte un identifiant `E-xx`, une priorité et
une justification. Une fonctionnalité sans justification métier n'entre pas dans
le plan : on ne construit pas pour faire nombre.

**Priorités :**
- **P1** — l'établissement ne peut pas s'en passer au quotidien.
- **P2** — attendu d'un produit professionnel, mais contournable un trimestre.
- **P3** — confort réel, à faire quand le reste tourne.

---

## Vague A — Ce qui bloque l'usage réel (P1)

### A1. Photos et pièces jointes

Aujourd'hui `eleves.photo_url` existe en base mais **aucun écran ne permet de
téléverser quoi que ce soit**. C'est le manque le plus visible : sans photo, ni
carte scolaire, ni liste d'appel illustrée, ni reconnaissance à l'infirmerie.

| ID | Fonctionnalité | Écran |
|----|----------------|-------|
| E-01 | Téléversement de la photo d'élève, recadrage carré, compression WebP ≤ 60 ko | Fiche élève |
| E-02 | Dépôt des pièces du dossier (acte de naissance, bulletins antérieurs, certificat médical) | Fiche élève, onglet Scolarité |
| E-03 | Photo d'enseignant | Fiche enseignant |
| E-04 | Logo et cachet de l'établissement | Paramètres |
| E-05 | Pièce jointe d'annonce et de devoir | Communication |

**Décision de stockage.** Le plan gratuit Neon offre 0,5 Go, entièrement
consommés par les données métier si on y met des images. Trois options ont été
pesées :

- **Supabase Storage** — 1 Go gratuit, mais le compte est déjà saturé (§Lot 0).
- **Cloudflare R2** — 10 Go gratuits, egress illimité. Demande une carte
  bancaire à l'inscription, mais ne facture rien en dessous du seuil.
- **Colonne `bytea` en base** — 2 000 élèves × 60 ko = 120 Mo. Tient, mais
  mange le quart du quota et alourdit chaque sauvegarde.

**Retenu : Cloudflare R2**, avec repli `bytea` si le compte R2 n'est pas ouvert.
L'adaptateur de stockage sera isolé derrière une interface unique, comme l'a été
la passerelle SMS — changer de fournisseur ne doit toucher qu'un fichier.

### A2. Documents imprimables

Un établissement vit de papier : sans édition PDF, le logiciel double le travail
au lieu de le réduire.

| ID | Document | Écran |
|----|----------|-------|
| E-06 | Fiche d'inscription | Fiche élève |
| E-07 | Certificat de scolarité | Fiche élève |
| E-08 | Certificat de transfert / radiation | Fiche élève |
| E-09 | Carte scolaire avec photo et matricule | Fiche élève |
| E-10 | Reçu de paiement numéroté | Finances |
| E-11 | Liste d'appel imprimable | Assiduité |
| E-12 | Convocation de tuteur | Discipline, Communication |
| E-13 | Notification de sanction | Discipline |

Toutes ces éditions passent par `@react-pdf/renderer` et la table
`documents_emis`, qui **numérote et fige le contenu** : un certificat réédité
doit être identique à l'original, même si les données ont changé depuis.

### A3. Import et export en masse

À la rentrée, une secrétaire ne saisira pas 1 500 élèves un par un.

| ID | Fonctionnalité | Écran |
|----|----------------|-------|
| E-14 | Import Excel/CSV des élèves, avec gabarit téléchargeable et rapport d'erreurs ligne à ligne | Élèves |
| E-15 | Import des enseignants | Personnel |
| E-16 | Import des notes d'une évaluation | Notes |
| E-17 | Export Excel de toute liste affichée | Toutes les listes |
| E-18 | Export comptable | Finances |

**Point d'attention :** un import doit être *rejouable*. Le premier essai
échouera toujours partiellement — mauvais format de date, doublon de matricule.
Le rapport doit permettre de corriger le fichier et de relancer sans créer de
doublons.

---

## Vague B — Ce qu'attend un produit professionnel (P2)

### B1. Tableau de bord (page `default`)

Aujourd'hui : 4 compteurs et un guide de mise en service. Le cahier des charges
demande 14 indicateurs, 9 graphiques et 8 familles d'alertes. Tous sont
désormais **alimentables**, puisque chaque module produit ses données.

| ID | Bloc | Contenu |
|----|------|---------|
| E-19 | Indicateurs | Effectif, nouveaux inscrits, réinscriptions, enseignants, classes, présents ce jour, absents ce jour, retards, suspendus, exclus, transférés, moyenne générale, taux de réussite, taux d'absentéisme |
| E-20 | Effectifs par niveau | Barres empilées |
| E-21 | Répartition filles / garçons | Anneau, par niveau |
| E-22 | Absences par mois | Courbe, sur l'année |
| E-23 | Moyennes par classe | Barres, comparaison intra-niveau |
| E-24 | Résultats par matière | Barres, identifie les matières en difficulté |
| E-25 | Évolution du recouvrement | Courbe cumulée |
| E-26 | Classement des classes | Table triée |
| E-27 | Alertes | Absences répétées, élèves en difficulté, notes manquantes avant conseil, bulletins non publiés, échéances dépassées, dossiers incomplets |

**Réserve.** Un tableau de bord surchargé ne se lit pas. La direction veut
quatre chiffres justes, pas douze courbes. Les graphiques seront répartis sur
des onglets (Effectifs / Résultats / Vie scolaire / Finances) plutôt
qu'entassés sur une page.

### B2. Fiche élève

| ID | Fonctionnalité |
|----|----------------|
| E-28 | Modification du dossier après inscription (aujourd'hui : lecture seule) |
| E-29 | Onglet **Notes** : relevé par matière avec moyennes calculées |
| E-30 | Onglet **Assiduité** : absences, retards, justificatifs |
| E-31 | Onglet **Discipline** : incidents et sanctions |
| E-32 | Onglet **Finances** : échéancier et reçus |
| E-33 | Onglet **Documents** : pièces déposées et documents émis |
| E-34 | Courbe d'évolution des moyennes sur les trois trimestres |
| E-35 | Rattacher / détacher un tuteur depuis la fiche |
| E-36 | Réinscription en un clic vers l'année suivante |

### B3. Listes et recherche

| ID | Fonctionnalité | Écran |
|----|----------------|-------|
| E-37 | Tri par colonne sur toutes les tables | Toutes |
| E-38 | Sélection multiple et actions groupées (changer de classe, générer les échéanciers, publier) | Élèves, Notes, Finances |
| E-39 | Recherche globale depuis la palette ⌘J (élève, enseignant, classe) | Global |
| E-40 | Filtres persistants dans l'URL, partageables | Toutes |

### B4. Notes et évaluations

| ID | Fonctionnalité |
|----|----------------|
| E-41 | Appréciation par matière et par période, saisie depuis la grille |
| E-42 | Statistiques d'évaluation : moyenne, min, max, écart-type, histogramme |
| E-43 | Calendrier des compositions, visible des familles |
| E-44 | Copie d'une évaluation vers une autre classe du même niveau |
| E-45 | Tableau « qui n'a pas saisi » avant conseil de classe |

### B5. Emploi du temps

| ID | Fonctionnalité |
|----|----------------|
| E-46 | Glisser-déposer d'un cours d'une case à l'autre |
| E-47 | Impression par classe et par enseignant |
| E-48 | Vue journalière (cours du jour, salle par salle) |
| E-49 | Gestion des remplacements depuis la grille |
| E-50 | Contrôle du volume horaire réellement placé contre le volume prévu au coefficient |

### B6. Vie scolaire

| ID | Fonctionnalité |
|----|----------------|
| E-51 | Saisie des retards depuis l'écran d'appel |
| E-52 | Justification en masse (un certificat couvrant plusieurs jours) |
| E-53 | Note de conduite par période, saisie par classe |
| E-54 | Conseil de discipline : convocation, délibération, décision |
| E-55 | Statistiques de discipline par classe et par type d'incident |

### B7. Finances

| ID | Fonctionnalité |
|----|----------------|
| E-56 | Relance automatique avant et après échéance |
| E-57 | Journal de caisse quotidien |
| E-58 | Blocage optionnel du bulletin en cas d'impayé (paramètre déjà en base) |
| E-59 | Historique des exonérations et leur coût cumulé |

---

## Vague C — Confort et finition (P3)

| ID | Fonctionnalité | Écran |
|----|----------------|-------|
| E-60 | Mode sombre respectant les préférences système | Global |
| E-61 | Journal d'audit consultable et filtrable | Paramètres |
| E-62 | Gestion des comptes du personnel (création, rôles, désactivation) | Personnel |
| E-63 | Sauvegarde et export complet de la base | Paramètres |
| E-64 | Devoirs et cahier de textes | Nouveau module |
| E-65 | Orientation de fin de cycle (3ème et Terminale) | Bulletins |
| E-66 | Bibliothèque et manuels | Nouveau module |
| E-67 | Cantine et transport | Nouveau module |

---

## Ce qui reste hors de mon contrôle

Ces dépendances externes ne peuvent pas être levées depuis le code seul :

| Dépendance | Ce qu'il faut | Effet tant que c'est absent |
|------------|---------------|------------------------------|
| ~~**Firebase**~~ | ~~Un fichier de compte de service (JSON)~~ | **Levée le 22/08/2026.** Projet configuré, chaîne d'envoi vérifiée — voir [06](06-NOTIFICATIONS-PUSH.md). Reste la recette sur un vrai téléphone. |
| **Passerelle SMS** | Un jeton d'API Northflank pour redéployer 235SMS | Aucun SMS ne part réellement. Le secrétariat dicte les codes d'activation. Voir [07](07-PASSERELLE-SMS.md). |
| **Vercel** | Un jeton personnel Vercel | Les variables `FCM_*` et `SMS_*` ne sont pas en production : le portail déployé ne peut ni envoyer de push ni envoyer de SMS, même si le code le peut. `npm run vercel:env` fait le reste en une commande. |
| **Stockage d'images** | Un compte Cloudflare R2 | Pas de photo ni de pièce jointe. Repli possible en base, au prix du quota. |

---

## Ordre d'exécution retenu

1. **A1 + A2** — photos et documents imprimables. C'est ce qui manque le plus
   au quotidien, et ce qui rend le logiciel crédible auprès du personnel.
2. **A3** — imports. Sans eux, la rentrée est impraticable.
3. **B1** — tableau de bord. Il devient utile maintenant que les données
   existent ; le construire plus tôt aurait affiché du vide.
4. **B2 à B7** — enrichissement des modules, module par module.
5. **C** — finition.

Les **bulletins et le conseil de classe** restent hors de ce plan : ils
constituent le Lot 8, à lancer sur décision de l'établissement.
