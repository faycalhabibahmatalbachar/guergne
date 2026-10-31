# Diagnostic d'accès Altare — P0

Relevé du 31 octobre 2026, 17:56 UTC. **Résultat : accès BLOQUÉ**, pour deux
causes indépendantes, l'une et l'autre vérifiées et non supposées.

---

## 1. Aucun identifiant Altare n'existe dans l'environnement

Recherche exhaustive, sans afficher aucune valeur :

| Source | Résultat |
|---|---|
| Variables d'environnement (`altare`, `pterodactyl`, `sftp`) | **aucune** |
| `ai_apikey.env` | seulement `grok_api`, `mistral_ai` |
| `web/.env.local` | aucune variable Altare |
| Dépôt entier (`*.env`, `*.json`, `*.md`, `*.ts`, `*.mjs`) | **aucune mention** d'Altare ni de Pterodactyl |

Il n'existe donc ni `ALTARE_CLIENT_API_TOKEN`, ni identifiants SFTP, ni URL de
panneau configurée. Ces noms de variables figuraient dans le brief comme des
propositions, et le brief précisait de ne pas les supposer existantes : la
vérification confirme qu'elles n'existent pas.

## 2. Le panneau Altare est hors service

`https://panel.altare.gg` → **Cloudflare 521, « Web server is down »**
(Ray ID `a5348a02088568db`, 2026-10-31 17:56:54 UTC). Cloudflare répond, mais le
serveur d'origine ne renvoie aucune connexion.

En revanche `https://altare.gg` et son centre d'aide **répondent normalement** :
la panne est limitée au panneau, elle n'est pas générale.

Conséquence : même avec des identifiants, l'API Client Pterodactyl
(`/api/client/servers/{server}`, `/resources`, `/websocket`, `/power`) et la
page de gestion des clés (`/account/api`) sont injoignables tant que l'origine
ne répond pas.

## 3. Ce que dit la documentation officielle

D'après `altare.gg/en/help/getting-started/connect-with-sftp` :

| Élément | Où l'obtenir |
|---|---|
| Hôte et port SFTP | **dans la console du serveur** |
| Nom d'utilisateur | `name.serverid`, propre à chaque serveur, **dans la console** |
| Mot de passe | **mot de passe SFTP global de l'équipe**, dans les réglages d'équipe |

Les trois s'obtiennent uniquement depuis le panneau — celui qui est en 521.
Le blocage est donc **double** : pas d'identifiants, et pas de panneau pour les lire.

> Note : `se-kna02.altare.global:25278` est l'adresse applicative affichée du
> serveur. Ce n'est **pas** le point d'entrée SFTP, et la documentation ne permet
> pas de le déduire. Je ne l'ai pas supposé.

## 4. Ce qui reste vrai et exploitable

- Le dépôt est sain : branche `ai-school-agent-p0-audit`, commit `6fa71d2`,
  synchronisée avec `origin`, rien en attente.
- Le backend scolaire, l'API agent, la branche Neon de test et la couche IA
  (Groq + Mistral validés) fonctionnent et sont testés — voir les autres documents.
- La passerelle WhatsApp peut être **écrite et testée en local** sans Altare :
  seul son hébergement en dépend.

## 5. Intervention minimale requise

Pour débloquer, dans cet ordre :

1. **Attendre le rétablissement de `panel.altare.gg`** (panne côté hébergeur, rien
   à faire de notre côté ; la page d'état ou le support Altare renseignera).
2. Une fois le panneau accessible, y relever **trois informations** depuis la page
   Network/SFTP du serveur `lycee-whatsapp-gateway` : **hôte SFTP, port SFTP,
   nom d'utilisateur** (`name.serverid`).
3. Le **mot de passe SFTP d'équipe** (réglages d'équipe) — à déposer dans un
   fichier local ignoré par git, jamais collé dans un message.
4. Optionnellement, créer une **clé Client API** (jamais une clé Application ou
   administrateur) pour piloter démarrage/arrêt/logs par script.

Tant que ces éléments manquent, aucun transfert ni déploiement n'est possible, et
je ne présenterai aucun déploiement comme effectué.
