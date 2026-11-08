# Validation métier — opérations quotidiennes de la direction

État concret de la mise en service des opérations scolaires réelles. Aucun
secret, aucune chaîne de connexion, aucune donnée d'élève nominative.

Dernière mise à jour : 2026-11-08. Branche `voix-bidirectionnelle`.

Statuts autorisés : NON TESTÉ · EN COURS · ÉCHEC · VALIDÉ EN LOCAL ·
VALIDÉ EN INTÉGRATION · VALIDÉ EN PRODUCTION.

---

## PHASE A — Stabilisation

### P1 — L'entrypoint Altare charge-t-il l'orchestrateur ? **OUI**

`index.js` (165 lignes) est un **amorçage** : il charge `.env`, installe les
dépendances si le lockfile a changé, installe Chromium si absent, puis finit par

```js
await import("./app.js");
```

Or `app.js` construit `OrchestrateurReponse` et passe `avecOrchestrateur(...)` à
l'`Agent`. L'orchestrateur est donc bien dans le chemin de production. Statut :
**VALIDÉ EN LOCAL** (lecture du code et tests ; pas encore observé sur Altare).

### P2 — TEXT_ONLY par défaut

`MODE_DEFAUT = "texte_seul"` dans `src/reponse/politique-sortie.js`, et `app.js`
passe `process.env.AGENT_REPONSE_VOCALE ?? MODE_DEFAUT`. **Attention** : si la
variable `AGENT_REPONSE_VOCALE` vaut encore `texte_et_voix` dans le `.env`
d'Altare, elle gagne. À vérifier au déploiement — c'est la cause la plus
probable des `tts_started` observés en production.

### P3 — Rejeu de l'historique : **CORRIGÉ**

Cause trouvée : il n'existait **aucune barrière de démarrage**. WhatsApp Web, en
se resynchronisant après un redémarrage, réémet des messages de l'historique, et
rien ne distinguait un message qui vient d'arriver d'un message vieux de trois
jours. La déduplication persistante (`DedupPersistant`) couvre les messages déjà
vus, mais elle ne peut rien si son fichier est neuf ou perdu.

Correction (`src/providers/wwebjs.js`) : une barrière posée **au `ready`** — et
non à la construction, car entre les deux il y a l'ouverture de Chromium et la
synchronisation. Un message antérieur à cette barrière est écarté et **tracé**
(`message_historique_ignore`, avec son âge) : si la barrière écartait de vrais
messages, le journal doit le montrer. Tolérance de 2 minutes
(`WHATSAPP_TOLERANCE_HISTORIQUE_MS`), pour qu'un message envoyé *pendant* la
relance reste traité.

Le gestionnaire de message, jusque-là une closure anonyme, est devenu la méthode
`_surMessage()` : la protection était sinon invérifiable autrement qu'en
production, c'est-à-dire trop tard. 5 tests.

### P4 — Écouteurs et instance

Un seul gestionnaire (`onMessage` écrase le précédent) ; `VerrouInstance`
(`src/verrou.js`) protège le profil LocalAuth. **NON TESTÉ** sur Altare.

### P5 — La connexion « Neon » de l'agent : **fait d'architecture à corriger dans le brief**

**L'agent ne parle pas à Neon.** Il appelle le backend guergne en HTTP :

```
POST {AGENT_API_ECOLE}/api/agent/{action}
  authorization: Bearer <AGENT_SERVICE_TOKEN>
  x-acteur-id: <uuid de l'acteur>
```

C'est ce backend (`web/src/app/api/agent/[action]/route.ts`) qui applique
AUTH → RÔLE → PÉRIMÈTRE puis interroge Neon. `src/guergne-client.js` le dit
explicitement : « L'agent n'écrit jamais en base directement ; il passe toujours
par ici. »

Mettre du SQL dans l'agent contredirait donc à la fois cette architecture et la
consigne « ne crée pas un second système de permissions ». « Brancher le vrai
Neon » signifie : **configurer `AGENT_API_ECOLE` + `AGENT_SERVICE_TOKEN`**.

État local : `agent/.env` **n'existe pas**. L'agent lancé ici n'a donc aucun
backend, et répond honnêtement « Backend scolaire non configuré : opération
indisponible. » — il ne fabrique rien.

Le `Resultat SIMULE pour « … »` cité dans le brief vient de
`scripts/ecoute-vocale-locale.mjs` (le laboratoire local), **pas** de `app.js`.

---

## PHASE B — Données et contrats

### P9 — Baseline Neon, mesurée le 2026-11-08 à 22 h 41 UTC (lecture seule)

Hôte `ep-w…oler.c-5.eu-central-1.aws.neon.tech`, base `neondb`, rôle
`neondb_owner`, **PostgreSQL 17.11**. 77 tables. Session ouverte en
`default_transaction_read_only = on` : la lecture seule est imposée par la base,
pas seulement promise. Script : `agent/scripts/baseline-neon.mjs`.

| Table | Lignes |
|---|---|
| eleves | **549** |
| classes | **15** |
| inscriptions | 549 |
| tuteurs | 742 |
| absences | **2 720** |
| retards | 2 236 |
| emploi_du_temps | 274 |
| enseignants | 15 |
| utilisateurs | 241 |
| matieres | 13 |
| periodes | 3 |
| annees_scolaires | 1 |
| notes | 47 601 |
| journal_audit | 1 030 |

Classes réelles : `6A/6ème A`, `6B`, `5A`, `5B`, `4A`, `4B`, `3A`, `3B`, `2A`,
`2B`, `1L`, `1S`, `TA`, `TD`, et un `6E/6E` d'apparence douteuse.

### P7 — Provenance : le schéma la dit, et elle est accablante

Le marqueur existe : **`donnees_semees`**, présent sur 8 tables (mon premier
motif de recherche l'avait manqué — il cherchait `seed`, `test`, `demo`).

| Table | Semées | Réelles |
|---|---|---|
| eleves | **548** | **1** |
| classes | 14 | 1 |
| enseignants | 14 | 1 |
| tuteurs | 738 | 4 |
| annonces | 10 | 1 |
| salles | 10 | 0 |
| utilisateurs | 1 | **240** |
| inscriptions | — | `null` sur 549 → **PROVENANCE_NON_VERIFIEE** |

`absences` et `retards` n'ont **aucune** colonne de provenance :
**PROVENANCE_NON_VERIFIEE** pour les 2 720 + 2 236 lignes. Elles se rattachent à
des élèves semés et couvrent une année scolaire entière et terminée.

Indice complémentaire : `journal_audit.type_source = 'assistant_assiste'` porte
**548 lignes toutes horodatées au même instant** (2026-10-26T13:08:12.958Z) —
la signature d'un script, pas d'une activité d'établissement. 482 autres lignes
ont `type_source = null`.

**Conclusion à ne pas contourner :** sur le domaine scolaire, la base ciblée
contient presque exclusivement des **données semées**. Un rapport bâti dessus ne
doit jamais être présenté comme le reflet de l'activité du lycée. Les 240
`utilisateurs` non semés sont, eux, probablement réels.

### P8 — Calendrier : un blocage qui annule les « opérations quotidiennes »

| Vérification | Résultat |
|---|---|
| Année courante | `2025-2026`, du 2025-10-01 au 2026-07-15, `est_courante = true` |
| Cette année couvre-t-elle aujourd'hui (2026-11-08) ? | **NON** |
| Périodes couvrant aujourd'hui | **0** |
| `saisie_ouverte` sur les 3 trimestres | **false** partout |
| Absences datées d'aujourd'hui ou après | **0** |

Autrement dit : **l'année scolaire de la base est terminée depuis juillet 2026,
et l'année 2026-2027 n'existe pas.** Aucune période n'est ouverte à la saisie.

Conséquences, à dire avant tout test et non après :

- « Qui est absent aujourd'hui en 6e A ? » renverra légitimement **rien** ;
- « Enregistre les absences de ce matin » **ne peut pas aboutir** : il n'y a ni
  année, ni période, ni saisie ouverte pour aujourd'hui ;
- « L'emploi du temps de demain » portera sur une année close.

Créer l'année 2026-2027 et ses périodes est une **décision de direction** et une
écriture sur des données réelles. Je ne l'ai pas faite.

---

## Suivi par fonctionnalité

Étapes : A code inspecté · B contrat identifié · C backend branché · D requête
validée · E permissions testées · F compréhension testée · G outil sélectionné ·
H résultat vérifié · I WhatsApp testé · J recette bout en bout · K déployé ·
L validé après déploiement.

| Fonction | Étapes atteintes | Statut | Blocage |
|---|---|---|---|
| Réponse unique / TEXT_ONLY | A B C D E F G H | VALIDÉ EN LOCAL | à confirmer sur Altare (variable d'env) |
| Barrière anti-rejeu | A B D | VALIDÉ EN LOCAL | non observé sur Altare |
| Téléchargement PTT + STT fr | A B D | EN COURS | note vocale utile attendue |
| Recherche d'élèves | A B | NON TESTÉ | `AGENT_API_ECOLE` absent en local |
| Recherche de classes | A B | NON TESTÉ | idem |
| Consultation des absences | A B | NON TESTÉ | idem |
| Enregistrement d'absence | A B | **BLOQUÉ** | aucune période ouverte ; année 2026-2027 inexistante |
| Emploi du temps | A B | NON TESTÉ | année close |
| Création de dossier élève | A B | NON TESTÉ | écriture réelle non autorisée |
| Rapports | A B | NON TESTÉ | données semées : un rapport serait trompeur |
| Confirmation des écritures | — | NON TESTÉ | à écrire (jeton à usage unique, empreinte des arguments, expiration) |
| Déploiement Altare | — | NON TESTÉ | non effectué |

Tests automatisés : **723 / 723** (`cd agent && npm test`).

---

## Prochaine action précise

1. **Décision de direction** : créer l'année scolaire 2026-2027 et ses périodes,
   sans quoi aucune opération quotidienne n'a de sens. Écriture réelle → à
   autoriser explicitement.
2. Fournir `AGENT_API_ECOLE` (URL du backend déployé) pour que l'agent local
   interroge réellement Neon à travers l'API, avec ses permissions.
3. Puis seulement : P11 → P19 (recherche, consultation, confirmation sécurisée),
   chaque lecture prouvée par une requête indépendante.
