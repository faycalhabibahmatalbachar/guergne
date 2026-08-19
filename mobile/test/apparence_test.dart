import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lgr_parents/design/theme.dart';
import 'package:lgr_parents/ecrans/accueil.dart';
import 'package:lgr_parents/ecrans/activation.dart';
import 'package:lgr_parents/ecrans/annonces.dart';
import 'package:lgr_parents/ecrans/assiduite.dart';
import 'package:lgr_parents/ecrans/finances.dart';
import 'package:lgr_parents/ecrans/notes.dart';
import 'package:lgr_parents/etat/fournisseurs.dart';
import 'package:lgr_parents/outils/formats.dart' as formats;
import 'package:lgr_parents/services/stockage.dart';

import 'appui/echafaudage.dart';

/// Tests d'apparence (« golden »).
///
/// Sans émulateur Android sous la main, c'est le seul moyen de VOIR réellement
/// ce que l'application affiche plutôt que de le supposer. Chaque écran est
/// rendu en PNG à taille de téléphone, avec des données représentatives, y
/// compris les cas qui font mal : bulletin non publié, échéance en retard,
/// zéro annonce.
///
/// Régénérer après une modification volontaire du design :
///   flutter test --update-goldens test/apparence_test.dart
void main() {
  late Stockage stockage;

  setUpAll(() async {
    await initializeDateFormatting('fr_FR');
    await chargerPolices();
    stockage = await stockageDeTest();

    // Horloge figée au 14 novembre 2026 : les captures resteraient sinon
    // valables un seul jour, « dans 16 jours » devenant « dans 15 jours »
    // le lendemain sans qu'aucune ligne de code n'ait bougé.
    formats.maintenant = () => DateTime(2026, 11, 14, 9, 30);
  });

  tearDownAll(() => formats.maintenant = DateTime.now);

  Future<void> rendre(
    WidgetTester tester,
    Widget ecran, {
    required String nom,
    List<Override> surcharges = const [],
    Brightness luminosite = Brightness.light,
    Size taille = const Size(390, 844),
  }) async {
    tester.view.physicalSize = taille;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: surcharges,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: luminosite == Brightness.dark ? ThemeLgr.sombre() : ThemeLgr.clair(),
          home: ecran,
        ),
      ),
    );

    // Le logo est un SVG chargé depuis les assets : son décodage est un
    // véritable travail asynchrone, que le harnais de test fige par défaut.
    // `runAsync` rend la main à la boucle d'événements le temps qu'il aboutisse,
    // sans quoi la capture montrerait un cadre vide à la place du logo.
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));

    // Les animations d'apparition en cascade doivent être terminées, sinon le
    // rendu capturé dépend du moment exact de la capture.
    await tester.pumpAndSettle(const Duration(seconds: 2));

    await expectLater(find.byType(MaterialApp), matchesGoldenFile('apparence/$nom.png'));
  }

  testWidgets('Activation — saisie du numéro', (tester) async {
    await rendre(
      tester,
      const EcranActivation(),
      nom: 'activation',
      surcharges: echafaudage(stockage: stockage),
    );
  });

  testWidgets('Accueil — situation nominale', (tester) async {
    await rendre(
      tester,
      EcranAccueil(versOnglet: (_) {}),
      nom: 'accueil',
      surcharges: echafaudage(stockage: stockage, accueil: accueilExemple()),
    );
  });

  testWidgets('Accueil — mode sombre', (tester) async {
    await rendre(
      tester,
      EcranAccueil(versOnglet: (_) {}),
      nom: 'accueil_sombre',
      luminosite: Brightness.dark,
      surcharges: echafaudage(stockage: stockage, accueil: accueilExemple()),
    );
  });

  testWidgets('Accueil — fratrie, échéance en retard, absences', (tester) async {
    await rendre(
      tester,
      EcranAccueil(versOnglet: (_) {}),
      nom: 'accueil_fratrie',
      surcharges: echafaudage(stockage: stockage, accueil: accueilFratrie()),
    );
  });

  testWidgets('Résultats — bulletin publié', (tester) async {
    await rendre(
      tester,
      const EcranNotes(),
      nom: 'notes',
      surcharges: echafaudage(
        stockage: stockage,
        accueil: accueilExemple(),
        releve: relevePublie(),
      ),
    );
  });

  testWidgets('Résultats — bulletin non publié', (tester) async {
    await rendre(
      tester,
      const EcranNotes(),
      nom: 'notes_en_attente',
      surcharges: echafaudage(
        stockage: stockage,
        accueil: accueilExemple(),
        releve: releveEnAttente(),
      ),
    );
  });

  testWidgets('Assiduité — journal', (tester) async {
    await rendre(
      tester,
      const EcranAssiduite(),
      nom: 'assiduite',
      surcharges: echafaudage(
        stockage: stockage,
        accueil: accueilExemple(),
        assiduite: assiduiteExemple(),
      ),
    );
  });

  testWidgets('Assiduité — rien à signaler', (tester) async {
    await rendre(
      tester,
      const EcranAssiduite(),
      nom: 'assiduite_vide',
      surcharges: echafaudage(
        stockage: stockage,
        accueil: accueilExemple(),
        assiduite: const Assiduite(periodes: [], evenements: []),
      ),
    );
  });

  testWidgets('Scolarité — partiellement soldée', (tester) async {
    await rendre(
      tester,
      const EcranFinances(),
      nom: 'finances',
      surcharges: echafaudage(
        stockage: stockage,
        accueil: accueilExemple(),
        finances: financesExemple(),
      ),
    );
  });

  testWidgets('Annonces — liste', (tester) async {
    await rendre(
      tester,
      const EcranAnnonces(),
      nom: 'annonces',
      surcharges: echafaudage(stockage: stockage, accueil: accueilExemple()),
    );
  });
}
