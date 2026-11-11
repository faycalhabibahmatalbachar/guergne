/**
 * Parents, notes, finances détaillées et référentiel scolaire.
 *
 * POURQUOI CE FICHIER
 * --------------------
 * Le relevé du 2026-11-10 (docs/REGISTRE_CAPACITES_AGENT.md §4) a mesuré huit
 * opérations que le backend expose et qu'aucun outil n'atteignait. Ce ne sont
 * pas des fonctions à écrire côté serveur : elles existent. Ce qui manquait,
 * c'est la capacité de les DEMANDER avec les mots d'un directeur — « le relevé
 * de Mahamat au premier trimestre », « qui n'a pas payé en 4e B » — et non avec
 * des UUID que personne ne dicte.
 *
 * Chaque outil résout donc dans `preparer` ce que l'utilisateur nomme (élève,
 * classe, période) contre les données RELUES au backend, et s'arrête net sur
 * une ambiguïté. Aucun calcul métier n'est fait ici : les moyennes du relevé
 * viennent du backend, qui applique les règles des bulletins.
 */
import { READ } from "./guard.js";
import { normaliser } from "./resolveur.js";
import { jour, listeRendue, lignesDe, nomComplet, totalDe, val } from "./rendu.js";
import { resoudreClasseParLibelle, resoudreEleveParNom } from "./tools-dossiers.js";

const noErrs = () => ({});
const required = (v) => v !== undefined && v !== null && v !== "";
const fcfa = (v) => (v === null || v === undefined ? "non calculé" : `${Number(v).toLocaleString("fr-FR")} FCFA`);
const note20 = (v) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 }));

// ---------------------------------------------------------------------------
// Période : « premier trimestre », « T2 », « 3 »
// ---------------------------------------------------------------------------

const ORDINAUX = [
  [1, ["1", "1er", "1ere", "premier", "premiere", "t1", "un", "first", "الاول", "الأول"]],
  [2, ["2", "2e", "2eme", "deuxieme", "second", "seconde", "t2", "deux", "الثاني"]],
  [3, ["3", "3e", "3eme", "troisieme", "t3", "trois", "الثالث"]],
];

/**
 * Numéro de période dans ce que l'utilisateur a dit.
 *
 * @returns {{numero:number|null}|{erreur:string}} `numero: null` quand rien
 *   n'est précisé — le backend retient alors la période en cours. Une mention
 *   présente mais illisible est une ERREUR, jamais un « en cours » silencieux :
 *   répondre sur le mauvais trimestre est pire que reposer la question.
 */
export function numeroPeriode(designation) {
  if (designation === undefined || designation === null || designation === "") return { numero: null };
  if (Number.isInteger(designation) && designation >= 1 && designation <= 3) return { numero: designation };
  // `normaliser` ne garde que l'alphabet latin : « الثالث » en sortirait vide.
  // Ici on retire seulement les signes diacritiques — accents, et hamza en
  // arabe — en conservant les lettres de toute écriture.
  const plat = (t) => String(t).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const mots = plat(designation).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for (const [numero, formes] of ORDINAUX) {
    if (mots.some((m) => formes.map(plat).includes(m))) return { numero };
  }
  return { erreur: `Je ne reconnais pas la période « ${designation} ». Dites « premier », « deuxième » ou « troisième trimestre ».` };
}

/** Ce que l'utilisateur dit de l'état d'un compte parent, vers le filtre du backend. */
const ETATS_PARENT = {
  sans_compte: ["sans compte", "sans_compte", "pas de compte", "aucun compte"],
  invite: ["invite", "pas active", "non active", "jamais connecte", "pas encore active", "en attente"],
  actif: ["actif", "active", "connecte"],
  revoque: ["revoque", "desactive", "bloque", "inactif"],
  doublon: ["doublon", "doublons", "meme numero"],
};

export function etatParent(designation) {
  if (!required(designation)) return { etat: null };
  const t = normaliser(String(designation));
  // L'ordre compte : « pas activé » contient « activé ».
  for (const cle of ["sans_compte", "invite", "revoque", "doublon", "actif"]) {
    if (ETATS_PARENT[cle].some((f) => t === f || t.includes(f))) return { etat: cle };
  }
  return { erreur: `État de compte inconnu : « ${designation} ». Possibles : sans compte, invité (jamais connecté), actif, révoqué, doublon.` };
}

const LIBELLE_ETAT = (l) => {
  if (!l.utilisateurId) return "sans compte";
  if (l.compteActif !== true) return "compte révoqué";
  return l.derniereConnexion ? `actif (dernière connexion ${jour(l.derniereConnexion)})` : "invité, jamais connecté";
};

async function classeOptionnelle(p, outils) {
  if (!required(p.classe) && !required(p.classeId)) return { ok: true, classeId: undefined };
  const r = await resoudreClasseParLibelle(p.classeId ?? p.classe, outils);
  return r.ok ? { ok: true, classeId: r.classe.id, classe: r.classe } : r;
}

// ---------------------------------------------------------------------------
// Rendus
// ---------------------------------------------------------------------------

export function rendreReleve(d) {
  if (!d || typeof d !== "object" || !Array.isArray(d.matieres)) return null;
  const tete = `Relevé de ${nomComplet(d.eleve)} (${val(d.eleve?.matricule, "sans matricule")}) — ${val(d.classe)}, ${val(d.periode?.libelle)}`;
  if (d.matieres.length === 0) {
    return `${tete}\nAucune note saisie pour cette période. Ce n'est pas une moyenne nulle : il n'y a rien à calculer.`;
  }
  const lignes = [tete];
  for (const m of d.matieres) {
    const coef = m.noteeAuBulletin ? `coef ${m.coefficient}` : "hors bulletin (aucun coefficient pour ce niveau)";
    const detail = (m.notes ?? [])
      .map((n) => (n.valeur === null ? `${val(n.statut)}` : `${note20(n.valeur)}/${n.bareme}`))
      .join(", ");
    lignes.push(`• ${val(m.matiere)} : ${m.moyenne === null ? "pas de moyenne" : `${note20(m.moyenne)}/20`} (${coef}) — ${detail}`);
  }
  lignes.push(
    d.moyenneGenerale === null
      ? "Moyenne générale : non calculable (aucune matière notée au bulletin)."
      : `Moyenne générale provisoire : ${note20(d.moyenneGenerale)}/20.`,
  );
  if (d.bulletin) {
    lignes.push(
      `Bulletin de la période : ${d.bulletin.publie ? "publié" : "généré, non publié"}` +
        `${d.bulletin.moyenneGenerale !== null ? `, moyenne ${note20(d.bulletin.moyenneGenerale)}/20` : ""}` +
        `${d.bulletin.rang ? `, rang ${d.bulletin.rang}` : ""}. C'est lui qui fait foi.`,
    );
  } else {
    lignes.push("Aucun bulletin généré pour cette période : ces moyennes sont calculées à l'instant, à titre indicatif.");
  }
  return lignes.join("\n");
}

export function rendreSituations(l, p = {}) {
  if (!Array.isArray(l)) return null;
  if (l.length === 0) return p.seulementImpayes || p.enRetard ? "Aucun élève ne correspond : personne n'est en impayé avec ces critères." : "Aucune situation financière pour ces critères.";
  const reste = l.reduce((s, x) => s + Number(x?.resteDu ?? 0), 0);
  const paye = l.reduce((s, x) => s + Number(x?.totalPaye ?? 0), 0);
  // Le domaine borne à 200 lignes : à 200, la somme n'est PAS un total.
  const borne = l.length >= 200;
  const corps = listeRendue(l, "Situations financières", (x) =>
    `${nomComplet(x)} (${val(x.classe)}) — payé ${fcfa(x.totalPaye)}, reste ${fcfa(x.resteDu)}` +
      `${Number(x.nbEnRetard) > 0 ? `, ${x.nbEnRetard} échéance(s) en retard` : ""}${x.estBoursier ? ", boursier" : ""}`,
  );
  return [
    corps,
    `${borne ? "Sur les 200 premières lignes seulement (liste bornée) : " : "Total de cette liste : "}${fcfa(paye)} encaissés, ${fcfa(reste)} restant dus.`,
  ].join("\n");
}

export function rendreCalendrier(d) {
  if (!d || !Array.isArray(d.jours)) return null;
  const tete = `Évaluations du ${jour(d.debut)} au ${jour(d.fin)}`;
  const corps = listeRendue(d.jours, tete, (x) => `${jour(x.date)} — ${val(x.classe)}, ${val(x.matiere)} : ${val(x.titre, "sans titre")} (${val(x.type)})`);
  const surcharges = Array.isArray(d.surcharges) ? d.surcharges : [];
  if (surcharges.length === 0) return corps;
  return [
    corps,
    "⚠️ Journées chargées (plusieurs compositions le même jour) :",
    ...surcharges.slice(0, 5).map((s) => `• ${jour(s.date)} — ${val(s.classe)} : ${s.nombre} (${(s.matieres ?? []).join(", ")})`),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Les outils
// ---------------------------------------------------------------------------

const ELEVE = "OBLIGATOIRE, nom, prenom ou matricule de l'eleve tel que l'utilisateur l'a dit";
const CLASSE = "facultatif, libelle de la classe tel que l'utilisateur l'a dit, par exemple « 4e B »";
const PERIODE = "facultatif, la periode telle que dite : « premier trimestre », « T2 », « 3 » ; par defaut la periode en cours";

export const SCOLARITE_TOOLS = [
  // --- Parents ---------------------------------------------------------------
  {
    name: "parents.rechercher",
    module: "parents",
    description:
      "rechercher les parents et tuteurs par nom ou telephone, ou par etat de leur compte (sans compte, invite jamais connecte, actif, revoque, doublon), eventuellement dans une classe",
    permission: "tuteur:gerer",
    sensitivity: READ,
    action: "rechercherTuteurs",
    parametres: {
      recherche: "facultatif, nom, prenom ou telephone",
      etat: "facultatif, sans compte | invite (jamais connecte) | actif | revoque | doublon",
      classe: CLASSE,
      page: "facultatif, numero de page (1 par defaut)",
    },
    validate: noErrs,
    summarize: () => "Recherche de parents.",
    preparer: async (p, outils) => {
      const e = etatParent(p.etat);
      if (e.erreur) return { ok: false, message: e.erreur };
      const c = await classeOptionnelle(p, outils);
      if (!c.ok) return c;
      return {
        ok: true,
        params: {
          ...(required(p.recherche) ? { recherche: String(p.recherche) } : {}),
          ...(e.etat ? { etat: e.etat } : {}),
          ...(c.classeId ? { classeId: c.classeId } : {}),
          page: Number.isInteger(p.page) && p.page > 0 ? p.page : 1,
          parPage: 25,
        },
      };
    },
    rendre: (d) =>
      listeRendue(
        lignesDe(d),
        "Parents",
        (x) =>
          `${nomComplet(x)} — ${val(x.telephone, "sans téléphone")}, ${LIBELLE_ETAT(x)}` +
          `${x.doublonTelephone ? ", ⚠️ numéro partagé avec une autre fiche" : ""}` +
          `${x.enfants ? ` — enfants : ${x.enfants}` : ""}`,
        { total: totalDe(d) },
      ),
  },
  {
    name: "parents.statistiques",
    module: "parents",
    description: "synthese des comptes parents : combien sans compte, invites jamais connectes, actifs, revoques, avec l'application installee, doublons de telephone",
    permission: "tuteur:gerer",
    sensitivity: READ,
    action: "statistiquesParents",
    parametres: {},
    validate: noErrs,
    summarize: () => "Synthese des comptes parents.",
    rendre: (d) => {
      // Un compteur absent est DIT absent : « undefined parents actifs » ou un
      // zéro inventé feraient tirer une conclusion fausse.
      if (!d || typeof d !== "object" || Array.isArray(d) || typeof d.total !== "number") return null;
      const c = (v) => (typeof v === "number" ? String(v) : "non communiqué");
      return [
        `Comptes parents — ${c(d.total)} fiche(s) :`,
        `• sans compte : ${c(d.sansCompte)}`,
        `• invités, jamais connectés : ${c(d.invites)}`,
        `• actifs : ${c(d.actifs)} (dont ${c(d.avecAppareil)} avec l'application sur un appareil)`,
        `• révoqués : ${c(d.revoques)}`,
        `• fiches partageant un numéro avec une autre : ${c(d.doublons)}`,
      ].join("\n");
    },
  },

  // --- Notes -----------------------------------------------------------------
  {
    name: "notes.releve",
    module: "notes",
    description: "releve de notes d'un eleve pour une periode, avec les moyennes par matiere et la moyenne generale calculees selon les regles du bulletin",
    permission: "note:lire",
    sensitivity: READ,
    action: "releveEleve",
    parametres: { eleve: ELEVE, periode: PERIODE },
    validate: (p) => (required(p.eleve) || required(p.eleveId) ? {} : { eleve: "Élève requis." }),
    summarize: () => "Releve de notes d'un eleve.",
    preparer: async (p, outils) => {
      const per = numeroPeriode(p.periode);
      if (per.erreur) return { ok: false, message: per.erreur };
      const r = await resoudreEleveParNom(p.eleveId ?? p.eleve, outils);
      if (!r.ok) return r;
      return { ok: true, params: { eleveId: r.eleve.id, ...(per.numero ? { periodeNumero: per.numero } : {}) } };
    },
    rendre: (d) => rendreReleve(d),
  },
  {
    name: "pedagogie.calendrier_evaluations",
    module: "pedagogie",
    description: "calendrier des evaluations d'une periode, avec les journees surchargees de compositions",
    permission: "evaluation:lire",
    sensitivity: READ,
    action: "calendrierEvaluations",
    parametres: {
      periode: PERIODE,
      classe: CLASSE,
      type: "facultatif, INTERROGATION | DEVOIR | COMPOSITION | EXAMEN_BLANC | ORAL",
    },
    validate: noErrs,
    summarize: () => "Calendrier des evaluations.",
    preparer: async (p, outils) => {
      const per = numeroPeriode(p.periode);
      if (per.erreur) return { ok: false, message: per.erreur };
      const c = await classeOptionnelle(p, outils);
      if (!c.ok) return c;
      const type = required(p.type) ? String(p.type).toUpperCase().replace(/\s+/g, "_") : undefined;
      return {
        ok: true,
        params: {
          ...(per.numero ? { periodeNumero: per.numero } : {}),
          ...(c.classeId ? { classeId: c.classeId } : {}),
          ...(type ? { type } : {}),
        },
      };
    },
    rendre: (d) => rendreCalendrier(d),
  },

  // --- Finances --------------------------------------------------------------
  {
    name: "finances.situations",
    module: "finances",
    description:
      "situation financiere eleve par eleve : paye, reste du, echeances en retard ; filtrable par classe, impayes, retard, boursiers, ou un eleve precis",
    permission: "finance:lire",
    sensitivity: READ,
    action: "listerSituationsFinancieres",
    parametres: {
      classe: CLASSE,
      seulementImpayes: "facultatif, true pour ne garder que ceux qui doivent encore de l'argent",
      enRetard: "facultatif, true pour ne garder que ceux dont une echeance est depassee",
      boursier: "facultatif, true pour les seuls boursiers, false pour les non-boursiers",
      recherche: "facultatif, nom, prenom ou matricule d'un eleve",
    },
    validate: noErrs,
    summarize: () => "Situations financieres.",
    preparer: async (p, outils) => {
      const c = await classeOptionnelle(p, outils);
      if (!c.ok) return c;
      const bool = (v) => v === true || v === "true";
      return {
        ok: true,
        params: {
          ...(c.classeId ? { classeId: c.classeId } : {}),
          ...(bool(p.seulementImpayes) ? { seulementImpayes: true } : {}),
          ...(bool(p.enRetard) ? { enRetard: true } : {}),
          ...(p.boursier === true || p.boursier === "true" ? { boursier: true } : {}),
          ...(p.boursier === false || p.boursier === "false" ? { boursier: false } : {}),
          ...(required(p.recherche) ? { recherche: String(p.recherche) } : {}),
        },
      };
    },
    rendre: (l, p) => rendreSituations(l, p),
  },

  // --- Référentiel ------------------------------------------------------------
  {
    name: "referentiel.periodes",
    module: "scolarite",
    description: "periodes (trimestres) de l'annee scolaire, avec leurs dates et l'etat de la saisie des notes",
    permission: "assiduite:lire",
    sensitivity: READ,
    action: "listerPeriodes",
    parametres: {},
    validate: noErrs,
    summarize: () => "Periodes de l'annee.",
    rendre: (l) =>
      listeRendue(l, "Périodes", (x) =>
        `${val(x.libelle)} — du ${jour(x.dateDebut)} au ${jour(x.dateFin)}` +
        `${x.estVerrouillee ? ", verrouillée" : x.saisieOuverte ? ", saisie des notes ouverte" : ", saisie fermée"}`,
      ),
  },
  {
    name: "referentiel.classes_matieres",
    module: "pedagogie",
    description: "classes actives de l'annee et matieres enseignees",
    permission: "classe:lire",
    sensitivity: READ,
    action: "listerClassesEtMatieres",
    parametres: {},
    validate: noErrs,
    summarize: () => "Classes et matieres.",
    rendre: (d) => {
      if (!d || typeof d !== "object" || !Array.isArray(d.classes)) return null;
      const classes = d.classes.map((c) => `${val(c.libelle)}${c.serieCode ? ` (${c.serieCode})` : ""}`);
      const matieres = (d.matieres ?? []).map((m) => val(m.libelle));
      return [
        `Classes actives (${classes.length}) : ${classes.length ? classes.join(", ") : "aucune pour l'année en cours"}`,
        `Matières (${matieres.length}) : ${matieres.join(", ") || "aucune"}`,
      ].join("\n");
    },
  },
  {
    name: "referentiel.series",
    module: "scolarite",
    description: "series du second cycle (A, C, D...) avec leur description",
    permission: "classe:lire",
    sensitivity: READ,
    action: "listerSeries",
    parametres: {},
    validate: noErrs,
    summarize: () => "Series du lycee.",
    rendre: (l) => listeRendue(l, "Séries", (x) => `${val(x.code)} — ${val(x.libelle)}${x.description ? ` : ${x.description}` : ""}`),
  },
];
