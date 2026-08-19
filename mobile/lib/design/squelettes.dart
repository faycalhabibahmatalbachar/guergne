import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';

import 'couleurs.dart';
import 'theme.dart';

/// Squelettes de chargement.
///
/// Un squelette qui reprend la FORME du contenu à venir vaut mieux qu'une roue
/// centrée : l'œil se place avant que la donnée n'arrive, et l'attente paraît
/// plus courte à durée égale. Les blocs ci-dessous copient donc la géométrie
/// exacte des cartes réelles.
class Squelette extends StatelessWidget {
  const Squelette({super.key, required this.largeur, required this.hauteur, this.rayon = 8});

  final double largeur;
  final double hauteur;
  final double rayon;

  @override
  Widget build(BuildContext context) {
    final sombre = Theme.of(context).brightness == Brightness.dark;

    return Shimmer.fromColors(
      baseColor: sombre ? Couleurs.bordureSombre : Couleurs.bordure,
      highlightColor: sombre ? Couleurs.surfaceSombre : const Color(0xFFF1F5F9),
      // Assez lent pour ne pas scintiller — un shimmer rapide fatigue l'œil.
      period: const Duration(milliseconds: 1400),
      child: Container(
        width: largeur,
        height: hauteur,
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(rayon)),
      ),
    );
  }
}

/// Squelette d'une carte d'indicateur.
class SqueletteCarte extends StatelessWidget {
  const SqueletteCarte({super.key, this.hauteur = 96});

  final double hauteur;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      height: hauteur,
      padding: const EdgeInsets.all(ThemeLgr.espace),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(ThemeLgr.rayon),
        border: Border.all(color: theme.colorScheme.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: const [
          Squelette(largeur: 90, hauteur: 11),
          Squelette(largeur: 64, hauteur: 24),
          Squelette(largeur: 120, hauteur: 10),
        ],
      ),
    );
  }
}

/// Squelette d'une ligne de liste (matière, événement, échéance).
class SqueletteLigne extends StatelessWidget {
  const SqueletteLigne({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(ThemeLgr.espace),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(ThemeLgr.rayon),
        border: Border.all(color: theme.colorScheme.outline),
      ),
      child: Row(
        children: [
          const Squelette(largeur: 44, hauteur: 44, rayon: 14),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                Squelette(largeur: 150, hauteur: 13),
                SizedBox(height: 8),
                Squelette(largeur: 96, hauteur: 11),
              ],
            ),
          ),
          const Squelette(largeur: 48, hauteur: 22, rayon: 11),
        ],
      ),
    );
  }
}

/// Liste de squelettes, pour remplir un écran en cours de chargement.
class SqueletteListe extends StatelessWidget {
  const SqueletteListe({super.key, this.nombre = 5});

  final int nombre;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: const EdgeInsets.all(ThemeLgr.espace),
      itemCount: nombre,
      separatorBuilder: (_, _) => const SizedBox(height: 12),
      itemBuilder: (_, _) => const SqueletteLigne(),
    );
  }
}
