# Rapport de recette Communication V2

## Résumé exécutif
La base existante envoie depuis une table unique sans réservation atomique et traite l'acceptation du fournisseur comme un envoi. L'interface sous-estime le SMS, expose des numéros et ne permet pas d'expliquer les échecs. La V2 prépare une architecture sûre derrière un drapeau : simulation isolée, suspension globale, outbox réversible, aperçu transactionnel, budget, journal masqué et interface Gentelella. Aucun fournisseur, SMS, push, base de production ou déploiement n'a été activé.

| Critère | Avant | Après cette branche | Preuve / limite |
|---|---|---|---|
| K1 | cron quotidien et lignes possibles >15 min | santé et baux implémentés | pannes/reprise PASS ; SLA réel non certifié |
| K2 | erreur texte, trois essais fixes | catégories/actions et transitions | fournisseur réel non raccordé ; taux non mesuré |
| K3 | compteurs d'unités différentes | agrégats et invariant de charge | 5 000 lignes simulées, somme des états = total |
| K4 | audience après publication | aperçu classe/établissement avec canaux et coût | temps/clics navigateur non certifiés |
| K5 | 25 FCFA par ligne | segments, signature, XAF, budget verrouillé et confirmation | tests GSM-7/Unicode PASS ; écart facture réelle non mesuré |
| K6 | non mesuré | styles responsifs et clavier préparés | Lighthouse/axe/3G non exécutés faute de recette authentifiée |
| K7 | transitions partielles | transition, bail, doublon et désordre testés | 6/6 domaine + migrations PASS ; couverture % non instrumentée |
| K8 | baseline 153/154 tests | 159/160, typecheck PASS, diagnostics ciblés sans erreur | même échec Gmail préexistant ; build soumis à vérification locale |

## Déploiement de recette et retour arrière
1. Créer une branche de base jetable, jamais la production.
2. Exécuter `db/communication-v2/up.sql` puis les tests de `web/scripts/communication/test-migrations.mjs`.
3. Configurer `COMMUNICATION_V2=true`, `NOTIFICATIONS_SUSPENDUES=false`, `NOTIFICATIONS_MODE=simulation`. Ne fournir aucun secret SMS/FCM.
4. Exécuter les parcours, Lighthouse, axe et la charge ; conserver les preuves.
5. Pour revenir en arrière, retirer le drapeau puis exporter l'audit V2 et exécuter `db/communication-v2/down.sql`. Les anciennes notifications ne sont pas modifiées.

## Backlog bloquant avant production
- Export anonymisé des 922 échecs et rapprochement des factures ; aucune conclusion de cause ou de coût sans cela.
- Tests sur une branche Neon jetable, tests d'autorisation avec les rôles réels et E2E navigateur.
- Adaptateur fournisseur certifié, validation de signature webhook et plafond distribué.
- Pièces jointes, RSVP/sondages, fils parent-établissement, repli secondaire et automatisations P4/P5.
- Lighthouse mobile ≥85, accessibilité ≥95, 3G et RTL ; corriger toute régression avant demande de feu vert.
