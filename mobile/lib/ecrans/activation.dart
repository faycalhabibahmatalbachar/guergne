import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../design/couleurs.dart';
import '../design/theme.dart';
import '../etat/fournisseurs.dart';
import '../services/api.dart';

/// Écran d'activation : numéro de téléphone, puis code reçu par SMS.
///
/// Pas de mot de passe, et c'est un choix : un parent qui consulte les notes
/// trois fois par trimestre aura oublié son mot de passe à chaque fois, et
/// chaque oubli se termine par un appel au secrétariat. Le SMS supprime ce
/// coût — le téléphone EST l'identité.
class EcranActivation extends ConsumerStatefulWidget {
  const EcranActivation({super.key});

  @override
  ConsumerState<EcranActivation> createState() => _EtatActivation();
}

enum _Etape { telephone, code }

class _EtatActivation extends ConsumerState<EcranActivation> {
  final _telephone = TextEditingController();
  final _code = TextEditingController();
  final _focusCode = FocusNode();

  _Etape _etape = _Etape.telephone;
  bool _occupe = false;
  String? _erreur;

  /// Compte à rebours avant de pouvoir redemander un code.
  int _attente = 0;
  Timer? _minuteur;

  @override
  void dispose() {
    _minuteur?.cancel();
    _telephone.dispose();
    _code.dispose();
    _focusCode.dispose();
    super.dispose();
  }

  void _lancerAttente() {
    setState(() => _attente = 45);
    _minuteur?.cancel();
    _minuteur = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() => _attente -= 1);
      if (_attente <= 0) t.cancel();
    });
  }

  Future<void> _demanderCode() async {
    final numero = _telephone.text.trim();
    if (numero.replaceAll(RegExp(r'\D'), '').length < 8) {
      setState(() => _erreur = 'Entrez votre numéro à 8 chiffres.');
      return;
    }

    setState(() {
      _occupe = true;
      _erreur = null;
    });

    try {
      await ref.read(sessionProvider.notifier).demanderCode(numero);
      if (!mounted) return;
      setState(() => _etape = _Etape.code);
      _lancerAttente();
      // Le clavier s'ouvre sur le champ code : sans cela le parent doit
      // viser un champ après avoir lu son SMS, geste inutile.
      _focusCode.requestFocus();
    } on ErreurApi catch (erreur) {
      if (mounted) setState(() => _erreur = erreur.message);
    } finally {
      if (mounted) setState(() => _occupe = false);
    }
  }

  Future<void> _valider() async {
    final code = _code.text.replaceAll(RegExp(r'\D'), '');
    if (code.length != 6) {
      setState(() => _erreur = 'Le code comporte 6 chiffres.');
      return;
    }

    setState(() {
      _occupe = true;
      _erreur = null;
    });

    try {
      await ref
          .read(sessionProvider.notifier)
          .connecter(telephone: _telephone.text.trim(), code: code);
      // La navigation est pilotée par l'état de session : rien à faire ici.
    } on ErreurApi catch (erreur) {
      if (!mounted) return;
      setState(() {
        _erreur = erreur.message;
        // Code refusé : on vide le champ, sinon le parent corrige un chiffre
        // dans un code déjà entièrement faux.
        if (erreur.code == 'code_invalide') _code.clear();
        if (erreur.code == 'code_expire') _etape = _Etape.telephone;
      });
    } finally {
      if (mounted) setState(() => _occupe = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final motif = ref.watch(sessionProvider).motif;

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: Couleurs.gradientAccueil),
        child: SafeArea(
          child: Column(
            children: [
              Expanded(flex: 2, child: _enTete(context)),
              Expanded(
                flex: 3,
                child: Container(
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.surface,
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
                  ),
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
                    child: AnimatedSize(
                      duration: ThemeLgr.dureeMoyenne,
                      curve: ThemeLgr.ressortDoux,
                      alignment: Alignment.topCenter,
                      child: _etape == _Etape.telephone
                          ? _formulaireTelephone(theme, motif)
                          : _formulaireCode(theme),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _enTete(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 84,
              height: 84,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.16),
                borderRadius: BorderRadius.circular(28),
                border: Border.all(color: Colors.white.withValues(alpha: 0.28), width: 1.5),
              ),
              child: const Icon(Icons.school_rounded, size: 40, color: Colors.white),
            ),
            const SizedBox(height: 22),
            Text(
              'Lycée Guergné',
              style: ThemeLgr.inter(
                fontSize: 27,
                fontWeight: FontWeight.w700,
                color: Colors.white,
                letterSpacing: -0.6,
                height: 1.1,
              ),
              textAlign: TextAlign.center,
            ),
            Text(
              'La Renaissance',
              style: ThemeLgr.inter(
                fontSize: 27,
                fontWeight: FontWeight.w700,
                color: Couleurs.accentClair,
                letterSpacing: -0.6,
                height: 1.15,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            Text(
              'Espace des parents',
              style: ThemeLgr.inter(
                fontSize: 14.5,
                fontWeight: FontWeight.w500,
                color: Colors.white.withValues(alpha: 0.82),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _formulaireTelephone(ThemeData theme, String? motif) {
    return Column(
      key: const ValueKey('telephone'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Bienvenue', style: theme.textTheme.headlineSmall),
        const SizedBox(height: 6),
        Text(
          motif ??
              "Entrez le numéro que vous avez communiqué à l'école. "
                  'Nous vous enverrons un code par SMS.',
          style: theme.textTheme.bodyMedium,
        ),
        const SizedBox(height: 24),
        TextField(
          controller: _telephone,
          keyboardType: TextInputType.phone,
          autofillHints: const [AutofillHints.telephoneNumber],
          style: ThemeLgr.nombre(theme.textTheme.titleMedium).copyWith(letterSpacing: 0.6),
          decoration: InputDecoration(
            labelText: 'Numéro de téléphone',
            hintText: '66 00 00 00',
            // Indicatif en texte, sans drapeau emoji : beaucoup d'appareils
            // Android d'entrée de gamme n'embarquent pas les drapeaux et
            // affichent un rectangle vide à la place.
            prefixIcon: Padding(
              padding: const EdgeInsets.only(left: 16, right: 10),
              child: Text(
                '+235',
                style: ThemeLgr.nombre(
                  Theme.of(context).textTheme.titleMedium,
                ).copyWith(color: Couleurs.encreDouce, height: 3.0),
              ),
            ),
            prefixIconConstraints: const BoxConstraints(minWidth: 0),
          ),
          onSubmitted: (_) => _demanderCode(),
        ),
        if (_erreur != null) ...[const SizedBox(height: 14), _messageErreur(_erreur!)],
        const SizedBox(height: 22),
        FilledButton(
          onPressed: _occupe ? null : _demanderCode,
          child: _occupe ? const _Rouet() : const Text('Recevoir mon code'),
        ),
        const SizedBox(height: 16),
        _mentionAide(theme),
      ],
    );
  }

  Widget _formulaireCode(ThemeData theme) {
    return Column(
      key: const ValueKey('code'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            IconButton(
              onPressed: _occupe
                  ? null
                  : () => setState(() {
                      _etape = _Etape.telephone;
                      _erreur = null;
                    }),
              icon: const Icon(Icons.arrow_back_rounded),
              tooltip: 'Modifier le numéro',
              style: IconButton.styleFrom(padding: EdgeInsets.zero),
            ),
            const SizedBox(width: 4),
            Expanded(child: Text('Votre code', style: theme.textTheme.headlineSmall)),
          ],
        ),
        const SizedBox(height: 6),
        Text.rich(
          TextSpan(
            style: theme.textTheme.bodyMedium,
            children: [
              const TextSpan(text: 'Code envoyé au '),
              TextSpan(
                text: _telephone.text.trim(),
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              const TextSpan(text: '. Il est valable 7 jours.'),
            ],
          ),
        ),
        const SizedBox(height: 24),
        TextField(
          controller: _code,
          focusNode: _focusCode,
          keyboardType: TextInputType.number,
          textAlign: TextAlign.center,
          maxLength: 6,
          autofillHints: const [AutofillHints.oneTimeCode],
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          style: ThemeLgr.nombre(theme.textTheme.headlineMedium).copyWith(letterSpacing: 12),
          decoration: const InputDecoration(hintText: '••••••', counterText: ''),
          // Validation automatique au 6ᵉ chiffre : appuyer sur un bouton après
          // avoir tapé le code exact est un geste que rien ne justifie.
          onChanged: (v) {
            if (v.length == 6 && !_occupe) _valider();
          },
        ),
        if (_erreur != null) ...[const SizedBox(height: 6), _messageErreur(_erreur!)],
        const SizedBox(height: 18),
        FilledButton(
          onPressed: _occupe ? null : _valider,
          child: _occupe ? const _Rouet() : const Text('Se connecter'),
        ),
        const SizedBox(height: 10),
        TextButton(
          onPressed: _attente > 0 || _occupe ? null : _demanderCode,
          child: Text(
            _attente > 0 ? 'Renvoyer le code dans $_attente s' : 'Je n\'ai rien reçu, renvoyer',
          ),
        ),
      ],
    );
  }

  Widget _messageErreur(String message) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Couleurs.dangerFond,
        borderRadius: BorderRadius.circular(ThemeLgr.rayonPetit),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline_rounded, size: 18, color: Couleurs.danger),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(fontSize: 13, height: 1.4, color: Couleurs.danger),
            ),
          ),
        ],
      ),
    );
  }

  Widget _mentionAide(ThemeData theme) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.info_outline_rounded, size: 15, color: theme.textTheme.bodySmall?.color),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            "Votre numéro doit être celui enregistré au secrétariat. "
            "S'il a changé, signalez-le à l'école.",
            style: theme.textTheme.bodySmall,
          ),
        ),
      ],
    );
  }
}

class _Rouet extends StatelessWidget {
  const _Rouet();

  @override
  Widget build(BuildContext context) => const SizedBox(
    width: 20,
    height: 20,
    child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
  );
}
