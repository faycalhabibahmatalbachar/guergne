# Registre des capacités de l'agent

**Lycée Guergné La Renaissance** · relevé le 2026-11-10 · branche `voix-bidirectionnelle`

Correspondance entre ce que le backend expose et ce que l'agent sait appeler.
Tous les nombres de ce document sont **mesurés** par lecture du code et par
requête sur la base de test (`br-calm-art`, hôte `ep-flat-thunder`), jamais
estimés. Les commandes qui les produisent sont données pour que le relevé soit
refaisable.

---

## 1. Les trois registres, et lequel fait autorité

```
   outils de l'agent                 opérations du backend              base
   agent/src/tools*.js      ──────▶  web/src/server/agent/              Neon
   38 outils                         operations.ts                      permissions
                                     46 opérations                      78 actions
   pré-filtre : refuse tôt           AUTORITÉ : AUTH → RÔLE → PÉRIMÈTRE
```

- **La base fait autorité.** `requirePermission` lit la table `permissions` à
  chaque appel. Rien dans le code ne peut l'outrepasser.
- **Le backend applique.** Une seule route, `POST /api/agent/{action}`, qui
  recharge l'acteur, vérifie la matrice et le périmètre, puis exécute l'action
  EXACTE de l'interface web — transaction et audit compris.
- **L'agent pré-filtre.** `agent/src/permissions-matrix.js` est un reflet, pas
  un juge : il sert à refuser tôt avec un message clair. Depuis 0041 il DÉRIVE
  la DIRECTION du vocabulaire complet moins les trois droits réservés, au lieu
  de recopier une liste.

## 2. Inventaire mesuré

| Registre | Nombre | Mesure |
|---|---|---|
| Actions du vocabulaire | **78** | `ACTIONS` dans `web/src/server/guard/permissions.ts`, et 78 valeurs distinctes de `permissions.action` en base — les deux coïncident |
| Opérations exposées à l'agent | **46** | `web/src/server/agent/operations.ts` : 35 lectures, 11 écritures |
| Outils de l'agent | **38** | `tools.js` 11 · `tools-pilotage.js` 18 · `tools-dossiers.js` 9 |
| Outils citant une opération inexistante | **0** | un test structurel le fige |
| Opérations sans outil | **8** | voir §4 |

```bash
# opérations exposées
grep -cE "^  [a-zA-Z]+: \{|^  [a-zA-Z]+: \{ permission" web/src/server/agent/operations.ts
# outils
cd agent && for f in src/tools.js src/tools-pilotage.js src/tools-dossiers.js; do grep -cE '^\s*name: "' $f; done
# matrice en base
node agent/scripts/audit-permissions.mjs
```

## 3. Les 11 écritures, et ce qu'elles exigent

Toutes **éteintes** tant que `AGENT_ECRITURES_ACTIVES=true` n'est pas posée :
réponse `403` + `code: ECRITURES_DESACTIVEES`.

| Opération | Droit | Confirmation | Relecture |
|---|---|---|---|
| `enregistrerAppel`, `supprimerAbsence` | `assiduite:saisir` | oui | oui |
| `enregistrerRetard` | `retard:saisir` | oui | oui |
| `justifierEnLot` | `assiduite:justifier` | oui | oui |
| `inscrireEleve` | `eleve:inscrire` | obligatoire | oui |
| `modifierEleve`, `archiverEleve` | `eleve:modifier` | obligatoire | oui |
| `changerClasseEleve` | `eleve:affecter` | obligatoire | oui |
| `creerClasse` | `classe:creer` | oui | oui |
| `modifierClasse`, `archiverClasse` | `classe:modifier` | oui | oui |

`supprimerClasse` — un `DELETE` en cascade — n'est **pas** exposé : la route
répond 404. Archiver, jamais détruire.

## 4. Les huit opérations qu'aucun outil n'atteint

Mesuré le 2026-11-10 en croisant les `action:` des outils avec les clés du
registre. Ce ne sont pas des fonctions à écrire : **le backend les expose
déjà**, et l'agent ne sait pas les demander.

| Opération | Droit | Paramètres honorés | Ce qu'elle débloquerait |
|---|---|---|---|
| `rechercherTuteurs` | `tuteur:gerer` | `recherche`, `page`, `parPage` (≤100) | « Liste les parents qui n'ont pas activé leur compte » |
| `statistiquesParents` | `tuteur:gerer` | — | synthèse des comptes parents |
| `releveEleve` | `note:lire` | `inscriptionId`, `periodeId` **requis** | relevé de notes d'un élève par période |
| `listerSituationsFinancieres` | `finance:lire` | `classeId`, `seulementImpayes`, `recherche` | « Qui n'a pas payé en 4e B ? » |
| `calendrierEvaluations` | `evaluation:lire` | `periodeId` **requis**, `classeId`, `type` | calendrier des évaluations |
| `listerPeriodes` | `assiduite:lire` | `anneeId` (déduit si absent) | résoudre « au premier trimestre » |
| `listerClassesEtMatieres` | `classe:lire` | `anneeId` (déduit) | couples classe × matière |
| `listerSeries` | `classe:lire` | — | séries du lycée (A1, A4, C, D…) |

Deux d'entre elles exigent des **UUID** (`inscriptionId`, `periodeId`) que
personne ne dicte au téléphone : leur outil devra les résoudre dans `preparer`,
comme les outils de dossier résolvent déjà un nom d'élève. C'est la seule
difficulté réelle du lot.

**Statut : NON VALIDÉ** — les outils ne sont pas écrits. Les nommer ici n'est
pas les livrer.

## 5. Contrat d'un outil

```js
{
  name: "eleves.dossier",            // domaine.action
  module: "eleves",
  description: "…",                   // lue par le modèle
  permission: "eleve:lire",           // pré-filtre ; le backend revérifie
  sensitivity: READ | WRITE | SENSITIVE,
  action: "consulterEleve",           // clé du registre backend
  parametres: { … },                  // UNIQUEMENT ceux que la route honore
  validate: (p) => ({}),              // avant tout appel
  summarize: () => "…",               // pour le journal
  preparer: async (p, outils) => {},  // noms → identifiants RELUS au backend
  confirmationObligatoire: true,      // aucune politique n'en dispense
  rendre: (data, params) => "…",      // mise en forme WhatsApp
  verifier: async ({ result, … }) => {}, // relecture après écriture
}
```

Deux garanties du socle, déjà en place et vérifiées :

- **Une liste tronquée se déclare.** `listeRendue` (`src/rendu.js`) affiche 10
  lignes au plus, annonce « N affichées sur M » dès que le total dépasse, ajoute
  « … et N de plus », et invite à préciser un filtre. Une liste partielle n'est
  donc jamais présentée comme complète.
- **Une ligne illisible n'emporte pas la réponse.** Une colonne absente rend
  « ligne illisible » pour cette ligne seule.

## 6. Matrice des rôles, après 0041

Relevé sur `br-calm-art` le 2026-11-10, après application de
`db/migrations/0041_direction_permissions_metier.sql` :

| Rôle | Droits | Portée |
|---|---|---|
| SUPER_ADMIN | **78** | AUCUNE |
| **DIRECTION** | **75** | AUCUNE (périmètre global) |
| CENSEUR | 23 | AUCUNE |
| SECRETARIAT | 17 | AUCUNE |
| SURVEILLANT | 14 | AUCUNE |
| ENSEIGNANT | 14 | PROPRES_CLASSES |
| PARENT | 13 | PROPRES_ENFANTS |
| COMPTABLE | 9 | AUCUNE |
| ELEVE | 7 | PROPRES_ENFANTS |

Les trois droits refusés à la DIRECTION, et ce qu'ils protègent :

| Droit | Pourquoi |
|---|---|
| `permission:gerer` | modifier la matrice, donc s'attribuer n'importe quel droit |
| `systeme:administrer` | administration technique, dont l'appairage WhatsApp |
| `sauvegarde:executer` | sauvegardes et restaurations de la base |

`utilisateur:modifier` n'en fait **pas** partie : l'audit du code montre qu'il ne
garde que le dossier administratif d'un enseignant, sa photo et la lecture de son
document. Le détail, et la raison pour laquelle le réserver ne protégeait rien,
sont dans l'en-tête de la migration 0041.

**Évolutivité.** La DIRECTION est dérivée des deux côtés — par la migration en
base, par `RESERVES_SUPER_ADMIN` dans l'agent. Et le test
« ÉVOLUTIVITÉ : la DIRECTION couvre tout le catalogue sauf les 3 réservés »
(`agent/test/permissions-matrix.test.js`) lit le catalogue du backend : une
permission métier ajoutée sans lui être accordée fait échouer la suite.

## 7. Ce qui est validé, et ce qui ne l'est pas

| Élément | Statut | Preuve |
|---|---|---|
| Matrice DIRECTION en base | **VALIDÉ** | `audit-permissions.mjs` : 75 / 78, écart 3, toutes portées AUCUNE |
| Non-régression des 8 autres rôles | **VALIDÉ** | comptes identiques avant / après, garde-fou dans la migration et assertion dans la recette |
| Migration rejouable | **VALIDÉ** | essai à blanc, application, second passage sans effet |
| Retour arrière | **PARTIEL** | `db/rollback/0041_*.sql` écrit, ses 36 droits d'origine vérifiés contre la base ; **jamais exécuté** |
| DIRECTION inscrit réellement | **VALIDÉ** | recette 51/51 : élève, inscription, classe, tuteur relus en SQL + `journal_audit` au nom de la DIRECTION |
| Refus de bout en bout sur un droit réservé | **NON ATTEIGNABLE** par la voie de l'agent : aucune des 18 permissions du registre n'est un droit réservé. Vérifié sur l'autorité (la table) et, pour `systeme:administrer`, à l'écran d'appairage |
| Pré-filtre de l'agent | **VALIDÉ** | 78 / 75, couverture complète du catalogue, 786/786 tests |
| Les 8 outils manquants | **NON VALIDÉ** | nommés au §4, non écrits |
| Cartographie des 9 sections de la fiche élève | **NON VALIDÉ** | à faire |
| 0041 en production | **NON APPLIQUÉE** — et volontairement : la preuve directe Vercel ↔ Neon manque toujours |

## 8. Refaire le relevé

```bash
cd agent && npm test                                   # 786 / 786
node agent/scripts/audit-permissions.mjs               # matrice, base de TEST
node agent/scripts/audit-permissions.mjs --production  # lecture seule
```

Pour la recette d'écriture, un backend dédié est nécessaire :

```bash
cd web && AGENT_ECRITURES_ACTIVES=true SMS_API_URL= SMS_API_KEY= FCM_PROJECT_ID= FCM_CLIENT_EMAIL= FCM_PRIVATE_KEY= npx next dev -p 3100
```

```bash
cd agent && node scripts/recette-crud-reel.mjs
```

Puis le nettoyage, par identifiants seulement :
`node scripts/recette-crud-reel.mjs --nettoyer <fichier>`.

**Sous Windows, arrêter l'enveloppe ne tue pas `next dev`** : vérifier le port
et tuer l'arbre de processus. Et `next dev` réécrit `web/AGENTS.md` — le
restaurer avant de committer (`git checkout -- web/AGENTS.md`).
