# Catalogue des outils de l'agent

Un **outil** = une opération métier que l'agent peut déclencher, qui appelle une
fonction/API **réelle** de `guergne`. L'agent ne fait jamais de SQL ; il passe par ces
outils, et chaque outil passe par le `guard` de `guergne` (AUTH → RÔLE → PÉRIMÈTRE).

Catégories de sensibilité (brief §10) : **L** lecture · **E** écriture ordinaire ·
**S** sensible (confirmation forte obligatoire).

---

## Module pilote — Assiduité / Vie scolaire

Source vérifiée : `web/src/app/(main)/dashboard/assiduite/actions.ts` (écritures) et
`web/src/server/domain/vie-scolaire.ts` (lectures). Permissions réelles relevées dans le
code : `assiduite:lire`, `assiduite:saisir`, `assiduite:justifier`, `retard:saisir`
(et pour la discipline voisine : `discipline:signaler`, `discipline:sanctionner`, `eleve:exclure`).

### Outils de lecture (`assiduite:lire`)

| Outil | Fonction guergne | Paramètres | Retour |
|---|---|---|---|
| `assiduite.consulter_absences` | `listerAbsences(filtres)` | classeId?, eleveId?, periodeId?, du?, au?, statut? | liste d'absences |
| `assiduite.consulter_retards` | `listerRetards(filtres)` | idem | liste de retards |
| `assiduite.alertes` | `listerAlertes(periodeId?)` | periodeId? | élèves dépassant les seuils d'absences |
| `assiduite.statistiques` | `statistiquesVieScolaire(periodeId)` | periodeId | taux, volumes |
| `assiduite.eleves_classe` | `listerElevesClasse(classeId)` | classeId | élèves (pour désambiguïser un nom) |
| `assiduite.controle_saisies` | (dérivé) classes sans appel du jour | date | classes manquantes |

### Outils d'écriture (E)

| Outil | Action guergne | Permission | Paramètres (validés, mêmes règles que le code) | Confirmation |
|---|---|---|---|---|
| `assiduite.enregistrer_appel` | `enregistrerAppel` | `assiduite:saisir` | periodeId, dateAbsence, matiereId?, nbHeures (0.5–12, déf. 1), absents[], retards[] | récap si >N élèves |
| `assiduite.enregistrer_retard` | `enregistrerRetard` | `retard:saisir` | inscriptionId, periodeId, dateRetard, heureArrivee?, dureeMinutes? (0–480), motif? | non |
| `assiduite.justifier_absences` | `justifierEnLot` | `assiduite:justifier` | absenceIds[] (≤200), statut (JUSTIFIEE/NON_JUSTIFIEE), motif (≥3 si JUSTIFIEE) | oui (modif. en lot) |

### Outils sensibles (S) — confirmation forte obligatoire

| Outil | Action guergne | Permission | Pourquoi sensible |
|---|---|---|---|
| `assiduite.supprimer_absence` | `supprimerAbsence(id, motif≥3)` | `assiduite:saisir` | suppression de donnée |

> Discipline (voisine, même écran) : `signalerIncident` (E, `discipline:signaler`),
> `prononcerSanction` (S, `discipline:sanctionner`, et `eleve:exclure` pour l'exclusion
> définitive). Détaillés avec le module Discipline.

### Scénarios conversationnels

**S1 — Absence au vocal.** « Enregistre l'absence de Mahamat Adam en 3e A aujourd'hui. »
1. STT → texte. 2. NLU → outil `enregistrer_appel`, entités { nom:"Mahamat Adam",
classe:"3e A", date:aujourd'hui }. 3. **Désambiguïsation** : `eleves_classe("3e A")` ;
plusieurs « Mahamat » → l'agent liste et demande lequel (menu numéroté). 4. Résolution
`eleve → inscription` + période courante. 5. Récap → exécution → vérification → compte rendu.

**S2 — Justification d'un certificat.** « Justifie les absences de Fatimé du 12 au 14,
certificat médical. » → `consulter_absences(eleve, du, au)` → `justifier_absences(ids,
JUSTIFIEE, "certificat médical")`. Confirmation car modification en lot.

**S3 — Contrôle matinal.** « Quelles classes n'ont pas fait l'appel ? » →
`controle_saisies(aujourd'hui)` → liste. (Base de l'automatisation du §10 du cahier des charges.)

**S4 — Suppression (sensible).** « Supprime l'absence de X de mardi, c'était une erreur. »
→ `consulter_absences` pour retrouver l'id → **confirmation forte** → `supprimer_absence(id,
motif)`. Jamais exécuté sans confirmation explicite.

### Gestion des ambiguïtés
- **Homonymes** → lister (classe, matricule) et faire choisir.
- **Classe/période implicites** → déduire la période courante ; demander la classe si absente.
- **Date relative** (« hier », « aujourd'hui ») → résolue côté agent, puis **confirmée dans le récap**.

### Validations (reprises du code réel)
`nbHeures` ∈ [0.5, 12] ; `dureeMinutes` retard ∈ [0, 480] ; justification ≤ 200 lignes ;
motif ≥ 3 caractères pour justifier/supprimer. Toute violation → message de correction,
**aucune écriture**.

### Permissions et confirmations
Chaque outil déclare sa permission ; l'exécution **échoue côté `guergne`** si l'acteur
ne l'a pas (le `guard` est l'autorité). Les outils E « en lot » et tous les outils S
exigent une confirmation explicite avant exécution.

### Tests de bout en bout (critères d'acceptation)
- Numéro non lié → refus, aucune action, trace d'audit « refusé ».
- Vocal « absence de X en 3eA » → bon outil, bons paramètres (prefill), vérification en base.
- Homonyme → clarification demandée, pas d'écriture tant que non levé.
- Justification > 200 → refus de validation.
- Suppression → bloquée tant que non confirmée ; après confirmation, trace avant/après.
- Doublon (même message/vocal 2×) → une seule écriture (idempotence).
- Droit manquant → refus propre, trace d'audit.

> Les autres modules (élèves, classes, parents, personnel, emploi du temps, notes,
> bulletins, finances, communication) seront catalogués sur le même format, en lisant
> leur code réel, après le bout-en-bout Assiduité.
