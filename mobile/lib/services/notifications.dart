import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'api.dart';

/// Notifications poussées.
///
/// Le service rend trois choses possibles, et chacune se rate différemment :
///
///  1. **Recevoir le jeton et le transmettre à l'école.** Firebase renouvelle
///     ce jeton sans prévenir — réinstallation, restauration, effacement des
///     données. L'application le repousse donc à chaque démarrage ET à chaque
///     rotation, sinon les alertes d'absence cessent d'arriver en silence.
///     C'est le pire mode de panne pour cette fonction : personne ne se plaint
///     de ne pas recevoir ce qu'il ignore attendre.
///
///  2. **Afficher quelque chose quand l'application est ouverte.** Android
///     n'affiche RIEN de lui-même dans ce cas : sans traitement explicite, le
///     parent qui consulte l'application au moment où l'absence est saisie ne
///     voit jamais l'alerte.
///
///  3. **Ouvrir le bon écran quand on tape la notification.** Trois états à
///     couvrir : application au premier plan, en arrière-plan, et fermée. Le
///     troisième est celui que les intégrations oublient le plus souvent, et
///     c'est le plus fréquent dans la vraie vie.
class ServiceNotifications {
  ServiceNotifications(this._api);

  final ApiEcole _api;

  /// Route demandée par une notification sur laquelle le parent a tapé.
  ///
  /// L'écran d'accueil l'observe : il ne peut pas naviguer avant d'être
  /// construit, et la notification qui a lancé l'application arrive avant.
  final ValueNotifier<String?> routeDemandee = ValueNotifier(null);

  StreamSubscription<String>? _rotation;
  StreamSubscription<RemoteMessage>? _premierPlan;
  StreamSubscription<RemoteMessage>? _ouverture;

  /// Message affiché dans l'application quand elle est au premier plan.
  final ValueNotifier<RemoteMessage?> messageEnCours = ValueNotifier(null);

  bool _demarre = false;

  /// Démarre le service. Sans effet si Firebase n'est pas configuré.
  ///
  /// L'absence de configuration n'est PAS une erreur : sur un poste de
  /// développement sans `google-services.json`, l'application doit se lancer
  /// normalement, simplement sans notifications.
  Future<void> demarrer() async {
    if (_demarre) return;

    try {
      await Firebase.initializeApp();
    } catch (erreur) {
      debugPrint('Firebase non configuré, notifications désactivées : $erreur');
      return;
    }

    _demarre = true;
    final messagerie = FirebaseMessaging.instance;

    // Depuis Android 13, l'autorisation est obligatoire et doit être demandée
    // explicitement. Sur les versions antérieures, l'appel réussit sans rien
    // afficher.
    final permission = await messagerie.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    if (permission.authorizationStatus == AuthorizationStatus.denied) {
      debugPrint('Notifications refusées par le parent.');
      // On continue quand même : le jeton reste utile si l'autorisation est
      // accordée plus tard depuis les réglages du téléphone.
    }

    await _transmettre(await messagerie.getToken());

    // Rotation du jeton : Firebase le remplace sans prévenir.
    _rotation = messagerie.onTokenRefresh.listen(_transmettre);

    // Application ouverte : Android n'affiche rien, c'est à nous de le faire.
    _premierPlan = FirebaseMessaging.onMessage.listen((message) {
      messageEnCours.value = message;
    });

    // Application en arrière-plan, notification tapée.
    _ouverture = FirebaseMessaging.onMessageOpenedApp.listen(_ouvrir);

    // Application FERMÉE, lancée par la notification. Ce message n'arrive par
    // aucun flux : il faut aller le chercher.
    final initial = await messagerie.getInitialMessage();
    if (initial != null) _ouvrir(initial);
  }

  void _ouvrir(RemoteMessage message) {
    final route = message.data['route'] ?? message.data['route_cible'];
    if (route is String && route.isNotEmpty) routeDemandee.value = route;
  }

  Future<void> _transmettre(String? jeton) async {
    if (jeton == null || jeton.isEmpty) return;

    try {
      await _api.poster('/api/mobile/appareil', corps: {
        'jetonFcm': jeton,
        'plateforme': defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android',
        'versionApp': '1.0.0',
        'langue': 'fr',
      });
      debugPrint('Jeton de notification transmis à l\'école.');
    } catch (erreur) {
      // Hors ligne au démarrage : le jeton repartira au prochain lancement.
      // Rien à signaler au parent, il n'y peut rien.
      debugPrint('Jeton non transmis pour le moment : $erreur');
    }
  }

  void arreter() {
    _rotation?.cancel();
    _premierPlan?.cancel();
    _ouverture?.cancel();
    _demarre = false;
  }
}

/// Bandeau affiché quand une notification arrive, application ouverte.
///
/// Une bannière discrète plutôt qu'une boîte de dialogue : le parent est peut-
/// être en train de lire les notes de son enfant, on l'informe sans lui couper
/// la parole.
class BanniereNotification extends StatelessWidget {
  const BanniereNotification({
    super.key,
    required this.message,
    required this.surFermer,
    required this.surOuvrir,
  });

  final RemoteMessage message;
  final VoidCallback surFermer;
  final VoidCallback surOuvrir;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final titre = message.notification?.title ?? 'Nouvelle information';
    final corps = message.notification?.body ?? '';

    return Material(
      color: Colors.transparent,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: theme.colorScheme.primary,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            children: [
              const Icon(Icons.notifications_active_rounded, color: Colors.white, size: 22),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      titre,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (corps.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        corps,
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.9),
                          fontSize: 12.5,
                          height: 1.35,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ],
                ),
              ),
              IconButton(
                onPressed: surFermer,
                icon: const Icon(Icons.close_rounded, color: Colors.white, size: 20),
                tooltip: 'Fermer',
              ),
            ],
          ),
        ),
      ),
    );
  }
}
