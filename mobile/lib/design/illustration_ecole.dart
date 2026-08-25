import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'couleurs.dart';
/// Cadrage de la scène.
///
/// `large` montre l'établissement, les personnages y sont petits — c'est un
/// décor. `rapproche` avance la caméra jusqu'à ce que la mère et l'enfant
/// occupent quatre cinquièmes de la hauteur : ils deviennent le sujet, et le
/// bâtiment ne sert plus qu'à dire où l'on est.
///
/// Le cadrage rapproché est celui de l'écran de démarrage : c'est la seule
/// image que le parent voit avant d'entrer, elle doit parler de lui et de son
/// enfant, pas d'un bâtiment.
enum CadrageEcole { large, rapproche }

/// Scène de l'établissement : une mère, son enfant, la cour au petit matin.
///
/// POURQUOI DESSINÉE ET NON PHOTOGRAPHIÉE
/// ---------------------------------------
/// Une illustration matricielle de cette taille pèse 400 à 900 Ko. Quatre
/// écrans d'accueil, et l'APK gagne plusieurs mégaoctets — sur des téléphones
/// d'entrée de gamme, avec un forfait tchadien facturé au mégaoctet, c'est un
/// coût réel supporté par la famille avant même la première note consultée.
///
/// Ce peintre pèse quelques kilooctets de code, reste net à toutes les
/// densités, et se retourne en mode sombre sans seconde image.
///
/// POURQUOI GÉOMÉTRIQUE ET NON RÉALISTE
/// -------------------------------------
/// Un dessin qui vise le réalisme et le manque produit ce malaise particulier
/// des visages presque justes. Des formes franches, assumées comme des formes,
/// n'ont pas ce problème : on lit « une mère et son enfant » sans chercher à
/// reconnaître qui.
///
/// Aucun visage n'a de traits. C'est délibéré : l'établissement compte des
/// familles de toutes origines, et un visage dessiné en désigne toujours une.
/// La silhouette, elle, laisse chacun s'y reconnaître.
class IllustrationEcole extends StatelessWidget {
  const IllustrationEcole({
    super.key,
    this.animation,
    this.cadrage = CadrageEcole.large,
    this.fondu,
    this.proportion = 4 / 3,
  });

  /// Progression de 0 à 1 pour l'entrée en scène. `null` = scène posée.
  final Animation<double>? animation;

  final CadrageEcole cadrage;

  /// Couleur vers laquelle les bords haut et bas se fondent. `null` = pas de
  /// fondu, l'image garde ses arêtes franches.
  final Color? fondu;

  final double proportion;

  @override
  Widget build(BuildContext context) {
    final sombre = Theme.of(context).brightness == Brightness.dark;

    CustomPainter peintre(double t) => _PeintreEcole(t, sombre, cadrage, fondu);

    return AspectRatio(
      aspectRatio: proportion,
      child: animation == null
          ? CustomPaint(painter: peintre(1))
          : AnimatedBuilder(
              animation: animation!,
              builder: (_, _) => CustomPaint(painter: peintre(animation!.value)),
            ),
    );
  }
}

class _PeintreEcole extends CustomPainter {
  _PeintreEcole(this.progression, this.sombre, this.cadrage, this.fondu);

  final double progression;
  final bool sombre;
  final CadrageEcole cadrage;
  final Color? fondu;

  // Palette locale de la scène. Elle dérive du blason : laurier, marine, or.
  // Les valeurs sombres ne sont pas les claires assombries — un bâtiment de
  // nuit ne se lit pas comme un bâtiment de jour baissé en luminosité.
  Color get _ciel => sombre ? const Color(0xFF0D1830) : const Color(0xFFF3F7F2);
  Color get _cielHaut => sombre ? const Color(0xFF152444) : const Color(0xFFE6F0E6);
  Color get _mur => sombre ? const Color(0xFF1C2B46) : const Color(0xFFFBFAF6);
  Color get _murOmbre => sombre ? const Color(0xFF16223A) : const Color(0xFFEFEDE4);
  Color get _toit => sombre ? const Color(0xFF0B4A28) : Couleurs.primaire;
  Color get _vitre => sombre ? const Color(0xFF0E7A3C) : const Color(0xFF13763A);
  Color get _sol => sombre ? const Color(0xFF111C33) : const Color(0xFFEDEEE7);
  Color get _feuillage => sombre ? const Color(0xFF14532D) : const Color(0xFF1B7A3C);
  Color get _feuillageClair => sombre ? const Color(0xFF166534) : const Color(0xFF2A9553);
  Color get _peau => sombre ? const Color(0xFF6B4B34) : const Color(0xFF7A5236);
  Color get _peauClaire => sombre ? const Color(0xFF7C5940) : const Color(0xFF8D6244);
  Color get _pagne => sombre ? const Color(0xFFB08A4E) : Couleurs.accent;
  Color get _uniforme => sombre ? const Color(0xFF0E5F2C) : Couleurs.primaire;

  @override
  void paint(Canvas toile, Size taille) {
    final l = taille.width;
    final h = taille.height;

    // L'entrée se fait par plans : le décor d'abord, les personnages ensuite.
    // Tout arriver ensemble donne une image qui « apparaît » ; par plans, elle
    // se construit, ce que l'œil lit comme du soin.
    final decor = _etape(0.0, 0.55);
    final gens = _etape(0.35, 1.0);

    // La scène est toujours composée dans le même repère ; seul le cadrage
    // change. Redessiner une seconde scène « rapprochée » aurait dédoublé
    // chaque proportion, et les deux auraient divergé à la première retouche.
    toile.save();
    if (cadrage == CadrageEcole.rapproche) {
      // Foyer aux pieds des personnages : en agrandissant autour de ce point,
      // ils restent posés au sol au lieu de dériver vers le haut.
      const facteur = 1.42;
      final foyer = Offset(l * 0.52, h * 0.90);
      toile.translate(foyer.dx, foyer.dy);
      toile.scale(facteur);
      toile.translate(-foyer.dx, -foyer.dy);
    }

    _peindreCiel(toile, l, h);
    _peindreSoleil(toile, l, h, decor);
    _peindreBatiment(toile, l, h, decor);
    _peindreSol(toile, l, h);
    _peindreVegetation(toile, l, h, decor);
    _peindrePersonnages(toile, l, h, gens);
    toile.restore();

    _peindreFondu(toile, l, h);
  }

  /// Fondu des bords vers la couleur de l'écran.
  ///
  /// Sans lui, l'illustration se termine par une arête horizontale nette au
  /// milieu de la page — l'œil la lit comme le bord d'une image collée. Avec,
  /// la scène semble sortir du papier.
  void _peindreFondu(Canvas toile, double l, double h) {
    final vers = fondu;
    if (vers == null) return;

    // Haut : court, il ne doit qu'effacer la ligne de ciel.
    toile.drawRect(
      Rect.fromLTWH(0, 0, l, h * 0.22),
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [vers, vers.withValues(alpha: 0)],
        ).createShader(Rect.fromLTWH(0, 0, l, h * 0.22)),
    );

    // Bas : long, il avale le sol et les pieds. C'est ce qui donne
    // l'impression que les personnages s'avancent vers le lecteur.
    toile.drawRect(
      Rect.fromLTWH(0, h * 0.46, l, h * 0.54),
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [vers.withValues(alpha: 0), vers.withValues(alpha: 0.55), vers],
          stops: const [0.0, 0.58, 0.92],
        ).createShader(Rect.fromLTWH(0, h * 0.46, l, h * 0.54)),
    );

    // Côtés : très courts, ils suppriment les bords verticaux sans rogner la
    // scène.
    for (final gauche in [true, false]) {
      final r = gauche
          ? Rect.fromLTWH(0, 0, l * 0.10, h)
          : Rect.fromLTWH(l * 0.90, 0, l * 0.10, h);
      toile.drawRect(
        r,
        Paint()
          ..shader = LinearGradient(
            begin: gauche ? Alignment.centerLeft : Alignment.centerRight,
            end: gauche ? Alignment.centerRight : Alignment.centerLeft,
            colors: [vers, vers.withValues(alpha: 0)],
          ).createShader(r),
      );
    }
  }

  /// Progression d'une sous-séquence, adoucie.
  double _etape(double debut, double fin) {
    final brut = ((progression - debut) / (fin - debut)).clamp(0.0, 1.0);
    return Curves.easeOutCubic.transform(brut);
  }

  // ------------------------------------------------------------------ Ciel
  void _peindreCiel(Canvas toile, double l, double h) {
    final fond = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [_cielHaut, _ciel],
      ).createShader(Rect.fromLTWH(0, 0, l, h));
    toile.drawRect(Rect.fromLTWH(0, 0, l, h), fond);
  }

  void _peindreSoleil(Canvas toile, double l, double h, double t) {
    // Halo bas et large : la lumière de 7 h à N'Djamena, au moment où les
    // familles arrivent. Un soleil haut et blanc dirait midi, quand la cour
    // est vide.
    final centre = Offset(l * 0.78, h * 0.19);
    final rayon = h * 0.34 * t;
    if (rayon <= 0) return;

    toile.drawCircle(
      centre,
      rayon,
      Paint()
        ..shader = RadialGradient(
          colors: [
            Couleurs.accent.withValues(alpha: sombre ? 0.10 : 0.22),
            Couleurs.accent.withValues(alpha: 0.0),
          ],
        ).createShader(Rect.fromCircle(center: centre, radius: rayon)),
    );

    toile.drawCircle(
      centre,
      h * 0.055 * t,
      Paint()..color = Couleurs.accentClair.withValues(alpha: sombre ? 0.30 : 0.55),
    );
  }

  // -------------------------------------------------------------- Bâtiment
  void _peindreBatiment(Canvas toile, double l, double h, double t) {
    if (t <= 0) return;
    toile.save();
    // Le bâtiment monte de quelques pixels : un déplacement court se lit comme
    // une prise de place, un déplacement long comme une chute.
    toile.translate(0, (1 - t) * h * 0.05);

    final opacite = Paint()..color = Colors.white.withValues(alpha: t);
    toile.saveLayer(Rect.fromLTWH(0, 0, l, h), opacite);

    final baseY = h * 0.72;

    // --- Aile gauche, en retrait ---
    _corpsBatiment(
      toile,
      Rect.fromLTRB(l * 0.02, h * 0.44, l * 0.33, baseY),
      etages: 2,
      fenetresParEtage: 3,
      ombre: true,
    );

    // --- Aile droite, en retrait ---
    _corpsBatiment(
      toile,
      Rect.fromLTRB(l * 0.67, h * 0.44, l * 0.98, baseY),
      etages: 2,
      fenetresParEtage: 3,
      ombre: true,
    );

    // --- Corps central, avancé ---
    final centre = Rect.fromLTRB(l * 0.29, h * 0.33, l * 0.71, baseY);
    _corpsBatiment(toile, centre, etages: 2, fenetresParEtage: 4, ombre: false);

    // --- Fronton ---
    final fronton = Path()
      ..moveTo(centre.left - l * 0.02, centre.top)
      ..lineTo(centre.center.dx, centre.top - h * 0.11)
      ..lineTo(centre.right + l * 0.02, centre.top)
      ..close();
    toile.drawPath(fronton, Paint()..color = _toit);

    // Étoile du fronton : rappel du blason sans le recopier. Un logo redessiné
    // dans une illustration se dégrade toujours ; un signe simple, jamais.
    _etoile(
      toile,
      Offset(centre.center.dx, centre.top - h * 0.045),
      h * 0.026,
      Paint()..color = Couleurs.accentClair,
    );

    // --- Porche ---
    final porche = Rect.fromLTRB(
      centre.center.dx - l * 0.055,
      baseY - h * 0.19,
      centre.center.dx + l * 0.055,
      baseY,
    );
    toile.drawRRect(
      RRect.fromRectAndCorners(
        porche,
        topLeft: Radius.circular(l * 0.055),
        topRight: Radius.circular(l * 0.055),
      ),
      Paint()..color = _vitre,
    );
    toile.drawRect(
      Rect.fromLTRB(porche.center.dx - 0.7, porche.top + h * 0.05, porche.center.dx + 0.7, baseY),
      Paint()..color = _mur.withValues(alpha: 0.6),
    );

    // --- Marches ---
    for (var i = 0; i < 3; i++) {
      final marge = l * 0.012 * (i + 1);
      toile.drawRect(
        Rect.fromLTRB(
          porche.left - marge,
          baseY + i * h * 0.012,
          porche.right + marge,
          baseY + (i + 1) * h * 0.012,
        ),
        Paint()..color = i.isEven ? _murOmbre : _mur,
      );
    }

    toile.restore();
    toile.restore();
  }

  void _corpsBatiment(
    Canvas toile,
    Rect r, {
    required int etages,
    required int fenetresParEtage,
    required bool ombre,
  }) {
    toile.drawRect(r, Paint()..color = ombre ? _murOmbre : _mur);

    // Bandeau de toit
    toile.drawRect(
      Rect.fromLTRB(r.left - r.width * 0.03, r.top - r.height * 0.05, r.right + r.width * 0.03, r.top),
      Paint()..color = _toit,
    );

    // Motif sahélien sur le pilier de gauche : losanges gravés, comme sur les
    // façades de N'Djamena. C'est ce détail qui situe l'école quelque part.
    final pilier = Rect.fromLTRB(r.left, r.top, r.left + r.width * 0.13, r.bottom);
    toile.drawRect(pilier, Paint()..color = _toit.withValues(alpha: 0.14));
    final trait = Paint()
      ..color = _toit.withValues(alpha: 0.5)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.1;
    final pas = pilier.width * 0.62;
    for (var y = pilier.top + pas * 0.5; y < pilier.bottom - pas * 0.2; y += pas) {
      final c = Offset(pilier.center.dx, y);
      toile.drawPath(
        Path()
          ..moveTo(c.dx, c.dy - pas * 0.34)
          ..lineTo(c.dx + pas * 0.30, c.dy)
          ..lineTo(c.dx, c.dy + pas * 0.34)
          ..lineTo(c.dx - pas * 0.30, c.dy)
          ..close(),
        trait,
      );
    }

    // Fenêtres
    final zone = Rect.fromLTRB(r.left + r.width * 0.20, r.top, r.right, r.bottom);
    final hEtage = zone.height / etages;
    final lFenetre = zone.width / (fenetresParEtage + 0.7);

    for (var e = 0; e < etages; e++) {
      for (var f = 0; f < fenetresParEtage; f++) {
        final x = zone.left + lFenetre * (f + 0.32);
        final y = zone.top + hEtage * e + hEtage * 0.26;
        final fenetre = RRect.fromRectAndRadius(
          Rect.fromLTWH(x, y, lFenetre * 0.66, hEtage * 0.44),
          Radius.circular(lFenetre * 0.1),
        );
        toile.drawRRect(fenetre, Paint()..color = _vitre);
        // Reflet : un simple triangle clair en haut à gauche. Sans lui, une
        // fenêtre est un trou ; avec, c'est du verre.
        toile.drawPath(
          Path()
            ..moveTo(fenetre.left, fenetre.top)
            ..lineTo(fenetre.left + fenetre.width * 0.55, fenetre.top)
            ..lineTo(fenetre.left, fenetre.top + fenetre.height * 0.62)
            ..close(),
          Paint()..color = Colors.white.withValues(alpha: sombre ? 0.06 : 0.18),
        );
      }
    }
  }

  // ------------------------------------------------------------------- Sol
  void _peindreSol(Canvas toile, double l, double h) {
    toile.drawRect(Rect.fromLTRB(0, h * 0.72, l, h), Paint()..color = _sol);
    // Le parvis s'éclaircit vers le bas : la lumière rasante du matin frappe
    // le sol de la cour avant les murs.
    toile.drawRect(
      Rect.fromLTRB(0, h * 0.72, l, h),
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Colors.black.withValues(alpha: sombre ? 0.12 : 0.05),
            Colors.transparent,
          ],
        ).createShader(Rect.fromLTRB(0, h * 0.72, l, h)),
    );
  }

  // ------------------------------------------------------------ Végétation
  void _peindreVegetation(Canvas toile, double l, double h, double t) {
    if (t <= 0) return;

    // Palmes basses aux deux bords : elles cadrent la scène et cachent la
    // jointure entre le bâtiment et le format de l'image.
    _touffe(toile, Offset(l * 0.055, h * 0.90), h * 0.30 * t, 1, l, h);
    _touffe(toile, Offset(l * 0.945, h * 0.90), h * 0.32 * t, -1, l, h);
    _touffe(toile, Offset(l * 0.17, h * 0.94), h * 0.20 * t, 1, l, h);
    _touffe(toile, Offset(l * 0.86, h * 0.95), h * 0.18 * t, -1, l, h);
  }

  void _touffe(Canvas toile, Offset pied, double taille, int sens, double l, double h) {
    if (taille <= 0) return;
    const nb = 7;
    for (var i = 0; i < nb; i++) {
      final part = i / (nb - 1);
      // Éventail de −70° à +20°, penché du côté demandé.
      final angle = (-math.pi * 0.62 + part * math.pi * 0.72) * sens;
      final longueur = taille * (0.68 + 0.32 * math.sin(part * math.pi));
      final bout = pied + Offset(math.sin(angle) * longueur, -math.cos(angle) * longueur * 0.85);
      final milieu = Offset.lerp(pied, bout, 0.5)! + Offset(sens * taille * 0.10, -taille * 0.06);

      final palme = Path()
        ..moveTo(pied.dx, pied.dy)
        ..quadraticBezierTo(milieu.dx, milieu.dy, bout.dx, bout.dy)
        ..quadraticBezierTo(
          milieu.dx + sens * taille * 0.09,
          milieu.dy + taille * 0.10,
          pied.dx,
          pied.dy,
        )
        ..close();

      toile.drawPath(
        palme,
        Paint()..color = i.isEven ? _feuillage : _feuillageClair,
      );
    }
  }

  // ---------------------------------------------------------- Personnages
  void _peindrePersonnages(Canvas toile, double l, double h, double t) {
    if (t <= 0) return;

    toile.save();
    toile.saveLayer(
      Rect.fromLTWH(0, 0, l, h),
      Paint()..color = Colors.white.withValues(alpha: t),
    );
    toile.translate(0, (1 - t) * h * 0.035);

    final solY = h * 0.985;

    // Ombres portées : deux ellipses. Sans elles, les silhouettes flottent.
    for (final o in [
      (Offset(l * 0.455, solY), l * 0.13),
      (Offset(l * 0.585, solY), l * 0.10),
    ]) {
      toile.drawOval(
        Rect.fromCenter(center: o.$1, width: o.$2, height: h * 0.022),
        Paint()..color = Colors.black.withValues(alpha: sombre ? 0.22 : 0.09),
      );
    }

    _mere(toile, l, h);
    _enfant(toile, l, h);

    toile.restore();
    toile.restore();
  }

  void _mere(Canvas toile, double l, double h) {
    final cx = l * 0.455;
    final basY = h * 0.985;
    final hautY = h * 0.40; // sommet du foulard

    // Rapport épaules / tête : la première version était à 4:1, la nature
    // est autour de 2,6:1. Une silhouette trop large à petite tête ne se lit
    // plus comme une personne mais comme une masse.
    final largeurEpaules = l * 0.094;

    // --- Jupe / pagne : trapèze évasé ---
    final pagne = Path()
      ..moveTo(cx - largeurEpaules * 0.62, h * 0.66)
      ..lineTo(cx + largeurEpaules * 0.62, h * 0.66)
      ..lineTo(cx + largeurEpaules * 0.74, basY)
      ..lineTo(cx - largeurEpaules * 0.74, basY)
      ..close();
    toile.drawPath(pagne, Paint()..color = _pagne);

    // Rayures du pagne : deux traits obliques, pas un motif complet. Un tissu
    // entièrement motivé attirerait l'œil au bas de l'image, où il n'y a rien
    // à lire.
    final rayure = Paint()
      ..color = Colors.white.withValues(alpha: 0.22)
      ..style = PaintingStyle.stroke
      ..strokeWidth = h * 0.008;
    toile.save();
    toile.clipPath(pagne);
    for (var i = 0; i < 2; i++) {
      final y = h * (0.80 + i * 0.055);
      toile.drawLine(Offset(cx - largeurEpaules, y), Offset(cx + largeurEpaules, y + h * 0.012), rayure);
    }
    toile.restore();

    // --- Buste ---
    final buste = Path()
      ..moveTo(cx - largeurEpaules * 0.72, h * 0.53)
      ..quadraticBezierTo(cx - largeurEpaules * 0.86, h * 0.60, cx - largeurEpaules * 0.66, h * 0.675)
      ..lineTo(cx + largeurEpaules * 0.66, h * 0.675)
      ..quadraticBezierTo(cx + largeurEpaules * 0.86, h * 0.60, cx + largeurEpaules * 0.72, h * 0.53)
      ..quadraticBezierTo(cx, h * 0.485, cx - largeurEpaules * 0.72, h * 0.53)
      ..close();
    toile.drawPath(
      buste,
      Paint()..color = (sombre ? const Color(0xFFD8D2C4) : const Color(0xFFEFE9DA))
          .withValues(alpha: sombre ? 0.82 : 1),
    );

    // Veste ouverte, en or : c'est elle qui donne à la silhouette son autorité
    // tranquille. Une mère qui accompagne, pas une figurante.
    for (final sens in [-1, 1]) {
      final pan = Path()
        ..moveTo(cx + sens * largeurEpaules * 0.72, h * 0.525)
        ..quadraticBezierTo(
          cx + sens * largeurEpaules * 0.92,
          h * 0.60,
          cx + sens * largeurEpaules * 0.74,
          h * 0.70,
        )
        ..lineTo(cx + sens * largeurEpaules * 0.30, h * 0.70)
        ..quadraticBezierTo(
          cx + sens * largeurEpaules * 0.46,
          h * 0.59,
          cx + sens * largeurEpaules * 0.40,
          h * 0.505,
        )
        ..close();
      toile.drawPath(pan, Paint()..color = _pagne.withValues(alpha: 0.92));
    }

    // --- Bras droit : autour de l'épaule de l'enfant ---
    final bras = Path()
      ..moveTo(cx + largeurEpaules * 0.66, h * 0.545)
      ..quadraticBezierTo(cx + largeurEpaules * 1.35, h * 0.60, cx + largeurEpaules * 1.42, h * 0.665)
      ..lineTo(cx + largeurEpaules * 1.18, h * 0.685)
      ..quadraticBezierTo(cx + largeurEpaules * 1.05, h * 0.615, cx + largeurEpaules * 0.60, h * 0.60)
      ..close();
    toile.drawPath(bras, Paint()..color = _pagne.withValues(alpha: 0.92));
    // Main
    toile.drawCircle(
      Offset(cx + largeurEpaules * 1.32, h * 0.678),
      h * 0.017,
      Paint()..color = _peauClaire,
    );

    // --- Bras gauche replié, tenant le téléphone ---
    final brasG = Path()
      ..moveTo(cx - largeurEpaules * 0.70, h * 0.545)
      ..quadraticBezierTo(cx - largeurEpaules * 1.10, h * 0.605, cx - largeurEpaules * 0.86, h * 0.655)
      ..lineTo(cx - largeurEpaules * 0.62, h * 0.635)
      ..quadraticBezierTo(cx - largeurEpaules * 0.72, h * 0.590, cx - largeurEpaules * 0.50, h * 0.560)
      ..close();
    toile.drawPath(brasG, Paint()..color = _pagne.withValues(alpha: 0.92));

    // Téléphone : l'objet est petit et net. C'est le seul rectangle parfait de
    // toute l'image, donc le seul point où l'œil s'arrête — et c'est le sujet.
    final tel = RRect.fromRectAndRadius(
      Rect.fromCenter(
        center: Offset(cx - largeurEpaules * 0.96, h * 0.615),
        width: l * 0.030,
        height: h * 0.072,
      ),
      Radius.circular(l * 0.007),
    );
    toile.drawRRect(tel, Paint()..color = sombre ? const Color(0xFF0A1A2E) : const Color(0xFF14213A));
    toile.drawRRect(
      RRect.fromRectAndRadius(tel.outerRect.deflate(l * 0.0035), Radius.circular(l * 0.005)),
      Paint()..color = Couleurs.primaireClair.withValues(alpha: 0.92),
    );
    toile.drawCircle(
      Offset(cx - largeurEpaules * 0.96, h * 0.600),
      l * 0.006,
      Paint()..color = Colors.white.withValues(alpha: 0.85),
    );
    toile.drawCircle(
      Offset(cx - largeurEpaules * 0.86, h * 0.585),
      h * 0.016,
      Paint()..color = _peauClaire,
    );

    // --- Cou et tête ---
    toile.drawRect(
      Rect.fromCenter(center: Offset(cx, h * 0.480), width: l * 0.026, height: h * 0.034),
      Paint()..color = _peau,
    );
    toile.drawOval(
      Rect.fromCenter(center: Offset(cx, h * 0.432), width: l * 0.070, height: h * 0.094),
      Paint()..color = _peau,
    );

    // Foulard noué : volume derrière la tête, pointe sur le côté. Un couvre-
    // chef courant à N'Djamena, dessiné assez neutre pour n'imposer aucune
    // appartenance.
    final foulard = Path()
      ..addOval(Rect.fromCenter(center: Offset(cx, h * 0.404), width: l * 0.086, height: h * 0.078))
      ..addOval(Rect.fromCenter(center: Offset(cx + l * 0.031, h * 0.422), width: l * 0.046, height: h * 0.048));
    toile.drawPath(foulard, Paint()..color = _pagne);
    toile.drawPath(
      Path()
        ..moveTo(cx + l * 0.030, h * 0.432)
        ..quadraticBezierTo(cx + l * 0.055, h * 0.452, cx + l * 0.040, h * 0.478)
        ..quadraticBezierTo(cx + l * 0.030, h * 0.455, cx + l * 0.022, h * 0.442)
        ..close(),
      Paint()..color = _pagne.withValues(alpha: 0.86),
    );

    // Boucle d'oreille : un point d'or. Un seul détail de parure suffit à
    // faire une personne plutôt qu'une forme.
    toile.drawCircle(
      Offset(cx - l * 0.026, h * 0.455),
      l * 0.005,
      Paint()..color = Couleurs.accentClair,
    );

    if (hautY < 0) return; // garde-fou : jamais atteint, documente l'intention
  }

  void _enfant(Canvas toile, double l, double h) {
    final cx = l * 0.565;
    final basY = h * 0.985;
    final largeur = l * 0.072;

    // --- Jupe de l'uniforme ---
    toile.drawPath(
      Path()
        ..moveTo(cx - largeur * 0.58, h * 0.775)
        ..lineTo(cx + largeur * 0.58, h * 0.775)
        ..lineTo(cx + largeur * 0.76, basY)
        ..lineTo(cx - largeur * 0.76, basY)
        ..close(),
      Paint()..color = _uniforme,
    );

    // --- Buste, cardigan vert ---
    toile.drawPath(
      Path()
        ..moveTo(cx - largeur * 0.66, h * 0.645)
        ..quadraticBezierTo(cx - largeur * 0.80, h * 0.71, cx - largeur * 0.62, h * 0.785)
        ..lineTo(cx + largeur * 0.62, h * 0.785)
        ..quadraticBezierTo(cx + largeur * 0.80, h * 0.71, cx + largeur * 0.66, h * 0.645)
        ..quadraticBezierTo(cx, h * 0.605, cx - largeur * 0.66, h * 0.645)
        ..close(),
      Paint()..color = _uniforme,
    );

    // Col de chemise blanc : deux triangles. C'est ce qui dit « uniforme »
    // plutôt que « pull ».
    for (final sens in [-1, 1]) {
      toile.drawPath(
        Path()
          ..moveTo(cx, h * 0.628)
          ..lineTo(cx + sens * largeur * 0.26, h * 0.622)
          ..lineTo(cx, h * 0.685)
          ..close(),
        Paint()..color = const Color(0xFFF9F7F1),
      );
    }

    // --- Cartable, sangle sur l'épaule ---
    toile.drawPath(
      Path()
        ..moveTo(cx - largeur * 0.62, h * 0.660)
        ..lineTo(cx - largeur * 0.44, h * 0.652)
        ..lineTo(cx - largeur * 0.10, h * 0.790)
        ..lineTo(cx - largeur * 0.28, h * 0.798)
        ..close(),
      Paint()..color = Couleurs.accent.withValues(alpha: 0.85),
    );
    toile.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(
          center: Offset(cx + largeur * 0.86, h * 0.735),
          width: l * 0.036,
          height: h * 0.086,
        ),
        Radius.circular(l * 0.010),
      ),
      Paint()..color = Couleurs.accent,
    );

    // --- Bras ---
    toile.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(cx - largeur * 0.80, h * 0.665, largeur * 0.22, h * 0.115),
        Radius.circular(largeur * 0.11),
      ),
      Paint()..color = _uniforme,
    );
    toile.drawCircle(Offset(cx - largeur * 0.69, h * 0.788), h * 0.014, Paint()..color = _peau);

    // --- Cou et tête ---
    toile.drawRect(
      Rect.fromCenter(center: Offset(cx, h * 0.600), width: l * 0.017, height: h * 0.024),
      Paint()..color = _peau,
    );
    toile.drawOval(
      Rect.fromCenter(center: Offset(cx, h * 0.564), width: l * 0.058, height: h * 0.076),
      Paint()..color = _peau,
    );

    // Coiffure : deux chignons. Un enfant se reconnaît à sa coiffure autant
    // qu'à sa taille — sans elle, la silhouette lit comme une adulte petite.
    toile.drawOval(
      Rect.fromCenter(center: Offset(cx, h * 0.540), width: l * 0.064, height: h * 0.048),
      Paint()..color = const Color(0xFF241A14),
    );
    for (final sens in [-1, 1]) {
      toile.drawCircle(
        Offset(cx + sens * l * 0.031, h * 0.530),
        l * 0.016,
        Paint()..color = const Color(0xFF241A14),
      );
    }
    toile.drawCircle(
      Offset(cx - l * 0.026, h * 0.536),
      l * 0.005,
      Paint()..color = Couleurs.accentClair,
    );
  }

  void _etoile(Canvas toile, Offset c, double r, Paint p) {
    final chemin = Path();
    for (var i = 0; i < 10; i++) {
      final rayon = i.isEven ? r : r * 0.44;
      final a = -math.pi / 2 + i * math.pi / 5;
      final point = c + Offset(math.cos(a) * rayon, math.sin(a) * rayon);
      i == 0 ? chemin.moveTo(point.dx, point.dy) : chemin.lineTo(point.dx, point.dy);
    }
    toile.drawPath(chemin..close(), p);
  }

  @override
  bool shouldRepaint(_PeintreEcole ancien) =>
      ancien.progression != progression ||
      ancien.sombre != sombre ||
      ancien.cadrage != cadrage ||
      ancien.fondu != fondu;
}
