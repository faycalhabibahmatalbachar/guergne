import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../design/composants.dart';
import '../design/couleurs.dart';
import '../design/squelettes.dart';
import '../design/theme.dart';
import '../etat/fournisseurs.dart';
import '../modeles/modeles.dart';
import '../outils/formats.dart';
import 'annonce_detail.dart';

/// Écran des annonces de l'école.
///
/// Les épinglées remontent en tête et le restent : ce sont celles que l'école
/// veut voir lues — fermeture exceptionnelle, réunion de parents. Les non lues
/// se distinguent par la graisse ET par une pastille, jamais par la couleur
/// seule.
class EcranAnnonces extends ConsumerWidget {
  const EcranAnnonces({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accueil = ref.watch(accueilProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Annonces')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(accueilProvider),
        child: accueil.when(
          loading: () => const SqueletteListe(nombre: 5),
          error: (erreur, _) => _Erreur(
            message: erreur.toString(),
            surReessayer: () => ref.invalidate(accueilProvider),
          ),
          data: (donnees) => _Liste(donnees: donnees),
        ),
      ),
    );
  }
}

class _Liste extends StatelessWidget {
  const _Liste({required this.donnees});

  final Donnees<Accueil> donnees;

  @override
  Widget build(BuildContext context) {
    final annonces = donnees.valeur.annonces;

    if (annonces.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          if (donnees.depuisCache) BandeauHorsLigne(derniereMaj: donnees.date),
          SizedBox(
            height: MediaQuery.sizeOf(context).height * 0.7,
            child: const EtatVide(
              icone: Icons.campaign_outlined,
              titre: 'Aucune annonce',
              explication:
                  "L'école n'a publié aucune information pour le moment. "
                  'Vous serez prévenu dès qu\'une annonce paraîtra.',
            ),
          ),
        ],
      );
    }

    final nonLues = annonces.where((a) => !a.lue).length;

    return ListView.builder(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.only(bottom: 24),
      itemCount: annonces.length + (donnees.depuisCache ? 2 : 1),
      itemBuilder: (context, i) {
        if (donnees.depuisCache && i == 0) {
          return BandeauHorsLigne(derniereMaj: donnees.date);
        }
        final decalage = donnees.depuisCache ? 1 : 0;

        if (i == decalage) {
          return Padding(
            padding: const EdgeInsets.fromLTRB(
              ThemeLgr.espace,
              ThemeLgr.espace,
              ThemeLgr.espace,
              6,
            ),
            child: Text(
              nonLues == 0
                  ? '${annonces.length} annonce${annonces.length > 1 ? "s" : ""} · tout est lu'
                  : '$nonLues non lue${nonLues > 1 ? "s" : ""} sur ${annonces.length}',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
            ),
          );
        }

        final index = i - decalage - 1;
        return Padding(
          padding: const EdgeInsets.fromLTRB(ThemeLgr.espace, 0, ThemeLgr.espace, 10),
          child: ApparitionCascade(
            index: index,
            enfant: _Carte(annonce: annonces[index]),
          ),
        );
      },
    );
  }
}

class _Carte extends ConsumerWidget {
  const _Carte({required this.annonce});

  final Annonce annonce;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final a = annonce;

    return CarteLgr(
      surAppui: () => ouvrirAnnonce(context, ref, a),
      // L'annonce épinglée porte une bordure ocre : reconnaissable au premier
      // coup d'œil sans que le fond ne crie.
      bordure: a.epinglee ? Couleurs.accent.withValues(alpha: 0.4) : null,
      enfant: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (a.epinglee) ...[
                const Icon(Icons.push_pin_rounded, size: 15, color: Couleurs.accent),
                const SizedBox(width: 7),
              ],
              if (!a.lue) ...[
                Container(
                  width: 7,
                  height: 7,
                  decoration: BoxDecoration(
                    color: context.etat(Couleurs.primaire),
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 8),
              ],
              Expanded(
                child: Text(
                  a.titre,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: a.lue ? FontWeight.w500 : FontWeight.w700,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 7),
          Text(
            a.contenu,
            style: theme.textTheme.bodySmall?.copyWith(height: 1.5),
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 11),
          Row(
            children: [
              Text(
                dateRelative(a.publierLe),
                style: theme.textTheme.bodySmall?.copyWith(fontSize: 11),
              ),
              const Spacer(),
              if (a.classe != null) BadgeEtat(a.classe!, ton: TonBadge.info),
              const SizedBox(width: 8),
              Text(
                'Lire',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: context.etat(Couleurs.primaire),
                  fontWeight: FontWeight.w600,
                ),
              ),
              Icon(Icons.chevron_right_rounded, size: 16, color: context.etat(Couleurs.primaire)),
            ],
          ),
        ],
      ),
    );
  }
}

class _Erreur extends StatelessWidget {
  const _Erreur({required this.message, required this.surReessayer});

  final String message;
  final VoidCallback surReessayer;

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.7,
          child: EtatVide(
            icone: Icons.cloud_off_rounded,
            titre: 'Annonces indisponibles',
            explication: message,
            action: FilledButton.icon(
              onPressed: surReessayer,
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: const Text('Réessayer'),
            ),
          ),
        ),
      ],
    );
  }
}
