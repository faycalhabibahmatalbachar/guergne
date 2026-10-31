# Inventaire des données de test

Règle de la campagne : **aucune opération destructive sur une donnée dont
l'appartenance au jeu de test n'est pas établie.** La campagne n'utilise donc pas
les données existantes : elle crée les siennes, les reconnaît à une marque, et les
supprime à la fin.

---

## 1. Pourquoi des fixtures dédiées, et pas les élèves existants

Le déclencheur `absences_notification` (`db/migrations/0016_vie_scolaire.sql`) met en
file **une notification par tuteur rattaché** dès l'insertion d'une absence, et le
repli SMS est prévu pour les familles sans smartphone.

Or la vérification en base donne : **0 inscription active sans tuteur** sur 549.
Créer une absence de test sur un élève réel aurait donc envoyé un vrai message à un
vrai parent. C'est la raison pour laquelle la campagne crée son propre élève
**sans tuteur** : le déclencheur s'exécute, ne trouve aucun destinataire, et
n'envoie rien. Le test `T23` le vérifie explicitement (0 notification générée).

## 2. Marque de reconnaissance

Toutes les fixtures portent la marque **`ZZTEST-AGENT`** :

| Entité | Champ marqué | Exemple |
|---|---|---|
| `eleves` | `nom` = `ZZTEST-AGENT`, `matricule` = `ZZTEST-AGENT-<suffixe>` | `ZZTEST-AGENT-mvwh4efl` |
| `utilisateurs` | `nom` = `ZZTEST-AGENT-<RÔLE>` | `ZZTEST-AGENT-SURVEILLANT` |
| `inscriptions`, `absences`, `retards` | rattachées à l'élève marqué | — |

Les e-mails des comptes de test utilisent le domaine `example.invalid`
(RFC 2606) : non délivrable par construction.

## 3. Liste blanche des opérations destructives

Seuls sont supprimables : les enregistrements **créés par la campagne elle-même**,
identifiés par la marque ci-dessus ou par leur rattachement à l'élève de test.
Rien d'autre n'est jamais supprimé.

## 4. Limite constatée : le journal d'audit est immuable

Le déclencheur **`audit_pas_de_update`** interdit toute modification ou suppression
dans `journal_audit` (« Le journal d'audit est immuable : ni modification ni
suppression »).

C'est une **bonne propriété** — elle garantit que rien de ce que fait l'agent ne
peut être effacé après coup, ce qu'exige le cahier des charges. Conséquence
pratique : un compte de test ayant produit une trace ne peut plus être supprimé
(clé étrangère). La campagne **désactive** alors ces comptes (`actif = false`) au
lieu de les supprimer, et le dit explicitement.

**Comptes résiduels au 31 octobre 2026** : 3 × `ZZTEST-AGENT-SURVEILLANT`,
tous **inactifs**, conservés uniquement parce qu'ils portent une trace d'audit.
Ils ne peuvent plus se connecter ni agir.

## 5. Vérification du retour à l'état initial

Compteurs avant et après la campagne (tests `T39`–`T42`) :

| Table | Avant | Après |
|---|---|---|
| `absences` | 2 720 | 2 720 |
| `retards` | 2 236 | 2 236 |
| `eleves` | 549 | 549 |
| fixtures résiduelles | — | 0 |

Aucune donnée de production n'a été créée, modifiée ni supprimée.
