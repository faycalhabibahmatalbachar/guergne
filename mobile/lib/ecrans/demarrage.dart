import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../design/couleurs.dart';
import '../design/illustration_ecole.dart';
import '../design/theme.dart';

/// Écran de démarrage.
///
/// IL PROLONGE LE SPLASH NATIF, IL NE LE REMPLACE PAS
/// ----------------------------------------------------
/// Android affiche sa propre image avant que Flutter ne démarre. Si celle-ci
/// diffère, le lancement montre un clignotement — image native, fond blanc,
/// application — que l'œil perçoit comme un défaut même sans savoir le nommer.
/// Même fond, même blason, à la même place : la transition devient invisible.
///
/// CE QU'IL NE FAIT PAS
/// ---------------------
/// Il ne dure pas. Aucune temporisation décorative n'est ajoutée : l'écran
/// vit le temps de relire les jetons du coffre sécurisé, et disparaît. Une
/// « belle animation de trois secondes » au lancement est une taxe payée à
/// chaque ouverture par quelqu'un qui voulait juste voir une note.
///
/// L'illustration n'apparaît donc QUE si le démarrage traîne au-delà de
/// 900 ms — réseau lent, téléphone chargé. Dans ce cas seulement, le parent a
/// besoin de comprendre que quelque chose se passe.
class EcranDemarrage extends StatefulWidget {
  const EcranDemarrage({super.key});

  @override
  State<EcranDemarrage> createState() => _EtatDemarrage();
}

class _EtatDemarrage extends State<EcranDemarrage> with SingleTickerProviderStateMixin {
  late final AnimationController _controleur;
  bool _longAttente = false;

  @override
  void initState() {
    super.initState();
    _controleur = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100));

    // Le seuil est mesuré depuis l'affichage, pas depuis le lancement du
    // processus : c'est le temps que le parent ressent.
    Future<void>.delayed(const Duration(milliseconds: 900), () {
      if (!mounted) return;
      setState(() => _longAttente = true);
      _controleur.forward();
    });
  }

  @override
  void dispose() {
    _controleur.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: DecoratedBox(
        decoration: const BoxDecoration(gradient: Couleurs.gradientMarque),
        child: SafeArea(
          child: Column(
            children: [
              const Spacer(flex: 3),

              // Blason et nom : présents dès la première image, à la position
              // exacte du splash natif.
              SizedBox(
                width: 128,
                height: 128,
                child: SvgPicture.asset('assets/marque/logo.svg'),
              ),
              const SizedBox(height: ThemeLgr.espace + 6),
              const Text(
                'Lycée Guergné\nLa Renaissance',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 21,
                  height: 1.25,
                  fontWeight: FontWeight.w600,
                  letterSpacing: -0.3,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'EXCELLENCE · DISCIPLINE · AVENIR',
                style: TextStyle(
                  color: Couleurs.accentClair.withValues(alpha: 0.95),
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 2.2,
                ),
              ),

              const Spacer(flex: 2),

              // L'illustration ne se déploie que si l'attente se prolonge.
              AnimatedSize(
                duration: ThemeLgr.dureeMoyenne,
                curve: ThemeLgr.ressortDoux,
                child: _longAttente
                    ? Padding(
                        padding: const EdgeInsets.symmetric(horizontal: ThemeLgr.espace),
                        child: IllustrationEcole(animation: _controleur),
                      )
                    : const SizedBox.shrink(),
              ),

              const Spacer(flex: 2),

              SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2.2,
                  color: Colors.white.withValues(alpha: 0.72),
                ),
              ),
              const SizedBox(height: 12),
              AnimatedOpacity(
                opacity: _longAttente ? 1 : 0,
                duration: ThemeLgr.dureeMoyenne,
                child: Text(
                  // Un message honnête plutôt qu'un « Chargement… » creux :
                  // il dit ce qui se passe, donc combien de temps ça peut durer.
                  'Connexion à l’établissement…',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.72),
                    fontSize: 12.5,
                  ),
                ),
              ),
              const SizedBox(height: ThemeLgr.espace * 2),
            ],
          ),
        ),
      ),
    );
  }
}
