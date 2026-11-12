import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../modeles/modeles.dart';
import '../composants.dart';
import '../couleurs.dart';
import '../theme.dart';
import 'banniere_ecole.dart' show imageBatimentEcole;

/// Haut de l'accueil — maquette « vert profond ».
///
/// Tout ce qui se lit SUR le fond vert : l'en-tête de l'établissement, la
/// pilule de l'enfant, la carte de la moyenne et les trois chiffres de la
/// période. La feuille claire qui suit porte le reste (`feuille_accueil.dart`).
///
/// Le Design 3 posait une photo saturée derrière le nom de l'enfant ; ici la
/// photo n'est plus qu'un rappel fondu dans un coin, et c'est le vert foncé de
/// la charte qui porte l'écran. Moins de couleur, donc des chiffres qui se
/// lisent d'abord.
abstract final class TeintesAccueil {
  /// Haut du dégradé : le vert foncé de la charte, descendu d'un cran pour
  /// que la barre d'état s'y lise en blanc sans effort.
  static const vertNuit = Color(0xFF05301F);
  static const vertMoyen = Color(0xFF0A5A39);

  /// Pilule de l'onglet actif et pastille de la moyenne.
  static const vertVif = Color(0xFF1B8A54);

  /// Fond de la barre d'onglets.
  static const barre = Color(0xFF07382A);
}

/// Fond vert de l'accueil : dégradé, et le bâtiment fondu en haut à droite.
class FondAccueil extends StatelessWidget {
  const FondAccueil({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        const Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  TeintesAccueil.vertNuit,
                  Couleurs.primaireSombre,
                  TeintesAccueil.vertMoyen,
                ],
                stops: [0.0, 0.55, 1.0],
              ),
            ),
          ),
        ),
        // Le bâtiment n'est qu'une présence : fondu en cercle depuis le coin,
        // il s'efface avant d'atteindre le nom de l'établissement. Décoratif,
        // donc exclu de la lecture d'écran.
        Positioned(
          top: 0,
          right: 0,
          width: 220,
          height: 170,
          child: ExcludeSemantics(
            child: ShaderMask(
              blendMode: BlendMode.dstIn,
              shaderCallback: (zone) => const RadialGradient(
                center: Alignment(0.7, -0.6),
                radius: 0.9,
                colors: [Color(0x59FFFFFF), Color(0x00FFFFFF)],
              ).createShader(zone),
              child: Image.asset(
                imageBatimentEcole,
                fit: BoxFit.cover,
                alignment: const Alignment(-0.1, 0.25),
              ),
            ),
          ),
        ),
        child,
      ],
    );
  }
}

/// En-tête sur fond vert : blason, nom de l'établissement, cloche.
class EnteteAccueil extends StatelessWidget {
  const EnteteAccueil({
    super.key,
    required this.nonLues,
    required this.surNotifications,
  });

  /// Annonces non lues. Zéro masque le badge.
  final int nonLues;
  final VoidCallback surNotifications;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        ThemeLgr.espace,
        12,
        ThemeLgr.espace,
        14,
      ),
      child: Row(
        children: [
          Container(
            width: 54,
            height: 54,
            padding: const EdgeInsets.all(6),
            decoration: const BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
            ),
            child: SvgPicture.asset('assets/marque/logo.svg'),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                // Réduit plutôt que coupé : le nom de l'école ne se tronque pas.
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Lycée Guergné La Renaissance',
                    maxLines: 1,
                    style: ThemeLgr.inter(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.3,
                      color: Colors.white,
                    ),
                  ),
                ),
                const SizedBox(height: 3),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Éducation  •  Excellence  •  Avenir',
                    maxLines: 1,
                    style: ThemeLgr.inter(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: Colors.white.withValues(alpha: 0.86),
                    ).copyWith(fontStyle: FontStyle.italic),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Material(
            color: Colors.black.withValues(alpha: 0.28),
            borderRadius: BorderRadius.circular(15),
            clipBehavior: Clip.antiAlias,
            child: IconButton(
              onPressed: surNotifications,
              tooltip: nonLues == 0
                  ? 'Annonces'
                  : '$nonLues annonce${nonLues > 1 ? "s" : ""} non lue${nonLues > 1 ? "s" : ""}',
              style: IconButton.styleFrom(minimumSize: const Size(48, 48)),
              icon: Badge.count(
                count: nonLues,
                isLabelVisible: nonLues > 0,
                backgroundColor: Couleurs.danger,
                child: const Icon(
                  Icons.notifications_none_rounded,
                  size: 26,
                  color: Colors.white,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Pilule de l'enfant affiché : photo, nom, classe, et le chevron qui dit
/// qu'on peut en changer.
class PiluleEnfant extends StatelessWidget {
  const PiluleEnfant({
    super.key,
    required this.enfant,
    required this.plusieurs,
    required this.surAppui,
    this.urlPhoto,
    this.entetesPhoto,
  });

  final Enfant enfant;

  /// Plusieurs enfants rattachés : l'appui propose d'en changer.
  final bool plusieurs;
  final VoidCallback surAppui;
  final String? urlPhoto;
  final Map<String, String>? entetesPhoto;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Semantics(
      button: true,
      label:
          'Enfant affiché : ${enfant.nomComplet}, ${enfant.classe}. '
          '${plusieurs ? "Appuyer pour changer d'enfant." : "Appuyer pour voir le détail."}',
      excludeSemantics: true,
      child: Material(
        color: theme.colorScheme.surface,
        elevation: 3,
        shadowColor: Colors.black.withValues(alpha: 0.35),
        shape: const StadiumBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: surAppui,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(6, 6, 18, 6),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(2),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: theme.colorScheme.surface,
                    border: Border.all(color: theme.colorScheme.outline),
                  ),
                  child: ClipOval(
                    child: AvatarEleve(
                      nom: enfant.nom,
                      prenom: enfant.prenom,
                      taille: 52,
                      urlPhoto: urlPhoto,
                      entetesPhoto: entetesPhoto,
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        enfant.nomComplet,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontSize: 16.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${enfant.classe}  •  ${enfant.matricule}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall?.copyWith(
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Icon(
                  Icons.keyboard_arrow_down_rounded,
                  size: 30,
                  color: context.etat(Couleurs.primaire),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Carte de la moyenne générale et du rang, en verre sur le fond vert.
class CarteMoyenne extends StatelessWidget {
  const CarteMoyenne({
    super.key,
    required this.moyenne,
    required this.detail,
    required this.surAppui,
    this.rang,
    this.effectif,
  });

  /// Moyenne déjà mise en forme (« 16,33 »), ou `null` tant que le bulletin
  /// n'est pas publié.
  final String? moyenne;

  /// Ligne sous le chiffre : la moyenne de la classe, ou l'état du bulletin.
  final String detail;
  final int? rang;
  final int? effectif;
  final VoidCallback surAppui;

  @override
  Widget build(BuildContext context) {
    final blanc = Colors.white;

    return Semantics(
      button: true,
      label: [
        moyenne == null
            ? 'Moyenne générale non publiée'
            : 'Moyenne générale $moyenne sur 20',
        detail,
        if (rang != null)
          'Rang $rang${effectif == null ? "" : " sur $effectif"}',
      ].join(', '),
      excludeSemantics: true,
      child: Material(
        color: Colors.white.withValues(alpha: 0.07),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(22),
          side: BorderSide(color: Colors.white.withValues(alpha: 0.26)),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: surAppui,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 18, 12, 18),
            child: LayoutBuilder(
              builder: (context, contraintes) => IntrinsicHeight(
                child: Row(
                  children: [
                    // Sur un écran étroit, la coupe cède sa place au chiffre.
                    if (contraintes.maxWidth >= 330) ...[
                      Container(
                        width: 52,
                        height: 52,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.08),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          Icons.emoji_events_outlined,
                          color: blanc,
                          size: 30,
                        ),
                      ),
                      const SizedBox(width: 12),
                    ],
                    Expanded(
                      flex: 11,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            'Moyenne générale',
                            style: ThemeLgr.inter(
                              fontSize: 14.5,
                              fontWeight: FontWeight.w500,
                              color: blanc.withValues(alpha: 0.9),
                            ),
                          ),
                          const SizedBox(height: 4),
                          FittedBox(
                            fit: BoxFit.scaleDown,
                            alignment: Alignment.centerLeft,
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.baseline,
                              textBaseline: TextBaseline.alphabetic,
                              children: [
                                Text(
                                  moyenne ?? '—',
                                  style: ThemeLgr.nombre(
                                    ThemeLgr.inter(
                                      fontSize: 34,
                                      fontWeight: FontWeight.w700,
                                      letterSpacing: -0.8,
                                      height: 1.1,
                                      color: blanc,
                                    ),
                                  ),
                                ),
                                if (moyenne != null)
                                  Text(
                                    ' / 20',
                                    style: ThemeLgr.inter(
                                      fontSize: 20,
                                      fontWeight: FontWeight.w600,
                                      color: blanc,
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 5,
                            ),
                            decoration: BoxDecoration(
                              color: TeintesAccueil.vertVif,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: FittedBox(
                              fit: BoxFit.scaleDown,
                              child: Text(
                                detail,
                                maxLines: 1,
                                style: ThemeLgr.nombre(
                                  ThemeLgr.inter(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                    color: blanc,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      child: VerticalDivider(
                        width: 1,
                        thickness: 1,
                        color: blanc.withValues(alpha: 0.28),
                      ),
                    ),
                    Expanded(
                      flex: 8,
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          _Lauriers(rang: rang),
                          const SizedBox(height: 6),
                          FittedBox(
                            fit: BoxFit.scaleDown,
                            child: Text(
                              rang == null || effectif == null
                                  ? 'Rang de classe'
                                  : 'Rang sur $effectif',
                              maxLines: 1,
                              style: ThemeLgr.inter(
                                fontSize: 14,
                                fontWeight: FontWeight.w500,
                                color: blanc.withValues(alpha: 0.92),
                              ),
                            ),
                          ),
                        ],
                      ),
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

/// Le rang, entre deux branches de laurier dorées.
///
/// Le laurier est celui du blason. L'or n'a sa place que sur fond sombre —
/// voir `Couleurs.or` — et c'est exactement le cas ici.
class _Lauriers extends StatelessWidget {
  const _Lauriers({required this.rang});

  final int? rang;

  @override
  Widget build(BuildContext context) {
    final style = ThemeLgr.inter(
      fontSize: 32,
      fontWeight: FontWeight.w800,
      letterSpacing: -0.6,
      height: 1.0,
      color: Couleurs.or,
    );

    return SizedBox(
      width: 104,
      height: 62,
      child: CustomPaint(
        painter: const _PeintreLauriers(),
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 27),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: rang == null
                  ? Text('—', style: style)
                  : Row(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('$rang', style: ThemeLgr.nombre(style)),
                        Text(
                          rang == 1 ? 'er' : 'e',
                          style: style.copyWith(fontSize: 15, height: 1.3),
                        ),
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

class _PeintreLauriers extends CustomPainter {
  const _PeintreLauriers();

  static const _feuilles = 7;

  @override
  void paint(Canvas canvas, Size size) {
    final plein = Paint()..color = Couleurs.or;
    final trait = Paint()
      ..color = Couleurs.or
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4
      ..strokeCap = StrokeCap.round;
    final centre = size.center(Offset.zero);
    final rayonX = size.width * 0.40;
    final rayonY = size.height * 0.47;

    Offset surBranche(double t) {
      final angle = math.pi * (0.60 + 0.74 * t);
      return Offset(rayonX * math.cos(angle), rayonY * math.sin(angle));
    }

    for (final cote in const [1.0, -1.0]) {
      canvas.save();
      canvas.translate(centre.dx, centre.dy);
      canvas.scale(cote, 1);

      // Branche gauche, du bas vers le haut ; la droite est son miroir.
      final tige = Path()..moveTo(surBranche(0).dx, surBranche(0).dy);
      for (var i = 1; i <= 24; i++) {
        final point = surBranche(i / 24);
        tige.lineTo(point.dx, point.dy);
      }
      canvas.drawPath(tige, trait);

      for (var i = 0; i < _feuilles; i++) {
        final t = (i + 0.5) / _feuilles;
        final point = surBranche(t);
        final suivant = surBranche(t + 0.01);
        final pente = math.atan2(suivant.dy - point.dy, suivant.dx - point.dx);
        final longueur = size.height * (0.27 - 0.07 * t);

        // Deux feuilles par nœud : l'une s'ouvre vers l'extérieur, l'autre,
        // plus courte, vers le chiffre.
        for (final (ouverture, echelle) in const [(-0.62, 1.0), (0.62, 0.62)]) {
          canvas.save();
          canvas.translate(point.dx, point.dy);
          canvas.rotate(pente + ouverture);
          canvas.drawOval(
            Rect.fromCenter(
              center: Offset(longueur * echelle / 2, 0),
              width: longueur * echelle,
              height: longueur * echelle * 0.40,
            ),
            plein,
          );
          canvas.restore();
        }
      }
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(_PeintreLauriers ancien) => false;
}

/// Un des trois chiffres de la période.
class ChiffreSituation {
  const ChiffreSituation({
    required this.icone,
    required this.teinte,
    required this.valeur,
    required this.libelle,
    required this.surAppui,
    this.mention,
    this.teinteMention,
    this.teinteFond,
    this.fleche = false,
  });

  final IconData icone;

  /// Couleur de l'icône, et de la mention par défaut.
  final Color teinte;
  final String valeur;
  final String libelle;

  /// Pastille sous le libellé : « non justifiées », « sur la période ».
  final String? mention;
  final Color? teinteMention;

  /// Voile de couleur sur la carte entière, pour celle qui demande un regard.
  final Color? teinteFond;

  /// Flèche à la place de la pastille : la carte mène à un détail chiffré.
  final bool fleche;
  final VoidCallback surAppui;
}

/// Les trois cartes blanches posées sur le fond vert.
class CartesSituation extends StatelessWidget {
  const CartesSituation({super.key, required this.chiffres});

  final List<ChiffreSituation> chiffres;

  @override
  Widget build(BuildContext context) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final (i, chiffre) in chiffres.indexed) ...[
            if (i > 0) const SizedBox(width: 10),
            Expanded(child: _CarteChiffre(chiffre: chiffre)),
          ],
        ],
      ),
    );
  }
}

class _CarteChiffre extends StatelessWidget {
  const _CarteChiffre({required this.chiffre});

  final ChiffreSituation chiffre;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sombre = theme.brightness == Brightness.dark;
    final teinte = context.etat(chiffre.teinte);
    final mention = context.etat(chiffre.teinteMention ?? chiffre.teinte);
    final surface = theme.colorScheme.surface;

    return Semantics(
      button: true,
      label: [chiffre.libelle, chiffre.valeur, ?chiffre.mention].join(', '),
      excludeSemantics: true,
      child: Material(
        color: chiffre.teinteFond == null
            ? surface
            : Color.alphaBlend(
                chiffre.teinteFond!.withValues(alpha: sombre ? 0.14 : 0.09),
                surface,
              ),
        borderRadius: BorderRadius.circular(20),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: chiffre.surAppui,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(10, 14, 10, 12),
            child: Column(
              children: [
                Icon(chiffre.icone, size: 30, color: teinte),
                const SizedBox(height: 8),
                // Montant COMPLET, réduit s'il le faut, jamais abrégé.
                FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(
                    chiffre.valeur,
                    maxLines: 1,
                    style: ThemeLgr.nombre(
                      ThemeLgr.inter(
                        fontSize: 24,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.4,
                        height: 1.15,
                        color: theme.textTheme.titleLarge?.color,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 2),
                _libelle(theme),
                const Spacer(),
                const SizedBox(height: 8),
                if (chiffre.fleche)
                  Container(
                    width: 26,
                    height: 26,
                    decoration: BoxDecoration(
                      color: context.etat(Couleurs.primaire),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      Icons.chevron_right_rounded,
                      size: 21,
                      color: sombre ? Couleurs.fondSombre : Colors.white,
                    ),
                  )
                else if (chiffre.mention != null)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: mention.withValues(alpha: sombre ? 0.2 : 0.13),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        chiffre.mention!,
                        maxLines: 1,
                        style: ThemeLgr.inter(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: mention,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // Réduit plutôt que coupé : sur un écran étroit en grandes polices,
  // « Absences » se brisait au milieu du mot.
  Widget _libelle(ThemeData theme) => FittedBox(
    fit: BoxFit.scaleDown,
    child: Text(
      chiffre.libelle,
      maxLines: 1,
      style: theme.textTheme.bodyMedium?.copyWith(
        fontSize: 13.5,
        height: 1.25,
        color: theme.textTheme.titleMedium?.color,
      ),
    ),
  );
}
