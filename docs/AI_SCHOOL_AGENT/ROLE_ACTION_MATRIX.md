# Matrice rôle × action (extraite du seed)

Source : `db/migrations/0009_seed_referentiel.sql`. **C'est la seule autorité.**
L'agent reflète cette matrice, il ne la définit pas.

78 actions × 9 rôles. SUPER_ADMIN détient tout (migration 0012).

| Action | SUPER_ADMIN | DIRECTION | CENSEUR | SURVEILLANT | SECRETARIAT | COMPTABLE | ENSEIGNANT | PARENT | ELEVE |
|---|---|---|---|---|---|---|---|---|---|
| `eleve:lire` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ *ses classes* | ✅ *ses enfants* | — |
| `eleve:creer` | ✅ | ✅ | — | — | ✅ | — | — | — | — |
| `eleve:modifier` | ✅ | ✅ | ✅ | — | ✅ | — | — | — | — |
| `eleve:inscrire` | — | — | — | — | ✅ | — | — | — | — |
| `eleve:reinscrire` | — | — | — | — | ✅ | — | — | — | — |
| `eleve:affecter` | — | — | — | — | ✅ | — | — | — | — |
| `eleve:transferer` | — | ✅ | — | — | ✅ | — | — | — | — |
| `eleve:suspendre` | — | ✅ | — | ✅ | — | — | — | — | — |
| `eleve:reactiver` | — | ✅ | — | — | — | — | — | — | — |
| `eleve:exclure` | — | ✅ | — | — | — | — | — | — | — |
| `tuteur:gerer` | — | — | — | — | ✅ | — | — | — | — |
| `tuteur:inviter` | — | — | — | — | ✅ | — | — | — | — |
| `piece:deposer` | — | — | — | — | ✅ | — | — | — | — |
| `import:executer` | — | — | — | — | ✅ | — | — | — | — |
| `classe:lire` | — | ✅ | ✅ | — | ✅ | — | — | — | — |
| `classe:creer` | — | ✅ | ✅ | — | — | — | — | — | — |
| `classe:modifier` | — | ✅ | ✅ | — | — | — | — | — | — |
| `matiere:gerer` | — | — | ✅ | — | — | — | — | — | — |
| `coefficient:gerer` | — | — | ✅ | — | — | — | — | — | — |
| `affectation:gerer` | — | — | ✅ | — | — | — | — | — | — |
| `emploi_du_temps:lire` | — | — | — | — | — | — | — | ✅ *ses enfants* | ✅ *ses enfants* |
| `emploi_du_temps:gerer` | — | — | ✅ | — | — | — | — | — | — |
| `calendrier:gerer` | — | — | ✅ | — | — | — | — | — | — |
| `evaluation:creer` | — | — | — | — | — | — | ✅ *ses classes* | — | — |
| `evaluation:modifier` | — | — | — | — | — | — | ✅ *ses classes* | — | — |
| `evaluation:lire` | — | — | ✅ | — | — | — | — | — | — |
| `note:lire` | ✅ | ✅ | ✅ | — | — | — | ✅ *ses classes* | ✅ *ses enfants* | ✅ *ses enfants* |
| `note:saisir` | — | — | — | — | — | — | ✅ *ses classes* | — | — |
| `note:modifier` | — | — | — | — | — | — | ✅ *ses classes* | — | — |
| `appreciation:saisir` | — | — | — | — | — | — | ✅ *ses classes* | — | — |
| `periode:verrouiller` | — | ✅ | ✅ | — | — | — | — | — | — |
| `periode:deverrouiller` | — | ✅ | — | — | — | — | — | — | — |
| `bulletin:lire` | ✅ | ✅ | ✅ | — | ✅ | — | ✅ *ses classes* | ✅ *ses enfants* | ✅ *ses enfants* |
| `bulletin:generer` | — | ✅ | ✅ | — | — | — | — | — | — |
| `bulletin:publier` | — | ✅ | — | — | — | — | — | — | — |
| `bulletin:telecharger` | — | — | — | — | — | — | — | ✅ *ses enfants* | — |
| `conseil_classe:tenir` | — | ✅ | ✅ | — | — | — | — | — | — |
| `conseil_classe:valider` | — | ✅ | ✅ | — | — | — | — | — | — |
| `decision:prononcer` | — | ✅ | — | — | — | — | — | — | — |
| `assiduite:lire` | — | ✅ | ✅ | ✅ | ✅ | — | — | ✅ *ses enfants* | ✅ *ses enfants* |
| `assiduite:saisir` | — | — | — | ✅ | — | — | ✅ *ses classes* | — | — |
| `assiduite:justifier` | — | — | — | ✅ | ✅ | — | — | — | — |
| `retard:saisir` | — | — | — | ✅ | — | — | — | — | — |
| `sortie:autoriser` | — | — | — | ✅ | — | — | — | — | — |
| `discipline:lire` | — | ✅ | ✅ | ✅ | — | — | — | ✅ *ses enfants* | — |
| `discipline:signaler` | — | — | — | ✅ | — | — | ✅ *ses classes* | — | — |
| `discipline:sanctionner` | — | ✅ | — | ✅ | — | — | — | — | — |
| `conduite:noter` | — | — | — | ✅ | — | — | — | — | — |
| `conseil_discipline:convoquer` | — | ✅ | — | — | — | — | — | — | — |
| `devoir:lire` | — | — | — | — | — | — | — | ✅ *ses enfants* | ✅ *ses enfants* |
| `devoir:publier` | — | — | — | — | — | — | ✅ *ses classes* | — | — |
| `ressource:lire` | — | — | — | — | — | — | — | ✅ *ses enfants* | ✅ *ses enfants* |
| `ressource:publier` | — | — | — | — | — | — | ✅ *ses classes* | — | — |
| `seance:saisir` | — | — | — | — | — | — | ✅ *ses classes* | — | — |
| `finance:lire` | ✅ | ✅ | — | — | — | ✅ | — | ✅ *ses enfants* | — |
| `finance:encaisser` | — | — | — | — | — | ✅ | — | — | — |
| `finance:configurer` | — | ✅ | — | — | — | ✅ | — | — | — |
| `finance:exonerer` | — | ✅ | — | — | — | — | — | — | — |
| `finance:relancer` | — | — | — | — | — | ✅ | — | — | — |
| `finance:exporter` | — | — | — | — | — | ✅ | — | — | — |
| `recu:emettre` | — | — | — | — | — | ✅ | — | — | — |
| `notification:configurer` | — | — | — | — | — | — | — | — | — |
| `annonce:lire` | — | — | — | — | — | — | — | ✅ *ses enfants* | ✅ *ses enfants* |
| `annonce:publier` | — | ✅ | ✅ | — | ✅ | — | — | — | — |
| `message:lire` | — | — | — | — | — | — | — | ✅ *ses enfants* | — |
| `message:envoyer` | — | ✅ | ✅ | ✅ | — | ✅ | ✅ *ses classes* | ✅ *ses enfants* | — |
| `convocation:emettre` | — | ✅ | — | ✅ | — | — | — | — | — |
| `document:emettre` | — | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| `statistique:lire` | — | ✅ | ✅ | — | — | ✅ | — | — | — |
| `audit:lire` | ✅ | ✅ | — | — | — | — | — | — | — |
| `systeme:administrer` | ✅ | — | — | — | — | — | — | — | — |
| `utilisateur:creer` | ✅ | ✅ | — | — | — | — | — | — | — |
| `utilisateur:modifier` | ✅ | — | — | — | — | — | — | — | — |
| `utilisateur:desactiver` | ✅ | ✅ | — | — | — | — | — | — | — |
| `permission:gerer` | ✅ | — | — | — | — | — | — | — | — |
| `parametre:modifier` | ✅ | — | — | — | — | — | — | — | — |
| `sauvegarde:executer` | ✅ | — | — | — | — | — | — | — | — |
| `annee:cloturer` | — | ✅ | — | — | — | — | — | — | — |

**Légende** : ✅ autorisé · *ses classes* / *ses enfants* = portée restreinte, vérifiée
côté `guergne` uniquement · — non autorisé.
