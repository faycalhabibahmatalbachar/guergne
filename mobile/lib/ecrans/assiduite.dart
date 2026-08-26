import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../design/composants.dart';
import '../design/couleurs.dart';
import '../design/squelettes.dart';
import '../design/theme.dart';
import '../etat/fournisseurs.dart';
import '../modeles/modeles.dart';
import '../outils/formats.dart';

/// Écran d'assiduité et de discipline.
///
/// C'est la fonction la plus attendue d'une application scolaire : savoir vite
/// et sûrement que son enfant n'est pas en cours. Les événements sont donc
/// présentés en journal chronologique, groupés par jour — c'est ainsi qu'un
/// parent se souvient, pas par catégorie administrative.
class EcranAssiduite extends ConsumerWidget {
  const EcranAssiduite({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final enfant = ref.watch(enfantCourantProvider);

    if (enfant == null) {
      return const Scaffold(
        body: EtatVide(
          icone: Icons.event_available_outlined,
          titre: 'Aucun élève',
          explication: "Aucun enfant n'est rattaché à votre compte.",
        ),
      );
    }

    final assiduite = ref.watch(assiduiteProvider(enfant.eleveId));
    final etendue = ref.watch(etendueAssiduiteProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Assiduité'),
        // Le nom de l'enfant, comme sur Résultats.
        //
        // Sans lui, un parent de plusieurs enfants qui arrive ici depuis une
        // notification n'a AUCUN moyen de savoir de qui sont ces absences. Le
        // sélecteur d'enfant vit sur l'accueil, pas sur cet écran.
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
        actions: [
          // Bascule période / année. Un parent convoqué veut l'historique
          // complet, un parent qui suit la semaine veut la période en cours.
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: TextButton.icon(
              onPressed: () => ref.read(etendueAssiduiteProvider.notifier).state =
                  etendue == 'annee' ? null : 'annee',
              icon: Icon(
                etendue == 'annee' ? Icons.filter_list_off_rounded : Icons.history_rounded,
                size: 17,
              ),
              label: Text(etendue == 'annee' ? 'Période' : 'Année'),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(assiduiteProvider(enfant.eleveId)),
        child: assiduite.when(
          loading: () => const SqueletteListe(nombre: 6),
          error: (erreur, _) => _ListeErreur(
            message: erreur.toString(),
            surReessayer: () => ref.invalidate(assiduiteProvider(enfant.eleveId)),
          ),
          data: (donnees) => _Journal(donnees: donnees, enfant: enfant, etendue: etendue),
        ),
      ),
    );
  }
}

class _Journal extends StatelessWidget {
  const _Journal({required this.donnees, required this.enfant, required this.etendue});

  final Donnees<Assiduite> donnees;
  final Enfant enfant;
  final String? etendue;

  @override
  Widget build(BuildContext context) {
    final evenements = donnees.valeur.evenements;

    if (evenements.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          if (donnees.depuisCache) BandeauHorsLigne(derniereMaj: donnees.date),
          SizedBox(
            height: MediaQuery.sizeOf(context).height * 0.65,
            child: EtatVide(
              icone: Icons.verified_rounded,
              titre: 'Aucun incident',
              explication: etendue == 'annee'
                  ? "${enfant.prenom} n'a ni absence, ni retard, ni sanction "
                        "enregistrés cette année."
                  : "${enfant.prenom} n'a rien à signaler sur la période en cours.",
            ),
          ),
        ],
      );
    }

    // Regroupement par jour : plusieurs absences le même jour forment un
    // événement unique dans la tête du parent, pas trois lignes détachées.
    final parJour = <String, List<EvenementAssiduite>>{};
    for (final e in evenements) {
      parJour.putIfAbsent(e.date, () => []).add(e);
    }
    final jours = parJour.keys.toList();

    return ListView.builder(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.only(bottom: 24),
      itemCount: jours.length + (donnees.depuisCache ? 2 : 1),
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
              4,
            ),
            child: _Resume(evenements: evenements),
          );
        }

        final jour = jours[i - decalage - 1];
        return ApparitionCascade(
          index: i - decalage - 1,
          enfant: _GroupeJour(date: jour, evenements: parJour[jour]!),
        );
      },
    );
  }
}

class _Resume extends StatelessWidget {
  const _Resume({required this.evenements});

  final List<EvenementAssiduite> evenements;

  @override
  Widget build(BuildContext context) {
    final absences = evenements.where((e) => e.genre == GenreEvenement.absence);
    final nonJustifiees = absences.where((e) => !e.justifie).length;
    final retards = evenements.where((e) => e.genre == GenreEvenement.retard).length;
    final sanctions = evenements
        .where((e) => e.genre == GenreEvenement.sanction || e.genre == GenreEvenement.incident)
        .length;

    return CarteLgr(
      rembourrage: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      enfant: Row(
        children: [
          _Compteur(
            valeur: absences.length,
            libelle: 'Absences',
            couleur: absences.isEmpty ? context.etat(Couleurs.succes) : context.etat(Couleurs.info),
          ),
          _Separateur(),
          _Compteur(
            valeur: nonJustifiees,
            libelle: 'Non justifiées',
            couleur: nonJustifiees == 0
                ? context.etat(Couleurs.succes)
                : context.etat(Couleurs.danger),
          ),
          _Separateur(),
          _Compteur(
            valeur: retards,
            libelle: 'Retards',
            couleur: retards == 0 ? context.etat(Couleurs.succes) : context.etat(Couleurs.alerte),
          ),
          _Separateur(),
          _Compteur(
            valeur: sanctions,
            libelle: 'Discipline',
            couleur: sanctions == 0 ? context.etat(Couleurs.succes) : context.etat(Couleurs.danger),
          ),
        ],
      ),
    );
  }
}

class _Compteur extends StatelessWidget {
  const _Compteur({required this.valeur, required this.libelle, required this.couleur});

  final int valeur;
  final String libelle;
  final Color couleur;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Expanded(
      child: Column(
        children: [
          // Même style de chiffre que l'accueil et le relevé : c'est la même
          // donnée, elle doit avoir le même visage d'un écran à l'autre.
          Text('$valeur', style: ThemeLgr.chiffre(couleur: couleur, taille: 24)),
          const SizedBox(height: 3),
          Text(
            libelle,
            style: theme.textTheme.bodySmall?.copyWith(fontSize: 10.5),
            textAlign: TextAlign.center,
            maxLines: 2,
          ),
        ],
      ),
    );
  }
}

class _Separateur extends StatelessWidget {
  @override
  Widget build(BuildContext context) =>
      Container(width: 1, height: 34, color: Theme.of(context).colorScheme.outline);
}

class _GroupeJour extends StatelessWidget {
  const _GroupeJour({required this.date, required this.evenements});

  final String date;
  final List<EvenementAssiduite> evenements;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.fromLTRB(ThemeLgr.espace, 14, ThemeLgr.espace, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 2, bottom: 8),
            child: Text(
              dateRelative(date),
              style: theme.textTheme.titleSmall?.copyWith(fontSize: 13),
            ),
          ),
          ...evenements.map(
            (e) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _LigneEvenement(evenement: e),
            ),
          ),
        ],
      ),
    );
  }
}

class _LigneEvenement extends StatelessWidget {
  const _LigneEvenement({required this.evenement});

  final EvenementAssiduite evenement;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final e = evenement;

    final (IconData icone, Color couleur) = switch (e.genre) {
      GenreEvenement.absence => (
        Icons.event_busy_rounded,
        e.justifie ? context.etat(Couleurs.info) : context.etat(Couleurs.danger),
      ),
      GenreEvenement.retard => (Icons.schedule_rounded, context.etat(Couleurs.alerte)),
      GenreEvenement.sanction => (Icons.gavel_rounded, context.etat(Couleurs.danger)),
      GenreEvenement.incident => (Icons.report_problem_rounded, context.etat(Couleurs.alerte)),
    };

    return CarteLgr(
      rembourrage: const EdgeInsets.all(13),
      enfant: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: couleur.withValues(alpha: 0.11),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icone, size: 18, color: couleur),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        e.libelle,
                        style: theme.textTheme.titleSmall?.copyWith(fontSize: 13.5),
                      ),
                    ),
                    if (e.nbHeures != null)
                      Text(
                        '${heures(e.nbHeures!)} h',
                        style: ThemeLgr.nombre(
                          theme.textTheme.bodySmall,
                        ).copyWith(fontWeight: FontWeight.w600),
                      ),
                  ],
                ),
                if (e.matiere != null) ...[
                  const SizedBox(height: 2),
                  Text(e.matiere!, style: theme.textTheme.bodySmall?.copyWith(fontSize: 11.5)),
                ],
                if (e.detail != null && e.detail!.isNotEmpty) ...[
                  const SizedBox(height: 5),
                  Text(
                    e.detail!,
                    style: theme.textTheme.bodySmall,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
                if (e.genre == GenreEvenement.absence || e.genre == GenreEvenement.retard) ...[
                  const SizedBox(height: 8),
                  BadgeEtat(
                    e.justifie ? 'Justifiée' : 'Non justifiée',
                    ton: e.justifie ? TonBadge.succes : TonBadge.danger,
                    icone: e.justifie ? Icons.check_rounded : Icons.priority_high_rounded,
                  ),
                  // Ce que le parent peut FAIRE.
                  //
                  // « Non justifiée » énonce un problème sans dire comment en
                  // sortir. L'application ne peut pas recevoir de justificatif
                  // — l'établissement en exige un sur papier, signé — mais elle
                  // peut dire où le porter. Sans cette ligne, le parent
                  // constate et referme, et l'absence reste non justifiée
                  // jusqu'au bulletin.
                  if (!e.justifie) ...[
                    const SizedBox(height: 6),
                    Text(
                      'Remettez un justificatif écrit au surveillant général '
                      'pour la faire lever.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontSize: 11.5,
                        height: 1.35,
                      ),
                    ),
                  ],
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ListeErreur extends StatelessWidget {
  const _ListeErreur({required this.message, required this.surReessayer});

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
            titre: 'Assiduité indisponible',
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
