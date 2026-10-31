# Décisions techniques — School AI Agent

Registre des décisions, avec date, contexte, preuve et conséquences. La plus
récente en haut. Une décision non tranchée est marquée « ⏳ ouverte ».

---

## DT-001 — Transport WhatsApp : `whatsapp-web.js` (confirmé)

- **Date** : 2026-10-31
- **Décision** : l'établissement retient **`whatsapp-web.js`** comme transport de départ.
- **Contexte / preuve** : c'est le transport des deux précédents fonctionnels du compte
  (`moov-ai/package.json`, `canalplus-whatsapp-bot/package.json`). Réutilisation immédiate
  du savoir-faire (session, voix, déploiement). Voir [INVENTAIRE_WHATSAPP.md](INVENTAIRE_WHATSAPP.md).
- **Risque accepté** : `whatsapp-web.js` automatise **WhatsApp Web** via Puppeteer/Chrome,
  **sans API officielle**. C'est contraire aux CGU de WhatsApp ; le numéro peut être
  **restreint ou banni**. L'établissement l'accepte en connaissance de cause.
- **Mitigations obligatoires** (intégrées à l'architecture) :
  1. **Abstraction `WhatsAppProvider`** : l'agent ne dépend jamais de `whatsapp-web.js`
     directement, pour pouvoir basculer vers la **WhatsApp Business Cloud API** sans
     réécrire l'agent (voir [ARCHITECTURE_WHATSAPP.md](ARCHITECTURE_WHATSAPP.md)).
  2. **Numéro dédié**, jamais le numéro personnel d'un responsable (⏳ voir DT-002).
  3. **Comportement « humain »** : pas d'envois massifs par ce canal, débit limité,
     pas de spam — réduit le risque de bannissement.
  4. **Plan de bascule documenté** vers la Cloud API si le numéro est restreint.
- **Conséquence** : runtime **Node.js** pour la passerelle WhatsApp (Chrome + Puppeteer),
  séparé du backend `guergne`. Dimensionnement mémoire **> 512 Mo** (OOM constaté sur
  `canalplus-whatsapp-bot`, voir [AUDIT_NORTHFLANK.md](AUDIT_NORTHFLANK.md)).

## DT-002 — Numéro WhatsApp dédié ⏳ ouverte
Nouveau numéro réservé à l'IA, titulaire et SIM/hébergement à définir.

## DT-003 — Moteur de raisonnement : réutiliser le socle `moov-ai` (proposé)
- **Proposition** : réutiliser le patron `moov-ai` — moteur de flux (`src/engine.js`),
  routeur indépendant du transport (`src/router.js`), IA multi-providers avec rotation
  et repli groq→gemini→mistral→openrouter (`src/config.js`) — plutôt que créer un second
  système IA (brief §2.2). À confirmer après clonage et lecture de `services/ai.js`.
- **Nuance clé** : `moov-ai` possède sa **propre** base (comptes/transactions). L'agent
  scolaire, lui, **ne duplique pas** les données scolaires : elles restent dans `guergne`,
  qu'il pilote par API. L'agent n'a qu'une base **opérationnelle** (liens identité,
  contexte, journal d'audit, idempotence, planifications). Voir ARCHITECTURE_TECHNIQUE (à venir).

## DT-004 — STT/TTS : Whisper + Piper/msedge-tts (proposé)
Réutiliser le pipeline vocal de `moov-ai` (`whisper-space`, `piper-space`, `msedge-tts`,
`ffmpeg-static`). **Qualité arabe tchadien à tester** (`toumai-chadian-arabic`) avant toute
promesse (brief §3.3). Voir PLAN_DE_TESTS (à venir).

## DT-005 — Base de données de l'agent : Postgres/Neon dédié (proposé)
Même technologie que `guergne` (Neon) mais **schéma/instance séparé**, pour l'état
opérationnel de l'agent. Les données scolaires ne transitent jamais en copie durable
hors `guergne` au-delà du strict nécessaire (contexte conversationnel borné).
