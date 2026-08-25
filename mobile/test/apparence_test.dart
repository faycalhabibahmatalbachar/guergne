import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lgr_parents/design/theme.dart';
import 'package:lgr_parents/ecrans/accueil.dart';
import 'package:lgr_parents/ecrans/activation.dart';
import 'package:lgr_parents/ecrans/annonces.dart';
import 'package:lgr_parents/ecrans/assiduite.dart';
import 'package:lgr_parents/ecrans/demarrage.dart';
import 'package:lgr_parents/ecrans/finances.dart';
import 'package:lgr_parents/ecrans/notes.dart';
import 'package:lgr_parents/ecrans/profil.dart';
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
    double echelleTexte = 1.0,
    Future<void> Function(WidgetTester)? apresRendu,
    // Un écran dont une animation tourne EN BOUCLE — l'indicateur de
    // chargement du démarrage — ne se stabilise jamais : `pumpAndSettle` y
    // tourne jusqu'au délai d'expiration. On avance alors d'un nombre fixe
    // d'images, ce qui rend la capture reproductible sans exiger un repos qui
    // n'arrivera pas.
    Duration? avanceFixe,
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
          // La taille de police est un réglage du téléphone, pas de
          // l'application : `MediaQuery` est le seul endroit d'où elle peut
          // venir. On la force ici pour reproduire un téléphone réglé en
          // « grandes polices ».
          builder: (contexte, enfant) => MediaQuery.withClampedTextScaling(
            minScaleFactor: echelleTexte,
            maxScaleFactor: echelleTexte,
            child: enfant!,
          ),
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
    if (avanceFixe == null) {
      await tester.pumpAndSettle(const Duration(seconds: 2));
    } else {
      // Plusieurs images plutôt qu'un seul grand saut : une animation
      // implicite — ici l'apparition du message de chargement — a besoin de
      // frames intermédiaires pour progresser. Un unique `pump` de deux
      // secondes la laisserait figée à son premier pour cent.
      final pas = avanceFixe ~/ 8;
      for (var i = 0; i < 8; i++) {
        await tester.pump(pas);
      }
      await tester.pump(const Duration(milliseconds: 400));
    }

    if (apresRendu != null) await apresRendu(tester);

    await expectLater(find.byType(MaterialApp), matchesGoldenFile('apparence/$nom.png'));
  }

  // L'écran de démarrage n'a ni données ni état : c'est justement pour cela
  // qu'il faut le capturer. Une illustration dessinée au pinceau ne se relit
  // pas dans le code — la seule façon de savoir si les personnages sont bien
  // cadrés et si le fondu tombe au bon endroit est de la voir.
  testWidgets('Démarrage — écran de lancement', (tester) async {
    await rendre(
      tester,
      const EcranDemarrage(),
      nom: 'demarrage',
      surcharges: echafaudage(stockage: stockage),
      avanceFixe: const Duration(milliseconds: 2400),
    );
  });

  testWidgets('Démarrage — mode sombre', (tester) async {
    await rendre(
      tester,
      const EcranDemarrage(),
      nom: 'demarrage_sombre',
      luminosite: Brightness.dark,
      surcharges: echafaudage(stockage: stockage),
      avanceFixe: const Duration(milliseconds: 2400),
    );
  });

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
      EcranAccueil(versOnglet: (_) {}, versCompte: () {}),
      nom: 'accueil',
      surcharges: echafaudage(stockage: stockage, accueil: accueilExemple()),
    );
  });

  testWidgets('Accueil — mode sombre', (tester) async {
    await rendre(
      tester,
      EcranAccueil(versOnglet: (_) {}, versCompte: () {}),
      nom: 'accueil_sombre',
      luminosite: Brightness.dark,
      surcharges: echafaudage(stockage: stockage, accueil: accueilExemple()),
    );
  });

  testWidgets('Accueil — fratrie, échéance en retard, absences', (tester) async {
    await rendre(
      tester,
      EcranAccueil(versOnglet: (_) {}, versCompte: () {}),
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

  testWidgets('Résultats — matière dépliée', (tester) async {
    await rendre(
      tester,
      const EcranNotes(),
      nom: 'notes_detail',
      surcharges: echafaudage(stockage: stockage, accueil: accueilExemple(), releve: relevePublie()),
      apresRendu: (tester) async {
        // Déplie la première matière : c'est là que vivent l'échelle de
        // classe, les notes détaillées et l'appréciation — la partie que la
        // capture de la liste ne montre jamais.
        await tester.tap(find.text('Français'));
        await tester.pumpAndSettle(const Duration(seconds: 1));
      },
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

  testWidgets('Résultats — données réelles du serveur', (tester) async {
    // Rendu du relevé tel que le serveur le renvoie réellement, et non d'un
    // jeu inventé : c'est la seule capture qui prouve que l'écran tient avec
    // dix matières, des libellés longs et des notes à deux décimales.
    await rendre(
      tester,
      const EcranNotes(),
      nom: 'notes_reelles',
      surcharges: echafaudage(
        stockage: stockage,
        accueil: accueilDuServeur(),
        releve: releveDuServeur(),
      ),
    );
  });

  testWidgets('Mon compte', (tester) async {
    await rendre(
      tester,
      const EcranProfil(),
      nom: 'profil',
      surcharges: echafaudage(stockage: stockage, accueil: accueilFratrie()),
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

  // -------------------------------------------------------------------------
  // Grandes polices
  //
  // POURQUOI CES TESTS EXISTENT
  //
  // Android permet d'agrandir tout le texte du système jusqu'à 130 %, et bien
  // au-delà avec les réglages d'accessibilité. C'est un réglage courant : les
  // parents d'élèves de lycée ont souvent passé la quarantaine, et un écran
  // d'entrée de gamme se lit mal.
  //
  // À 130 %, une ligne qui tenait tout juste déborde. Flutter le signale par
  // un bandeau rayé jaune et noir — sur le téléphone du parent, pas sur le
  // poste du développeur, qui n'a jamais touché ce réglage. Ces tests
  // provoquent la situation ici plutôt que chez lui : un débordement fait
  // échouer le test, il n'est donc pas possible de le livrer sans le voir.
  //
  // Les écrans retenus sont ceux où le texte est le plus contraint : chiffres
  // en gros corps dans des cartes de largeur fixe, et lignes à deux colonnes
  // dont l'une est un montant.
  // -------------------------------------------------------------------------

  const grandesPolices = 1.3;

  testWidgets('Accueil — grandes polices', (tester) async {
    await rendre(
      tester,
      EcranAccueil(versOnglet: (_) {}, versCompte: () {}),
      nom: 'accueil_grandes_polices',
      surcharges: echafaudage(stockage: stockage, accueil: accueilExemple()),
      echelleTexte: grandesPolices,
    );
  });

  testWidgets('Résultats — grandes polices', (tester) async {
    await rendre(
      tester,
      const EcranNotes(),
      nom: 'notes_grandes_polices',
      surcharges: echafaudage(
        stockage: stockage,
        accueil: accueilExemple(),
        releve: relevePublie(),
      ),
      echelleTexte: grandesPolices,
    );
  });

  testWidgets('Scolarité — grandes polices', (tester) async {
    await rendre(
      tester,
      const EcranFinances(),
      nom: 'finances_grandes_polices',
      surcharges: echafaudage(
        stockage: stockage,
        accueil: accueilExemple(),
        finances: financesExemple(),
      ),
      echelleTexte: grandesPolices,
    );
  });
}
