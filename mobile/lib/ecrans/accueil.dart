import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../design/composants.dart';
import '../design/couleurs.dart';
import '../design/squelettes.dart';
import '../design/theme.dart';
import '../etat/fournisseurs.dart';
import '../modeles/modeles.dart';
import '../outils/formats.dart';
import 'annonce_detail.dart';

/// Écran d'accueil.
///
/// Il répond à la seule question que le parent se pose en ouvrant
/// l'application : **est-ce que tout va bien pour mon enfant ?**
///
/// D'où l'ordre : l'enfant, puis ce qui appelle une action (absences non
/// justifiées, échéance qui approche), puis le reste. Les quatre indicateurs
/// sont cliquables — un chiffre inquiétant doit mener à son détail en un
/// geste, pas obliger à chercher le bon onglet.
class EcranAccueil extends ConsumerWidget {
  const EcranAccueil({super.key, required this.versOnglet, required this.versCompte});

  /// Navigation vers un onglet de la barre inférieure.
  final void Function(int) versOnglet;

  /// Accès à l'écran du compte. Il n'a pas d'onglet — cinq destinations est le
  /// maximum lisible en bas d'écran — donc il s'atteint depuis la bannière.
  final VoidCallback versCompte;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accueil = ref.watch(accueilProvider);

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(accueilProvider),
        child: accueil.when(
          loading: () => const _AccueilEnChargement(),
          error: (erreur, _) => _AccueilEnErreur(
            message: erreur.toString(),
            surReessayer: () => ref.invalidate(accueilProvider),
          ),
          data: (donnees) => _AccueilCharge(
            donnees: donnees,
            versOnglet: versOnglet,
            versCompte: versCompte,
          ),
        ),
      ),
    );
  }
}

class _AccueilCharge extends ConsumerWidget {
  const _AccueilCharge({
    required this.donnees,
    required this.versOnglet,
    required this.versCompte,
  });

  final Donnees<Accueil> donnees;
  final void Function(int) versOnglet;
  final VoidCallback versCompte;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final accueil = donnees.valeur;
    final enfant = ref.watch(enfantCourantProvider);

    if (accueil.enfants.isEmpty) {
      return const EtatVide(
        icone: Icons.family_restroom_rounded,
        titre: 'Aucun enfant rattaché',
        explication:
            "Votre compte n'est rattaché à aucun élève inscrit. "
            "Contactez le secrétariat de l'école pour régulariser.",
      );
    }

    return CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverToBoxAdapter(
          child: _Banniere(
            profil: accueil.profil,
            enfants: accueil.enfants,
            enfant: enfant!,
            versCompte: versCompte,
          ),
        ),
        if (donnees.depuisCache)
          SliverToBoxAdapter(child: BandeauHorsLigne(derniereMaj: donnees.date)),
        SliverPadding(
          padding: const EdgeInsets.all(ThemeLgr.espace),
          sliver: SliverList.list(
            children: [
              _Indicateurs(enfant: enfant, versOnglet: versOnglet),
              const SizedBox(height: 20),
              if (enfant.prochaineEcheance != null) ...[
                _CarteEcheance(enfant: enfant, surAppui: () => versOnglet(3)),
                const SizedBox(height: 20),
              ],
              _TitreSection(
                titre: 'Annonces',
                action: accueil.annonces.isEmpty ? null : 'Tout voir',
                surAction: () => versOnglet(4),
              ),
              const SizedBox(height: 12),
              if (accueil.annonces.isEmpty)
                _CarteVide(icone: Icons.campaign_outlined, texte: "Aucune annonce pour le moment.")
              else
                ...accueil.annonces
                    .take(3)
                    .toList()
                    .asMap()
                    .entries
                    .map(
                      (e) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: ApparitionCascade(
                          index: e.key,
                          enfant: _CarteAnnonce(annonce: e.value),
                        ),
                      ),
                    ),
              const SizedBox(height: 8),
              Center(
                child: Text(
                  'Année ${enfant.annee}',
                  style: theme.textTheme.bodySmall?.copyWith(fontSize: 11.5),
                ),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Bannière : identité de l'enfant, sélecteur si fratrie
// ---------------------------------------------------------------------------

class _Banniere extends ConsumerWidget {
  const _Banniere({
    required this.profil,
    required this.enfants,
    required this.enfant,
    required this.versCompte,
  });

  final Profil profil;
  final List<Enfant> enfants;
  final Enfant enfant;
  final VoidCallback versCompte;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      decoration: const BoxDecoration(gradient: Couleurs.gradientAccueil),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(ThemeLgr.espace, 12, ThemeLgr.espace, 22),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  // Le logo signe l'écran : le parent doit reconnaître son
                  // école avant même de lire quoi que ce soit.
                  Container(
                    width: 34,
                    height: 34,
                    padding: const EdgeInsets.all(3),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: SvgPicture.asset('assets/marque/logo.svg'),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      '${saluer()}, ${profil.prenom}',
                      style: ThemeLgr.inter(
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                        color: Colors.white.withValues(alpha: 0.88),
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Text(
                    dateDuJour(),
                    style: ThemeLgr.inter(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w500,
                      color: Colors.white.withValues(alpha: 0.7),
                    ),
                  ),
                  const SizedBox(width: 10),
                  // Seul accès au compte : déconnexion, aide, emploi du temps.
                  // Sans lui, ces trois écrans existent mais restent hors
                  // d'atteinte du parent.
                  Semantics(
                    button: true,
                    label: 'Mon compte',
                    child: InkWell(
                      onTap: versCompte,
                      borderRadius: BorderRadius.circular(12),
                      child: Container(
                        width: 38,
                        height: 38,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.18),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.white.withValues(alpha: 0.28)),
                        ),
                        child: const Icon(
                          Icons.person_outline_rounded,
                          color: Colors.white,
                          size: 20,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),

              // Fratrie : le sélecteur ne s'affiche que s'il sert à quelque
              // chose. Un onglet unique non cliquable serait du bruit.
              if (enfants.length > 1) ...[
                SizedBox(
                  height: 40,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: enfants.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 8),
                    itemBuilder: (context, i) => _PuceEnfant(
                      enfant: enfants[i],
                      actif: enfants[i].eleveId == enfant.eleveId,
                      surAppui: () =>
                          ref.read(enfantChoisiProvider.notifier).state = enfants[i].eleveId,
                    ),
                  ),
                ),
                const SizedBox(height: 18),
              ],

              Row(
                children: [
                  AvatarEleve(nom: enfant.nom, prenom: enfant.prenom, taille: 58),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          enfant.nomComplet,
                          style: ThemeLgr.inter(
                            fontSize: 21,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                            letterSpacing: -0.4,
                            height: 1.2,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${enfant.classe}  ·  ${enfant.matricule}',
                          style: ThemeLgr.inter(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: Colors.white.withValues(alpha: 0.78),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PuceEnfant extends StatelessWidget {
  const _PuceEnfant({required this.enfant, required this.actif, required this.surAppui});

  final Enfant enfant;
  final bool actif;
  final VoidCallback surAppui;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: ThemeLgr.dureeCourte,
      curve: ThemeLgr.ressortDoux,
      decoration: BoxDecoration(
        color: actif ? Colors.white : Colors.white.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: actif ? Colors.transparent : Colors.white.withValues(alpha: 0.3)),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: surAppui,
          borderRadius: BorderRadius.circular(999),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Text(
              enfant.prenom,
              style: ThemeLgr.inter(
                fontSize: 13.5,
                fontWeight: FontWeight.w600,
                color: actif ? context.etat(Couleurs.primaire) : Colors.white,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Indicateurs
// ---------------------------------------------------------------------------

class _Indicateurs extends StatelessWidget {
  const _Indicateurs({required this.enfant, required this.versOnglet});

  final Enfant enfant;
  final void Function(int) versOnglet;

  @override
  Widget build(BuildContext context) {
    final absences = enfant.absencesNonJustifiees;

    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: _Indicateur(
                index: 0,
                libelle: 'Moyenne',
                valeur: enfant.moyenne == null ? '—' : virgule(enfant.moyenne!),
                suffixe: enfant.moyenne == null ? null : '/20',
                detail: enfant.moyenne == null
                    ? 'Bulletin non publié'
                    : (enfant.rang == null
                          ? enfant.periode ?? ''
                          : '${enfant.rang}ᵉ sur ${enfant.effectif}'),
                couleur: context.moyenne(enfant.moyenne),
                icone: Icons.workspace_premium_rounded,
                surAppui: () => versOnglet(1),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _Indicateur(
                index: 1,
                libelle: 'Absences',
                valeur: absences == 0 ? '0' : heures(absences),
                suffixe: absences == 0 ? null : 'h',
                detail: absences == 0 ? 'Aucune non justifiée' : 'Non justifiées',
                couleur: absences == 0
                    ? context.etat(Couleurs.succes)
                    : (absences >= 8
                          ? context.etat(Couleurs.danger)
                          : context.etat(Couleurs.alerte)),
                icone: absences == 0 ? Icons.verified_rounded : Icons.event_busy_rounded,
                surAppui: () => versOnglet(2),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _Indicateur(
                index: 2,
                libelle: 'Retards',
                valeur: '${enfant.retards}',
                detail: enfant.retards == 0 ? 'Ponctuel' : 'Sur la période',
                couleur: enfant.retards == 0
                    ? context.etat(Couleurs.succes)
                    : context.etat(Couleurs.alerte),
                icone: Icons.schedule_rounded,
                surAppui: () => versOnglet(2),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _Indicateur(
                index: 3,
                libelle: 'Reste à payer',
                valeur: enfant.resteDuFcfa == 0 ? 'À jour' : montantCourt(enfant.resteDuFcfa),
                detail: enfant.resteDuFcfa == 0 ? 'Scolarité soldée' : 'Sur l\'année',
                couleur: enfant.resteDuFcfa == 0
                    ? context.etat(Couleurs.succes)
                    : context.etat(Couleurs.info),
                icone: Icons.account_balance_wallet_rounded,
                surAppui: () => versOnglet(3),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _Indicateur extends StatelessWidget {
  const _Indicateur({
    required this.index,
    required this.libelle,
    required this.valeur,
    required this.detail,
    required this.couleur,
    required this.icone,
    required this.surAppui,
    this.suffixe,
  });

  final int index;
  final String libelle;
  final String valeur;
  final String? suffixe;
  final String detail;
  final Color couleur;
  final IconData icone;
  final VoidCallback surAppui;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return ApparitionCascade(
      index: index,
      decalage: 45,
      enfant: CarteLgr(
        surAppui: surAppui,
        rembourrage: const EdgeInsets.all(14),
        enfant: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 30,
                  height: 30,
                  decoration: BoxDecoration(
                    color: couleur.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(icone, size: 16, color: couleur),
                ),
                const SizedBox(width: 9),
                Expanded(
                  child: Text(
                    libelle,
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Flexible(
                  child: Text(
                    valeur,
                    style: ThemeLgr.nombre(
                      theme.textTheme.headlineSmall,
                    ).copyWith(color: couleur, fontSize: 23, height: 1.0),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (suffixe != null)
                  Text(
                    suffixe!,
                    style: ThemeLgr.inter(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: couleur.withValues(alpha: 0.65),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 5),
            Text(
              detail,
              style: theme.textTheme.bodySmall?.copyWith(fontSize: 11),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Échéance à venir
// ---------------------------------------------------------------------------

class _CarteEcheance extends StatelessWidget {
  const _CarteEcheance({required this.enfant, required this.surAppui});

  final Enfant enfant;
  final VoidCallback surAppui;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final jours = joursAvant(enfant.prochaineEcheanceLe);
    final enRetard = jours != null && jours < 0;
    final urgent = jours != null && jours >= 0 && jours <= 14;

    final couleur = enRetard
        ? context.etat(Couleurs.danger)
        : (urgent ? context.etat(Couleurs.alerte) : context.etat(Couleurs.info));

    return CarteLgr(
      surAppui: surAppui,
      bordure: couleur.withValues(alpha: 0.32),
      couleurFond: couleur.withValues(alpha: 0.05),
      enfant: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: couleur.withValues(alpha: 0.13),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(
              enRetard ? Icons.priority_high_rounded : Icons.event_rounded,
              size: 21,
              color: couleur,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(enfant.prochaineEcheance!, style: theme.textTheme.titleSmall),
                const SizedBox(height: 3),
                Text(
                  enRetard
                      ? 'En retard depuis ${-jours} jour${-jours > 1 ? "s" : ""}'
                      : (jours == null
                            ? 'À régler'
                            : (jours == 0
                                  ? "À régler aujourd'hui"
                                  : 'Dans $jours jour${jours > 1 ? "s" : ""}')),
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: couleur,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          Text(
            montant(enfant.prochaineEcheanceFcfa ?? 0),
            style: ThemeLgr.nombre(theme.textTheme.titleSmall).copyWith(color: couleur),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Annonces
// ---------------------------------------------------------------------------

class _CarteAnnonce extends ConsumerWidget {
  const _CarteAnnonce({required this.annonce});

  final Annonce annonce;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    return CarteLgr(
      surAppui: () => ouvrirAnnonce(context, ref, annonce),
      enfant: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (annonce.epinglee) ...[
                const Icon(Icons.push_pin_rounded, size: 14, color: Couleurs.accent),
                const SizedBox(width: 6),
              ],
              // La pastille « non lu » est doublée par la graisse du titre :
              // un point coloré seul serait invisible pour un daltonien.
              if (!annonce.lue) ...[
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
                  annonce.titre,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: annonce.lue ? FontWeight.w500 : FontWeight.w700,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            annonce.contenu,
            style: theme.textTheme.bodySmall,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Text(
                dateRelative(annonce.publierLe),
                style: theme.textTheme.bodySmall?.copyWith(fontSize: 11),
              ),
              if (annonce.classe != null) ...[
                const SizedBox(width: 8),
                BadgeEtat(annonce.classe!, ton: TonBadge.info),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Éléments partagés
// ---------------------------------------------------------------------------

class _TitreSection extends StatelessWidget {
  const _TitreSection({required this.titre, this.action, this.surAction});

  final String titre;
  final String? action;
  final VoidCallback? surAction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(titre, style: theme.textTheme.titleMedium),
        if (action != null)
          TextButton(
            onPressed: surAction,
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              minimumSize: const Size(0, 36),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: Text(action!),
          ),
      ],
    );
  }
}

class _CarteVide extends StatelessWidget {
  const _CarteVide({required this.icone, required this.texte});

  final IconData icone;
  final String texte;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return CarteLgr(
      rembourrage: const EdgeInsets.symmetric(horizontal: 16, vertical: 22),
      enfant: Row(
        children: [
          Icon(icone, size: 20, color: Couleurs.encreLegere),
          const SizedBox(width: 12),
          Expanded(child: Text(texte, style: theme.textTheme.bodySmall)),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// États de chargement et d'erreur
// ---------------------------------------------------------------------------

class _AccueilEnChargement extends StatelessWidget {
  const _AccueilEnChargement();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(height: 210, decoration: const BoxDecoration(gradient: Couleurs.gradientAccueil)),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.all(ThemeLgr.espace),
            child: Column(
              children: [
                Row(
                  children: const [
                    Expanded(child: SqueletteCarte()),
                    SizedBox(width: 12),
                    Expanded(child: SqueletteCarte()),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: const [
                    Expanded(child: SqueletteCarte()),
                    SizedBox(width: 12),
                    Expanded(child: SqueletteCarte()),
                  ],
                ),
                const SizedBox(height: 20),
                const SqueletteLigne(),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _AccueilEnErreur extends StatelessWidget {
  const _AccueilEnErreur({required this.message, required this.surReessayer});

  final String message;
  final VoidCallback surReessayer;

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.75,
          child: EtatVide(
            icone: Icons.cloud_off_rounded,
            titre: 'Informations indisponibles',
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
