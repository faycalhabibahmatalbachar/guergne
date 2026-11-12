import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../modeles/modeles.dart';
import '../../outils/formats.dart';
import '../couleurs.dart';
import '../theme.dart';

/// Feuille claire de l'accueil : accès rapide, dernières annonces, fraîcheur
/// des données. Elle remonte sur le fond vert par ses deux coins arrondis.

/// Décoration commune des cartes de la feuille.
///
/// Une ombre très légère en clair, un filet en sombre : sur l'ardoise une
/// ombre ne se voit pas, et la carte se fondrait dans le fond.
BoxDecoration _carte(
  BuildContext context, {
  double rayon = 20,
  Color? couleur,
}) {
  final theme = Theme.of(context);
  final sombre = theme.brightness == Brightness.dark;

  return BoxDecoration(
    color: couleur ?? theme.colorScheme.surface,
    borderRadius: BorderRadius.circular(rayon),
    border: sombre ? Border.all(color: theme.colorScheme.outline) : null,
    boxShadow: sombre
        ? null
        : [
            BoxShadow(
              color: Couleurs.encre.withValues(alpha: 0.06),
              blurRadius: 14,
              offset: const Offset(0, 4),
            ),
          ],
  );
}

/// Coiffe de la feuille : la bande arrondie qui mord sur le fond vert.
class CoiffeFeuille extends StatelessWidget {
  const CoiffeFeuille({super.key});

  static const hauteur = 26.0;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: hauteur,
      decoration: BoxDecoration(
        color: Theme.of(context).scaffoldBackgroundColor,
        borderRadius: const BorderRadius.vertical(
          top: Radius.circular(hauteur),
        ),
      ),
    );
  }
}

/// Titre de section : barre verte, intitulé, action à droite.
class TitreFeuille extends StatelessWidget {
  const TitreFeuille({
    super.key,
    required this.titre,
    this.action,
    this.surAction,
  });

  final String titre;
  final String? action;
  final VoidCallback? surAction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final vert = context.etat(Couleurs.primaire);

    return Row(
      children: [
        Container(
          width: 4,
          height: 22,
          decoration: BoxDecoration(
            color: vert,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Semantics(
            header: true,
            // Réduit plutôt que coupé : « Dernièr… » ne dit plus rien.
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                titre,
                maxLines: 1,
                style: theme.textTheme.titleLarge?.copyWith(
                  fontSize: 19,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.3,
                ),
              ),
            ),
          ),
        ),
        if (action != null && surAction != null)
          InkWell(
            onTap: surAction,
            borderRadius: BorderRadius.circular(10),
            child: ConstrainedBox(
              // Cible tactile de 44 px, même si le texte est court.
              constraints: const BoxConstraints(minHeight: 44),
              child: Padding(
                padding: const EdgeInsets.only(left: 8),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      action!,
                      style: ThemeLgr.inter(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w600,
                        color: vert,
                      ),
                    ),
                    Icon(Icons.chevron_right_rounded, size: 22, color: vert),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Une tuile d'accès rapide.
class TuileAcces {
  const TuileAcces({
    required this.libelle,
    required this.icone,
    required this.fond,
    required this.trait,
    required this.surAppui,
    this.badge = 0,
  });

  final String libelle;
  final IconData icone;

  /// Couleur de la pastille, et celle de l'icône posée dessus.
  final Color fond;
  final Color trait;
  final VoidCallback surAppui;
  final int badge;
}

/// Les quatre tuiles d'accès rapide, sur une ligne.
class TuilesAcces extends StatelessWidget {
  const TuilesAcces({super.key, required this.tuiles});

  final List<TuileAcces> tuiles;

  @override
  Widget build(BuildContext context) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final (i, tuile) in tuiles.indexed) ...[
            if (i > 0) const SizedBox(width: 10),
            Expanded(child: _Tuile(tuile: tuile)),
          ],
        ],
      ),
    );
  }
}

class _Tuile extends StatelessWidget {
  const _Tuile({required this.tuile});

  final TuileAcces tuile;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    Widget pastille = Container(
      width: 50,
      height: 50,
      decoration: BoxDecoration(color: tuile.fond, shape: BoxShape.circle),
      child: Icon(tuile.icone, size: 26, color: tuile.trait),
    );
    if (tuile.badge > 0) {
      pastille = Badge.count(
        count: tuile.badge,
        backgroundColor: Couleurs.danger,
        child: pastille,
      );
    }

    return Semantics(
      button: true,
      label: tuile.badge > 0
          ? '${tuile.libelle}, ${tuile.badge} non lue${tuile.badge > 1 ? "s" : ""}'
          : tuile.libelle,
      excludeSemantics: true,
      child: DecoratedBox(
        decoration: _carte(context, rayon: 18),
        child: Material(
          type: MaterialType.transparency,
          borderRadius: BorderRadius.circular(18),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: tuile.surAppui,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(4, 14, 4, 12),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  pastille,
                  const SizedBox(height: 10),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      tuile.libelle,
                      maxLines: 1,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Carte « Dernières annonces » : son titre, et les plus récentes.
class CarteAnnonces extends StatelessWidget {
  const CarteAnnonces({
    super.key,
    required this.annonces,
    required this.surVoirToutes,
    required this.surLire,
  });

  /// Les annonces à montrer, déjà limitées par l'appelant.
  final List<Annonce> annonces;
  final VoidCallback surVoirToutes;
  final ValueChanged<Annonce> surLire;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return DecoratedBox(
      decoration: _carte(context),
      child: Material(
        type: MaterialType.transparency,
        borderRadius: BorderRadius.circular(20),
        clipBehavior: Clip.antiAlias,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 8, 10, 4),
              child: TitreFeuille(
                titre: 'Dernières annonces',
                action: annonces.isEmpty ? null : 'Voir toutes',
                surAction: surVoirToutes,
              ),
            ),
            if (annonces.isEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
                child: Row(
                  children: [
                    Icon(
                      Icons.campaign_outlined,
                      size: 20,
                      color: theme.textTheme.bodySmall?.color,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'Aucune annonce pour le moment.',
                        style: theme.textTheme.bodySmall,
                      ),
                    ),
                  ],
                ),
              )
            else
              for (final (i, annonce) in annonces.indexed) ...[
                if (i > 0)
                  Divider(
                    height: 1,
                    indent: 74,
                    endIndent: 16,
                    color: theme.dividerColor,
                  ),
                _LigneAnnonce(
                  annonce: annonce,
                  surAppui: () => surLire(annonce),
                ),
              ],
            const SizedBox(height: 6),
          ],
        ),
      ),
    );
  }
}

class _LigneAnnonce extends StatelessWidget {
  const _LigneAnnonce({required this.annonce, required this.surAppui});

  final Annonce annonce;
  final VoidCallback surAppui;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // Épinglée : c'est celle que l'école veut voir lue, elle prend le vert.
    final teinte = context.etat(
      annonce.epinglee ? Couleurs.primaire : Couleurs.info,
    );

    return InkWell(
      onTap: surAppui,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
        child: Row(
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: teinte.withValues(alpha: 0.13),
                shape: BoxShape.circle,
              ),
              child: Icon(
                annonce.epinglee ? Icons.campaign_rounded : Icons.info_rounded,
                size: 24,
                color: teinte,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Non lue : en gras. Lue : la graisse retombe — jamais la
                  // couleur seule pour porter l'information.
                  Text(
                    annonce.titre,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontSize: 15,
                      fontWeight: annonce.lue
                          ? FontWeight.w500
                          : FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Icon(
                        Icons.calendar_month_outlined,
                        size: 15,
                        color: theme.textTheme.bodySmall?.color,
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          [
                            dateRelative(annonce.publierLe),
                            ?annonce.classe,
                          ].join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodySmall?.copyWith(
                            fontSize: 13,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Icon(
              Icons.chevron_right_rounded,
              color: theme.textTheme.bodySmall?.color,
            ),
          ],
        ),
      ),
    );
  }
}

/// Bandeau de fraîcheur : les données viennent du serveur, et de quand.
///
/// Pendant du `BandeauHorsLigne` : celui-là prévient que l'écran date, celui-ci
/// confirme qu'il est à jour. Le parent n'a plus à se le demander.
class BandeauAJour extends StatelessWidget {
  const BandeauAJour({
    super.key,
    required this.date,
    required this.surRafraichir,
  });

  final DateTime date;
  final VoidCallback surRafraichir;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sombre = theme.brightness == Brightness.dark;
    final vert = context.etat(Couleurs.primaire);

    final jour = maintenant();
    final memeJour =
        date.year == jour.year &&
        date.month == jour.month &&
        date.day == jour.day;
    final quand = memeJour
        ? "aujourd'hui à ${DateFormat('HH:mm').format(date)}"
        : DateFormat("d MMM 'à' HH:mm", 'fr_FR').format(date);

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 6, 4, 6),
      decoration: BoxDecoration(
        color: vert.withValues(alpha: sombre ? 0.16 : 0.10),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          Icon(Icons.check_circle_rounded, color: vert, size: 30),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Tout est à jour !',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: vert,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Dernière mise à jour : $quand',
                  style: theme.textTheme.bodySmall?.copyWith(fontSize: 12.5),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: surRafraichir,
            tooltip: 'Actualiser',
            style: IconButton.styleFrom(minimumSize: const Size(48, 48)),
            icon: Icon(Icons.refresh_rounded, color: vert, size: 26),
          ),
        ],
      ),
    );
  }
}
