import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'design/theme.dart';
import 'ecrans/activation.dart';
import 'ecrans/demarrage.dart';
import 'ecrans/coque.dart';
import 'etat/fournisseurs.dart';
import 'services/stockage.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Les dates sont formatées en français partout dans l'application ; sans
  // cette initialisation, `DateFormat('EEE d MMM', 'fr_FR')` lève une
  // exception au premier affichage.
  await initializeDateFormatting('fr_FR');

  // L'application se tient à la verticale : elle se consulte d'une main, en
  // marchant, et une mise en page paysage n'apporterait rien.
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  final stockage = await Stockage.ouvrir();

  runApp(
    ProviderScope(
      overrides: [stockageProvider.overrideWithValue(stockage)],
      child: const ApplicationLgr(),
    ),
  );
}

class ApplicationLgr extends ConsumerStatefulWidget {
  const ApplicationLgr({super.key});

  @override
  ConsumerState<ApplicationLgr> createState() => _EtatApplicationLgr();
}

class _EtatApplicationLgr extends ConsumerState<ApplicationLgr> {
  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);

    return MaterialApp(
      title: 'Lycée Guergné La Renaissance',
      debugShowCheckedModeBanner: false,
      theme: ThemeLgr.clair(),
      darkTheme: ThemeLgr.sombre(),
      // Le mode suit le réglage du téléphone : imposer le clair à quelqu'un
      // qui a choisi le sombre lui brûle les yeux le soir, et inversement.
      themeMode: ThemeMode.system,
      home: switch (session.etat) {
        EtatSession.inconnu => const EcranDemarrage(),
        EtatSession.deconnecte => const EcranActivation(),
        EtatSession.connecte => const Coque(),
      },
    );
  }
}
