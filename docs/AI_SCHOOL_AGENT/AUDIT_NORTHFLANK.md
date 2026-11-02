# Audit Northflank — ⛔ BLOQUÉ (accès indisponible)

Relevé le 31 octobre 2026.

## 1. Constat

L'audit Northflank demandé (brief §2.4, §9) **ne peut pas être réalisé** depuis
l'environnement de travail actuel. Preuves :

- **Aucune CLI Northflank** : `which northflank` et `which nf` → introuvables dans le `PATH`.
- **Aucun token** : aucune variable `NORTHFLANK_*` / `NF_*` dans l'environnement.
- **Aucune config Northflank** dans le dépôt `guergne` (`find … -iname "*northflank*"` → vide).
- Les seuls secrets configurés sur `guergne` (GitHub Actions) sont `NEON_API_KEY` — rien pour Northflank.

Impossible donc d'inventorier l'organisation, les projets, environnements, services,
bases, domaines, secrets ou déploiements existants **sans inventer** — ce que la
mission interdit (Règle 2).

## 2. Ce qui est malgré tout exploitable

Le dépôt `canalplus-whatsapp-bot` contient un dossier **`northflank/`** avec :
`README.md`, `template-bot.json`, `template-bot-moov.json`. Ce sont des **templates de
service Northflank déjà écrits** par l'équipe, utilisables comme référence de départ
pour l'infra du School AI Agent (à lire en détail lors de la phase infra).

Enseignement d'exploitation tiré de `canalplus-whatsapp-bot/session-store.js` :
- la session WhatsApp doit persister sur un **disque monté** (pas de FS éphémère) ;
- **512 Mo de RAM sont insuffisants** (OOM constaté) pour Chrome + traitement — dimensionner au-dessus, surtout avec Whisper.

## 3. Ce qu'il faut pour débloquer

Au choix, l'un de ces accès, fourni de façon sécurisée (jamais collé en clair dans un
message ou un commit — Règle 7) :

1. un **token API Northflank** exposé à l'environnement via une variable (`NORTHFLANK_API_TOKEN`), **ou**
2. l'installation de la **CLI Northflank** authentifiée sur cette machine, **ou**
3. un **connecteur/MCP Northflank** activé dans la session.

Dès qu'un de ces accès est disponible, cet audit sera complété (organisation, projets,
ressources, état réel) et les livrables `NORTHFLANK_ARCHITECTURE/DEPLOYMENT/ENVIRONMENTS/RUNBOOK`
seront produits avec vérification effective de chaque ressource.

## 4. Impact sur la feuille de route

Le blocage Northflank **n'arrête pas** le projet : l'audit du code, le cahier des
charges, l'architecture, le registre d'outils, la sécurité et l'environnement de test
(P0–P2) ne dépendent pas de Northflank. Seul le **déploiement de production** (P6) en dépend.
