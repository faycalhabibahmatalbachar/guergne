/**
 * Dossiers d'élèves et classes : consulter, créer, modifier, archiver.
 *
 * CE QUE CES OUTILS NE FONT PAS
 * ------------------------------
 * Ils ne décident d'aucun droit et n'écrivent rien eux-mêmes. Chaque écriture
 * part vers `POST /api/agent/{action}`, où le backend vérifie le jeton de
 * service, recharge l'acteur depuis la base, applique la matrice des droits et
 * le périmètre, puis exécute l'action EXACTE de l'interface web — homonymes,
 * matricule, transaction, audit compris. L'agent n'a pas de seconde
 * implémentation des règles métier.
 *
 * CE QU'ILS AJOUTENT, ET POURQUOI
 * --------------------------------
 * 1. `preparer` : les noms deviennent des identifiants RELUS au backend.
 *    « Archive le dossier de Mahamat Ahmat » ne contient aucun UUID ; on le
 *    cherche, et l'on s'arrête si l'on trouve zéro ou plusieurs élèves.
 * 2. Le récapitulatif soumis à confirmation nomme ce que le backend connaît
 *    — et signale en toutes lettres une correspondance qui n'est pas exacte.
 * 3. `confirmationObligatoire` : aucune politique ne peut en dispenser.
 * 4. `verifier` : après l'écriture, on RELIT le dossier, et l'agent ne dit
 *    « fait » que si la relecture le confirme.
 */
import { READ, SENSITIVE, WRITE } from "./guard.js";
import { canoniserClasse, normaliser, questionAmbiguite, resoudreClasse, resoudreEleve } from "./resolveur.js";
import { jour, listeRendue, nomComplet, val } from "./rendu.js";

const required = (v) => v !== undefined && v !== null && v !== "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const estUuid = (v) => typeof v === "string" && UUID.test(v);

/** Ce que le backend a rendu : l'enveloppe `{ok, data}` de la route, ou une erreur. */
const donnees = (r) => (r && r.ok !== false ? r.data : null);

const LIENS = ["PERE", "MERE", "TUTEUR", "ONCLE", "TANTE", "GRAND_PARENT", "FRERE_SOEUR", "AUTRE"];

// ---------------------------------------------------------------------------
// Résolution, partagée par les outils
// ---------------------------------------------------------------------------

/**
 * Un élève désigné par son identifiant, son matricule ou son nom.
 *
 * @returns {Promise<{ok:true, eleve:object, approchee:boolean} | {ok:false, message:string}>}
 */
export async function resoudreEleveParNom(designation, { guergne, ctx }) {
  if (estUuid(designation)) {
    const d = donnees(await guergne.consulterEleve({ eleveId: designation }, ctx));
    if (!d?.eleve) return { ok: false, message: "Aucun élève ne correspond à cet identifiant." };
    return { ok: true, eleve: d.eleve, dossier: d, approchee: false };
  }
  const demande = String(designation ?? "").trim();
  if (demande.length < 2) return { ok: false, message: "Précisez le nom, le prénom ou le matricule de l'élève." };

  const r = await guergne.rechercherEleves({ recherche: demande, parPage: 25 }, ctx);
  if (r?.ok === false) return { ok: false, message: r.message ?? "La recherche d'élève a échoué." };
  const lignes = Array.isArray(r?.data) ? r.data : Array.isArray(r?.data?.lignes) ? r.data.lignes : [];
  if (lignes.length === 0) return { ok: false, message: `Aucun élève ne correspond à « ${demande} ».` };

  const choix = resoudreEleve(lignes, demande);
  if (choix.statut === "aucun") return { ok: false, message: `Aucun élève ne correspond avec certitude à « ${demande} ».` };
  if (choix.statut === "ambigu") {
    return { ok: false, message: questionAmbiguite(choix.candidats.map((e) => ({ ...e, classe: e.classeLibelle })), "élève") };
  }
  const e = choix.eleve;
  // Une correspondance EXACTE porte sur le nom complet, le nom, le prénom ou le
  // matricule. Tout le reste est une approximation — admissible, puisqu'elle
  // sera montrée et confirmée, mais jamais silencieuse.
  const cible = normaliser(demande);
  const exacte = [`${e.prenom ?? ""} ${e.nom ?? ""}`, `${e.nom ?? ""} ${e.prenom ?? ""}`, e.nom, e.prenom, e.matricule]
    .filter(Boolean)
    .some((x) => normaliser(x) === cible);
  const eleveId = e.id ?? e.eleveId;
  const d = donnees(await guergne.consulterEleve({ eleveId }, ctx));
  if (!d?.eleve) return { ok: false, message: "Le dossier de l'élève trouvé n'a pas pu être relu." };
  return { ok: true, eleve: d.eleve, dossier: d, approchee: !exacte };
}

/**
 * Une classe désignée par son identifiant ou son libellé (« 6e A », « sixième A »).
 *
 * Toujours parmi les classes que le backend rend pour l'acteur — donc dans
 * son périmètre, et dans l'année demandée.
 */
export async function resoudreClasseParLibelle(designation, { guergne, ctx, anneeId = null }) {
  const r = await guergne.listerClasses(anneeId ? { anneeId } : {}, ctx);
  if (r?.ok === false) return { ok: false, message: r.message ?? "La liste des classes n'a pas pu être lue." };
  const classes = Array.isArray(r?.data) ? r.data : [];
  if (estUuid(designation)) {
    const c = classes.find((x) => x.id === designation);
    return c ? { ok: true, classe: c } : { ok: false, message: "Cette classe n'existe pas dans l'année scolaire en cours." };
  }
  const demande = String(designation ?? "").trim();
  if (!demande) return { ok: false, message: "Précisez la classe." };
  if (classes.length === 0) {
    return { ok: false, message: "Aucune classe n'est enregistrée pour l'année scolaire en cours : créez-la d'abord." };
  }
  const choix = resoudreClasse(classes, demande);
  if (choix.statut === "unique") return { ok: true, classe: choix.classe };
  if (choix.statut === "ambigu") return { ok: false, message: questionAmbiguite(choix.candidats, "classe") };
  return { ok: false, message: `Aucune classe « ${demande} » dans l'année scolaire en cours.` };
}

const alerteApprochee = (designation, eleve) =>
  `⚠️ Correspondance approchée pour « ${designation} » : vérifiez qu'il s'agit bien de ${nomComplet(eleve)} (matricule ${val(eleve.matricule)}).`;

const situation = (dossier) =>
  dossier?.inscription ? `en ${dossier.inscription.classeLibelle}` : "sans inscription active cette année";

// ---------------------------------------------------------------------------
// Rendu du dossier
// ---------------------------------------------------------------------------

/** Les champs dont l'absence mérite d'être signalée à la direction. */
const CHAMPS_ATTENDUS = [
  ["lieuNaissance", "lieu de naissance"],
  ["acteNaissanceNumero", "numéro d'acte de naissance"],
  ["adresse", "adresse"],
  ["quartier", "quartier"],
  ["groupeSanguin", "groupe sanguin"],
];

export function rendreDossier(d) {
  if (!d?.eleve) return null;
  const e = d.eleve;
  const lignes = [
    `Dossier de ${nomComplet(e)} — matricule ${val(e.matricule)}`,
    `• Né(e) le ${jour(e.dateNaissance)}${e.lieuNaissance ? ` à ${e.lieuNaissance}` : ""}, ${e.sexe === "F" ? "fille" : e.sexe === "M" ? "garçon" : "sexe non renseigné"}`,
    `• Statut : ${val(e.statut)}`,
    d.inscription
      ? `• Inscription en cours : ${d.inscription.classeLibelle}${d.inscription.estRedoublant ? " (redoublant)" : ""}, depuis le ${jour(d.inscription.dateInscription)}`
      : "• Aucune inscription active pour l'année en cours",
  ];
  const tuteurs = Array.isArray(d.tuteurs) ? d.tuteurs : [];
  if (tuteurs.length === 0) lignes.push("• Aucun responsable légal rattaché");
  for (const t of tuteurs) {
    lignes.push(`• Responsable : ${nomComplet(t)} (${val(t.lien)}${t.estPrincipal ? ", principal" : ""})`);
  }
  // Une valeur absente est DITE absente : un dossier ne se complète pas par
  // supposition.
  const manquants = CHAMPS_ATTENDUS.filter(([c]) => !e[c]).map(([, libelle]) => libelle);
  if (manquants.length > 0) lignes.push(`• Informations manquantes : ${manquants.join(", ")}`);
  return lignes.join("\n");
}

// ---------------------------------------------------------------------------
// Les outils
// ---------------------------------------------------------------------------

const ELEVE = "OBLIGATOIRE, nom, prenom ou matricule de l'eleve tel que l'utilisateur l'a dit (ou son identifiant)";
const CLASSE_LIB = "libelle de la classe tel que l'utilisateur l'a dit, par exemple « 6e A » ou « sixieme A »";

export const DOSSIERS_TOOLS = [
  // --- Lectures --------------------------------------------------------------
  {
    name: "eleves.dossier",
    module: "eleves",
    description: "consulter le dossier complet d'un eleve : identite, inscription, responsables, informations manquantes",
    permission: "eleve:lire",
    sensitivity: READ,
    action: "consulterEleve",
    parametres: { eleve: ELEVE },
    validate: (p) => (required(p.eleve) || required(p.eleveId) ? {} : { eleve: "Élève requis." }),
    summarize: () => "Dossier d'un eleve.",
    preparer: async (p, outils) => {
      const r = await resoudreEleveParNom(p.eleveId ?? p.eleve, outils);
      if (!r.ok) return r;
      return { ok: true, params: { eleveId: r.eleve.id } };
    },
    rendre: (d) => rendreDossier(d),
  },
  {
    name: "referentiel.niveaux",
    module: "classes",
    description: "lister les niveaux d'enseignement (6eme, 5eme, ..., terminale) qui servent a creer une classe",
    permission: "classe:lire",
    sensitivity: READ,
    action: "listerNiveaux",
    parametres: {},
    validate: () => ({}),
    summarize: () => "Niveaux d'enseignement.",
    rendre: (l) => listeRendue(l, "Niveaux", (x) => `${val(x.libelle)} (${val(x.code)})`),
  },

  // --- Élèves : écritures ------------------------------------------------------
  {
    name: "eleves.inscrire",
    module: "eleves",
    description: "creer le dossier d'un NOUVEL eleve et l'inscrire dans une classe de l'annee en cours, avec son responsable legal",
    permission: "eleve:inscrire",
    sensitivity: WRITE,
    confirmationObligatoire: true,
    action: "inscrireEleve",
    parametres: {
      nom: "OBLIGATOIRE, nom de famille",
      prenom: "OBLIGATOIRE, prenom",
      sexe: "OBLIGATOIRE, M ou F",
      dateNaissance: "OBLIGATOIRE, AAAA-MM-JJ",
      classe: `OBLIGATOIRE, ${CLASSE_LIB}`,
      lieuNaissance: "facultatif",
      tuteurNom: "OBLIGATOIRE, nom du responsable legal",
      tuteurPrenom: "OBLIGATOIRE, prenom du responsable legal",
      tuteurTelephone: "OBLIGATOIRE, telephone du responsable legal",
      tuteurLien: `OBLIGATOIRE, parmi ${LIENS.join(", ")}`,
    },
    validate: (p) => {
      const e = {};
      for (const c of ["nom", "prenom", "sexe", "dateNaissance", "classe", "tuteurNom", "tuteurPrenom", "tuteurTelephone", "tuteurLien"]) {
        if (!required(p[c])) e[c] = "Information requise.";
      }
      if (required(p.sexe) && !["M", "F"].includes(String(p.sexe).toUpperCase())) e.sexe = "M ou F.";
      if (required(p.dateNaissance) && !/^\d{4}-\d{2}-\d{2}$/.test(String(p.dateNaissance))) e.dateNaissance = "Format AAAA-MM-JJ.";
      if (required(p.tuteurLien) && !LIENS.includes(String(p.tuteurLien).toUpperCase())) e.tuteurLien = `Parmi ${LIENS.join(", ")}.`;
      return e;
    },
    summarize: (p) => `Inscrire ${p.prenom ?? "?"} ${p.nom ?? "?"} en ${p.classe ?? "?"}.`,
    preparer: async (p, outils) => {
      const c = await resoudreClasseParLibelle(p.classeId ?? p.classe, outils);
      if (!c.ok) return c;
      const params = {
        nom: String(p.nom).trim(),
        prenom: String(p.prenom).trim(),
        sexe: String(p.sexe).toUpperCase(),
        dateNaissance: String(p.dateNaissance),
        lieuNaissance: p.lieuNaissance ? String(p.lieuNaissance) : undefined,
        classeId: c.classe.id,
        tuteurs: [
          {
            nom: String(p.tuteurNom).trim(),
            prenom: String(p.tuteurPrenom).trim(),
            telephone: String(p.tuteurTelephone).trim(),
            lien: String(p.tuteurLien).toUpperCase(),
            estPrincipal: true,
            estTuteurLegal: true,
          },
        ],
        // Le passage outre d'un homonyme n'est JAMAIS accordé par l'agent :
        // il exige que quelqu'un ait relu le dossier existant dans l'application.
        confirmerDoublon: false,
      };
      return {
        ok: true,
        params,
        texte:
          `Je vais créer le dossier de ${params.prenom} ${params.nom.toUpperCase()} (${params.sexe === "F" ? "fille" : "garçon"}, né(e) le ${params.dateNaissance}` +
          `${params.lieuNaissance ? ` à ${params.lieuNaissance}` : ""}) et l'inscrire en ${c.classe.libelle} pour l'année scolaire en cours.\n` +
          `Responsable légal : ${params.tuteurs[0].prenom} ${params.tuteurs[0].nom.toUpperCase()} (${params.tuteurs[0].lien}, ${params.tuteurs[0].telephone}).\n` +
          `Le matricule sera attribué par le système. Confirmez-vous cette inscription ?`,
      };
    },
    verifier: async ({ result, params, guergne, ctx }) => {
      const id = result?.data?.id ?? result?.id;
      if (!id) return { ok: false, raison: "le serveur n'a pas rendu l'identifiant du dossier créé" };
      const d = donnees(await guergne.consulterEleve({ eleveId: id }, ctx));
      if (!d?.eleve) return { ok: false, raison: "le dossier créé est introuvable à la relecture" };
      if (normaliser(d.eleve.nom) !== normaliser(params.nom) || normaliser(d.eleve.prenom) !== normaliser(params.prenom)) {
        return { ok: false, raison: "l'identité relue ne correspond pas à celle demandée" };
      }
      if (d.inscription?.classeId !== params.classeId) return { ok: false, raison: "l'inscription relue ne porte pas sur la classe demandée" };
      return {
        ok: true,
        texte: `✅ Dossier créé et vérifié : ${nomComplet(d.eleve)}, matricule ${d.eleve.matricule}, inscrit(e) en ${d.inscription.classeLibelle}. Le dossier est à valider dans l'application.`,
      };
    },
  },
  {
    name: "eleves.modifier",
    module: "eleves",
    description: "modifier des informations du dossier d'un eleve (identite, coordonnees, sante, ecole d'origine)",
    permission: "eleve:modifier",
    sensitivity: WRITE,
    confirmationObligatoire: true,
    action: "modifierEleve",
    parametres: {
      eleve: ELEVE,
      modifications:
        "OBLIGATOIRE, objet des champs a changer et de leur nouvelle valeur ; champs possibles : nom, prenom, sexe, dateNaissance, lieuNaissance, nationalite, acteNaissanceNumero, adresse, quartier, telephone, email, groupeSanguin, allergies, ecoleOrigine",
    },
    validate: (p) => {
      const e = {};
      if (!required(p.eleve) && !required(p.eleveId)) e.eleve = "Élève requis.";
      if (!p.modifications || typeof p.modifications !== "object" || Object.keys(p.modifications).length === 0) {
        e.modifications = "Indiquez ce qu'il faut modifier.";
      }
      return e;
    },
    summarize: () => "Modifier un dossier d'eleve.",
    preparer: async (p, outils) => {
      const r = await resoudreEleveParNom(p.eleveId ?? p.eleve, outils);
      if (!r.ok) return r;
      const e = r.eleve;
      const lignes = Object.entries(p.modifications).map(
        ([champ, nouvelle]) => `• ${champ} : ${e[champ] === undefined ? "(non relisible)" : val(e[champ], "vide")} → ${val(nouvelle, "vide")}`,
      );
      return {
        ok: true,
        params: { eleveId: e.id, modifications: p.modifications },
        texte: [
          r.approchee ? alerteApprochee(p.eleve, e) : null,
          `Je vais modifier le dossier de ${nomComplet(e)} (matricule ${val(e.matricule)}, ${situation(r.dossier)}) :`,
          ...lignes,
          "Confirmez-vous ces modifications ?",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    },
    verifier: async ({ params, guergne, ctx }) => {
      const d = donnees(await guergne.consulterEleve({ eleveId: params.eleveId }, ctx));
      if (!d?.eleve) return { ok: false, raison: "le dossier est introuvable à la relecture" };
      const nonRelisibles = [];
      const ecarts = [];
      for (const [champ, voulue] of Object.entries(params.modifications)) {
        if (!(champ in d.eleve)) {
          nonRelisibles.push(champ);
          continue;
        }
        if (normaliser(d.eleve[champ]) !== normaliser(voulue)) ecarts.push(champ);
      }
      if (ecarts.length > 0) return { ok: false, raison: `valeur relue différente pour : ${ecarts.join(", ")}` };
      const verifies = Object.keys(params.modifications).filter((c) => !nonRelisibles.includes(c));
      return {
        ok: true,
        texte:
          `✅ Dossier de ${nomComplet(d.eleve)} mis à jour.` +
          (verifies.length ? ` Vérifié à la relecture : ${verifies.join(", ")}.` : "") +
          // Honnêteté : ces champs ont été acceptés par le serveur, mais la
          // relecture du dossier ne les expose pas.
          (nonRelisibles.length ? ` Enregistré par le serveur, non relisible par l'assistant : ${nonRelisibles.join(", ")}.` : ""),
      };
    },
  },
  {
    name: "eleves.changer_classe",
    module: "eleves",
    description: "deplacer un eleve dans une autre classe de la meme annee scolaire",
    permission: "eleve:affecter",
    sensitivity: WRITE,
    confirmationObligatoire: true,
    action: "changerClasseEleve",
    parametres: {
      eleve: ELEVE,
      classe: `OBLIGATOIRE, classe de destination : ${CLASSE_LIB}`,
      motif: "OBLIGATOIRE, raison du changement (3 caracteres minimum)",
    },
    validate: (p) => {
      const e = {};
      if (!required(p.eleve) && !required(p.eleveId)) e.eleve = "Élève requis.";
      if (!required(p.classe) && !required(p.classeId)) e.classe = "Classe de destination requise.";
      if (!p.motif || String(p.motif).trim().length < 3) e.motif = "Motif requis.";
      return e;
    },
    summarize: () => "Changer un eleve de classe.",
    preparer: async (p, outils) => {
      const r = await resoudreEleveParNom(p.eleveId ?? p.eleve, outils);
      if (!r.ok) return r;
      // L'inscription n'est JAMAIS dictée : elle est lue dans le dossier.
      const inscription = r.dossier?.inscription;
      if (!inscription) return { ok: false, message: `${nomComplet(r.eleve)} n'a pas d'inscription active cette année : rien à déplacer.` };
      const c = await resoudreClasseParLibelle(p.classeId ?? p.classe, outils);
      if (!c.ok) return c;
      if (c.classe.id === inscription.classeId) return { ok: false, message: `${nomComplet(r.eleve)} est déjà en ${c.classe.libelle}.` };
      return {
        ok: true,
        params: { eleveId: r.eleve.id, inscriptionId: inscription.id, classeId: c.classe.id, motif: String(p.motif).trim() },
        texte: [
          r.approchee ? alerteApprochee(p.eleve, r.eleve) : null,
          `Je vais déplacer ${nomComplet(r.eleve)} (matricule ${val(r.eleve.matricule)}) de ${inscription.classeLibelle} vers ${c.classe.libelle}.`,
          `Motif : ${String(p.motif).trim()}.`,
          "Confirmez-vous ce changement de classe ?",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    },
    verifier: async ({ params, guergne, ctx }) => {
      const d = donnees(await guergne.consulterEleve({ eleveId: params.eleveId }, ctx));
      if (!d?.inscription) return { ok: false, raison: "l'inscription est introuvable à la relecture" };
      if (d.inscription.classeId !== params.classeId) return { ok: false, raison: `l'élève est relu en ${d.inscription.classeLibelle}` };
      return { ok: true, texte: `✅ ${nomComplet(d.eleve)} est désormais en ${d.inscription.classeLibelle} (vérifié).` };
    },
  },
  {
    name: "eleves.archiver",
    module: "eleves",
    description: "archiver le dossier d'un eleve (la suppression definitive n'existe pas : l'historique est conserve)",
    permission: "eleve:modifier",
    sensitivity: SENSITIVE,
    confirmationObligatoire: true,
    action: "archiverEleve",
    parametres: { eleve: ELEVE, motif: "OBLIGATOIRE, raison de l'archivage (5 caracteres minimum)" },
    validate: (p) => {
      const e = {};
      if (!required(p.eleve) && !required(p.eleveId)) e.eleve = "Élève requis.";
      if (!p.motif || String(p.motif).trim().length < 5) e.motif = "Motif explicite requis (5 caractères minimum).";
      return e;
    },
    summarize: () => "Archiver un dossier d'eleve.",
    preparer: async (p, outils) => {
      const r = await resoudreEleveParNom(p.eleveId ?? p.eleve, outils);
      if (!r.ok) return r;
      if (r.eleve.statut === "ARCHIVE") return { ok: false, message: `Le dossier de ${nomComplet(r.eleve)} est déjà archivé.` };
      return {
        ok: true,
        params: { eleveId: r.eleve.id, motif: String(p.motif).trim() },
        texte: [
          r.approchee ? alerteApprochee(p.eleve, r.eleve) : null,
          `Je vais ARCHIVER le dossier de ${nomComplet(r.eleve)} (matricule ${val(r.eleve.matricule)}, ${situation(r.dossier)}, statut ${val(r.eleve.statut)}).`,
          "Rien n'est supprimé : notes, absences et historique restent consultables.",
          `Motif : ${String(p.motif).trim()}.`,
          "Confirmez-vous l'archivage ?",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    },
    verifier: async ({ params, guergne, ctx }) => {
      const d = donnees(await guergne.consulterEleve({ eleveId: params.eleveId }, ctx));
      if (!d?.eleve) return { ok: false, raison: "le dossier est introuvable à la relecture" };
      if (d.eleve.statut !== "ARCHIVE") return { ok: false, raison: `le statut relu est ${d.eleve.statut}` };
      return { ok: true, texte: `✅ Dossier de ${nomComplet(d.eleve)} archivé (vérifié). Son historique reste consultable.` };
    },
  },

  // --- Classes : écritures ------------------------------------------------------
  {
    name: "classes.creer",
    module: "classes",
    description: "creer une classe dans l'annee scolaire en cours",
    permission: "classe:creer",
    sensitivity: WRITE,
    confirmationObligatoire: true,
    action: "creerClasse",
    parametres: {
      libelle: "OBLIGATOIRE, nom de la classe, par exemple « 6ème C »",
      code: "OBLIGATOIRE, code court en lettres et chiffres, par exemple 6C",
      niveau: "OBLIGATOIRE, niveau tel que dit : 6eme, 5eme, 4eme, 3eme, 2nde, 1ere, terminale",
      capaciteMax: "OBLIGATOIRE, nombre maximum d'eleves",
    },
    validate: (p) => {
      const e = {};
      for (const c of ["libelle", "code", "niveau", "capaciteMax"]) if (!required(p[c])) e[c] = "Information requise.";
      return e;
    },
    summarize: (p) => `Creer la classe ${p.libelle ?? "?"}.`,
    preparer: async (p, { guergne, ctx }) => {
      const [rn, ra] = await Promise.all([guergne.listerNiveaux({}, ctx), guergne.anneeCourante({}, ctx)]);
      const niveaux = Array.isArray(rn?.data) ? rn.data : [];
      const annee = ra?.data;
      if (!annee?.libelle) return { ok: false, message: "Aucune année scolaire en cours : impossible de créer une classe." };
      // Le niveau se compare sous sa forme canonique : « sixième », « 6ème »
      // et « 6e » désignent la même chose.
      const cible = canoniserClasse(String(p.niveau)).split(" ")[0];
      const trouves = niveaux.filter((n) => [n.code, n.libelle].some((x) => canoniserClasse(String(x ?? "")).split(" ")[0] === cible));
      if (trouves.length !== 1) {
        return { ok: false, message: `Niveau « ${p.niveau} » ${trouves.length ? "ambigu" : "introuvable"}. Niveaux connus : ${niveaux.map((n) => n.libelle).join(", ")}.` };
      }
      const capacite = Number(p.capaciteMax);
      const code = String(p.code).trim().toUpperCase();
      return {
        ok: true,
        params: { libelle: String(p.libelle).trim(), code, niveauId: trouves[0].id, capaciteMax: capacite },
        texte: `Je vais créer la classe ${String(p.libelle).trim()} (code ${code}, niveau ${trouves[0].libelle}, ${capacite} places) pour l'année ${annee.libelle}.\nConfirmez-vous la création ?`,
      };
    },
    verifier: async ({ params, guergne, ctx }) => {
      const r = await guergne.listerClasses({}, ctx);
      const c = (Array.isArray(r?.data) ? r.data : []).find((x) => String(x.code).toUpperCase() === params.code);
      if (!c) return { ok: false, raison: "la classe n'apparaît pas dans la liste relue" };
      return { ok: true, texte: `✅ Classe ${c.libelle} créée et vérifiée (code ${c.code}, ${c.capaciteMax} places).` };
    },
  },
  {
    name: "classes.modifier",
    module: "classes",
    description: "modifier le nom, le code ou la capacite d'une classe",
    permission: "classe:modifier",
    sensitivity: WRITE,
    confirmationObligatoire: true,
    action: "modifierClasse",
    parametres: {
      classe: `OBLIGATOIRE, ${CLASSE_LIB}`,
      modifications: "OBLIGATOIRE, objet des champs a changer parmi : libelle, code, capaciteMax",
    },
    validate: (p) => {
      const e = {};
      if (!required(p.classe) && !required(p.classeId)) e.classe = "Classe requise.";
      if (!p.modifications || typeof p.modifications !== "object" || Object.keys(p.modifications).length === 0) {
        e.modifications = "Indiquez ce qu'il faut modifier.";
      }
      return e;
    },
    summarize: () => "Modifier une classe.",
    preparer: async (p, outils) => {
      const c = await resoudreClasseParLibelle(p.classeId ?? p.classe, outils);
      if (!c.ok) return c;
      const lignes = Object.entries(p.modifications).map(([k, v]) => `• ${k} : ${val(c.classe[k], "vide")} → ${val(v, "vide")}`);
      return {
        ok: true,
        params: { classeId: c.classe.id, modifications: p.modifications },
        texte: [`Je vais modifier la classe ${c.classe.libelle} :`, ...lignes, "Confirmez-vous ces modifications ?"].join("\n"),
      };
    },
    verifier: async ({ params, guergne, ctx }) => {
      const r = await guergne.listerClasses({}, ctx);
      const c = (Array.isArray(r?.data) ? r.data : []).find((x) => x.id === params.classeId);
      if (!c) return { ok: false, raison: "la classe n'apparaît plus dans la liste relue" };
      const ecarts = Object.entries(params.modifications).filter(([k, v]) => normaliser(c[k]) !== normaliser(k === "code" ? String(v).toUpperCase() : v));
      if (ecarts.length) return { ok: false, raison: `valeur relue différente pour : ${ecarts.map(([k]) => k).join(", ")}` };
      return { ok: true, texte: `✅ Classe ${c.libelle} mise à jour (vérifié).` };
    },
  },
  {
    name: "classes.archiver",
    module: "classes",
    description: "archiver une classe sans eleve inscrit (la suppression definitive n'est pas proposee)",
    permission: "classe:modifier",
    sensitivity: SENSITIVE,
    confirmationObligatoire: true,
    action: "archiverClasse",
    parametres: { classe: `OBLIGATOIRE, ${CLASSE_LIB}`, motif: "OBLIGATOIRE, raison (5 caracteres minimum)" },
    validate: (p) => {
      const e = {};
      if (!required(p.classe) && !required(p.classeId)) e.classe = "Classe requise.";
      if (!p.motif || String(p.motif).trim().length < 5) e.motif = "Motif explicite requis (5 caractères minimum).";
      return e;
    },
    summarize: () => "Archiver une classe.",
    preparer: async (p, outils) => {
      const c = await resoudreClasseParLibelle(p.classeId ?? p.classe, outils);
      if (!c.ok) return c;
      if (Number(c.classe.effectif) > 0) {
        return { ok: false, message: `La classe ${c.classe.libelle} compte ${c.classe.effectif} élève(s) : changez-les de classe avant de l'archiver.` };
      }
      return {
        ok: true,
        params: { classeId: c.classe.id, motif: String(p.motif).trim() },
        texte: `Je vais ARCHIVER la classe ${c.classe.libelle} (aucun élève inscrit). Elle ne sera plus proposée, mais son historique reste consultable.\nMotif : ${String(p.motif).trim()}.\nConfirmez-vous l'archivage ?`,
      };
    },
    verifier: async ({ params, guergne, ctx }) => {
      const r = await guergne.listerClasses({}, ctx);
      const encore = (Array.isArray(r?.data) ? r.data : []).find((x) => x.id === params.classeId);
      if (encore) return { ok: false, raison: "la classe figure encore parmi les classes actives" };
      return { ok: true, texte: "✅ Classe archivée (vérifié : elle ne figure plus parmi les classes actives)." };
    },
  },
];
