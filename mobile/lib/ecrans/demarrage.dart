import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../design/couleurs.dart';
import '../design/illustration_ecole.dart';
import '../design/theme.dart';

/// Écran de démarrage — un seul écran, celui que le parent voit au lancement.
///
/// LA COMPOSITION SE LIT DE HAUT EN BAS, EN TROIS TEMPS
/// -----------------------------------------------------
/// Le blason et le nom disent QUI parle. L'illustration dit À QUI l'on parle —
/// une mère et son enfant, pas un bâtiment. La phrase dit CE QU'ON PROPOSE.
/// Le chargement vient en dernier parce que c'est la seule chose dont le
/// parent se moque.
///
/// FOND PARCHEMIN, PAS FOND VERT
/// -------------------------------
/// Un aplat de couleur pleine page est ce que font toutes les applications
/// d'école, et il écrase l'illustration. Sur un blanc cassé, c'est le vert du
/// blason et des uniformes qui porte l'identité — la couleur reste dans le
/// dessin, là où elle raconte quelque chose.
///
/// IL NE DURE PAS
/// ---------------
/// Aucune temporisation décorative : l'écran vit le temps de relire les jetons
/// du coffre sécurisé, puis disparaît. Une animation de trois secondes au
/// lancement est une taxe payée à chaque ouverture par quelqu'un qui voulait
/// voir une note.
///
/// IL DURE UN PLANCHER, PAS UN DÉLAI
/// ----------------------------------
/// La lecture du coffre sécurisé prend moins de cinquante millisecondes :
/// sans plancher, l'écran de marque disparaîtrait avant d'avoir été lu. Le
/// plancher est posé dans `sessionProvider` — 1,6 s — et n'ajoute RIEN sur un
/// téléphone lent où la restauration dépasse déjà cette durée. Attendre puis
/// charger aurait coûté cette seconde et demie à tout le monde.
class EcranDemarrage extends StatefulWidget {
  const EcranDemarrage({super.key});

  @override
  State<EcranDemarrage> createState() => _EtatDemarrage();
}

class _EtatDemarrage extends State<EcranDemarrage> with TickerProviderStateMixin {
  late final AnimationController _entree;
  late final AnimationController _rotation;

  @override
  void initState() {
    super.initState();

    _entree = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))
      ..forward();
    _rotation = AnimationController(vsync: this, duration: const Duration(milliseconds: 1150))
      ..repeat();
  }

  @override
  void dispose() {
    _entree.dispose();
    _rotation.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sombre = theme.brightness == Brightness.dark;
    final fond = sombre ? Couleurs.parcheminSombre : Couleurs.parchemin;
    final encre = sombre ? Couleurs.encreSombre : Couleurs.primaireSombre;

    return Scaffold(
      backgroundColor: fond,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, contraintes) {
            // L'illustration prend la place qui reste une fois le texte posé,
            // au lieu d'une hauteur fixe : sur un petit écran elle se réduit,
            // et rien ne déborde. Une valeur en dur ferait défiler l'écran de
            // démarrage, ce qui n'a aucun sens.
            final hautIllustration = (contraintes.maxHeight * 0.34).clamp(150.0, 300.0);

            return Column(
              children: [
                const Spacer(flex: 2),

                // --- 1. Qui parle ---
                _Entree(
                  animation: _entree,
                  debut: 0.0,
                  child: Column(
                    children: [
                      SizedBox(
                        width: 96,
                        height: 96,
                        child: SvgPicture.asset('assets/marque/logo.svg'),
                      ),
                      const SizedBox(height: 14),
                      Text(
                        'Lycée Guergné\nRenaissance',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.headlineSmall?.copyWith(
                          color: encre,
                          fontWeight: FontWeight.w700,
                          height: 1.18,
                          letterSpacing: -0.6,
                        ),
                      ),
                    ],
                  ),
                ),

                const Spacer(flex: 2),

                // --- 2. À qui l'on parle ---
                _Entree(
                  animation: _entree,
                  debut: 0.12,
                  // `ClipRect` n'est pas décoratif : `FittedBox` ne découpe
                  // PAS par défaut, et l'illustration agrandie repeignait
                  // par-dessus le nom de l'école juste au-dessus. Le défaut
                  // ne se voyait qu'à la capture — dans le code, tout avait
                  // l'air en ordre.
                  child: ClipRect(
                    child: SizedBox(
                      height: hautIllustration,
                      width: double.infinity,
                      child: FittedBox(
                        fit: BoxFit.cover,
                        clipBehavior: Clip.hardEdge,
                        child: SizedBox(
                          width: contraintes.maxWidth,
                          height: contraintes.maxWidth * 0.78,
                          child: IllustrationEcole(
                            animation: _entree,
                            cadrage: CadrageEcole.rapproche,
                            proportion: 1 / 0.78,
                            fondu: fond,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),

                const Spacer(flex: 2),

                // --- 3. Ce qu'on propose ---
                _Entree(
                  animation: _entree,
                  debut: 0.30,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: ThemeLgr.espace * 2),
                    child: Column(
                      children: [
                        Text(
                          'Suivez la scolarité de\nvotre enfant, simplement.',
                          textAlign: TextAlign.center,
                          style: theme.textTheme.titleLarge?.copyWith(
                            color: encre,
                            fontWeight: FontWeight.w700,
                            height: 1.25,
                            letterSpacing: -0.5,
                          ),
                        ),
                        const SizedBox(height: 14),
                        // Filet d'or : une seule ligne de 44 px. C'est le seul
                        // ornement de l'écran, et il sépare la promesse de son
                        // explication — il fait donc un travail.
                        Container(
                          width: 44,
                          height: 2,
                          decoration: BoxDecoration(
                            color: Couleurs.accent,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                        const SizedBox(height: 14),
                        Text(
                          'Ses notes, ses absences et sa situation de\n'
                          'scolarité, tenues à jour par l’établissement.',
                          textAlign: TextAlign.center,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: sombre ? Couleurs.encreDouceSombre : Couleurs.encreDouce,
                            height: 1.55,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                const Spacer(flex: 3),

                // --- 4. Ce dont le parent se moque ---
                _Entree(
                  animation: _entree,
                  debut: 0.45,
                  child: Column(
                    children: [
                      _Rouet(rotation: _rotation),
                      const SizedBox(height: 12),
                      Text(
                        'Chargement en cours…',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: Couleurs.encreLegere,
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: ThemeLgr.espace * 2),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// Apparition douce, décalée dans le temps.
///
/// Chaque bloc entre un peu après le précédent. Tout arriver ensemble donne une
/// image qui « apparaît » ; en cascade, elle se construit — ce que l'œil lit
/// comme du soin sans savoir le nommer.
class _Entree extends StatelessWidget {
  const _Entree({required this.animation, required this.debut, required this.child});

  final Animation<double> animation;
  final double debut;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final courbe = CurvedAnimation(
      parent: animation,
      curve: Interval(debut, (debut + 0.55).clamp(0.0, 1.0), curve: Curves.easeOutCubic),
    );

    return AnimatedBuilder(
      animation: courbe,
      builder: (_, enfant) => Opacity(
        opacity: courbe.value,
        child: Transform.translate(
          offset: Offset(0, (1 - courbe.value) * 16),
          child: enfant,
        ),
      ),
      child: child,
    );
  }
}

/// Indicateur de chargement : un arc vert, un point d'or à son extrémité.
///
/// Le point n'est pas décoratif. Un arc seul qui tourne est ambigu quand il
/// ralentit : on ne sait plus s'il avance. Un repère mobile lève le doute, et
/// reprend au passage les deux couleurs du blason.
class _Rouet extends StatelessWidget {
  const _Rouet({required this.rotation});

  final Animation<double> rotation;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 30,
      height: 30,
      child: AnimatedBuilder(
        animation: rotation,
        builder: (_, _) => CustomPaint(painter: _PeintreRouet(rotation.value)),
      ),
    );
  }
}

class _PeintreRouet extends CustomPainter {
  _PeintreRouet(this.t);

  final double t;

  @override
  void paint(Canvas toile, Size taille) {
    final centre = taille.center(Offset.zero);
    final rayon = taille.width / 2 - 2.2;
    final depart = t * 2 * math.pi;
    const balayage = math.pi * 1.45;

    toile.drawArc(
      Rect.fromCircle(center: centre, radius: rayon),
      depart,
      balayage,
      false,
      Paint()
        ..color = Couleurs.primaire
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.4
        ..strokeCap = StrokeCap.round,
    );

    final bout = centre +
        Offset(math.cos(depart + balayage) * rayon, math.sin(depart + balayage) * rayon);
    toile.drawCircle(bout, 2.9, Paint()..color = Couleurs.accent);
  }

  @override
  bool shouldRepaint(_PeintreRouet ancien) => ancien.t != t;
}
