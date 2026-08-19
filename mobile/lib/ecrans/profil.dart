import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../design/composants.dart';
import '../design/couleurs.dart';
import '../design/theme.dart';
import '../etat/fournisseurs.dart';
import '../modeles/modeles.dart';
import 'emploi_du_temps.dart';

/// Écran du compte.
///
/// Il porte aussi la liste des enfants et l'accès à l'emploi du temps : ce
/// sont des consultations occasionnelles, qui n'ont pas à occuper un onglet
/// permanent de la barre inférieure.
class EcranProfil extends ConsumerWidget {
  const EcranProfil({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final session = ref.watch(sessionProvider);
    final accueil = ref.watch(accueilProvider).value;
    final profil = session.profil;

    return Scaffold(
      appBar: AppBar(title: const Text('Mon compte')),
      body: ListView(
        padding: const EdgeInsets.all(ThemeLgr.espace),
        children: [
          if (profil != null) _Identite(profil: profil),
          const SizedBox(height: 22),

          if (accueil != null && accueil.valeur.enfants.isNotEmpty) ...[
            Text('Mes enfants', style: theme.textTheme.titleMedium),
            const SizedBox(height: 12),
            ...accueil.valeur.enfants.map(
              (e) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _LigneEnfant(enfant: e),
              ),
            ),
            const SizedBox(height: 22),
          ],

          Text('Consulter', style: theme.textTheme.titleMedium),
          const SizedBox(height: 12),
          _Entree(
            icone: Icons.calendar_view_week_rounded,
            titre: 'Emploi du temps',
            sousTitre: 'Semaine de la classe',
            surAppui: () => Navigator.of(
              context,
            ).push(MaterialPageRoute(builder: (_) => const EcranEmploiDuTemps())),
          ),
          const SizedBox(height: 22),

          Text('Application', style: theme.textTheme.titleMedium),
          const SizedBox(height: 12),
          _Entree(
            icone: Icons.help_outline_rounded,
            titre: 'Aide',
            sousTitre: 'Questions fréquentes',
            surAppui: () => _afficherAide(context),
          ),
          const SizedBox(height: 10),
          _Entree(
            icone: Icons.logout_rounded,
            titre: 'Se déconnecter',
            sousTitre: 'Un nouveau code sera nécessaire',
            couleur: context.etat(Couleurs.danger),
            surAppui: () => _confirmerDeconnexion(context, ref),
          ),

          const SizedBox(height: 30),
          Center(
            child: Column(
              children: [
                Text(
                  'Lycée Guergné La Renaissance',
                  style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 3),
                Text(
                  "N'Djamena, Tchad · Version 1.0",
                  style: theme.textTheme.bodySmall?.copyWith(fontSize: 11),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  Future<void> _afficherAide(BuildContext context) {
    return showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (context) => const _FeuilleAide(),
    );
  }

  Future<void> _confirmerDeconnexion(BuildContext context, WidgetRef ref) async {
    final confirme = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Se déconnecter ?'),
        content: const Text(
          "Vous devrez demander un nouveau code par SMS pour vous reconnecter. "
          "Les informations enregistrées sur ce téléphone seront effacées.",
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Annuler')),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(backgroundColor: context.etat(Couleurs.danger)),
            child: const Text('Se déconnecter'),
          ),
        ],
      ),
    );

    if (confirme == true) await ref.read(sessionProvider.notifier).deconnecter();
  }
}

class _Identite extends StatelessWidget {
  const _Identite({required this.profil});

  final Profil profil;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return CarteLgr(
      rembourrage: const EdgeInsets.all(18),
      enfant: Row(
        children: [
          AvatarEleve(nom: profil.nom, prenom: profil.prenom, taille: 56),
          const SizedBox(width: 15),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  profil.nomComplet,
                  style: theme.textTheme.titleMedium,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Text(profil.telephone ?? '—', style: ThemeLgr.nombre(theme.textTheme.bodyMedium)),
                const SizedBox(height: 8),
                const BadgeEtat(
                  'Parent · compte vérifié',
                  ton: TonBadge.succes,
                  icone: Icons.verified_user_rounded,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LigneEnfant extends StatelessWidget {
  const _LigneEnfant({required this.enfant});

  final Enfant enfant;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return CarteLgr(
      rembourrage: const EdgeInsets.all(13),
      enfant: Row(
        children: [
          AvatarEleve(nom: enfant.nom, prenom: enfant.prenom, taille: 42),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  enfant.nomComplet,
                  style: theme.textTheme.titleSmall?.copyWith(fontSize: 14),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  '${enfant.classe} · ${enfant.matricule}',
                  style: theme.textTheme.bodySmall?.copyWith(fontSize: 11.5),
                ),
              ],
            ),
          ),
          BadgeEtat(enfant.lienLisible),
        ],
      ),
    );
  }
}

class _Entree extends StatelessWidget {
  const _Entree({
    required this.icone,
    required this.titre,
    required this.sousTitre,
    required this.surAppui,
    this.couleur,
  });

  final IconData icone;
  final String titre;
  final String sousTitre;
  final VoidCallback surAppui;
  final Color? couleur;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final teinte = couleur ?? theme.colorScheme.primary;

    return CarteLgr(
      surAppui: surAppui,
      rembourrage: const EdgeInsets.all(14),
      enfant: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: teinte.withValues(alpha: 0.11),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icone, size: 19, color: teinte),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  titre,
                  style: theme.textTheme.titleSmall?.copyWith(fontSize: 14, color: couleur),
                ),
                const SizedBox(height: 2),
                Text(sousTitre, style: theme.textTheme.bodySmall?.copyWith(fontSize: 11.5)),
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded, size: 20, color: Couleurs.encreLegere),
        ],
      ),
    );
  }
}

class _FeuilleAide extends StatelessWidget {
  const _FeuilleAide();

  static const _questions = [
    (
      "Je ne reçois pas le code par SMS",
      "Vérifiez que le numéro saisi est bien celui enregistré au secrétariat. "
          "Le réseau peut retarder un SMS de quelques minutes. Au-delà, "
          "contactez l'école : votre numéro est peut-être différent dans son fichier.",
    ),
    (
      "Les notes de mon enfant n'apparaissent pas",
      "Les notes ne sont visibles qu'une fois le bulletin validé par le conseil "
          "de classe et publié par l'école. Avant cela, elles peuvent encore changer.",
    ),
    (
      "Une absence est signalée à tort",
      "Rapprochez-vous du surveillant général avec un justificatif. "
          "La correction apparaîtra ici dès qu'elle sera saisie.",
    ),
    (
      "Comment payer la scolarité ?",
      "Les règlements se font à la comptabilité de l'école. Chaque versement "
          "donne lieu à un reçu numéroté, qui apparaît dans l'onglet Scolarité.",
    ),
    (
      "Mon numéro de téléphone a changé",
      "Signalez-le au secrétariat. Tant que l'ancien numéro est enregistré, "
          "les codes et les alertes partiront dessus.",
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.7,
      maxChildSize: 0.92,
      builder: (context, controleur) => ListView(
        controller: controleur,
        padding: const EdgeInsets.fromLTRB(24, 6, 24, 40),
        children: [
          Text('Questions fréquentes', style: theme.textTheme.headlineSmall),
          const SizedBox(height: 18),
          ..._questions.map(
            (q) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: CarteLgr(
                enfant: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(q.$1, style: theme.textTheme.titleSmall),
                    const SizedBox(height: 7),
                    Text(q.$2, style: theme.textTheme.bodySmall?.copyWith(height: 1.55)),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
