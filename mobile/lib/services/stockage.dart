import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Stockage local.
///
/// Deux tiroirs, volontairement séparés :
///
///   **Secrets** (jetons) → `flutter_secure_storage`, adossé au Keystore
///   Android / Keychain iOS. Un jeton en clair dans les préférences serait
///   lisible par n'importe quelle application sur un téléphone rooté — et les
///   téléphones d'occasion rootés sont courants ici.
///
///   **Cache** (dernières données vues) → `shared_preferences`. Ce n'est pas
///   secret au sens cryptographique, et le chiffrer ralentirait l'affichage
///   au démarrage sans rien protéger de plus : les mêmes données transitent
///   déjà par l'écran.
class Stockage {
  Stockage._(this._prefs);

  // Depuis flutter_secure_storage 11, le chiffrement AES-GCM avec clé
  // enveloppée RSA est le comportement par défaut sur Android : aucune option
  // à activer, contrairement aux versions précédentes.
  static const _secrets = FlutterSecureStorage();

  static const _cleAcces = 'jeton_acces';
  static const _cleRafraichissement = 'jeton_rafraichissement';
  static const _cleProfil = 'profil';
  static const _cleBienvenueVue = 'bienvenue_vue';
  static const _prefixeCache = 'cache:';
  static const _prefixeDate = 'cache_date:';

  final SharedPreferences _prefs;

  static Future<Stockage> ouvrir() async => Stockage._(await SharedPreferences.getInstance());

  // --- Séquence de bienvenue ----------------------------------------------

  /// La séquence de bienvenue ne se montre qu'une fois.
  ///
  /// Le drapeau vit dans les préférences ordinaires et non dans le coffre
  /// sécurisé : ce n'est pas un secret, et une lecture chiffrée au démarrage
  /// coûterait quelques dizaines de millisecondes à chaque lancement pour
  /// protéger l'information qu'on a déjà lu trois écrans.
  bool get bienvenueVue => _prefs.getBool(_cleBienvenueVue) ?? false;

  Future<void> marquerBienvenueVue() => _prefs.setBool(_cleBienvenueVue, true);

  // --- Jetons -------------------------------------------------------------

  Future<String?> get jetonAcces => _secrets.read(key: _cleAcces);
  Future<String?> get jetonRafraichissement => _secrets.read(key: _cleRafraichissement);

  Future<void> enregistrerJetons({required String acces, required String rafraichissement}) async {
    await _secrets.write(key: _cleAcces, value: acces);
    await _secrets.write(key: _cleRafraichissement, value: rafraichissement);
  }

  Future<void> enregistrerAcces(String acces) => _secrets.write(key: _cleAcces, value: acces);

  /// Efface tout — jetons ET cache.
  ///
  /// Le cache doit partir avec les jetons : laisser les notes du dernier
  /// enfant visibles après une déconnexion serait une fuite de données sur un
  /// téléphone partagé, ce qui est la norme dans beaucoup de familles.
  Future<void> effacerTout() async {
    await _secrets.deleteAll();
    for (final cle in _prefs.getKeys().toList()) {
      if (cle.startsWith(_prefixeCache) || cle.startsWith(_prefixeDate) || cle == _cleProfil) {
        await _prefs.remove(cle);
      }
    }
  }

  // --- Profil -------------------------------------------------------------

  Map<String, dynamic>? lireProfil() {
    final brut = _prefs.getString(_cleProfil);
    if (brut == null) return null;
    try {
      return jsonDecode(brut) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  Future<void> enregistrerProfil(Map<String, dynamic> profil) =>
      _prefs.setString(_cleProfil, jsonEncode(profil));

  // --- Cache --------------------------------------------------------------

  Future<void> mettreEnCache(String cle, Object donnees) async {
    await _prefs.setString('$_prefixeCache$cle', jsonEncode(donnees));
    await _prefs.setString('$_prefixeDate$cle', DateTime.now().toIso8601String());
  }

  /// Lit le cache. Retourne aussi sa date : l'écran doit pouvoir dire au
  /// parent QUAND ces données ont été relevées.
  ({Map<String, dynamic> donnees, DateTime date})? lireCache(String cle) {
    final brut = _prefs.getString('$_prefixeCache$cle');
    final date = _prefs.getString('$_prefixeDate$cle');
    if (brut == null || date == null) return null;

    try {
      return (donnees: jsonDecode(brut) as Map<String, dynamic>, date: DateTime.parse(date));
    } catch (erreur) {
      // Cache corrompu (mise à jour du format, écriture interrompue) : on le
      // jette silencieusement plutôt que de planter au démarrage.
      debugPrint('Cache illisible pour "$cle" : $erreur');
      return null;
    }
  }
}
