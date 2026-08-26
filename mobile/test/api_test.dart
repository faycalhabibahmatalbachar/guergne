import 'package:flutter_test/flutter_test.dart';
import 'package:lgr_parents/services/api.dart';

import 'appui/echafaudage.dart';

/// Adresses construites à la main.
///
/// POURQUOI CE TEST EXISTE
/// ------------------------
/// La photo d'un élève est chargée par `Image.network`, pas par le client Dio :
/// il faut donc lui donner l'adresse ENTIÈRE, préfixe compris. La première
/// version l'omettait — `baseUrl` ne vaut que le domaine, chaque appel Dio
/// écrivant son `/api/mobile` lui-même — et pointait donc sur une adresse
/// inexistante.
///
/// L'échec était invisible : `Image.network` retombe sur les initiales quand
/// il échoue, exactement comme lorsqu'il n'y a pas de photo. Rien à l'écran ne
/// distinguait « cet élève n'a pas de photo » de « l'application demande une
/// page qui n'existe pas ». Les 548 photos de la base sont restées cachées
/// jusqu'à ce qu'on aille lire l'URL à la main.
void main() {
  test('l’adresse de la photo porte le préfixe /api/mobile', () async {
    final api = ApiEcole(
      stockage: await stockageDeTest(),
      base: 'https://exemple.test',
    );

    final url = api.urlPhotoEnfant('11111111-2222-3333-4444-555555555555');

    expect(
      url,
      'https://exemple.test/api/mobile/enfants/'
      '11111111-2222-3333-4444-555555555555/photo',
    );
  });
}
