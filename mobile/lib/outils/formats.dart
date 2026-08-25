import 'package:intl/intl.dart';

/// Mise en forme des nombres, montants et dates.
///
/// Tout est centralisé ici pour une raison précise : un montant écrit
/// « 51000 » à un endroit et « 51 000 F » à un autre donne l'impression de
/// deux applications collées ensemble. La cohérence typographique est le
/// premier signal de sérieux.

final _fr = NumberFormat.decimalPattern('fr_FR');

/// Source de l'heure courante.
///
/// Indirection volontaire : les tests d'apparence la figent pour que les
/// captures restent identiques d'un jour à l'autre. Sans cela, « dans 103
/// jours » deviendrait « dans 102 jours » le lendemain et chaque golden
/// échouerait sans qu'aucun code n'ait changé.
DateTime Function() maintenant = DateTime.now;

/// Décimal à la française : 12.75 → « 12,75 ».
String virgule(double valeur, [int decimales = 2]) =>
    valeur.toStringAsFixed(decimales).replaceAll('.', ',');

/// Heures d'absence : 6.0 → « 6 », 6.5 → « 6,5 ».
///
/// Afficher « 6,00 h » ferait croire à une précision qui n'existe pas — les
/// absences se comptent en heures et demi-heures.
String heures(double valeur) {
  if (valeur == valeur.roundToDouble()) return valeur.toInt().toString();
  return virgule(valeur, 1);
}

/// Espace fine insécable, séparateur de milliers en typographie française.
///
/// Écrite en échappement plutôt qu'en littéral : un caractère invisible dans
/// le source se perd au premier copier-coller et provoque des écarts que rien
/// ne laisse voir à la relecture.
const _finement = '\u202F';

/// Montant complet : 51000 → « 51 000 F ».
///
/// Toutes les espèces d'espaces produites par `intl` selon la version sont
/// normalisées : sans cela, un retour à la ligne pourrait séparer le montant
/// de son unité en plein milieu d'une carte.
String montant(int fcfa) {
  final chiffres = _fr.format(fcfa).replaceAll(RegExp(r'[\s\u00A0\u202F]'), _finement);
  return '$chiffres${_finement}F';
}

/// « Bonjour » / « Bonsoir » selon l'heure locale.
String saluer() {
  final heure = maintenant().hour;
  if (heure < 12) return 'Bonjour';
  if (heure < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

/// Date du jour, forme courte : « mar. 19 août ».
String dateDuJour() => DateFormat('EEE d MMM', 'fr_FR').format(maintenant());

DateTime? _analyser(String? iso) {
  if (iso == null || iso.isEmpty) return null;
  return DateTime.tryParse(iso);
}

/// Nombre de jours d'ici à une date. Négatif si elle est passée.
int? joursAvant(String? iso) {
  final date = _analyser(iso);
  if (date == null) return null;

  final aujourdhui = maintenant();
  final debutJour = DateTime(aujourdhui.year, aujourdhui.month, aujourdhui.day);
  return DateTime(date.year, date.month, date.day).difference(debutJour).inDays;
}

/// Date longue : « 19 août 2026 ».
String dateLongue(String? iso) {
  final date = _analyser(iso);
  if (date == null) return '—';
  return DateFormat('d MMMM y', 'fr_FR').format(date);
}

/// Date courte : « 19 août ».
String dateCourte(String? iso) {
  final date = _analyser(iso);
  if (date == null) return '—';
  return DateFormat('d MMM', 'fr_FR').format(date);
}

/// Date relative : « aujourd'hui », « hier », « il y a 3 jours », puis la date.
///
/// Au-delà d'une semaine on repasse à la date absolue : « il y a 47 jours »
/// n'aide personne à situer un événement.
String dateRelative(String? iso) {
  final date = _analyser(iso);
  if (date == null) return '—';

  final ecart = joursAvant(iso)!;
  return switch (ecart) {
    0 => "Aujourd'hui",
    -1 => 'Hier',
    1 => 'Demain',
    < 0 && > -7 => 'Il y a ${-ecart} jours',
    > 0 && < 7 => 'Dans $ecart jours',
    _ => DateFormat('d MMM y', 'fr_FR').format(date),
  };
}

/// Nom du jour de la semaine, 1 = lundi (convention ISO, comme en base).
String nomJour(int jour) => switch (jour) {
  1 => 'Lundi',
  2 => 'Mardi',
  3 => 'Mercredi',
  4 => 'Jeudi',
  5 => 'Vendredi',
  6 => 'Samedi',
  7 => 'Dimanche',
  _ => '—',
};
