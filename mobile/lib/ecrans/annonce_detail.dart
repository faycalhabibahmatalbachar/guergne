import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../design/composants.dart';
import '../design/couleurs.dart';
import '../design/theme.dart';
import '../etat/fournisseurs.dart';
import '../modeles/modeles.dart';
import '../outils/formats.dart';

/// Ouvre une annonce et transmet l'accusé de lecture.
///
/// Une feuille modale plutôt qu'un écran : le parent revient d'un geste vers
/// le bas, sans traverser la pile de navigation. Le corps complet est affiché
/// ici — c'est le seul endroit où il l'est.
Future<void> ouvrirAnnonce(BuildContext context, WidgetRef ref, Annonce annonce) async {
  if (!annonce.lue) {
    // Sans `await` : l'accusé part en arrière-plan pour que l'annonce
    // s'ouvre instantanément, y compris sur un réseau capricieux.
    unawaited(ref.read(marquerLueProvider)(annonce.id));
  }

  if (!context.mounted) return;

  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: Theme.of(context).colorScheme.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
    ),
    builder: (context) => _FeuilleAnnonce(annonce: annonce),
  );
}

class _FeuilleAnnonce extends StatelessWidget {
  const _FeuilleAnnonce({required this.annonce});

  final Annonce annonce;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      maxChildSize: 0.92,
      minChildSize: 0.4,
      builder: (context, controleur) => SingleChildScrollView(
        controller: controleur,
        padding: const EdgeInsets.fromLTRB(24, 4, 24, 40),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (annonce.epinglee) ...[
                  const Icon(Icons.push_pin_rounded, size: 16, color: Couleurs.accent),
                  const SizedBox(width: 8),
                ],
                Text(
                  dateRelative(annonce.publierLe),
                  style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
                ),
                const Spacer(),
                if (annonce.classe != null) BadgeEtat(annonce.classe!, ton: TonBadge.info),
              ],
            ),
            const SizedBox(height: 14),
            Text(annonce.titre, style: theme.textTheme.headlineSmall),
            const SizedBox(height: 16),
            Text(annonce.contenu, style: theme.textTheme.bodyLarge?.copyWith(height: 1.6)),
            const SizedBox(height: 28),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: theme.scaffoldBackgroundColor,
                borderRadius: BorderRadius.circular(ThemeLgr.rayonPetit),
              ),
              child: Row(
                children: [
                  Icon(Icons.done_all_rounded, size: 17, color: context.etat(Couleurs.succes)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      "L'école est informée que vous avez lu cette annonce.",
                      style: theme.textTheme.bodySmall,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
