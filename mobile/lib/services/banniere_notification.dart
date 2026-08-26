import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';

import '../design/couleurs.dart';
import '../design/theme.dart';

/// Bandeau des notifications reçues application ouverte.
///
/// Android n'affiche rien de lui-même quand l'application est au premier plan :
/// sans ce bandeau, une absence signalée pendant que le parent consulte ses
/// notes n'apparaîtrait nulle part.
///
/// IL SURVOLE, IL NE POUSSE PAS
/// -----------------------------
/// La première version vivait dans la colonne de la coque : son arrivée
/// décalait l'écran entier vers le bas, en-tête compris, et son départ le
/// faisait remonter. Un contenu qui saute pendant qu'on le lit est le défaut le
/// plus désagréable qu'une application puisse produire — on perd sa ligne, et
/// on peut appuyer sur ce qui vient de glisser sous le doigt.
///
/// IL S'EFFACE SEUL
/// -----------------
/// Six secondes, puis il repart. Un bandeau qui attend qu'on le ferme finit par
/// être contourné du regard, et la notification suivante s'empile derrière.
/// Le compte à rebours s'interrompt dès qu'un doigt le touche.
///
/// IL MÈNE QUELQUE PART
/// ---------------------
/// Taper dessus ouvre l'écran concerné. L'ancienne version passait un
/// `surOuvrir` vide : le bandeau annonçait une absence et ne permettait pas
/// d'aller la voir.
class BanniereNotification extends StatefulWidget {
  const BanniereNotification({
    super.key,
    required this.message,
    required this.surFermer,
    required this.surOuvrir,
  });

  final RemoteMessage message;
  final VoidCallback surFermer;
  final VoidCallback surOuvrir;

  @override
  State<BanniereNotification> createState() => _EtatBanniere();
}

class _EtatBanniere extends State<BanniereNotification>
    with SingleTickerProviderStateMixin {
  static const _duree = Duration(seconds: 6);

  late final AnimationController _entree;
  Timer? _minuteur;

  @override
  void initState() {
    super.initState();
    _entree = AnimationController(vsync: this, duration: ThemeLgr.dureeMoyenne)..forward();
    _armer();
  }

  @override
  void didUpdateWidget(covariant BanniereNotification ancien) {
    super.didUpdateWidget(ancien);
    // Une seconde notification pendant que la première est encore affichée
    // relance l'entrée et le compte à rebours : sans cela, elle hériterait du
    // temps restant de la précédente et pourrait disparaître aussitôt.
    if (ancien.message.messageId != widget.message.messageId) {
      _entree.forward(from: 0);
      _armer();
    }
  }

  void _armer() {
    _minuteur?.cancel();
    _minuteur = Timer(_duree, _partir);
  }

  Future<void> _partir() async {
    _minuteur?.cancel();
    if (!mounted) return;
    await _entree.reverse();
    if (mounted) widget.surFermer();
  }

  @override
  void dispose() {
    _minuteur?.cancel();
    _entree.dispose();
    super.dispose();
  }

  /// Teinte d'accent, déduite du type porté par la notification.
  ///
  /// Le serveur envoie déjà `type` dans les données du message — ABSENCE,
  /// SANCTION, ECHEANCE_PAIEMENT… Une absence non justifiée et une annonce de
  /// réunion n'appellent pas la même réaction, et les afficher à l'identique
  /// apprend au parent à toutes les survoler.
  Color _accent(BuildContext context) {
    final type = widget.message.data['type']?.toString() ?? '';
    return switch (type) {
      'ABSENCE' || 'SANCTION' || 'INCIDENT' => context.etat(Couleurs.danger),
      'RETARD' || 'ECHEANCE_PAIEMENT' || 'CHANGEMENT_STATUT' => context.etat(Couleurs.alerte),
      _ => context.etat(Couleurs.primaire),
    };
  }

  IconData get _icone {
    final type = widget.message.data['type']?.toString() ?? '';
    return switch (type) {
      'ABSENCE' => Icons.event_busy_rounded,
      'RETARD' => Icons.schedule_rounded,
      'SANCTION' || 'INCIDENT' => Icons.report_problem_rounded,
      'ECHEANCE_PAIEMENT' || 'PAIEMENT_RECU' => Icons.account_balance_wallet_rounded,
      'NOTE_PUBLIEE' || 'BULLETIN_PUBLIE' => Icons.school_rounded,
      _ => Icons.campaign_rounded,
    };
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = _accent(context);
    final titre = widget.message.notification?.title ?? 'Nouvelle information';
    final corps = widget.message.notification?.body ?? '';

    final glissement = Tween<Offset>(
      begin: const Offset(0, -1.15),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _entree, curve: ThemeLgr.ressortDoux));

    return SlideTransition(
      position: glissement,
      child: FadeTransition(
        opacity: _entree,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          // Vers le HAUT pour écarter : c'est le geste que le système Android
          // emploie pour ses propres notifications, et le seul que le parent
          // ait déjà appris.
          child: Dismissible(
            key: ValueKey(widget.message.messageId ?? titre),
            direction: DismissDirection.up,
            onDismissed: (_) => widget.surFermer(),
            child: Material(
              // Surface de carte et non aplat de couleur : le bandeau se posait
              // en vert vif sur l'en-tête vert de l'accueil, et les deux se
              // confondaient. Une carte claire se détache de tout fond.
              color: theme.cardColor,
              elevation: 8,
              shadowColor: Colors.black.withValues(alpha: 0.35),
              borderRadius: BorderRadius.circular(ThemeLgr.rayon),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: () {
                  _minuteur?.cancel();
                  widget.surOuvrir();
                  widget.surFermer();
                },
                child: Row(
                  children: [
                    // Bande de sévérité, comme sur les cartes de l'accueil :
                    // même code, appris une fois.
                    Container(width: 4, height: 62, color: accent),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(12, 12, 4, 12),
                      child: Icon(_icone, color: accent, size: 22),
                    ),
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              titre,
                              style: theme.textTheme.titleSmall,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            if (corps.isNotEmpty) ...[
                              const SizedBox(height: 2),
                              Text(
                                corps,
                                style: theme.textTheme.bodySmall?.copyWith(height: 1.35),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: _partir,
                      icon: const Icon(Icons.close_rounded, size: 19),
                      color: Couleurs.encreLegere,
                      tooltip: 'Fermer',
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
