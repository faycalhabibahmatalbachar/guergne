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
class PastilleMoyenne extends StatelessWidget {
  const PastilleMoyenne(this.note, {super.key, this.taille = 56, this.surVingt = true});

  final double? note;
  final double taille;
  final bool surVingt;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final couleur = context.moyenne(note);

    return Container(
      width: taille,
      height: taille,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: couleur.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(taille * 0.32),
        border: Border.all(color: couleur.withValues(alpha: 0.32), width: 1.5),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            note == null ? '—' : note!.toStringAsFixed(2).replaceAll('.', ','),
            style: ThemeLgr.nombre(theme.textTheme.titleMedium).copyWith(
              color: couleur,
              fontWeight: FontWeight.w700,
              fontSize: taille * 0.28,
              height: 1.0,
            ),
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
class AvatarEleve extends StatelessWidget {
  const AvatarEleve({
    super.key,
    required this.nom,
    required this.prenom,
    this.urlPhoto,
    this.taille = 48,
  });

  final String nom;
  final String prenom;
  final String? urlPhoto;
  final double taille;

  static const _palette = [
    Color(0xFF1E429F),
    Color(0xFF7C3AED),
    Color(0xFF0891B2),
    Color(0xFF16A34A),
    Color(0xFFC98A3C),
    Color(0xFFBE123C),
  ];

  @override
  Widget build(BuildContext context) {
    final initiales = '${prenom.isNotEmpty ? prenom[0] : ''}${nom.isNotEmpty ? nom[0] : ''}'
        .toUpperCase();
    final couleur = _palette['$prenom$nom'.hashCode.abs() % _palette.length];

    return Container(
      width: taille,
      height: taille,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: couleur.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(taille * 0.34),
        border: Border.all(color: couleur.withValues(alpha: 0.28), width: 1.5),
      ),
      alignment: Alignment.center,
      child: urlPhoto == null
          ? Text(
              initiales,
              style: TextStyle(
                fontSize: taille * 0.36,
                fontWeight: FontWeight.w700,
                color: couleur,
              ),
            )
          : Image.network(
              urlPhoto!,
              fit: BoxFit.cover,
              width: taille,
              height: taille,
              // Une photo qui ne charge pas ne doit jamais laisser un carré
              // vide : on retombe sur les initiales.
              errorBuilder: (_, _, _) => Text(
                initiales,
                style: TextStyle(
                  fontSize: taille * 0.36,
                  fontWeight: FontWeight.w700,
                  color: couleur,
                ),
              ),
            ),
    );
  }
}
