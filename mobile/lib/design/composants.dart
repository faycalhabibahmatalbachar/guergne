import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../outils/formats.dart';
import 'couleurs.dart';
import 'theme.dart';

/// Composants partagés de l'application.
///
/// Ils portent la signature visuelle : c'est ici que se joue la différence
/// entre une application qui ressemble à une démonstration Flutter et une
/// application qu'un parent a envie d'ouvrir.

// ---------------------------------------------------------------------------
// Carte
// ---------------------------------------------------------------------------

/// Carte de base : fond, bordure fine, rayon généreux.
///
/// Pas d'ombre portée : sur un écran d'entrée de gamme au soleil, une ombre
/// ne se voit pas et coûte du temps de rendu. Une bordure d'un pixel délimite
/// mieux et ne coûte rien.
class CarteLgr extends StatelessWidget {
  const CarteLgr({
    super.key,
    required this.enfant,
    this.rembourrage = const EdgeInsets.all(ThemeLgr.espace),
    this.surAppui,
    this.couleurFond,
    this.bordure,
  });

  final Widget enfant;
  final EdgeInsets rembourrage;
  final VoidCallback? surAppui;
  final Color? couleurFond;
  final Color? bordure;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final contenu = Container(
      padding: rembourrage,
      decoration: BoxDecoration(
        color: couleurFond ?? theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(ThemeLgr.rayon),
        border: Border.all(color: bordure ?? theme.colorScheme.outline),
      ),
      child: enfant,
    );

    if (surAppui == null) return contenu;

    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(ThemeLgr.rayon),
      child: InkWell(
        onTap: surAppui,
        borderRadius: BorderRadius.circular(ThemeLgr.rayon),
        child: contenu,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Badge d'état
// ---------------------------------------------------------------------------

enum TonBadge { succes, alerte, danger, info, neutre }

/// Badge d'état.
///
/// Il affiche TOUJOURS son libellé, jamais une pastille de couleur seule :
/// environ un homme sur douze distingue mal le rouge du vert, et un parent
/// daltonien doit lire « Non justifiée » aussi clairement que les autres.
class BadgeEtat extends StatelessWidget {
  const BadgeEtat(this.libelle, {super.key, this.ton = TonBadge.neutre, this.icone});

  final String libelle;
  final TonBadge ton;
  final IconData? icone;

  @override
  Widget build(BuildContext context) {
    final sombre = Theme.of(context).brightness == Brightness.dark;

    final (Color texte, Color fond) = switch (ton) {
      TonBadge.succes => (context.etat(Couleurs.succes), Couleurs.succesFond),
      TonBadge.alerte => (context.etat(Couleurs.alerte), Couleurs.alerteFond),
      TonBadge.danger => (context.etat(Couleurs.danger), Couleurs.dangerFond),
      TonBadge.info => (context.etat(Couleurs.info), Couleurs.infoFond),
      TonBadge.neutre => (Couleurs.encreDouce, Couleurs.bordure),
    };

    // En mode sombre les fonds pastel deviennent illisibles : on les remplace
    // par une teinte translucide du texte.
    final couleurFond = sombre ? texte.withValues(alpha: 0.18) : fond;
    final couleurTexte = sombre ? Color.lerp(texte, Colors.white, 0.45)! : texte;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: couleurFond, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icone != null) ...[
            Icon(icone, size: 13, color: couleurTexte),
            const SizedBox(width: 5),
          ],
          Text(
            libelle,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: couleurTexte,
              height: 1.1,
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Pastille de moyenne
// ---------------------------------------------------------------------------

/// Note sur 20, en évidence.
///
/// C'est l'information que le parent cherche en premier : elle doit se lire
/// sans effort, d'où la taille, les chiffres tabulaires et la couleur adossée
/// aux seuils du conseil de classe.
///
/// LA PASTILLE GRANDIT AVEC LE TEXTE
///
/// Le carré était naguère de taille fixe pendant que son contenu suivait le
/// réglage de police du téléphone. Résultat : sur un téléphone en « grandes
/// polices » — réglage courant chez des parents d'élèves de lycée — le
/// « /20 » débordait et Flutter barrait la note d'un bandeau rayé.
///
/// Deux issues étaient possibles : figer le texte, ou faire grandir le carré.
/// Figer le texte revenait à rendre illisible précisément le nombre que le
/// parent a ouvert l'application pour lire ; c'est le carré qui cède.
///
/// L'agrandissement est plafonné à 1,5 : au-delà, la pastille chasserait le
/// nom de la matière hors de l'écran. Le texte est plafonné au même facteur,
/// jamais à un autre — deux plafonds différents feraient revenir le
/// débordement pour les réglages intermédiaires.
class PastilleMoyenne extends StatelessWidget {
  const PastilleMoyenne(this.note, {super.key, this.taille = 56, this.surVingt = true});

  final double? note;
  final double taille;
  final bool surVingt;

  /// Au-delà, la pastille prendrait toute la largeur de la ligne.
  static const facteurMaximal = 1.5;

  @override
  Widget build(BuildContext context) {
    final couleur = context.moyenne(note);

    final facteur = MediaQuery.textScalerOf(context).scale(1).clamp(1.0, facteurMaximal);
    final cote = taille * facteur;

    return Container(
      width: cote,
      height: cote,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: couleur.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(cote * 0.32),
        border: Border.all(color: couleur.withValues(alpha: 0.32), width: 1.5),
      ),
      child: MediaQuery.withClampedTextScaling(
        maxScaleFactor: facteurMaximal,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              note == null ? '—' : note!.toStringAsFixed(2).replaceAll('.', ','),
              // Même style de chiffre que l'accueil : la moyenne y est déjà
              // lue, et deux dessins différents pour le même nombre feraient
              // douter qu'il s'agisse de la même donnée.
              style: ThemeLgr.chiffre(couleur: couleur, taille: taille * 0.28),
            ),
            if (surVingt && note != null)
              Text(
                '/20',
                style: TextStyle(
                  fontSize: taille * 0.16,
                  color: couleur.withValues(alpha: 0.7),
                  fontWeight: FontWeight.w600,
                  height: 1.3,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Indicateur de fraîcheur
// ---------------------------------------------------------------------------

/// Bandeau « données hors ligne ».
///
/// Sur un réseau tchadien, l'application affichera souvent des données
/// mises en cache. Le parent doit savoir s'il lit l'information d'aujourd'hui
/// ou celle de mardi dernier — sans quoi il pourrait croire son enfant présent
/// alors que l'absence n'a simplement pas été synchronisée.
class BandeauHorsLigne extends StatelessWidget {
  const BandeauHorsLigne({super.key, required this.derniereMaj});

  final DateTime derniereMaj;

  @override
  Widget build(BuildContext context) {
    final ecart = maintenant().difference(derniereMaj);

    final quand = switch (ecart) {
      final e when e.inMinutes < 2 => "à l'instant",
      final e when e.inMinutes < 60 => 'il y a ${e.inMinutes} min',
      final e when e.inHours < 24 => 'il y a ${e.inHours} h',
      final e when e.inDays == 1 => 'hier',
      final e => 'il y a ${e.inDays} jours',
    };

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
      color: Couleurs.alerteFond,
      child: Row(
        children: [
          Icon(Icons.cloud_off_rounded, size: 16, color: context.etat(Couleurs.alerte)),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              'Hors ligne — données mises à jour $quand',
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: context.etat(Couleurs.alerte),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Apparition en cascade
// ---------------------------------------------------------------------------

/// Fait apparaître un élément avec un léger décalage vertical.
///
/// L'entrée en cascade donne une impression de vitesse : le premier élément
/// est visible avant que les suivants n'arrivent, et l'œil suit le mouvement
/// au lieu d'attendre un écran complet.
class ApparitionCascade extends StatelessWidget {
  const ApparitionCascade({
    super.key,
    required this.index,
    required this.enfant,
    this.decalage = 60,
  });

  final int index;
  final Widget enfant;
  final int decalage;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      // Le décalage est plafonné : au-delà de dix éléments, attendre une
      // seconde pour voir le bas de la liste serait une régression, pas un
      // raffinement.
      duration: ThemeLgr.dureeMoyenne + Duration(milliseconds: math.min(index, 10) * decalage),
      curve: ThemeLgr.ressortDoux,
      builder: (context, valeur, enfantConstruit) => Opacity(
        opacity: valeur.clamp(0.0, 1.0),
        child: Transform.translate(offset: Offset(0, 18 * (1 - valeur)), child: enfantConstruit),
      ),
      child: enfant,
    );
  }
}

// ---------------------------------------------------------------------------
// État vide
// ---------------------------------------------------------------------------

/// Écran vide expliqué.
///
/// Un écran blanc est indiscernable d'une panne. On dit toujours POURQUOI
/// c'est vide — sinon le premier réflexe du parent est d'appeler l'école.
class EtatVide extends StatelessWidget {
  const EtatVide({
    super.key,
    required this.icone,
    required this.titre,
    required this.explication,
    this.action,
  });

  final IconData icone;
  final String titre;
  final String explication;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 76,
              height: 76,
              decoration: BoxDecoration(
                color: theme.colorScheme.primary.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(26),
              ),
              child: Icon(icone, size: 34, color: theme.colorScheme.primary),
            ),
            const SizedBox(height: 20),
            Text(titre, style: theme.textTheme.titleMedium, textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(explication, style: theme.textTheme.bodyMedium, textAlign: TextAlign.center),
            if (action != null) ...[const SizedBox(height: 20), action!],
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

/// Avatar d'élève : photo si elle existe, initiales sinon.
///
/// Les initiales prennent une couleur dérivée du nom, stable d'un écran à
/// l'autre : un parent reconnaît son enfant à la couleur avant même de lire.
///
/// DEUX RÈGLES, TOUTES DEUX APPRISES À LEURS DÉPENS
///
/// 1. **Aucune couleur d'état dans la palette.** Le vert veut dire « présent,
///    payé, admis » et le rouge « absent, impayé, en échec » — partout ailleurs
///    dans l'application. Un avatar vert pour Fatimé et rouge pour Moussa
///    laisse entendre quelque chose sur les deux enfants, et ce quelque chose
///    est faux. La palette se limite donc aux teintes d'identité : les bleus de
///    l'établissement, l'ocre sahélien, et deux nuances froides qui ne portent
///    aucun sens ailleurs.
///
/// 2. **Une empreinte explicite, pas `hashCode`.** `String.hashCode` n'est
///    stable ni entre deux versions de Dart, ni entre Dart et TypeScript. Le
///    jour où le portail web affichera les mêmes avatars, il faudra que Fatimé
///    ait la même couleur des deux côtés — sans quoi le repère visuel devient
///    un piège. L'empreinte ci-dessous tient en trois lignes et ne changera
///    jamais.
class AvatarEleve extends StatelessWidget {
  const AvatarEleve({
    super.key,
    required this.nom,
    required this.prenom,
    this.urlPhoto,
    this.entetesPhoto,
    this.taille = 48,
    this.surFondColore = false,
  });

  final String nom;
  final String prenom;
  final String? urlPhoto;

  /// En-têtes envoyés avec la photo.
  ///
  /// La route qui sert les photos exige un jeton : c'est la photo d'un enfant,
  /// pas une image publique. Sans cet en-tête, la requête revient en 401 et le
  /// composant retombe sur les initiales — silencieusement, ce qui est la
  /// bonne façon d'échouer ici mais rend le défaut introuvable.
  final Map<String, String>? entetesPhoto;
  final double taille;

  /// Posé sur l'en-tête bleu plutôt que sur une surface claire.
  ///
  /// La teinte d'identité est appliquée à 14 % d'opacité : sur du blanc elle
  /// donne un pastel lisible, mais sur le bleu de l'en-tête un bleu profond
  /// devient invisible — l'avatar disparaît purement et simplement, et c'est
  /// arrivé. Sur fond coloré on renonce donc à la couleur d'identité au profit
  /// du blanc : le nom de l'enfant est juste à côté, l'avatar n'a plus à le
  /// distinguer d'un frère ou d'une sœur, il doit seulement se voir.
  final bool surFondColore;

  /// Teintes d'identité. Ni vert ni rouge : voir la note de classe.
  ///
  /// Toutes tiennent le contraste AA sur leur propre fond à 14 % d'opacité,
  /// en thème clair comme en thème sombre — vérifié plutôt que supposé, les
  /// initiales étant du texte de petite taille.
  static const _palette = [
    Color(0xFF1E429F), // bleu institutionnel
    Color(0xFF3B63C4), // bleu clair
    Color(0xFF15306F), // bleu profond
    Color(0xFFC98A3C), // ocre sahélien
    Color(0xFF0E7490), // sarcelle sombre
    Color(0xFF5B4B8A), // indigo sourd
    Color(0xFF334155), // ardoise
    Color(0xFF8A5A2B), // brun sahélien
  ];

  /// Empreinte stable d'une chaîne, indépendante de la plateforme.
  ///
  /// FNV-1a 32 bits, borné à 31 bits pour rester dans l'entier sûr de
  /// JavaScript : le portail web pourra recalculer exactement la même valeur.
  static int empreinte(String valeur) {
    var h = 0x811c9dc5;
    for (final unite in valeur.codeUnits) {
      h ^= unite;
      h = (h * 0x01000193) & 0x7fffffff;
    }
    return h;
  }

  @override
  Widget build(BuildContext context) {
    final initiales = '${prenom.isNotEmpty ? prenom[0] : ''}${nom.isNotEmpty ? nom[0] : ''}'
        .toUpperCase();
    final identite = _palette[empreinte('$prenom$nom') % _palette.length];
    final couleur = surFondColore ? Colors.white : identite;

    return Container(
      width: taille,
      height: taille,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: couleur.withValues(alpha: surFondColore ? 0.22 : 0.14),
        borderRadius: BorderRadius.circular(taille * 0.34),
        border: Border.all(
          color: couleur.withValues(alpha: surFondColore ? 0.55 : 0.28),
          width: 1.5,
        ),
      ),
      alignment: Alignment.center,
      child: urlPhoto == null
          ? _initiales(initiales, couleur, taille)
          : Image.network(
              urlPhoto!,
              headers: entetesPhoto,
              fit: BoxFit.cover,
              width: taille,
              height: taille,
              // Pendant le chargement, les initiales restent affichées plutôt
              // qu'un carré vide ou un tourniquet : sur un réseau lent, une
              // dizaine d'avatars en attente donnerait un écran clignotant.
              frameBuilder: (_, enfant, image, _) =>
                  image == null ? _initiales(initiales, couleur, taille) : enfant,
              // Une photo qui ne charge pas ne doit jamais laisser un carré
              // vide : on retombe sur les initiales.
              errorBuilder: (_, _, _) => _initiales(initiales, couleur, taille),
            ),
    );
  }

  static Widget _initiales(String texte, Color couleur, double taille) => Text(
    texte,
    style: TextStyle(
      fontSize: taille * 0.36,
      fontWeight: FontWeight.w700,
      color: couleur,
    ),
  );
}

// ---------------------------------------------------------------------------
// Comparaison à la classe
// ---------------------------------------------------------------------------

/// Situe une note dans l'échelle de sa classe.
///
/// Un parent ne sait pas quoi penser de « 11,20 sur 20 ». Il le sait
/// immédiatement s'il voit que la classe est à 9,50 et que le meilleur est à
/// 16. C'est cette mise en perspective, et non la note seule, qui répond à la
/// question qu'il se pose : « est-ce que ça va ? »
///
/// L'échelle est celle des notes RÉELLES de la classe, pas 0–20 : sur une
/// classe où personne ne dépasse 14, écraser l'échelle jusqu'à 20 donnerait
/// l'impression que tout le monde est mauvais.
class ReglageClasse extends StatelessWidget {
  const ReglageClasse({
    super.key,
    required this.eleve,
    required this.classe,
    required this.mini,
    required this.maxi,
    required this.couleur,
    this.compacte = false,
  });

  final double eleve;
  final double? classe;
  final double? mini;
  final double? maxi;
  final Color couleur;

  /// Version réduite : la règle seule, sans sa légende chiffrée.
  ///
  /// Sur la carte fermée d'une matière, les bornes et la moyenne de classe
  /// figurent déjà en toutes lettres sous le nom de la matière. Les répéter
  /// sous la règle doublerait la hauteur de chaque ligne pour ne rien
  /// ajouter — et dix matières deviendraient trois écrans de défilement.
  final bool compacte;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final bas = mini ?? 0;
    final haut = maxi ?? 20;
    // Une classe entièrement à égalité donnerait une étendue nulle et une
    // division par zéro ; on garde alors une échelle minimale d'un point.
    final etendue = (haut - bas).abs() < 1 ? 1.0 : haut - bas;

    double position(double note) => ((note - bas) / etendue).clamp(0.0, 1.0);

    return LayoutBuilder(
      builder: (context, contraintes) {
        final largeur = contraintes.maxWidth;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              height: 18,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  // Étendue de la classe.
                  Positioned(
                    top: 7,
                    left: 0,
                    right: 0,
                    child: Container(
                      height: 4,
                      decoration: BoxDecoration(
                        color: theme.colorScheme.outline,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),

                  // Moyenne de la classe : le repère par rapport auquel se
                  // juge la note de l'élève.
                  if (classe != null)
                    Positioned(
                      top: 3,
                      left: (position(classe!) * largeur - 1).clamp(0.0, largeur - 2),
                      child: Container(
                        width: 2,
                        height: 12,
                        decoration: BoxDecoration(
                          color: Couleurs.encreLegere,
                          borderRadius: BorderRadius.circular(1),
                        ),
                      ),
                    ),

                  // L'élève.
                  Positioned(
                    top: 2,
                    left: (position(eleve) * largeur - 7).clamp(0.0, largeur - 14),
                    child: Container(
                      width: 14,
                      height: 14,
                      decoration: BoxDecoration(
                        color: couleur,
                        shape: BoxShape.circle,
                        border: Border.all(color: theme.colorScheme.surface, width: 2),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            if (!compacte) ...[
              const SizedBox(height: 5),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  _Borne(valeur: bas, libelle: 'plus faible'),
                  if (classe != null)
                    Text(
                      'classe ${classe!.toStringAsFixed(2).replaceAll(".", ",")}',
                      style: theme.textTheme.bodySmall?.copyWith(fontSize: 10.5),
                    ),
                  _Borne(valeur: haut, libelle: 'meilleur', aDroite: true),
                ],
              ),
            ],
          ],
        );
      },
    );
  }
}

class _Borne extends StatelessWidget {
  const _Borne({required this.valeur, required this.libelle, this.aDroite = false});

  final double valeur;
  final String libelle;
  final bool aDroite;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: aDroite ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        Text(
          valeur.toStringAsFixed(1).replaceAll('.', ','),
          style: ThemeLgr.nombre(
            theme.textTheme.bodySmall,
          ).copyWith(fontSize: 10.5, fontWeight: FontWeight.w600),
        ),
        Text(libelle, style: theme.textTheme.bodySmall?.copyWith(fontSize: 9.5)),
      ],
    );
  }
}
