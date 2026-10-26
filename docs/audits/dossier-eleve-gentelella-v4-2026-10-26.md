# Audit transversal — fiche détaillée d'un élève
**Date :** 26 octobre 2026  
**Périmètre :** `/dashboard/eleves/[id]`, API et services mobilisés par cette route  
**Technologies :** Next.js 16 (App Router), React 19, Drizzle/Neon PostgreSQL, Recharts 3, Gentelella v4.2.0 (MIT)  
**Hors périmètre :** refonte des bulletins et calculs officiels de publication.

## 1. Objectif produit et critères de qualité
La fiche élève est le point d'accès central aux données administratives, familiales, scolaires et financières, sans duplication, sans valeurs fictives et sans divulgation entre classes ou entre familles.

**Critères cibles (à mesurer en préproduction, non encore certifiés) :**
- Aucun accès indirect (IDOR) aux dossiers, fichiers, pièces, documents ou notifications d'autrui.
- Contrôles de périmètre exécutés côté serveur avant la lecture du dossier complet.
- Aucun N+1 par responsable lors de l'affichage de la fratrie.
- Graphiques fondés exclusivement sur les données Neon, avec périodes manquantes non interpolées.
- Interface utilisable aux largeurs 360, 768, 1280 et 1920 px ; navigation au clavier ; contraste et états vides accessibles.
- Un seul composant de présentation par famille : cartes `statTile`, `card`, `table`, `chart-header`, `activity-list`, `form-control`.
- Les documents « à générer » restent distingués des documents effectivement archivés/émis.
- Préserver l'historique, le journal d'audit, les règles de rôle et les workflows administratifs.

## 2. Cartographie front-end
| Fichier | Responsabilité |
|---|---|
| `web/src/app/(main)/dashboard/eleves/[id]/page.tsx` | Route serveur, contrôle d'accès, orchestration des onglets et de la navigation |
| `_components/vue-ensemble.tsx` et `vue-ensemble.module.css` | Synthèse, scolarité, famille, activité et priorités |
| `_components/indicateurs-gentelella.tsx` | Cartes `statTile()` issues du véritable code Gentelella |
| `_components/dossier-scolarite.tsx` | Notes, assiduité, discipline, échéancier, paiements et tableaux |
| `_components/courbe-resultats.tsx` | Courbe React Recharts avec les classes et tokens Gentelella |
| `_components/modifier-dossier.tsx` | Formulaire contrôlé, validation et sauvegarde journalisée |
| `_components/documents-eleve.tsx` | Menu historique des éditions officielles et des bulletins |
| `_components/documents-gentelella.tsx` | Tableau de consultation/téléchargement des documents non bulletin |
| `_components/actions-dossier.tsx` | Classe, statut, validation de dossier, interactions |
| `_components/gestion-tuteurs.tsx` | Liaison, recherche, retrait des responsables et droits |
| `_components/reinscription.tsx` | Réinscription avec choix de classe |
| `_components/photo-eleve.tsx`, `photo-actions.ts` | Visualisation et changement de photographie |
| `_components/raccourci-onglet.tsx` | Navigation accessible, impression |
| `_components/entete-dossier.module.css` | Disposition de l'identité et des commandes |

## 3. Backend, droits et flux HTTP
| Fichier | Flux et contrôles |
|---|---|
| `web/src/server/domain/dossier.ts` | Lecture de l'élève, inscription, tuteurs, parcours, événements et fratrie |
| `web/src/server/domain/dossier-eleve.ts` | Lecture des données scolaires et financières par type de permission |
| `web/src/app/(main)/dashboard/eleves/actions.ts` | Mutations d'identité, de responsable, de statut, de classe et validations |
| `web/src/app/(main)/dashboard/eleves/actions-reinscription.ts` | Réinscription et sauvegarde |
| `web/src/app/(main)/dashboard/eleves/[id]/photo-actions.ts` | Stockage photographique, journalisation |
| `web/src/app/(main)/dashboard/_actions/notifier-classe-canal.ts` | Prévisualisation, sélection de canal, coût, émission de notifications |
| `web/src/app/(main)/dashboard/_components/bouton-notifier.tsx` | Formulaire d'envoi, confirmations, erreurs et retour utilisateur |
| `web/src/app/api/fichiers/[id]/route.ts` | Accès aux fichiers binaires, rattachement élève/enseignant/parent et cache privé |
| `web/src/app/api/documents/[type]/[id]/route.ts` | Autorisation par ressource pour certificats, fiches et reçus |
| `web/src/server/pdf/service.tsx` | Génération et numérotation/traçabilité des documents ; non refondu |
| `web/src/server/stockage.ts` | Contrôle MIME et signature, quota, déduplication et lecture de fichiers |
| `web/src/server/guard/index.ts` et `permissions.ts` | Matrice rôle × action et périmètre classe/enfant |
| `web/src/server/auth/session.ts` | Session et rôle courant |
| `web/src/server/audit.ts` | Historisation des actions sensibles |

**Flux nominal :** authentification → vérification de l'identifiant → détermination minimale de la classe → autorisation `eleve:lire` sur la portée exacte → chargement du dossier → permissions par volet → requêtes autorisées uniquement → rendu des onglets. Les téléchargements et sauvegardes revérifient leurs permissions côté serveur.

## 4. Gentelella réel intégré
Sources officielles conservées sous `web/src/vendor/gentelella-v4/` avec licence MIT :
- `markup.js` : `statTile()` et `statusBadge()` effectivement utilisés ; champs dynamiques échappés.
- `scss/_layout.scss`, `_components.scss`, `_widgets.scss`, `_pages.scss` : cartes, tableaux, graphiques, activité et mise en page.
- `scss/_forms.scss` : champs, étiquettes, erreurs, aides, fichiers.
- `scss/_datatable.scss` : présentation des tableaux avancés.
- `scss/_apps.scss` : conventions pour les notifications et le gestionnaire de fichiers.

La conversion CSS nécessaire à Next.js est **scopée** à `.gentelella-v4`. Les sources SCSS upstream restent inchangées. Les tableaux utilisent les vraies classes Gentelella, tandis que Recharts — déjà installé — dessine les graphiques à partir des données métier. **Le moteur ECharts impératif et les jeux de données de démonstration Gentelella ne sont pas lancés dans la page.** Les actions restent des composants React sécurisés.

## 5. Observations et correctifs appliqués
| Gravité | Constat initial | Intervention |
|---|---|---|
| P0 | Métadonnées calculées à partir d'un élève sans contrôle préalable | Titre générique sans requête de dossier ni données identifiantes |
| P0 | `eleve:lire` évalué sans la classe de l'élève | Détermination de la classe et contrôle de portée avant lecture du dossier complet |
| P0 | API de fichiers : session seule suffisante | Contrôle des liens élève/parent/enseignant avant téléchargement, refus par défaut des autres fichiers, `no-store` |
| P0 | API PDF : document émis avec vérification d'action non contextualisée | Vérification de l'élève et de la classe associés au document ou au reçu |
| P1 | Volets scolaires chargés sans distinction des droits | Notes, assiduité, discipline, finances et période soumis à des flags serveur |
| P1 | Relevé chargé sur plusieurs périodes si aucune période courante | Une période exacte est requise ; résultat vide en son absence |
| P1 | Chargement fratrie : une requête par tuteur | Requête groupée par tous les tuteurs, déduplication par enfant |
| P1 | Âge calculé par approximation en jours | Calcul civil exact selon Africa/Ndjamena |
| P2 | Notes affichées uniquement en tableau | Courbe comparative élève/classe et tableau Gentelella |
| P2 | Documents émis surtout via menu déroulant | Tableau des documents émissibles, ouvrir/télécharger, sans toucher aux bulletins |
| P2 | Historiques dispersés | Structure `activity-list` officielle de Gentelella |
| P2 | Formulaires, notifications et boutons hétérogènes | Classes Gentelella réelles + ajustement local au design du lycée |

## 6. Points restant à valider
- Test réel avec les comptes de chaque rôle (`SUPER_ADMIN`, `DIRECTION`, `CENSEUR`, `SURVEILLANT`, `SECRETARIAT`, `COMPTABLE`, `ENSEIGNANT`, `PARENT`) : accès autorisé/refusé, partage involontaire et navigation.
- Essais API de photos avec parent d'un enfant et parent d'un autre enfant, professeur affecté/non affecté, agent autorisé/non autorisé.
- Vérification des **autres** actions administratives et notifications, qui doivent appliquer une portée élémentaire lorsque la matrice l'exige.
- Contrôle spécifique des associations de fichiers autres que les photos avant d'ouvrir leur lecture dans l'application.
- Chronométrage P50/P95 et nombre de requêtes en environnement réel ; pas de garantie de latence sans instrumenter.
- Tests des documents et prévisualisation dans une session autorisée, avec contrôle du cache et du nom de fichier.
- Tests visuels des dix rubriques, modales et graphiques en mode sombre, mobile, impression et faible bande passante.
- Règles de saisie des pièces justificatives, dates et informations de santé : jamais d'inférence automatique d'une valeur « négative » ou d'un document inexistant.

## 7. Décision d'architecture
Conserver React/Next.js, Drizzle/Neon, Recharts et les permissions existantes. Réutiliser les **vrais fichiers et classes** Gentelella, sans monter son application Vite complète, son routeur de démonstration ou ses données factices. Priorité aux correctifs vérifiables et à la cohérence entre listes Élèves/Parents/Personnel et fiche détaillée.
