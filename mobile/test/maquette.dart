import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lgr_parents/design/theme.dart';
import 'package:lgr_parents/ecrans/coque.dart';
import 'package:lgr_parents/services/stockage.dart';

import 'appui/echafaudage.dart';

/// Maquette navigable : la coque et ses cinq onglets, sans serveur ni SMS.
///
/// Sert à VOIR l'interface dans Chrome sur un poste qui n'a ni compte parent
/// ni configuration Firebase. Les données sont celles des tests d'apparence —
/// une famille fictive — et c'est pour cela que ce fichier vit dans `test/` :
/// il ne peut pas partir dans l'application livrée.
///
///   flutter run -d chrome -t test/maquette.dart
///
/// Les bulletins et l'emploi du temps n'ont pas de jeu de données : leurs
/// écrans interrogent le serveur et affichent leur état d'erreur.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('fr_FR');

  final stockage = await Stockage.ouvrir();

  runApp(
    ProviderScope(
      overrides: echafaudage(
        stockage: stockage,
        accueil: accueilFratrie(),
        releve: relevePublie(),
        assiduite: assiduiteExemple(),
        finances: financesExemple(),
      ),
      child: MaterialApp(
        title: 'LGR Parents — maquette',
        debugShowCheckedModeBanner: false,
        theme: ThemeLgr.clair(),
        darkTheme: ThemeLgr.sombre(),
        themeMode: ThemeMode.system,
        home: const Coque(),
      ),
    ),
  );
}
