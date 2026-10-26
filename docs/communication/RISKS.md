# Risques et limites
- Les 922 échecs sont une observation du propriétaire, pas une mesure de cette session. Aucun export anonymisé disponible au démarrage.
- Pas de PostgreSQL ni de Docker trouvés dans PATH au démarrage : validation migrations à établir sur base jetable ; ne jamais utiliser une URL de production.
- K1/K2/K5 nécessitent des mesures opérationnelles après autorisation ultérieure ; une simulation ne prouve pas la délivrance réelle.
- Les tests de référence présentent déjà des échecs ; comparer avant/après, ne pas les effacer.
- La V2 n'est pas raccordée au fournisseur réel. Les statuts ACCEPTED des essais signifient seulement « accepté par le simulateur » et portent `simulated=true`.
- Le schéma V2 a été validé avec PGlite, proche de PostgreSQL. Une validation sur une branche Neon jetable reste requise avant toute preview partagée.
- Lighthouse/axe, la navigation authentifiée et la 3G n'ont pas pu être certifiés sans base de recette et compte de test. K6 reste non certifié.
- Le test complet conserve un échec préexistant du gabarit Gmail : 159/160 passent, contre 153/154 avant cette branche. Ce lot ne doit pas masquer ni réécrire ce test sans traiter son module.
- La protection contre le débit V2 limite un auteur à cinq campagnes par minute ; une limite distribuée par fournisseur devra être ajoutée lors du raccordement réel.
