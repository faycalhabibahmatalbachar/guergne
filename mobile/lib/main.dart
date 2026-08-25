import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'design/theme.dart';
import 'ecrans/activation.dart';
import 'ecrans/bienvenue.dart';
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
  /// `null` tant que le stockage n'a pas répondu — on ne peut pas décider
  /// d'afficher la bienvenue avant de savoir si elle a déjà été vue, sinon
  /// elle clignoterait à chaque lancement.
  bool? _bienvenueVue;

  @override
  void initState() {
    super.initState();
    _bienvenueVue = ref.read(stockageProvider).bienvenueVue;
  }

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
        // La bienvenue s'intercale AVANT l'activation, jamais après : elle
        // explique ce qu'on va demander et pourquoi. Montrée après, elle
        // raconterait une application que le parent a déjà sous les yeux.
        EtatSession.deconnecte when _bienvenueVue == false => EcranBienvenue(
          onTermine: () {
            ref.read(stockageProvider).marquerBienvenueVue();
            setState(() => _bienvenueVue = true);
          },
        ),
        EtatSession.deconnecte => const EcranActivation(),
        EtatSession.connecte => const Coque(),
      },
    );
  }
}
