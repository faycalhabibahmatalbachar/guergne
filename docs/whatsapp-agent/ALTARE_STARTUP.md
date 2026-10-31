# Commande Startup Altare

Champ **Startup Command** du serveur `lycee-whatsapp-gateway` (identifiant `ba6c9bf3`).

---

## Commande à coller

```sh
export PUPPETEER_CACHE_DIR=/home/container/.cache/puppeteer; [ -d "$PUPPETEER_CACHE_DIR/chrome" ] || ./node_modules/.bin/puppeteer browsers install chrome; exec node /home/container/index.js
```

## Pourquoi cette forme exactement

**`export PUPPETEER_CACHE_DIR=/home/container/.cache/puppeteer`**
Le cache par défaut de Puppeteer vit dans le `$HOME` du conteneur, qui n'est pas
garanti persistant. En le plaçant sous `/home/container`, Chromium survit aux
redémarrages : on ne le retélécharge pas à chaque démarrage.

**`[ -d "$PUPPETEER_CACHE_DIR/chrome" ] || …`**
La commande est **idempotente** : l'installation ne se déclenche que si le
navigateur est réellement absent. Sans ce test, chaque redémarrage téléchargerait
~150 Mo et retarderait la reconnexion WhatsApp d'autant.

**`./node_modules/.bin/puppeteer browsers install chrome`**
C'est le binaire déjà présent dans les dépendances. Il n'exige pas de lever
`allowScripts` globalement — seul le téléchargement du navigateur est autorisé,
rien d'autre.

**`exec node /home/container/index.js`**
`exec` **remplace** le shell par Node plutôt que de le laisser comme parent.
Node devient donc PID 1 et reçoit directement `SIGTERM` : l'arrêt propre
(libération du verrou d'instance, fermeture de la session WhatsApp) fonctionne.
Sans `exec`, le signal irait au shell et Node serait tué brutalement — ce qui
laisserait un verrou périmé et des verrous Chrome à nettoyer.

Le dernier exécutable reste bien `node /home/container/index.js`, comme demandé.

## Ce qu'il ne faut pas faire

- **Ne pas revenir à `ts-node`.** L'application est du JavaScript ESM natif. La
  condition `[[ "${MAIN_FILE}" == "*.js" ]]` du script d'origine comparait
  littéralement à la chaîne `*.js` (guillemets), donc la branche Node n'était
  jamais prise.
- **Ne pas taper de commandes dans la console du serveur** : elle envoie le texte
  sur l'entrée standard du processus Node, ce n'est pas un shell.

## Variables à renseigner dans l'onglet Startup

| Variable | Rôle |
|---|---|
| `SCHOOL_API_BASE_URL` | URL du backend guergne |
| `AGENT_SERVICE_TOKEN` | jeton de service de l'API agent |
| `GROQ_API_KEY` | LLM **et** transcription Whisper |
| `MISTRAL_API_KEY` | repli LLM |
| `DONNEES_DIR` | `/home/container/donnees` (persistant) |

Le port n'est pas à renseigner : `index.js` lit `SERVER_PORT` (injecté par
Altare), puis `PORT`, puis 8080 par défaut, et écoute sur `0.0.0.0`.

## Vérifications après démarrage — à confirmer séparément

Un processus Node qui démarre ne prouve rien. À contrôler un par un :

1. modules chargés sans `ERR_MODULE_NOT_FOUND` ;
2. Chromium présent sous `/home/container/.cache/puppeteer/chrome` ;
3. serveur HTTP joignable sur le port alloué ;
4. `/sante` répond — il renvoie **503** tant que WhatsApp n'est pas prêt, c'est voulu ;
5. QR accessible de façon sécurisée, jamais dans les logs ;
6. session WhatsApp authentifiée après scan ;
7. **redémarrage sans nouveau scan** — c'est la preuve que `donnees/wwebjs_auth` persiste.
