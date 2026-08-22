import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'design/couleurs.dart';
import 'design/theme.dart';
import 'ecrans/activation.dart';
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

class ApplicationLgr extends ConsumerWidget {
  const ApplicationLgr({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
        EtatSession.inconnu => const _Demarrage(),
        EtatSession.deconnecte => const EcranActivation(),
        EtatSession.connecte => const Coque(),
      },
    );
  }
}

/// Écran de démarrage, le temps de relire les jetons du coffre sécurisé.
///
/// Il prolonge visuellement l'écran natif : même fond bleu, même logo, à la
/// même place. Sans cette continuité, le lancement montre un clignotement —
/// splash natif, puis fond blanc, puis application — que l'œil perçoit comme
/// un défaut même sans savoir le nommer.
class _Demarrage extends StatelessWidget {
  const _Demarrage();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Couleurs.primaire,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(width: 132, height: 132, child: SvgPicture.asset('assets/marque/logo.svg')),
            const SizedBox(height: 34),
            SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                strokeWidth: 2.2,
                color: Colors.white.withValues(alpha: 0.75),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
