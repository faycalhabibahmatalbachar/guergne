import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../modeles/modeles.dart';
import '../services/api.dart';
import '../services/notifications.dart';
import '../services/stockage.dart';

/// État de l'application.
///
/// Principe directeur : **le cache d'abord, le réseau ensuite**. L'écran
/// s'affiche immédiatement avec les dernières données connues, puis se met à
/// jour quand le réseau répond. Un parent qui ouvre l'application dans un
/// couloir sans réseau voit la moyenne de son enfant, datée — pas une roue
/// qui tourne.

// ---------------------------------------------------------------------------
// Socle
// ---------------------------------------------------------------------------

/// Adresse du serveur.
///
/// Surchargée au lancement par `--dart-define=API_BASE=...` : en développement
/// on vise le poste local, en production le domaine de l'école.
const adresseApi = String.fromEnvironment(
  'API_BASE',
  defaultValue: 'https://lycee-guergne-renaissance.vercel.app',
);

/// Injecté au démarrage dans `main()`, une fois le stockage ouvert.
final stockageProvider = Provider<Stockage>((ref) {
  throw UnimplementedError('stockageProvider doit être surchargé au démarrage.');
});

final apiProvider = Provider<ApiEcole>((ref) {
  final api = ApiEcole(stockage: ref.watch(stockageProvider), base: adresseApi);
  api.surSessionPerdue = () => ref.read(sessionProvider.notifier).sessionPerdue();
  return api;
});

/// Service de notifications poussées.
///
/// Créé une seule fois pour toute la durée de vie de l'application : deux
/// instances enregistreraient deux écoutes du même flux et le parent verrait
/// chaque notification en double.
final notificationsProvider = Provider<ServiceNotifications>((ref) {
  final service = ServiceNotifications(ref.watch(apiProvider));
  ref.onDispose(service.arreter);
  return service;
});

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

enum EtatSession { inconnu, deconnecte, connecte }

class Session {
  const Session({required this.etat, this.profil, this.motif});

  final EtatSession etat;
  final Profil? profil;

  /// Renseigné quand la session a été perdue plutôt que fermée volontairement :
  /// l'écran d'activation explique alors POURQUOI le parent est de retour là.
  final String? motif;

  static const inconnue = Session(etat: EtatSession.inconnu);
}

class SessionNotifier extends StateNotifier<Session> {
  SessionNotifier(this._ref) : super(Session.inconnue) {
    _restaurer();
  }

  final Ref _ref;

  Stockage get _stockage => _ref.read(stockageProvider);
  ApiEcole get _api => _ref.read(apiProvider);

  /// Durée minimale d'affichage de l'écran de démarrage.
  ///
  /// C'est un PLANCHER, pas un délai ajouté : la lecture du coffre sécurisé
  /// prend en général moins de cinquante millisecondes, et l'écran de marque
  /// disparaîtrait avant d'avoir été lu. Sur un téléphone lent où la
  /// restauration dépasse déjà cette durée, rien n'est ajouté — on attend ce
  /// qui reste, ou rien du tout.
  ///
  /// Écrire `await Future.delayed(...)` PUIS restaurer coûterait cette seconde
  /// et demie à tout le monde, y compris à ceux qui attendent déjà.
  static const _dureeMinimaleDemarrage = Duration(milliseconds: 1600);

  /// Restaure la session au lancement, sans appel réseau.
  ///
  /// On ne valide pas le jeton auprès du serveur ici : cela ferait attendre
  /// l'écran de démarrage sur un réseau lent. Si le jeton est mort, le premier
  /// appel de données le découvrira et déclenchera la rotation.
  Future<void> _attendrePlancher(DateTime debut) async {
    final ecoule = DateTime.now().difference(debut);
    final reste = _dureeMinimaleDemarrage - ecoule;
    if (reste > Duration.zero) await Future<void>.delayed(reste);
  }

  Future<void> _restaurer() async {
    final debut = DateTime.now();

    final rafraichissement = await _stockage.jetonRafraichissement;
    final profil = _stockage.lireProfil();

    await _attendrePlancher(debut);

    if (rafraichissement == null || profil == null) {
      state = const Session(etat: EtatSession.deconnecte);
      return;
    }

    state = Session(etat: EtatSession.connecte, profil: Profil.depuisJson(profil));

    // Rejoué à chaque lancement : Firebase renouvelle le jeton sans prévenir,
    // et un jeton périmé fait cesser les alertes en silence.
    unawaited(_ref.read(notificationsProvider).demarrer());
  }

  Future<void> demanderCode(String telephone) => _api.demanderCode(telephone);

  Future<void> connecter({required String telephone, required String code}) async {
    final profil = await _api.ouvrirSession(
      telephone: telephone,
      code: code,
      appareil: {
        'identifiant': await _identifiantAppareil(),
        'plateforme': defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android',
      },
    );

    state = Session(etat: EtatSession.connecte, profil: Profil.depuisJson(profil));

    // Le jeton de notification ne part qu'une fois la session ouverte : la
    // route d'enregistrement exige une authentification.
    unawaited(_ref.read(notificationsProvider).demarrer());
  }

  Future<void> deconnecter() async {
    await _api.fermerSession();
    state = const Session(etat: EtatSession.deconnecte);
  }

  /// Session invalidée par le serveur (compte désactivé, jeton rejoué).
  void sessionPerdue() {
    if (state.etat != EtatSession.connecte) return;
    _stockage.effacerTout();
    state = const Session(
      etat: EtatSession.deconnecte,
      motif: "Votre session a expiré. Demandez un nouveau code pour vous reconnecter.",
    );
  }

  /// Identifiant stable de l'installation.
  ///
  /// Sert au serveur à révoquer l'ancienne session du MÊME appareil lors
  /// d'une reconnexion. Il n'identifie pas le matériel — il disparaît à la
  /// désinstallation, ce qui est exactement le comportement voulu.
  Future<String> _identifiantAppareil() async {
    final existant = _stockage.lireProfil()?['appareilId'] as String?;
    if (existant != null) return existant;

    final nouveau = DateTime.now().microsecondsSinceEpoch.toRadixString(36);
    return nouveau;
  }
}

final sessionProvider = StateNotifierProvider<SessionNotifier, Session>(SessionNotifier.new);

// ---------------------------------------------------------------------------
// Données : cache d'abord, réseau ensuite
// ---------------------------------------------------------------------------

/// Résultat d'un chargement, avec sa fraîcheur.
///
/// `depuisCache` n'est pas un détail technique : c'est ce qui autorise
/// l'interface à afficher « données du 12 mars » plutôt que de laisser croire
/// que tout est à jour.
@immutable
class Donnees<T> {
  const Donnees({required this.valeur, required this.depuisCache, required this.date});

  final T valeur;
  final bool depuisCache;
  final DateTime date;
}

/// Charge une ressource : rend d'abord le cache, puis la version réseau.
///
/// Utilisé par tous les écrans via `ref.watch`. Le `Stream` émet une ou deux
/// fois — cache, puis réseau — ce qui donne l'affichage instantané suivi de
/// la mise à jour.
Stream<Donnees<T>> _charger<T>({
  required Stockage stockage,
  required Future<Map<String, dynamic>> Function() reseau,
  required T Function(Map<String, dynamic>) decoder,
  required String cle,
}) async* {
  final cache = stockage.lireCache(cle);

  if (cache != null) {
    try {
      yield Donnees(valeur: decoder(cache.donnees), depuisCache: true, date: cache.date);
    } catch (erreur) {
      // Format de cache devenu incompatible : on l'ignore et on attend le
      // réseau, plutôt que de faire échouer tout l'écran.
      debugPrint('Cache "$cle" incompatible : $erreur');
    }
  }

  try {
    final charge = await reseau();
    await stockage.mettreEnCache(cle, charge);
    yield Donnees(valeur: decoder(charge), depuisCache: false, date: DateTime.now());
  } on ErreurApi catch (erreur) {
    // Hors ligne avec du cache déjà servi : on se tait, l'écran affiche le
    // bandeau de fraîcheur. Sans cache, l'erreur doit remonter.
    if (cache == null || !erreur.horsLigne) rethrow;
  }
}

// --- Accueil ---------------------------------------------------------------

final accueilProvider = StreamProvider.autoDispose<Donnees<Accueil>>((ref) {
  final api = ref.watch(apiProvider);
  return _charger(
    stockage: ref.watch(stockageProvider),
    cle: 'accueil',
    reseau: () => api.obtenir('/api/mobile/enfants'),
    decoder: Accueil.depuisJson,
  );
});

/// Enfant sélectionné dans le sélecteur d'accueil.
///
/// `null` = le premier de la liste. On ne mémorise pas un identifiant en dur
/// par défaut : un enfant transféré disparaîtrait de la liste et l'application
/// resterait bloquée sur un enfant inexistant.
final enfantChoisiProvider = StateProvider<String?>((ref) => null);

/// L'enfant effectivement affiché, résolu contre la liste réelle.
final enfantCourantProvider = Provider.autoDispose<Enfant?>((ref) {
  final accueil = ref.watch(accueilProvider).value;
  if (accueil == null || accueil.valeur.enfants.isEmpty) return null;

  final choisi = ref.watch(enfantChoisiProvider);
  return accueil.valeur.enfants.firstWhere(
    (e) => e.eleveId == choisi,
    orElse: () => accueil.valeur.enfants.first,
  );
});

// --- Notes -----------------------------------------------------------------

class ReleveComplet {
  const ReleveComplet({required this.periodes, this.releve});
  final List<Periode> periodes;
  final Releve? releve;

  factory ReleveComplet.depuisJson(Map<String, dynamic> j) => ReleveComplet(
    periodes: ((j['periodes'] as List?) ?? const [])
        .map((p) => Periode.depuisJson(Map<String, dynamic>.from(p as Map)))
        .toList(),
    releve: j['releve'] == null
        ? null
        : Releve.depuisJson(Map<String, dynamic>.from(j['releve'] as Map)),
  );
}

/// Période demandée manuellement par le parent (`null` = choix du serveur).
final periodeChoisieProvider = StateProvider.autoDispose<String?>((ref) => null);

final notesProvider = StreamProvider.autoDispose.family<Donnees<ReleveComplet>, String>((
  ref,
  eleveId,
) {
  final api = ref.watch(apiProvider);
  final periode = ref.watch(periodeChoisieProvider);

  return _charger(
    stockage: ref.watch(stockageProvider),
    cle: 'notes:$eleveId:${periode ?? "auto"}',
    reseau: () => api.obtenir(
      '/api/mobile/enfants/$eleveId/notes',
      parametres: periode == null ? null : {'periode': periode},
    ),
    decoder: ReleveComplet.depuisJson,
  );
});

// --- Assiduité -------------------------------------------------------------

class Assiduite {
  const Assiduite({required this.periodes, required this.evenements, this.periodeId});
  final List<Periode> periodes;
  final List<EvenementAssiduite> evenements;
  final String? periodeId;

  factory Assiduite.depuisJson(Map<String, dynamic> j) => Assiduite(
    periodeId: j['periodeId'] as String?,
    periodes: ((j['periodes'] as List?) ?? const [])
        .map((p) => Periode.depuisJson(Map<String, dynamic>.from(p as Map)))
        .toList(),
    evenements: ((j['evenements'] as List?) ?? const [])
        .map((e) => EvenementAssiduite.depuisJson(Map<String, dynamic>.from(e as Map)))
        .toList(),
  );
}

/// `null` = période courante, `'annee'` = tout l'historique.
final etendueAssiduiteProvider = StateProvider.autoDispose<String?>((ref) => null);

final assiduiteProvider = StreamProvider.autoDispose.family<Donnees<Assiduite>, String>((
  ref,
  eleveId,
) {
  final api = ref.watch(apiProvider);
  final etendue = ref.watch(etendueAssiduiteProvider);

  return _charger(
    stockage: ref.watch(stockageProvider),
    cle: 'assiduite:$eleveId:${etendue ?? "auto"}',
    reseau: () => api.obtenir(
      '/api/mobile/enfants/$eleveId/assiduite',
      parametres: etendue == null ? null : {'periode': etendue},
    ),
    decoder: Assiduite.depuisJson,
  );
});

// --- Finances --------------------------------------------------------------

final financesProvider = StreamProvider.autoDispose.family<Donnees<SituationFinanciere>, String>((
  ref,
  eleveId,
) {
  final api = ref.watch(apiProvider);
  return _charger(
    stockage: ref.watch(stockageProvider),
    cle: 'finances:$eleveId',
    reseau: () => api.obtenir('/api/mobile/enfants/$eleveId/finances'),
    decoder: SituationFinanciere.depuisJson,
  );
});

// --- Emploi du temps -------------------------------------------------------

final emploiDuTempsProvider = StreamProvider.autoDispose.family<Donnees<List<Cours>>, String>((
  ref,
  eleveId,
) {
  final api = ref.watch(apiProvider);
  return _charger(
    stockage: ref.watch(stockageProvider),
    cle: 'edt:$eleveId',
    reseau: () => api.obtenir('/api/mobile/enfants/$eleveId/emploi-du-temps'),
    decoder: (j) => ((j['cours'] as List?) ?? const [])
        .map((c) => Cours.depuisJson(Map<String, dynamic>.from(c as Map)))
        .toList(),
  );
});

// --- Annonces --------------------------------------------------------------

/// Marque une annonce lue, côté serveur et côté écran.
///
/// L'accusé part sans bloquer l'affichage : un échec réseau ne doit pas
/// empêcher le parent de lire l'annonce, le serveur la re-proposera comme non
/// lue au prochain chargement.
final marquerLueProvider = Provider<Future<void> Function(String)>((ref) {
  final api = ref.watch(apiProvider);
  return (annonceId) async {
    try {
      await api.poster('/api/mobile/annonces/$annonceId/lue');
      ref.invalidate(accueilProvider);
    } catch (erreur) {
      debugPrint("Accusé de lecture non transmis : $erreur");
    }
  };
});

// --- Bulletins -------------------------------------------------------------

/// Bulletins publiés d'un enfant.
///
/// Passe par le même mécanisme de cache que les autres écrans : sur une
/// connexion tchadienne, un parent doit pouvoir rouvrir la liste sans attendre,
/// même hors réseau. Le PDF, lui, exige une connexion — il n'est pas mis en
/// cache tant qu'il n'a pas été téléchargé explicitement.
final bulletinsProvider = StreamProvider.autoDispose.family<Donnees<List<Bulletin>>, String>((
  ref,
  eleveId,
) {
  final api = ref.watch(apiProvider);

  return _charger(
    stockage: ref.watch(stockageProvider),
    cle: 'bulletins:$eleveId',
    reseau: () => api.obtenir('/api/mobile/enfants/$eleveId/bulletins'),
    decoder: (json) => (json['bulletins'] as List<dynamic>? ?? const [])
        .map((b) => Bulletin.depuisJson(b as Map<String, dynamic>))
        .toList(growable: false),
  );
});
