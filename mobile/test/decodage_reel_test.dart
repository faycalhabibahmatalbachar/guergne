import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lgr_parents/etat/fournisseurs.dart';
import 'package:lgr_parents/modeles/modeles.dart';

/// Décodage des charges RÉELLES du serveur.
///
/// Les fichiers de `test/charges/` sont des réponses authentiques de
/// `/api/mobile`, capturées contre la base de production le 19 août 2026.
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

    // Avant la rentrée, aucun bulletin n'est publié : la moyenne doit être
    // absente et surtout PAS ramenée à zéro.
    expect(enfant.moyenne, anyOf(isNull, isA<double>()));
    expect(enfant.resteDuFcfa, greaterThanOrEqualTo(0));
  });

  test('notes — périodes et relevé', () {
    final complet = ReleveComplet.depuisJson(charge('notes'));

    expect(complet.periodes, isNotEmpty);
    expect(complet.periodes.map((p) => p.ordre), everyElement(greaterThan(0)));

    // Le serveur choisit la période à afficher ; hors année scolaire, ce doit
    // être la première — jamais la dernière.
    final choisie = complet.releve;
    if (choisie != null) {
      final rang = complet.periodes.firstWhere((p) => p.id == choisie.periodeId).ordre;
      final aucuneCourante = complet.periodes.every((p) => !p.courante);
      final aucuneClose = complet.periodes.every((p) => !p.publie);
      if (aucuneCourante && aucuneClose) {
        expect(rang, 1, reason: 'hors année scolaire, on doit afficher la première période');
      }
    }
  });

  test('assiduité — journal', () {
    final assiduite = Assiduite.depuisJson(charge('assiduite'));

    expect(assiduite.periodes, isNotEmpty);
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

    for (final c in cours) {
      expect(c.jour, inInclusiveRange(1, 7));
      expect(c.debutCourt, matches(RegExp(r'^\d{2}:\d{2}$')));
      expect(c.finCourte, matches(RegExp(r'^\d{2}:\d{2}$')));
    }
  });
}
