# Mémoire conversationnelle

Code : `agent/src/memoire-vive.js`, `agent/src/memoire-composee.js`, `agent/src/memory.js` (Neon), `agent/src/foyer.js`. Tests : `agent/test/memoire-isolation.test.js` (12 tests), épreuve réelle `agent/banc/memoire-durable.mjs` (12 constats).

## Une conversation, une mémoire

La clé d'une conversation est la paire **(acteur authentifié, numéro)**. Elle est calculée par le moteur à partir de l'identité qu'il vient de vérifier ; le modèle ne la voit pas et ne peut pas en choisir une autre.

- Deux utilisateurs : deux mémoires.
- Le même utilisateur sur deux numéros : deux mémoires.
- Un groupe ou une liste de diffusion : refusé à l'identité, donc aucune mémoire, et aucun message en retour.
- En base, une conversation dont l'acteur a changé n'est pas rendue (`memory.js`, `prepare`).

## Deux étages

| | Étage vif | Étage durable |
|---|---|---|
| Fichier | `memoire-vive.js` | `memory.js` (tables `wa_*`, migrations 0037 et 0038) |
| Où | mémoire du processus | Neon, chiffré AES-256-GCM |
| Durée | 30 minutes de silence | attente 48 h, contexte 7 jours — mais servi comme fil pendant 30 minutes seulement |
| Contient | les 10 derniers messages de l'utilisateur, les questions de l'agent, l'attente, la dernière consultation, le foyer | l'attente (avec empreinte, expiration, acteur), la dernière consultation, le foyer, les préférences |
| Ne contient jamais | le résultat d'une consultation | un message scolaire, même chiffré ; un nom ; une note |
| Actif | toujours | si `AGENT_MEMORY_ENABLED=true` |

`MemoireComposee` les assemble : tant que le processus vit, l'étage vif répond ; après un redémarrage il est vide, et l'étage durable rend l'attente, la dernière consultation et le foyer. L'historique des phrases, lui, n'existe plus nulle part — et il n'est pas nécessaire pour comprendre « et les retards ? » ou un « oui ».

## Ce que la mémoire retient

- **Le fil** : dernière consultation (outil et filtres), question en suspens.
- **Le foyer** : classe, période, élève en cours, élèves du dernier résultat — en identifiants uniquement (`validerFoyer` écarte tout le reste, à l'écriture comme à la relecture).
- **Les filtres actifs** : statut, dates, drapeaux (impayés, boursiers…).
- **L'opération préparée** : outil, paramètres exacts, empreinte, expiration, acteur.
- **Les préférences** demandées explicitement (langue, style de réponse, format des rapports).

Les données scolaires ne sont pas mémorisées : elles sont relues au backend quand elles servent, donc sous les droits de l'acteur au moment de la relecture.

## Cycle de vie

- **Péremption** : un fil muet depuis 30 minutes n'est plus servi. « Et les retards ? » trois heures après ne se rattache pas à la classe du matin (scénario `mt-10`).
- **Fermeture volontaire** : « nouveau sujet », « on change de sujet », « oublie ça » ferment le fil, y compris une confirmation en attente (scénario `cv-04`). « Oublie ma mémoire » efface aussi les préférences.
- **Changement de sujet implicite** : le modèle reçoit le fil avec la consigne de l'ignorer si le message ouvre un autre sujet (scénario `mt-07`).
- **Purge** : les lignes expirées sont supprimées toutes les heures (`purgeExpired`).

## Confirmations

Une confirmation est liée à la conversation, à l'acteur, à l'outil, aux paramètres exacts (empreinte), et expire. Elle est retirée dès qu'elle est lue, quelle que soit l'issue. Conséquences, toutes testées :

- le « oui » d'un autre utilisateur ne confirme rien ;
- un second « oui » ne rejoue rien ;
- une autre demande entre la question et le « oui » fait tomber la confirmation ;
- après un redémarrage, le « oui » confirme l'opération préparée avant — une seule fois ;
- les droits sont revérifiés au moment du « oui », puis par le backend.

La mémoire ne donne jamais un droit : un identifiant gardé au foyer repasse par l'outil, donc par le pré-filtre et par le garde du backend.

## Preuves

| Preuve | Commande | Résultat |
|---|---|---|
| Isolement, péremption, groupe, confirmations croisées, reprise après redémarrage (moteur réel, modèle remplacé) | `node --test test/memoire-isolation.test.js` | 12 / 12 |
| Reprise après redémarrage sur la vraie mémoire Neon de la base de test, vrai modèle | `npm run agent:memoire` | 12 / 12 constats |
| Conversations multi-tours avec le vrai modèle | scénarios `mt-*` et `cv-*` du banc | voir le rapport de campagne |

L'épreuve Neon vérifie aussi, en SQL, que la base ne contient aucun message d'utilisateur et que le contexte est illisible sans la clé.

## Activer la mémoire durable en production

Elle est éteinte. Pour l'allumer sur Altare : appliquer les migrations 0037 et 0038 à la base visée si elles n'y sont pas, puis poser `AGENT_MEMORY_ENABLED=true`, `AGENT_MEMORY_DATABASE_URL`, `AGENT_MEMORY_ENCRYPTION_KEY` et `AGENT_MEMORY_HMAC_KEY` (32 octets chacune). Sans cela, le fil vit en mémoire vive et se perd au redémarrage — ce qui est sûr, mais oblige à reformuler après un redémarrage.
