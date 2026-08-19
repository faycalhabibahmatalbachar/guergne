import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../design/theme.dart';
import '../etat/fournisseurs.dart';
import 'accueil.dart';
import 'annonces.dart';
import 'assiduite.dart';
import 'finances.dart';
import 'notes.dart';
import 'profil.dart';

/// Coque de l'application : les cinq onglets.
///
/// `IndexedStack` et non un `PageView` : chaque onglet garde son état — la
/// position de défilement, la période sélectionnée, une carte matière
/// dépliée. Reconstruire l'onglet à chaque aller-retour relancerait aussi les
/// appels réseau, ce qui coûte cher sur un forfait tchadien.
class Coque extends ConsumerStatefulWidget {
  const Coque({super.key});

  @override
  ConsumerState<Coque> createState() => _EtatCoque();
}

class _EtatCoque extends ConsumerState<Coque> {
  int _onglet = 0;

  void _aller(int index) => setState(() => _onglet = index);

  @override
  Widget build(BuildContext context) {
    // Le compteur d'annonces non lues sur l'onglet : c'est le seul badge de
    // l'application, réservé à ce qui demande vraiment une action.
    final nonLues =
        ref.watch(accueilProvider).value?.valeur.annonces.where((a) => !a.lue).length ?? 0;

    return Scaffold(
      body: IndexedStack(
        index: _onglet,
        children: [
          EcranAccueil(versOnglet: _aller),
          const EcranNotes(),
          const EcranAssiduite(),
          const EcranFinances(),
          const EcranAnnonces(),
          const EcranProfil(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _onglet.clamp(0, 4),
        onDestinationSelected: _aller,
        // Le profil est le 6ᵉ écran mais n'a pas d'onglet : on y accède depuis
        // l'accueil. Cinq destinations est le maximum lisible en bas d'écran.
        destinations:
            const [
              NavigationDestination(
                icon: Icon(Icons.home_outlined),
                selectedIcon: Icon(Icons.home_rounded),
                label: 'Accueil',
              ),
              NavigationDestination(
                icon: Icon(Icons.workspace_premium_outlined),
                selectedIcon: Icon(Icons.workspace_premium_rounded),
                label: 'Résultats',
              ),
              NavigationDestination(
                icon: Icon(Icons.event_available_outlined),
                selectedIcon: Icon(Icons.event_available_rounded),
                label: 'Assiduité',
              ),
              NavigationDestination(
                icon: Icon(Icons.account_balance_wallet_outlined),
                selectedIcon: Icon(Icons.account_balance_wallet_rounded),
                label: 'Scolarité',
              ),
              NavigationDestination(
                icon: Icon(Icons.campaign_outlined),
                selectedIcon: Icon(Icons.campaign_rounded),
                label: 'Annonces',
              ),
            ].indexed.map((e) {
              if (e.$1 != 4 || nonLues == 0) return e.$2;
              return NavigationDestination(
                icon: Badge.count(count: nonLues, child: e.$2.icon),
                selectedIcon: Badge.count(count: nonLues, child: e.$2.selectedIcon!),
                label: e.$2.label,
              );
            }).toList(),
      ),
    );
  }
}

/// Bouton d'accès au compte, posé sur l'accueil.
class BoutonProfil extends StatelessWidget {
  const BoutonProfil({super.key, required this.surAppui});

  final VoidCallback surAppui;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: surAppui,
      icon: const Icon(Icons.person_outline_rounded, color: Colors.white),
      tooltip: 'Mon compte',
      style: IconButton.styleFrom(
        backgroundColor: Colors.white.withValues(alpha: 0.16),
        minimumSize: const Size(44, 44),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(ThemeLgr.rayonPetit)),
      ),
    );
  }
}
