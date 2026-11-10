import 'package:flutter/material.dart';

import '../couleurs.dart';
import '../theme.dart';

/// Titre de section de l'accueil : icône, intitulé, action à droite.
///
/// L'action est un vrai bouton de 40 dp de haut, pas un simple texte
/// cliquable : « Tout voir » se vise du pouce, souvent d'une seule main.
class TitreSection extends StatelessWidget {
  const TitreSection({
    super.key,
    required this.titre,
    this.icone,
    this.action,
    this.surAction,
    this.fin,
  });

  final String titre;
  final IconData? icone;
  final String? action;
  final VoidCallback? surAction;

  /// Élément libre à droite, à la place de l'action (une pastille d'année…).
  final Widget? fin;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final vert = context.etat(Couleurs.primaire);

    final libelle = Text(
      titre,
      style: theme.textTheme.titleMedium?.copyWith(
        fontSize: 17,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.2,
      ),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
    );

    return Row(
      children: [
        if (icone != null) ...[Icon(icone, size: 21, color: vert), const SizedBox(width: 8)],
        // Avec une pastille à droite, le titre — toujours court — garde sa
        // largeur naturelle et c'est la pastille qui RÉTRÉCIT : sur 320 dp en
        // grandes polices, elle faisait disparaître « Situation » entièrement.
        // Avec un bouton d'action, le titre prend toute la place restante.
        if (fin != null) ...[
          libelle,
          const SizedBox(width: 10),
          Expanded(
            child: Align(
              alignment: Alignment.centerRight,
              child: FittedBox(fit: BoxFit.scaleDown, child: fin),
            ),
          ),
        ] else
          Expanded(child: libelle),
        if (action != null && surAction != null)
          TextButton(
            onPressed: surAction,
            style: TextButton.styleFrom(
              foregroundColor: vert,
              padding: const EdgeInsets.symmetric(horizontal: 10),
              minimumSize: const Size(0, 40),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              textStyle: ThemeLgr.inter(fontSize: 13.5, fontWeight: FontWeight.w600),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(action!),
                const SizedBox(width: 4),
                const Icon(Icons.arrow_forward_rounded, size: 17),
              ],
            ),
          ),
      ],
    );
  }
}

/// Pastille d'information discrète, non interactive (année scolaire…).
class PastilleInfo extends StatelessWidget {
  const PastilleInfo({super.key, required this.texte, this.icone});

  final String texte;
  final IconData? icone;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final vert = context.etat(Couleurs.primaire);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: vert.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: vert.withValues(alpha: 0.18)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icone != null) ...[Icon(icone, size: 14, color: vert), const SizedBox(width: 5)],
          Text(
            texte,
            style: theme.textTheme.labelMedium?.copyWith(
              color: vert,
              fontWeight: FontWeight.w600,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}
