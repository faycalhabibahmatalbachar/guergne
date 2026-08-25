import 'package:flutter/material.dart';

import '../design/couleurs.dart';
import '../design/illustration_ecole.dart';
import '../design/theme.dart';

/// Séquence de bienvenue, montrée UNE fois avant l'activation.
///
/// DEUX ÉCRANS, PAS TROIS
/// -----------------------
/// Chaque écran d'accueil est un écran entre le parent et ce qu'il est venu
/// voir. Trois promesses successives donnent l'impression d'une brochure ;
/// deux suffisent à dire ce que fait l'application et ce qu'elle ne fait pas.
/// Le bouton « Passer » est présent dès la première image, en toutes lettres —
/// le cacher pour forcer la lecture est une façon de mentir sur le prix.
///
/// CE QUI EST PROMIS EST CE QUI EXISTE
/// ------------------------------------
/// Pas de « Devoirs », pas de « Messagerie », pas de « Paiement en ligne » :
/// aucun des trois n'est branché. Une promesse d'accueil non tenue au premier
/// lancement coûte plus cher qu'une fonctionnalité absente, parce qu'elle
/// apprend au parent que l'application raconte.
class EcranBienvenue extends StatefulWidget {
  const EcranBienvenue({super.key, required this.onTermine});

  /// Appelé quand le parent passe ou termine. À charge de l'appelant de
  /// mémoriser que la séquence a été vue — elle ne doit jamais réapparaître.
  final VoidCallback onTermine;

  @override
  State<EcranBienvenue> createState() => _EtatBienvenue();
}

class _EtatBienvenue extends State<EcranBienvenue> with SingleTickerProviderStateMixin {
  final _pages = PageController();
  late final AnimationController _entree;
  int _index = 0;

  @override
  void initState() {
    super.initState();
    _entree = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))
      ..forward();
  }

  @override
  void dispose() {
    _pages.dispose();
    _entree.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dernier = _index == 1;

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      body: SafeArea(
        child: Column(
          children: [
            // --- Barre haute : blason discret à gauche, sortie à droite ---
            Padding(
              padding: const EdgeInsets.fromLTRB(ThemeLgr.espace, 8, 8, 0),
              child: Row(
                children: [
                  const _BlasonMinuscule(),
                  const SizedBox(width: 10),
                  Text(
                    'Lycée Guergné La Renaissance',
                    style: theme.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: widget.onTermine,
                    child: const Text('Passer'),
                  ),
                ],
              ),
            ),

            Expanded(
              child: PageView(
                controller: _pages,
                onPageChanged: (i) => setState(() => _index = i),
                children: [
                  _Page(
                    illustration: IllustrationEcole(animation: _entree),
                    titre: 'La scolarité de votre enfant,\nsans passer par le portail',
                    corps:
                        'Ses notes, ses absences, sa conduite et sa situation de '
                        'scolarité — mises à jour par l’établissement, consultables '
                        'à toute heure.',
                    points: const [
                      ('Moyennes et rang, matière par matière', Icons.school_outlined),
                      ('Absences et retards du trimestre', Icons.event_busy_outlined),
                      ('Bulletin en PDF dès qu’il est publié', Icons.picture_as_pdf_outlined),
                    ],
                  ),
                  const _Page(
                    illustration: _IllustrationAlerte(),
                    titre: 'Prévenu le jour même,\npas au conseil de classe',
                    corps:
                        'Une absence non justifiée, un incident, une échéance qui '
                        'approche : l’école vous écrit directement. Par notification '
                        'si l’application est installée, par SMS sinon.',
                    points: [
                      ('Absences signalées dans la journée', Icons.notifications_active_outlined),
                      ('Rappels d’échéance avant le retard', Icons.account_balance_wallet_outlined),
                      ('Annonces de l’établissement', Icons.campaign_outlined),
                    ],
                  ),
                ],
              ),
            ),

            // --- Pied : progression et action ---
            Padding(
              padding: const EdgeInsets.fromLTRB(
                ThemeLgr.espace,
                ThemeLgr.espace,
                ThemeLgr.espace,
                ThemeLgr.espace,
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(2, (i) {
                      final actif = i == _index;
                      return AnimatedContainer(
                        duration: ThemeLgr.dureeCourte,
                        curve: ThemeLgr.ressortDoux,
                        margin: const EdgeInsets.symmetric(horizontal: 4),
                        width: actif ? 22 : 7,
                        height: 7,
                        decoration: BoxDecoration(
                          color: actif ? Couleurs.primaire : theme.dividerColor,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      );
                    }),
                  ),
                  const SizedBox(height: ThemeLgr.espace),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: dernier
                          ? widget.onTermine
                          : () => _pages.nextPage(
                              duration: ThemeLgr.dureeMoyenne,
                              curve: ThemeLgr.ressortDoux,
                            ),
                      child: Text(dernier ? 'Activer mon espace' : 'Continuer'),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    // Le parent doit savoir AVANT d'appuyer qu'il lui faudra
                    // son téléphone. L'apprendre à l'écran suivant, c'est
                    // abandonner l'activation pour aller le chercher.
                    'L’activation se fait avec le numéro que vous avez donné à l’école.',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodySmall?.copyWith(color: Couleurs.encreLegere),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Page extends StatelessWidget {
  const _Page({
    required this.illustration,
    required this.titre,
    required this.corps,
    required this.points,
  });

  final Widget illustration;
  final String titre;
  final String corps;
  final List<(String, IconData)> points;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: ThemeLgr.espace),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(ThemeLgr.rayon + 6),
            child: illustration,
          ),
          const SizedBox(height: ThemeLgr.espace + 8),
          Text(
            titre,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w700,
              height: 1.2,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            corps,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: Couleurs.encreDouce,
              height: 1.5,
            ),
          ),
          const SizedBox(height: ThemeLgr.espace),
          // Trois lignes concrètes plutôt qu'un paragraphe de plus : ce sont
          // elles qu'on relit en diagonale, et elles nomment des choses qui
          // existent réellement dans l'application.
          ...points.map(
            (p) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 30,
                    height: 30,
                    decoration: BoxDecoration(
                      color: Couleurs.primaire.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(ThemeLgr.rayonPetit - 2),
                    ),
                    child: Icon(p.$2, size: 16, color: Couleurs.primaire),
                  ),
                  const SizedBox(width: 11),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(top: 5),
                      child: Text(p.$1, style: theme.textTheme.bodyMedium),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: ThemeLgr.espace),
        ],
      ),
    );
  }
}

/// Blason réduit, dessiné plutôt que chargé.
///
/// À 26 pixels, le PNG du blason devient une tache : la couronne de laurier
/// compte des dizaines de feuilles qui se confondent. Un cercle vert et le
/// monogramme se lisent encore.
class _BlasonMinuscule extends StatelessWidget {
  const _BlasonMinuscule();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 26,
      height: 26,
      decoration: BoxDecoration(
        color: Couleurs.primaire,
        borderRadius: BorderRadius.circular(8),
      ),
      alignment: Alignment.center,
      child: const Text(
        'GR',
        style: TextStyle(
          color: Colors.white,
          fontSize: 10,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.2,
        ),
      ),
    );
  }
}

/// Deuxième illustration : le téléphone qui reçoit, plutôt que l'école.
///
/// Reprendre la même image sur les deux pages ferait douter que la page ait
/// tourné. Celle-ci est volontairement plus schématique : elle représente une
/// notification, pas un lieu.
class _IllustrationAlerte extends StatelessWidget {
  const _IllustrationAlerte();

  @override
  Widget build(BuildContext context) {
    final sombre = Theme.of(context).brightness == Brightness.dark;

    return AspectRatio(
      aspectRatio: 4 / 3,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: sombre
                ? [const Color(0xFF152444), const Color(0xFF0D1830)]
                : [const Color(0xFFEAF3EB), const Color(0xFFF6F4EC)],
          ),
        ),
        child: Center(
          child: FractionallySizedBox(
            widthFactor: 0.62,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _Notification(
                  icone: Icons.event_busy_outlined,
                  teinte: Couleurs.danger,
                  titre: 'Absence non justifiée',
                  corps: 'Tidjani, mathématiques · 10 h',
                  decalage: -0.06,
                ),
                const SizedBox(height: 9),
                _Notification(
                  icone: Icons.account_balance_wallet_outlined,
                  teinte: Couleurs.alerte,
                  titre: '1ʳᵉ tranche à régler',
                  corps: 'Échéance le 15 octobre',
                  decalage: 0.05,
                ),
                const SizedBox(height: 9),
                _Notification(
                  icone: Icons.campaign_outlined,
                  teinte: Couleurs.primaire,
                  titre: 'Réunion des parents',
                  corps: 'Samedi 22 novembre, 9 h',
                  decalage: -0.03,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Notification extends StatelessWidget {
  const _Notification({
    required this.icone,
    required this.teinte,
    required this.titre,
    required this.corps,
    required this.decalage,
  });

  final IconData icone;
  final Color teinte;
  final String titre;
  final String corps;

  /// Léger décalage horizontal : trois cartes parfaitement alignées lisent
  /// comme une liste ; décalées, comme des messages arrivés séparément.
  final double decalage;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return FractionalTranslation(
      translation: Offset(decalage, 0),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 8),
        decoration: BoxDecoration(
          color: theme.cardColor,
          borderRadius: BorderRadius.circular(ThemeLgr.rayonPetit),
          border: Border.all(color: theme.dividerColor),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.06),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 24,
              height: 24,
              decoration: BoxDecoration(
                color: teinte.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(7),
              ),
              child: Icon(icone, size: 13, color: teinte),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    titre,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  Text(
                    corps,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.labelSmall?.copyWith(color: Couleurs.encreLegere),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
