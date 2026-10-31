# Inventaire WhatsApp — précédents réels

Objet : recenser ce qui existe **déjà et fonctionne** en matière d'intégration
WhatsApp sur le compte, avec preuves, pour décider quoi réutiliser.

---

## 1. Synthèse

| Dépôt | État | Transport WhatsApp | Voix | Session | Infra |
|---|---|---|---|---|---|
| `moov-ai` | **Implémentation fonctionnelle** | `whatsapp-web.js` | Whisper (STT) + Piper/msedge-tts (TTS) + ffmpeg | QR / LocalAuth | Dockerfile, Dockerfile.hf (HuggingFace), Oracle |
| `canalplus-whatsapp-bot` | **Implémentation fonctionnelle** | `whatsapp-web.js` (commit épinglé) | msedge-tts + ffmpeg | `session-store.js` (disque) | `northflank/`, railway.toml, render.yaml |
| `toumai-whatsapp-calling` | **Docs seulement** | — (spécification) | — | — | .circleci, .github |

**Aucun dépôt n'utilise Baileys ni wa-automate.** La description de `canalplus-whatsapp-bot`
(« wa-automate-nodejs v4.76.0 ») est **obsolète** : le `package.json` réel déclare
`whatsapp-web.js`.

---

## 2. `moov-ai` — le précédent architectural de référence

Description GitHub : « Moov AI - Moov Money Tchad sur WhatsApp (Agent + Client),
Postgres + AI multi-providers ». C'est, de tout le compte, l'architecture la plus
proche de la cible School AI Agent.

**Dépendances réelles** (`package.json`) :
`whatsapp-web.js` (github:pedroslopez/whatsapp-web.js), `express` 4.19.2, `pg` 8.21
(Postgres), `axios`, `ffmpeg-static` 5.2 (traitement audio), `msedge-tts` 1.3
(synthèse vocale), `qrcode` 1.5 (connexion), `pino` 9.5 (logs structurés),
`bcryptjs`, `dotenv`.

**Structure `src/`** : `config.js`, `db.js`, `engine.js`, `router.js`, `security.js`,
`validate.js`, `menus.js`, `i18n.js`, `flows/`, `services/`. → Séparation nette
raisonnement/routage/sécurité/validation/flux : réutilisable comme patron du moteur
d'agent (brief §5).

**Pipeline vocal présent** : dossiers `whisper-space/` (STT via Whisper) et
`piper-space/` (TTS via Piper), plus `msedge-tts` et `ffmpeg-static`. → Répond
directement à l'exigence « parler normalement à l'agent » (brief §3.3).

**IA multi-fournisseurs** (`.env.example`, clés sans valeurs) :
`GROQ_API_KEY`, `GEMINI_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY`.
→ Abstraction multi-providers déjà pratiquée ; réutilisable comme moteur de raisonnement.

**Autres variables notables** : `DATABASE_URL`, `DB_SCHEMA`, `SESSION_ID`,
`PUPPETEER_EXECUTABLE_PATH` (Chrome pour whatsapp-web.js), `ADMIN_TOKEN`,
`SESSION_TIMEOUT_MINUTES`, limites de transactions. Documentation interne riche :
`ARCHITECTURE.md`, `FLOWS.md`, `ROADMAP-AI.md`, `TRAINING-AI.md`, `SUPERPOWERS.md`,
`ORACLE-DEPLOY.md`.

> À faire quand l'architecture l'exigera : cloner `moov-ai` et lire `engine.js`,
> `router.js`, `security.js` pour en extraire le patron d'agent (non lus ligne à ligne à ce stade).

---

## 3. `canalplus-whatsapp-bot` — la persistance de session et Northflank

**Dépendances** : `whatsapp-web.js` épinglé à un commit précis
(`…#2dc9466facb027caee19dbf285e0a2763f5373bb`), `express`, `ffmpeg-static`,
`msedge-tts`, `qrcode`, `axios`, `dotenv`. Fichiers : `index.js`, `parsers.js`,
`session-store.js`, `test/`, `Dockerfile`, `railway.toml`, `render.yaml`, `northflank/`.

**Persistance de session** (`session-store.js`, en-tête lu) : la session WhatsApp
persiste via **LocalAuth sur un disque monté** (`/app/.wwebjs_auth`) ; le module gère
le nettoyage des **lock files Chrome** (`SingletonLock`/`Cookie`/`Socket`) après un
crash/OOM. Un ancien backup Supabase a été **retiré** (OOM sur Render Starter 512 Mo).
→ Enseignement direct pour la cible : la session ne doit pas vivre dans un FS éphémère
(brief §8/§9.2), et 512 Mo de RAM sont insuffisants pour Chrome+Whisper.

**Northflank déjà préparé** : `northflank/README.md`, `northflank/template-bot.json`,
`northflank/template-bot-moov.json`. → Base concrète pour l'infra, même si l'accès
API Northflank est indisponible aujourd'hui (voir [AUDIT_NORTHFLANK.md](AUDIT_NORTHFLANK.md)).

---

## 4. `toumai-whatsapp-calling` — spécification, pas implémentation

Contenu : `README.md`, `docs/`, `.circleci`, `.github`. **Aucun `package.json`,
aucun code applicatif.** À traiter comme une source d'exigences, pas comme une brique
réutilisable.

---

## 5. Conséquences pour la cible

- **Capital réutilisable fort** : le patron d'agent de `moov-ai` (engine/router/security/validate/flows),
  son pipeline vocal (Whisper/Piper/ffmpeg) et son abstraction IA multi-providers ;
  la persistance de session et les templates Northflank de `canalplus-whatsapp-bot`.
- **Point de décision ouvert** : `whatsapp-web.js` est un transport **non officiel**
  (risque de bannissement du numéro). L'abstraction `WhatsAppProvider` du brief (§8)
  est la bonne réponse : coder l'agent contre une interface, et pouvoir basculer entre
  `whatsapp-web.js` (réutilisation immédiate) et **WhatsApp Business Cloud API**
  (officielle) sans réécrire l'agent. Voir décision en [AUDIT_EXISTANT.md](AUDIT_EXISTANT.md) §6.
