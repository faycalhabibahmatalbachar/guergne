import 'package:flutter/services.dart';

/// Numéros de téléphone tchadiens.
///
/// **Miroir de `web/src/lib/telephone.ts`.** Les deux fichiers portent la même
/// règle : on ne peut pas partager de code entre Dart et TypeScript, alors ils
/// se citent mutuellement pour qu'une modification de l'un rappelle l'autre.
///
/// La validation côté application n'est pas une sécurité — le serveur revalide
/// tout. Elle sert à dire au parent ce qui ne va pas **avant** qu'il n'appuie
/// sur le bouton et n'attende une réponse réseau pour apprendre qu'il a oublié
/// un chiffre.
abstract final class Telephone {
  /// Premiers chiffres acceptés au Tchad, par opérateur.
  static const prefixes = ['3', '6', '8', '9'];

  /// Longueur d'un numéro national, sans l'indicatif +235.
  static const longueur = 8;

  static final _motif = RegExp('^[${prefixes.join()}]\\d{${longueur - 1}}\$');

  static String chiffresSeuls(String saisie) => saisie.replaceAll(RegExp(r'\D'), '');

  /// Extrait la partie nationale, quelle que soit la forme saisie.
  static String partieNationale(String saisie) {
    var chiffres = chiffresSeuls(saisie);

    if (chiffres.startsWith('00235')) {
      chiffres = chiffres.substring(5);
    } else if (chiffres.startsWith('235')) {
      chiffres = chiffres.substring(3);
    }

    return chiffres.replaceFirst(RegExp(r'^0+'), '');
  }

  static bool valide(String saisie) => _motif.hasMatch(partieNationale(saisie));

  /// Explique POURQUOI le numéro est refusé, ou `null` s'il est correct.
  ///
  /// « Numéro invalide » n'aide personne. Dire qu'il manque deux chiffres
  /// permet de corriger sans appeler l'école.
  static String? motifRefus(String saisie) {
    final national = partieNationale(saisie);

    if (national.isEmpty) return 'Entrez votre numéro de téléphone.';

    if (national.length < longueur) {
      final manquants = longueur - national.length;
      return 'Il manque $manquants chiffre${manquants > 1 ? "s" : ""}.';
    }

    if (national.length > longueur) {
      return 'Un numéro tchadien compte $longueur chiffres.';
    }

    if (!prefixes.contains(national[0])) {
      return 'Un numéro tchadien commence par ${prefixes.join(", ")}.';
    }

    return null;
  }

  /// Forme lisible : « 66 00 00 00 ».
  static String lisible(String saisie) {
    final national = partieNationale(saisie);
    final morceaux = <String>[];
    for (var i = 0; i < national.length; i += 2) {
      morceaux.add(national.substring(i, (i + 2).clamp(0, national.length)));
    }
    return morceaux.join(' ');
  }

  /// Forme internationale, celle que le serveur attend.
  static String international(String saisie) => '+235${partieNationale(saisie)}';
}

/// Met le numéro en forme pendant la frappe : « 66 00 00 00 ».
///
/// Les groupes de deux chiffres sont la façon dont un numéro tchadien se dit
/// et se relit. Sans eux, huit chiffres collés se vérifient mal — et un
/// parent qui ne peut pas relire son numéro ne remarque pas sa faute de
/// frappe.
class FormateurTelephone extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue avant, TextEditingValue apres) {
    final chiffres = Telephone.chiffresSeuls(apres.text);
    final tronque = chiffres.length > Telephone.longueur
        ? chiffres.substring(0, Telephone.longueur)
        : chiffres;

    final tampon = StringBuffer();
    for (var i = 0; i < tronque.length; i++) {
      if (i > 0 && i % 2 == 0) tampon.write(' ');
      tampon.write(tronque[i]);
    }
    final texte = tampon.toString();

    // Le curseur reste à la fin : on n'autorise pas l'édition au milieu, ce
    // qui éviterait de recalculer une position après insertion d'espaces —
    // un exercice dont toutes les implémentations naïves se trompent.
    return TextEditingValue(
      text: texte,
      selection: TextSelection.collapsed(offset: texte.length),
    );
  }
}
