# Gentelella v4.2.0 — sources intégrées au Lycée Guergné La Renaissance

Sources officielles, téléchargées depuis https://github.com/ColorlibHQ/gentelella
(version 4.2.0, branche master). Les fichiers source SCSS, markup.js,
main-v4.js et l'exemple HTML sont inclus sans modification.

Le tableau de bord Next.js /dashboard/default exécute les VRAIES fonctions
Gentelella v4 statTile(), statusBadge() et visitorRow() du fichier original.
Il utilise les déclarations CSS extraites des fichiers originaux
_layout.scss, _components.scss, _widgets.scss, sans réinterprétation graphique :
seuls les commentaires SCSS sont retirés pour disposer de CSS natif et les
sélecteurs sont isolés au moyen de @scope (.gentelella-v4).

Ce n'est pas l'insertion de l'application de démonstration Vite entière :
son shell de navigation et ses données factices écraseraient les permissions,
l'authentification et les données réelles de l'établissement. Le shell de
l'application reste donc celui de Next.js, et les graphiques restent raccordés
aux requêtes réelles de la base. Aucun nouveau service externe requis.

Licence : MIT. Copyright (c) 2014–2026 Aigars Silkalns & Colorlib.
Conserver le fichier LICENSE.txt avec toute redistribution.
