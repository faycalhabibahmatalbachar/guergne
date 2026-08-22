# 03 — Design system

L'identité visuelle est greffée sur le socle `next-shadcn-admin-dashboard`, qui expose déjà des
*presets* de thème. On ne repart pas de zéro : on redéfinit les jetons de couleur, la typographie et
quelques composants métier.

---

## 1. Intention

Un logiciel scolaire est utilisé **tous les jours, plusieurs heures, par des agents non techniciens**,
souvent sur des écrans modestes et sous une lumière forte. Trois partis pris en découlent :

1. **Densité maîtrisée** — un surveillant saisit 60 absences d'affilée : la grille doit tenir à l'écran
   sans défilement, avec des cibles de clic généreuses.
2. **Sobriété chromatique** — la couleur n'est jamais décorative. Elle signifie un statut (absent,
   impayé, sanctionné). Un écran bariolé fait perdre cette valeur d'alerte.
3. **Lisibilité avant esthétique** — contrastes AA minimum, chiffres tabulaires pour aligner les
   notes, jamais de gris clair sur blanc pour une donnée importante.

---

## 2. Palette

L'identité retenue est un **bleu profond institutionnel** (sérieux, scolaire, distinct du bleu
générique des SaaS), réchauffé par un **ocre sahélien** en accent.

```css
:root {
  /* Identité */
  --lgr-primaire:        oklch(0.42 0.13 254);  /* bleu institutionnel  #1e429f */
  --lgr-primaire-clair:  oklch(0.58 0.14 254);
  --lgr-accent:          oklch(0.68 0.14 65);   /* ocre sahélien        #c98a3c */

  /* Statuts — la couleur porte du sens, jamais de la décoration */
  --etat-succes:   oklch(0.62 0.15 150);  /* payé, présent, admis        */
  --etat-alerte:   oklch(0.75 0.15 80);   /* retard, échéance proche     */
  --etat-danger:   oklch(0.58 0.19 25);   /* absent non justifié, impayé */
  --etat-info:     oklch(0.62 0.13 240);  /* information neutre          */
  --etat-neutre:   oklch(0.55 0.02 260);  /* non renseigné               */
}
```

### Sémantique imposée

| Couleur | Signification unique | Jamais utilisée pour |
|---------|---------------------|----------------------|
| Vert | Présent · Payé · Admis · Moyenne ≥ 10 | Un bouton d'action générique |
| Ambre | Retard · Échéance à venir · Justification en attente | Un simple accent visuel |
| Rouge | Absence non justifiée · Impayé · Sanction · Moyenne < 8 | Un bouton « Supprimer » ordinaire |
| Bleu | Identité, navigation, actions primaires | Un statut |

**Règle d'accessibilité :** aucun statut n'est signalé par la seule couleur. Un badge porte toujours
un libellé (« Non justifiée ») ou une icône — indispensable pour les 8 % d'hommes daltoniens.

---

## 3. Typographie

| Usage | Police | Justification |
|-------|--------|---------------|
| Interface | **Geist Sans** (déjà présente dans le socle) | Excellente lisibilité aux petites tailles |
| Chiffres et notes | Geist Sans en `font-variant-numeric: tabular-nums` | **Obligatoire** : sans chiffres tabulaires, une colonne de notes n'est pas alignée et devient illisible |
| Bulletins PDF | **Noto Sans** | Couvre le latin étendu et l'arabe (v2), déjà éprouvée sur un projet précédent |

```css
.donnees-numeriques { font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }
```

---

## 4. Composants métier à construire

Au-delà des composants shadcn/ui fournis, huit composants portent l'essentiel de l'expérience :

| Composant | Rôle | Exigence |
|-----------|------|----------|
| `GrilleSaisieNotes` | Saisie d'une classe entière | Navigation clavier (Entrée = ligne suivante), **brouillon local** contre les coupures de courant, enregistrement automatique |
| `FeuilleAppel` | Appel d'un cours | Tout le monde présent par défaut ; un clic marque l'absence |
| `BadgeStatut` | Statut élève / paiement / absence | Couleur **et** libellé |
| `CarteEleve` | Identité condensée | Photo, matricule, classe, statut — réutilisée partout |
| `TableauBulletin` | Aperçu du bulletin | Rendu identique à l'écran et au PDF |
| `SelecteurPeriode` | Bascule de trimestre | Présent dans tous les écrans pédagogiques |
| `EcheancierPaiement` | Situation financière | Barre de progression, montants en FCFA formatés |
| `IndicateurHorsLigne` | Fraîcheur des données (mobile) | « Données du 17/08 à 14h32 » |

### Formatage des montants

Toujours en entiers FCFA, séparateur d'espace insécable, sans décimale :

```ts
new Intl.NumberFormat("fr-FR", {
  style: "currency", currency: "XAF", maximumFractionDigits: 0,
}).format(125000);  // « 125 000 F CFA »
```

---

## 5. Application mobile parent

L'app n'est pas une réduction du web : c'est un produit distinct, pensé pour un parent pressé.

- **Une seule information par écran.** L'accueil répond à trois questions : mon enfant a-t-il été
  absent ? quelle est sa moyenne ? dois-je de l'argent ?
- **Navigation par onglets** (5 maximum), jamais de menu latéral caché.
- **Cibles tactiles ≥ 48 dp** — beaucoup de parents utilisent l'app en marchant, en plein soleil.
- **Aucun écran vide sans explication** : « Aucune note publiée pour ce trimestre » plutôt qu'une
  page blanche.
- **Poids de l'APK maîtrisé** : pas d'animation lourde, images en WebP, architectures x86
  exclues du build de production. La cible de 15 Mo annoncée au départ était hors d'atteinte —
  le moteur Flutter seul pèse 20 Mo pour les deux architectures ARM. Mesure réelle et
  justification du compromis en [08 — Design mobile](08-DESIGN-MOBILE.md) §7.
- **Mode sombre** natif — économise la batterie sur écran OLED et se lit mieux le soir.

---

## 6. Bulletin imprimé

Le bulletin est le document le plus visible de l'établissement : c'est lui qui circule dans les
familles et qui construit l'image de l'école.

- Format **A4 portrait**, marges 15 mm, une page par élève (deux au maximum).
- En-tête : armoiries / logo, nom de l'établissement, ministère de tutelle, année scolaire.
- Tableau des matières en chiffres tabulaires, alternance de fond très légère (`#fafafa`) pour suivre
  les lignes à l'œil.
- Bloc de synthèse encadré : moyenne générale, rang, moyenne de la classe, assiduité, conduite.
- Mention et décision du conseil en évidence.
- Trois zones de signature : professeur principal, censeur, proviseur.
- **QR code de vérification** en pied de page, pointant vers une page publique d'authentification du
  document — parade simple et efficace contre les faux bulletins.

---

## 7. Ce qu'on ne fait pas

- Pas de tableau de bord surchargé de graphiques : la direction veut 4 chiffres justes, pas 12 courbes.
- Pas d'animation de transition entre écrans — coût de performance inutile sur un téléphone d'entrée
  de gamme.
- Pas de scroll horizontal sur mobile : une table large devient une liste de cartes.
- Pas de « mode démo » ni de données simulées dans l'application livrée. Tout bouton visible est
  réellement branché ; une fonctionnalité non prête n'est pas affichée.
