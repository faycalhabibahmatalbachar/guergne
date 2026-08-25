import 'package:flutter/material.dart';

/// Palette du Lycée Guergné La Renaissance.
///
/// Tirée du BLASON de l'établissement : la couronne de laurier verte, le
/// monogramme « GR » marine. Ce n'est pas un choix décoratif — un parent doit
/// reconnaître son école d'un coup d'œil, et le blason est ce qu'il voit sur
/// la carte scolaire de son enfant.
///
/// LE VERT EST DEVENU LA MARQUE, DONC IL NE VEUT PLUS DIRE « RÉUSSI »
/// -------------------------------------------------------------------
/// La palette précédente réservait le vert au succès — présent, payé, admis —
/// avec cette règle explicite : « le vert ne sert jamais à un bouton d'action
/// générique, sans quoi il perdrait sa valeur d'alerte ». En adoptant le vert
/// du blason comme couleur principale, cette règle devient intenable : un
/// bouton vert et un état « payé » vert ne se distingueraient plus.
///
/// La règle est donc remplacée, pas contournée : LA COULEUR EST RÉSERVÉE À CE
/// QUI DEMANDE UNE ACTION. Un état positif se lit à sa coche et à son libellé,
/// en encre neutre ; l'ambre et le rouge gardent le monopole du signal. On
/// dépense moins de couleur, et ce qui reste coloré se remarque enfin.
///
/// Seule exception assumée : la barre de progression des paiements, où le vert
/// de marque marque la part versée. Là, marque et sens coïncident — l'argent
/// versé EST la bonne nouvelle de l'école.
///
/// Contrainte majeure : l'application se consulte souvent **en plein soleil**,
/// sur des écrans d'entrée de gamme. Les contrastes sont donc poussés au-delà
/// du minimum AA, et aucune information ne repose sur la seule couleur.
abstract final class Couleurs {
  // --- Identité ---
  // Le laurier du blason est un vert franc, presque fluorescent (#12A012) :
  // magnifique sur un logo, illisible en aplat de fond derrière du texte
  // blanc. On garde sa teinte et on descend la luminosité jusqu'à un contraste
  // de 6:1 sur blanc, seuil à partir duquel le vert peut porter du texte.
  static const primaire = Color(0xFF0C6B2E);
  static const primaireClair = Color(0xFF16A34A);
  static const primaireSombre = Color(0xFF07491E);

  /// Marine du monogramme « GR ». Second pilier de l'identité, pas un accent :
  /// il ancre les fonds profonds et les fins de dégradé.
  static const marine = Color(0xFF101C63);
  static const marineClair = Color(0xFF2A3A8F);

  /// Or sahélien. Unique accent, et il reste rare — un accent qu'on voit
  /// partout n'accentue plus rien.
  static const accent = Color(0xFFC98A3C);
  static const accentClair = Color(0xFFE0A85C);

  // --- États ---
  // Chaque couleur porte UN sens et un seul. Depuis le passage au vert de
  // marque, `succes` ne sert PLUS à teinter un texte « payé » ou « présent » :
  // ces états se lisent à leur coche. Il reste employé là où une part positive
  // doit se distinguer dans un graphique — la barre des paiements.
  static const succes = Color(0xFF15803D); // part versée, jauge au-dessus
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
    if (couleur == encre) return encreSombre;
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
  ///
  /// Il reste DANS le vert plutôt que d'aller chercher le marine : une
  /// transition vert-bleu sur trente pour cent de hauteur d'écran passe par des
  /// teintes sales, et le marine mérite mieux que d'être aperçu au milieu d'un
  /// fondu. Il tient son rôle ailleurs, en aplat.
  static const gradientAccueil = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [primaire, primaireSombre],
  );

  /// Dégradé des écrans de marque — démarrage, bienvenue.
  ///
  /// Celui-ci a le droit d'aller au marine : il occupe l'écran entier, la
  /// transition a la place de se faire, et le passage du laurier au monogramme
  /// raconte le blason.
  static const gradientMarque = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [primaire, Color(0xFF0A4A32), marine],
    stops: [0.0, 0.52, 1.0],
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
    // Au-dessus de 14, la note prend la couleur de l'école : une bonne note
    // porte la marque, c'est cohérent et c'est mérité. Entre 10 et 14, encre
    // neutre — « correct » n'a pas besoin d'être signalé. En dessous, l'ambre
    // puis le rouge, qui gardent le monopole de ce qui appelle une réaction.
    final base = note >= 14
        ? primaire
        : note >= 10
        ? encre
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
