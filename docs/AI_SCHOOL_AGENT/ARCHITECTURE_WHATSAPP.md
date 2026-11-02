# Architecture WhatsApp — passerelle et abstraction

Transport retenu : **`whatsapp-web.js`** (voir [DECISIONS_TECHNIQUES.md](DECISIONS_TECHNIQUES.md) DT-001).
Principe directeur : **l'agent ne connaît pas `whatsapp-web.js`**. Il parle à une
interface `WhatsAppProvider`, exactement comme `moov-ai/src/router.js` est déjà
« indépendant de WhatsApp » (`send(text)` / `send.to(jid, text)`, testable sans QR code).

---

## 1. Interface `WhatsAppProvider`

Contrat minimal, aligné sur les capacités réelles de `whatsapp-web.js` :

```
connect()                      → démarre la session (QR au 1er lancement, sinon LocalAuth)
disconnect()
getConnectionStatus()          → { state: 'qr'|'connecting'|'ready'|'disconnected' }
onMessage(handler)             → événement entrant normalisé (voir §2)
sendText(jid, text)
sendMedia(jid, {buffer, mimetype, filename, caption})
sendAudio(jid, {buffer})       → note vocale (ptt)
getMedia(message)              → télécharge le média d'un message entrant
reconnect()
```

Non garanti par `whatsapp-web.js` et donc **hors interface** (voir §4) : boutons/listes
interactifs natifs fiables. → repli **menus texte numérotés** (comme `moov-ai/src/menus.js`).

Un second adaptateur **`CloudApiProvider`** (WhatsApp Business Cloud API) implémentera le
même contrat, pour la bascule prévue en DT-001 sans toucher à l'agent.

## 2. Message entrant normalisé

Le provider traduit l'objet `whatsapp-web.js` en une forme stable, indépendante du transport :

```
{ id, fromJid, senderMsisdn, timestamp,
  kind: 'text'|'audio'|'image'|'document'|'video'|'location'|'contact',
  text?, media?: {mimetype, size, getBuffer()} }
```

L'agent ne manipule que cette forme. C'est aussi le point d'entrée de l'**idempotence**
(déduplication par `id`, brief §11) et du **journal d'audit** (brief §6).

## 3. Persistance de session et instance unique

Enseignements directs de `canalplus-whatsapp-bot/session-store.js` (lu) :

- **LocalAuth sur disque monté** (ex. `/app/.wwebjs_auth`), jamais un FS éphémère
  (brief §8/§9.2). Sur Northflank : volume persistant.
- **Nettoyage des lock files Chrome** (`SingletonLock`/`Cookie`/`Socket`) avant chaque
  `initialize()`, sinon redémarrage bloqué après crash/OOM.
- **Mémoire > 512 Mo** (OOM constaté). Chrome + Whisper demandent davantage.
- **Instance unique** : un même numéro ne doit pas tourner sur deux clients à la fois
  (bannissement quasi certain). → **verrou d'instance** (lock en base/Redis) et **un seul
  réplica actif** pour la passerelle (brief §8). Les workers d'automatisation, eux, peuvent
  scaler car ils ne tiennent pas la session WhatsApp.

## 4. Capacités et limites à vérifier (ne rien promettre sans test — brief §3.2)

| Capacité | Statut à tester |
|---|---|
| Texte entrant/sortant | ✅ standard |
| Note vocale entrante (STT) / sortante (TTS) | ✅ précédent `moov-ai` |
| Image / PDF / Word / Excel entrants | à tester (téléchargement + parsing) |
| Documents sortants (PDF/Excel générés par `guergne`) | à tester |
| **Boutons / listes interactifs** | ⚠️ support `whatsapp-web.js` instable → **repli menus numérotés** |
| Réactions, accusés de lecture | optionnel |

Tout élément interactif non garanti a un **fallback texte** obligatoire.

## 5. Place dans le système

```
WhatsApp  ──(whatsapp-web.js)──►  Passerelle (Node, 1 réplica, session sur volume)
                                        │  message normalisé (§2)
                                        ▼
                                   Agent (NLU + STT + planification + registre d'outils)
                                        │  appels d'outils métier (HTTP authentifié)
                                        ▼
                                   Backend guergne (API/domain/guard) ── source de vérité
                                        │
                                   Postgres Neon (données scolaires)

   Base opérationnelle de l'agent (liens identité, contexte, audit, idempotence, planif.)
```

La passerelle ne fait **que** le transport et la normalisation. Tout le raisonnement,
les permissions et l'exécution vivent dans l'agent et le backend — jamais dans la couche WhatsApp.
