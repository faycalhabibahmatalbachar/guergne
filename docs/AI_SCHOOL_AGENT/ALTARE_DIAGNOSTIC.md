# Diagnostic d'accès Altare

Dernière vérification : 31 octobre 2026.

---

## Rectificatif : la console est en ligne

Un premier diagnostic n'avait testé que `panel.altare.gg` (Cloudflare **521**) et
en avait conclu que l'infrastructure Altare était inaccessible. **C'était une
conclusion trop large.** La véritable console de gestion est
**`https://console.altare.gg`**, et elle **répond normalement**.

## Ce que la console révèle

| Constat | Valeur | Preuve |
|---|---|---|
| État | **en ligne**, redirige vers `/login?from=/` | page chargée |
| Logiciel | **Heliactyl Next 20.11.122** (`Copper Point`) | pied de page |
| Backend API | **même origine** (`console.altare.gg`) | `/config.json` → `apiBaseUrl: "/"` |
| CAPTCHA applicatif | **désactivé** | `/config.json` → `cap.enabled: false` |
| Discord OAuth | activé | `/config.json` → `discordOAuthEnabled: true` |

### Conséquence majeure : ce n'est pas Pterodactyl standard

Heliactyl Next est un espace client **distinct** de Pterodactyl. Les routes de
l'API Client Pterodactyl documentées dans le brief
(`/api/client/servers/{server}`, `/resources`, `/websocket`, `/power`) **ne
s'appliquent pas à cette console** — vérifié : dix chemins candidats
(`/api/user`, `/api/v5/user`, `/api/client/servers`, `/api/servers`, …)
renvoient tous **404**.

L'analyse du bundle frontend (401 Ko) donne les **routes de l'interface**
(`/server/{id}/console`, `/files`, `/network`, `/startup`, `/backups`,
`/snapshots`, `/schedules`, `/activity`…) et un préfixe d'appel `/admin/servers`.
Le point d'authentification vit dans un fragment chargé à la demande.

`panel.altare.gg` reste en 521 ; c'est probablement le Pterodactyl sous-jacent,
mais il est hors service et la console ne passe pas par lui côté navigateur.

## Le blocage réel, et lui seul

**Tout le reste exige une session authentifiée**, que je ne peux pas ouvrir :
aucun identifiant Altare n'existe dans l'environnement (vérifié : variables,
fichiers `.env`, dépôt entier), et je ne saisis pas de mot de passe à votre place.

Je n'ai contourné aucune authentification, ni touché aux cookies, ni résolu de
CAPTCHA.

## Intervention minimale — une seule action

**Connectez-vous à `https://console.altare.gg` dans le panneau navigateur de
cette session.** Le navigateur intégré conserve les sessions : une fois
connecté, je peux enchaîner sans autre intervention —

1. ouvrir `lycee-whatsapp-gateway` et relever son identifiant réel, son état et ses ressources ;
2. lire l'onglet **Network** : hôte et port SFTP, nom d'utilisateur `name.serverid` ;
3. lire l'onglet **Startup** : image, commande de démarrage, variables ;
4. créer une **clé API Client** (jamais une clé Application) si l'interface le permet ;
5. déposer les secrets dans un fichier local ignoré par git — **jamais dans la conversation** ;
6. tester l'API et le SFTP en lecture, puis déployer.

Le mot de passe SFTP est **global à l'équipe** : à traiter comme un secret à
privilèges élevés, donc à déposer dans le fichier local, pas à coller ici.

## Ce qui avance sans cet accès

La passerelle est écrite et testée hors ligne (66 tests) : provider
`whatsapp-web.js`, persistance de session, déduplication, verrou d'instance,
point d'entrée `index.js` et endpoint `/sante`. Seul l'hébergement attend la
console.
