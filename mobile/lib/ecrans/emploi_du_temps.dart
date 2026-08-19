import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../design/composants.dart';
import '../design/couleurs.dart';
import '../design/squelettes.dart';
import '../design/theme.dart';
import '../etat/fournisseurs.dart';
import '../modeles/modeles.dart';
import '../outils/formats.dart';

/// Emploi du temps de la classe.
///
/// Présenté jour par jour, avec le jour courant ouvert d'emblée : la question
/// posée est presque toujours « qu'est-ce qu'il a aujourd'hui ? ». Une grille
/// hebdomadaire complète serait illisible sur un écran de téléphone.
class EcranEmploiDuTemps extends ConsumerStatefulWidget {
  const EcranEmploiDuTemps({super.key});

  @override
  ConsumerState<EcranEmploiDuTemps> createState() => _EtatEmploiDuTemps();
}

class _EtatEmploiDuTemps extends ConsumerState<EcranEmploiDuTemps> {
  late int _jour = _jourInitial();

  /// Dimanche, on ouvre sur lundi : personne ne consulte l'emploi du temps du
  /// dimanche, mais beaucoup préparent la semaine la veille au soir.
  int _jourInitial() {
    final aujourdhui = maintenant().weekday;
    return aujourdhui == DateTime.sunday ? DateTime.monday : aujourdhui;
  }

  @override
  Widget build(BuildContext context) {
    final enfant = ref.watch(enfantCourantProvider);

    if (enfant == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Emploi du temps')),
        body: const EtatVide(
          icone: Icons.calendar_today_outlined,
          titre: 'Aucun élève',
          explication: "Aucun enfant n'est rattaché à votre compte.",
        ),
      );
    }

    final edt = ref.watch(emploiDuTempsProvider(enfant.eleveId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Emploi du temps'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(28),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(ThemeLgr.espace, 0, ThemeLgr.espace, 10),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                '${enfant.classe} · ${enfant.annee}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          ),
        ),
      ),
      body: edt.when(
        loading: () => const SqueletteListe(nombre: 5),
        error: (erreur, _) => EtatVide(
          icone: Icons.cloud_off_rounded,
          titre: 'Emploi du temps indisponible',
          explication: erreur.toString(),
          action: FilledButton.icon(
            onPressed: () => ref.invalidate(emploiDuTempsProvider(enfant.eleveId)),
            icon: const Icon(Icons.refresh_rounded, size: 18),
            label: const Text('Réessayer'),
          ),
        ),
        data: (donnees) =>
            _Grille(donnees: donnees, jour: _jour, surJour: (j) => setState(() => _jour = j)),
      ),
    );
  }
}

class _Grille extends StatelessWidget {
  const _Grille({required this.donnees, required this.jour, required this.surJour});

  final Donnees<List<Cours>> donnees;
  final int jour;
  final void Function(int) surJour;

  @override
  Widget build(BuildContext context) {
    final tous = donnees.valeur;

    if (tous.isEmpty) {
      return Column(
        children: [
          if (donnees.depuisCache) BandeauHorsLigne(derniereMaj: donnees.date),
          const Expanded(
            child: EtatVide(
              icone: Icons.calendar_today_outlined,
              titre: 'Emploi du temps non publié',
              explication:
                  "L'école n'a pas encore publié l'emploi du temps de cette classe. "
                  'Il apparaîtra ici dès qu\'il sera disponible.',
            ),
          ),
        ],
      );
    }

    // Les jours réellement travaillés, tirés des données : imposer lundi-samedi
    // afficherait des onglets vides si l'école ne travaille pas le samedi.
    final joursTravailles = tous.map((c) => c.jour).toSet().toList()..sort();
    final duJour = tous.where((c) => c.jour == jour).toList();

    return Column(
      children: [
        if (donnees.depuisCache) BandeauHorsLigne(derniereMaj: donnees.date),
        _BarreJours(jours: joursTravailles, actif: jour, surJour: surJour),
        Expanded(
          child: duJour.isEmpty
              ? EtatVide(
                  icone: Icons.free_breakfast_rounded,
                  titre: 'Pas de cours',
                  explication: 'Aucun cours n\'est programmé le ${nomJour(jour).toLowerCase()}.',
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(ThemeLgr.espace),
                  itemCount: duJour.length,
                  itemBuilder: (context, i) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: ApparitionCascade(
                      index: i,
                      enfant: _LigneCours(cours: duJour[i]),
                    ),
                  ),
                ),
        ),
      ],
    );
  }
}

class _BarreJours extends StatelessWidget {
  const _BarreJours({required this.jours, required this.actif, required this.surJour});

  final List<int> jours;
  final int actif;
  final void Function(int) surJour;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final aujourdhui = maintenant().weekday;

    return Container(
      height: 58,
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(bottom: BorderSide(color: theme.colorScheme.outline)),
      ),
      child: Row(
        children: jours.map((j) {
          final selectionne = j == actif;

          return Expanded(
            child: InkWell(
              onTap: () => surJour(j),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    nomJour(j).substring(0, 3),
                    style: ThemeLgr.inter(
                      fontSize: 13,
                      fontWeight: selectionne ? FontWeight.w700 : FontWeight.w500,
                      color: selectionne
                          ? theme.colorScheme.primary
                          : theme.textTheme.bodyMedium?.color,
                    ),
                  ),
                  const SizedBox(height: 5),
                  // Le trait sous le jour sélectionné ; un point ocre marque
                  // en plus le jour réel, pour ne pas perdre le repère quand
                  // on navigue dans la semaine.
                  Container(
                    width: selectionne ? 22 : 4,
                    height: 3,
                    decoration: BoxDecoration(
                      color: selectionne
                          ? theme.colorScheme.primary
                          : (j == aujourdhui ? Couleurs.accent : Colors.transparent),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ],
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _LigneCours extends StatelessWidget {
  const _LigneCours({required this.cours});

  final Cours cours;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final couleur = Couleurs.matiere(cours.code);

    return CarteLgr(
      rembourrage: const EdgeInsets.all(14),
      enfant: Row(
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                cours.debutCourt,
                style: ThemeLgr.nombre(theme.textTheme.titleSmall).copyWith(fontSize: 14),
              ),
              const SizedBox(height: 2),
              Text(
                cours.finCourte,
                style: ThemeLgr.nombre(theme.textTheme.bodySmall).copyWith(fontSize: 11.5),
              ),
            ],
          ),
          const SizedBox(width: 13),
          Container(
            width: 4,
            height: 42,
            decoration: BoxDecoration(color: couleur, borderRadius: BorderRadius.circular(2)),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  cours.matiere,
                  style: theme.textTheme.titleSmall?.copyWith(fontSize: 14),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 3),
                Text(
                  [
                    if (cours.enseignant != null) cours.enseignant!,
                    if (cours.salle != null) 'Salle ${cours.salle}',
                  ].join('  ·  '),
                  style: theme.textTheme.bodySmall?.copyWith(fontSize: 11.5),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
