# Déploiement Vercel — notes

`vercel.json` n'accepte aucune clé de commentaire (`//`), d'où ce fichier.

## Région : `fra1` (Francfort)

Les fonctions serverless sont **co-localisées avec la base Neon** (`eu-central-1`).
Sans cette contrainte, Vercel place les fonctions dans sa région par défaut (`iad1`,
Washington) et chaque requête SQL traverse l'Atlantique deux fois.

Mesure réelle sur `/api/sante` : **1 672 ms** depuis un poste distant de la base,
contre quelques millisecondes une fois les deux dans la même région. Sur un écran
de saisie de notes qui enchaîne les requêtes, l'écart est décisif.

## Variables d'environnement

L'intégration officielle **Neon ↔ Vercel** fournit et fait tourner automatiquement :

| Variable | Usage |
|----------|-------|
| `DATABASE_URL` | Connexion **pooler** — utilisée par l'application |
| `DATABASE_URL_UNPOOLED` | Connexion **directe** — utilisée par les migrations |

Le code accepte aussi `DATABASE_URL_DIRECT` (nom employé en local), dans cet ordre :
`DATABASE_URL_UNPOOLED` → `DATABASE_URL_DIRECT` → `DATABASE_URL`.

À renseigner en plus, manuellement :

- `AUTH_SECRET`, `JWT_SECRET`
- `ETABLISSEMENT_NOM`, `ETABLISSEMENT_DEVISE`
- `FCM_*` et `SMS_*` quand l'application mobile arrivera

> **Attention** — remplacer les variables via un `PUT` sur l'API Vercel **écrase
> l'intégralité du jeu**. Toujours créer/modifier variable par variable (`POST`),
> sinon les secrets absents de la requête disparaissent silencieusement.

## Cron de réveil : indisponible en plan Hobby

Neon met son compute en veille après inactivité ; le premier appel coûte alors
~500 ms à 2 s. Un cron `*/10 * * * *` sur `/api/sante` masquerait ce réveil, mais
**le plan Hobby n'autorise qu'une exécution par jour** — le déploiement est
rejeté si l'expression tourne plus souvent.

Trois options :

1. **Ne rien faire** (retenu pour l'instant) — l'usage continu de 7h à 18h en
   semaine garde le compute éveillé naturellement. Seule la première connexion
   de la journée est lente.
2. Un service externe gratuit (cron-job.org, UptimeRobot) appelant `/api/sante`
   toutes les 10 minutes aux heures de classe.
3. Plan Pro.

## Déploiement automatique depuis GitHub

Non actif : l'intégration GitHub de Vercel exige une autorisation OAuth dans le
navigateur, impossible à installer par API. Tant qu'elle n'est pas connectée, les
déploiements se font par téléversement :

```bash
npx vercel deploy --prod
```

Pour l'activer : sur le projet Vercel → **Settings → Git → Connect Git Repository**
→ `faycalhabibahmatalbachar/guergne`, avec **Root Directory = `web`**.
Chaque `git push` déclenchera alors un déploiement.
