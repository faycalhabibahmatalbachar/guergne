# Inventaire Toumaï AI — briques de raisonnement et de voix

Objet : déterminer si l'IA existante du compte peut servir de **moteur de
raisonnement** et de **transcription vocale** du School AI Agent, pour ne pas créer
un second système IA inutilement (brief §2.2).

> Portée de ce premier passage : **inventaire au niveau dépôt** (métadonnées + manifestes
> accessibles). La lecture interne (endpoints, modèles, mécanismes de mémoire) des dépôts
> Toumaï demande un clonage, non réalisé à ce stade. Les points non vérifiés sont signalés.

---

## 1. Dépôts Toumaï / IA du compte

| Dépôt | Visibilité | Langage | Description | Pertinence |
|---|---|---|---|---|
| `toumai-web` | privé | TypeScript | « Toumai AI — site officiel : discutez avec Toumai AI depuis le navigateur » | Interface de chat + très probablement une API d'inférence |
| `toumai-code` | privé | Python | « Toumai Code agentic coding pilot » | Patron d'agent (planification/outils) en Python |
| `toumai-admin` | privé | TypeScript | — | Console d'admin IA (à vérifier) |
| `toumai-code-web` | privé | — | — | Front de toumai-code (à vérifier) |
| `toumai-web-search-lab` | privé | Python | — | Recherche/RAG (à vérifier) |
| `toumai-chadian-arabic` | privé | Python | « speech, language understanding and AI for Toumaï AI » (arabe tchadien, `shu`) | **STT / voix en arabe tchadien** |
| `sayibi-ai` / `sayibiai_backend` | privé | Dart / Python | — | Autre produit IA (app + backend) |
| `chadgpt` | privé | TypeScript | — | Chat IA (à vérifier) |

## 2. Fournisseurs IA réellement utilisés (preuve indirecte)

Le `.env.example` de `moov-ai` déclare quatre fournisseurs : **Groq, Gemini, Mistral,
OpenRouter**. C'est la **pratique multi-providers maison** déjà en place et le point de
départ le plus sûr pour le moteur de raisonnement, plutôt qu'un nouveau fournisseur.

## 3. Voix (STT/TTS)

- **STT** : `moov-ai/whisper-space/` (Whisper) = un pipeline de transcription déjà
  éprouvé en production WhatsApp. `toumai-chadian-arabic` cible spécifiquement la
  reconnaissance de l'**arabe tchadien** — à évaluer pour les vocaux en `shu`.
- **TTS** : `moov-ai/piper-space/` (Piper) + `msedge-tts`.
- ⚠️ **À ne pas affirmer sans test** : la qualité réelle de la transcription en
  français scolaire et surtout en arabe tchadien. Le brief l'exige (« ne prétends pas
  qu'une langue est prise en charge sans tests concrets »). Des tests STT figureront au
  PLAN_DE_TESTS.

## 4. Décision provisoire (à confirmer après lecture du code)

- **Réutiliser** le moteur multi-providers + le pipeline Whisper de `moov-ai` comme
  base, plutôt que repartir de zéro.
- **Évaluer** `toumai-web` comme fournisseur d'inférence « maison » (si une API stable
  existe) et `toumai-chadian-arabic` pour le `shu`.
- **Prochaine action** : cloner `moov-ai` et `toumai-web` pour confirmer les endpoints,
  la gestion de contexte/mémoire et la faisabilité de la réutilisation.
