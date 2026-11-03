/**
 * Outils de pilotage, de pédagogie, de finances et d'annuaire.
 *
 * POURQUOI CES OUTILS EXISTENT
 * -----------------------------
 * L'agent ne savait parler que d'assiduité et de discipline, alors que la
 * plateforme expose déjà des indicateurs d'établissement, des moyennes par
 * classe, des effectifs, un état de recouvrement et un annuaire. Un directeur
 * qui demande « combien d'élèves cette année ? » recevait une clarification,
 * faute d'outil — pas faute de donnée.
 *
 * RÈGLE DE CE FICHIER
 * -------------------
 * Chaque outil correspond à une opération RÉELLEMENT exposée par
 * `web/src/server/agent/operations.ts`. Annoncer une capacité que la route ne
 * sert pas produit un 404 après que l'agent l'a promise — c'est exactement le
 * défaut qui a coûté le retrait de `controleSaisies`. Un test structurel le
 * vérifie à chaque exécution de la recette.
 */
import { READ } from "./guard.js";
import { avertissementHomonymes } from "./homonymes.js";
import { jour, listeRendue, nomComplet, val } from "./rendu.js";

const noErrs = () => ({});
const required = (v) => v !== undefined && v !== null && v !== "";

/** Nombre lisible, ou une mention franche quand la donnée manque. */
const nb = (v, suffixe = "") => (v === null || v === undefined ? "non calculé" : `${v}${suffixe}`);
const fcfa = (v) => (v === null || v === undefined ? "non calculé" : `${Number(v).toLocaleString("fr-FR")} FCFA`);

const ANNEE = "facultatif, identifiant d'annee scolaire (UUID) ; par defaut l'annee courante";
const PERIODE = "facultatif, identifiant de periode scolaire (UUID) ; par defaut toutes les periodes";
const CLASSE = "facultatif, identifiant de classe (UUID) ; par defaut toutes les classes";

export const PILOTAGE_TOOLS = [
  // --- Pilotage de l'établissement -----------------------------------------
  {
    name: "pilotage.indicateurs",
    module: "pilotage",
    description:
      "chiffres cles de l'etablissement : effectif total, nouveaux inscrits, nombre d'enseignants et de classes, presents et absents du jour, moyenne generale",
    permission: "statistique:lire",
    sensitivity: READ,
    action: "indicateursCles",
    parametres: { anneeId: ANNEE, periodeId: PERIODE },
    validate: noErrs,
    summarize: () => "Indicateurs cles de l'etablissement.",
    rendre: (d) => {
      if (!d || typeof d !== "object" || Array.isArray(d)) return null;
      return [
        "Indicateurs de l'etablissement :",
        `• ${nb(d.effectif)} eleve(s) inscrit(s), ${nb(d.classes)} classe(s), ${nb(d.enseignants)} enseignant(s)`,
        `• ${nb(d.nouveauxInscrits)} nouvelle(s) inscription(s), ${nb(d.reinscriptions)} reinscription(s)`,
        `• aujourd'hui : ${nb(d.absentsAujourdhui)} absent(s), ${nb(d.retardsAujourdhui)} retard(s)`,
        `• moyenne generale : ${nb(d.moyenneGenerale, "/20")}`,
        `• ${nb(d.suspendus)} suspendu(s), ${nb(d.exclus)} exclu(s), ${nb(d.transferes)} transfere(s)`,
      ].join("\n");
    },
  },
  {
    name: "pilotage.effectifs_par_niveau",
    module: "pilotage",
    description: "repartition des effectifs par niveau, avec le detail garcons / filles",
    permission: "statistique:lire",
    sensitivity: READ,
    action: "effectifsParNiveau",
    parametres: { anneeId: ANNEE },
    validate: noErrs,
    summarize: () => "Effectifs par niveau.",
    rendre: (l) => listeRendue(l, "Effectifs par niveau", (x) => `${val(x.niveau, "niveau inconnu")} (${val(x.cycle)}) — ${val(x.total, 0)} eleves : ${val(x.garcons, 0)} G / ${val(x.filles, 0)} F`),
  },
  {
    name: "pilotage.absences_par_mois",
    module: "pilotage",
    description: "evolution mensuelle des heures d'absence, justifiees et non justifiees",
    permission: "statistique:lire",
    sensitivity: READ,
    action: "absencesParMois",
    parametres: { anneeId: ANNEE },
    validate: noErrs,
    summarize: () => "Absences par mois.",
    rendre: (l) =>
      listeRendue(l, "Absences par mois", (x) => `${val(x.libelle, val(x.mois, "mois inconnu"))} — ${val(x.nonJustifiees, 0)} h non justifiees, ${val(x.justifiees, 0)} h justifiees`),
  },
  {
    name: "pilotage.moyennes_par_classe",
    module: "pilotage",
    description: "moyenne et taux de reussite de chaque classe",
    permission: "note:lire",
    sensitivity: READ,
    action: "moyennesParClasse",
    parametres: { anneeId: ANNEE, periodeId: PERIODE },
    validate: noErrs,
    summarize: () => "Moyennes par classe.",
    rendre: (l) =>
      listeRendue(l, "Moyennes par classe", (x) => `${val(x.classe, "classe inconnue")} (${val(x.effectif, 0)} eleves) — ${nb(x.moyenne, "/20")}, reussite ${nb(x.tauxReussite, " %")}`),
  },
  {
    name: "pilotage.classement_classes",
    module: "pilotage",
    description: "classement des classes par moyenne, avec l'ecart a la moyenne de l'etablissement",
    permission: "note:lire",
    sensitivity: READ,
    action: "classementClasses",
    parametres: { anneeId: ANNEE, periodeId: PERIODE },
    validate: noErrs,
    summarize: () => "Classement des classes.",
    rendre: (l) =>
      listeRendue(l, "Classement des classes", (x) => `${val(x.rang, "?")}. ${val(x.classe, "classe inconnue")} — ${nb(x.moyenne, "/20")} (ecart ${nb(x.ecart)})`),
  },
  {
    name: "pilotage.resultats_par_matiere",
    module: "pilotage",
    description: "moyenne obtenue dans chaque matiere sur une periode",
    permission: "note:lire",
    sensitivity: READ,
    action: "resultatsParMatiere",
    // La route rend une liste vide sans periode : on le dit, plutot que de
    // laisser croire que l'etablissement n'a aucune note.
    parametres: { periodeId: "OBLIGATOIRE, identifiant de periode scolaire (UUID)" },
    validate: (p) => (required(p.periodeId) ? {} : { periodeId: "Période requise." }),
    summarize: () => "Resultats par matiere.",
    rendre: (l) => listeRendue(l, "Resultats par matiere", (x) => `${val(x.matiere, "matiere inconnue")} — ${nb(x.moyenne, "/20")} sur ${val(x.nbNotes, 0)} note(s)`),
  },
  {
    name: "etablissement.statistiques",
    module: "pilotage",
    description: "statistiques generales de l'etablissement (effectifs, personnel, classes)",
    permission: "statistique:lire",
    sensitivity: READ,
    action: "statistiquesEtablissement",
    parametres: {},
    validate: noErrs,
    summarize: () => "Statistiques de l'etablissement.",
    rendre: (d) => {
      if (!d || typeof d !== "object" || Array.isArray(d)) return null;
      const lignes = Object.entries(d)
        .filter(([, v]) => typeof v === "number")
        .map(([k, v]) => `• ${k} : ${v}`);
      return lignes.length ? ["Statistiques de l'etablissement :", ...lignes].join("\n") : null;
    },
  },

  // --- Élèves ---------------------------------------------------------------
  {
    name: "eleves.rechercher",
    module: "eleves",
    description: "rechercher un eleve par nom, prenom ou matricule, eventuellement dans une classe",
    permission: "eleve:lire",
    sensitivity: READ,
    action: "rechercherEleves",
    parametres: {
      recherche: "facultatif, nom, prenom ou matricule a chercher",
      classeId: CLASSE,
      parPage: "facultatif, nombre de resultats ; 25 par defaut, 100 au maximum",
    },
    validate: noErrs,
    summarize: (p) => `Rechercher « ${p.recherche ?? "tous"} » parmi les eleves.`,
    rendre: (d) => {
      const lignes = Array.isArray(d) ? d : d?.lignes;
      if (!Array.isArray(lignes)) return null;
      // Le total est desormais passe a `listeRendue`, qui l'annonce lui-meme
      // et signale la troncature. Le repeter dans le titre donnait
      // « Eleves (2 au total) — 2 resultats ».
      const titre = "Eleves";
      // `x.classe` n'a jamais existe : le service rend `classeLibelle`. La
      // classe etait donc ABSENTE de chaque resultat depuis l'origine — et
      // c'est precisement ce qui distingue deux homonymes. Le repli sur
      // `classe` est garde au cas ou une autre source la nomme ainsi.
      const classeDe = (x) => x.classeLibelle ?? x.classe ?? null;
      const liste = listeRendue(
        lignes,
        titre,
        (x) => {
          const c = classeDe(x);
          return `${nomComplet(x)} — ${val(x.matricule, "sans matricule")}${c ? `, ${c}` : ", sans classe"}`;
        },
        { total: d?.total ?? null },
      );
      if (liste === null) return null;
      // Deux enfants peuvent porter le meme nom et le meme prenom : c'est le
      // cas en production. Montrer la fiche du mauvais ne se verrait pas,
      // alors qu'un zero resultat se voit. On signale, on ne choisit pas.
      const alerte = avertissementHomonymes(lignes);
      return alerte ? `${liste}

${alerte}` : liste;
    },
  },
  {
    name: "eleves.statistiques",
    module: "eleves",
    description: "repartition des eleves par statut d'inscription",
    permission: "eleve:lire",
    sensitivity: READ,
    action: "statistiquesEleves",
    parametres: { anneeId: ANNEE },
    validate: noErrs,
    summarize: () => "Statistiques des eleves.",
    rendre: (d) => {
      if (!d || typeof d !== "object" || Array.isArray(d)) return null;
      const lignes = Object.entries(d)
        .filter(([, v]) => typeof v === "number")
        .map(([k, v]) => `• ${k} : ${v}`);
      return lignes.length ? ["Eleves :", ...lignes].join("\n") : null;
    },
  },

  // --- Parents --------------------------------------------------------------
  {
    name: "parents.tuteurs_de_l_eleve",
    module: "parents",
    description: "responsables legaux rattaches a un eleve, avec leur lien de parente",
    permission: "eleve:lire",
    sensitivity: READ,
    action: "tuteursDeLEleve",
    parametres: { eleveId: "OBLIGATOIRE, identifiant de l'eleve (UUID)" },
    validate: (p) => (required(p.eleveId) ? {} : { eleveId: "Élève requis." }),
    summarize: () => "Responsables d'un eleve.",
    rendre: (l) =>
      listeRendue(l, "Responsables", (x) => `${nomComplet(x)} — ${val(x.lienParente, "lien non precise")}${x.principal ? " (principal)" : ""}`),
  },

  // --- Personnel ------------------------------------------------------------
  {
    name: "personnel.enseignants",
    module: "personnel",
    description: "annuaire des enseignants, avec leur statut et leur specialite",
    permission: "classe:lire",
    sensitivity: READ,
    action: "listerEnseignants",
    parametres: { anneeId: ANNEE, recherche: "facultatif, nom ou prenom a chercher" },
    validate: noErrs,
    summarize: () => "Annuaire des enseignants.",
    rendre: (l) =>
      listeRendue(l, "Enseignants", (x) => `${nomComplet(x)} — ${val(x.matricule)}${x.specialite ? `, ${x.specialite}` : ""}${x.statut ? ` (${x.statut})` : ""}`),
  },

  // --- Pédagogie ------------------------------------------------------------
  {
    name: "pedagogie.evaluations",
    module: "pedagogie",
    description: "evaluations programmees ou passees sur une periode",
    permission: "evaluation:lire",
    sensitivity: READ,
    action: "listerEvaluations",
    parametres: {
      periodeId: "OBLIGATOIRE, identifiant de periode scolaire (UUID)",
      classeId: CLASSE,
      matiereId: "facultatif, identifiant de matiere (UUID)",
    },
    validate: (p) => (required(p.periodeId) ? {} : { periodeId: "Période requise." }),
    summarize: () => "Evaluations de la periode.",
    rendre: (l) =>
      listeRendue(l, "Evaluations", (x) => `${val(x.titre, "sans titre")} — ${val(x.classe)}, ${val(x.matiere)}, ${jour(x.dateEvaluation)} (${val(x.statut)})`),
  },

  // --- Finances -------------------------------------------------------------
  {
    name: "finances.statistiques",
    module: "finances",
    description: "situation financiere globale : attendu, encaisse, reste du",
    permission: "finance:lire",
    sensitivity: READ,
    action: "statistiquesFinancieres",
    parametres: { anneeId: ANNEE },
    validate: noErrs,
    summarize: () => "Situation financiere de l'etablissement.",
    rendre: (d) => {
      if (!d || typeof d !== "object" || Array.isArray(d)) return null;
      const lignes = Object.entries(d)
        .filter(([, v]) => typeof v === "number")
        .map(([k, v]) => `• ${k} : ${/fcfa|montant|total|reste|paye|du$/i.test(k) ? fcfa(v) : v}`);
      return lignes.length ? ["Finances :", ...lignes].join("\n") : null;
    },
  },
  {
    name: "finances.recouvrement_par_classe",
    module: "finances",
    description: "etat du recouvrement classe par classe, avec le nombre d'eleves en retard de paiement",
    permission: "finance:lire",
    sensitivity: READ,
    action: "recouvrementParClasse",
    parametres: { anneeId: ANNEE },
    validate: noErrs,
    summarize: () => "Recouvrement par classe.",
    rendre: (l) =>
      listeRendue(l, "Recouvrement par classe", (x) => `${val(x.classe, "classe inconnue")} — ${fcfa(x.totalPaye)} encaisses sur ${fcfa(x.totalDu)}, ${x.nbEnRetard ?? 0} en retard`),
  },
];
