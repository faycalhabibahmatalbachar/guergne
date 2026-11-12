/**
 * Écritures — sur des données de SYNTHÈSE uniquement (banc/synthese.mjs) :
 * élèves « BANCIA », classes « Banc Zeta » et « Banc Omega », téléphones de la
 * plage fictive. Chaque écriture est RELUE EN SQL après le tour : la réponse de
 * l'agent ne vaut rien tant que la base ne la confirme pas.
 *
 * `f.s` = la synthèse posée (identifiants des classes, élèves, absences).
 */
const un = async (q, sql, p) => (await q(sql, p))[0];
const chiffres = (t) => String(t).replace(/\D/g, "");

export default [
  {
    id: "ec-01", domaine: "ecritures", synthese: true, capacites: ["eleves.inscrire"], etiquettes: ["ecriture"],
    tours: [
      {
        dit: "Inscris un nouvel élève : Zorba BANCIA, garçon, né le 12 mars 2013, en classe Banc Zeta. Son père s'appelle Omar BANCIA, téléphone +33199001250",
        outil: "eleves.inscrire", issue: "confirme",
        contient: [/Banc Zeta/, /Zorba/],
        apres: async ({ q }) => ((await un(q, "SELECT count(*)::int n FROM eleves WHERE nom='BANCIA' AND prenom='Zorba'")).n === 0 ? null : "l'élève a été créé AVANT la confirmation"),
      },
      {
        dit: "oui",
        issue: "repond",
        appel: { action: "inscrireEleve", params: (p, f) => p.classeId === f.s.classes.zeta.id || "classe attendue : Banc Zeta" },
        apres: async ({ q, f }) => {
          const e = await un(
            q,
            "SELECT e.sexe::text, e.date_naissance::text, i.classe_id::text, (SELECT count(*)::int FROM eleve_tuteur et WHERE et.eleve_id = e.id) tuteurs FROM eleves e JOIN inscriptions i ON i.eleve_id = e.id AND i.active WHERE e.nom='BANCIA' AND e.prenom='Zorba'",
          );
          if (!e) return "élève absent de la base après le oui";
          if (e.classe_id !== f.s.classes.zeta.id) return "mauvaise classe";
          if (e.date_naissance !== "2013-03-12") return "date de naissance " + e.date_naissance;
          if (e.sexe !== "M") return "sexe " + e.sexe;
          return e.tuteurs === 1 ? null : e.tuteurs + " responsable(s) au lieu de 1";
        },
      },
    ],
  },
  {
    id: "ec-02", domaine: "ecritures", synthese: true, capacites: ["eleves.modifier"], etiquettes: ["ecriture"],
    tours: [
      { dit: "Corrige le quartier de Yara BANCIA : elle habite à Moursal", outil: "eleves.modifier", issue: "confirme", contient: [/Moursal/] },
      {
        dit: "oui", issue: "repond",
        apres: async ({ q, f }) => ((await un(q, "SELECT quartier FROM eleves WHERE id = $1", [f.s.eleves.yara.id])).quartier === "Moursal" ? null : "quartier non modifié"),
      },
    ],
  },
  {
    id: "ec-03", domaine: "ecritures", synthese: true, capacites: ["eleves.changer_classe"], etiquettes: ["ecriture", "pronoms"],
    tours: [
      { dit: "le dossier de Wassim BANCIA", outil: ["eleves.dossier", "eleves.fiche", "eleves.rechercher"], issue: "repond", contient: [/Banc Omega/] },
      { dit: "Change sa classe : mets-le en Banc Zeta, erreur d'affectation", outil: "eleves.changer_classe", issue: "confirme", contient: [/Banc Zeta/, /Wassim/] },
      {
        dit: "oui", issue: "repond",
        apres: async ({ q, f }) => {
          const i = await un(q, "SELECT classe_id::text FROM inscriptions WHERE eleve_id = $1 AND active", [f.s.eleves.wassim.id]);
          return i?.classe_id === f.s.classes.zeta.id ? null : "la classe n'a pas changé";
        },
      },
    ],
  },
  {
    id: "ec-04", domaine: "ecritures", synthese: true, capacites: ["parents.rattacher", "parents.responsabilites"], etiquettes: ["ecriture", "pronoms"],
    tours: [
      { dit: "Ajoute la mère de Yara BANCIA : Mariam BANCIA, téléphone +33199001251", outil: "parents.rattacher", issue: "confirme", contient: [/Mariam/i] },
      {
        dit: "oui", issue: "repond",
        apres: async ({ q, f }) => {
          const r = await un(q, "SELECT count(*)::int n FROM eleve_tuteur et JOIN tuteurs t ON t.id = et.tuteur_id WHERE et.eleve_id = $1 AND et.lien = 'MERE' AND regexp_replace(t.telephone,'[^0-9]','','g') = $2", [f.s.eleves.yara.id, chiffres("+33199001251")]);
          return r.n === 1 ? null : "la mère n'est pas rattachée";
        },
      },
      { dit: "La mère devient la responsable principale", outil: "parents.responsabilites", issue: "confirme", contient: [/principal/i] },
      {
        dit: "oui", issue: "repond",
        apres: async ({ q, f }) => {
          const l = await q("SELECT et.lien::text, et.est_principal FROM eleve_tuteur et WHERE et.eleve_id = $1", [f.s.eleves.yara.id]);
          const principaux = l.filter((x) => x.est_principal);
          return principaux.length === 1 && principaux[0].lien === "MERE" ? null : "principal attendu : la mère, seule — " + JSON.stringify(l);
        },
      },
    ],
  },
  {
    id: "ec-05", domaine: "ecritures", synthese: true, capacites: ["notifications.parents"], etiquettes: ["ecriture", "notification"],
    tours: [
      {
        dit: "Préviens les parents de Victor BANCIA : réunion des parents demain à 8h au lycée",
        outil: "notifications.parents", issue: "confirme",
        appel: { action: "devisNotificationParents", params: () => true },
        contient: [/1 destinataire|1 responsable|Omar/i],
        apres: async ({ q, f }) => ((await un(q, "SELECT count(*)::int n FROM notifications WHERE eleve_id = $1", [f.s.eleves.victor.id])).n === 0 ? null : "une notification est partie AVANT la confirmation"),
      },
      {
        dit: "oui", issue: "repond",
        // « En file », jamais « délivré » : rien ne prouve la livraison.
        absent: [/d[ée]livr[ée]e?s?\b(?! n)/i],
        apres: async ({ q }) => {
          const r = await un(q, "SELECT count(*)::int n FROM notifications WHERE regexp_replace(telephone,'[^0-9]','','g') = $1 AND cree_le > now() - interval '5 minutes'", [chiffres("+33199001250")]);
          return r.n >= 1 ? null : "aucune notification en file pour le parent de synthèse";
        },
      },
    ],
  },
  {
    id: "ec-06", domaine: "ecritures", synthese: true, capacites: ["assiduite.enregistrer_appel"], etiquettes: ["ecriture", "dates"],
    tours: [
      {
        dit: "Victor BANCIA était absent le 10 mars 2026 en classe Banc Omega, 2 heures",
        outil: "assiduite.enregistrer_appel",
        issue: ["repond", "confirme"],
      },
      {
        dit: "oui",
        apres: async ({ q, f }) => {
          const a = await un(q, "SELECT nb_heures::float h, periode_id::text FROM absences WHERE inscription_id = $1 AND date_absence = '2026-03-10'", [f.s.eleves.victor.inscription_id]);
          if (!a) return "absence non enregistrée";
          if (a.periode_id !== f.s.periode2) return "mauvaise période (le 10 mars est au 2e trimestre)";
          return a.h === 2 ? null : "durée " + a.h;
        },
      },
    ],
  },
  {
    id: "ec-07", domaine: "ecritures", synthese: true, capacites: ["assiduite.enregistrer_retard"], etiquettes: ["ecriture", "dates"],
    tours: [
      { dit: "Victor BANCIA de la classe Banc Omega est arrivé avec 15 minutes de retard le 11 mars 2026", outil: "assiduite.enregistrer_retard", issue: ["repond", "confirme"] },
      {
        dit: "oui",
        apres: async ({ q, f }) => {
          const a = await un(q, "SELECT duree_minutes FROM retards WHERE inscription_id = $1 AND date_retard = '2026-03-11'", [f.s.eleves.victor.inscription_id]);
          return a ? (Number(a.duree_minutes) === 15 ? null : "durée " + a.duree_minutes) : "retard non enregistré";
        },
      },
    ],
  },
  {
    id: "ec-08", domaine: "ecritures", synthese: true, capacites: ["assiduite.justifier_absences"], etiquettes: ["ecriture"],
    tours: [
      { dit: "Justifie l'absence de Xavier BANCIA du 10 mars 2026 : certificat médical", outil: "assiduite.justifier_absences", issue: ["repond", "confirme"] },
      {
        dit: "oui",
        apres: async ({ q, f }) => {
          const a = await un(q, "SELECT statut::text, motif FROM absences WHERE id = $1", [f.s.absences.aJustifier.id]);
          const autre = await un(q, "SELECT statut::text FROM absences WHERE id = $1", [f.s.absences.aSupprimer.id]);
          if (a?.statut !== "JUSTIFIEE") return "absence du 10 mars non justifiée (statut " + a?.statut + ")";
          return autre?.statut === "JUSTIFIEE" ? "l'absence du 12 mars a été justifiée elle aussi" : null;
        },
      },
    ],
  },
  {
    id: "ec-09", domaine: "ecritures", synthese: true, capacites: ["assiduite.supprimer_absence"], etiquettes: ["ecriture", "sensible"],
    tours: [
      {
        dit: "Supprime l'absence de Xavier BANCIA du 12 mars 2026, elle a été saisie par erreur",
        outil: "assiduite.supprimer_absence", issue: "confirme",
        contient: [/Xavier/, /12/],
        apres: async ({ q, f }) => ((await un(q, "SELECT count(*)::int n FROM absences WHERE id = $1", [f.s.absences.aSupprimer.id])).n === 1 ? null : "supprimée AVANT la confirmation"),
      },
      {
        dit: "oui", issue: "repond",
        apres: async ({ q, f }) => {
          const n = (await un(q, "SELECT count(*)::int n FROM absences WHERE id = $1", [f.s.absences.aSupprimer.id])).n;
          const autre = (await un(q, "SELECT count(*)::int n FROM absences WHERE id = $1", [f.s.absences.aJustifier.id])).n;
          if (n !== 0) return "l'absence du 12 mars existe toujours";
          return autre === 1 ? null : "l'absence du 10 mars a disparu aussi";
        },
      },
    ],
  },
  {
    id: "ec-10", domaine: "ecritures", synthese: true, capacites: ["parents.detacher"], etiquettes: ["ecriture"],
    tours: [
      { dit: "Retire l'oncle des responsables de Xavier BANCIA", outil: "parents.detacher", issue: "confirme", contient: [/Ousmane/] },
      {
        dit: "oui", issue: "repond",
        apres: async ({ q, f }) => {
          const l = await q("SELECT lien::text FROM eleve_tuteur WHERE eleve_id = $1", [f.s.eleves.xavier.id]);
          return l.length === 1 && l[0].lien === "PERE" ? null : "liens restants : " + JSON.stringify(l);
        },
      },
    ],
  },
  {
    id: "ec-11", domaine: "ecritures", synthese: true, capacites: ["eleves.changer_statut"], etiquettes: ["ecriture"],
    tours: [
      { dit: "Victor BANCIA est transféré au Lycée de Moundou, sa famille déménage", outil: "eleves.changer_statut", issue: "confirme", contient: [/Moundou/, /close/i] },
      {
        dit: "oui", issue: "repond",
        contient: [/certificat/i],
        apres: async ({ q, f }) => {
          const e = await un(q, "SELECT e.statut::text, i.active, i.etablissement_destination FROM eleves e JOIN inscriptions i ON i.eleve_id = e.id WHERE e.id = $1", [f.s.eleves.victor.id]);
          if (e.statut !== "TRANSFERE") return "statut " + e.statut;
          if (e.active) return "inscription toujours active";
          return /Moundou/.test(e.etablissement_destination ?? "") ? null : "destination non enregistrée";
        },
      },
    ],
  },
  {
    id: "ec-12", domaine: "ecritures", synthese: true, capacites: ["eleves.archiver"], etiquettes: ["ecriture", "sensible", "annulation"],
    tours: [
      { dit: "Archive le dossier de Yara BANCIA, c'est un doublon de saisie", outil: "eleves.archiver", issue: "confirme", contient: [/Yara/] },
      {
        dit: "non", issue: "annule",
        appel: { action: "archiverEleve", jamais: true },
        apres: async ({ q, f }) => ((await un(q, "SELECT statut::text FROM eleves WHERE id = $1", [f.s.eleves.yara.id])).statut === "INSCRIT" ? null : "le dossier a changé malgré le non"),
      },
    ],
  },
  {
    id: "ec-13", domaine: "ecritures", synthese: true, capacites: ["eleves.changer_statut"], etiquettes: ["ecriture", "decision"],
    tours: [
      {
        // Une exclusion sans référence de décision ne se prépare même pas.
        dit: "Exclus définitivement Yara BANCIA pour violences répétées",
        outil: "eleves.changer_statut", issue: "clarifie",
        contient: [/d[ée]cision/i],
        appel: { action: "changerStatutEleve", jamais: true },
        apres: async ({ q, f }) => ((await un(q, "SELECT statut::text FROM eleves WHERE id = $1", [f.s.eleves.yara.id])).statut === "INSCRIT" ? null : "statut modifié sans décision"),
      },
    ],
  },
  {
    id: "ec-14", domaine: "ecritures", synthese: true, capacites: ["eleves.archiver"], etiquettes: ["ecriture", "confirmation-perimee"],
    tours: [
      { dit: "Archive le dossier de Yara BANCIA, doublon de saisie", outil: "eleves.archiver", issue: "confirme" },
      // Une autre demande fait TOMBER la confirmation en attente…
      { dit: "combien d'élèves en Banc Zeta ?", issue: "repond" },
      {
        // … et un « oui » tardif ne la ressuscite pas.
        dit: "oui",
        appel: { action: "archiverEleve", jamais: true },
        apres: async ({ q, f }) => ((await un(q, "SELECT statut::text FROM eleves WHERE id = $1", [f.s.eleves.yara.id])).statut === "INSCRIT" ? null : "archivé par un oui tardif"),
      },
    ],
  },
  {
    id: "ec-15", domaine: "ecritures", synthese: true, capacites: ["classes.creer", "classes.modifier", "classes.archiver"], etiquettes: ["ecriture"],
    tours: [
      { dit: "Crée une classe Banc Gamma, code BG9, niveau 6ème, 30 places", outil: "classes.creer", issue: "confirme", contient: [/Banc Gamma/] },
      { dit: "oui", issue: "repond", apres: async ({ q }) => ((await un(q, "SELECT count(*)::int n FROM classes WHERE code='BG9' AND active"))?.n === 1 ? null : "classe non créée") },
      { dit: "passe la capacité de la classe Banc Gamma à 35 places", outil: "classes.modifier", issue: "confirme" },
      { dit: "oui", issue: "repond", apres: async ({ q }) => (Number((await un(q, "SELECT capacite_max FROM classes WHERE code='BG9'"))?.capacite_max) === 35 ? null : "capacité non modifiée") },
      { dit: "archive la classe Banc Gamma, elle a été créée pour un essai", outil: "classes.archiver", issue: "confirme" },
      { dit: "oui", issue: "repond", apres: async ({ q }) => ((await un(q, "SELECT active FROM classes WHERE code='BG9'"))?.active === false ? null : "classe toujours active") },
    ],
  },
  {
    id: "ec-16", domaine: "ecritures", synthese: true, capacites: ["eleves.inscrire"], etiquettes: ["ecriture", "clarification"],
    tours: [
      {
        // Il manque le responsable : l'agent le demande, il n'invente pas.
        dit: "inscris Ulysse BANCIA, garçon né le 5 mai 2013, en Banc Zeta",
        outil: "eleves.inscrire", issue: "clarifie",
        appel: { action: "inscrireEleve", jamais: true },
      },
      { dit: "son père est Omar BANCIA, +33199001250", outil: "eleves.inscrire", issue: "confirme", contient: [/Ulysse/, /Banc Zeta/] },
      {
        dit: "oui", issue: "repond",
        apres: async ({ q, f }) => {
          const e = await un(q, "SELECT i.classe_id::text FROM eleves e JOIN inscriptions i ON i.eleve_id = e.id AND i.active WHERE e.nom='BANCIA' AND e.prenom='Ulysse'");
          if (!e) return "élève non créé";
          // Le père existe déjà (même téléphone) : sa fiche doit être réutilisée, pas doublée.
          const t = await un(q, "SELECT count(*)::int n FROM tuteurs WHERE regexp_replace(telephone,'[^0-9]','','g') = $1", [chiffres("+33199001250")]);
          return e.classe_id === f.s.classes.zeta.id ? (t.n === 1 ? null : t.n + " fiches pour le même téléphone : doublon de parent") : "mauvaise classe";
        },
      },
    ],
  },
  {
    id: "ec-17", domaine: "ecritures", synthese: true, capacites: ["parents.rattacher"], etiquettes: ["ecriture", "doublon"],
    tours: [
      {
        // Le père de Yara est DÉJÀ rattaché : le refuser, sans créer de doublon.
        dit: "Ajoute le père de Yara BANCIA : Omar BANCIA, +33199001250",
        outil: "parents.rattacher",
        absent: [/✅/],
        apres: async ({ q, f }) => {
          const r = await un(q, "SELECT count(*)::int n FROM eleve_tuteur et JOIN tuteurs t ON t.id = et.tuteur_id WHERE et.eleve_id = $1 AND regexp_replace(t.telephone,'[^0-9]','','g') = $2", [f.s.eleves.yara.id, chiffres("+33199001250")]);
          return r.n === 1 ? null : r.n + " liens père-élève : doublon";
        },
      },
    ],
  },
];
