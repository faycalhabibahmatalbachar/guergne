# Environnement de test Neon

Projet `lycee-renaissance` (`nameless-paper-99746597`), PostgreSQL 17,
AWS Europe Central 1 (Francfort), forfait Free.

---

## 1. Nettoyage du quota (10 branches, limite atteinte)

Le forfait gratuit plafonne à 10 branches et le quota était saturé, ce qui
empêchait la création d'une branche de test.

**Méthode** : pour chacune des 8 branches `preview/*`, j'ai retrouvé la branche
Git correspondante **et l'état de sa pull request**. Les huit correspondaient à
des PR **fusionnées** les 20 et 21 octobre 2026 — leur code est dans `main`, les
environnements de preview n'avaient plus d'objet.

| Branche Neon supprimée | PR | Fusionnée le |
|---|---|---|
| `preview/feat/guergne-eleves-ui-production` | #7 | 2026-10-20 |
| `preview/feat/eleves-avatars-illustres` | #8 | 2026-10-20 |
| `preview/feat/eleves-header-footer-ux` | #9 | 2026-10-20 |
| `preview/fix/eleves-deplacement-actions-lot` | #10 | 2026-10-21 |
| `preview/feat/guergne-eleve-details-ui` | #11 | 2026-10-21 |
| `preview/fix/dossier-eleve-hierarchy-layout-v2` | #12 | 2026-10-21 |
| `preview/feat/dossier-header-maquette-photo-circulaire` | #13 | 2026-10-21 |
| `preview/feat/dossier-ensemble-redesign-v3` | #14 | 2026-10-21 |

**Conservées** : `main` (jamais touchée), `test-0036-calendrier-27oct2026`
(plus récente, utilité non établie comme terminée), et
`preview/codex/p0-horaires-profils-grille` (créée le jour même, donc active).

## 2. Branche de test

| | |
|---|---|
| Nom | `ai-school-agent-test` |
| ID | `br-calm-art-b18uihy2` |
| Parent | `main` (`br-red-waterfall-b1ajf6iu`) |
| Données | copie à l'identique : 549 élèves, 2 720 absences, 2 236 retards |

## 3. Isolation vérifiée, pas supposée

Un enregistrement de contrôle a été inséré **sur la branche de test**, puis
compté des deux côtés :

```
eleves 'ISOLATION' sur TEST       : 1
eleves 'ISOLATION' en PRODUCTION  : 0
```

L'écriture ne traverse pas. Le contrôle a ensuite été supprimé.

## 4. Bascule du serveur vers la branche de test

Next.js donne la priorité à `.env.development.local` sur `.env.local`. Un fichier
`web/.env.development.local` (ignoré par git) y redirige `DATABASE_URL` et
`DATABASE_URL_DIRECT`.

**Pour revenir à la production : supprimer ce fichier.** Rien d'autre n'est modifié,
et `web/.env.local` n'a pas été touché.

La chaîne de connexion de la branche de test vit dans `web/.env.test.local`
(également ignoré). Aucune valeur n'a jamais été affichée ni passée en argument
de commande.

## 5. Campagne exécutée sur la branche isolée

**42/42 tests** (voir [CRUD_TEST_RESULTS.md](CRUD_TEST_RESULTS.md) et
[RBAC_TEST_RESULTS.md](RBAC_TEST_RESULTS.md)).

Vérification après coup, des deux côtés :

| | Production | Branche de test |
|---|---|---|
| élèves | 549 | 549 |
| absences | 2 720 | 2 720 |
| fixtures `ZZTEST%` | 3 *(antérieures, désactivées)* | 4 |

La fixture du nouveau cycle n'existe **que** sur la branche de test : la
production n'a rien reçu.

## 6. Points ouverts

- Le rôle de connexion reste `neondb_owner`. Un rôle restreint devrait être créé
  pour le service agent (écriture limitée aux tables métier, pas de DDL).
- La branche de test hérite des déclencheurs de notification. Comme elle est
  isolée et que la passerelle SMS est désactivée, aucune file de production n'est
  alimentée — mais un adaptateur de notification simulé reste préférable à terme.
