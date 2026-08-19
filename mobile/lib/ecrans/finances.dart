import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../design/composants.dart';
import '../design/couleurs.dart';
import '../design/squelettes.dart';
import '../design/theme.dart';
import '../etat/fournisseurs.dart';
import '../modeles/modeles.dart';
import '../outils/formats.dart';

/// Écran de scolarité.
///
/// **Lecture seule, et l'écran le dit.** Aucun bouton « Payer » : le paiement
/// mobile n'est pas intégré, et un bouton qui ouvrirait une page d'erreur
/// serait pire que son absence. On indique en clair où payer — c'est
/// l'information utile.
class EcranFinances extends ConsumerWidget {
  const EcranFinances({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final enfant = ref.watch(enfantCourantProvider);

    if (enfant == null) {
      return const Scaffold(
        body: EtatVide(
          icone: Icons.account_balance_wallet_outlined,
          titre: 'Aucun élève',
          explication: "Aucun enfant n'est rattaché à votre compte.",
        ),
      );
    }

    final finances = ref.watch(financesProvider(enfant.eleveId));

    return Scaffold(
      appBar: AppBar(title: const Text('Scolarité')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(financesProvider(enfant.eleveId)),
        child: finances.when(
          loading: () => const SqueletteListe(nombre: 5),
          error: (erreur, _) => _Erreur(
            message: erreur.toString(),
            surReessayer: () => ref.invalidate(financesProvider(enfant.eleveId)),
          ),
          data: (donnees) => _Contenu(donnees: donnees, enfant: enfant),
        ),
      ),
    );
  }
}

class _Contenu extends StatelessWidget {
  const _Contenu({required this.donnees, required this.enfant});

  final Donnees<SituationFinanciere> donnees;
  final Enfant enfant;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final s = donnees.valeur;

    if (s.echeances.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          if (donnees.depuisCache) BandeauHorsLigne(derniereMaj: donnees.date),
          SizedBox(
            height: MediaQuery.sizeOf(context).height * 0.65,
            child: EtatVide(
              icone: Icons.receipt_long_outlined,
              titre: 'Aucun frais enregistré',
              explication:
                  "Aucune échéance n'a encore été établie pour ${enfant.prenom} "
                  'sur cette année scolaire.',
            ),
          ),
        ],
      );
    }

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      children: [
        if (donnees.depuisCache) BandeauHorsLigne(derniereMaj: donnees.date),
        Padding(
          padding: const EdgeInsets.all(ThemeLgr.espace),
          child: _Synthese(situation: s),
        ),
        _Titre('Échéances'),
        ...s.echeances.asMap().entries.map(
          (e) => Padding(
            padding: const EdgeInsets.fromLTRB(ThemeLgr.espace, 0, ThemeLgr.espace, 10),
            child: ApparitionCascade(
              index: e.key,
              enfant: _LigneEcheance(echeance: e.value),
            ),
          ),
        ),
        if (s.paiements.isNotEmpty) ...[
          const SizedBox(height: 10),
          _Titre('Reçus'),
          ...s.paiements.map(
            (p) => Padding(
              padding: const EdgeInsets.fromLTRB(ThemeLgr.espace, 0, ThemeLgr.espace, 10),
              child: _LignePaiement(paiement: p),
            ),
          ),
        ],
        Padding(
          padding: const EdgeInsets.all(ThemeLgr.espace),
          child: CarteLgr(
            enfant: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline_rounded, size: 18, color: context.etat(Couleurs.info)),
                const SizedBox(width: 11),
                Expanded(
                  child: Text(
                    'Les règlements se font à la comptabilité de l\'école. '
                    'Un reçu numéroté vous est remis à chaque versement et apparaît ici.',
                    style: theme.textTheme.bodySmall?.copyWith(height: 1.5),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _Synthese extends StatelessWidget {
  const _Synthese({required this.situation});

  final SituationFinanciere situation;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final s = situation;
    final solde = s.resteDuFcfa <= 0;
    final couleur = solde ? context.etat(Couleurs.succes) : context.etat(Couleurs.primaire);

    return CarteLgr(
      rembourrage: const EdgeInsets.all(18),
      enfant: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      solde ? 'Scolarité soldée' : 'Reste à payer',
                      style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      solde ? 'Merci' : montant(s.resteDuFcfa),
                      style: ThemeLgr.nombre(
                        theme.textTheme.headlineMedium,
                      ).copyWith(color: couleur, fontSize: 28, height: 1.1),
                    ),
                  ],
                ),
              ),
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: couleur.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(15),
                ),
                child: Icon(
                  solde ? Icons.check_circle_rounded : Icons.account_balance_wallet_rounded,
                  size: 23,
                  color: couleur,
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: s.progression.clamp(0.0, 1.0),
              minHeight: 9,
              backgroundColor: theme.colorScheme.outline,
              valueColor: AlwaysStoppedAnimation(couleur),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _Chiffre(
                libelle: 'Payé',
                valeur: montant(s.totalPayeFcfa),
                couleur: context.etat(Couleurs.succes),
              ),
              if (s.totalExonereFcfa > 0)
                _Chiffre(
                  libelle: 'Exonéré',
                  valeur: montant(s.totalExonereFcfa),
                  couleur: context.etat(Couleurs.info),
                ),
              _Chiffre(
                libelle: 'Total dû',
                valeur: montant(s.totalDuFcfa),
                couleur: theme.textTheme.bodyLarge!.color!,
                aDroite: true,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Chiffre extends StatelessWidget {
  const _Chiffre({
    required this.libelle,
    required this.valeur,
    required this.couleur,
    this.aDroite = false,
  });

  final String libelle;
  final String valeur;
  final Color couleur;
  final bool aDroite;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: aDroite ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        Text(libelle, style: theme.textTheme.bodySmall?.copyWith(fontSize: 11)),
        const SizedBox(height: 2),
        Text(valeur, style: ThemeLgr.nombre(theme.textTheme.titleSmall).copyWith(color: couleur)),
      ],
    );
  }
}

class _LigneEcheance extends StatelessWidget {
  const _LigneEcheance({required this.echeance});

  final Echeance echeance;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final e = echeance;
    final jours = joursAvant(e.dateLimite);
    final enRetard = !e.soldee && jours != null && jours < 0;

    final (TonBadge ton, String etat) = e.soldee
        ? (TonBadge.succes, 'Réglée')
        : enRetard
        ? (TonBadge.danger, 'En retard')
        : e.montantPayeFcfa > 0
        ? (TonBadge.alerte, 'Partielle')
        : (TonBadge.info, 'À payer');

    return CarteLgr(
      rembourrage: const EdgeInsets.all(14),
      enfant: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(e.libelle, style: theme.textTheme.titleSmall),
                    const SizedBox(height: 3),
                    Text(
                      'Échéance : ${dateLongue(e.dateLimite)}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontSize: 11.5,
                        color: enRetard ? context.etat(Couleurs.danger) : null,
                        fontWeight: enRetard ? FontWeight.w600 : null,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    montant(e.montantDuFcfa),
                    style: ThemeLgr.nombre(theme.textTheme.titleSmall),
                  ),
                  const SizedBox(height: 5),
                  BadgeEtat(etat, ton: ton),
                ],
              ),
            ],
          ),
          // Le détail du partiel n'apparaît que s'il y a quelque chose à
          // détailler : sur une échéance soldée ou intacte, il ferait du bruit.
          if (!e.soldee && (e.montantPayeFcfa > 0 || e.montantExonereFcfa > 0)) ...[
            const SizedBox(height: 11),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Versé : ${montant(e.montantPayeFcfa)}'
                    '${e.montantExonereFcfa > 0 ? " · Exonéré : ${montant(e.montantExonereFcfa)}" : ""}',
                    style: theme.textTheme.bodySmall?.copyWith(fontSize: 11.5),
                  ),
                ),
                Text(
                  'Reste ${montant(e.resteFcfa)}',
                  style: ThemeLgr.nombre(
                    theme.textTheme.bodySmall,
                  ).copyWith(fontWeight: FontWeight.w700, color: context.etat(Couleurs.alerte)),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _LignePaiement extends StatelessWidget {
  const _LignePaiement({required this.paiement});

  final Paiement paiement;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final p = paiement;

    return CarteLgr(
      rembourrage: const EdgeInsets.all(13),
      enfant: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: context.etat(Couleurs.succes).withValues(alpha: 0.11),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(Icons.receipt_rounded, size: 17, color: context.etat(Couleurs.succes)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  p.libelle ?? 'Versement',
                  style: theme.textTheme.titleSmall?.copyWith(fontSize: 13.5),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  'Reçu ${p.numeroRecu} · ${p.modeLisible} · ${dateCourte(p.datePaiement)}',
                  style: theme.textTheme.bodySmall?.copyWith(fontSize: 11),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            montant(p.montantFcfa),
            style: ThemeLgr.nombre(
              theme.textTheme.titleSmall,
            ).copyWith(color: context.etat(Couleurs.succes)),
          ),
        ],
      ),
    );
  }
}

class _Titre extends StatelessWidget {
  const _Titre(this.texte);

  final String texte;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(ThemeLgr.espace, 4, ThemeLgr.espace, 12),
    child: Text(texte, style: Theme.of(context).textTheme.titleMedium),
  );
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
            titre: 'Scolarité indisponible',
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
