# Audit exhaustif de la plateforme guergne

Extrait **du code source**, pas des menus, par `agent/scripts/audit-plateforme.mjs`
(reproductible). Relevé du 31 octobre 2026.

---

## 1. Volumétrie réelle

| Élément | Nombre | Portée |
|---|---|---|
| Actions serveur (`"use server"`) | **150** | dans 42 fichiers |
| Routes d'API (`app/api/**/route.ts`) | **28** | — |
| Fonctions de service de domaine | **123** | dans 31 modules |
| Permissions déclarées | **78** | `server/guard/permissions.ts` |
| Rôles | **9** | matrice en base (seed `0009`) |

Détail : [FEATURES_INVENTORY.md](FEATURES_INVENTORY.md),
[PLATFORM_API_MAPPING.md](PLATFORM_API_MAPPING.md),
[ROLE_ACTION_MATRIX.md](ROLE_ACTION_MATRIX.md).

## 2. Le constat qui délimite le périmètre de l'agent

Sur les **78 permissions** du vocabulaire :

| Catégorie | Nombre | Ce que cela signifie |
|---|---:|---|
| Exigées **directement** (`requirePermission("x")`) | **47** | fonctionnalité existante et protégée |
| Exigées **dynamiquement** (choix ternaire) | **8** | existante, permission calculée à l'exécution |
| **Jamais citées dans le code** | **23** | **la fonctionnalité n'existe pas encore** |

Les 8 dynamiques : `eleve:transferer`, `eleve:suspendre`, `eleve:reactiver`,
`eleve:exclure`, `evaluation:modifier`, `periode:deverrouiller`, `annonce:lire`,
`permission:gerer`. Exemple : `prononcerSanction` choisit entre `eleve:exclure` et
`discipline:sanctionner` selon le type de sanction — un détail qu'une extraction
naïve aurait classé « inutilisé » à tort.

**Les 23 permissions sans code**, par domaine :

| Domaine | Permissions sans implémentation |
|---|---|
| Travail personnel | `devoir:lire`, `devoir:publier`, `ressource:lire`, `ressource:publier`, `seance:saisir` |
| Conseils & décisions | `conseil_classe:tenir`, `conseil_classe:valider`, `decision:prononcer` |
| Scolarité | `eleve:reinscrire`, `piece:deposer`, `import:executer`, `sortie:autoriser` |
| Évaluation | `appreciation:saisir`, `note:modifier`, `conduite:noter` |
| Documents | `bulletin:telecharger`, `convocation:emettre`, `recu:emettre` |
| Finances | `finance:relancer` |
| Système | `statistique:lire`, `systeme:administrer`, `sauvegarde:executer`, `calendrier:gerer` |

**Conséquence directe pour le School AI Agent** : son catalogue d'outils ne peut
couvrir que les **55 capacités réellement implémentées**. Pour les 23 autres, il
n'y a pas d'endpoint à appeler — il faudrait d'abord **développer la fonctionnalité
métier** côté `guergne`. Inventer un outil pour elles produirait un agent qui
promet des actions impossibles.

## 3. Autorité des permissions

Trois contrôles, dans cet ordre, dans `server/guard/index.ts` :

1. **Authentification** — session valide (ou, pour l'agent, `principalParId`).
2. **Rôle** — la matrice est lue **en base**, jamais depuis le client.
3. **Portée** — `AUCUNE`, `PROPRES_CLASSES` (enseignant limité à ses affectations)
   ou `PROPRES_ENFANTS` (parent limité à ses enfants).

La portée dépend de données de rattachement que seul `guergne` connaît :
l'agent ne l'évalue jamais et ne peut pas la contourner.

## 4. Effets secondaires repérés

- **`absences_notification`** (migration 0016) : chaque absence insérée met en file
  une notification par tuteur rattaché, avec repli SMS. Les 549 élèves ont tous un
  tuteur → toute écriture de test sur un élève réel aurait notifié une vraie famille.
- **`retards_notification`** (migration 0024) : même mécanisme pour les retards.
- **`audit_pas_de_update`** : le journal d'audit est **immuable** — ni modification
  ni suppression. Garantie d'intégrité des traces de l'agent.
- **Sanctions d'exclusion** : `prononcerSanction` met à jour le statut de l'élève via
  un déclencheur écrivant dans `historique_statuts`. Effet secondaire à signaler à
  l'utilisateur avant confirmation.

## 5. État de l'intégration agent

| Module | Lecture via agent | Écriture via agent | Testé en base |
|---|---|---|---|
| Assiduité (absences, retards, justifications) | ✅ | ✅ | ✅ 42/42 |
| Discipline (incidents, sanctions) | ✅ lecture | ⏳ | — |
| Élèves, classes, parents, personnel | ⏳ | ⏳ | — |
| Notes, bulletins, finances, communication | ⏳ | ⏳ | — |

Un module n'est marqué ✅ que si ses outils existent **et** qu'un test vérifie
l'état réel en base. Aucun module n'est déclaré opérationnel sur la foi d'un
code HTTP.
