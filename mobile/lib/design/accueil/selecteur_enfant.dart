import 'package:flutter/material.dart';

import '../../modeles/modeles.dart';
import '../composants.dart';
import '../couleurs.dart';
import '../theme.dart';

/// Résout l'adresse de la photo d'un enfant, ou `null` s'il n'en a pas.
typedef PhotoEnfant = String? Function(Enfant enfant);

/// Carte « Mes enfants » : l'enfant affiché, et la porte vers les autres.
///
/// Elle ne remplace pas la bannière, elle la complète : la bannière dit QUI
/// on regarde, cette carte dit qu'on peut en changer — et combien d'enfants
/// sont rattachés au compte, ce qu'un parent de trois enfants veut vérifier
/// d'un coup d'œil.
class SelecteurEnfant extends StatelessWidget {
  const SelecteurEnfant({
    super.key,
    required this.enfants,
    required this.courant,
    required this.surAppui,
    this.photo,
    this.entetesPhoto,
  });

  final List<Enfant> enfants;
  final Enfant courant;
  final VoidCallback surAppui;
  final PhotoEnfant? photo;
  final Map<String, String>? entetesPhoto;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final vert = context.etat(Couleurs.primaire);
    final autres = enfants.where((e) => e.eleveId != courant.eleveId).toList();

    return Semantics(
      button: true,
      label:
          'Enfant affiché : ${courant.nomComplet}, ${courant.classe}. '
          '${enfants.length > 1 ? "Appuyer pour changer d'enfant." : "Appuyer pour voir le détail."}',
      excludeSemantics: true,
      child: Material(
        color: theme.colorScheme.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: BorderSide(color: vert.withValues(alpha: 0.22)),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: surAppui,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 12, 14),
            child: Row(
              children: [
                // Liseré vert autour de l'avatar : c'est l'enfant ACTIF.
                Container(
                  padding: const EdgeInsets.all(2.5),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(color: vert, width: 2),
                  ),
                  child: AvatarEleve(
                    nom: courant.nom,
                    prenom: courant.prenom,
                    taille: 52,
                    urlPhoto: photo?.call(courant),
                    entetesPhoto: entetesPhoto,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        courant.nomComplet,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontSize: 15.5,
                          fontWeight: FontWeight.w700,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 3),
                      Text(
                        '${courant.classe}  ·  ${courant.matricule}',
                        style: theme.textTheme.bodySmall?.copyWith(fontSize: 12.5),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (autres.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        _AutresEnfants(autres: autres, photo: photo, entetesPhoto: entetesPhoto),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: vert.withValues(alpha: 0.09),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(Icons.chevron_right_rounded, color: vert, size: 22),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Petits avatars des frères et sœurs, et leur nombre.
class _AutresEnfants extends StatelessWidget {
  const _AutresEnfants({required this.autres, this.photo, this.entetesPhoto});

  final List<Enfant> autres;
  final PhotoEnfant? photo;
  final Map<String, String>? entetesPhoto;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final visibles = autres.take(3).toList();

    return Row(
      children: [
        SizedBox(
          width: 22.0 + (visibles.length - 1) * 16,
          height: 22,
          child: Stack(
            children: [
              for (var i = 0; i < visibles.length; i++)
                Positioned(
                  left: i * 16.0,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surface,
                      borderRadius: BorderRadius.circular(9),
                      border: Border.all(color: theme.colorScheme.surface, width: 1.5),
                    ),
                    child: AvatarEleve(
                      nom: visibles[i].nom,
                      prenom: visibles[i].prenom,
                      taille: 20,
                      urlPhoto: photo?.call(visibles[i]),
                      entetesPhoto: entetesPhoto,
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            autres.length == 1 ? 'et ${autres.first.prenom}' : '+ ${autres.length} autres enfants',
            style: theme.textTheme.bodySmall?.copyWith(fontSize: 11.5, fontWeight: FontWeight.w500),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

/// Feuille de choix de l'enfant.
///
/// Une feuille plutôt que les pastilles horizontales de l'ancienne bannière :
/// au-delà de deux enfants, les pastilles débordaient de l'écran et le
/// troisième n'était visible qu'en faisant défiler — ce que personne ne
/// devinait. Ici chaque enfant a sa ligne entière, avec sa classe.
Future<void> choisirEnfant(
  BuildContext context, {
  required List<Enfant> enfants,
  required Enfant courant,
  required ValueChanged<Enfant> surChoix,
  PhotoEnfant? photo,
  Map<String, String>? entetesPhoto,
  VoidCallback? versCompte,
}) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    backgroundColor: Theme.of(context).colorScheme.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
    ),
    builder: (context) {
      final theme = Theme.of(context);
      final vert = context.etat(Couleurs.primaire);

      return SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.75),
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.fromLTRB(ThemeLgr.espace, 0, ThemeLgr.espace, 12),
            children: [
              Text('Mes enfants', style: theme.textTheme.titleLarge),
              const SizedBox(height: 4),
              Text(
                enfants.length > 1
                    ? "Choisissez l'enfant dont vous voulez suivre la situation."
                    : 'Enfant rattaché à votre compte.',
                style: theme.textTheme.bodyMedium,
              ),
              const SizedBox(height: 16),
              for (final enfant in enfants) ...[
                _LigneChoix(
                  enfant: enfant,
                  actif: enfant.eleveId == courant.eleveId,
                  urlPhoto: photo?.call(enfant),
                  entetesPhoto: entetesPhoto,
                  surAppui: () {
                    Navigator.of(context).pop();
                    surChoix(enfant);
                  },
                ),
                const SizedBox(height: 10),
              ],
              if (versCompte != null)
                TextButton.icon(
                  onPressed: () {
                    Navigator.of(context).pop();
                    versCompte();
                  },
                  style: TextButton.styleFrom(foregroundColor: vert),
                  icon: const Icon(Icons.manage_accounts_outlined, size: 20),
                  label: const Text('Gérer mon compte'),
                ),
            ],
          ),
        ),
      );
    },
  );
}

class _LigneChoix extends StatelessWidget {
  const _LigneChoix({
    required this.enfant,
    required this.actif,
    required this.surAppui,
    this.urlPhoto,
    this.entetesPhoto,
  });

  final Enfant enfant;
  final bool actif;
  final VoidCallback surAppui;
  final String? urlPhoto;
  final Map<String, String>? entetesPhoto;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final vert = context.etat(Couleurs.primaire);

    return Semantics(
      selected: actif,
      child: CarteLgr(
        surAppui: surAppui,
        bordure: actif ? vert : null,
        couleurFond: actif ? vert.withValues(alpha: 0.06) : null,
        rembourrage: const EdgeInsets.all(12),
        enfant: Row(
          children: [
            AvatarEleve(
              nom: enfant.nom,
              prenom: enfant.prenom,
              taille: 46,
              urlPhoto: urlPhoto,
              entetesPhoto: entetesPhoto,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    enfant.nomComplet,
                    style: theme.textTheme.titleSmall,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${enfant.classe}  ·  ${enfant.matricule}',
                    style: theme.textTheme.bodySmall,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            // La coche, pas seulement la bordure : une affirmation lisible
            // au soleil comme par un parent daltonien.
            if (actif)
              Icon(Icons.check_circle_rounded, color: vert, size: 22)
            else
              Icon(
                Icons.radio_button_unchecked_rounded,
                color: theme.colorScheme.outline,
                size: 22,
              ),
          ],
        ),
      ),
    );
  }
}
