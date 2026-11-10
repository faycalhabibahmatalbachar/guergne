import 'package:flutter/material.dart';

import '../couleurs.dart';
import '../theme.dart';

/// Chemin de la photographie officielle du bâtiment.
const imageBatimentEcole = 'assets/images/lgr_school_building.jpg';

/// Grande bannière institutionnelle : la façade du lycée, et l'enfant suivi.
///
/// C'est l'élément central du Design 3. Elle répond à la première question du
/// parent — « de quel enfant suis-je en train de lire la situation ? » — sur
/// l'image de SON école, et non sur un dégradé anonyme.
///
/// LA HAUTEUR EST UN PLANCHER, PAS UNE CONTRAINTE
/// ------------------------------------------------
/// Une bannière à hauteur fixe déborde dès que le téléphone est réglé en
/// « grandes polices » : le nom de l'enfant passe sur deux lignes et pousse le
/// reste hors du cadre. Ici la photo s'étend sous le contenu (`Positioned.fill`)
/// et c'est le contenu qui fixe la hauteur finale — jamais moins que
/// [hauteurMinimale], toujours assez pour tout afficher.
///
/// LISIBILITÉ
/// ----------
/// Un voile vert profond monte du bas de l'image : le texte blanc s'y lit à
/// plus de 7:1 quelle que soit la zone de la photo qui passe derrière — ciel
/// clair ou mur ocre. Le haut reste plus transparent pour que la façade se
/// reconnaisse.
class BanniereEcole extends StatelessWidget {
  const BanniereEcole({
    super.key,
    required this.salutation,
    required this.nomEleve,
    required this.classe,
    required this.matricule,
    this.surAppui,
  });

  /// « Bonjour, Abdoulaye » — qui est connecté.
  final String salutation;

  /// Nom complet de l'enfant sélectionné.
  final String nomEleve;
  final String classe;
  final String matricule;

  /// Ouvre le sélecteur d'enfant. La bannière nomme l'enfant : c'est là que
  /// le parent cherchera d'instinct à en changer.
  final VoidCallback? surAppui;

  @override
  Widget build(BuildContext context) {
    final largeur = MediaQuery.sizeOf(context).width;
    // Proportion de carte postale sur téléphone, plafonnée sur tablette où
    // une bannière au ratio conservé occuperait tout l'écran.
    final hauteurMinimale = (largeur * 0.60).clamp(210.0, 300.0);
    final rayon = BorderRadius.circular(24);

    return Semantics(
      container: true,
      label: '$salutation. Élève suivi : $nomEleve, classe $classe, matricule $matricule',
      excludeSemantics: true,
      button: surAppui != null,
      onTap: surAppui,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: rayon,
          boxShadow: [
            BoxShadow(
              color: Couleurs.primaireSombre.withValues(alpha: 0.10),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: rayon,
          child: Material(
            color: Couleurs.primaireSombre,
            child: InkWell(
              onTap: surAppui,
              child: Stack(
                children: [
                  Positioned.fill(
                    child: Image.asset(
                      imageBatimentEcole,
                      fit: BoxFit.cover,
                      // Cadré sur la façade et les arcades, pas sur le ciel.
                      alignment: const Alignment(-0.1, 0.25),
                      filterQuality: FilterQuality.medium,
                      // Pendant le décodage, l'aplat vert du `Material` tient
                      // lieu d'image : le texte reste lisible dès la première
                      // image, sans éclair blanc.
                      gaplessPlayback: true,
                      errorBuilder: (_, _, _) => const DecoratedBox(
                        decoration: BoxDecoration(gradient: Couleurs.gradientAccueil),
                      ),
                    ),
                  ),
                  const Positioned.fill(child: _Voile()),
                  // Seul enfant NON positionné : c'est lui qui donne sa taille
                  // à la pile. L'identité est calée en bas ; la marge haute
                  // réserve la place de la signature, posée par-dessus.
                  ConstrainedBox(
                    constraints: BoxConstraints(
                      minHeight: hauteurMinimale,
                      minWidth: double.infinity,
                    ),
                    child: Align(
                      alignment: Alignment.bottomLeft,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(20, 68, 20, 20),
                        child: _Identite(
                          salutation: salutation,
                          nomEleve: nomEleve,
                          classe: classe,
                          matricule: matricule,
                          changeable: surAppui != null,
                        ),
                      ),
                    ),
                  ),
                  const Positioned(top: 18, left: 20, right: 20, child: _Signature()),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Voile extends StatelessWidget {
  const _Voile();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          stops: const [0.0, 0.30, 0.62, 1.0],
          colors: [
            // Un léger assombrissement en haut porte la signature dorée, que
            // le ciel clair de la photo aurait rendue illisible.
            Colors.black.withValues(alpha: 0.32),
            Colors.black.withValues(alpha: 0.0),
            Couleurs.primaireSombre.withValues(alpha: 0.62),
            Couleurs.primaireSombre.withValues(alpha: 0.94),
          ],
        ),
      ),
    );
  }
}

/// « ÉDUCATION • EXCELLENCE • AVENIR », en or, sur le haut de la photo.
class _Signature extends StatelessWidget {
  const _Signature();

  @override
  Widget build(BuildContext context) {
    final style = ThemeLgr.inter(
      fontSize: 10,
      fontWeight: FontWeight.w700,
      letterSpacing: 1.6,
      color: Colors.white,
    );
    final point = Text('  •  ', style: style.copyWith(color: Couleurs.or));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('ÉDUCATION', style: style),
              point,
              Text('EXCELLENCE', style: style),
              point,
              Text('AVENIR', style: style),
            ],
          ),
        ),
        const SizedBox(height: 7),
        Container(
          width: 36,
          height: 2,
          decoration: BoxDecoration(color: Couleurs.or, borderRadius: BorderRadius.circular(2)),
        ),
      ],
    );
  }
}

class _Identite extends StatelessWidget {
  const _Identite({
    required this.salutation,
    required this.nomEleve,
    required this.classe,
    required this.matricule,
    required this.changeable,
  });

  final String salutation;
  final String nomEleve;
  final String classe;
  final String matricule;
  final bool changeable;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          '$salutation,',
          style: ThemeLgr.inter(
            fontSize: 14,
            fontWeight: FontWeight.w500,
            color: Colors.white.withValues(alpha: 0.88),
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        const SizedBox(height: 4),
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: Text(
                nomEleve,
                style:
                    ThemeLgr.inter(
                      fontSize: 25,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.5,
                      height: 1.15,
                      color: Colors.white,
                    ).copyWith(
                      shadows: [Shadow(color: Colors.black.withValues(alpha: 0.25), blurRadius: 8)],
                    ),
                // Deux lignes, pas une : un nom tchadien complet —
                // « Tidjani ALLAHOUNDOUM » — dépasse souvent la largeur, et
                // l'ellipse couperait précisément le nom de famille.
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (changeable)
              Padding(
                padding: const EdgeInsets.only(left: 8, bottom: 2),
                child: Icon(
                  Icons.unfold_more_rounded,
                  size: 22,
                  color: Colors.white.withValues(alpha: 0.85),
                ),
              ),
          ],
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            _BadgeClasse(classe: classe),
            Text(
              matricule,
              style: ThemeLgr.inter(
                fontSize: 12.5,
                fontWeight: FontWeight.w500,
                letterSpacing: 0.3,
                color: Colors.white.withValues(alpha: 0.80),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Badge de classe, liseré d'or — la touche premium de la bannière.
class _BadgeClasse extends StatelessWidget {
  const _BadgeClasse({required this.classe});

  final String classe;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(9, 5, 12, 5),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Couleurs.or.withValues(alpha: 0.85), width: 1.2),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.school_rounded, size: 16, color: Couleurs.or),
          const SizedBox(width: 6),
          Text(
            classe,
            style: ThemeLgr.inter(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white),
          ),
        ],
      ),
    );
  }
}
