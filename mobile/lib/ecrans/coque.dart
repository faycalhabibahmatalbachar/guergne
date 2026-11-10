import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../design/barre_navigation.dart';
import '../design/theme.dart';
import '../etat/fournisseurs.dart';
import '../services/banniere_notification.dart';
import 'accueil.dart';
import 'assiduite.dart';
import 'finances.dart';
import 'notes.dart';
import 'plus.dart';
import 'profil.dart';

/// Coque de l'application : les cinq onglets.
///
/// `PageView` ET conservation d'état, pas l'un ou l'autre.
///
/// La première version employait un `IndexedStack` pour garder l'état de
/// chaque onglet — position de défilement, période choisie, carte dépliée — et
/// pour ne pas relancer les appels réseau, qui coûtent cher sur un forfait
/// tchadien. C'était juste, mais cela interdisait le balayage : on ne pouvait
/// changer d'onglet qu'en visant une icône de vingt pixels en bas d'écran.
///
/// Le `PageView` rétablit le geste. `AutomaticKeepAliveClientMixin` sur chaque
/// page rétablit l'état : les cinq restent vivantes une fois visitées, et
/// aucune ne se reconstruit au retour. On a les deux.
///
/// Design 3 : le cinquième onglet est « Plus », et non plus « Annonces ».
/// Les annonces, les bulletins, l'emploi du temps et le compte y sont
/// rassemblés ; les annonces restent aussi à un geste depuis l'accueil — la
/// cloche, la carte « Dernière annonce », la tuile d'accès rapide.
///
/// Le profil n'est PAS une sixième page. C'est un écran de réglages, pas une
/// étape du parcours : il s'ouvre en superposition depuis « Plus » et se
/// referme par le retour du système.
class Coque extends ConsumerStatefulWidget {
  const Coque({super.key});

  @override
  ConsumerState<Coque> createState() => _EtatCoque();
}

class _EtatCoque extends ConsumerState<Coque> {
  final _pages = PageController();
  int _onglet = 0;

  /// Aller à un onglet, depuis la barre du bas ou une notification.
  ///
  /// L'animation est réservée aux onglets VOISINS. Passer de l'accueil aux
  /// annonces en animé ferait défiler les trois écrans intermédiaires en un
  /// éclair : un scintillement que l'œil lit comme un défaut, et trois pages
  /// construites pour rien.
  void _aller(int index) {
    if (index == _onglet) return;
    if ((index - _onglet).abs() == 1) {
      _pages.animateToPage(index, duration: ThemeLgr.dureeMoyenne, curve: ThemeLgr.ressortDoux);
    } else {
      _pages.jumpToPage(index);
    }
  }

  void _ouvrirCompte() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => EcranProfil(surRetour: () => Navigator.of(context).pop()),
      ),
    );
  }

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
    _pages.dispose();
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

    ref.read(notificationsProvider).routeDemandee.value = null;
    if (!mounted) return;

    // Les annonces n'ont plus d'onglet : la notification ouvre directement
    // leur liste, par-dessus l'accueil — le retour y ramène.
    if (route.contains('annonce')) {
      _aller(0);
      ouvrirAnnonces(context);
      return;
    }

    final onglet = switch (route) {
      final r when r.contains('assiduite') => 2,
      final r when r.contains('bulletin') || r.contains('note') => 1,
      final r when r.contains('paiement') || r.contains('echeance') => 3,
      _ => 0,
    };
    _aller(onglet);
  }

  @override
  Widget build(BuildContext context) {
    // Le compteur d'annonces non lues, porté par l'onglet « Plus » qui les
    // contient — en plus de la cloche de l'accueil. C'est le seul badge de
    // l'application, réservé à ce qui demande vraiment une action.
    final nonLues =
        ref.watch(accueilProvider).value?.valeur.annonces.where((a) => !a.lue).length ?? 0;

    return Scaffold(
      body: Stack(
        children: [
          PageView(
            controller: _pages,
            onPageChanged: (i) => setState(() => _onglet = i),
            children: [
              _Vivante(
                child: EcranAccueil(versOnglet: _aller, versCompte: _ouvrirCompte),
              ),
              const _Vivante(child: EcranNotes()),
              const _Vivante(child: EcranAssiduite()),
              const _Vivante(child: EcranFinances()),
              _Vivante(child: EcranPlus(versCompte: _ouvrirCompte)),
            ],
          ),

          // Le bandeau SURVOLE la page au lieu de la pousser.
          //
          // Dans la version précédente il vivait dans une colonne : son arrivée
          // décalait l'écran entier vers le bas, en-tête compris, et son départ
          // le faisait remonter. Un contenu qui saute pendant qu'on le lit fait
          // perdre sa ligne — et peut faire appuyer sur ce qui vient de glisser
          // sous le doigt.
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: ValueListenableBuilder<RemoteMessage?>(
              valueListenable: ref.read(notificationsProvider).messageEnCours,
              builder: (context, message, _) {
                if (message == null) return const SizedBox.shrink();
                return SafeArea(
                  bottom: false,
                  child: BanniereNotification(
                    message: message,
                    surFermer: () => ref.read(notificationsProvider).messageEnCours.value = null,
                    // Le bandeau MÈNE à l'écran concerné : il annonçait une
                    // absence sans permettre d'aller la voir.
                    surOuvrir: () {
                      final route = message.data['route']?.toString();
                      if (route != null) {
                        ref.read(notificationsProvider).routeDemandee.value = route;
                      }
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
      bottomNavigationBar: BarreNavigationParent(
        indexActif: _onglet,
        surChoix: _aller,
        destinations: [
          const DestinationParent(
            libelle: 'Accueil',
            icone: Icons.home_outlined,
            iconeActive: Icons.home_rounded,
          ),
          const DestinationParent(
            libelle: 'Résultats',
            icone: Icons.bar_chart_rounded,
            iconeActive: Icons.bar_chart_rounded,
          ),
          const DestinationParent(
            libelle: 'Assiduité',
            icone: Icons.event_available_outlined,
            iconeActive: Icons.event_available_rounded,
          ),
          const DestinationParent(
            libelle: 'Scolarité',
            icone: Icons.account_balance_wallet_outlined,
            iconeActive: Icons.account_balance_wallet_rounded,
          ),
          DestinationParent(
            libelle: 'Plus',
            icone: Icons.more_horiz_rounded,
            iconeActive: Icons.more_horiz_rounded,
            badge: nonLues,
          ),
        ],
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

/// Garde une page vivante quand le `PageView` s'en éloigne.
///
/// Sans cela, un `PageView` détruit les pages non adjacentes : revenir sur
/// l'accueil après un passage par les annonces relancerait sa requête réseau et
/// perdrait la position de défilement. Sur un forfait facturé au mégaoctet,
/// c'est un coût réel payé pour un aller-retour de curiosité.
class _Vivante extends StatefulWidget {
  const _Vivante({required this.child});

  final Widget child;

  @override
  State<_Vivante> createState() => _EtatVivante();
}

class _EtatVivante extends State<_Vivante> with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  @override
  Widget build(BuildContext context) {
    // `super.build` n'est pas décoratif : c'est lui qui enregistre la page
    // auprès du mécanisme de conservation.
    super.build(context);
    return widget.child;
  }
}
