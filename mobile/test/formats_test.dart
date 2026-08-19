import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lgr_parents/modeles/modeles.dart';
import 'package:lgr_parents/outils/formats.dart';

/// Tests de la mise en forme et du décodage.
///
/// Ce sont les deux endroits où une erreur passe inaperçue à l'œil mais se
/// voit immédiatement sur le téléphone d'un parent : un montant faux, une
/// note absente rendue en 0, un barème sur 40 affiché comme sur 20.
void main() {
  setUpAll(() => initializeDateFormatting('fr_FR'));

  group('Montants', () {
    test('sépare les milliers et suffixe en francs', () {
      expect(montant(51000), '51\u202F000\u202FF');
      expect(montant(0), '0\u202FF');
      expect(montant(1250000), '1\u202F250\u202F000\u202FF');
    });

    test("n'abrège pas en dessous de 100 000", () {
      expect(montantCourt(51000), '51\u202F000\u202FF');
      expect(montantCourt(99999), '99\u202F999\u202FF');
    });

    test('abrège au-delà de 100 000', () {
      expect(montantCourt(102000), '102\u202Fk\u202FF');
      expect(montantCourt(1500000), '1,5\u202FM\u202FF');
    });
  });

  group('Nombres', () {
    test('utilise la virgule décimale', () {
      expect(virgule(12.75), '12,75');
      expect(virgule(10), '10,00');
      expect(virgule(9.5, 1), '9,5');
    });

    test('les heures entières restent entières', () {
      expect(heures(6), '6');
      expect(heures(6.5), '6,5');
      expect(heures(0), '0');
    });
  });

  group('Dates', () {
    test('compte les jours restants', () {
      final demain = DateTime.now().add(const Duration(days: 1));
      expect(joursAvant(demain.toIso8601String()), 1);

      final hier = DateTime.now().subtract(const Duration(days: 1));
      expect(joursAvant(hier.toIso8601String()), -1);
    });

    test('rend null sur une date absente ou illisible', () {
      expect(joursAvant(null), isNull);
      expect(joursAvant('pas une date'), isNull);
      expect(dateLongue(null), '—');
    });

    test('nomme les jours en français, lundi = 1', () {
      expect(nomJour(1), 'Lundi');
      expect(nomJour(6), 'Samedi');
      expect(nomJour(99), '—');
    });
  });

  group('Décodage des notes', () {
    test('ramène la note sur 20 quel que soit le barème', () {
      final surQuarante = NoteEvaluation.depuisJson({
        'id': '1',
        'titre': 'Composition',
        'type': 'COMPOSITION',
        'date': '2026-11-12',
        'valeur': 30,
        'bareme': 40,
        'poids': 2,
        'statut': 'NOTEE',
      });

      expect(surQuarante.surVingt, 15.0);
    });

    test('une note absente reste absente — surtout pas zéro', () {
      final absent = NoteEvaluation.depuisJson({
        'id': '2',
        'titre': 'Devoir',
        'type': 'DEVOIR',
        'date': '2026-11-12',
        'valeur': null,
        'bareme': 20,
        'poids': 1,
        'statut': 'ABSENT',
      });

      expect(absent.valeur, isNull);
      expect(absent.surVingt, isNull);
    });

    test('accepte un numeric renvoyé sous forme de chaîne', () {
      // PostgreSQL sérialise parfois les `numeric` en texte : le décodage
      // doit l'absorber, sinon tout l'écran des notes tombe.
      final texte = NoteEvaluation.depuisJson({
        'id': '3',
        'titre': 'Interro',
        'type': 'INTERROGATION',
        'date': '2026-11-12',
        'valeur': '13.50',
        'bareme': '20.00',
        'poids': '1.00',
        'statut': 'NOTEE',
      });

      expect(texte.valeur, 13.5);
      expect(texte.surVingt, 13.5);
    });
  });

  group('Situation financière', () {
    test('calcule le reste et la progression', () {
      final s = SituationFinanciere.depuisJson({
        'totalDuFcfa': 170000,
        'totalPayeFcfa': 68000,
        'totalExonereFcfa': 0,
        'resteDuFcfa': 102000,
        'echeances': [],
        'paiements': [],
      });

      expect(s.resteDuFcfa, 102000);
      expect(s.progression, closeTo(0.4, 0.001));
    });

    test('une échéance exonérée compte comme soldée', () {
      final e = Echeance.depuisJson({
        'id': '1',
        'libelle': '1ère tranche',
        'nature': 'SCOLARITE',
        'dateLimite': '2026-11-29',
        'montantDuFcfa': 51000,
        'montantPayeFcfa': 0,
        'montantExonereFcfa': 51000,
        'statut': 'SOLDEE',
      });

      expect(e.resteFcfa, 0);
      expect(e.soldee, isTrue);
    });
  });

  group('Enfant', () {
    test('traduit le lien de parenté', () {
      Enfant avecLien(String lien) => Enfant.depuisJson({
        'eleveId': '1',
        'matricule': 'LGR-2026-0001',
        'nom': 'TOGBE',
        'prenom': 'Halimé',
        'classe': '5ème B',
        'niveau': 'Cinquième',
        'annee': '2026-2027',
        'lienParente': lien,
      });

      expect(avecLien('PERE').lienLisible, 'Père');
      expect(avecLien('GRAND_PARENT').lienLisible, 'Grand-parent');
      expect(avecLien('INCONNU').lienLisible, 'Responsable');
    });

    test('une moyenne absente ne devient pas zéro', () {
      final sansBulletin = Enfant.depuisJson({
        'eleveId': '1',
        'matricule': 'LGR-2026-0001',
        'nom': 'TOGBE',
        'prenom': 'Halimé',
        'classe': '5ème B',
        'niveau': 'Cinquième',
        'annee': '2026-2027',
        'lienParente': 'PERE',
        'moyenne': null,
      });

      expect(sansBulletin.moyenne, isNull);
    });
  });
}
