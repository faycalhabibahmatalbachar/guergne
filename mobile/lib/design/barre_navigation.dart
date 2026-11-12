import 'package:flutter/material.dart';

import 'accueil/haut_accueil.dart' show TeintesAccueil;
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

/// Barre de navigation inférieure de « LGR Parents » — maquette « vert
/// profond ».
///
/// Elle est vert foncé, en clair comme en sombre : c'est elle qui referme
/// l'écran, en écho au haut de l'accueil. L'onglet actif se reconnaît à TROIS
/// signes à la fois : une pilule verte pleine qui englobe l'icône et le
/// libellé, l'icône pleine plutôt qu'au trait, et le libellé en gras. Un seul
/// suffirait sur un écran de bureau ; au soleil, sur un écran d'entrée de
/// gamme, c'est leur somme qui se lit.
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
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: TeintesAccueil.barre,
        borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
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
    final couleur = Colors.white.withValues(alpha: actif ? 1.0 : 0.86);

    Widget icone = Icon(
      actif ? destination.iconeActive : destination.icone,
      size: 25,
      color: couleur,
    );
    if (destination.badge > 0) {
      icone = Badge.count(
        count: destination.badge,
        backgroundColor: Couleurs.danger,
        child: icone,
      );
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
        borderRadius: BorderRadius.circular(20),
        child: AnimatedContainer(
          duration: ThemeLgr.dureeCourte,
          curve: ThemeLgr.sortie,
          constraints: const BoxConstraints(minHeight: 58),
          padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 8),
          decoration: BoxDecoration(
            color: actif
                ? TeintesAccueil.vertVif
                : TeintesAccueil.vertVif.withValues(alpha: 0),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Column(
            // `min`, sans quoi la barre dévore l'écran : le `Scaffold` offre à
            // sa barre inférieure toute la hauteur disponible, une `Column`
            // la prend par défaut, et le corps de la page se retrouve à zéro
            // pixel — onglets au milieu d'un écran vide.
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              icone,
              const SizedBox(height: 5),
              // Libellé sur une ligne, réduit plutôt que coupé : « Assiduité »
              // en grandes polices dépasse la largeur d'un cinquième d'écran.
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  destination.libelle,
                  maxLines: 1,
                  style: ThemeLgr.inter(
                    fontSize: 12,
                    fontWeight: actif ? FontWeight.w700 : FontWeight.w500,
                    color: couleur,
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
