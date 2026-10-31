# État d'exécution — Lycée WhatsApp AI Agent

Checkpoint fidèle, à relire pour reprendre sans perte.
Dernière mise à jour : 31 octobre 2026.

---

## Dernier commit

Branche `ai-school-agent-p0-audit`. Voir `git log -1` — le présent lot ajoute
le résolveur durci, la résilience IA, la persistance et le point d'entrée.

## Tests réellement exécutés

`cd agent && node --test` → **66 tests, 66 passent, 0 échec.**

| Suite | Tests | Objet |
|---|---:|---|
| `engine.test.js` | 10 | orchestration, identité, confirmation, échec non maquillé |
| `tools.test.js` | 7 | outils Assiduité, validations réelles de guergne |
| `permissions-matrix.test.js` | 5 | reflet de la matrice, DIRECTION sans `assiduite:saisir` |
| `guergne-client.test.js` | 5 | contrat HTTP, 403/500/panne réseau |
| `resolveur.test.js` | 11 | défauts STT, homonymes, faux positifs |
| `ia.test.js` | 20 | multi-fournisseurs, repli, résilience 401/429/5xx |
| `persistance.test.js` | 8 | déduplication après redémarrage, verrou d'instance |

## Lots terminés

- **P0** — socle vérifié : 66 tests réels, SHA et synchronisation contrôlés.
- **P4** — résilience IA. `401` écarte le fournisseur (plus aucune tentative),
  `429` le met en cooldown en respectant `Retry-After` (secondes ou date HTTP),
  `5xx` est réessayé jusqu'à 3 fois avec recul exponentiel **bruité**.
  L'épuisement lève `IA_INDISPONIBLE` — jamais un résultat inventé.
  `etatFournisseurs` expose le disjoncteur pour la supervision.
- **P1 (partiel)** — persistance et déduplication sur disque, verrou d'instance,
  provider `whatsapp-web.js` réel, point d'entrée `index.js`.

## Lots partiellement réalisés

- **P1** : le provider est écrit mais **non exercé contre WhatsApp** (aucun
  numéro secondaire, dépendance `whatsapp-web.js` non installée ici). L'import
  est différé, donc le reste de l'agent reste testable sans elle.
- **P2** : le magasin d'identités démarre **vide** — défaut sûr : aucun numéro
  reconnu, donc aucune opération possible. Reste à l'adosser à une table
  d'association numéro → compte interne côté guergne.
- **P5** : la transcription est branchée (`ia.transcrire`) et validée en réel
  (Whisper, ~1,4 s) ; les documents ne sont pas encore traités.

## Choix techniques arrêtés

**Transport : `whatsapp-web.js`**, après comparaison avec Baileys. C'est le
transport des deux intégrations qui fonctionnent déjà sur ce compte (`moov-ai`,
`canalplus-whatsapp-bot`), avec une persistance `LocalAuth` éprouvée et un
retour d'expérience sur ses pièges (verrous Chrome, besoin mémoire > 512 Mo).
Coût assumé : la dépendance à Chromium, couverte par les 2 Gio du serveur.

## Blocages réels

| Blocage | Nature | Preuve |
|---|---|---|
| Déploiement Altare | `panel.altare.gg` → Cloudflare **521** | diagnostic daté, Ray ID relevé |
| Identifiants Altare | **aucun** dans l'environnement | recherche exhaustive, voir `ALTARE_DIAGNOSTIC.md` |
| Repli Mistral sous charge | palier gratuit **429** | appel réel ; le repli s'opère mais n'est pas garanti |
| Connexion WhatsApp | scan du QR requis | opération physique, numéro secondaire à fournir |

## Prochaine tâche exacte

1. Installer la dépendance et vérifier le démarrage à blanc :
   `cd agent && npm install && node --check index.js`
2. Brancher l'association numéro → compte interne (P2) : table côté guergne,
   lecture par le connecteur, tests par rôle.
3. Traitement des documents (P5) puis expérience conversationnelle (P7).
4. Dès qu'Altare répond : relever hôte/port/utilisateur SFTP, déposer le mot de
   passe d'équipe dans un fichier ignoré, déployer, vérifier les logs et la
   persistance de session après redémarrage.

## Commandes de reprise

```bash
cd agent && node --test          # doit afficher 66/66
node agent/scripts/verif-ia.mjs  # verifie Groq + repli (secrets non affiches)
```
