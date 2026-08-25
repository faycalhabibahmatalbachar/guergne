import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'couleurs.dart';

/// Thème de l'application.
///
/// Material 3, sans Material 3 Expressive : l'équipe Flutter ne le développe
/// pas encore et n'accepte pas de contributions dessus. On obtient donc
/// l'effet « expressif » à la main — courbes de ressort, rayons généreux,
/// typographie affirmée — plutôt qu'en attendant un composant qui n'existe pas.
///
/// La police est **chargée depuis les fichiers embarqués**, jamais depuis le
/// réseau : sur une connexion tchadienne, une police distante ferait clignoter
/// tout le texte au démarrage, ou ne se chargerait pas du tout.
abstract final class ThemeLgr {
  static const rayon = 16.0;
  static const rayonPetit = 12.0;
  static const espace = 16.0;

  /// Courbes inspirées des ressorts de Material 3 Expressive.
  ///
  /// Un mouvement qui dépasse légèrement sa cible avant de se poser paraît
  /// physique ; une interpolation linéaire paraît mécanique. La différence
  /// est ce qui sépare une application « correcte » d'une application agréable.
  static const ressortDoux = Cubic(0.34, 1.26, 0.64, 1.0);
  static const ressortVif = Cubic(0.22, 1.42, 0.36, 1.0);
  static const sortie = Cubic(0.4, 0.0, 0.2, 1.0);

  static const dureeCourte = Duration(milliseconds: 180);
  static const dureeMoyenne = Duration(milliseconds: 320);
  static const dureeLongue = Duration(milliseconds: 520);

  /// Famille embarquée. Voir `pubspec.yaml` : aucun appel réseau au démarrage.
  static const police = 'Inter';

  /// Style Inter ponctuel, hors TextTheme.
  static TextStyle inter({
    double? fontSize,
    FontWeight? fontWeight,
    Color? color,
    double? letterSpacing,
    double? height,
  }) => TextStyle(
    fontFamily: police,
    fontSize: fontSize,
    fontWeight: fontWeight,
    color: color,
    letterSpacing: letterSpacing,
    height: height,
  );

  static TextTheme _typographie(Color encre, Color encreDouce) {
    // Inter : excellente lisibilité aux petites tailles, et surtout des
    // chiffres tabulaires — indispensables pour aligner des colonnes de notes.
    final base = Typography.material2021().black.apply(fontFamily: police);

    return base.copyWith(
      displaySmall: base.displaySmall?.copyWith(
        fontWeight: FontWeight.w700,
        letterSpacing: -0.8,
        color: encre,
      ),
      headlineMedium: base.headlineMedium?.copyWith(
        fontWeight: FontWeight.w700,
        letterSpacing: -0.5,
        color: encre,
      ),
      headlineSmall: base.headlineSmall?.copyWith(
        fontWeight: FontWeight.w700,
        letterSpacing: -0.3,
        color: encre,
      ),
      titleLarge: base.titleLarge?.copyWith(fontWeight: FontWeight.w600, color: encre),
      titleMedium: base.titleMedium?.copyWith(fontWeight: FontWeight.w600, color: encre),
      titleSmall: base.titleSmall?.copyWith(fontWeight: FontWeight.w600, color: encre),
      bodyLarge: base.bodyLarge?.copyWith(color: encre, height: 1.5),
      bodyMedium: base.bodyMedium?.copyWith(color: encreDouce, height: 1.5),
      bodySmall: base.bodySmall?.copyWith(color: encreDouce, height: 1.45),
      labelLarge: base.labelLarge?.copyWith(fontWeight: FontWeight.w600, letterSpacing: 0.1),
    );
  }

  /// Style des nombres : chiffres tabulaires obligatoires.
  ///
  /// Sans eux, une colonne de moyennes se désaligne au caractère près et
  /// devient pénible à parcourir. C'est le détail qui distingue une table
  /// lisible d'une table brouillonne.
  static TextStyle nombre(TextStyle? base) =>
      (base ?? const TextStyle()).copyWith(fontFeatures: const [FontFeature.tabularFigures()]);

  /// Style des GRANDS chiffres — moyenne, absences, montants.
  ///
  /// Ce sont eux le sujet de l'accueil : un parent ouvre l'application pour
  /// lire quatre nombres. Ils méritent donc un traitement propre, et pas la
  /// taille de titre par défaut.
  ///
  /// Trois réglages, chacun pour une raison :
  ///   — chiffres TABULAIRES, sans quoi « 7,85 » et « 12,5 » ne s'alignent pas
  ///     d'une carte à l'autre et la grille tremble ;
  ///   — approche resserrée, parce qu'à cette taille l'espacement par défaut
  ///     d'Inter fait flotter les chiffres ;
  ///   — hauteur de ligne à 1, pour que la carte se cale sur le chiffre et non
  ///     sur l'interligne de la police.
  ///
  /// La graisse maximale d'Inter reste en deçà d'un vrai caractère de titrage.
  /// Le jour où une police display est déposée dans `assets/polices/`, c'est
  /// ICI qu'elle se branche — un seul endroit, et les quatre cartes suivent.
  static TextStyle chiffre({required Color couleur, double taille = 26}) => inter(
    fontSize: taille,
    fontWeight: FontWeight.w700,
    color: couleur,
  ).copyWith(
    letterSpacing: -taille * 0.032,
    height: 1.0,
    fontFeatures: const [FontFeature.tabularFigures()],
  );

  static ThemeData clair() => _construire(Brightness.light);
  static ThemeData sombre() => _construire(Brightness.dark);

  static ThemeData _construire(Brightness luminosite) {
    final sombre = luminosite == Brightness.dark;

    final encre = sombre ? Couleurs.encreSombre : Couleurs.encre;
    final encreDouce = sombre ? Couleurs.encreDouceSombre : Couleurs.encreDouce;
    final surface = sombre ? Couleurs.surfaceSombre : Couleurs.surface;
    final fond = sombre ? Couleurs.fondSombre : Couleurs.fond;
    final bordure = sombre ? Couleurs.bordureSombre : Couleurs.bordure;

    final schema = ColorScheme.fromSeed(seedColor: Couleurs.primaire, brightness: luminosite)
        .copyWith(
          primary: sombre ? Couleurs.primaireClair : Couleurs.primaire,
          secondary: Couleurs.accent,
          surface: surface,
          error: Couleurs.danger,
          outline: bordure,
        );

    return ThemeData(
      useMaterial3: true,
      colorScheme: schema,
      scaffoldBackgroundColor: fond,
      // Déclarée aussi au niveau du thème : certains widgets construisent leur
      // style sans passer par le TextTheme et retomberaient sur Roboto.
      fontFamily: police,
      textTheme: _typographie(encre, encreDouce),
      splashFactory: InkSparkle.splashFactory,

      appBarTheme: AppBarTheme(
        backgroundColor: fond,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: inter(
          fontSize: 19,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.3,
          color: encre,
        ),
        systemOverlayStyle: sombre ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
      ),

      cardTheme: CardThemeData(
        color: surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(rayon),
          side: BorderSide(color: bordure),
        ),
      ),

      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          // 52 dp : au-delà du minimum de 48, parce que l'application se
          // manipule souvent debout, en marchant, parfois d'une seule main.
          minimumSize: const Size(64, 52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(rayonPetit)),
          textStyle: inter(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),

      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(64, 52),
          side: BorderSide(color: bordure),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(rayonPetit)),
          textStyle: inter(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),

      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: sombre ? Couleurs.fondSombre : Couleurs.fond,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(rayonPetit),
          borderSide: BorderSide(color: bordure),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(rayonPetit),
          borderSide: BorderSide(color: bordure),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(rayonPetit),
          borderSide: BorderSide(color: schema.primary, width: 2),
        ),
      ),

      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        indicatorColor: schema.primary.withValues(alpha: 0.12),
        elevation: 0,
        height: 68,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (etats) => inter(
            fontSize: 11.5,
            fontWeight: etats.contains(WidgetState.selected) ? FontWeight.w600 : FontWeight.w500,
            color: etats.contains(WidgetState.selected) ? schema.primary : encreDouce,
          ),
        ),
      ),

      dividerTheme: DividerThemeData(color: bordure, thickness: 1, space: 1),

      chipTheme: ChipThemeData(
        backgroundColor: sombre ? Couleurs.fondSombre : Couleurs.fond,
        side: BorderSide(color: bordure),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        labelStyle: inter(fontSize: 12.5, fontWeight: FontWeight.w600),
      ),

      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: encre,
        contentTextStyle: inter(fontSize: 14, color: sombre ? Couleurs.encre : Colors.white),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(rayonPetit)),
      ),

      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        },
      ),
    );
  }
}
