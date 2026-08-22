# 08 — Design de l'application des parents

Ce document décrit le système **tel qu'il est codé**, pas tel qu'on aimerait
qu'il soit. Le document [03 — Design system](03-DESIGN-SYSTEM.md) porte les
intentions ; celui-ci porte les valeurs exactes, pour qu'un designer puisse
reconstruire la bibliothèque dans Figma sans rien deviner, et pour qu'une
maquette Figma puisse être implémentée sans négociation.

**Source de vérité du code :** `mobile/lib/design/`. Si les deux divergent,
c'est le code qui a raison et ce document qui est à corriger.

---

## 1. Ce que l'application doit faire ressentir

Un parent ouvre l'application entre deux choses, souvent debout, souvent en
plein soleil, sur un téléphone d'entrée de gamme. Il vient chercher une
réponse à une question précise :

> Est-ce que ça va, pour mon enfant ?

Tout le reste — le graphisme, les animations, la palette — n'existe que pour
rendre cette réponse lisible en trois secondes. Un écran qui est beau et qui
demande dix secondes de lecture a échoué.

Trois conséquences directes, valables pour toute nouvelle maquette :

1. **Un chiffre par carte, jamais deux.** La moyenne, les absences, le solde.
   Deux chiffres dans une même carte obligent à choisir lequel lire.
2. **Le contraste prime sur la finesse.** Le gris clair élégant d'une maquette
   de bureau disparaît sur un écran d'entrée de gamme à midi.
3. **Aucune information portée par la seule couleur.** Un badge rouge porte
   toujours un mot et souvent une icône. Environ 8 % des pères d'élèves ne
   distinguent pas le rouge du vert.

---

## 2. Couleur

### 2.1 Identité

| Jeton | Clair | Sombre | Usage |
| --- | --- | --- | --- |
| `primaire` | `#1E429F` | `#3B63C4` | En-têtes, boutons principaux, liens |
| `primaireClair` | `#3B63C4` | — | Dégradé d'en-tête, états survolés |
| `primaireSombre` | `#15306F` | — | Pressé, ombres colorées |
| `accent` | `#C98A3C` | `#E0A85C` | Ocre sahélien — accents rares, jamais un bouton |

Dégradé de l'en-tête d'accueil : `#1E429F → #2D5BB9`, en diagonale
(haut-gauche vers bas-droite).

### 2.2 Sémantique — un sens, une couleur

Ces quatre couleurs sont **réservées**. Aucune ne peut servir de couleur
décorative, sous aucun prétexte : leur valeur tient entièrement au fait que le
parent peut s'y fier.

| Jeton | Clair | Sombre | Sens unique |
| --- | --- | --- | --- |
| `succes` | `#15803D` | `#4ADE80` | Présent · payé · admis |
| `alerte` | `#B45309` | `#FBBF24` | Retard · échéance proche |
| `danger` | `#B91C1C` | `#F87171` | Absence non justifiée · impayé |
| `info` | `#1D4ED8` | `#7DA6FF` | Neutre, à connaître |

Chaque couleur a un fond associé pour les badges, à `#DCFCE7`, `#FEF3C7`,
`#FEE2E2`, `#DBEAFE` respectivement.

> **La variante sombre n'est pas un caprice.** `#1D4ED8` sur le fond sombre
> `#161F32` donne un contraste de 2,5:1, contre les 4,5:1 exigés pour du
> texte. Les teintes sombres remontent la luminosité **sans changer la
> teinte**, pour que le sens porté reste identique. En Figma, ce sont deux
> modes d'une même variable, pas deux styles distincts.

### 2.3 Neutres

| Jeton | Clair | Sombre |
| --- | --- | --- |
| `fond` | `#F8FAFC` | `#0B1120` |
| `surface` | `#FFFFFF` | `#161F32` |
| `bordure` | `#E2E8F0` | `#2A3650` |
| `encre` | `#0F172A` | `#E2E8F0` |
| `encreDouce` | `#475569` | `#94A3B8` |
| `encreLegere` | `#94A3B8` | — |

### 2.4 Couleur d'une moyenne

Les seuils sont ceux du conseil de classe, pas une échelle arbitraire :

| Note | Couleur |
| --- | --- |
| ≥ 14 | `succes` |
| 10 – 14 | `info` |
| 8 – 10 | `alerte` |
| < 8 | `danger` |
| non notée | `encreLegere` |

### 2.5 Couleur de matière

Douze couleurs fixes, indexées par le code de la matière (`FR`, `MATH`, `PC`,
`SVT`, `HG`, `ANG`, `AR`, `PHILO`, `EPS`, `INFO`, `ECO`, `COMPTA`). Elles sont
**identiques à celles du bulletin imprimé** : un parent qui a le bulletin
papier sous les yeux doit retrouver la même barre de couleur à l'écran.

Ces couleurs sont décoratives : elles ne servent jamais de texte, et une
matière inconnue tombe sur `encreLegere` sans que rien ne casse.

### 2.6 Couleur d'avatar

Huit teintes d'identité, choisies par empreinte du `prénom + nom`.
**Ni vert ni rouge** : un avatar vert pour une fille et rouge pour son frère
laisserait entendre quelque chose sur les deux enfants.

`#1E429F` · `#3B63C4` · `#15306F` · `#C98A3C` · `#0E7490` · `#5B4B8A` ·
`#334155` · `#8A5A2B`

Fond à 14 % d'opacité, bordure à 28 %, initiales en teinte pleine.

L'empreinte est un FNV-1a 32 bits borné à 31 bits — pas `hashCode`, qui
n'est stable ni entre versions de Dart ni entre Dart et TypeScript. Le portail
web pourra donc afficher exactement les mêmes couleurs.

**Sur l'en-tête bleu, l'avatar devient blanc** (fond à 22 %, bordure à 55 %,
initiales pleines). La teinte d'identité à 14 % d'opacité donne un pastel
lisible sur du blanc, mais un bleu profond posé sur le bleu de l'en-tête
disparaît purement et simplement — c'est arrivé. Sur fond coloré, le nom de
l'enfant est de toute façon juste à côté : l'avatar n'a plus à distinguer un
frère d'une sœur, il doit seulement se voir.

---

## 3. Typographie

**Inter**, embarquée dans l'application — jamais chargée depuis le réseau. Sur
une connexion tchadienne, une police distante fait clignoter tout le texte au
démarrage, ou ne se charge pas du tout.

| Rôle | Corps | Graisse | Interlettrage |
| --- | --- | --- | --- |
| `displaySmall` | 36 | 700 | −0,8 |
| `headlineMedium` | 28 | 700 | −0,5 |
| `headlineSmall` | 24 | 700 | −0,3 |
| `titleLarge` | 22 | 600 | — |
| `titleMedium` | 16 | 600 | — |
| `bodyLarge` | 16 | 400 | interligne 1,5 |
| `bodyMedium` | 14 | 400 | interligne 1,5 |
| `bodySmall` | 12 | 400 | interligne 1,45 |
| `labelLarge` | 14 | 600 | +0,1 |

**Tout nombre affiché utilise les chiffres tabulaires** (`tabular-figures`).
Sans eux, une colonne de moyennes se désaligne au caractère près. En Figma :
activer la fonction OpenType `tnum` sur les styles de nombre.

---

## 4. Formes, espacement, ombres

| Jeton | Valeur |
| --- | --- |
| Rayon standard | 16 |
| Rayon petit (badges, champs) | 12 |
| Rayon d'avatar / pastille | 34 % du côté |
| Espacement de base | 16 |
| Bordure de carte | 1 px `bordure` |

L'espacement suit une échelle de 4 : 4, 8, 12, 16, 20, 24, 32. Aucune valeur
intermédiaire — une marge de 14 px dans une maquette est une erreur de saisie,
pas une intention.

Les ombres sont **très basses** : une carte se détache par sa bordure et son
fond blanc sur `#F8FAFC`, pas par une ombre portée. Sur un écran d'entrée de
gamme, les ombres douces se transforment en bandes visibles.

---

## 5. Composants

Inventaire de `mobile/lib/design/composants.dart`. Chacun doit exister comme
composant Figma, avec ses variantes.

| Composant | Rôle | Variantes |
| --- | --- | --- |
| `CarteLgr` | Conteneur de base | avec / sans bordure, cliquable ou non |
| `BadgeEtat` | Étiquette de statut | succès · alerte · danger · info · neutre, avec ou sans icône |
| `PastilleMoyenne` | Note sur 20 en évidence | 5 couleurs de seuil, avec ou sans « /20 », note absente |
| `AvatarEleve` | Photo ou initiales | 8 teintes × 3 tailles, photo / initiales / photo en échec |
| `BandeauHorsLigne` | Données non fraîches | — |
| `EtatVide` | Écran sans contenu | un message par écran, jamais générique |
| `ReglageClasse` | Situe une note dans sa classe | — |
| `ApparitionCascade` | Entrée en liste | — |
| `BanniereNotification` | Notification, application ouverte | — |

### 5.1 La pastille de moyenne grandit avec le texte

Elle est le seul composant dont la **boîte** suit le réglage de police du
téléphone, plafonné à 1,5×. Le carré était naguère fixe pendant que son
contenu grossissait : sur un téléphone en « grandes polices », le « /20 »
débordait et Flutter barrait la note d'un bandeau rayé.

Figer le texte aurait rendu illisible précisément le nombre que le parent a
ouvert l'application pour lire. C'est donc le carré qui cède.

### 5.2 Aucun écran vide sans explication

`EtatVide` porte toujours un message **propre à l'écran** :
« Aucune note publiée pour ce trimestre », jamais « Aucune donnée ». Un parent
qui lit « aucune donnée » croit que l'application est cassée ; il appelle le
secrétariat.

---

## 6. Mouvement

Material 3, sans Material 3 Expressive — l'équipe Flutter ne le développe pas
encore. L'effet expressif est obtenu à la main.

| Jeton | Courbe | Usage |
| --- | --- | --- |
| `ressortDoux` | `cubic(0.34, 1.26, 0.64, 1)` | Apparition de carte, dépliage |
| `ressortVif` | `cubic(0.22, 1.42, 0.36, 1)` | Badge, pastille, retour tactile |
| `sortie` | `cubic(0.4, 0, 0.2, 1)` | Disparition |

| Durée | Valeur | Usage |
| --- | --- | --- |
| courte | 180 ms | Retour tactile |
| moyenne | 320 ms | Transition d'état |
| longue | 520 ms | Cascade d'entrée de liste |

Un mouvement qui dépasse légèrement sa cible avant de se poser paraît
physique ; une interpolation linéaire paraît mécanique.

**Aucune transition entre écrans** : coût de performance inutile sur un
téléphone d'entrée de gamme.

---

## 7. Contraintes non négociables

Ces règles ont chacune coûté quelque chose. Une maquette qui les enfreint sera
refusée à l'implémentation.

1. **Cibles tactiles ≥ 48 dp.** L'application se consulte en marchant.
2. **Texte jusqu'à 130 % sans débordement.** Vérifié par trois tests
   d'apparence dédiés (`*_grandes_polices`). Un débordement fait échouer la
   compilation des tests : il n'est pas possible de le livrer sans le voir.
3. **Contraste AA minimum**, poussé au-delà pour le texte sur fond coloré.
4. **Mode sombre complet.** Pas un thème dégradé : chaque couleur sémantique a
   sa variante lisible.
5. **Pas de défilement horizontal.** Une table large devient une liste de
   cartes.
6. **Pas de données simulées.** Tout bouton visible est réellement branché ;
   une fonctionnalité non prête n'est pas affichée.
7. **Poids de l'APK.** Chaque mégaoctet est téléchargé en données mobiles par
   chaque famille. Les architectures x86 sont exclues du build de production
   pour cette seule raison.

---

## 8. Vérifier une maquette contre le code

Les captures de référence de tous les écrans vivent dans
`mobile/test/apparence/`. Elles sont produites par le code réel, avec des
données représentatives et une horloge figée au 14 novembre 2026.

```bash
cd mobile && flutter test test/apparence_test.dart
```

Un écart entre le code et la référence fait échouer le test et produit trois
images de comparaison dans `mobile/test/failures/`. Après une modification
**volontaire** du design :

```bash
cd mobile && flutter test --update-goldens test/apparence_test.dart
```

C'est le moyen le plus rapide de comparer une maquette Figma à ce que
l'application affiche réellement : ouvrir le PNG correspondant plutôt que de
lancer un émulateur.
