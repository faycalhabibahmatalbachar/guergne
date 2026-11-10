# CRUD de l'agent — registre, droits, mise en service, retour arrière

État au 2026-11-10. Aucun secret, aucune chaîne de connexion.

## 1. Le principe : emprunter, ne pas réécrire

Les écritures sur les élèves et les classes **existaient déjà**, éprouvées, dans
les actions serveur de l'interface web : détection des homonymes, matricule tiré
d'une séquence verrouillée, transaction unique élève + inscription + tuteurs +
statut, audit dans la transaction. Les recopier pour l'agent aurait créé une
seconde implémentation des mêmes règles.

L'agent emprunte donc **exactement** le chemin du navigateur :

```
WhatsApp → agent (préparer → récapituler → « oui » net → exécuter → relire)
        → POST /api/agent/{action}   jeton de service + x-acteur-id
        → principalParId             compte rechargé : actif, rôle habilité
        → exigerPermissionPour       matrice + périmètre (comme le web)
        → executerEnTantQue(acteur, action web)
              → requirePermission    2e contrôle, par l'action elle-même
              → transaction + audit  au nom de l'acteur réel
```

`executerEnTantQue` (`web/src/server/auth/acteur-delegue.ts`) pose l'acteur dans
un contexte asynchrone que `sessionCourante()` consulte avant le cookie. Il est
**hors** de tout fichier `"use server"` : un export de ce type serait appelable
depuis un navigateur, qui pourrait alors se choisir une identité. Un navigateur
n'a jamais de contexte délégué et retombe sur son cookie.

## 2. Registre des opérations exposées

| Domaine | Opération backend | Outil de l'agent | Droit | Genre |
|---|---|---|---|---|
| Élèves | `rechercherEleves` | `eleves.rechercher` | `eleve:lire` | lecture |
| Élèves | `consulterEleve` | `eleves.dossier` | `eleve:lire` | lecture |
| Élèves | `inscrireEleve` | `eleves.inscrire` | `eleve:inscrire` | **écriture** |
| Élèves | `modifierEleve` | `eleves.modifier` | `eleve:modifier` | **écriture** |
| Élèves | `changerClasseEleve` | `eleves.changer_classe` | `eleve:affecter` | **écriture** |
| Élèves | `archiverEleve` | `eleves.archiver` | `eleve:modifier` | **écriture** |
| Classes | `listerClasses` | `classes.lister` | `classe:lire` | lecture |
| Classes | `listerElevesClasse` | `classes.eleves` | `eleve:lire` | lecture |
| Classes | `listerNiveaux` | `referentiel.niveaux` | `classe:lire` | lecture |
| Classes | `creerClasse` | `classes.creer` | `classe:creer` | **écriture** |
| Classes | `modifierClasse` | `classes.modifier` | `classe:modifier` | **écriture** |
| Classes | `archiverClasse` | `classes.archiver` | `classe:modifier` | **écriture** |
| Emploi du temps | `chargerEmploiDuTemps` | `emploi_du_temps.consulter` | `emploi_du_temps:lire` | lecture |
| Assiduité | `enregistrerAppel`, `enregistrerRetard`, `justifierEnLot`, `supprimerAbsence` | `assiduite.*` | `assiduite:*`, `retard:saisir` | **écriture** |

Toutes les écritures restent **éteintes** tant que `AGENT_ECRITURES_ACTIVES=true`
n'est pas posée sur le déploiement : le backend répond alors `403` avec le code
`ECRITURES_DESACTIVEES`, que l'agent annonce comme tel — et non plus comme un
défaut de droits.

### Ce qui n'est délibérément PAS exposé

| Opération | Raison |
|---|---|
| `supprimerClasse` | c'est un `DELETE` ; `emploi_du_temps`, `seances`, `evaluations`… sont en `ON DELETE CASCADE`. L'agent **archive** (`active = false`). Vérifié : la route répond `404`. |
| Suppression d'élève | aucune n'existe ; l'archivage passe par `historique_statuts` et conserve tout. |
| `confirmerDoublon` (passage outre d'un homonyme) | forcé à `false` par l'agent : seul quelqu'un qui a relu le dossier existant dans l'application peut le lever. |
| Statuts disciplinaires (exclusion, suspension, transfert) | existent côté web, non exposés : décisions lourdes, hors du périmètre demandé. |

## 3. Matrice des droits — relevée en base

La matrice vit dans la table `permissions`, **pas** dans le code. Relevé sur la
branche de test `br-calm-art` ; la production peut différer et doit être relue
avant activation.

| Rôle | Droits d'écriture élèves / classes |
|---|---|
| SUPER_ADMIN | `eleve:inscrire`, `eleve:modifier`, `eleve:affecter`, `classe:creer`, `classe:modifier` |
| SECRETARIAT | `eleve:inscrire`, `eleve:modifier`, `eleve:affecter` |
| DIRECTION | `eleve:modifier`, `classe:creer`, `classe:modifier` — **ni inscription, ni changement de classe** |
| CENSEUR | `eleve:modifier`, `classe:creer`, `classe:modifier` |
| SURVEILLANT, ENSEIGNANT, COMPTABLE | lecture seule |
| PARENT | refusé avant la matrice : rôle non habilité à l'administration |

**À trancher par l'établissement** : la DIRECTION ne peut ni inscrire un élève ni
le changer de classe. C'est peut-être voulu (séparation des tâches avec le
secrétariat) — mais « Inscris le nouvel élève Mahamat » dicté par la direction
sera refusé. Ce n'est pas un défaut technique, et ce document ne le modifie pas.

## 4. Ce qu'un « oui » autorise

`agent/src/confirmation.js`. Trois failles de l'ancien moteur, toutes fermées :

| Faille | Avant | Après |
|---|---|---|
| Pas d'expiration | un « oui » du lendemain exécutait | 5 minutes (`AGENT_CONFIRMATION_TTL_MS`) |
| L'attente survivait à une autre demande | « oui, merci » plus tard exécutait l'écriture oubliée | toute autre phrase **abandonne** l'attente |
| « oui » en préfixe | « oui mais en 5e B » exécutait la 6e A | seules les formes **nettes** confirment |

Et pour les écritures de dossiers (`confirmationObligatoire`) : aucune politique
automatique ne dispense de la confirmation, et `confirmed: true` venant du modèle
ne vaut rien. Les paramètres confirmés sont **gelés** et portent une empreinte.

## 5. Ne jamais dire « fait » sans relire

Chaque écriture de dossier porte un `verifier` qui relit l'état après coup. Si le
serveur a répondu « ok » mais que la relecture ne le confirme pas, l'agent
**ne l'affirme pas**, ne **rejoue rien** (l'écriture a pu aboutir), et
l'audit local enregistre `UNVERIFIED`.

Limite honnête : le dossier relu (`chargerDossier`) n'expose ni le téléphone ni
l'e-mail de l'élève. Une modification de ces champs est annoncée « enregistrée
par le serveur, non relisible par l'assistant » — jamais « vérifiée ».

## 6. Protocole de tests

| Niveau | Commande | Base |
|---|---|---|
| Unitaires + moteur | `cd agent && npm test` | aucune |
| Recette HTTP réelle | `cd agent && node scripts/recette-crud-reel.mjs` | **test** (`br-calm-art`) |
| Nettoyage | `node scripts/recette-crud-reel.mjs --nettoyer <fichier>` | test, par identifiants |

La recette exige un backend lancé **à part**, écritures activées, SMS et push
vidés :

```bash
cd web
AGENT_ECRITURES_ACTIVES=true SMS_API_URL= SMS_API_KEY= FCM_PROJECT_ID= FCM_CLIENT_EMAIL= FCM_PRIVATE_KEY= npx next dev -p 3100
```

Ses trois verrous la font **refuser** de toucher la production : base de
vérification ≠ `br-red-waterfall` ; backend annonçant la même année courante que
la base de test (la production annonce 2026-2027) ; file de notifications
comptée avant et après.

Pourquoi vider SMS et push : `changerStatut` réveille la file de notifications
**dans le processus**, et la base de test contient 20 notifications en attente
vers des numéros du jeu semé. L'expéditeur échoue fermé sans aucun canal
configuré (`expediteur.ts`), et il est vérifié qu'une variable vidée **reste**
vide face à `.env.local` (`@next/env`).

## 7. Mise en service — la dernière étape

**Non effectuée.** Conditions préalables, dans l'ordre :

1. **Preuve directe** que Vercel Production lit `br-red-waterfall` : dans Vercel →
   Settings → Environment Variables → Production, l'hôte `ep-…` de
   `DATABASE_URL`, à comparer avec l'endpoint de la branche dans Neon. Seule une
   preuve indirecte existe aujourd'hui (divergence d'activité).
2. **Relire la table `permissions` de production** (la matrice ci-dessus vient de
   la branche de test), et trancher le cas de la DIRECTION.
3. Déployer le code (Vercel), **écritures toujours éteintes**, et rejouer les
   lectures de `scripts/recette-backend-reel.mjs` contre la production.
4. Poser `AGENT_ECRITURES_ACTIVES=true` en Production.
5. Une écriture réelle, **nommément autorisée**, puis relecture et audit.

## 8. Retour arrière

| Niveau | Geste | Effet |
|---|---|---|
| Couper les écritures | retirer `AGENT_ECRITURES_ACTIVES` (ou `false`) | immédiat ; les lectures continuent |
| Revenir au code | redéployer le commit précédent | les écritures de dossiers disparaissent de la route |
| Défaire une classe archivée | `UPDATE classes SET active = true WHERE id = …` | rien n'a été supprimé |
| Défaire un élève archivé | `changerStatut(…, "INSCRIT")` depuis l'interface | le statut repasse par l'historique |
