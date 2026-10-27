# Audit et amélioration — Communication Gentelella v4

Date : 27 octobre 2026  
Application : Lycée Guergné La Renaissance  
Page : `/dashboard/communication`  
Périmètre : page serveur, interface React, actions serveur, domaine de lecture, file de notifications, politique de canaux, schéma et migrations.

## Cartographie du code

- `web/src/app/(main)/dashboard/communication/page.tsx` : session, rôle, permissions et données chargées pour la page.
- `web/src/app/(main)/dashboard/communication/_components/communication.tsx` : formulaires, tables, recherche/filtres, aperçu, confirmations, pagination locale et graphique.
- `web/src/app/(main)/dashboard/communication/actions.ts` : validation, publication, messages, bascule/épinglage et traitement manuel de la file.
- `web/src/server/domain/communication.ts` : lectures d’annonces, messages, notifications, audience disponible et agrégats.
- `web/src/server/domain/communication-plans.ts` et `web/src/lib/planification-notification.ts` : planification des canaux et estimation pure de la diffusion.
- `web/src/server/notifications/expediteur.ts` : réservation et traitement des SMS/push, retards et tentatives.
- `web/src/app/api/notifications/traiter/route.ts` : entrée cron protégée par secret ; elle n’est pas appelée par l’aperçu.
- `db/migrations/0007_communication.sql`, `0020_communication.sql` et `0036_communication_integrite_file.sql` : tables, diffusion, états de file et bail de réservation.
- Sources sous `web/src/vendor/gentelella-v4/` : helpers originaux `statTile()` et `statusBadge()`, styles dérivés des tokens/forms/tables et licence MIT conservée.

## Défauts établis pendant l’audit

1. Le compteur `EN_ATTENTE` incluait des notifications `IN_APP` qui ne sont pas des SMS/push à expédier. La base de production montrait 12 lignes internes en attente et aucune ligne SMS/push en attente ; ces volumes ne doivent pas être confondus.
2. La vue de file acceptait les canaux internes, alors que l’expéditeur ne sait traiter que PUSH/SMS. Une réservation atomique avec `FOR UPDATE SKIP LOCKED` et un bail explicite empêche deux workers de réserver simultanément la même ligne.
3. La diffusion d’annonces en base ne vérifiait pas systématiquement les classes actives ni la politique de canal configurée par l’établissement ; elle pouvait choisir push sans jeton actif ou tenter une ligne sans destinataire exploitable.
4. L’action de message ciblé forçait le canal PUSH, sans respecter la politique `AUTRE` ou estimer le coût d’un SMS.
5. Le serveur n’imposait pas de plafond confirmé pour l’audience/coût d’une diffusion payante.
6. L’action de lecture d’un message mettait à jour la ligne par UUID sans vérifier que le compte connecté était son destinataire.
7. La page était gardée uniquement par `annonce:publier`, ce qui bloquait les rôles du personnel autorisés à gérer leurs messages mais non les annonces. À l’inverse, le composant affichait certaines données/actions sans conditionner la lecture aux droits du rôle.
8. Le sélecteur d’élèves était limité à 500 alors que la base de production comptait 548 élèves actifs pour l’année. Le périmètre destiné aux enseignants doit être filtré côté serveur aux classes auxquelles ils sont affectés.

## Corrections implémentées dans le dépôt

- Vérification d’accès au back-office, onglets/actions et listes conditionnés par permissions.
- Pour les enseignants, liste d’élèves et de parents ciblée côté serveur sur leurs classes actives ; l’interface ne reçoit pas la liste globale des familles.
- Prévisualisation du canal, de l’audience, des segments et du coût SMS avant publication/enregistrement ; confirmation explicite des destinataires et du coût si des SMS sont prévus.
- Recalcul côté serveur et refus si l’audience ou le coût dépassent le plafond confirmé.
- Diffusion à partir du plan confirmé, respect de la politique en base, des consentements et des jetons actifs, filtrage des inscriptions/classes inactives.
- File sortante limitée aux SMS/push avec réservation atomique, libération du bail après traitement et reprise contrôlée des baux expirés.
- Compteurs de file et graphique séparant les canaux push/SMS ; les notifications internes restent visibles dans le journal, mais ne sont plus comptées comme envois sortants.
- Lecture des messages limitée au destinataire propriétaire de la ligne.
- Helpers officiels de présentation Gentelella `statTile()`/`statusBadge()` utilisés avec icônes SVG constantes et libellés échappés ; tables/forms reprennent les styles/tokens vendored et le graphique s’appuie sur Recharts déjà installé, sans données fictives.

## Recette et limites connues

- Tests unitaires ajoutés pour les combinaisons de politique de canal. Les résultats de typecheck, tests et build sont à vérifier sur le commit final.
- L’aperçu n’envoie ni SMS ni push. Aucun envoi réel n’a été effectué pendant l’audit.
- Les tables d’annonces/messages et le journal affichent les 100 éléments les plus récents chargés ; leur pagination est actuellement locale. Une pagination serveur avec curseur est encore recommandée avant une croissance importante de l’historique.
- Le graphique représente les volumes agrégés réels par canal/état ; il ne prétend pas représenter une courbe temporelle.
- Les interactions de production doivent encore être validées avec une session authentifiée représentative de chaque rôle. Un build sans erreur ne prouve pas, à lui seul, qu’un SMS réel arrivera ou qu’un parent utilisera l’application.
