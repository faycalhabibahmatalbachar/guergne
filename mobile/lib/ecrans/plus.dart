import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../design/accueil/services_rapides.dart';
import '../design/couleurs.dart';
import '../design/theme.dart';
import '../etat/fournisseurs.dart';
import 'annonces.dart';
import 'bulletins.dart';
import 'emploi_du_temps.dart';

/// Ouvre la liste des annonces par-dessus l'écran courant.
///
/// Les annonces n'ont plus d'onglet depuis le Design 3 — l'onglet « Plus »
/// a pris leur place — mais elles restent à un geste : la cloche de l'accueil,
/// la carte « Dernière annonce », la tuile d'accès rapide, et ici.
void ouvrirAnnonces(BuildContext context) {
  Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const EcranAnnonces()));
}

void ouvrirBulletins(BuildContext context) {
  Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const EcranBulletins()));
}

void ouvrirEmploiDuTemps(BuildContext context) {
  Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const EcranEmploiDuTemps()));
}

/// Onglet « Plus » : tout ce qui se consulte moins souvent.
///
/// Cinq onglets est le maximum lisible en bas d'écran. Les quatre premiers
/// portent ce que le parent regarde chaque semaine — accueil, résultats,
/// assiduité, scolarité ; le cinquième rassemble le reste plutôt que d'en
/// sacrifier un arbitrairement.
class EcranPlus extends ConsumerWidget {
  const EcranPlus({super.key, required this.versCompte});

  final VoidCallback versCompte;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final accueil = ref.watch(accueilProvider).value?.valeur;
    final nonLues = accueil?.annonces.where((a) => !a.lue).length ?? 0;
    final profil = accueil?.profil ?? ref.watch(sessionProvider).profil;

    return Scaffold(
      appBar: AppBar(title: const Text('Plus')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(ThemeLgr.espace, 4, ThemeLgr.espace, 24),
        children: [
          _Rubrique(titre: 'Communication'),
          _Entree(
            icone: Icons.campaign_rounded,
            teinte: TeintesServices.annonces,
            titre: 'Annonces',
            sousTitre: nonLues == 0
                ? "Communications de l'établissement"
                : '$nonLues non lue${nonLues > 1 ? "s" : ""}',
            badge: nonLues,
            surAppui: () => ouvrirAnnonces(context),
          ),
          const SizedBox(height: 20),
          _Rubrique(titre: 'Scolarité'),
          _Entree(
            icone: Icons.description_rounded,
            teinte: TeintesServices.bulletins,
            titre: 'Bulletins',
            sousTitre: 'Bulletins publiés, en PDF',
            surAppui: () => ouvrirBulletins(context),
          ),
          const SizedBox(height: 10),
          _Entree(
            icone: Icons.calendar_month_rounded,
            teinte: TeintesServices.emploiDuTemps,
            titre: 'Emploi du temps',
            sousTitre: 'Semaine de la classe',
            surAppui: () => ouvrirEmploiDuTemps(context),
          ),
          const SizedBox(height: 20),
          _Rubrique(titre: 'Compte'),
          _Entree(
            icone: Icons.manage_accounts_rounded,
            teinte: TeintesServices.resultats,
            titre: 'Mon compte',
            sousTitre: profil == null ? 'Enfants, aide, déconnexion' : profil.nomComplet,
            surAppui: versCompte,
          ),
          const SizedBox(height: 36),
          Center(
            child: Column(
              children: [
                SizedBox(width: 44, height: 44, child: SvgPicture.asset('assets/marque/logo.svg')),
                const SizedBox(height: 10),
                Text(
                  'Lycée Guergné La Renaissance',
                  style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 4),
                Text(
                  'ÉDUCATION  •  EXCELLENCE  •  AVENIR',
                  style: ThemeLgr.inter(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.2,
                    color: context.etat(Couleurs.primaire),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Rubrique extends StatelessWidget {
  const _Rubrique({required this.titre});

  final String titre;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 10),
      child: Text(
        titre.toUpperCase(),
        style: Theme.of(
          context,
        ).textTheme.labelSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: 1.0),
      ),
    );
  }
}

class _Entree extends StatelessWidget {
  const _Entree({
    required this.icone,
    required this.teinte,
    required this.titre,
    required this.sousTitre,
    required this.surAppui,
    this.badge = 0,
  });

  final IconData icone;
  final Color teinte;
  final String titre;
  final String sousTitre;
  final VoidCallback surAppui;
  final int badge;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sombre = theme.brightness == Brightness.dark;
    final couleur = sombre ? Color.lerp(teinte, Colors.white, 0.45)! : teinte;

    Widget pastille = Container(
      width: 44,
      height: 44,
      decoration: BoxDecoration(
        color: couleur.withValues(alpha: sombre ? 0.18 : 0.10),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Icon(icone, color: couleur, size: 22),
    );
    if (badge > 0) {
      pastille = Badge.count(count: badge, backgroundColor: Couleurs.danger, child: pastille);
    }

    return Material(
      color: theme.colorScheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(ThemeLgr.rayon),
        side: BorderSide(color: theme.colorScheme.outline),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: surAppui,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              pastille,
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(titre, style: theme.textTheme.titleSmall),
                    const SizedBox(height: 2),
                    Text(
                      sousTitre,
                      style: theme.textTheme.bodySmall,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: theme.textTheme.bodySmall?.color),
            ],
          ),
        ),
      ),
    );
  }
}
