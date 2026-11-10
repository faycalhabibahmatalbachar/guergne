import 'package:flutter/material.dart';

import '../composants.dart';
import '../couleurs.dart';
import '../theme.dart';

/// Un service de l'accès rapide.
class ServiceRapide {
  const ServiceRapide({
    required this.libelle,
    required this.icone,
    required this.teinte,
    required this.surAppui,
    this.badge = 0,
  });

  final String libelle;
  final IconData icone;

  /// Teinte d'identité du service. Choisie dans la palette d'identité de
  /// l'école (vert, marine, or, sarcelle, indigo, brun) — JAMAIS dans les
  /// couleurs d'état : une tuile « Paiements » rouge annoncerait un impayé
  /// à un parent qui est à jour.
  final Color teinte;
  final VoidCallback surAppui;

  /// Compteur affiché sur l'icône (annonces non lues). Zéro le masque.
  final int badge;
}

/// Teintes d'identité des services, partagées avec l'écran « Plus ».
abstract final class TeintesServices {
  static const bulletins = Couleurs.primaire;
  static const resultats = Color(0xFF1E429F);
  static const emploiDuTemps = Couleurs.orSombre;
  static const paiements = Color(0xFF0E7490);
  static const annonces = Color(0xFF5B4B8A);
  static const vieScolaire = Color(0xFF8A5A2B);
}

/// Grille des accès rapides : trois colonnes, deux sur un très petit écran.
class GrilleServices extends StatelessWidget {
  const GrilleServices({super.key, required this.services});

  final List<ServiceRapide> services;

  @override
  Widget build(BuildContext context) {
    const ecart = 12.0;
    return LayoutBuilder(
      builder: (context, contraintes) {
        final largeur = contraintes.maxWidth;
        // 300 dp : en dessous, trois tuiles feraient moins de 92 dp et
        // « Emploi du temps » passerait sur trois lignes.
        final colonnes = largeur >= 600 ? 6 : (largeur >= 300 ? 3 : 2);
        final largeurTuile = (largeur - ecart * (colonnes - 1)) / colonnes;

        return Wrap(
          spacing: ecart,
          runSpacing: ecart,
          children: [
            for (final (i, service) in services.indexed)
              SizedBox(
                width: largeurTuile,
                child: ApparitionCascade(
                  index: i,
                  decalage: 35,
                  enfant: CarteService(service: service),
                ),
              ),
          ],
        );
      },
    );
  }
}

/// Tuile d'un service : icône teintée, libellé court.
class CarteService extends StatelessWidget {
  const CarteService({super.key, required this.service});

  final ServiceRapide service;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sombre = theme.brightness == Brightness.dark;
    final teinte = sombre ? Color.lerp(service.teinte, Colors.white, 0.45)! : service.teinte;
    final rayon = BorderRadius.circular(18);

    final icone = Container(
      width: 46,
      height: 46,
      decoration: BoxDecoration(
        color: teinte.withValues(alpha: sombre ? 0.18 : 0.10),
        borderRadius: BorderRadius.circular(15),
      ),
      child: Icon(service.icone, size: 24, color: teinte),
    );

    return Semantics(
      button: true,
      label: service.badge > 0
          ? '${service.libelle}, ${service.badge} non lue${service.badge > 1 ? "s" : ""}'
          : service.libelle,
      excludeSemantics: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: rayon,
          boxShadow: sombre
              ? null
              : [
                  BoxShadow(
                    color: Couleurs.encre.withValues(alpha: 0.045),
                    blurRadius: 10,
                    offset: const Offset(0, 3),
                  ),
                ],
        ),
        child: Material(
          color: theme.colorScheme.surface,
          shape: RoundedRectangleBorder(
            borderRadius: rayon,
            side: BorderSide(color: theme.colorScheme.outline),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: service.surAppui,
            child: ConstrainedBox(
              // 104 dp minimum : la cible tactile reste généreuse même quand
              // le libellé tient sur une seule ligne.
              constraints: const BoxConstraints(minHeight: 104),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 14, 8, 12),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (service.badge > 0)
                      Badge.count(
                        count: service.badge,
                        backgroundColor: Couleurs.danger,
                        child: icone,
                      )
                    else
                      icone,
                    const SizedBox(height: 10),
                    Text(
                      service.libelle,
                      textAlign: TextAlign.center,
                      style: ThemeLgr.inter(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        height: 1.2,
                        color: theme.textTheme.titleSmall?.color,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
