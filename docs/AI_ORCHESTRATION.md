# Orchestration des outils

Comment une demande devient une ou plusieurs opérations. Code : `agent/src/plan.js` (contrat), `agent/src/engine.js` (`_traiter`, `_conduireOutil`, `_conduireMission`), `agent/src/mission.js`.

## Les quatre formes d'un plan

Le modèle rend un seul objet JSON :

| Forme | Quand | Ce que fait le moteur |
|---|---|---|
| `outil` | toute demande sur l'établissement — le cas normal | résolution → validation → permission → préparation → confirmation éventuelle → exécution → vérification → réponse |
| `outil` + `puis` | une consultation PUIS une action sur ce qu'elle liste (« les absents de 6e A, et préviens leurs parents ») | la consultation d'abord ; si elle aboutit, la suite repasse par TOUTE la chaîne, avec le foyer que la consultation vient de poser |
| `mission` | comparer ou cumuler plusieurs consultations indépendantes | chaque étape est résolue, préparée, exécutée ; un bilan chiffré est calculé par le code (`agreger`), jamais par le modèle |
| `conversation` / `clarifier` | salutation, question sur l'agent ; ou impossibilité de choisir | réponse directe, sans donnée scolaire |

## Règles qui tiennent l'orchestration

- **Une mission ne contient que des lectures.** Une écriture glissée dans une mission est refusée avant toute exécution.
- **Une mission d'une seule étape redevient un outil** : sinon l'utilisateur recevait un décompte (« 11 résultats ») au lieu de la réponse.
- **Un enchaînement n'est pas un raccourci.** La suite d'un `puis` est résolue, validée, autorisée, préparée et confirmée comme si elle avait été écrite seule. Un seul niveau d'enchaînement : pas de boucle possible.
- **Les résultats intermédiaires sont réutilisés.** La suite ne refait pas la recherche : elle reçoit `@eleves_du_resultat`, c'est-à-dire les élèves réellement listés. Leurs responsables sont, eux, relus au backend.
- **Rien n'est écrit avant le « oui »** quand l'outil l'exige : c'est vérifié en SQL dans chaque scénario d'écriture.
- **La confirmation porte l'empreinte de l'action exacte.** Autre message, autre acteur, délai dépassé : elle tombe (`confirmation.js`).
- **Une lecture en panne passagère est rejouée une fois** ; une écriture, jamais.
- **Bornes** : 8 étapes par mission, 80 élèves par notification de groupe, 100 lignes par lecture avec total annoncé.

## Exemple de bout en bout

« Donne-moi les élèves de 6e B qui ont des absences non justifiées entre le 1er et le 5 juin 2026 et préviens leurs parents qu'ils doivent les justifier »

1. Le modèle rend `assiduite.consulter_absences {classe:"6e B", statut:"NON_JUSTIFIEE", depuis, jusqua}` avec `puis: notifications.parents {eleves:"@eleves_du_resultat", message:…}`.
2. Le résolveur fait de « 6e B » l'identifiant de la 6ème B.
3. `listerAbsences` est appelé ; la liste est rendue à l'utilisateur.
4. Le foyer reçoit les élèves listés.
5. La suite démarre : `@eleves_du_resultat` devient ces élèves.
6. Leurs responsables sont relus (`tuteursDeLEleve`), dédoublonnés.
7. Le devis est demandé au backend : canaux disponibles, consentements SMS, coût.
8. Le récapitulatif est présenté : combien de destinataires, par quel canal, à quel coût, quel texte.
9. L'agent attend « oui ». Sur « non », rien n'est envoyé — vérifié.
10. Sur « oui », le backend met en file ; l'agent dit « mise en file », jamais « délivré ».

Ce parcours est le scénario `mt-13` du banc ; sa variante en plusieurs messages est `cv-01`.

## Ce que l'orchestration ne fait pas

- Pas d'écriture en lot décidée par le modèle : une écriture = une confirmation.
- Pas de boucle d'outils : le modèle est appelé une fois par message ; il ne voit pas les résultats et ne peut donc pas relancer.
- Pas de tri ni de calcul par le modèle : « classe-les par classe », « compare » sont faits par le code à partir des lignes lues.
