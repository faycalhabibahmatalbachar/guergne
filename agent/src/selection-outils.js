/**
 * Quels outils montrer EN DÉTAIL au modèle pour un message donné.
 *
 * POURQUOI
 * --------
 * Le registre complet (52 outils, leurs paramètres) pesait environ 6 000 jetons
 * par appel. Le fournisseur principal (Groq, offre gratuite) plafonne à 8 000
 * jetons par minute et à environ 200 000 par jour : l'agent ne pouvait donc
 * comprendre qu'UN message par minute, tous utilisateurs confondus, et une
 * trentaine par jour avant de basculer sur des fournisseurs de repli — eux
 * aussi limités. Mesuré sur le banc, pas supposé.
 *
 * COMMENT
 * -------
 * Le modèle voit toujours le NOM de chaque outil (il sait que tout existe), et
 * le détail — description et paramètres — des seuls outils que le message
 * peut concerner : ceux dont le domaine est évoqué par un mot du message, ceux
 * de la conversation en cours, et un socle toujours présent. Un message dont
 * aucun mot n'évoque un domaine reçoit le registre complet : en cas de doute,
 * on paie le prix fort plutôt que de cacher le bon outil.
 *
 * Aucune décision n'est prise ici : le modèle choisit toujours, et le moteur
 * accepte tout outil du registre, détaillé ou non.
 */

const plat = (t) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, " ");

/**
 * Domaine → mots qui l'évoquent (formes sans accent, racines). Un mot du
 * message qui COMMENCE par l'une de ces racines active le domaine.
 */
const LEXIQUE = {
  absences: ["absen", "abscen", "abs ", "manque", "manqu", "pas venu", "presen", "appel", "justif"],
  retards: ["retard", "retar ", "en retard", "arriv"],
  discipline: ["incident", "sanction", "disciplin", "conduite", "comportement", "bagarre", "violence", "exclusion temporaire"],
  eleves: ["eleve", "eleves", "fiche", "dossier", "matricule", "inscri", "enfant", "etudiant", "garcon", "fille", "redoubl", "nouveau", "nouvelle"],
  classes: ["classe", "effectif", "combien", "6e", "5e", "4e", "3e", "6eme", "5eme", "4eme", "3eme", "seconde", "2nde", "premiere", "1ere", "terminale", "tle", "sixieme", "cinquieme", "quatrieme", "troisieme", "niveau", "capacite", "place"],
  notes: ["note", "moyenne", "releve", "bulletin", "resultat", "evaluation", "devoir", "compo", "interro", "examen", "matiere", "rang", "reussite", "faible", "debrouille"],
  finances: ["paye", "payer", "paie", "impaye", "frais", "argent", "solde", "doit", "doivent", "dette", "paiement", "boursier", "bourse", "recouvr", "financ", "fcfa", "echeance", "scolarite", "a jour", "encaiss"],
  parents: ["parent", "pere", "mere", "tuteur", "responsable", "famille", "numero", "telephone", "compte", "appli", "oncle", "tante", "contact", "principal", "retrait", "rattach", "detach"],
  notifications: ["previen", "prevenir", "notif", "message", "informe", "avertir", "avertis", "sms", "envoie", "envoyer", "convoqu", "ecris aux", "devis", "consentement"],
  emploi: ["emploi du temps", "edt", "cours", "horaire", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"],
  personnel: ["enseignant", "prof", "professeur", "personnel", "m ", "mme ", "monsieur", "madame"],
  statut: ["transfer", "abandon", "exclu", "suspen", "reintegr", "reactiv", "quitte", "parti", "renvoi", "depart"],
  pilotage: ["chiffre", "statisti", "bilan", "indicateur", "tableau de bord", "compar", "evolution", "par mois", "classement", "global", "etablissement", "lycee", "repartition"],
  referentiel: ["annee", "periode", "trimestre", "serie", "niveaux", "matieres"],
};

/** Domaine → outils (par préfixe de nom ou nom exact). */
const OUTILS_DU_DOMAINE = {
  absences: ["assiduite.consulter_absences", "assiduite.alertes", "assiduite.tableau_de_bord", "assiduite.enregistrer_appel", "assiduite.justifier_absences", "assiduite.supprimer_absence", "pilotage.absences_par_mois"],
  retards: ["assiduite.consulter_retards", "assiduite.enregistrer_retard", "assiduite.tableau_de_bord"],
  discipline: ["discipline.", "assiduite.conduite_classe"],
  eleves: ["eleves.", "classes.eleves"],
  classes: ["classes.", "pilotage.effectifs_par_niveau", "referentiel.niveaux"],
  notes: ["notes.", "pedagogie.", "pilotage.moyennes_par_classe", "pilotage.classement_classes", "pilotage.resultats_par_matiere"],
  finances: ["finances."],
  parents: ["parents."],
  notifications: ["notifications.", "parents.rechercher"],
  emploi: ["emploi_du_temps."],
  personnel: ["personnel.", "emploi_du_temps."],
  statut: ["eleves.changer_statut", "eleves.rechercher", "eleves.statistiques"],
  pilotage: ["pilotage.", "etablissement.", "eleves.statistiques"],
  referentiel: ["referentiel.", "etablissement.annee_courante"],
};

/** Toujours détaillés : retrouver un élève, une classe, sa fiche. */
const SOCLE = ["eleves.fiche", "eleves.rechercher", "classes.eleves"];

const correspond = (nom, motif) => (motif.endsWith(".") ? nom.startsWith(motif) : nom === motif);

/**
 * @param {object} o
 * @param {string} o.texte              le message
 * @param {object[]} o.outils           tous les outils du registre
 * @param {object|null} [o.dernierOutil] nom de l'outil de la dernière consultation
 * @param {object|null} [o.attente]      outil d'une question en suspens
 * @returns {{ detailles: Set<string>|null, domaines: string[] }} `null` = tout détailler
 */
export function selectionnerOutils({ texte, outils, dernierOutil = null, attente = null }) {
  const n = " " + plat(texte).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ") + " ";
  const domaines = Object.entries(LEXIQUE)
    .filter(([, mots]) => mots.some((m) => n.includes(" " + m)))
    .map(([d]) => d);
  // Rien d'évocateur : le registre complet. Une relance courte (« et pour la
  // 6e B ? ») évoque au moins la classe, et la conversation fournit le reste.
  if (domaines.length === 0 && !dernierOutil && !attente) return { detailles: null, domaines };

  const noms = new Set(SOCLE);
  for (const d of domaines) {
    for (const motif of OUTILS_DU_DOMAINE[d] ?? []) for (const o of outils) if (correspond(o.name, motif)) noms.add(o.name);
  }
  // La conversation en cours : son outil et ses voisins de module.
  for (const nom of [dernierOutil, attente].filter(Boolean)) {
    const module = nom.split(".")[0];
    for (const o of outils) if (o.name === nom || o.name.startsWith(module + ".")) noms.add(o.name);
  }
  // Trop large : autant tout montrer, le gain ne vaut plus le risque.
  if (noms.size > Math.max(26, outils.length * 0.6)) return { detailles: null, domaines };
  return { detailles: noms, domaines };
}
