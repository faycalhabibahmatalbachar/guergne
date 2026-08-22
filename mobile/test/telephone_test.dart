import 'package:flutter_test/flutter_test.dart';
import 'package:lgr_parents/outils/telephone.dart';

/// Numéros tchadiens.
///
/// Ces tests doivent rester alignés sur `web/src/lib/telephone.ts` : c'est la
/// même règle, écrite deux fois faute de pouvoir partager du code entre Dart
/// et TypeScript. Un désaccord entre les deux se traduirait par un parent que
/// l'application accepte et que le serveur refuse — ou l'inverse.
void main() {
  group('Validation', () {
    test('accepte les quatre préfixes tchadiens', () {
      for (final prefixe in ['3', '6', '8', '9']) {
        expect(Telephone.valide('${prefixe}1234567'), isTrue, reason: 'préfixe $prefixe');
      }
    });

    test('refuse un préfixe hors plan de numérotation', () {
      for (final prefixe in ['0', '1', '2', '4', '5', '7']) {
        expect(Telephone.valide('${prefixe}1234567'), isFalse, reason: 'préfixe $prefixe');
      }
    });

    test('exige exactement huit chiffres', () {
      expect(Telephone.valide('6612345'), isFalse, reason: 'sept chiffres');
      expect(Telephone.valide('66123456'), isTrue, reason: 'huit chiffres');
      expect(Telephone.valide('661234567'), isFalse, reason: 'neuf chiffres');
    });
  });

  group('Formes acceptées à la saisie', () {
    // Le secrétariat écrit un même numéro de vingt façons. Toutes doivent
    // mener au même numéro, sinon le même parent existe en double au fichier
    // et ne reçoit jamais ses alertes.
    const attendu = '66000000';

    for (final saisie in [
      '66000000',
      '66 00 00 00',
      '66-00-00-00',
      '+23566000000',
      '+235 66 00 00 00',
      '23566000000',
      '0023566000000',
      '066000000',
    ]) {
      test('« $saisie »', () {
        expect(Telephone.partieNationale(saisie), attendu);
        expect(Telephone.valide(saisie), isTrue);
        expect(Telephone.international(saisie), '+235$attendu');
      });
    }
  });

  group('Motif de refus', () {
    test('dit combien de chiffres manquent', () {
      expect(Telephone.motifRefus('660'), contains('5 chiffres'));
      expect(Telephone.motifRefus('6600000'), contains('1 chiffre'));
      expect(Telephone.motifRefus('6600000'), isNot(contains('1 chiffres')));
    });

    test('nomme les préfixes valides', () {
      expect(Telephone.motifRefus('51234567'), contains('3, 6, 8, 9'));
    });

    test('ne dit rien sur un numéro correct', () {
      expect(Telephone.motifRefus('66000000'), isNull);
      expect(Telephone.motifRefus('+235 31 23 45 67'), isNull);
    });

    test('demande une saisie quand le champ est vide', () {
      expect(Telephone.motifRefus(''), isNotNull);
    });
  });

  group('Mise en forme', () {
    test('groupe par deux', () {
      expect(Telephone.lisible('66000000'), '66 00 00 00');
      expect(Telephone.lisible('+23591912191'), '91 91 21 91');
    });

    test('supporte un numéro incomplet', () {
      expect(Telephone.lisible('660'), '66 0');
    });
  });

  group('Formateur de saisie', () {
    final formateur = FormateurTelephone();

    TextEditingValue frapper(String texte) => formateur.formatEditUpdate(
      TextEditingValue.empty,
      TextEditingValue(text: texte),
    );

    test('insère les espaces au fil de la frappe', () {
      expect(frapper('6').text, '6');
      expect(frapper('66').text, '66');
      expect(frapper('660').text, '66 0');
      expect(frapper('66000000').text, '66 00 00 00');
    });

    test('rejette tout ce qui n\'est pas un chiffre', () {
      expect(frapper('66abc00').text, '66 00');
      expect(frapper('+235-66').text, '23 56 6');
    });

    test('tronque au-delà de huit chiffres', () {
      // Un parent qui colle un numéro avec indicatif ne doit pas se retrouver
      // avec douze chiffres dans le champ.
      expect(frapper('660000009999').text, '66 00 00 00');
    });

    test('laisse le curseur en fin de saisie', () {
      final valeur = frapper('66000');
      expect(valeur.selection.baseOffset, valeur.text.length);
    });
  });
}
