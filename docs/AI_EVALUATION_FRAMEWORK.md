# Banc d'essai conversationnel

Le banc dialogue avec le véritable agent, sans WhatsApp, et juge ses réponses contre la base. Code : `agent/banc/`.

## Ce qui est réel

| Composant | Dans le banc |
|---|---|
| Moteur (`Agent`), registre, permissions, politiques | **réel** |
| Interprète, invite assemblée, résolveur, mémoire | **réel** — construits comme dans `app.js` |
| Modèle de langage | **réel** — même `MoteurIA`, même ordre de fournisseurs, clés de `ai_apikey.env` |
| Backend | **réel** — `next dev` local, API `/api/agent`, gardes, actions serveur |
| Base | **réelle** — la branche Neon de TEST |
| Transport WhatsApp | remplacé par `FakeProvider` |
| Identité | un acteur de la base de test, posé d'office |

Aucune réponse du modèle n'est fabriquée. Les tests unitaires (`npm test`), eux, remplacent le modèle : ils fixent le comportement du code, pas l'intelligence. Les deux ne se confondent jamais dans les rapports.

## Mettre en route

1. Backend de recette, sur la base de test, écritures allumées, SMS et push neutralisés :

```bash
cd web && AGENT_ECRITURES_ACTIVES=true SMS_API_URL= SMS_API_KEY= FCM_PROJECT_ID= FCM_CLIENT_EMAIL= FCM_PRIVATE_KEY= npx next dev -p 3100
```

2. Depuis `agent/` :

| Commande | Effet |
|---|---|
| `npm run agent:evaluate` | campagne complète, rapport dans `banc/rapports/campagne.{json,md}` |
| `npm run agent:evaluate:reprendre` | reprend une campagne interrompue sans rejouer ce qui est mesuré |
| `node banc/lancer.mjs --etiquette v2 --filtre assiduite,mt-` | un domaine, un préfixe d'identifiant ou une étiquette |
| `node banc/lancer.mjs --etiquette v3 --rejouer banc/rapports/v2.json` | les seuls scénarios non réussis d'une campagne |
| `npm run agent:parler -- "les absents de 6e A" "et les retards ?"` | une conversation à la main, avec la trace |
| `node banc/invite.mjs "…"` | l'invite exactement envoyée au modèle |
| `npm run agent:memoire` | l'épreuve de la mémoire durable (redémarrages) |
| `npm run agent:catalogue -- banc/rapports/<campagne>.json` | régénère `docs/AI_CAPABILITY_CATALOG.md` |
| `BANC_MEMOIRE=non BANC_SANS_EXTENSIONS=oui node banc/lancer.mjs …` | le moteur sans résolveur ni mémoire : la référence |
| `BANC_ROLE=SURVEILLANT npm run agent:parler -- "…"` | parler sous un autre rôle |

## Verrous

Le banc refuse de démarrer si le backend n'est pas `localhost`, ou si la base est la branche de production (`br-red-waterfall-b1ajf6iu`). Il vérifie la branche par `current_setting('neon.branch_id')`, pas par une variable.

## Données

- **Lectures** : la base de test telle qu'elle est (549 élèves, 15 classes, homonymes réels).
- **Écritures** : uniquement des données de synthèse marquées `BANCIA` (`banc/synthese.mjs`) — classes « Banc Zeta » et « Banc Omega », quatre élèves, téléphones de la plage fictive `+33 1 99 00 12 5x` vérifiés libres avant usage, un surveillant sans connexion possible. Créées par le backend, retirées à la fin par marque et par identifiant. Le journal d'audit est conservé.
- **Notifications** : seuls les parents de synthèse reçoivent une mise en file ; les scénarios qui visent des parents de la base s'arrêtent au devis et répondent « non ».

## Un scénario

```js
{
  id: "as-02", domaine: "assiduite", capacites: ["assiduite.consulter_absences"],
  tours: [{
    dit: "Liste les absences non justifiées de 6e A",
    outil: "assiduite.consulter_absences",          // compréhension
    issue: "repond",                                 // répond | clarifie | confirme | annule | echec | refuse
    appel: { action: "listerAbsences",               // résolution des entités, exécution
             params: (p, f) => p.classeId === f.classes["6A"].id || "classe attendue : 6A" },
    contient: [(f) => f.nombre(f.absences["6A"].nonj)],  // exactitude, contre l'oracle
    absent: [/— .*, justifiée/],
    apres: async ({ q, f }) => null,                 // état réel, relu en SQL (écritures)
  }],
}
```

`f` est l'oracle (`banc/faits.mjs`) : des faits lus en SQL directement dans la base, sans passer par l'agent ni par le backend. Un scénario ne compare jamais la réponse à ce que l'agent a lu.

Options : `role` (acteur), `synthese: true` (données de synthèse requises), `sabotage` (pannes injectées sur le client backend), `attendreMs` entre deux tours (péremption du contexte).

## Ce qui est jugé

| Catégorie | Question |
|---|---|
| compréhension | l'intention et l'outil sont-ils les bons ? |
| résolution | les entités nommées sont-elles devenues les bons identifiants ? |
| exécution | l'appel backend a-t-il abouti ? |
| réponse | ce qui est répondu est-il juste, comparé à l'oracle ? |
| clarification | une question a-t-elle été posée alors que la demande suffisait ? |
| hygiène | un UUID, un nom de paramètre, `undefined` sont-ils montrés ? |
| vérité | ce qui est annoncé fait est-il fait, relu en SQL ? |
| fausse réussite | une réussite est-elle annoncée que la base dément ? |

Un scénario est **réussi** si tous ses contrôles passent ; **échoué** si la compréhension du premier tour est fausse ou si rien ne passe ; **partiel** sinon. Les fausses réussites et les contournements de droits sont comptés à part : ils ne se diluent pas dans une moyenne.

## Ce qui est enregistré

`banc/rapports/<etiquette>.json` garde, pour chaque tour : le message, la réponse, l'intention, l'outil, chaque appel backend (action, paramètres, issue, durée), les appels au modèle (jetons, durée, fournisseur), la durée totale, et chaque contrôle avec son détail. Le `.md` en est le résumé lisible. Ces fichiers contiennent des données de la base de test : ils ne sont pas versionnés (`.gitignore`).

## Limites du banc

- Le modèle n'est pas déterministe : une même demande peut être comprise différemment d'une campagne à l'autre. Un scénario qui oscille est un défaut de robustesse, pas un bruit à ignorer.
- La date du jour (novembre 2026) est postérieure à l'année scolaire de la base de test (2025-2026) : « aujourd'hui » et « cette semaine » rendent des listes vides. Les scénarios datés vérifient donc l'intervalle demandé, pas le nombre de lignes.
- La voix n'est pas éprouvée ici : les scénarios « vocal » imitent une transcription, ils ne passent pas par Whisper.
- Le transport WhatsApp réel n'est pas dans le banc.
