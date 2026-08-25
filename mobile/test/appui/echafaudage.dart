import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lgr_parents/etat/fournisseurs.dart';
import 'package:lgr_parents/modeles/modeles.dart';
import 'package:lgr_parents/services/stockage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Échafaudage des tests d'apparence.
///
/// Fournit des jeux de données **représentatifs du terrain** — noms tchadiens,
/// montants en francs CFA, classes du secondaire tchadien — et non des
/// « Lorem ipsum » : un écran validé sur « AAA BBB » ne dit rien de ce que
/// donnera « ALLAHOUNDOUM Tidjani » dans la même largeur.

/// Charge les polices embarquées dans le moteur de test.
///
/// Sans cela, tout le texte est rendu par la police de secours du harnais —
/// des rectangles — et les captures ne valident plus rien.
Future<void> chargerPolices() async {
  TestWidgetsFlutterBinding.ensureInitialized();

  // Les tests d'apparence chargent le logo depuis les assets : sans ce
  // registre, `SvgPicture.asset` ne trouve rien et rend une zone vide.
  TestWidgetsFlutterBinding.instance.defaultBinaryMessenger.setMockMessageHandler(
    'flutter/assets',
    null,
  );

  // La police d'icônes est chargée elle aussi : sans elle, chaque icône est
  // rendue en carré vide et les captures ne montrent pas l'application réelle.
  for (final (fichier, graisse) in const [
    ('assets/polices/Inter-Regular.ttf', 'Inter'),
    ('assets/polices/Inter-Medium.ttf', 'Inter'),
    ('assets/polices/Inter-SemiBold.ttf', 'Inter'),
    ('assets/polices/Inter-Bold.ttf', 'Inter'),
    ('MaterialIcons-Regular.otf', 'MaterialIcons'),
  ]) {
    final chargeur = FontLoader(graisse)
      ..addFont(_lire(fichier).then((octets) => ByteData.view(octets.buffer)));
    await chargeur.load();
  }
}

/// Lit un fichier de police, qu'il vienne du projet ou du SDK Flutter.
Future<Uint8List> _lire(String chemin) {
  if (!chemin.startsWith('assets/')) {
    final sdk = File(
      '${Platform.environment["FLUTTER_ROOT"] ?? "C:/Users/hp/flutter"}'
      '/bin/cache/artifacts/material_fonts/$chemin',
    );
    if (sdk.existsSync()) return sdk.readAsBytes();
  }
  return File(chemin).readAsBytes();
}

/// Ouvre un stockage utilisable en test.
///
/// `shared_preferences` accepte des valeurs simulées ; `flutter_secure_storage`
/// passe par un canal de plateforme absent du harnais, on le remplace donc par
/// une carte en mémoire. Sans cela, tout écran touchant à la session lève une
/// `MissingPluginException`.
Future<Stockage> stockageDeTest() async {
  TestWidgetsFlutterBinding.ensureInitialized();
  SharedPreferences.setMockInitialValues({});

  final coffre = <String, String>{};
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
    const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
    (appel) async => switch (appel.method) {
      'read' => coffre[appel.arguments['key'] as String],
      'readAll' => coffre,
      'write' => coffre[appel.arguments['key'] as String] = appel.arguments['value'] as String,
      'delete' => coffre.remove(appel.arguments['key'] as String),
      'deleteAll' => coffre.clear(),
      'containsKey' => coffre.containsKey(appel.arguments['key'] as String),
      _ => null,
    },
  );

  return Stockage.ouvrir();
}

// ---------------------------------------------------------------------------
// Surcharges
// ---------------------------------------------------------------------------

/// Remplace les fournisseurs réseau par des valeurs figées.
///
/// On surcharge les `StreamProvider` par un flux déjà résolu : les écrans
/// passent donc directement à l'état `data`, sans squelette de chargement.
List<Override> echafaudage({
  required Stockage stockage,
  Accueil? accueil,
  ReleveComplet? releve,
  Assiduite? assiduite,
  SituationFinanciere? finances,
}) {
  final maintenant = DateTime(2026, 11, 14, 9, 30);

  return [
    stockageProvider.overrideWithValue(stockage),
    if (accueil != null)
      accueilProvider.overrideWith(
        (ref) => Stream.value(Donnees(valeur: accueil, depuisCache: false, date: maintenant)),
      ),
    if (releve != null)
      notesProvider.overrideWith(
        (ref, _) => Stream.value(Donnees(valeur: releve, depuisCache: false, date: maintenant)),
      ),
    if (assiduite != null)
      assiduiteProvider.overrideWith(
        (ref, _) => Stream.value(Donnees(valeur: assiduite, depuisCache: false, date: maintenant)),
      ),
    if (finances != null)
      financesProvider.overrideWith(
        (ref, _) => Stream.value(Donnees(valeur: finances, depuisCache: false, date: maintenant)),
      ),
  ];
}

// ---------------------------------------------------------------------------
// Jeux de données
// ---------------------------------------------------------------------------

Profil _profil() => Profil.depuisJson({
  'utilisateurId': 'u1',
  'tuteurId': 't1',
  'nom': 'TOGBE',
  'prenom': 'Abdoulaye',
  'telephone': '+23591000201',
});

Map<String, dynamic> _enfant({
  required String id,
  required String nom,
  required String prenom,
  required String classe,
  required String niveau,
  double? moyenne,
  int? rang,
  int? effectif,
  double? moyenneClasse,
  double absences = 0,
  int retards = 0,
  int reste = 0,
  String? echeance,
  String? echeanceLe,
  int? echeanceFcfa,
  String lien = 'PERE',
}) => {
  'eleveId': id,
  'matricule': 'LGR-2026-${id.padLeft(4, "0")}',
  'nom': nom,
  'prenom': prenom,
  'classe': classe,
  'niveau': niveau,
  'annee': '2026-2027',
  'lienParente': lien,
  'moyenne': moyenne,
  'rang': rang,
  'effectif': effectif,
  'moyenneClasse': moyenneClasse,
  'periodeId': 'p1',
  'periode': '1er Trimestre',
  'absencesNonJustifiees': absences,
  'retards': retards,
  'resteDuFcfa': reste,
  'prochaineEcheance': echeance,
  'prochaineEcheanceLe': echeanceLe,
  'prochaineEcheanceFcfa': echeanceFcfa,
};

List<Map<String, dynamic>> _annonces() => [
  {
    'id': 'a1',
    'titre': 'Réunion des parents d\'élèves — samedi 22 novembre',
    'contenu':
        "La réunion trimestrielle se tiendra samedi 22 novembre à 9 h dans la cour "
        "de l'établissement. La présence d'au moins un responsable par élève est "
        "vivement souhaitée : les résultats du premier trimestre y seront commentés.",
    'epinglee': true,
    'publierLe': '2026-11-12T08:00:00.000Z',
    'lue': false,
    'classe': null,
  },
  {
    'id': 'a2',
    'titre': 'Fermeture exceptionnelle le 28 novembre',
    'contenu':
        "L'établissement sera fermé le vendredi 28 novembre pour la journée "
        "pédagogique des enseignants. Les cours reprennent le lundi 1er décembre.",
    'epinglee': false,
    'publierLe': '2026-11-10T14:30:00.000Z',
    'lue': false,
    'classe': null,
  },
  {
    'id': 'a3',
    'titre': 'Composition du premier trimestre — 5ème B',
    'contenu':
        "Les compositions se dérouleront du 1er au 5 décembre. Le calendrier "
        "détaillé est affiché au tableau de la classe.",
    'epinglee': false,
    'publierLe': '2026-11-05T10:00:00.000Z',
    'lue': true,
    'classe': '5ème B',
  },
];

Accueil accueilExemple() => Accueil.depuisJson({
  'profil': _profil().versJson(),
  'enfants': [
    _enfant(
      id: '1138',
      nom: 'TOGBE',
      prenom: 'Halimé',
      classe: '5ème B',
      niveau: 'Cinquième',
      moyenne: 13.42,
      rang: 7,
      effectif: 42,
      moyenneClasse: 11.8,
      absences: 4,
      retards: 2,
      reste: 102000,
      echeance: '2ème tranche',
      echeanceLe: '2026-11-30',
      echeanceFcfa: 51000,
    ),
  ],
  'annonces': _annonces(),
});

/// Fratrie de trois enfants, dont un en difficulté et une échéance dépassée.
///
/// C'est le cas le plus dense de l'écran : sélecteur, indicateurs rouges,
/// bandeau d'alerte. S'il tient sur 390 points de large, tout tient.
Accueil accueilFratrie() => Accueil.depuisJson({
  'profil': _profil().versJson(),
  'enfants': [
    _enfant(
      id: '0412',
      nom: 'ALLAHOUNDOUM',
      prenom: 'Tidjani',
      classe: 'Terminale D',
      niveau: 'Terminale',
      moyenne: 7.85,
      rang: 38,
      effectif: 41,
      moyenneClasse: 11.2,
      absences: 12.5,
      retards: 6,
      reste: 145000,
      echeance: '1ère tranche',
      echeanceLe: '2026-10-15',
      echeanceFcfa: 60000,
      lien: 'TUTEUR',
    ),
    _enfant(
      id: '0887',
      nom: 'ALLAHOUNDOUM',
      prenom: 'Fatimé',
      classe: '3ème A',
      niveau: 'Troisième',
      moyenne: 15.60,
      rang: 2,
      effectif: 45,
      moyenneClasse: 12.4,
      lien: 'TUTEUR',
    ),
    _enfant(
      id: '1204',
      nom: 'ALLAHOUNDOUM',
      prenom: 'Moussa',
      classe: '6ème C',
      niveau: 'Sixième',
      lien: 'TUTEUR',
    ),
  ],
  'annonces': _annonces(),
});

// --- Relevés ---------------------------------------------------------------

List<Map<String, dynamic>> _periodes({bool premierPublie = true}) => [
  {
    'id': 'p1',
    'libelle': '1er Trimestre',
    'ordre': 1,
    'debut': '2026-10-01',
    'fin': '2027-01-03',
    'publie': premierPublie,
    'courante': true,
  },
  {
    'id': 'p2',
    'libelle': '2ème Trimestre',
    'ordre': 2,
    'debut': '2027-01-04',
    'fin': '2027-04-08',
    'publie': false,
    'courante': false,
  },
  {
    'id': 'p3',
    'libelle': '3ème Trimestre',
    'ordre': 3,
    'debut': '2027-04-09',
    'fin': '2027-07-15',
    'publie': false,
    'courante': false,
  },
];

Map<String, dynamic> _matiere(
  String code,
  String libelle,
  double coef,
  double? moyenne, {
  int? rang,
  double? classe,
  String? appreciation,
  String? enseignant,
  List<Map<String, dynamic>> notes = const [],
}) => {
  'matiereId': code,
  'code': code,
  'matiere': libelle,
  'coefficient': coef,
  'moyenne': moyenne,
  'moyenneClasse': classe,
  'noteMin': 3.5,
  'noteMax': 18.0,
  'rang': rang,
  'appreciation': appreciation,
  'enseignant': enseignant,
  'notes': notes,
};

ReleveComplet relevePublie() => ReleveComplet.depuisJson({
  'periodes': _periodes(),
  'releve': {
    'periodeId': 'p1',
    'periode': '1er Trimestre',
    'publie': true,
    'moyenne': 13.42,
    'rang': 7,
    'effectif': 42,
    'moyenneClasse': 11.08,
    'mention': 'ENCOURAGEMENTS',
    'appreciation':
        "Trimestre satisfaisant. Halimé participe volontiers à l'oral et rend "
        "un travail soigné. Les résultats en mathématiques doivent être "
        "consolidés avant les compositions du second trimestre.",
    'decision': null,
    'noteConduite': 16.0,
    'heuresJustifiees': 6,
    'heuresNonJustifiees': 4,
    'nbRetards': 2,
    'matieres': [
      _matiere(
        'FR',
        'Français',
        4,
        14.75,
        rang: 5,
        classe: 11.2,
        enseignant: 'Mahamat NDJIDDA',
        appreciation: 'Bonne expression écrite, des idées personnelles bien défendues.',
        notes: [
          {
            'id': 'n1',
            'titre': 'Dissertation',
            'type': 'DEVOIR',
            'date': '2026-10-18',
            'valeur': 14.0,
            'bareme': 20,
            'poids': 1,
            'statut': 'NOTEE',
          },
          {
            'id': 'n2',
            'titre': 'Composition du 1er trimestre',
            'type': 'COMPOSITION',
            'date': '2026-12-03',
            'valeur': 15.5,
            'bareme': 20,
            'poids': 2,
            'statut': 'NOTEE',
          },
        ],
      ),
      _matiere(
        'MATH',
        'Mathématiques',
        5,
        9.20,
        rang: 26,
        classe: 10.4,
        enseignant: 'Achta DJIBRINE',
        appreciation: 'Des lacunes en géométrie. Un travail régulier est indispensable.',
        notes: [
          {
            'id': 'n3',
            'titre': 'Interrogation — Thalès',
            'type': 'INTERROGATION',
            'date': '2026-10-22',
            'valeur': 7.0,
            'bareme': 20,
            'poids': 1,
            'statut': 'NOTEE',
          },
          {
            'id': 'n4',
            'titre': 'Devoir surveillé n°2',
            'type': 'DEVOIR',
            'date': '2026-11-08',
            'valeur': null,
            'bareme': 20,
            'poids': 1,
            'statut': 'ABSENT',
          },
        ],
      ),
      _matiere('PC', 'Physique-Chimie', 3, 12.50, rang: 12, classe: 10.9),
      _matiere('SVT', 'Sciences de la vie et de la Terre', 3, 15.00, rang: 3, classe: 12.1),
      _matiere('HG', 'Histoire-Géographie', 3, 13.25, rang: 9, classe: 11.5),
      _matiere('ANG', 'Anglais', 2, 16.00, rang: 2, classe: 12.8),
      _matiere('AR', 'Arabe', 2, 11.50, rang: 18, classe: 11.0),
      _matiere('EPS', 'Éducation physique et sportive', 1, 17.00, rang: 4, classe: 14.2),
    ],
  },
});

ReleveComplet releveEnAttente() => ReleveComplet.depuisJson({
  'periodes': _periodes(premierPublie: false),
  'releve': {'periodeId': 'p1', 'periode': '1er Trimestre', 'publie': false, 'matieres': []},
});

// --- Assiduité -------------------------------------------------------------

Assiduite assiduiteExemple() => Assiduite.depuisJson({
  'periodeId': 'p1',
  'periodes': _periodes(),
  'evenements': [
    {
      'id': 'e1',
      'genre': 'ABSENCE',
      'date': '2026-11-13',
      'libelle': 'Absence — journée entière',
      'detail': null,
      'statut': 'NON_JUSTIFIEE',
      'nbHeures': 6.0,
      'matiere': null,
    },
    {
      'id': 'e2',
      'genre': 'RETARD',
      'date': '2026-11-10',
      'libelle': 'Retard de 25 min',
      'detail': 'Transport',
      'statut': 'JUSTIFIEE',
      'nbHeures': null,
      'matiere': 'Mathématiques',
    },
    {
      'id': 'e3',
      'genre': 'ABSENCE',
      'date': '2026-11-04',
      'libelle': 'Absence en cours',
      'detail': 'Certificat médical remis au surveillant général',
      'statut': 'JUSTIFIEE',
      'nbHeures': 2.0,
      'matiere': 'Français',
    },
    {
      'id': 'e4',
      'genre': 'INCIDENT',
      'date': '2026-10-28',
      'libelle': 'Incident — mineure',
      'detail': 'Bavardages répétés perturbant le cours.',
      'statut': 'MINEURE',
      'nbHeures': null,
      'matiere': null,
    },
  ],
});

// --- Finances --------------------------------------------------------------

SituationFinanciere financesExemple() => SituationFinanciere.depuisJson({
  'totalDuFcfa': 170000,
  'totalPayeFcfa': 68000,
  'totalExonereFcfa': 0,
  'resteDuFcfa': 102000,
  'echeances': [
    {
      'id': 'ec1',
      'libelle': 'Frais d\'inscription',
      'nature': 'INSCRIPTION',
      'dateLimite': '2026-10-05',
      'montantDuFcfa': 17000,
      'montantPayeFcfa': 17000,
      'montantExonereFcfa': 0,
      'statut': 'SOLDEE',
    },
    {
      'id': 'ec2',
      'libelle': '1ère tranche',
      'nature': 'SCOLARITE',
      'dateLimite': '2026-10-29',
      'montantDuFcfa': 51000,
      'montantPayeFcfa': 51000,
      'montantExonereFcfa': 0,
      'statut': 'SOLDEE',
    },
    {
      'id': 'ec3',
      'libelle': '2ème tranche',
      'nature': 'SCOLARITE',
      'dateLimite': '2026-11-30',
      'montantDuFcfa': 51000,
      'montantPayeFcfa': 0,
      'montantExonereFcfa': 0,
      'statut': 'A_PAYER',
    },
    {
      'id': 'ec4',
      'libelle': '3ème tranche',
      'nature': 'SCOLARITE',
      'dateLimite': '2027-02-28',
      'montantDuFcfa': 51000,
      'montantPayeFcfa': 0,
      'montantExonereFcfa': 0,
      'statut': 'A_PAYER',
    },
  ],
  'paiements': [
    {
      'id': 'p1',
      'numeroRecu': 'REC-2026-00412',
      'montantFcfa': 51000,
      'mode': 'ESPECES',
      'datePaiement': '2026-10-27',
      'libelle': '1ère tranche',
    },
    {
      'id': 'p2',
      'numeroRecu': 'REC-2026-00108',
      'montantFcfa': 17000,
      'mode': 'MOBILE_MONEY',
      'datePaiement': '2026-10-02',
      'libelle': 'Frais d\'inscription',
    },
  ],
});

// ---------------------------------------------------------------------------
// Charges réelles
// ---------------------------------------------------------------------------

/// Réponses authentiques du serveur, figées dans `test/charges/`.
///
/// Les jeux inventés ci-dessus servent à provoquer des cas précis — fratrie,
/// impayé en retard, écran vide. Ceux-ci servent à autre chose : vérifier que
/// l'écran tient avec ce que produit vraiment l'établissement, dix matières
/// aux libellés longs et des moyennes à deux décimales.
Map<String, dynamic> _charge(String nom) =>
    jsonDecode(File('test/charges/$nom.json').readAsStringSync()) as Map<String, dynamic>;

Accueil accueilDuServeur() => Accueil.depuisJson(_charge('enfants'));

ReleveComplet releveDuServeur() => ReleveComplet.depuisJson(_charge('notes'));
