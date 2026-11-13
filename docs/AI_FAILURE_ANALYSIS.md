# Analyse des échecs — cycle par cycle

Chaque cycle : la campagne du banc, les échecs classés par cause, le composant responsable, la correction et le test de régression ajouté. Les chiffres de chaque campagne sont dans `docs/AI_TEST_CAMPAIGN_REPORT.md`.

**Comparabilité.** Les campagnes n'ont pas toutes le même périmètre : 132 scénarios pour les cycles 0 à 2, 190 à partir du cycle 3 (58 variantes de formulation et 6 longues conversations ajoutées). Une comparaison avant/après n'a de sens que sur les 132 scénarios communs ; elle est faite dans le rapport de campagne.

## Cycle 0 — référence (`0-reference`, commit `1a8e4d2`, sans mémoire ni résolveur)

132 scénarios : 73 réussis, 33 partiels, 21 échoués, 5 non exécutés.

| Cause | Scénarios | Composant | Correction |
|---|---|---|---|
| Le modèle demande un identifiant (UUID, `absenceId`) à l'utilisateur | ro-04, ro-08, ec-08, ec-09 | registre (paramètres en `…Id` montrés), invite (UUID listés) | registre en mots ; référentiel sans identifiant ; résolveur central |
| Aucun contexte d'un message à l'autre | mt-01 à mt-15 (13 scénarios) | mémoire éteinte par défaut | mémoire de session toujours active ; foyer d'entités |
| « 2 » après un menu d'homonymes incompris | mt-04, mt-05 | aucune mémoire du menu | question de choix persistée, `choisir` |
| Dates relatives devinées (« la semaine dernière » → 5 au 11 novembre) | as-07, as-08 | invite sans date du jour | `contexteDates` |
| Année scolaire affirmée de mémoire (2026-2027 au lieu de 2025-2026) | pi-03 | garde-fou trop étroit | une année scolaire citée en conversation est rejetée |
| Total réel non annoncé (« 100 résultats » pour 209) | as-06, ro-13 | opération `listerRetards` sans total | lignes + total côté backend |
| Responsables sans lien ni principal | pa-01 | rendu lisant des champs inexistants | rendu aligné sur `lien`, `estPrincipal` |
| Recherche d'un parent par « prénom nom » vide | pa-08 | filtre SQL | recherche sur le nom complet, deux ordres |
| Mission pour une demande simple, étapes non résolues | cl-02, pa-02, as-16, pi-06 | contrat, missions sans résolution | consigne « mission = plusieurs consultations indépendantes » ; étapes résolues et préparées ; mission à une étape = outil |
| « les impayés de la 2nde A » → synthèse par classe | fi-06, fi-08, mt-15 | descriptions trop proches | descriptions distinguées : liste nominative / synthèse par classe |
| Lecture vide → « ✅ Opération effectuée » | ro-03 | rendu des retards (forme `{lignes,total}`) | rendu corrigé ; repli honnête pour toute lecture |
| Justifier / supprimer une absence impossible sans son identifiant | ec-08, ec-09 | contrat d'outil | désignation par élève et date |
| Exclusion sans décision : le modèle rédige la décision | ec-13 | aucun contrôle de provenance | `ditParLUtilisateur` |
| Création de classe : « n'existe pas dans la liste » | ec-15 | consigne « classe absente des listes → clarifier » | consigne retirée ; le résolveur dit lui-même ce qui n'existe pas |
| Aucun surveillant actif dans la base de test | dr-01 à dr-06 | données de test | surveillant de synthèse créé par le banc |

Tests de régression ajoutés : `test/resolution-parametres.test.js`, `test/memoire-isolation.test.js`, mises à jour de `test/tools.test.js`.

## Cycle 1 et 2 — campagnes interrompues

- `1-resolveur-memoire` : arrêtée au 73e scénario par une coupure de la connexion SQL de l'oracle (`ECONNRESET`, Neon ferme une connexion muette). **Correction** : l'oracle passe par un pool qui se reconnecte (`banc/moteur.mjs`).
- `2-complet` : arrêtée au 62e scénario par un verrou Windows sur le fichier de résultats partiels. **Correction** : écriture atomique et tolérante (`banc/lancer.mjs`) ; reprise possible avec `--reprendre`.

Les 135 scénarios mesurés de ces deux campagnes ont donné 4 défauts nouveaux, corrigés avant le cycle 3 : « à qui est ce numéro ? » refusé comme demande personnelle, « quels enfants rattachés à ce parent » sans outil connu, « quels élèves ont quitté l'établissement » mal routé, « la semaine dernière » rangé dans `periode`.

## Cycle 3 — `3-complet` (190 scénarios)

145 réussis, 17 partiels, 28 échoués. **0 fausse réussite, 0 paramètre technique montré.**

| Cause | Scénarios | Composant | Correction (cycle 4) |
|---|---|---|---|
| **Modèle indisponible** : Groq en quota (invite de ~6 000 jetons), Mistral en quota, OpenRouter saturé en fin de campagne → 20 tours « erreur technique » | cv-01 à cv-06, va-fin-*, va-sans-*… | infrastructure (fournisseurs) | le banc attend la fin du refroidissement et renvoie le même message ; ces tours sont comptés à part. L'agent dit « momentanément saturé, rien n'a été fait » au lieu d'« erreur technique ». |
| **« oui » orphelin → « la mère a été ajoutée comme responsable principal »** — annonce d'une écriture qui n'a pas eu lieu | ec-04 | conversation non bridée sur les actions | (1) un « oui / non » sans attente est traité sans modèle ; (2) une réponse conversationnelle qui annonce une action est rejetée (`ACTION_INVENTEE`) ; (3) le juge compte ce cas comme fausse réussite |
| Un surveillant ne peut pas résoudre « 6e A » : il n'a pas `classe:lire` | dr-01 | backend : liste des classes réservée à `classe:lire` | opération `nommerClasses` (noms seuls, droit `eleve:lire`) ; le référentiel s'y replie |
| « la sixième à » → la classe « 6E » (vide) ; « 6e » pris pour un code | ro-09, va-ret-vocal | résolveur : code avant niveau | un niveau seul désigne toutes ses classes ; « à » après un niveau = la lettre A |
| Classe créée puis introuvable (cache de 15 min) | ec-15 | référentiel | une classe introuvable fait relire la liste une fois |
| « 2 » choisit le mauvais homonyme | mt-04 | ordre des candidats non déterministe | candidats triés par matricule |
| « combien en 6e A ? » → effectifs par niveau | cl-02, va-eff-* | descriptions proches | descriptions distinguées (une classe / un niveau) |
| Filtre « impayés » oublié | fi-01, va-fin-* | description du paramètre | le paramètre énumère les formulations qui l'exigent |
| Motif fourni mais non recopié | ec-09 | consigne « n'invente aucun motif » trop forte | consigne : recopier les motifs dits |
| Demandes en minuscules ou télégraphiques → « précisez » | va-fiche-minuscules, va-par-bref, va-notes-bref | invite | exemples courts ajoutés au contrat |
| Oracle figé alors que la campagne écrit (parents sans compte 511 → 512) | va-sans-*, pa-04 | banc | compteur relu au moment du contrôle |

Tests de régression ajoutés : `test/plan-action-inventee.test.js`, 5 tests dans `test/resolution-parametres.test.js`, test « nouveau sujet » renforcé.

## Cycle 4 — `4-complet`

Voir `docs/AI_TEST_CAMPAIGN_REPORT.md` pour les chiffres et les défauts restants.
