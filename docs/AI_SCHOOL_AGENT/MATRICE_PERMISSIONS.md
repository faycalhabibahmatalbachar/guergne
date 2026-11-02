# Matrice des permissions

Source de vérité : la table `permissions` de `guergne`, seedée en
`db/migrations/0009_seed_referentiel.sql` (super-admin : `0012`, notif : `0028`).
Vocabulaire typé : `web/src/server/guard/permissions.ts` — **84 actions**, 9 rôles,
3 portées (`AUCUNE`, `PROPRES_CLASSES`, `PROPRES_ENFANTS`).

> Principe (brief §3.1, §10) : l'agent **ne définit pas** les droits. Il **reflète**
> cette matrice comme pré-filtre, mais l'autorité reste le `guard` de `guergne`
> (AUTH → RÔLE → PÉRIMÈTRE). La matrice est **configurable en base**, jamais codée
> en dur dans le prompt du modèle.

---

## 1. Rôles opérateurs de l'agent WhatsApp

Les responsables qui pilotent par WhatsApp (brief : 2–3 personnes) relèvent des rôles
**DIRECTION, CENSEUR, SURVEILLANT, SECRETARIAT, COMPTABLE** (SUPER_ADMIN = tout).
ENSEIGNANT (portée `PROPRES_CLASSES`), PARENT et ELEVE (`PROPRES_ENFANTS`) ne sont
pas les opérateurs cibles mais existent dans la matrice.

## 2. Matrice réelle (extrait des actions pilotables par l'agent)

| Action | DIRECTION | CENSEUR | SURVEILLANT | SECRETARIAT | COMPTABLE |
|---|:--:|:--:|:--:|:--:|:--:|
| `assiduite:lire` | ✅ | ✅ | ✅ | ✅ | — |
| `assiduite:saisir` | — | — | ✅ | — | — |
| `assiduite:justifier` | — | — | ✅ | ✅ | — |
| `retard:saisir` | — | — | ✅ | — | — |
| `discipline:signaler` | — | — | ✅ | — | — |
| `discipline:sanctionner` | ✅ | — | ✅ | — | — |
| `eleve:exclure` | ✅ | — | — | — | — |
| `eleve:lire` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `eleve:creer` / `eleve:inscrire` | ✅ / — | — | — | ✅ / ✅ | — |
| `note:lire` | ✅ | ✅ | — | — | — |
| `bulletin:generer` | ✅ | ✅ | — | — | — |
| `finance:encaisser` | — | — | — | — | ✅ |
| `finance:lire` | ✅ | — | — | — | ✅ |
| `statistique:lire` | ✅ | ✅ | — | — | ✅ |
| `message:envoyer` | ✅ | ✅ | ✅ | — | ✅ |
| `document:emettre` | ✅ | ✅ | ✅ | ✅ | — |

(ENSEIGNANT détient `assiduite:saisir`/`discipline:signaler`/`note:saisir` **sur ses
propres classes uniquement** ; PARENT/ELEVE : lecture de leurs propres enfants/dossier.)

## 3. Constat important (preuve, pas hypothèse)

**La DIRECTION ne détient pas `assiduite:saisir` ni `retard:saisir`** — seulement
`assiduite:lire`. Or le critère de réussite du brief (§17) met en scène **un directeur
qui enregistre des absences** par WhatsApp. Tel quel, le `guard` de `guergne` refuserait
l'opération (`ROLE_INSUFFISANT`).

Deux issues possibles, à trancher par l'établissement (ni l'agent ni moi ne décidons
d'élargir des droits) :
1. Le compte du directeur cumule le rôle **SURVEILLANT** (ou un rôle ad hoc avec
   `assiduite:saisir`).
2. La matrice est ajustée pour donner `assiduite:saisir` à la DIRECTION.

Tant que ce n'est pas tranché, l'agent se comportera correctement : il **refusera
proprement** la saisie d'absence par un compte DIRECTION et le dira, plutôt que de
prétendre l'avoir faite.

## 4. Portée (`AUCUNE` / `PROPRES_CLASSES` / `PROPRES_ENFANTS`)

Le pré-filtre de l'agent ne gère que le niveau **rôle → action**. La **portée**
(un enseignant limité à ses classes, un parent à ses enfants) est vérifiée **côté
`guergne` uniquement**, car elle dépend de données de rattachement (affectations,
tutorat) que seul le backend connaît. L'agent ne la court-circuite jamais.
