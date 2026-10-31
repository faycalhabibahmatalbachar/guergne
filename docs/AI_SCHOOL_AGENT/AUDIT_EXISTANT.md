# Audit de l'existant — School AI Agent

Relevé le **31 octobre 2026**. Compte GitHub `faycalhabibahmatalbachar` (32 dépôts).
Dépôt scolaire canonique : **`guergne`** (public, TypeScript), monorepo cloné en
local sur `C:\Users\hp\Desktop\Projects\lycee-renaissance`, branche de travail
`ai-school-agent-p0-audit` (partie de `main` à `35f5b19`).

---

## 1. Méthode et portée

- Inspection du dépôt local `guergne` : fichiers suivis, contenu, **historique git complet** (`--all`).
- Inventaire des 32 dépôts du compte via `gh repo list` (métadonnées : visibilité, langage, description, date de push).
- Lecture des manifestes réels (`package.json`, `.env.example`, fichiers clés) des dépôts WhatsApp/IA **via l'API GitHub**, sans clonage complet.
- Vérification de l'accès Northflank dans l'environnement de travail.

Non couvert à ce stade (voir §5) : clonage et lecture ligne à ligne du code des
dépôts tiers ; accès Northflank ; tests d'exécution.

---

## 2. Ce qui existe et fonctionne

### 2.1. La plateforme scolaire `guergne` — mûre, sans aucune brique WhatsApp/IA

- Monorepo : `web/` (Next.js/TypeScript), `mobile/` (app parent), `db/` (migrations SQL), `docs/`, `marque/`, `livraison/`.
- **≈ 60 tables Postgres** (Neon) déclarées en Drizzle, 20 migrations SQL (`db/migrations/0001…0020`).
- **12 modules** métier (`web/src/app/(main)/dashboard/`) : eleves, classes, parents, personnel, emploi-du-temps, assiduite, discipline, notes, bulletins, finances, communication, parametres.
- Couche serveur structurée : `web/src/server/{auth, db, domain, export, guard, import, notifications, pdf}`.
- API HTTP sous `web/src/app/api/` (bulletins, documents, eleves, emploi-du-temps, export, fichiers, identite, **mobile**, notes, notifications, personnel).
- **Déjà présents et directement utiles à l'agent** : table `journal_audit` (traçabilité), table `permissions` + `0012_permissions_super_admin.sql` (RBAC), `codes_activation` et `jetons_rafraichissement` (auth appareils), une **API mobile** (`api/mobile/*`) qui prouve que le backend sait déjà servir des clients externes.

→ Détail complet : [CARTOGRAPHIE_BACKEND.md](CARTOGRAPHIE_BACKEND.md).

**Preuve que `guergne` ne contient AUCUNE intégration WhatsApp/IA :**
- `git ls-files | grep -iE "whatsapp|baileys|openwa|stt|speech|toumai|…"` → **aucun fichier**.
- Recherche de contenu : seules 2 occurrences, toutes deux **incidentes** (WhatsApp cité comme canal humain, pas comme intégration) :
  - `mobile/android/app/build.gradle.kts:50` — « …le fichier que l'école fait circuler par WhatsApp. »
  - `web/src/server/pdf/emploi-du-temps.tsx:23` — « …envoyé par WhatsApp à un professeur… »
- `git log --all --grep` sur whatsapp/baileys/toumai/vocal/agent → **aucun commit**.

→ Conclusion : l'agent sera un **composant nouveau**, intégré à `guergne` par ses
interfaces backend existantes, et non une greffe dans son code.

### 2.2. Des précédents WhatsApp réels, dans d'autres dépôts

Deux implémentations **fonctionnelles** servent de modèle (voir [INVENTAIRE_WHATSAPP.md](INVENTAIRE_WHATSAPP.md)) :

- **`moov-ai`** (« Moov Money Tchad sur WhatsApp, Agent + Client, Postgres + AI multi-providers ») — le précédent architectural le plus proche de la cible : WhatsApp + Postgres + IA multi-fournisseurs + **pipeline vocal complet** (Whisper STT, Piper/msedge-tts TTS, ffmpeg).
- **`canalplus-whatsapp-bot`** — même socle WhatsApp, avec **persistance de session** éprouvée et **templates Northflank** déjà écrits.

### 2.3. Briques Toumaï AI réutilisables

`toumai-web`, `toumai-code`, `toumai-admin`, et surtout **`toumai-chadian-arabic`**
(« speech, language understanding and AI » pour l'arabe tchadien), pertinent pour la
voix en `shu`. Détail : [INVENTAIRE_TOUMAI_AI.md](INVENTAIRE_TOUMAI_AI.md).

---

## 3. Ce qui existe mais est à vérifier / partiellement développé

- **`toumai-whatsapp-calling`** : dépôt **docs uniquement** (`README`, `docs/`, `.circleci`, `.github`) — **pas d'implémentation** (aucun `package.json`). C'est une spécification, pas du code exploitable.
- La description de `canalplus-whatsapp-bot` annonce « wa-automate-nodejs v4.76.0 » mais le `package.json` réel utilise **`whatsapp-web.js`**. La description est **obsolète** (voir §4, correction n°1).

---

## 4. Corrections factuelles au brief (preuves à l'appui)

**Correction n°1 — La technologie WhatsApp réelle est `whatsapp-web.js`, pas Baileys ni wa-automate.**
Le brief indique une disposition à travailler avec Baileys ou OpenWA. Or les deux
précédents **qui marchent** reposent sur `whatsapp-web.js` (Puppeteer / WhatsApp Web) :
`moov-ai/package.json` et `canalplus-whatsapp-bot/package.json` le déclarent
explicitement. Aucun dépôt du compte n'utilise Baileys. À prendre en compte dans la
décision technologique (voir §6).

**Correction n°2 — `guergne` n'a aucun historique WhatsApp/IA à « retrouver ».**
Le brief suppose une ancienne intégration à exhumer dans le dépôt scolaire. Preuve
faite : il n'y en a pas, ni en l'état ni dans l'historique. Le capital réutilisable
est dans `moov-ai` / `canalplus-whatsapp-bot` / `toumai-*`.

---

## 5. Ce qui n'a pas pu être vérifié (blocages)

- **Northflank : accès indisponible dans cet environnement.** Aucune CLI (`northflank`/`nf`), aucun token (`NORTHFLANK_*` absent de l'environnement), aucun fichier de config dans `guergne`. L'audit Northflank est donc **bloqué**. Détail et ce qu'il faut pour le débloquer : [AUDIT_NORTHFLANK.md](AUDIT_NORTHFLANK.md). Référence exploitable malgré tout : `canalplus-whatsapp-bot/northflank/` contient des templates (`template-bot.json`, `template-bot-moov.json`).
- **Code interne des dépôts tiers** (`moov-ai`, `toumai-*`) : seuls les manifestes et quelques fichiers clés ont été lus. Une lecture ligne à ligne demande un clonage, prévu quand l'architecture l'exigera.
- **Aucun test d'exécution** n'a été réalisé (pas de connexion WhatsApp, pas d'appel STT).

---

## 6. Décisions qui vous reviennent (avant le cahier des charges)

Ces choix conditionnent toute l'architecture et ne peuvent être tranchés sans vous :

1. **Transport WhatsApp — le risque de bannissement.** `whatsapp-web.js` (votre précédent qui marche) automatise **WhatsApp Web** sans API officielle : c'est contraire aux CGU de WhatsApp, et le numéro peut être **banni** — ce qui couperait la supervision de l'école. L'alternative est la **WhatsApp Business Cloud API** (officielle, payante au message, mais robuste et autorisée). Arbitrage : rapidité/coût zéro et réutilisation du code existant **contre** risque sur le numéro officiel de l'établissement.
2. **Le numéro dédié** : nouveau numéro réservé à l'IA ? Qui en est titulaire ?
3. **Périmètre du premier module livré** (recommandation : assiduité/absences, le cas d'usage central du brief).
4. **Budget** modèles IA et STT (Groq/Gemini/Mistral/OpenRouter vus dans `moov-ai`) et hébergement Northflank.

Le cahier des charges complet sera rédigé une fois ces points cadrés, pour ne pas le
bâtir sur des hypothèses.
