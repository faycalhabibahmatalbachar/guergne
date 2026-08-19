import 'package:flutter/material.dart';

/// Palette du Lycée Guergné La Renaissance.
///
/// Reprend exactement l'identité de l'application web : un bleu institutionnel
/// profond, réchauffé d'un ocre sahélien. Ce n'est pas un choix décoratif —
/// un parent doit reconnaître son école d'un coup d'œil, et la cohérence entre
/// le portail web et le téléphone fait partie de cette reconnaissance.
///
/// Contrainte majeure : l'application se consulte souvent **en plein soleil**,
/// sur des écrans d'entrée de gamme. Les contrastes sont donc poussés au-delà
/// du minimum AA, et aucune information ne repose sur la seule couleur.
abstract final class Couleurs {
  // --- Identité ---
  static const primaire = Color(0xFF1E429F);
  static const primaireClair = Color(0xFF3B63C4);
  static const primaireSombre = Color(0xFF15306F);
  static const accent = Color(0xFFC98A3C);
  static const accentClair = Color(0xFFE0A85C);

  // --- États ---
  // Chaque couleur porte UN sens et un seul. Le vert ne sert jamais à un
  // bouton d'action générique, sans quoi il perdrait sa valeur d'alerte.
  static const succes = Color(0xFF15803D); // présent, payé, admis
  static const succesFond = Color(0xFFDCFCE7);
  static const alerte = Color(0xFFB45309); // retard, échéance proche
  static const alerteFond = Color(0xFFFEF3C7);
  static const danger = Color(0xFFB91C1C); // absence non justifiée, impayé
  static const dangerFond = Color(0xFFFEE2E2);
  static const info = Color(0xFF1D4ED8);
  static const infoFond = Color(0xFFDBEAFE);

  // --- Neutres ---
  static const encre = Color(0xFF0F172A);
  static const encreDouce = Color(0xFF475569);
  static const encreLegere = Color(0xFF94A3B8);
  static const bordure = Color(0xFFE2E8F0);
  static const surface = Color(0xFFFFFFFF);
  static const fond = Color(0xFFF8FAFC);

  // --- États, mode sombre ---
  // Les teintes claires sont ILLISIBLES sur fond sombre : le bleu #1D4ED8 sur
  // #161F32 donne un contraste de 2,5:1, très en dessous du minimum de 4,5:1
  // exigé pour du texte. On remonte donc la luminosité de chaque couleur
  // sémantique sans changer sa teinte, pour que le sens porté reste le même.
  static const succesSombre = Color(0xFF4ADE80);
  static const alerteSombre = Color(0xFFFBBF24);
  static const dangerSombre = Color(0xFFF87171);
  static const infoSombre = Color(0xFF7DA6FF);

  /// Variante lisible d'une couleur sémantique selon le fond.
  ///
  /// À appeler partout où une couleur d'état sert de **texte ou d'icône** sur
  /// une surface. Inutile pour un aplat décoratif — une barre de matière —
  /// où le contraste ne porte aucune information.
  static Color adapter(Color couleur, Brightness luminosite) {
    if (luminosite == Brightness.light) return couleur;
    if (couleur == succes) return succesSombre;
    if (couleur == alerte) return alerteSombre;
    if (couleur == danger) return dangerSombre;
    if (couleur == info) return infoSombre;
    if (couleur == primaire) return primaireClair;
    return couleur;
  }

  // --- Mode sombre ---
  // Économise la batterie sur écran OLED et se lit mieux le soir, quand les
  // parents consultent l'application après le travail.
  static const fondSombre = Color(0xFF0B1120);
  static const surfaceSombre = Color(0xFF161F32);
  static const bordureSombre = Color(0xFF2A3650);
  static const encreSombre = Color(0xFFE2E8F0);
  static const encreDouceSombre = Color(0xFF94A3B8);

  /// Dégradé de l'en-tête d'accueil.
  static const gradientAccueil = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [primaire, Color(0xFF2D5BB9)],
  );

  /// Couleur de matière, dérivée de son code — les mêmes que sur le bulletin.
  static Color matiere(String code) => switch (code.toUpperCase()) {
    'FR' => const Color(0xFFE11D48),
    'MATH' => const Color(0xFF2563EB),
    'PC' => const Color(0xFF7C3AED),
    'SVT' => const Color(0xFF16A34A),
    'HG' => const Color(0xFFCA8A04),
    'ANG' => const Color(0xFF0891B2),
    'AR' => const Color(0xFF059669),
    'PHILO' => const Color(0xFF9333EA),
    'EPS' => const Color(0xFFEA580C),
    'INFO' => const Color(0xFF0284C7),
    'ECO' => const Color(0xFFBE123C),
    'COMPTA' => const Color(0xFF4D7C0F),
    _ => encreLegere,
  };

  /// Couleur d'une moyenne sur 20.
  ///
  /// Les seuils suivent les usages du conseil de classe : 14 pour les
  /// encouragements, 10 pour la moyenne, 8 pour l'avertissement travail.
  static Color moyenne(double? note, [Brightness luminosite = Brightness.light]) {
    if (note == null) return encreLegere;
    final base = note >= 14
        ? succes
        : note >= 10
        ? info
        : note >= 8
        ? alerte
        : danger;
    return adapter(base, luminosite);
  }
}

/// Raccourcis sensibles au thème.
///
/// Écrire `context.etat(Couleurs.danger)` plutôt que `Couleurs.danger` partout
/// où la couleur porte du texte ou une icône : la variante lisible sur fond
/// sombre est alors choisie automatiquement, sans avoir à se souvenir de la
/// luminosité courante à chaque appel.
extension CouleursDuContexte on BuildContext {
  Color etat(Color base) => Couleurs.adapter(base, Theme.of(this).brightness);

  Color moyenne(double? note) => Couleurs.moyenne(note, Theme.of(this).brightness);
}
