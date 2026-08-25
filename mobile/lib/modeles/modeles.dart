/// Modèles de données, calqués sur les réponses de `/api/mobile`.
///
/// Deux règles tenues partout :
///
///  1. **Aucun champ non nullable qui puisse manquer.** Une moyenne absente
///     n'est pas 0 : c'est « pas encore publiée ». Confondre les deux ferait
///     afficher 0,00/20 à un parent dont l'enfant n'a simplement pas encore
///     de bulletin.
///
///  2. **Décodage défensif.** `_reel`, `_entier` acceptent aussi bien un
///     nombre qu'une chaîne : PostgreSQL renvoie les `numeric` en texte selon
///     le pilote, et une exception de décodage viderait tout l'écran.
library;

double? _reel(Object? valeur) {
  if (valeur == null) return null;
  if (valeur is num) return valeur.toDouble();
  return double.tryParse(valeur.toString().replaceAll(',', '.'));
}

int _entier(Object? valeur, [int defaut = 0]) {
  if (valeur == null) return defaut;
  if (valeur is num) return valeur.toInt();
  return int.tryParse(valeur.toString()) ?? defaut;
}

String _texte(Object? valeur, [String defaut = '']) => valeur?.toString() ?? defaut;

// ---------------------------------------------------------------------------

class Profil {
  const Profil({
    required this.utilisateurId,
    required this.tuteurId,
    required this.nom,
    required this.prenom,
    this.telephone,
  });

  final String utilisateurId;
  final String tuteurId;
  final String nom;
  final String prenom;
  final String? telephone;

  String get nomComplet => '$prenom $nom';

  factory Profil.depuisJson(Map<String, dynamic> j) => Profil(
    utilisateurId: _texte(j['utilisateurId']),
    tuteurId: _texte(j['tuteurId']),
    nom: _texte(j['nom']),
    prenom: _texte(j['prenom']),
    telephone: j['telephone'] as String?,
  );

  Map<String, dynamic> versJson() => {
    'utilisateurId': utilisateurId,
    'tuteurId': tuteurId,
    'nom': nom,
    'prenom': prenom,
    'telephone': telephone,
  };
}

// ---------------------------------------------------------------------------

class Enfant {
  const Enfant({
    required this.eleveId,
    required this.matricule,
    required this.nom,
    required this.prenom,
    required this.classe,
    required this.niveau,
    required this.annee,
    required this.lienParente,
    this.photoId,
    this.moyenne,
    this.rang,
    this.effectif,
    this.moyenneClasse,
    this.periodeId,
    this.periode,
    this.absencesNonJustifiees = 0,
    this.retards = 0,
    this.resteDuFcfa = 0,
    this.prochaineEcheance,
    this.prochaineEcheanceLe,
    this.prochaineEcheanceFcfa,
  });

  final String eleveId;
  final String matricule;
  final String nom;
  final String prenom;
  final String classe;
  final String niveau;
  final String annee;
  final String lienParente;
  final String? photoId;

  final double? moyenne;
  final int? rang;
  final int? effectif;

  /// Moyenne de la classe sur la même période.
  ///
  /// C'est elle qui donne son sens à la note de l'enfant : « 11 » est un bon
  /// résultat dans une classe à 9 et un mauvais dans une classe à 14.
  final double? moyenneClasse;
  final String? periodeId;
  final String? periode;

  final double absencesNonJustifiees;
  final int retards;
  final int resteDuFcfa;
  final String? prochaineEcheance;
  final String? prochaineEcheanceLe;
  final int? prochaineEcheanceFcfa;

  String get nomComplet => '$prenom $nom';

  /// Le lien tel qu'on le dit : « Père de Halimé », pas « PERE ».
  String get lienLisible => switch (lienParente) {
    'PERE' => 'Père',
    'MERE' => 'Mère',
    'TUTEUR' => 'Tuteur',
    'ONCLE' => 'Oncle',
    'TANTE' => 'Tante',
    'GRAND_PARENT' => 'Grand-parent',
    'FRERE_SOEUR' => 'Frère / sœur',
    _ => 'Responsable',
  };

  factory Enfant.depuisJson(Map<String, dynamic> j) => Enfant(
    eleveId: _texte(j['eleveId']),
    matricule: _texte(j['matricule']),
    nom: _texte(j['nom']),
    prenom: _texte(j['prenom']),
    classe: _texte(j['classe']),
    niveau: _texte(j['niveau']),
    annee: _texte(j['annee']),
    lienParente: _texte(j['lienParente']),
    photoId: j['photoId'] as String?,
    moyenne: _reel(j['moyenne']),
    rang: j['rang'] == null ? null : _entier(j['rang']),
    effectif: j['effectif'] == null ? null : _entier(j['effectif']),
    moyenneClasse: _reel(j['moyenneClasse']),
    periodeId: j['periodeId'] as String?,
    periode: j['periode'] as String?,
    absencesNonJustifiees: _reel(j['absencesNonJustifiees']) ?? 0,
    retards: _entier(j['retards']),
    resteDuFcfa: _entier(j['resteDuFcfa']),
    prochaineEcheance: j['prochaineEcheance'] as String?,
    prochaineEcheanceLe: j['prochaineEcheanceLe'] as String?,
    prochaineEcheanceFcfa: j['prochaineEcheanceFcfa'] == null
        ? null
        : _entier(j['prochaineEcheanceFcfa']),
  );
}

// ---------------------------------------------------------------------------

class Periode {
  const Periode({
    required this.id,
    required this.libelle,
    required this.ordre,
    required this.debut,
    required this.fin,
    required this.publie,
    required this.courante,
  });

  final String id;
  final String libelle;
  final int ordre;
  final String debut;
  final String fin;
  final bool publie;
  final bool courante;

  factory Periode.depuisJson(Map<String, dynamic> j) => Periode(
    id: _texte(j['id']),
    libelle: _texte(j['libelle']),
    ordre: _entier(j['ordre']),
    debut: _texte(j['debut']),
    fin: _texte(j['fin']),
    publie: j['publie'] == true,
    courante: j['courante'] == true,
  );
}

class NoteEvaluation {
  const NoteEvaluation({
    required this.id,
    required this.titre,
    required this.type,
    required this.date,
    required this.bareme,
    required this.poids,
    required this.statut,
    this.valeur,
  });

  final String id;
  final String titre;
  final String type;
  final String date;
  final double bareme;
  final double poids;
  final String statut;
  final double? valeur;

  /// Note ramenée sur 20 : les barèmes varient (10, 20, 40) et les comparer
  /// bruts n'a aucun sens pour un parent.
  double? get surVingt => valeur == null || bareme <= 0 ? null : valeur! * 20 / bareme;

  String get typeLisible => switch (type) {
    'DEVOIR' => 'Devoir',
    'INTERROGATION' => 'Interrogation',
    'COMPOSITION' => 'Composition',
    'EXAMEN_BLANC' => 'Examen blanc',
    'ORAL' => 'Oral',
    'TP' => 'Travaux pratiques',
    _ => type,
  };

  factory NoteEvaluation.depuisJson(Map<String, dynamic> j) => NoteEvaluation(
    id: _texte(j['id']),
    titre: _texte(j['titre']),
    type: _texte(j['type']),
    date: _texte(j['date']),
    bareme: _reel(j['bareme']) ?? 20,
    poids: _reel(j['poids']) ?? 1,
    statut: _texte(j['statut']),
    valeur: _reel(j['valeur']),
  );
}

class MatiereReleve {
  const MatiereReleve({
    required this.matiereId,
    required this.code,
    required this.matiere,
    required this.coefficient,
    required this.notes,
    this.couleur,
    this.moyenne,
    this.moyenneClasse,
    this.noteMin,
    this.noteMax,
    this.rang,
    this.appreciation,
    this.enseignant,
  });

  final String matiereId;
  final String code;
  final String matiere;
  final double coefficient;
  final List<NoteEvaluation> notes;
  final String? couleur;
  final double? moyenne;
  final double? moyenneClasse;
  final double? noteMin;
  final double? noteMax;
  final int? rang;
  final String? appreciation;
  final String? enseignant;

  factory MatiereReleve.depuisJson(Map<String, dynamic> j) => MatiereReleve(
    matiereId: _texte(j['matiereId']),
    code: _texte(j['code']),
    matiere: _texte(j['matiere']),
    coefficient: _reel(j['coefficient']) ?? 1,
    couleur: j['couleur'] as String?,
    moyenne: _reel(j['moyenne']),
    moyenneClasse: _reel(j['moyenneClasse']),
    noteMin: _reel(j['noteMin']),
    noteMax: _reel(j['noteMax']),
    rang: j['rang'] == null ? null : _entier(j['rang']),
    appreciation: j['appreciation'] as String?,
    enseignant: j['enseignant'] as String?,
    notes: ((j['notes'] as List?) ?? const [])
        .map((n) => NoteEvaluation.depuisJson(Map<String, dynamic>.from(n as Map)))
        .toList(),
  );
}

class Releve {
  const Releve({
    required this.periodeId,
    required this.periode,
    required this.publie,
    required this.matieres,
    this.moyenne,
    this.rang,
    this.effectif,
    this.moyenneClasse,
    this.mention,
    this.appreciation,
    this.decision,
    this.noteConduite,
    this.heuresJustifiees = 0,
    this.heuresNonJustifiees = 0,
    this.nbRetards = 0,
  });

  final String periodeId;
  final String periode;
  final bool publie;
  final List<MatiereReleve> matieres;
  final double? moyenne;
  final int? rang;
  final int? effectif;

  /// Moyenne de la classe sur la même période.
  ///
  /// C'est elle qui donne son sens à la note de l'enfant : « 11 » est un bon
  /// résultat dans une classe à 9 et un mauvais dans une classe à 14.
  final double? moyenneClasse;
  final String? mention;
  final String? appreciation;
  final String? decision;
  final double? noteConduite;
  final double heuresJustifiees;
  final double heuresNonJustifiees;
  final int nbRetards;

  String? get mentionLisible => switch (mention) {
    'FELICITATIONS' => 'Félicitations',
    'ENCOURAGEMENTS' => 'Encouragements',
    'TABLEAU_HONNEUR' => "Tableau d'honneur",
    'AVERTISSEMENT_TRAVAIL' => 'Avertissement travail',
    'AVERTISSEMENT_CONDUITE' => 'Avertissement conduite',
    'BLAME' => 'Blâme',
    _ => null,
  };

  factory Releve.depuisJson(Map<String, dynamic> j) => Releve(
    periodeId: _texte(j['periodeId']),
    periode: _texte(j['periode']),
    publie: j['publie'] == true,
    moyenne: _reel(j['moyenne']),
    rang: j['rang'] == null ? null : _entier(j['rang']),
    effectif: j['effectif'] == null ? null : _entier(j['effectif']),
    moyenneClasse: _reel(j['moyenneClasse']),
    mention: j['mention'] as String?,
    appreciation: j['appreciation'] as String?,
    decision: j['decision'] as String?,
    noteConduite: _reel(j['noteConduite']),
    heuresJustifiees: _reel(j['heuresJustifiees']) ?? 0,
    heuresNonJustifiees: _reel(j['heuresNonJustifiees']) ?? 0,
    nbRetards: _entier(j['nbRetards']),
    matieres: ((j['matieres'] as List?) ?? const [])
        .map((m) => MatiereReleve.depuisJson(Map<String, dynamic>.from(m as Map)))
        .toList(),
  );
}

// ---------------------------------------------------------------------------

enum GenreEvenement { absence, retard, sanction, incident }

class EvenementAssiduite {
  const EvenementAssiduite({
    required this.id,
    required this.genre,
    required this.date,
    required this.libelle,
    this.detail,
    this.statut,
    this.nbHeures,
    this.matiere,
  });

  final String id;
  final GenreEvenement genre;
  final String date;
  final String libelle;
  final String? detail;
  final String? statut;
  final double? nbHeures;
  final String? matiere;

  bool get justifie => statut == 'JUSTIFIEE';

  factory EvenementAssiduite.depuisJson(Map<String, dynamic> j) => EvenementAssiduite(
    id: _texte(j['id']),
    genre: switch (_texte(j['genre'])) {
      'ABSENCE' => GenreEvenement.absence,
      'RETARD' => GenreEvenement.retard,
      'SANCTION' => GenreEvenement.sanction,
      _ => GenreEvenement.incident,
    },
    date: _texte(j['date']),
    libelle: _texte(j['libelle']),
    detail: j['detail'] as String?,
    statut: j['statut'] as String?,
    nbHeures: _reel(j['nbHeures']),
    matiere: j['matiere'] as String?,
  );
}

// ---------------------------------------------------------------------------

class Echeance {
  const Echeance({
    required this.id,
    required this.libelle,
    required this.nature,
    required this.dateLimite,
    required this.montantDuFcfa,
    required this.montantPayeFcfa,
    required this.montantExonereFcfa,
    required this.statut,
  });

  final String id;
  final String libelle;
  final String nature;
  final String dateLimite;
  final int montantDuFcfa;
  final int montantPayeFcfa;
  final int montantExonereFcfa;
  final String statut;

  int get resteFcfa => montantDuFcfa - montantPayeFcfa - montantExonereFcfa;
  bool get soldee => resteFcfa <= 0;

  factory Echeance.depuisJson(Map<String, dynamic> j) => Echeance(
    id: _texte(j['id']),
    libelle: _texte(j['libelle']),
    nature: _texte(j['nature']),
    dateLimite: _texte(j['dateLimite']),
    montantDuFcfa: _entier(j['montantDuFcfa']),
    montantPayeFcfa: _entier(j['montantPayeFcfa']),
    montantExonereFcfa: _entier(j['montantExonereFcfa']),
    statut: _texte(j['statut']),
  );
}

class Paiement {
  const Paiement({
    required this.id,
    required this.numeroRecu,
    required this.montantFcfa,
    required this.mode,
    required this.datePaiement,
    this.libelle,
  });

  final String id;
  final String numeroRecu;
  final int montantFcfa;
  final String mode;
  final String datePaiement;
  final String? libelle;

  String get modeLisible => switch (mode) {
    'ESPECES' => 'Espèces',
    'VIREMENT' => 'Virement',
    'CHEQUE' => 'Chèque',
    'MOBILE_MONEY' => 'Mobile Money',
    _ => mode,
  };

  factory Paiement.depuisJson(Map<String, dynamic> j) => Paiement(
    id: _texte(j['id']),
    numeroRecu: _texte(j['numeroRecu']),
    montantFcfa: _entier(j['montantFcfa']),
    mode: _texte(j['mode']),
    datePaiement: _texte(j['datePaiement']),
    libelle: j['libelle'] as String?,
  );
}

class SituationFinanciere {
  const SituationFinanciere({
    required this.totalDuFcfa,
    required this.totalPayeFcfa,
    required this.totalExonereFcfa,
    required this.resteDuFcfa,
    required this.echeances,
    required this.paiements,
  });

  final int totalDuFcfa;
  final int totalPayeFcfa;
  final int totalExonereFcfa;
  final int resteDuFcfa;
  final List<Echeance> echeances;
  final List<Paiement> paiements;

  double get progression => totalDuFcfa <= 0 ? 1 : (totalPayeFcfa + totalExonereFcfa) / totalDuFcfa;

  factory SituationFinanciere.depuisJson(Map<String, dynamic> j) => SituationFinanciere(
    totalDuFcfa: _entier(j['totalDuFcfa']),
    totalPayeFcfa: _entier(j['totalPayeFcfa']),
    totalExonereFcfa: _entier(j['totalExonereFcfa']),
    resteDuFcfa: _entier(j['resteDuFcfa']),
    echeances: ((j['echeances'] as List?) ?? const [])
        .map((e) => Echeance.depuisJson(Map<String, dynamic>.from(e as Map)))
        .toList(),
    paiements: ((j['paiements'] as List?) ?? const [])
        .map((p) => Paiement.depuisJson(Map<String, dynamic>.from(p as Map)))
        .toList(),
  );
}

// ---------------------------------------------------------------------------

class Annonce {
  const Annonce({
    required this.id,
    required this.titre,
    required this.contenu,
    required this.epinglee,
    required this.publierLe,
    required this.lue,
    this.classe,
  });

  final String id;
  final String titre;
  final String contenu;
  final bool epinglee;
  final String publierLe;
  final bool lue;
  final String? classe;

  Annonce copieLue() => Annonce(
    id: id,
    titre: titre,
    contenu: contenu,
    epinglee: epinglee,
    publierLe: publierLe,
    lue: true,
    classe: classe,
  );

  factory Annonce.depuisJson(Map<String, dynamic> j) => Annonce(
    id: _texte(j['id']),
    titre: _texte(j['titre']),
    contenu: _texte(j['contenu']),
    epinglee: j['epinglee'] == true,
    publierLe: _texte(j['publierLe']),
    lue: j['lue'] == true,
    classe: j['classe'] as String?,
  );
}

// ---------------------------------------------------------------------------

class Cours {
  const Cours({
    required this.jour,
    required this.debut,
    required this.fin,
    required this.matiere,
    required this.code,
    this.couleur,
    this.enseignant,
    this.salle,
  });

  /// 1 = lundi … 7 = dimanche, convention ISO comme en base.
  final int jour;
  final String debut;
  final String fin;
  final String matiere;
  final String code;
  final String? couleur;
  final String? enseignant;
  final String? salle;

  /// « 07:30:00 » → « 07:30 ». Les secondes n'apportent rien à un parent.
  String get debutCourt => debut.length >= 5 ? debut.substring(0, 5) : debut;
  String get finCourte => fin.length >= 5 ? fin.substring(0, 5) : fin;

  factory Cours.depuisJson(Map<String, dynamic> j) => Cours(
    jour: _entier(j['jour'], 1),
    debut: _texte(j['debut']),
    fin: _texte(j['fin']),
    matiere: _texte(j['matiere']),
    code: _texte(j['code']),
    couleur: j['couleur'] as String?,
    enseignant: j['enseignant'] as String?,
    salle: j['salle'] as String?,
  );
}

// ---------------------------------------------------------------------------

/// Charge de l'écran d'accueil : tout ce que renvoie `/api/mobile/enfants`.
class Accueil {
  const Accueil({required this.profil, required this.enfants, required this.annonces});

  final Profil profil;
  final List<Enfant> enfants;
  final List<Annonce> annonces;

  factory Accueil.depuisJson(Map<String, dynamic> j) => Accueil(
    profil: Profil.depuisJson(Map<String, dynamic>.from(j['profil'] as Map)),
    enfants: ((j['enfants'] as List?) ?? const [])
        .map((e) => Enfant.depuisJson(Map<String, dynamic>.from(e as Map)))
        .toList(),
    annonces: ((j['annonces'] as List?) ?? const [])
        .map((a) => Annonce.depuisJson(Map<String, dynamic>.from(a as Map)))
        .toList(),
  );
}

// ---------------------------------------------------------------------------

/// Bulletin publié d'un enfant.
///
/// N'existe côté application que si l'établissement l'a PUBLIÉ : un bulletin en
/// brouillon porte des moyennes et un rang qui peuvent encore changer, et
/// l'API ne le liste pas. L'application n'a donc pas à filtrer — mais elle ne
/// doit pas non plus supposer qu'un bulletin absent signifie « pas de notes ».
class Bulletin {
  const Bulletin({
    required this.periodeId,
    required this.periode,
    required this.url,
    this.moyenne,
    this.rang,
    this.effectif,
    this.mention,
    this.appreciation,
    this.publieLe,
  });

  final String periodeId;
  final String periode;

  /// Chemin fourni par le SERVEUR, jamais composé par l'application : le jour
  /// où il change, un APK déjà installé continuerait d'appeler l'ancien.
  final String url;

  final double? moyenne;
  final int? rang;
  final int? effectif;

  final String? mention;
  final String? appreciation;
  final String? publieLe;

  factory Bulletin.depuisJson(Map<String, dynamic> json) => Bulletin(
    periodeId: json['periodeId'] as String,
    periode: json['periode'] as String,
    url: json['url'] as String,
    moyenne: (json['moyenne'] as num?)?.toDouble(),
    rang: json['rang'] as int?,
    effectif: json['effectif'] as int?,
    mention: json['mention'] as String?,
    appreciation: json['appreciation'] as String?,
    publieLe: json['publieLe'] as String?,
  );
}
