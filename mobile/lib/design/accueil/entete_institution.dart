import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../couleurs.dart';
import '../theme.dart';

/// En-tête institutionnel de l'accueil (Design 3).
///
/// Logo à gauche, nom de l'établissement au centre, cloche à droite. Il est
/// volontairement CLAIR — fond de page, aucune couleur d'aplat — pour laisser
/// la bannière photographique, juste en dessous, porter seule l'émotion.
/// Deux blocs colorés empilés se disputeraient le regard.
class EnteteInstitution extends StatelessWidget {
  const EnteteInstitution({super.key, required this.nonLues, required this.surNotifications});

  /// Annonces non lues. Zéro masque le badge : un « 0 » rouge serait un
  /// signal sans objet.
  final int nonLues;
  final VoidCallback surNotifications;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sombre = theme.brightness == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.fromLTRB(ThemeLgr.espace, 10, 8, 12),
      child: Row(
        children: [
          // Le blason dans une pastille blanche, y compris en mode sombre :
          // le logo est dessiné pour un fond blanc et ses verts se perdraient
          // sur l'ardoise.
          Container(
            width: 46,
            height: 46,
            padding: const EdgeInsets.all(5),
            decoration: BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
              border: Border.all(color: Couleurs.or.withValues(alpha: 0.55), width: 1.5),
              boxShadow: [
                BoxShadow(
                  color: Couleurs.primaireSombre.withValues(alpha: sombre ? 0.0 : 0.08),
                  blurRadius: 10,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: SvgPicture.asset('assets/marque/logo.svg'),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                // `scaleDown` plutôt qu'une ellipse : « Lycée Guergné La
                // Ren… » couperait le nom de l'école, ce qu'aucun parent ne
                // lit comme un détail. Sur un très petit écran ou en grandes
                // polices, le nom rétrécit un peu mais reste entier.
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Lycée Guergné La Renaissance',
                    style: ThemeLgr.inter(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.3,
                      color: theme.textTheme.titleMedium?.color,
                    ),
                    maxLines: 1,
                  ),
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Text(
                      'LGR Parents',
                      style: ThemeLgr.inter(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: theme.colorScheme.primary,
                      ),
                    ),
                    const SizedBox(width: 8),
                    // Filet doré : la signature premium, discrète.
                    Flexible(
                      child: Container(
                        height: 2,
                        constraints: const BoxConstraints(maxWidth: 46),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(2),
                          gradient: LinearGradient(
                            colors: [Couleurs.or, Couleurs.or.withValues(alpha: 0)],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 4),
          IconButton(
            onPressed: surNotifications,
            tooltip: nonLues == 0
                ? 'Notifications'
                : '$nonLues notification${nonLues > 1 ? "s" : ""} non lue${nonLues > 1 ? "s" : ""}',
            style: IconButton.styleFrom(minimumSize: const Size(48, 48)),
            icon: Badge.count(
              count: nonLues,
              isLabelVisible: nonLues > 0,
              backgroundColor: Couleurs.danger,
              child: Icon(
                nonLues > 0 ? Icons.notifications_rounded : Icons.notifications_none_rounded,
                size: 26,
                color: theme.textTheme.titleMedium?.color,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
