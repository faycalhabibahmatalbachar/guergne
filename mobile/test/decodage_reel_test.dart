import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lgr_parents/etat/fournisseurs.dart';
import 'package:lgr_parents/modeles/modeles.dart';

/// Décodage des charges RÉELLES du serveur.
///
/// Les fichiers de `test/charges/` sont des réponses authentiques de
/// `/api/mobile`, capturées contre le SERVEUR DE PRODUCTION le 19 août 2026,
/// sur une année scolaire complète — bulletins publiés, notes, absences.
/// Ils vérifient ce que les tests unitaires ne peuvent pas : que la forme
/// produite par PostgreSQL — `numeric` en chaîne, `null` là où on attendait
/// un nombre, tableau JSON imbriqué — traverse les modèles sans exception.
///
/// Pour les rafraîchir après une modification de l'API :
///   curl -s "$BASE/api/mobile/enfants" -H "Authorization: Bearer $JETON" \
///     > test/charges/enfants.json
void main() {
  Map<String, dynamic> charge(String nom) =>
      jsonDecode(File('test/charges/$nom.json').readAsStringSync()) as Map<String, dynamic>;

  test('accueil — profil, enfants, annonces', () {
    final accueil = Accueil.depuisJson(charge('enfants'));

    expect(accueil.profil.nomComplet, isNotEmpty);
    expect(accueil.enfants, isNotEmpty);

    final enfant = accueil.enfants.first;
    expect(enfant.eleveId, isNotEmpty);
    expect(enfant.matricule, startsWith('LGR-'));
    expect(enfant.classe, isNotEmpty);
    expect(enfant.lienLisible, isNot('Responsable'), reason: 'lien de parenté non reconnu');

    // Bulletin publié : moyenne, rang et effectif doivent tenir ensemble.
    expect(enfant.moyenne, isNotNull, reason: 'le bulletin de la période est publié');
    expect(enfant.moyenne, inInclusiveRange(0, 20));
    expect(enfant.rang, inInclusiveRange(1, enfant.effectif!));
    expect(enfant.resteDuFcfa, greaterThanOrEqualTo(0));
  });

  test('notes — périodes et relevé', () {
    final complet = ReleveComplet.depuisJson(charge('notes'));

    expect(complet.periodes, isNotEmpty);
    expect(complet.periodes.map((p) => p.ordre), everyElement(greaterThan(0)));

    final releve = complet.releve!;
    expect(releve.publie, isTrue);
    expect(releve.matieres, isNotEmpty);

    // Cohérence du relevé : la moyenne générale doit être la moyenne des
    // moyennes de matière pondérée par les coefficients. C'est le calcul que
    // le parent refera à la main sur le bulletin papier — il doit tomber juste.
    final points = releve.matieres
        .where((m) => m.moyenne != null)
        .fold<double>(0, (t, m) => t + m.moyenne! * m.coefficient);
    final coefs = releve.matieres
        .where((m) => m.moyenne != null)
        .fold<double>(0, (t, m) => t + m.coefficient);

    expect(points / coefs, closeTo(releve.moyenne!, 0.05));
    expect(releve.rang, inInclusiveRange(1, releve.effectif!));

    // Chaque matière porte ses notes, et aucune ne dépasse son barème.
    for (final m in releve.matieres) {
      for (final n in m.notes) {
        if (n.valeur != null) expect(n.valeur, lessThanOrEqualTo(n.bareme));
        expect(n.surVingt, anyOf(isNull, inInclusiveRange(0, 20)));
      }
    }
  });

  test('assiduité — journal', () {
    final assiduite = Assiduite.depuisJson(charge('assiduite'));

    expect(assiduite.periodes, isNotEmpty);
    expect(assiduite.evenements, isNotEmpty, reason: "l'année écoulée comporte des absences");

    for (final e in assiduite.evenements) {
      expect(e.id, isNotEmpty);
      expect(e.date, matches(RegExp(r'^\d{4}-\d{2}-\d{2}$')));
      expect(e.libelle, isNotEmpty);
    }
  });

  test('finances — totaux cohérents', () {
    final s = SituationFinanciere.depuisJson(charge('finances'));

    expect(s.echeances, isNotEmpty);
    expect(s.resteDuFcfa, s.totalDuFcfa - s.totalPayeFcfa - s.totalExonereFcfa);

    // Le total dû reconstruit depuis les lignes doit égaler celui du serveur :
    // un écart signifierait que le calcul de l'écran et celui de la caisse
    // divergent, ce qu'un parent verrait immédiatement.
    final sommeLignes = s.echeances.fold<int>(0, (t, e) => t + e.montantDuFcfa);
    expect(sommeLignes, s.totalDuFcfa);

    for (final p in s.paiements) {
      expect(p.numeroRecu, isNotEmpty);
      expect(p.montantFcfa, greaterThan(0));
      expect(p.modeLisible, isNotEmpty);
    }
  });

  test('emploi du temps', () {
    final cours = ((charge('emploi-du-temps')['cours'] as List?) ?? const [])
        .map((c) => Cours.depuisJson(Map<String, dynamic>.from(c as Map)))
        .toList();

    expect(cours, isNotEmpty, reason: "l'emploi du temps de la classe est publié");

    // Deux cours ne peuvent pas occuper la classe au même moment : c'est la
    // garantie que l'ordonnancement respecte le déclencheur de conflit.
    final creneaux = cours.map((c) => '${c.jour}|${c.debut}').toList();
    expect(creneaux.toSet().length, creneaux.length, reason: 'créneau occupé deux fois');

    for (final c in cours) {
      expect(c.jour, inInclusiveRange(1, 7));
      expect(c.debutCourt, matches(RegExp(r'^\d{2}:\d{2}$')));
      expect(c.finCourte, matches(RegExp(r'^\d{2}:\d{2}$')));
    }
  });
}
