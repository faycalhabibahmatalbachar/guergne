import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../design/accueil/feuille_accueil.dart';
import '../design/accueil/haut_accueil.dart';
import '../design/accueil/selecteur_enfant.dart';
import '../design/composants.dart';
import '../design/couleurs.dart';
import '../design/squelettes.dart';
import '../design/theme.dart';
import '../etat/fournisseurs.dart';
import '../modeles/modeles.dart';
import '../outils/formats.dart';
import 'annonce_detail.dart';
import 'plus.dart';

/// Écran d'accueil — maquette « vert profond ».
///
/// Il répond à la seule question que le parent se pose en ouvrant
/// l'application : **est-ce que tout va bien pour mon enfant ?**
///
/// L'ordre de l'écran suit l'ordre des questions, et non l'inverse :
///
///   1. Quelle école, quel enfant ?            → en-tête, pilule de l'enfant
///   2. Où en est-il en classe ?               → moyenne, rang
///   3. Et sur la période ?                    → absences, retards, scolarité
///   4. Où trouver le reste ?                  → accès rapide
///   5. Quoi de neuf ?                         → dernières annonces
///
/// Les trois premières réponses tiennent sur le fond vert, sans défilement ;
/// le reste vit sur la feuille claire. Ce qui appelle une action — suspension,
/// échéance dépassée — ouvre la feuille, avant tout le reste.
///
/// Le Design 3 posait le nom de l'enfant sur une photographie. Elle saturait
/// l'écran et disputait le regard aux chiffres : elle n'est plus qu'un rappel
/// fondu dans le coin de l'en-tête.
class EcranAccueil extends ConsumerWidget {
  const EcranAccueil({super.key, required this.versOnglet, required this.versCompte});

  /// Navigation vers un onglet de la barre inférieure.
  final void Function(int) versOnglet;

  /// Accès à l'écran du compte, depuis la feuille « Mes enfants ».
  final VoidCallback versCompte;

  /// Onglet des annonces dans la coque.
  static const ongletAnnonces = 4;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accueil = ref.watch(accueilProvider);

    // Le haut de l'écran est vert foncé, en clair comme en sombre : la barre
    // d'état s'y lit toujours en blanc.
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        body: RefreshIndicator(
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
    );
  }
}

/// Zone verte : le fond, et la marge qui dégage la barre d'état.
///
/// L'écran n'est PAS dans une `SafeArea` : le vert doit monter jusque sous
/// l'heure et la batterie. C'est le contenu qui s'écarte, pas le fond.
class _ZoneVerte extends StatelessWidget {
  const _ZoneVerte({required this.enfants});

  final List<Widget> enfants;

  @override
  Widget build(BuildContext context) {
    return FondAccueil(
      child: Padding(
        padding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [...enfants, const CoiffeFeuille()],
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

    final entete = EnteteAccueil(
      nonLues: nonLues,
      surNotifications: () => versOnglet(EcranAccueil.ongletAnnonces),
    );

    if (accueil.enfants.isEmpty || enfant == null) {
      return ListView(
        padding: EdgeInsets.zero,
        children: [
          _ZoneVerte(enfants: [entete]),
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

    // Lu une seule fois pour tout l'écran : la pilule et la feuille de choix
    // n'ouvrent pas chacune le coffre sécurisé.
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

    final jours = joursAvant(enfant.prochaineEcheanceLe);
    // L'échéance ne monte sur l'accueil que si elle demande un geste : passée,
    // ou due dans la quinzaine. Plus lointaine, elle se lit dans « Scolarité ».
    final echeanceProche = enfant.prochaineEcheance != null && jours != null && jours <= 14;

    const marge = EdgeInsets.symmetric(horizontal: ThemeLgr.espace);

    return ListView(
      padding: EdgeInsets.zero,
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        // --- Sur le vert : qui, et où en est-il ----------------------------
        _ZoneVerte(
          enfants: [
            entete,
            Padding(
              padding: marge,
              child: PiluleEnfant(
                enfant: enfant,
                plusieurs: accueil.enfants.length > 1,
                urlPhoto: photo(enfant),
                entetesPhoto: entetes,
                surAppui: changerEnfant,
              ),
            ),
            const SizedBox(height: 14),
            Padding(
              padding: marge,
              child: ApparitionCascade(
                index: 0,
                enfant: CarteMoyenne(
                  moyenne: enfant.moyenne == null ? null : virgule(enfant.moyenne!),
                  // La moyenne de la classe, pas une tendance : le rang SEUL
                  // ne situe pas — « 7e sur 42 » ne dit pas si la classe est
                  // forte. C'est la première question d'un parent au téléphone.
                  detail: enfant.moyenne == null
                      ? 'Bulletin non publié'
                      : (enfant.moyenneClasse == null
                            ? (enfant.periode ?? 'Période en cours')
                            : 'Classe : ${virgule(enfant.moyenneClasse!)}'),
                  rang: enfant.moyenne == null ? null : enfant.rang,
                  effectif: enfant.effectif,
                  surAppui: () => versOnglet(1),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Padding(
              padding: marge,
              child: ApparitionCascade(
                index: 1,
                enfant: CartesSituation(chiffres: _chiffres(enfant, versOnglet)),
              ),
            ),
            const SizedBox(height: 18),
          ],
        ),

        // --- Sur la feuille : ce qui presse, puis le reste -----------------
        //
        // Remontée d'un pixel sur la coiffe : à la jonction de deux éléments
        // de liste, un filet du fond vert transparaissait sinon.
        Container(
          transform: Matrix4.translationValues(0, -1, 0),
          color: Theme.of(context).scaffoldBackgroundColor,
          padding: const EdgeInsets.fromLTRB(ThemeLgr.espace, 0, ThemeLgr.espace, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (donnees.depuisCache) ...[
                ClipRRect(
                  borderRadius: BorderRadius.circular(ThemeLgr.rayonPetit),
                  child: BandeauHorsLigne(derniereMaj: donnees.date),
                ),
                const SizedBox(height: 14),
              ],

              // La suspension AVANT tout le reste de la feuille.
              //
              // Un enfant suspendu apparaissait comme n'importe quel autre :
              // la famille reçoit bien une notification le jour de la
              // décision, mais rien ne le rappelait ensuite. Un parent qui
              // ouvre l'application trois jours plus tard n'avait aucun moyen
              // de savoir que son enfant ne devait pas se présenter — et le
              // renvoi à la grille se découvrait au portail.
              if (enfant.estSuspendu) ...[
                _BanniereSuspension(enfant: enfant),
                const SizedBox(height: 14),
              ],
              if (echeanceProche) ...[
                _CarteEcheance(enfant: enfant, surAppui: () => versOnglet(3)),
                const SizedBox(height: 14),
              ],

              TitreFeuille(
                titre: 'Accès rapide',
                action: 'Voir tout',
                surAction: () => ouvrirPlus(context, versCompte: versCompte),
              ),
              const SizedBox(height: 6),
              ApparitionCascade(
                index: 2,
                enfant: TuilesAcces(
                  tuiles: [
                    TuileAcces(
                      libelle: 'Résultats',
                      icone: Icons.menu_book_rounded,
                      fond: Couleurs.primaire,
                      trait: Colors.white,
                      surAppui: () => versOnglet(1),
                    ),
                    TuileAcces(
                      libelle: 'Assiduité',
                      icone: Icons.calendar_month_rounded,
                      fond: Couleurs.infoFond,
                      trait: Couleurs.info,
                      surAppui: () => versOnglet(2),
                    ),
                    TuileAcces(
                      libelle: 'Scolarité',
                      icone: Icons.credit_card_rounded,
                      fond: const Color(0xFFF59E0B),
                      trait: Colors.white,
                      surAppui: () => versOnglet(3),
                    ),
                    TuileAcces(
                      libelle: 'Annonces',
                      icone: Icons.campaign_rounded,
                      fond: const Color(0xFFEDE9FE),
                      trait: const Color(0xFF6D28D9),
                      badge: nonLues,
                      surAppui: () => versOnglet(EcranAccueil.ongletAnnonces),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              ApparitionCascade(
                index: 3,
                enfant: CarteAnnonces(
                  annonces: accueil.annonces.take(2).toList(),
                  surVoirToutes: () => versOnglet(EcranAccueil.ongletAnnonces),
                  surLire: (annonce) => ouvrirAnnonce(context, ref, annonce),
                ),
              ),

              // « À jour » ne s'affiche que si c'est vrai : des données lues
              // dans le cache portent déjà le bandeau hors ligne, plus haut.
              if (!donnees.depuisCache) ...[
                const SizedBox(height: 14),
                BandeauAJour(
                  date: donnees.date,
                  surRafraichir: () => ref.invalidate(accueilProvider),
                ),
              ],
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

/// Les trois chiffres de la période, branchés sur les données de l'enfant.
///
/// Les seuils sont ceux de l'accueil précédent, repris tels quels : seul
/// l'habillage change. Chaque carte mène à son détail en un geste — un chiffre
/// inquiétant ne doit pas obliger à chercher le bon onglet.
List<ChiffreSituation> _chiffres(Enfant enfant, void Function(int) versOnglet) {
  final absences = enfant.absencesNonJustifiees;
  final enRetard = _enRetard(enfant);

  return [
    ChiffreSituation(
      icone: Icons.groups_rounded,
      teinte: Couleurs.info,
      // Le serveur compte les absences en HEURES non justifiées : c'est
      // l'unité du carnet, et celle sur laquelle la vie scolaire convoque.
      valeur: absences == 0 ? '0' : '${heures(absences)} h',
      libelle: 'Absences',
      mention: absences == 0 ? 'aucune' : 'non justifiées',
      // Seuils calés sur ce qui déclenche une action à l'école : en dessous
      // d'une demi-journée, la vie scolaire ne convoque personne. Alerter
      // avant elle ferait sonner la carte en permanence.
      teinteMention: absences >= 8
          ? Couleurs.danger
          : (absences >= 4 ? Couleurs.alerte : Couleurs.info),
      teinteFond: absences >= 8 ? Couleurs.danger : null,
      surAppui: () => versOnglet(2),
    ),
    ChiffreSituation(
      icone: Icons.schedule_rounded,
      teinte: Couleurs.alerte,
      valeur: '${enfant.retards}',
      libelle: 'Retards',
      mention: enfant.retards == 0 ? 'ponctuel' : 'sur la période',
      teinteFond: enfant.retards >= 4 ? Couleurs.alerte : null,
      surAppui: () => versOnglet(2),
    ),
    ChiffreSituation(
      icone: Icons.account_balance_wallet_rounded,
      // Rouge UNIQUEMENT si une échéance est dépassée. Un solde dû mais dans
      // les temps est une information, pas une alerte.
      teinte: enRetard ? Couleurs.danger : Couleurs.succes,
      // Montant COMPLET, jamais abrégé. Aucun reçu, aucun bulletin, aucune
      // banque tchadienne n'écrit « 102 k F ».
      valeur: enfant.resteDuFcfa == 0 ? 'À jour' : montant(enfant.resteDuFcfa),
      libelle: enfant.resteDuFcfa == 0
          ? 'Scolarité soldée'
          : (enRetard ? 'En retard' : 'Reste à payer'),
      teinteFond: enRetard ? Couleurs.danger : null,
      fleche: true,
      surAppui: () => versOnglet(3),
    ),
  ];
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
// États de chargement et d'erreur
// ---------------------------------------------------------------------------

/// Squelette de l'accueil, calqué sur sa mise en page réelle.
///
/// Le fond vert et le nom de l'établissement sont là dès la première image :
/// ils ne dépendent d'aucun réseau. Le parent reconnaît son école avant même
/// que les chiffres arrivent.
class _AccueilEnChargement extends StatelessWidget {
  const _AccueilEnChargement();

  @override
  Widget build(BuildContext context) {
    Widget voile(double hauteur, double rayon) => Container(
      height: hauteur,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(rayon),
      ),
    );

    const marge = EdgeInsets.symmetric(horizontal: ThemeLgr.espace);

    return ListView(
      padding: EdgeInsets.zero,
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        _ZoneVerte(
          enfants: [
            EnteteAccueil(nonLues: 0, surNotifications: () {}),
            Padding(padding: marge, child: voile(68, 34)),
            const SizedBox(height: 14),
            Padding(padding: marge, child: voile(128, 22)),
            const SizedBox(height: 12),
            Padding(
              padding: marge,
              child: Row(
                children: [
                  Expanded(child: voile(132, 20)),
                  const SizedBox(width: 10),
                  Expanded(child: voile(132, 20)),
                  const SizedBox(width: 10),
                  Expanded(child: voile(132, 20)),
                ],
              ),
            ),
            const SizedBox(height: 18),
          ],
        ),
        const Padding(
          padding: marge,
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(child: SqueletteCarte()),
                  SizedBox(width: 12),
                  Expanded(child: SqueletteCarte()),
                ],
              ),
              SizedBox(height: 14),
              SqueletteLigne(),
              SizedBox(height: 12),
              SqueletteLigne(),
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
      padding: EdgeInsets.zero,
      children: [
        _ZoneVerte(enfants: [EnteteAccueil(nonLues: 0, surNotifications: () {})]),
        SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.6,
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
