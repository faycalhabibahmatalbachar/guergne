# Benchmark fonctionnel clean-room
Consultation : 26 octobre 2026. Sources publiques, reformulation indépendante. Aucune connexion, décompilation, copie d'interface ou de code. « Non étudié » ne signifie pas « absent ». Ce benchmark ciblé ne constitue pas une comparaison exhaustive des offres commerciales.

| Système | Comportements établis par source primaire | Décision pour le lycée / effort |
|---|---|---|
| PRONOTE | Informations ciblées, sondages et accusés explicites ; vues des retours | Adopter accusé distinct de la livraison et dénominateur par famille ; moyen |
| ParentSquare | Notifications multicanal, traduction et suivi réception/engagement ; alertes planifiables avec repli vocal dans le produit | Adapter FR/AR rédigés et vérifiés, repli SMS tenant compte du consentement. Écarter appels vocaux pour ce lot ; moyen/élevé |
| Remind | Échanges bidirectionnels, préférences et heures de disponibilité | Adopter plages de contact et réponses modérées ; moyen |
| Moodle 4.5 | Messages privés, contrôles administrateur et rôle de modération | Adapter matrice de permissions et signalement ; moyen |
| Gibbon | Audience issue des classes/groupes, email/SMS/Message Wall, pièces jointes | Adopter une résolution d'audience partagée entre aperçu et publication ; moyen |
| Google Classroom | Résumés pour les responsables, activités scolaires plutôt qu'un détail permanent de chaque événement | Adapter un récapitulatif facultatif, écarter l'obligation de compte Google ; moyen |
| Canvas | Publication différée, dates de disponibilité et options de réponses | Adopter programmation/expiration explicites ; moyen |
| Twilio (transport) | Acceptation, envoi, délivrance et erreurs distincts via callbacks ; segments facturés | Adopter séparation accepté/délivré/lu, référence fournisseur, rapprochement coûts ; élevé |
| EcoleDirecte | Sources primaires détaillées non suffisamment étudiées | Ne rien déduire de non vérifié ; recherche complémentaire au backlog |
| PowerSchool / Infinite Campus / Skyward | Non étudiés dans ce lot | Éviter une matrice inventée ; backlog si besoin fonctionnel non couvert |
| ClassDojo / SchoolMessenger / Seesaw | Non étudiés dans ce lot | Même règle |
| Schoology / ManageBac / Toddle / Veracross | Non étudiés dans ce lot | Même règle |
| openSIS / Frappe Education | Non étudiés dans ce lot | Ne pas importer de code sans audit de licence |

## Matrice capacités × sources établies
D = documenté dans la source consultée ; ? = non établi (aucune conclusion négative).
| Capacité | PRONOTE | ParentSquare | Remind | Moodle | Gibbon | Classroom | Canvas | Twilio |
|---|---|---|---|---|---|---|---|---|
| Audience ciblée | D | D | D | D | D | D | D | ? |
| Accusé explicite | D | ? | ? | ? | ? | ? | ? | ? |
| Traduction/langues | ? | D | D | ? | ? | ? | ? | ? |
| Modération/permissions | ? | ? | D | D | ? | ? | D | ? |
| Programmation | ? | D | ? | ? | ? | ? | D | ? |
| SMS / multicanal | ? | D | D | ? | D | ? | ? | D |
| Coût par segment/callback | ? | ? | ? | ? | ? | ? | ? | D |

## Sources
- PRONOTE : https://doc.index-education.com/fr/pronote/direction/Communication/Informations_sondages.htm
- Accusés PRONOTE : https://docs.index-education.com/docs_fr/fr-pronote-support-fiche-899-3512-consulter-les-accuses-de-reception-d-une-information.php
- ParentSquare : https://www.parentsquare.com/platform/mass-notifications/
- Alertes ParentSquare : https://www.parentsquare.com/blog/using-parentsquare-during-testing-season/
- Remind : https://www.remind.com/resources/teacher-onboarding-guide et https://www.remind.com/resources/remote-learning
- Moodle : https://docs.moodle.org/405/en/Using_Messaging
- Gibbon : https://gibbonedu.org/features/other/messenger et https://docs.gibbonedu.org/guides/modules/messenger/messenger
- Classroom : https://support.google.com/edu/classroom/answer/6388136?hl=en
- Canvas : https://community.instructure.com/en/kb/articles/660643-how-do-i-add-an-announcement-in-a-course
- Twilio : https://www.twilio.com/docs/messaging/guides/outbound-message-status-in-status-callbacks et https://www.twilio.com/docs/messaging/api/message-resource

## Exigences dérivées indépendamment
1. Une information visible dans l'application n'est pas la preuve d'une notification ni d'une lecture.
2. Résoudre les familles à partir des liens du système scolaire ; confirmer audience et coûts avant action.
3. Séparer l'urgence d'un récapitulatif ; ne jamais contourner consentement et contrôle des rôles.
4. Un fournisseur accepté doit être rapproché avec un accusé avant d'affirmer la délivrance.
5. Français et arabe avec RTL, pas de traduction automatique non vérifiée d'une sanction.
6. Adapter les mécanismes au coût SMS et aux familles sans compte ; aucune dépendance à un service payant ajouté.
