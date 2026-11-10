import 'package:flutter/material.dart';

import 'couleurs.dart';
import 'theme.dart';

/// Une destination de la barre inférieure.
class DestinationParent {
  const DestinationParent({
    required this.libelle,
    required this.icone,
    required this.iconeActive,
    this.badge = 0,
  });

  final String libelle;
  final IconData icone;
  final IconData iconeActive;
  final int badge;
}

/// Barre de navigation inférieure de « LGR Parents » (Design 3).
///
/// L'onglet actif se reconnaît à TROIS signes à la fois : une pilule verte
/// pleine derrière l'icône, l'icône pleine plutôt qu'au trait, et le libellé
/// en gras. Un seul de ces signes suffirait sur un écran de bureau ; au
/// soleil, sur un écran d'entrée de gamme, c'est leur somme qui se lit.
///
/// Elle respecte la zone sécurisée du bas — barre de gestes d'Android,
/// indicateur d'accueil d'iOS — sans quoi le libellé passerait dessous.
class BarreNavigationParent extends StatelessWidget {
  const BarreNavigationParent({
    super.key,
    required this.destinations,
    required this.indexActif,
    required this.surChoix,
  });

  final List<DestinationParent> destinations;
  final int indexActif;
  final ValueChanged<int> surChoix;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sombre = theme.brightness == Brightness.dark;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(top: BorderSide(color: theme.colorScheme.outline)),
        boxShadow: sombre
            ? null
            : [
                BoxShadow(
                  color: Couleurs.encre.withValues(alpha: 0.06),
                  blurRadius: 16,
                  offset: const Offset(0, -4),
                ),
              ],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(6, 8, 6, 6),
          child: Row(
            children: [
              for (final (i, destination) in destinations.indexed)
                Expanded(
                  child: _Onglet(
                    destination: destination,
                    actif: i == indexActif,
                    position: i + 1,
                    total: destinations.length,
                    surAppui: () => surChoix(i),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Onglet extends StatelessWidget {
  const _Onglet({
    required this.destination,
    required this.actif,
    required this.position,
    required this.total,
    required this.surAppui,
  });

  final DestinationParent destination;
  final bool actif;
  final int position;
  final int total;
  final VoidCallback surAppui;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sombre = theme.brightness == Brightness.dark;
    final vert = sombre ? Couleurs.primaireClair : Couleurs.primaire;
    final inactif = theme.textTheme.bodySmall?.color ?? Couleurs.encreDouce;

    Widget icone = Icon(
      actif ? destination.iconeActive : destination.icone,
      size: 23,
      color: actif ? Colors.white : inactif,
    );
    if (destination.badge > 0) {
      icone = Badge.count(count: destination.badge, backgroundColor: Couleurs.danger, child: icone);
    }

    return Semantics(
      selected: actif,
      button: true,
      label: [
        destination.libelle,
        if (destination.badge > 0)
          '${destination.badge} non lue${destination.badge > 1 ? "s" : ""}',
        'onglet $position sur $total',
      ].join(', '),
      excludeSemantics: true,
      child: InkWell(
        onTap: surAppui,
        borderRadius: BorderRadius.circular(16),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 56),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              AnimatedContainer(
                duration: ThemeLgr.dureeCourte,
                curve: ThemeLgr.ressortDoux,
                width: actif ? 58 : 44,
                height: 32,
                decoration: BoxDecoration(
                  color: actif ? vert : Colors.transparent,
                  borderRadius: BorderRadius.circular(999),
                  boxShadow: actif && !sombre
                      ? [
                          BoxShadow(
                            color: vert.withValues(alpha: 0.28),
                            blurRadius: 8,
                            offset: const Offset(0, 3),
                          ),
                        ]
                      : null,
                ),
                alignment: Alignment.center,
                child: icone,
              ),
              const SizedBox(height: 4),
              // Libellé sur une ligne, réduit plutôt que coupé : « Assiduité »
              // en grandes polices dépasse la largeur d'un cinquième d'écran.
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  destination.libelle,
                  maxLines: 1,
                  style: ThemeLgr.inter(
                    fontSize: 11.5,
                    fontWeight: actif ? FontWeight.w700 : FontWeight.w500,
                    color: actif ? vert : inactif,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
