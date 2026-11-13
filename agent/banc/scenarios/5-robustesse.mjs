/**
 * Quand quelque chose ne va pas : le backend tombe, rend vide, répond lentement
 * ou refuse. L'agent ne doit ni se taire, ni inventer, ni annoncer une réussite.
 *
 * Les pannes sont INJECTÉES sur le client du backend (`sabotage`), juste pour
 * le scénario : le moteur, lui, est le vrai.
 */
const classe = (code) => (p, f) => p.classeId === f.classes[code].id || "classe attendue : " + code;

export default [
  {
    id: "ro-01", domaine: "robustesse", etiquettes: ["panne"],
    sabotage: { listerAbsences: async () => ({ ok: false, message: "Erreur interne du serveur (500)." }) },
    tours: [{
      dit: "les absences de la 6e A",
      outil: "assiduite.consulter_absences", issue: "echec",
      contient: [/erreur|impossible|échou|indisponible/i],
      // Une panne n'est pas « aucune absence ».
      absent: [/aucune absence/i, /✅/],
    }],
  },
  {
    id: "ro-02", domaine: "robustesse", etiquettes: ["panne"],
    sabotage: { listerAbsences: async () => new Error("fetch failed: ECONNREFUSED") },
    tours: [{
      dit: "les absences de la 6e A",
      outil: "assiduite.consulter_absences",
      contient: [/erreur|impossible|échou|indisponible|réessay/i],
      absent: [/aucune absence/i, /✅/, /ECONNREFUSED/],
    }],
  },
  {
    id: "ro-03", domaine: "robustesse", etiquettes: ["vide"],
    sabotage: { listerRetards: async () => ({ ok: true, data: { lignes: [], total: 0 } }) },
    tours: [{
      dit: "les retards de la 4e A",
      outil: "assiduite.consulter_retards", issue: "repond",
      // Un résultat vide est une réponse, pas une erreur.
      contient: [/aucun/i],
      absent: [/erreur|échou/i],
    }],
  },
  {
    id: "ro-04", domaine: "robustesse", etiquettes: ["panne", "referentiel"],
    sabotage: {
      listerClasses: async () => ({ ok: false, message: "Erreur interne du serveur (500)." }),
      nommerClasses: async () => ({ ok: false, message: "Erreur interne du serveur (500)." }),
      listerPeriodes: async () => ({ ok: false, message: "Erreur interne du serveur (500)." }),
    },
    tours: [{
      // Sans la liste des classes, « 6e A » ne peut pas être résolue : le dire.
      dit: "les absences de la 6e A",
      // Sans référentiel, la classe ne peut pas être identifiée : l'agent le
      // dit, et n'interroge pas les absences avec un identifiant deviné.
      appel: { action: "listerAbsences", jamais: true },
      contient: [/classes/i],
      absent: [/✅/, /UUID|identifiant/i],
    }],
  },
  {
    id: "ro-05", domaine: "robustesse", etiquettes: ["panne", "ecriture"], synthese: true,
    sabotage: { modifierEleve: async () => ({ ok: false, message: "Écriture refusée : dossier verrouillé." }) },
    tours: [
      { dit: "Corrige l'adresse de Yara BANCIA : avenue Charles de Gaulle", outil: "eleves.modifier", issue: "confirme" },
      {
        dit: "oui", issue: "echec",
        contient: [/refus|verrouill|échou/i],
        absent: [/✅/],
        apres: async ({ q, f }) => {
          const [e] = await q("SELECT adresse FROM eleves WHERE id = $1", [f.s.eleves.yara.id]);
          return /Gaulle/.test(e.adresse ?? "") ? "l'adresse a été modifiée malgré l'échec simulé" : null;
        },
      },
    ],
  },
  {
    id: "ro-06", domaine: "robustesse", etiquettes: ["verification"], synthese: true,
    // Le backend dit « ok » mais n'écrit rien : seule la relecture le voit.
    sabotage: { modifierEleve: async () => ({ ok: true, message: "Dossier mis à jour." }) },
    tours: [
      { dit: "Corrige le lieu de naissance de Yara BANCIA : Abéché", outil: "eleves.modifier", issue: "confirme" },
      {
        dit: "oui",
        // L'agent ne doit PAS annoncer une réussite qu'il n'a pas pu relire.
        absent: [/^✅/],
        contient: [/vérifi|relis|contrôle/i],
        apres: async ({ q, f }) => {
          const [e] = await q("SELECT lieu_naissance FROM eleves WHERE id = $1", [f.s.eleves.yara.id]);
          return /Ab[ée]ch[ée]/.test(e.lieu_naissance ?? "") ? "le lieu a été écrit alors que l'écriture était neutralisée" : null;
        },
      },
    ],
  },
  {
    id: "ro-07", domaine: "robustesse", etiquettes: ["inconnu"],
    tours: [{
      dit: "les absences de la classe de 7e Z",
      absent: [/✅/],
      appel: { action: "listerAbsences", jamais: true },
      contient: [/7e Z|ne retrouve|n'existe|introuvable|classe/i],
    }],
  },
  {
    id: "ro-08", domaine: "robustesse", etiquettes: ["annee"],
    tours: [{
      // Une autre année : ne pas servir les chiffres de l'année en cours sous son nom.
      dit: "combien d'élèves étaient inscrits en 2019-2020 ?",
      absent: [(f) => new RegExp("\\b" + f.totaux.inscrits + "\\b")],
    }],
  },
  {
    id: "ro-09", domaine: "robustesse", etiquettes: ["vocal"],
    tours: [{
      // Ce que rend une transcription : pas de majuscule, « à » pour « A », un mot écorché.
      dit: "donne moi les absence de la sixième à",
      outil: "assiduite.consulter_absences", issue: "repond",
      appel: { action: "listerAbsences", params: classe("6A") },
    }],
  },
  {
    id: "ro-10", domaine: "robustesse", etiquettes: ["vocal"],
    tours: [{
      dit: "euh alors je voudrais voir heu les retards de la troisième b s'il te plaît",
      outil: "assiduite.consulter_retards", issue: "repond",
      appel: { action: "listerRetards", params: classe("3B") },
    }],
  },
  {
    id: "ro-11", domaine: "robustesse", etiquettes: ["ambigu"],
    tours: [{
      // Trop vague pour agir : une question ciblée, pas une action au hasard.
      dit: "change sa classe",
      issue: "clarifie",
      appel: { action: "changerClasseEleve", jamais: true },
    }],
  },
  {
    id: "ro-12", domaine: "robustesse", etiquettes: ["ambigu"],
    tours: [{
      dit: "préviens les parents",
      issue: "clarifie",
      appel: { action: "envoyerNotificationParents", jamais: true },
    }],
  },
  {
    id: "ro-13", domaine: "robustesse", etiquettes: ["lenteur"],
    sabotage: {
      listerRetards: async (p, c, reel) => {
        await new Promise((r) => setTimeout(r, 6_000));
        return reel(p, c);
      },
    },
    tours: [{
      // Un backend lent n'est pas un backend en panne : la réponse arrive, juste.
      dit: "les retards de la 5e B",
      outil: "assiduite.consulter_retards", issue: "repond",
      appel: { action: "listerRetards", params: classe("5B") },
      contient: [(f) => f.nombre(f.retards["5B"])],
    }],
  },
];
