import 'package:flutter/material.dart';

import '../../modeles/modeles.dart';
import '../../outils/formats.dart';
import '../couleurs.dart';
import '../theme.dart';

/// Carte « Dernière annonce » : une seule annonce, mise en valeur.
///
/// Une seule, et pas trois comme l'ancien accueil : trois cartes d'annonce
/// repoussaient tout le reste sous la ligne de flottaison, alors qu'elles
/// ont leur propre écran. Celle-ci donne envie d'aller le voir, sans
/// prendre sa place.
class CarteDerniereAnnonce extends StatelessWidget {
  const CarteDerniereAnnonce({super.key, required this.annonce, required this.surLire});

  final Annonce annonce;

  /// Ouvre l'annonce en entier.
  final VoidCallback surLire;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sombre = theme.brightness == Brightness.dark;
    final vert = context.etat(Couleurs.primaire);
    final rayon = BorderRadius.circular(18);

    // Fond ivoire doré, à peine teinté : la carte se distingue des tuiles
    // blanches sans emprunter une couleur d'état.
    final fond = sombre
        ? theme.colorScheme.surface
        : Color.alphaBlend(Couleurs.or.withValues(alpha: 0.10), Colors.white);

    return Semantics(
      button: true,
      label:
          '${annonce.lue ? "" : "Nouvelle annonce. "}${annonce.titre}. ${dateRelative(annonce.publierLe)}. Lire plus.',
      excludeSemantics: true,
      child: Material(
        color: fond,
        shape: RoundedRectangleBorder(
          borderRadius: rayon,
          side: BorderSide(color: Couleurs.or.withValues(alpha: sombre ? 0.35 : 0.45)),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: surLire,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 10, 14),
            child: Row(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: vert.withValues(alpha: sombre ? 0.2 : 0.12),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Icon(Icons.campaign_rounded, color: vert, size: 28),
                ),
                const SizedBox(width: 12),
                Container(width: 1.5, height: 52, color: vert.withValues(alpha: 0.25)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          if (annonce.epinglee) ...[
                            Icon(
                              Icons.push_pin_rounded,
                              size: 13,
                              color: context.etat(Couleurs.orSombre),
                            ),
                            const SizedBox(width: 4),
                          ],
                          // « Nouveau » écrit en toutes lettres : un point
                          // coloré seul échapperait à un parent daltonien.
                          if (!annonce.lue) ...[
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1.5),
                              decoration: BoxDecoration(
                                color: vert,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                'NOUVEAU',
                                style: ThemeLgr.inter(
                                  fontSize: 9.5,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 0.6,
                                  color: sombre ? Couleurs.encre : Colors.white,
                                ),
                              ),
                            ),
                            const SizedBox(width: 6),
                          ],
                          Flexible(
                            child: Text(
                              // Le destinataire, et non « Dernière annonce » :
                              // le titre de section le dit déjà.
                              annonce.classe == null
                                  ? 'Tous les parents'
                                  : 'Classe ${annonce.classe}',
                              style: ThemeLgr.inter(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: vert,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        annonce.titre,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: annonce.lue ? FontWeight.w600 : FontWeight.w700,
                          height: 1.3,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 10,
                        runSpacing: 2,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.calendar_today_rounded,
                                size: 13,
                                color: theme.textTheme.bodySmall?.color,
                              ),
                              const SizedBox(width: 5),
                              Text(
                                dateRelative(annonce.publierLe),
                                style: theme.textTheme.bodySmall?.copyWith(fontSize: 11.5),
                              ),
                            ],
                          ),
                          Text(
                            'Lire plus',
                            style: ThemeLgr.inter(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w700,
                              color: vert,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: vert, size: 26),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
