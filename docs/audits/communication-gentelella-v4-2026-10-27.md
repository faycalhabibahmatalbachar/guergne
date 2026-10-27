# Communication — implémentation Gentelella v4

Date : 27 octobre 2026  
Application : Lycée Guergné La Renaissance

## Changements

- Utilisation des tokens et styles Gentelella v4.2.0 déjà présents dans le dépôt, sous le périmètre CSS .gentelella-v4; licence MIT du dossier vendor conservée.
- En-tête compact, indicateurs, recherche insensible aux accents, filtres d’état et pagination.
- Accès à la page aligné sur la permission de publication; file et journal réservés aux rôles avec notification:configurer.
- Vérification côté serveur de l’année, des classes, du niveau et des inscriptions avant publication ciblée.
- Vérification du compte parent actif et de son lien élève avant l’enregistrement d’un message ciblé; validation UUID et existence pour les actions sur les annonces.
- Estimation SMS par segments GSM-7/UCS-2, signature incluse.
- Traitement limité explicitement à 200 notifications par lot, reliquat signalé, numéros masqués dans le journal et détails techniques d’erreur gardés côté serveur.

## Limites de recette

- Annonces, messages et journal affichent la pagination des résultats chargés (100 annonces/messages ou notifications récentes au plus); une pagination serveur est nécessaire pour parcourir l’historique complet.
- Aucun SMS, push ou traitement de file n’est déclenché par cette implémentation.
- Le build doit être confirmé par la chaîne de déploiement. Une recette manuelle avec chaque rôle doit compléter la vérification technique.
