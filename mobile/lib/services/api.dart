import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import '../modeles/modeles.dart';
import 'stockage.dart';

/// Client de l'API de l'école.
///
/// Trois responsabilités qu'on ne veut surtout pas voir remonter dans les
/// écrans :
///
///  1. **Rotation du jeton.** Le jeton d'accès vit 30 minutes ; le client le
///     renouvelle sur 401 et rejoue la requête. Un parent ne doit jamais voir
///     « session expirée » en pleine consultation.
///
///  2. **Une seule rotation à la fois.** Si trois écrans se rafraîchissent
///     ensemble et reçoivent trois 401, une rotation par écran révoquerait la
///     chaîne — le serveur interprète le rejeu d'un jeton consommé comme un
///     vol. D'où le verrou : les autres attendent la première.
///
///  3. **Erreurs traduites.** Les écrans reçoivent une `ErreurApi` avec un
///     message affichable en français, jamais une `DioException`.
class ErreurApi implements Exception {
  ErreurApi(this.message, {this.code, this.statut, this.horsLigne = false});

  final String message;
  final String? code;
  final int? statut;
  final bool horsLigne;

  /// Vrai quand la session est définitivement perdue : l'application doit
  /// alors ramener le parent à l'écran d'activation.
  bool get sessionPerdue => statut == 401;

  @override
  String toString() => message;
}

class ApiEcole {
  ApiEcole({required Stockage stockage, required String base})
    // Dart interdit un paramètre nommé commençant par un souligné : le formel
    // d'initialisation que réclame l'analyseur est donc impossible ici.
    // ignore: prefer_initializing_formals
    : _stockage = stockage,
      _dio = Dio(
        BaseOptions(
          baseUrl: base,
          // Délais généreux : sur un réseau 2G/3G tchadien, 10 s
          // provoqueraient des échecs sur des requêtes qui auraient abouti.
          connectTimeout: const Duration(seconds: 20),
          receiveTimeout: const Duration(seconds: 40),
          headers: {'Accept': 'application/json'},
          // On gère les codes d'erreur nous-mêmes, y compris 401.
          validateStatus: (_) => true,
        ),
      );

  final Stockage _stockage;
  final Dio _dio;

  /// Rotation en cours, partagée par tous les appels concurrents.
  Future<bool>? _rotationEnCours;

  /// Appelé quand la session est définitivement perdue.
  void Function()? surSessionPerdue;

  // --- Requêtes -----------------------------------------------------------

  Future<Map<String, dynamic>> obtenir(String chemin, {Map<String, dynamic>? parametres}) =>
      _appeler('GET', chemin, parametres: parametres);

  Future<Map<String, dynamic>> poster(String chemin, {Object? corps}) =>
      _appeler('POST', chemin, corps: corps);

  Future<Map<String, dynamic>> supprimer(String chemin, {Map<String, dynamic>? parametres}) =>
      _appeler('DELETE', chemin, parametres: parametres);

  Future<Map<String, dynamic>> _appeler(
    String methode,
    String chemin, {
    Object? corps,
    Map<String, dynamic>? parametres,
    bool authentifie = true,
    bool dejaRejoue = false,
  }) async {
    Response<dynamic> reponse;

    try {
      reponse = await _dio.request<dynamic>(
        chemin,
        data: corps,
        queryParameters: parametres,
        options: Options(method: methode, headers: authentifie ? await _enteteAuth() : null),
      );
    } on DioException catch (erreur) {
      throw ErreurApi(_messageReseau(erreur), horsLigne: true);
    }

    // 401 : le jeton d'accès a expiré. Une seule tentative de rotation, sans
    // quoi un refus permanent boucherait indéfiniment.
    if (reponse.statusCode == 401 && authentifie && !dejaRejoue) {
      final renouvele = await _rafraichir();
      if (renouvele) {
        return _appeler(methode, chemin, corps: corps, parametres: parametres, dejaRejoue: true);
      }
      surSessionPerdue?.call();
    }

    final donnees = reponse.data;
    final Map<String, dynamic> charge = donnees is Map
        ? Map<String, dynamic>.from(donnees)
        : <String, dynamic>{};

    if (reponse.statusCode! >= 400) {
      throw ErreurApi(
        charge['message']?.toString() ?? _messageStatut(reponse.statusCode!),
        code: charge['erreur']?.toString(),
        statut: reponse.statusCode,
      );
    }

    return charge;
  }

  /// Adresse de la photo d'un élève, et l'en-tête qui l'autorise.
  ///
  /// `Image.network` ne passe pas par Dio : il lui faut l'URL complète ET
  /// l'en-tête `Authorization`. La route mobile vérifie le lien tuteur-élève —
  /// un parent ne charge que la photo de ses enfants — et un jeton absent
  /// donnerait un 401 que le composant traduit en initiales.
  ///
  /// La rotation du jeton n'est PAS déclenchée ici : une photo qui ne se charge
  /// pas retombe sur les initiales, ce qui est acceptable. Faire tourner le
  /// jeton pour une image ferait passer une décoration avant les données.
  ///
  /// Le chemin porte `/api/mobile` en entier. `baseUrl` ne vaut QUE le domaine
  /// — chaque appel Dio écrit son préfixe lui-même — et l'omettre ici pointait
  /// sur une adresse inexistante. L'échec était silencieux : `Image.network`
  /// retombe sur les initiales, exactement comme lorsqu'il n'y a pas de photo.
  /// Rien à l'écran ne distinguait « pas de photo » de « mauvaise URL ».
  String urlPhotoEnfant(String eleveId) =>
      '${_dio.options.baseUrl}/api/mobile/enfants/$eleveId/photo';

  Future<Map<String, String>> enteteImage() => _enteteAuth();

  Future<Map<String, String>> _enteteAuth() async {
    final jeton = await _stockage.jetonAcces;
    return {if (jeton != null) 'Authorization': 'Bearer $jeton'};
  }

  // --- Rotation -----------------------------------------------------------

  Future<bool> _rafraichir() {
    // Le verrou : le premier appelant lance la rotation, les suivants
    // attendent son résultat au lieu d'en déclencher une deuxième.
    return _rotationEnCours ??= _rafraichirVraiment().whenComplete(() {
      _rotationEnCours = null;
    });
  }

  Future<bool> _rafraichirVraiment() async {
    final jeton = await _stockage.jetonRafraichissement;
    if (jeton == null) return false;

    try {
      final reponse = await _dio.post<dynamic>(
        '/api/mobile/session/rafraichir',
        data: {'rafraichissement': jeton},
      );

      if (reponse.statusCode != 200 || reponse.data is! Map) return false;

      final charge = Map<String, dynamic>.from(reponse.data as Map);
      await _stockage.enregistrerJetons(
        acces: charge['acces'] as String,
        rafraichissement: charge['rafraichissement'] as String,
      );
      return true;
    } catch (erreur) {
      debugPrint('Rotation du jeton impossible : $erreur');
      return false;
    }
  }

  // --- Messages -----------------------------------------------------------

  String _messageReseau(DioException erreur) => switch (erreur.type) {
    DioExceptionType.connectionTimeout ||
    DioExceptionType.sendTimeout ||
    DioExceptionType.receiveTimeout => 'La connexion est trop lente. Réessayez dans un instant.',
    DioExceptionType.connectionError =>
      "Pas de connexion Internet. Les informations affichées datent de votre dernière consultation.",
    _ => "Impossible de joindre l'école. Réessayez plus tard.",
  };

  String _messageStatut(int statut) => switch (statut) {
    401 => 'Session expirée. Reconnectez-vous.',
    404 => 'Information introuvable.',
    429 => 'Trop de tentatives. Patientez quelques minutes.',
    >= 500 => "Le service de l'école est momentanément indisponible.",
    _ => "Une erreur est survenue.",
  };

  // --- Session ------------------------------------------------------------

  /// Demande l'envoi d'un code par SMS. Ne nécessite aucun jeton.
  Future<void> demanderCode(String telephone) => _appeler(
    'POST',
    '/api/mobile/activation',
    corps: {'telephone': telephone},
    authentifie: false,
  );

  /// Échange téléphone + code contre une session. Retourne le profil.
  Future<Map<String, dynamic>> ouvrirSession({
    required String telephone,
    required String code,
    Map<String, dynamic>? appareil,
  }) async {
    final charge = await _appeler(
      'POST',
      '/api/mobile/session',
      corps: {'telephone': telephone, 'code': code, 'appareil': ?appareil},
      authentifie: false,
    );

    await _stockage.enregistrerJetons(
      acces: charge['acces'] as String,
      rafraichissement: charge['rafraichissement'] as String,
    );

    final profil = Map<String, dynamic>.from(charge['profil'] as Map);
    await _stockage.enregistrerProfil(profil);
    return profil;
  }

  Future<void> fermerSession() async {
    try {
      await supprimer('/api/mobile/session');
    } catch (erreur) {
      // Une déconnexion doit aboutir même hors ligne : les jetons locaux
      // partent de toute façon, quitte à laisser une session ouverte côté
      // serveur jusqu'à son expiration.
      debugPrint('Déconnexion serveur impossible : $erreur');
    }
    await _stockage.effacerTout();
  }

  // -------------------------------------------------------------------------
  // Bulletins
  // -------------------------------------------------------------------------

  /// Bulletins publiés d'un enfant.
  Future<List<Bulletin>> bulletins(String eleveId) async {
    final reponse = await obtenir('/api/mobile/enfants/$eleveId/bulletins');
    final liste = (reponse['bulletins'] as List<dynamic>? ?? const []);
    return liste
        .map((b) => Bulletin.depuisJson(b as Map<String, dynamic>))
        .toList(growable: false);
  }

  /// Télécharge un bulletin en PDF et rend le chemin du fichier écrit.
  ///
  /// POURQUOI PASSER PAR DIO PLUTÔT QUE PAR LE NAVIGATEUR
  /// -----------------------------------------------------
  /// Ouvrir l'URL dans le navigateur du téléphone perdrait le jeton
  /// d'authentification : la route exige un en-tête `Authorization`, qu'un
  /// navigateur externe n'a pas. Le PDF arriverait donc en 401.
  ///
  /// Le fichier est écrit dans le dossier de DOCUMENTS de l'application, pas
  /// dans un cache : un parent qui télécharge le bulletin de son enfant
  /// s'attend à le retrouver, y compris hors ligne, y compris trois mois plus
  /// tard.
  Future<String> telechargerBulletin(String url, String nomFichier) async {
    final dossier = await getApplicationDocumentsDirectory();
    final chemin = '${dossier.path}/$nomFichier';

    final reponse = await _dio.get<List<int>>(
      url,
      options: Options(
        responseType: ResponseType.bytes,
        headers: await _enteteAuth(),
        // On gère les codes nous-mêmes : un 403 « non publié » est une
        // information à afficher, pas une exception à faire remonter brute.
        validateStatus: (_) => true,
      ),
    );

    if (reponse.statusCode == 401) {
      // Jeton expiré : on rejoue une fois après rotation, comme les autres
      // appels. Sans cela, un parent qui laisse l'application ouverte une
      // heure verrait le téléchargement échouer sans raison visible.
      if (await _rafraichir()) {
        return telechargerBulletin(url, nomFichier);
      }
      throw ErreurApi('Session expirée. Reconnectez-vous.', statut: 401);
    }

    if (reponse.statusCode != 200 || reponse.data == null) {
      throw ErreurApi(
        reponse.statusCode == 403
            ? "Ce bulletin n'est pas encore publié par l'établissement."
            : 'Téléchargement impossible.',
        statut: reponse.statusCode ?? 0,
      );
    }

    final fichier = File(chemin);
    await fichier.writeAsBytes(reponse.data!, flush: true);
    return chemin;
  }
}
