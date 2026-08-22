import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../design/theme.dart';
import '../etat/fournisseurs.dart';
import '../services/notifications.dart';
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
  /// Index dans la pile. 0 à 4 correspondent aux onglets ; 5 est l'écran du
  /// compte, qui n'a pas d'onglet et s'atteint depuis la bannière d'accueil.
  static const _ongletCompte = 5;

  int _onglet = 0;

  void _aller(int index) => setState(() => _onglet = index);

  @override
  void initState() {
    super.initState();

    // Une notification tapée demande un écran. On l'écoute ici parce que la
    // coque est le premier widget capable de naviguer — le service, lui,
    // reçoit la demande avant même que l'interface n'existe.
    final service = ref.read(notificationsProvider);
    service.routeDemandee.addListener(_suivreRoute);
    if (service.routeDemandee.value != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _suivreRoute());
    }
  }

  @override
  void dispose() {
    ref.read(notificationsProvider).routeDemandee.removeListener(_suivreRoute);
    super.dispose();
  }

  /// Traduit la route portée par la notification en onglet.
  ///
  /// Le serveur envoie des chemins comme `/eleves/{id}/assiduite` : on n'a pas
  /// d'écran par élève, mais l'onglet Assiduité est la bonne destination et le
  /// sélecteur d'enfant fait le reste.
  void _suivreRoute() {
    final route = ref.read(notificationsProvider).routeDemandee.value;
    if (route == null) return;

    final onglet = switch (route) {
      final r when r.contains('assiduite') => 2,
      final r when r.contains('bulletin') || r.contains('note') => 1,
      final r when r.contains('paiement') || r.contains('echeance') => 3,
      final r when r.contains('annonce') => 4,
      _ => 0,
    };

    if (mounted) setState(() => _onglet = onglet);
    ref.read(notificationsProvider).routeDemandee.value = null;
  }

  @override
  Widget build(BuildContext context) {
    // Le compteur d'annonces non lues sur l'onglet : c'est le seul badge de
    // l'application, réservé à ce qui demande vraiment une action.
    final nonLues =
        ref.watch(accueilProvider).value?.valeur.annonces.where((a) => !a.lue).length ?? 0;

    return Scaffold(
      body: Column(
        children: [
          // Bannière des notifications reçues application ouverte : Android
          // n'affiche rien de lui-même dans ce cas.
          ValueListenableBuilder<RemoteMessage?>(
            valueListenable: ref.read(notificationsProvider).messageEnCours,
            builder: (context, message, _) {
              if (message == null) return const SizedBox.shrink();
              return SafeArea(
                bottom: false,
                child: BanniereNotification(
                  message: message,
                  surFermer: () =>
                      ref.read(notificationsProvider).messageEnCours.value = null,
                  surOuvrir: () {},
                ),
              );
            },
          ),
          Expanded(
            child: IndexedStack(
              index: _onglet,
              children: [
                EcranAccueil(versOnglet: _aller, versCompte: () => setState(() => _onglet = _ongletCompte)),
                const EcranNotes(),
                const EcranAssiduite(),
                const EcranFinances(),
                const EcranAnnonces(),
                EcranProfil(surRetour: () => setState(() => _onglet = 0)),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        // Sur l'écran du compte, aucun onglet n'est actif : on retient le
        // dernier consulté plutôt que d'allumer « Annonces » par accident,
        // ce qui ferait croire au parent qu'il est ailleurs qu'il n'est.
        selectedIndex: _onglet == _ongletCompte ? 0 : _onglet,
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
