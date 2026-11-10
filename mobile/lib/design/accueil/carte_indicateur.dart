import 'package:flutter/material.dart';

import '../composants.dart';
import '../couleurs.dart';
import '../theme.dart';

/// Gravité d'un indicateur, indépendante de sa couleur.
///
/// POURQUOI UN TYPE PLUTÔT QU'UNE COULEUR
/// ---------------------------------------
/// L'application se consulte EN PLEIN SOLEIL, sur des écrans d'entrée de gamme.
/// La teinte d'un chiffre rouge s'y perd bien avant sa position : à midi, un
/// « 7,85 » rouge et un « 15 » vert se ressemblent. Une bande de trois pixels
/// sur le bord de la carte, elle, tient — c'est une forme, pas une nuance.
///
/// Aucune information de l'accueil ne repose donc sur la seule couleur : la
/// gravité se lit à la bande, la valeur au chiffre, le sens au libellé.
enum Severite { neutre, bon, attention, grave }

/// Carte d'indicateur du tableau de bord : un chiffre, un libellé, un détail.
///
/// Un seul chiffre par carte (voir `docs/08-DESIGN-MOBILE.md`, §1) : deux
/// chiffres dans la même carte obligent le parent à choisir lequel lire.
///
/// Le chiffre ne se coupe JAMAIS : il rétrécit (`FittedBox`) plutôt que de
/// finir en ellipse. « 145 000… » sur l'écran de l'argent serait pire qu'un
/// chiffre un peu plus petit.
class CarteIndicateur extends StatelessWidget {
  const CarteIndicateur({
    super.key,
    required this.libelle,
    required this.valeur,
    required this.detail,
    required this.couleur,
    required this.icone,
    required this.teinteIcone,
    this.suffixe,
    this.severite = Severite.neutre,
    this.mise = false,
    this.surAppui,
    this.index = 0,
  });

  final String libelle;
  final String valeur;
  final String? suffixe;
  final String detail;

  /// Couleur du CHIFFRE : elle porte un sens (voir `Couleurs.moyenne`).
  final Color couleur;
  final IconData icone;

  /// Teinte d'identité de la pastille d'icône. Décorative, elle aide l'œil à
  /// retrouver la même carte d'une visite à l'autre — elle ne dit rien de la
  /// situation, c'est le rôle de [couleur] et de [severite].
  final Color teinteIcone;
  final Severite severite;

  /// Met la carte en avant sans l'alarmer : fond très légèrement doré.
  /// Réservé au reste à payer, information importante mais pas anxiogène.
  final bool mise;
  final VoidCallback? surAppui;

  /// Rang dans la cascade d'apparition.
  final int index;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sombre = theme.brightness == Brightness.dark;
    final rayon = BorderRadius.circular(18);
    final bande = switch (severite) {
      Severite.grave => context.etat(Couleurs.danger),
      Severite.attention => context.etat(Couleurs.alerte),
      Severite.bon => context.etat(Couleurs.primaire),
      Severite.neutre => Colors.transparent,
    };
    final fondCarte = mise && !sombre
        ? Color.alphaBlend(Couleurs.or.withValues(alpha: 0.07), theme.colorScheme.surface)
        : theme.colorScheme.surface;
    final teinte = context.etat(teinteIcone);

    return ApparitionCascade(
      index: index,
      decalage: 45,
      enfant: Semantics(
        button: surAppui != null,
        label: '$libelle : $valeur${suffixe ?? ""}. $detail',
        excludeSemantics: true,
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: rayon,
            // Ombre TRÈS légère, doublée d'un filet : l'ombre seule
            // disparaît en plein soleil, le filet tient toujours.
            boxShadow: sombre
                ? null
                : [
                    BoxShadow(
                      color: Couleurs.encre.withValues(alpha: 0.05),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
          ),
          child: Material(
            color: fondCarte,
            shape: RoundedRectangleBorder(
              borderRadius: rayon,
              side: BorderSide(
                color: mise && !sombre
                    ? Couleurs.or.withValues(alpha: 0.35)
                    : theme.colorScheme.outline,
              ),
            ),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: surAppui,
              child: Stack(
                children: [
                  Positioned(left: 0, top: 0, bottom: 0, width: 3, child: ColoredBox(color: bande)),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(15, 14, 12, 14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 36,
                              height: 36,
                              decoration: BoxDecoration(
                                color: teinte.withValues(alpha: sombre ? 0.2 : 0.11),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Icon(icone, size: 19, color: teinte),
                            ),
                            const Spacer(),
                            if (surAppui != null)
                              Icon(
                                Icons.chevron_right_rounded,
                                size: 18,
                                color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6),
                              ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: Alignment.centerLeft,
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.baseline,
                            textBaseline: TextBaseline.alphabetic,
                            children: [
                              Text(valeur, style: ThemeLgr.chiffre(couleur: couleur, taille: 27)),
                              if (suffixe != null)
                                Padding(
                                  padding: const EdgeInsets.only(left: 2),
                                  child: Text(
                                    suffixe!,
                                    style: ThemeLgr.inter(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                      color: couleur.withValues(alpha: 0.7),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          libelle,
                          style: theme.textTheme.titleSmall?.copyWith(fontSize: 13),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          detail,
                          style: theme.textTheme.bodySmall?.copyWith(fontSize: 11.5),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
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

/// Grille des indicateurs : deux colonnes sur téléphone, quatre sur tablette.
///
/// Quatre colonnes sur un téléphone de 360 dp laisseraient 70 dp par carte :
/// « 145 000 F » n'y tient qu'en rétrécissant jusqu'à l'illisible. La grille
/// s'adapte à la largeur RÉELLE, pas à un type d'appareil supposé.
class GrilleIndicateurs extends StatelessWidget {
  const GrilleIndicateurs({super.key, required this.cartes});

  final List<Widget> cartes;

  @override
  Widget build(BuildContext context) {
    const ecart = 12.0;
    return LayoutBuilder(
      builder: (context, contraintes) {
        final colonnes = contraintes.maxWidth >= 600 ? 4 : 2;
        final lignes = <Widget>[];
        for (var i = 0; i < cartes.length; i += colonnes) {
          final ligne = cartes.skip(i).take(colonnes).toList();
          if (lignes.isNotEmpty) lignes.add(const SizedBox(height: ecart));
          lignes.add(
            // `IntrinsicHeight` aligne les cartes d'une même ligne sur la plus
            // haute : sans lui, un détail sur deux lignes en grandes polices
            // donnerait deux cartes voisines de hauteurs différentes.
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (var j = 0; j < colonnes; j++) ...[
                    if (j > 0) const SizedBox(width: ecart),
                    Expanded(child: j < ligne.length ? ligne[j] : const SizedBox()),
                  ],
                ],
              ),
            ),
          );
        }
        return Column(mainAxisSize: MainAxisSize.min, children: lignes);
      },
    );
  }
}
