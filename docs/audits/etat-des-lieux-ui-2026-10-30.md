# État des lieux UI — 30 octobre 2026

Relevé sur `origin/main` au commit `20229a8`, avant la suite de la refonte.

---

## 1. Le constat central : deux systèmes visuels coexistent

Une refonte Gentelella v4 est **déjà engagée**, selon la méthode consignée dans
`communication-gentelella-v4-2026-10-27.md` et `dossier-eleve-gentelella-v4-2026-10-26.md` :
les sources restent intactes dans `web/src/vendor/gentelella-v4/` (licence MIT
conservée), et le style est appliqué via un périmètre CSS `@scope (.gentelella-v4)`.

Elle couvre **6 pages sur 42**.

| Habillées Gentelella v4 | Restées sur shadcn nu |
|---|---|
| `default` (tableau de bord) | `assiduite`, `bulletins` |
| `communication` | `classes`, `classes/[id]` |
| `eleves` | `discipline` + `conseils` + `statistiques` |
| `eleves/[id]` | `emploi-du-temps` + `journee` + `calendrier` |
| `eleves/completer` | `finances` + `caisse` + `exonerations` |
| `eleves/importer` | `notes` + `appreciations` + `calendrier` |
| | `parents` + `[id]` + `familles` + `invitations` + doublons |
| | `personnel` + `[id]` + `importer` |
| | `parametres` + 6 sous-pages |
| | `eleves/nouveau` |

**36 pages portent encore l'ancien habillage.** C'est exactement l'incohérence que
la mission décrit : un même logiciel où deux pages voisines n'ont pas la même
tête. Le travail restant n'est pas d'inventer un système de design — il existe —
mais d'**étendre celui-ci aux 36 pages qui ne l'ont pas**.

---

## 2. Ce que la peau Gentelella coûte aujourd'hui en recopie

Le dispositif fonctionne mais n'a pas encore de point d'entrée partagé.

**Les imports CSS sont recopiés page par page.** `eleves/page.tsx` en aligne quatre,
`communication/page.tsx` en aligne huit, avec des chemins relatifs qui remontent
dans le dossier d'un autre module :

```tsx
import "../default/gentelella-tokens.css";
import "../default/gentelella-layout.css";
import "../default/gentelella-components.css";
import "../default/gentelella-widgets.css";
import "../eleves/[id]/gentelella-forms.css";      // depuis communication
import "../eleves/[id]/gentelella-datatable.css";
import "../eleves/[id]/gentelella-apps.css";
```

Une page qui en oublie un s'affiche à moitié habillée, et rien ne le signale.

**Le chrome des cartes est réécrit à chaque bloc.** La chaîne

```
gentelella-v4 … rounded-xl border border-slate-200/80 bg-white shadow-sm
dark:border-border dark:bg-card
```

est retapée sur chaque conteneur. D'où **3 189 occurrences** de classes de palette
brutes (`slate-200`, `amber-600`, `emerald-500`…) dans `web/src/app` : ces valeurs
court-circuitent à la fois les jetons Gentelella et ceux de shadcn.

**Il n'existe toujours pas d'en-tête de page partagé.** 18 fichiers portent encore
le bloc titre recopié à la main (`<h1 className="font-semibold text-2xl tracking-tight">`).
Aucun fil d'Ariane nulle part, alors que `components/ui/breadcrumb.tsx` est installé.
Aucun pied de page, alors que `APP_CONFIG.copyright` est défini et jamais affiché.

---

## 3. Plan retenu

**B — Fondations partagées** (aucun changement de rendu sur les 6 pages déjà faites)

1. Un point d'entrée CSS unique pour la peau, à la place des 4 à 8 imports recopiés.
2. Une coquille de page : `PageSkin`, `EnTetePage` (fil d'Ariane, titre, actions),
   `Carte`, `CarteTableau`, `Statistique`, `EtatVide`, `Pagination` — écrits avec
   les jetons Gentelella, pour que le chrome cesse d'être retapé.
3. Migration des 6 pages déjà habillées vers ces composants, à rendu constant.

**C — Extension aux 36 pages restantes**, module par module, dans cet ordre :
Parents → Personnel → Classes → Assiduité → Discipline → Notes → Bulletins →
Emploi du temps → Finances → Paramètres.

**D — Recette** : build de production, `npm test`, vérification responsive, et
recette manuelle par rôle (la vérification technique ne remplace pas ce passage,
comme le note déjà l'audit Communication).

---

## 4. Rectificatif

Un premier état des lieux produit plus tôt dans la journée portait sur un dépôt
local resté **183 commits en arrière** d'`origin/main`. Il concluait à l'absence
de Gentelella v4 et proposait de bâtir un système de design indépendant. Les deux
conclusions sont fausses sur le code réel, et la seconde aurait introduit un
troisième système visuel. Ce document le remplace.
