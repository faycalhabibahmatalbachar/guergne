# Rapport d'intégrité de la base

Établi le 31 octobre 2026, après la campagne CRUD + RBAC.
Base : Neon, PostgreSQL 17.11, `neondb`.

---

## 1. Aucune donnée de production touchée

| Table | Avant campagne | Après campagne | Écart |
|---|---|---|---|
| `absences` | 2 720 | 2 720 | 0 |
| `retards` | 2 236 | 2 236 | 0 |
| `eleves` | 549 | 549 | 0 |
| fixtures `ZZTEST-AGENT` | 0 | 0 | 0 |

Toutes les créations, modifications et suppressions ont porté sur des fixtures
créées par la campagne (voir [TEST_FIXTURES_INVENTORY.md](TEST_FIXTURES_INVENTORY.md)).

## 2. Un défaut réel trouvé et corrigé : la justification en lot était cassée

**Symptôme** : `justifierEnLot` renvoyait HTTP 500 —
`malformed array literal: "a50b2e5d-…"` (`code 22P02`).

**Cause** : dans un template `sql` de Drizzle, un tableau JavaScript est **aplati
en paramètres séparés**. La requête `WHERE id = ANY(${absenceIds}::uuid[])`
recevait donc une chaîne nue au lieu d'un tableau PostgreSQL.

**Portée du défaut** : ce code venait de l'action serveur d'origine. La
justification en lot — le geste quotidien du surveillant qui couvre un certificat
médical de trois jours, soit douze à dix-huit absences — **ne fonctionnait pas non
plus depuis l'interface web**. Le défaut n'a été révélé que parce que la campagne
vérifie l'état réel en base, et pas seulement le code HTTP.

**Correction** : remplacement du SQL brut par le constructeur de requêtes Drizzle
(`inArray`), dans `web/src/server/domain/assiduite-ecritures.ts`. Comme l'action
serveur délègue désormais à ce même noyau, **l'écran web est réparé par la même
correction**.

**Vérification** : T26–T30 passent — statut effectivement `JUSTIFIEE` en base,
motif enregistré, auteur tracé, entrée d'audit écrite.

## 3. Le journal d'audit est immuable

Déclencheur **`audit_pas_de_update`** sur `journal_audit` : toute tentative de
`UPDATE` ou `DELETE` est rejetée (« Le journal d'audit est immuable : ni
modification ni suppression »).

C'est exactement la garantie attendue : une action de l'agent **ne peut pas être
effacée après coup**. Conséquence assumée — un compte de test ayant journalisé une
action ne peut plus être supprimé ; il est désactivé à la place.

Colonnes disponibles pour la traçabilité exigée au cahier des charges §6 :
`utilisateur_id`, `role_acteur`, `nom_acteur`, `action`, `entite`, `entite_id`,
`eleve_id`, `valeurs_avant`, `valeurs_apres`, `motif`, `adresse_ip`, `user_agent`,
`correlation_id`, `route_origine`, `methode_http`, `type_source`, `version_preuve`,
`cree_le`. L'essentiel du modèle d'audit demandé **existe déjà** ; l'agent doit
l'alimenter plutôt que créer un second journal.

## 4. Points de sécurité relevés (non corrigés, décision requise)

1. **Rôle de connexion** : l'application se connecte en `neondb_owner`
   (propriétaire). Un rôle restreint devrait suffire pour le service agent.
2. **Pas de branche de test Neon** : `neonctl` n'est pas authentifié (OAuth
   navigateur requis). Toute la campagne a donc tourné sur la base de production,
   avec des fixtures isolées. Une branche dédiée reste préférable.
3. **Notifications non déclenchées par l'API agent** : le noyau d'écriture ne
   rappelle pas `reveillerFile()` (seule l'action serveur le fait). Les
   notifications restent mises en file par le déclencheur SQL, mais leur envoi
   n'est pas accéléré. À traiter avant la mise en service WhatsApp.
