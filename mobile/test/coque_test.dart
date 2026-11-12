import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lgr_parents/design/barre_navigation.dart';
import 'package:lgr_parents/design/theme.dart';
import 'package:lgr_parents/ecrans/accueil.dart';
import 'package:lgr_parents/ecrans/activation.dart';
import 'package:lgr_parents/ecrans/coque.dart';
import 'package:lgr_parents/ecrans/annonces.dart';
import 'package:lgr_parents/services/stockage.dart';

import 'appui/echafaudage.dart';

/// La coque ENTIÈRE, et non ses morceaux.
///
/// Les tests d'apparence rendent chaque écran seul, et la barre d'onglets
/// seule. Aucun ne les assemblait : la barre a pu s'étirer sur toute la
/// hauteur de l'écran et réduire le contenu à zéro pixel sans qu'un seul test
/// ne le voie — chacune des deux moitiés était juste, c'est leur réunion qui
/// ne l'était pas.
void main() {
  late Stockage stockage;

  setUpAll(() async {
    await initializeDateFormatting('fr_FR');
    await chargerPolices();
    stockage = await stockageDeTest();
  });

  Future<void> monter(
    WidgetTester tester,
    Widget ecran, {
    Size taille = const Size(390, 844),
  }) {
    tester.view.physicalSize = taille;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    return tester.pumpWidget(
      ProviderScope(
        overrides: echafaudage(
          stockage: stockage,
          accueil: accueilFratrie(),
          releve: relevePublie(),
          assiduite: assiduiteExemple(),
          finances: financesExemple(),
        ),
        child: MaterialApp(theme: ThemeLgr.clair(), home: ecran),
      ),
    );
  }

  testWidgets('La barre d\'onglets laisse la place au contenu', (tester) async {
    await monter(tester, const Coque());
    await tester.pumpAndSettle(const Duration(seconds: 2));

    final barre = tester.getSize(find.byType(BarreNavigationParent));
    final accueil = tester.getSize(find.byType(EcranAccueil));

    expect(
      barre.height,
      lessThan(100),
      reason: 'la barre ne prend que sa hauteur utile',
    );
    expect(
      accueil.height,
      greaterThan(700),
      reason: 'le contenu occupe le reste de l\'écran',
    );
  });

  testWidgets('Un onglet tapé affiche son écran', (tester) async {
    await monter(tester, const Coque());
    await tester.pumpAndSettle(const Duration(seconds: 2));

    // « Annonces » se lit aussi sur une tuile de l'accueil : on vise l'onglet.
    await tester.tap(
      find.descendant(
        of: find.byType(BarreNavigationParent),
        matching: find.text('Annonces'),
      ),
    );
    await tester.pumpAndSettle(const Duration(seconds: 2));

    final liste = tester.getTopLeft(find.byType(EcranAnnonces));
    expect(liste.dx, 0, reason: 'la page des annonces est celle affichée');
  });

  testWidgets('Activation — aucun débordement sur un écran très court', (
    tester,
  ) async {
    await monter(tester, const EcranActivation(), taille: const Size(344, 430));
    await tester.pumpAndSettle(const Duration(seconds: 2));

    expect(tester.takeException(), isNull);
  });
}
