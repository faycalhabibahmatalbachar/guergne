import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:open_filex/open_filex.dart';

import '../design/composants.dart';
import '../design/couleurs.dart';
import '../design/squelettes.dart';
import '../design/theme.dart';
import '../etat/fournisseurs.dart';
import '../modeles/modeles.dart';
import '../services/api.dart';

/// Bulletins de l'enfant, consultables et téléchargeables.
///
/// CE QUI APPARAÎT ICI EST DÉFINITIF
/// ----------------------------------
/// L'API ne liste que les bulletins PUBLIÉS par l'établissement. Un bulletin en
/// brouillon existe — il porte des moyennes et un rang — mais le conseil ne
/// s'est pas prononcé et une note peut encore bouger. Le montrer reviendrait à
/// annoncer un rang qui changera, et c'est exactement ce qui détruit la
/// confiance dans une application scolaire.
///
/// Le PDF téléchargé est le MÊME document que celui remis au guichet : même
/// en-tête, même signature, même mention légale. Un parent doit pouvoir
/// l'imprimer et le présenter.
class EcranBulletins extends ConsumerStatefulWidget {
  const EcranBulletins({super.key});

  @override
  ConsumerState<EcranBulletins> createState() => _EcranBulletinsState();
}

class _EcranBulletinsState extends ConsumerState<EcranBulletins> {
  /// Période en cours de téléchargement, pour n'animer qu'une seule ligne.
  String? _enCours;

  Future<void> _telecharger(Bulletin bulletin, Enfant enfant) async {
    setState(() => _enCours = bulletin.periodeId);

    final messager = ScaffoldMessenger.of(context);
    try {
      final nom =
          'bulletin-${enfant.matricule}-${bulletin.periode.replaceAll(RegExp(r'[^A-Za-z0-9]'), '-')}.pdf';

      final chemin = await ref.read(apiProvider).telechargerBulletin(bulletin.url, nom);

      // On ouvre immédiatement : un parent qui appuie sur « Télécharger »
      // veut LIRE le bulletin, pas savoir qu'un fichier existe quelque part.
      final resultat = await OpenFilex.open(chemin);

      if (!mounted) return;
      if (resultat.type != ResultType.done) {
        messager.showSnackBar(
          SnackBar(
            content: const Text(
              "Bulletin enregistré, mais aucune application ne peut ouvrir les PDF sur ce téléphone.",
            ),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } on ErreurApi catch (erreur) {
      if (!mounted) return;
      messager.showSnackBar(
        SnackBar(content: Text(erreur.message), behavior: SnackBarBehavior.floating),
      );
    } catch (erreur) {
      if (!mounted) return;
      messager.showSnackBar(
        const SnackBar(
          content: Text('Téléchargement impossible. Vérifiez votre connexion.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } finally {
      if (mounted) setState(() => _enCours = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final enfant = ref.watch(enfantCourantProvider);

    if (enfant == null) {
      return const Scaffold(
        body: EtatVide(
          icone: Icons.description_outlined,
          titre: 'Aucun élève',
          explication: "Aucun enfant n'est rattaché à votre compte.",
        ),
      );
    }

    final bulletins = ref.watch(bulletinsProvider(enfant.eleveId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Bulletins'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(30),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(ThemeLgr.espace, 0, ThemeLgr.espace, 10),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                '${enfant.nomComplet} · ${enfant.classe}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          ),
        ),
      ),
      body: bulletins.when(
        loading: () => const SqueletteListe(),
        error: (erreur, _) => EtatVide(
          icone: Icons.cloud_off_outlined,
          titre: 'Chargement impossible',
          explication: erreur.toString(),
        ),
        data: (donnees) {
          final liste = donnees.valeur;

          if (liste.isEmpty) {
            return const EtatVide(
              icone: Icons.description_outlined,
              titre: 'Aucun bulletin publié',
              explication:
                  "Les bulletins apparaissent ici dès que le conseil de classe les a validés. "
                  "Avant cela, les moyennes peuvent encore changer.",
            );
          }

          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(bulletinsProvider(enfant.eleveId)),
            child: ListView.separated(
              padding: const EdgeInsets.all(ThemeLgr.espace),
              itemCount: liste.length,
              separatorBuilder: (_, _) => const SizedBox(height: ThemeLgr.espace),
              itemBuilder: (context, index) => _Carte(
                bulletin: liste[index],
                enTelechargement: _enCours == liste[index].periodeId,
                onTelecharger: () => _telecharger(liste[index], enfant),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _Carte extends StatelessWidget {
  const _Carte({
    required this.bulletin,
    required this.enTelechargement,
    required this.onTelecharger,
  });

  final Bulletin bulletin;
  final bool enTelechargement;
  final VoidCallback onTelecharger;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return CarteLgr(
      enfant: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  bulletin.periode,
                  style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
                ),
              ),
              if (bulletin.mention != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: Couleurs.primaire.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    bulletin.mention!,
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: Couleurs.primaire,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
            ],
          ),

          const SizedBox(height: 14),

          // Les trois chiffres qu'un parent cherche en premier.
          Row(
            children: [
              _Chiffre(
                libelle: 'Moyenne',
                valeur: bulletin.moyenne == null
                    ? '—'
                    : bulletin.moyenne!.toStringAsFixed(2).replaceAll('.', ','),
                accent: true,
              ),
              _Chiffre(
                libelle: 'Rang',
                valeur: bulletin.rang == null
                    ? '—'
                    : '${bulletin.rang}${bulletin.effectif == null ? "" : " / ${bulletin.effectif}"}',
              ),
            ],
          ),

          if (bulletin.appreciation != null && bulletin.appreciation!.isNotEmpty) ...[
            const SizedBox(height: 14),
            Text(
              'Appréciation du conseil',
              style: theme.textTheme.labelSmall?.copyWith(color: theme.hintColor),
            ),
            const SizedBox(height: 4),
            Text(bulletin.appreciation!, style: theme.textTheme.bodyMedium),
          ],

          const SizedBox(height: 16),

          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: enTelechargement ? null : onTelecharger,
              icon: enTelechargement
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.download_outlined, size: 18),
              label: Text(enTelechargement ? 'Téléchargement…' : 'Télécharger le bulletin'),
            ),
          ),
        ],
      ),
    );
  }
}

class _Chiffre extends StatelessWidget {
  const _Chiffre({required this.libelle, required this.valeur, this.accent = false});

  final String libelle;
  final String valeur;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(libelle, style: theme.textTheme.labelSmall?.copyWith(color: theme.hintColor)),
          const SizedBox(height: 2),
          Text(
            valeur,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w700,
              color: accent ? Couleurs.primaire : null,
            ),
          ),
        ],
      ),
    );
  }
}
