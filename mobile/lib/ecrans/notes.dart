import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../design/composants.dart';
import '../design/couleurs.dart';
import '../design/squelettes.dart';
import '../design/theme.dart';
import '../etat/fournisseurs.dart';
import '../modeles/modeles.dart';
import '../outils/formats.dart';

/// Écran des notes.
///
/// Il ne montre **que** ce que l'école a publié. Tant que le conseil de classe
/// n'a pas validé le bulletin, l'écran l'annonce clairement au lieu d'afficher
/// des moyennes provisoires : une moyenne qui change après coup détruit la
/// confiance dans l'application bien plus sûrement qu'une attente assumée.
class EcranNotes extends ConsumerWidget {
  const EcranNotes({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final enfant = ref.watch(enfantCourantProvider);

    if (enfant == null) {
      return const Scaffold(
        body: EtatVide(
          icone: Icons.workspace_premium_outlined,
          titre: 'Aucun élève',
          explication: "Aucun enfant n'est rattaché à votre compte.",
        ),
      );
    }

    final notes = ref.watch(notesProvider(enfant.eleveId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Résultats'),
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
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(notesProvider(enfant.eleveId)),
        child: notes.when(
          loading: () => const SqueletteListe(nombre: 6),
          error: (erreur, _) => _Erreur(
            message: erreur.toString(),
            surReessayer: () => ref.invalidate(notesProvider(enfant.eleveId)),
          ),
          data: (donnees) => _Contenu(donnees: donnees),
        ),
      ),
    );
  }
}

class _Contenu extends ConsumerWidget {
  const _Contenu({required this.donnees});

  final Donnees<ReleveComplet> donnees;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final complet = donnees.valeur;
    final releve = complet.releve;

    return Column(
      children: [
        if (donnees.depuisCache) BandeauHorsLigne(derniereMaj: donnees.date),
        if (complet.periodes.length > 1)
          _SelecteurPeriode(periodes: complet.periodes, actif: releve?.periodeId),
        Expanded(
          child: releve == null
              ? const _AucunePeriode()
              : (releve.publie ? _ReleveePublie(releve: releve) : _ReleveEnAttente(releve: releve)),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Sélecteur de période
// ---------------------------------------------------------------------------

class _SelecteurPeriode extends ConsumerWidget {
  const _SelecteurPeriode({required this.periodes, required this.actif});

  final List<Periode> periodes;
  final String? actif;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    return Container(
      height: 52,
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(bottom: BorderSide(color: theme.colorScheme.outline)),
      ),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: ThemeLgr.espace, vertical: 8),
        itemCount: periodes.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final p = periodes[i];
          final selectionne = p.id == actif;

          return GestureDetector(
            onTap: () => ref.read(periodeChoisieProvider.notifier).state = p.id,
            child: AnimatedContainer(
              duration: ThemeLgr.dureeCourte,
              curve: ThemeLgr.ressortDoux,
              padding: const EdgeInsets.symmetric(horizontal: 15),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: selectionne ? theme.colorScheme.primary : Colors.transparent,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: selectionne ? Colors.transparent : theme.colorScheme.outline,
                ),
              ),
              child: Row(
                children: [
                  Text(
                    // « 1er Trimestre » → « T1 » : la barre doit tenir sur un
                    // écran de 5 pouces sans défilement.
                    'T${p.ordre}',
                    style: ThemeLgr.inter(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: selectionne ? Colors.white : theme.textTheme.bodyMedium?.color,
                    ),
                  ),
                  if (p.publie) ...[
                    const SizedBox(width: 6),
                    Icon(
                      Icons.check_circle_rounded,
                      size: 13,
                      color: selectionne ? Colors.white : context.etat(Couleurs.succes),
                    ),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Bulletin publié
// ---------------------------------------------------------------------------

class _ReleveePublie extends StatelessWidget {
  const _ReleveePublie({required this.releve});

  final Releve releve;

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(ThemeLgr.espace),
      children: [
        _Synthese(releve: releve),
        const SizedBox(height: 20),
        if (releve.matieres.isEmpty)
          const EtatVide(
            icone: Icons.menu_book_outlined,
            titre: 'Aucune matière',
            explication: "Le bulletin est publié mais ne contient encore aucune matière.",
          )
        else
          ...releve.matieres.asMap().entries.map(
            (e) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: ApparitionCascade(
                index: e.key,
                enfant: _CarteMatiere(matiere: e.value),
              ),
            ),
          ),
        if (releve.appreciation != null) ...[
          const SizedBox(height: 8),
          _Appreciation(texte: releve.appreciation!),
        ],
        const SizedBox(height: 24),
      ],
    );
  }
}

class _Synthese extends StatelessWidget {
  const _Synthese({required this.releve});

  final Releve releve;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final couleur = context.moyenne(releve.moyenne);

    return CarteLgr(
      rembourrage: const EdgeInsets.all(18),
      enfant: Column(
        children: [
          Row(
            children: [
              PastilleMoyenne(releve.moyenne, taille: 72),
              const SizedBox(width: 18),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(releve.periode, style: theme.textTheme.titleMedium),
                    const SizedBox(height: 6),
                    if (releve.rang != null)
                      Text(
                        '${releve.rang}ᵉ sur ${releve.effectif ?? "—"} élèves',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: couleur,
                        ),
                      ),
                    if (releve.moyenneClasse != null)
                      Text(
                        'Moyenne de la classe : ${virgule(releve.moyenneClasse!)}',
                        style: theme.textTheme.bodySmall,
                      ),
                  ],
                ),
              ),
            ],
          ),
          if (releve.mentionLisible != null) ...[
            const SizedBox(height: 16),
            Align(
              alignment: Alignment.centerLeft,
              child: BadgeEtat(
                releve.mentionLisible!,
                ton: switch (releve.mention) {
                  'FELICITATIONS' || 'ENCOURAGEMENTS' || 'TABLEAU_HONNEUR' => TonBadge.succes,
                  'BLAME' => TonBadge.danger,
                  _ => TonBadge.alerte,
                },
                icone: Icons.military_tech_rounded,
              ),
            ),
          ],
          const SizedBox(height: 16),
          const Divider(),
          const SizedBox(height: 14),
          Row(
            children: [
              _Mesure(
                libelle: 'Absences justifiées',
                valeur: '${heures(releve.heuresJustifiees)} h',
              ),
              _Mesure(
                libelle: 'Non justifiées',
                valeur: '${heures(releve.heuresNonJustifiees)} h',
                alerte: releve.heuresNonJustifiees > 0,
              ),
              _Mesure(libelle: 'Retards', valeur: '${releve.nbRetards}'),
              if (releve.noteConduite != null)
                _Mesure(libelle: 'Conduite', valeur: virgule(releve.noteConduite!, 1)),
            ],
          ),
        ],
      ),
    );
  }
}

class _Mesure extends StatelessWidget {
  const _Mesure({required this.libelle, required this.valeur, this.alerte = false});

  final String libelle;
  final String valeur;
  final bool alerte;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Expanded(
      child: Column(
        children: [
          Text(
            valeur,
            style: ThemeLgr.nombre(
              theme.textTheme.titleSmall,
            ).copyWith(color: alerte ? context.etat(Couleurs.danger) : null),
          ),
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

class _CarteMatiere extends StatefulWidget {
  const _CarteMatiere({required this.matiere});

  final MatiereReleve matiere;

  @override
  State<_CarteMatiere> createState() => _EtatCarteMatiere();
}

class _EtatCarteMatiere extends State<_CarteMatiere> {
  bool _ouverte = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final m = widget.matiere;
    final couleur = Couleurs.matiere(m.code);
    final aDuDetail = m.notes.isNotEmpty || m.appreciation != null;

    return CarteLgr(
      rembourrage: EdgeInsets.zero,
      surAppui: aDuDetail ? () => setState(() => _ouverte = !_ouverte) : null,
      enfant: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 4,
                  height: 40,
                  decoration: BoxDecoration(color: couleur, borderRadius: BorderRadius.circular(2)),
                ),
                const SizedBox(width: 13),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        m.matiere,
                        style: theme.textTheme.titleSmall,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 3),
                      Text(
                        [
                          'Coef. ${virgule(m.coefficient, m.coefficient % 1 == 0 ? 0 : 1)}',
                          if (m.rang != null) '${m.rang}ᵉ',
                          if (m.moyenneClasse != null) 'classe ${virgule(m.moyenneClasse!)}',
                        ].join('  ·  '),
                        style: theme.textTheme.bodySmall?.copyWith(fontSize: 11.5),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                PastilleMoyenne(m.moyenne, taille: 48, surVingt: false),
                if (aDuDetail)
                  AnimatedRotation(
                    turns: _ouverte ? 0.5 : 0,
                    duration: ThemeLgr.dureeCourte,
                    curve: ThemeLgr.ressortDoux,
                    child: const Icon(
                      Icons.expand_more_rounded,
                      size: 20,
                      color: Couleurs.encreLegere,
                    ),
                  ),
              ],
            ),
          ),
          AnimatedSize(
            duration: ThemeLgr.dureeMoyenne,
            curve: ThemeLgr.ressortDoux,
            child: _ouverte ? _detail(theme, m, couleur) : const SizedBox(width: double.infinity),
          ),
        ],
      ),
    );
  }

  Widget _detail(ThemeData theme, MatiereReleve m, Color couleur) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 4, 14, 14),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: theme.colorScheme.outline)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 10),

          // Situe l'élève dans sa classe. C'est cette mise en perspective qui
          // répond à la question du parent — « est-ce que ça va ? » — bien
          // mieux que la note seule.
          if (m.moyenne != null && (m.noteMin != null || m.noteMax != null)) ...[
            ReglageClasse(
              eleve: m.moyenne!,
              classe: m.moyenneClasse,
              mini: m.noteMin,
              maxi: m.noteMax,
              couleur: context.moyenne(m.moyenne),
            ),
            const SizedBox(height: 16),
          ],

          if (m.enseignant != null) ...[
            Row(
              children: [
                const Icon(Icons.person_outline_rounded, size: 14, color: Couleurs.encreLegere),
                const SizedBox(width: 7),
                Text(m.enseignant!, style: theme.textTheme.bodySmall),
              ],
            ),
            const SizedBox(height: 12),
          ],
          ...m.notes.map(
            (n) => Padding(
              padding: const EdgeInsets.only(bottom: 9),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          n.titre,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.textTheme.bodyLarge?.color,
                            fontSize: 13.5,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          '${n.typeLisible} · ${dateCourte(n.date)}',
                          style: theme.textTheme.bodySmall?.copyWith(fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    n.valeur == null
                        ? (n.statut == 'ABSENT' ? 'Abs.' : '—')
                        : '${virgule(n.valeur!, n.valeur! % 1 == 0 ? 0 : 2)}/${virgule(n.bareme, 0)}',
                    style: ThemeLgr.nombre(
                      theme.textTheme.bodyMedium,
                    ).copyWith(fontWeight: FontWeight.w600, color: context.moyenne(n.surVingt)),
                  ),
                ],
              ),
            ),
          ),
          if (m.appreciation != null) ...[
            const SizedBox(height: 4),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(11),
              decoration: BoxDecoration(
                color: couleur.withValues(alpha: 0.07),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                m.appreciation!,
                style: theme.textTheme.bodySmall?.copyWith(
                  fontStyle: FontStyle.italic,
                  height: 1.45,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Appreciation extends StatelessWidget {
  const _Appreciation({required this.texte});

  final String texte;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return CarteLgr(
      couleurFond: context.etat(Couleurs.primaire).withValues(alpha: 0.04),
      bordure: context.etat(Couleurs.primaire).withValues(alpha: 0.2),
      enfant: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.format_quote_rounded, size: 17, color: context.etat(Couleurs.primaire)),
              const SizedBox(width: 8),
              Text(
                'Appréciation du conseil de classe',
                style: theme.textTheme.titleSmall?.copyWith(color: context.etat(Couleurs.primaire)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(texte, style: theme.textTheme.bodyMedium?.copyWith(height: 1.55)),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// États sans bulletin
// ---------------------------------------------------------------------------

class _ReleveEnAttente extends StatelessWidget {
  const _ReleveEnAttente({required this.releve});

  final Releve releve;

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.6,
          child: EtatVide(
            icone: Icons.hourglass_empty_rounded,
            titre: 'Résultats en préparation',
            explication:
                'Le bulletin du ${releve.periode.toLowerCase()} n\'a pas encore été publié '
                "par l'école. Vous serez prévenu dès qu'il sera disponible.",
          ),
        ),
      ],
    );
  }
}

class _AucunePeriode extends StatelessWidget {
  const _AucunePeriode();

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.6,
          child: const EtatVide(
            icone: Icons.event_note_outlined,
            titre: 'Année non commencée',
            explication:
                "Aucune période de notation n'est encore ouverte pour cette année scolaire.",
          ),
        ),
      ],
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
            titre: 'Résultats indisponibles',
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
