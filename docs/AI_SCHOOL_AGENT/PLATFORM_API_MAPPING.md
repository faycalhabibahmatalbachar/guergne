# Cartographie des routes d'API

**28 routes** relevées sous `web/src/app/api`, avec les méthodes HTTP
réellement exportées et les permissions exigées.

| Route | Méthodes | Permissions |
|---|---|---|
| `/api/agent/[action]` | POST | — |
| `/api/bulletins/[inscriptionId]/[periodeId]` | GET | `bulletin:lire` |
| `/api/bulletins/conseil-orientation/[classeId]` | GET | `bulletin:lire` |
| `/api/bulletins/impression` | POST | `bulletin:lire` |
| `/api/documents/[type]/[id]` | GET | `document:emettre` |
| `/api/eleves/gabarit` | GET | `eleve:inscrire` |
| `/api/emploi-du-temps/[vue]/[id]` | GET | `emploi_du_temps:lire` |
| `/api/export/[liste]` | GET | — |
| `/api/export/comptable` | GET | `finance:exporter` |
| `/api/fichiers/[id]` | GET | — |
| `/api/identite/icone/[taille]` | GET | — |
| `/api/mobile/activation` | POST | — |
| `/api/mobile/annonces/[id]/lue` | POST | — |
| `/api/mobile/appareil` | POST | — |
| `/api/mobile/enfants` | GET | — |
| `/api/mobile/enfants/[id]/assiduite` | GET | — |
| `/api/mobile/enfants/[id]/bulletins` | GET | — |
| `/api/mobile/enfants/[id]/bulletins/[periodeId]/pdf` | GET | — |
| `/api/mobile/enfants/[id]/emploi-du-temps` | GET | — |
| `/api/mobile/enfants/[id]/finances` | GET | — |
| `/api/mobile/enfants/[id]/notes` | GET | — |
| `/api/mobile/enfants/[id]/photo` | GET | — |
| `/api/mobile/session` | POST, DELETE | — |
| `/api/mobile/session/rafraichir` | POST | — |
| `/api/notes/gabarit/[evaluationId]` | GET | `note:saisir` |
| `/api/notifications/traiter` | — | — |
| `/api/personnel/gabarit` | GET | `utilisateur:creer` |
| `/api/sante` | GET | — |

> Une route sans permission affichée applique soit un contrôle d'un autre type
> (jeton de service, secret de cron, session mobile), soit aucun — à vérifier au cas par cas.
