import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../design/accueil/banniere_ecole.dart';
import '../design/accueil/carte_derniere_annonce.dart';
import '../design/accueil/carte_indicateur.dart';
import '../design/accueil/entete_institution.dart';
import '../design/accueil/selecteur_enfant.dart';
import '../design/accueil/services_rapides.dart';
import '../design/accueil/titre_section.dart';
import '../design/composants.dart';
import '../design/couleurs.dart';
import '../design/squelettes.dart';
import '../design/theme.dart';
import '../etat/fournisseurs.dart';
import '../modeles/modeles.dart';
import '../outils/formats.dart';
import 'annonce_detail.dart';
import 'plus.dart';

/// Écran d'accueil — Design 3 « Institutionnel Premium ».
///
/// Il répond à la seule question que le parent se pose en ouvrant
/// l'application : **est-ce que tout va bien pour mon enfant ?**
///
/// L'ordre de l'écran suit l'ordre des questions, et non l'inverse :
///
///   1. Qui est connecté, quel enfant est affiché ?  → en-tête, bannière
///   2. Où en est-il en classe ?                     → moyenne, absences, retards
///   3. Où en est la famille avec l'école ?          → reste à payer, échéance
///   4. Où trouver le reste ?                        → enfants, accès rapides
///   5. Quoi de neuf ?                               → dernière annonce
///
/// Ce qui appelle une action passe avant tout le reste : une suspension se
/// lit juste sous la bannière, une échéance dépassée juste sous les chiffres.
class EcranAccueil extends ConsumerWidget {
  const EcranAccueil({super.key, required this.versOnglet, required this.versCompte});

  /// Navigation vers un onglet de la barre inférieure.
  final void Function(int) versOnglet;

  /// Accès à l'écran du compte, depuis la feuille « Mes enfants ».
  final VoidCallback versCompte;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accueil = ref.watch(accueilProvider);
    final sombre = Theme.of(context).brightness == Brightness.dark;

    // L'en-tête est désormais CLAIR : les icônes de la barre d'état doivent
    // passer en sombre, sans quoi l'heure et la batterie deviennent blanches
    // sur blanc.
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: sombre ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
      child: Scaffold(
        body: SafeArea(
          bottom: false,
          child: RefreshIndicator(
            color: Couleurs.primaire,
            onRefresh: () async => ref.invalidate(accueilProvider),
            child: accueil.when(
              loading: () => const _AccueilEnChargement(),
              error: (erreur, _) => _AccueilEnErreur(
                message: erreur.toString(),
                surReessayer: () => ref.invalidate(accueilProvider),
              ),
              data: (donnees) =>
                  _AccueilCharge(donnees: donnees, versOnglet: versOnglet, versCompte: versCompte),
            ),
          ),
        ),
      ),
    );
  }
}

class _AccueilCharge extends ConsumerWidget {
  const _AccueilCharge({required this.donnees, required this.versOnglet, required this.versCompte});

  final Donnees<Accueil> donnees;
  final void Function(int) versOnglet;
  final VoidCallback versCompte;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accueil = donnees.valeur;
    final enfant = ref.watch(enfantCourantProvider);
    final nonLues = accueil.annonces.where((a) => !a.lue).length;

    final entete = EnteteInstitution(
      nonLues: nonLues,
      surNotifications: () => ouvrirAnnonces(context),
    );

    if (accueil.enfants.isEmpty || enfant == null) {
      return ListView(
        children: [
          entete,
          SizedBox(
            height: MediaQuery.sizeOf(context).height * 0.6,
            child: const EtatVide(
              icone: Icons.family_restroom_rounded,
              titre: 'Aucun enfant rattaché',
              explication:
                  "Votre compte n'est rattaché à aucun élève inscrit. "
                  "Contactez le secrétariat de l'école pour régulariser.",
            ),
          ),
        ],
      );
    }

    // Lu une seule fois pour tout l'écran : la bannière, la carte enfant et
    // la feuille de choix n'ouvrent pas chacune le coffre sécurisé.
    final entetes = ref.watch(entetesImageProvider).valueOrNull;
    final api = ref.read(apiProvider);
    // `photoId` nul veut dire qu'aucune photo n'a été déposée : on n'appelle
    // même pas la route, qui répondrait 404. Un 404 par enfant à chaque
    // ouverture est un aller-retour payé pour rien sur un forfait au mégaoctet.
    String? photo(Enfant e) => e.photoId == null ? null : api.urlPhotoEnfant(e.eleveId);

    void changerEnfant() => choisirEnfant(
      context,
      enfants: accueil.enfants,
      courant: enfant,
      photo: photo,
      entetesPhoto: entetes,
      versCompte: versCompte,
      surChoix: (e) => ref.read(enfantChoisiProvider.notifier).state = e.eleveId,
    );

    final derniere = accueil.annonces.isEmpty ? null : accueil.annonces.first;

    return CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverToBoxAdapter(child: entete),
        if (donnees.depuisCache)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: BandeauHorsLigne(derniereMaj: donnees.date),
            ),
          ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(ThemeLgr.espace, 4, ThemeLgr.espace, 28),
          sliver: SliverList.list(
            children: [
              // --- Niveau 1 : qui, et quel enfant ---------------------------
              BanniereEcole(
                salutation: '${saluer()}, ${accueil.profil.prenom}',
                nomEleve: enfant.nomComplet,
                classe: enfant.classe,
                matricule: enfant.matricule,
                surAppui: accueil.enfants.length > 1 ? changerEnfant : null,
              ),
              const SizedBox(height: 20),

              // La suspension AVANT les indicateurs, et non après.
              //
              // Un enfant suspendu apparaissait comme n'importe quel autre :
              // la famille reçoit bien une notification le jour de la
              // décision, mais rien ne le rappelait ensuite. Un parent qui
              // ouvre l'application trois jours plus tard n'avait aucun moyen
              // de savoir que son enfant ne devait pas se présenter — et le
              // renvoi à la grille se découvrait au portail.
              if (enfant.estSuspendu) ...[
                _BanniereSuspension(enfant: enfant),
                const SizedBox(height: 20),
              ],

              // --- Niveaux 2 et 3 : situation scolaire et financière --------
              TitreSection(
                titre: 'Situation',
                icone: Icons.insights_rounded,
                // L'année et la période viennent du SERVEUR (année marquée
                // « courante » dans `annees_scolaires`), jamais d'une
                // constante : à la rentrée, l'accueil bascule de lui-même.
                fin: PastilleInfo(
                  icone: Icons.event_note_rounded,
                  texte: [
                    if (enfant.annee.isNotEmpty) enfant.annee,
                    if (enfant.periode != null && enfant.periode!.isNotEmpty) enfant.periode!,
                  ].join(' · '),
                ),
              ),
              const SizedBox(height: 12),
              _Indicateurs(enfant: enfant, versOnglet: versOnglet),
              if (enfant.prochaineEcheance != null) ...[
                const SizedBox(height: 12),
                _CarteEcheance(enfant: enfant, surAppui: () => versOnglet(3)),
              ],
              const SizedBox(height: 26),

              // --- Niveau 4 : enfants et services ---------------------------
              TitreSection(
                titre: 'Mes enfants',
                icone: Icons.family_restroom_rounded,
                action: accueil.enfants.length > 1 ? 'Changer' : 'Voir tout',
                surAction: changerEnfant,
              ),
              const SizedBox(height: 10),
              SelecteurEnfant(
                enfants: accueil.enfants,
                courant: enfant,
                photo: photo,
                entetesPhoto: entetes,
                surAppui: changerEnfant,
              ),
              const SizedBox(height: 26),

              TitreSection(
                titre: 'Accès rapides',
                icone: Icons.bolt_rounded,
                action: 'Tout voir',
                surAction: () => versOnglet(4),
              ),
              const SizedBox(height: 12),
              GrilleServices(
                services: [
                  ServiceRapide(
                    libelle: 'Bulletins',
                    icone: Icons.description_rounded,
                    teinte: TeintesServices.bulletins,
                    surAppui: () => ouvrirBulletins(context),
                  ),
                  ServiceRapide(
                    libelle: 'Résultats',
                    icone: Icons.bar_chart_rounded,
                    teinte: TeintesServices.resultats,
                    surAppui: () => versOnglet(1),
                  ),
                  ServiceRapide(
                    libelle: 'Emploi du temps',
                    icone: Icons.calendar_month_rounded,
                    teinte: TeintesServices.emploiDuTemps,
                    surAppui: () => ouvrirEmploiDuTemps(context),
                  ),
                  ServiceRapide(
                    libelle: 'Paiements',
                    icone: Icons.account_balance_wallet_rounded,
                    teinte: TeintesServices.paiements,
                    surAppui: () => versOnglet(3),
                  ),
                  ServiceRapide(
                    libelle: 'Annonces',
                    icone: Icons.campaign_rounded,
                    teinte: TeintesServices.annonces,
                    badge: nonLues,
                    surAppui: () => ouvrirAnnonces(context),
                  ),
                  ServiceRapide(
                    libelle: 'Vie scolaire',
                    icone: Icons.verified_user_rounded,
                    teinte: TeintesServices.vieScolaire,
                    surAppui: () => versOnglet(2),
                  ),
                ],
              ),
              const SizedBox(height: 26),

              // --- Niveau 5 : dernières informations ------------------------
              TitreSection(
                titre: 'Dernière annonce',
                icone: Icons.campaign_outlined,
                action: derniere == null ? null : 'Tout voir',
                surAction: () => ouvrirAnnonces(context),
              ),
              const SizedBox(height: 10),
              if (derniere == null)
                const _CarteVide(
                  icone: Icons.campaign_outlined,
                  texte: 'Aucune annonce pour le moment.',
                )
              else
                CarteDerniereAnnonce(
                  annonce: derniere,
                  surLire: () => ouvrirAnnonce(context, ref, derniere),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Suspension
// ---------------------------------------------------------------------------

/// Bannière de suspension.
///
/// ELLE DIT QUAND L'ENFANT REVIENT, PAS SEULEMENT QU'IL EST EXCLU
/// ---------------------------------------------------------------
/// « Suspendu » sans échéance laisse une famille sans savoir quoi faire de sa
/// semaine. La date de reprise est l'information la plus utile de la bannière,
/// et c'est pour la porter qu'on lit l'historique des statuts plutôt que la
/// seule fiche de l'élève.
///
/// ELLE NE REPREND PAS LE MOTIF ÉCRIT PAR L'ÉTABLISSEMENT
/// -------------------------------------------------------
/// Le motif de `historique_statuts` est rédigé pour le dossier — « bagarre
/// dans la cour, 3 jours » — et se lit très durement hors contexte. La famille
/// a reçu la décision par notification, et le secrétariat la lui explique.
/// L'application dit l'état et l'échéance, pas la faute.
class _BanniereSuspension extends StatelessWidget {
  const _BanniereSuspension({required this.enfant});

  final Enfant enfant;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final rouge = context.etat(Couleurs.danger);
    final reprise = enfant.statutJusqua;

    // Bordure UNIFORME plus bande dessinée à part.
    //
    // Flutter refuse `borderRadius` sur une bordure non uniforme : une bande
    // épaisse à gauche et un filet fin ailleurs lève une assertion au moment
    // du PEINTURE, pas de la compilation — le code passait l'analyse et le
    // typage, et n'échouait qu'à la capture.
    return DecoratedBox(
      decoration: BoxDecoration(
        color: rouge.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(ThemeLgr.rayon),
        border: Border.all(color: rouge.withValues(alpha: 0.3)),
      ),
      child: Stack(
        children: [
          Positioned(
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: rouge,
                borderRadius: const BorderRadius.horizontal(left: Radius.circular(ThemeLgr.rayon)),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 14, 14, 14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.report_problem_rounded, color: rouge, size: 22),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${enfant.prenom} est suspendu(e) ${enfant.motifSuspension}',
                        style: theme.textTheme.titleSmall?.copyWith(color: rouge),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        [
                          if (enfant.statutDepuis != null)
                            'Depuis le ${dateLongue(enfant.statutDepuis!)}',
                          if (reprise != null)
                            'Retour prévu le ${dateLongue(reprise)}'
                          else
                            'Aucune date de retour fixée',
                        ].join(' · '),
                        style: theme.textTheme.bodySmall?.copyWith(height: 1.4),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Il ne doit pas se présenter au lycée pendant cette période. '
                        'Le secrétariat vous a transmis la décision.',
                        style: theme.textTheme.bodySmall?.copyWith(fontSize: 11.5, height: 1.4),
                      ),
                    ],
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
// ---------------------------------------------------------------------------
// Indicateurs
// ---------------------------------------------------------------------------

/// Une échéance dépassée, et non « bientôt due ».
///
/// La règle est écrite une seule fois : la carte du reste à payer et la
/// bannière d'échéance la lisent toutes les deux, et deux copies finiraient
/// par se contredire à l'écran — une carte rouge au-dessus d'une bannière
/// bleue disant que tout va bien.
bool _enRetard(Enfant enfant) {
  // `joursAvant` est déjà la fonction qu'utilise la bannière d'échéance : on
  // la réemploie plutôt que de reparser la date ici. Deux lectures d'une même
  // date finissent toujours par diverger d'un jour sur un fuseau ou un
  // changement d'heure.
  final jours = joursAvant(enfant.prochaineEcheanceLe);
  return jours != null && jours < 0;
}

/// Les quatre chiffres de l'accueil, branchés sur les données de l'enfant.
///
/// Les règles de couleur et de gravité sont celles de l'ancien accueil,
/// reprises telles quelles : seul l'habillage change. Chaque carte mène à son
/// détail en un geste — un chiffre inquiétant ne doit pas obliger à chercher
/// le bon onglet.
class _Indicateurs extends StatelessWidget {
  const _Indicateurs({required this.enfant, required this.versOnglet});

  final Enfant enfant;
  final void Function(int) versOnglet;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final absences = enfant.absencesNonJustifiees;
    final enRetard = _enRetard(enfant);

    return GrilleIndicateurs(
      cartes: [
        CarteIndicateur(
          index: 0,
          libelle: 'Moyenne générale',
          valeur: enfant.moyenne == null ? '—' : virgule(enfant.moyenne!),
          suffixe: enfant.moyenne == null ? null : '/20',
          // Le rang SEUL ne situe pas : « 7e sur 42 » ne dit pas si la
          // classe est forte. La moyenne de classe le dit — c'est la
          // première question que pose un parent au téléphone.
          detail: enfant.moyenne == null
              ? 'Bulletin non publié'
              : [
                  if (enfant.rang != null) '${enfant.rang}ᵉ sur ${enfant.effectif}',
                  if (enfant.moyenneClasse != null) 'classe ${virgule(enfant.moyenneClasse!)}',
                ].join(' · '),
          couleur: context.moyenne(enfant.moyenne),
          severite: enfant.moyenne == null
              ? Severite.neutre
              : (enfant.moyenne! < 8
                    ? Severite.grave
                    : enfant.moyenne! < 10
                    ? Severite.attention
                    : enfant.moyenne! >= 14
                    ? Severite.bon
                    : Severite.neutre),
          icone: Icons.school_rounded,
          teinteIcone: Couleurs.primaire,
          surAppui: () => versOnglet(1),
        ),
        CarteIndicateur(
          index: 1,
          libelle: 'Absences',
          valeur: absences == 0 ? '0' : heures(absences),
          suffixe: absences == 0 ? null : 'h',
          detail: absences == 0 ? 'Aucune non justifiée' : 'Non justifiées',
          couleur: absences == 0
              ? context.etat(Couleurs.succes)
              : (absences >= 8 ? context.etat(Couleurs.danger) : context.etat(Couleurs.alerte)),
          // Seuils calés sur ce qui déclenche une action à l'école : en
          // dessous d'une demi-journée, la vie scolaire ne convoque personne.
          // Alerter avant elle ferait sonner la carte en permanence, et un
          // signal permanent n'est plus un signal.
          severite: absences == 0
              ? Severite.bon
              : (absences >= 8
                    ? Severite.grave
                    : absences >= 4
                    ? Severite.attention
                    : Severite.neutre),
          icone: absences == 0 ? Icons.event_available_rounded : Icons.event_busy_rounded,
          teinteIcone: TeintesServices.resultats,
          surAppui: () => versOnglet(2),
        ),
        CarteIndicateur(
          index: 2,
          libelle: 'Retards',
          valeur: '${enfant.retards}',
          detail: enfant.retards == 0 ? 'Ponctuel' : 'Sur la période',
          couleur: enfant.retards == 0
              ? context.etat(Couleurs.succes)
              : context.etat(Couleurs.alerte),
          severite: enfant.retards == 0
              ? Severite.bon
              : (enfant.retards >= 8
                    ? Severite.grave
                    : enfant.retards >= 4
                    ? Severite.attention
                    : Severite.neutre),
          icone: Icons.schedule_rounded,
          teinteIcone: Couleurs.orSombre,
          surAppui: () => versOnglet(2),
        ),
        CarteIndicateur(
          index: 3,
          libelle: 'Reste à payer',
          // Montant COMPLET, jamais abrégé. Aucun reçu, aucun bulletin,
          // aucune banque tchadienne n'écrit « 102 k F » : sur l'écran de
          // l'argent, une abréviation inventée est le seul endroit où un
          // parent n'a pas le droit d'hésiter.
          valeur: enfant.resteDuFcfa == 0 ? 'À jour' : montant(enfant.resteDuFcfa),
          detail: enfant.resteDuFcfa == 0
              ? 'Scolarité soldée'
              : (enRetard ? 'Échéance dépassée' : "Sur l'année"),
          // Rouge UNIQUEMENT si une échéance est dépassée. Un solde dû mais
          // dans les temps est une information, pas une alerte : il se
          // distingue par le fond doré de la carte, pas par la couleur du
          // danger.
          couleur: enfant.resteDuFcfa == 0
              ? context.etat(Couleurs.succes)
              : (enRetard
                    ? context.etat(Couleurs.danger)
                    : theme.textTheme.headlineSmall?.color ?? Couleurs.encre),
          severite: enfant.resteDuFcfa == 0
              ? Severite.bon
              : (enRetard ? Severite.grave : Severite.attention),
          mise: enfant.resteDuFcfa > 0,
          icone: Icons.account_balance_wallet_rounded,
          teinteIcone: TeintesServices.paiements,
          surAppui: () => versOnglet(3),
        ),
      ],
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
// Éléments partagés
// ---------------------------------------------------------------------------

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

/// Squelette de l'accueil, calqué sur sa mise en page réelle.
///
/// La bannière garde sa photo pendant le chargement : c'est un asset local,
/// il ne dépend d'aucun réseau. Le parent reconnaît son école avant même que
/// les chiffres arrivent.
class _AccueilEnChargement extends StatelessWidget {
  const _AccueilEnChargement();

  @override
  Widget build(BuildContext context) {
    final largeur = MediaQuery.sizeOf(context).width;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        EnteteInstitution(nonLues: 0, surNotifications: () => ouvrirAnnonces(context)),
        Padding(
          padding: const EdgeInsets.fromLTRB(ThemeLgr.espace, 4, ThemeLgr.espace, 0),
          child: Column(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(24),
                child: Stack(
                  children: [
                    Image.asset(
                      imageBatimentEcole,
                      height: (largeur * 0.60).clamp(210.0, 300.0),
                      width: double.infinity,
                      fit: BoxFit.cover,
                      alignment: const Alignment(-0.1, 0.25),
                    ),
                    Positioned.fill(
                      child: ColoredBox(color: Couleurs.primaireSombre.withValues(alpha: 0.55)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              const Row(
                children: [
                  Expanded(child: SqueletteCarte()),
                  SizedBox(width: 12),
                  Expanded(child: SqueletteCarte()),
                ],
              ),
              const SizedBox(height: 12),
              const Row(
                children: [
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
