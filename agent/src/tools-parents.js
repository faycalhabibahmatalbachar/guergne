/**
 * Parents et responsabilités familiales : rattacher, détacher, réattribuer.
 *
 * TROIS NOTIONS QU'ON NE CONFOND PAS
 * -----------------------------------
 * - une FICHE parent (`tuteurs`) : une personne, avec son téléphone ;
 * - un LIEN (`eleve_tuteur`) : cette personne est le père, la mère, le
 *   tuteur… de CET élève ;
 * - des RESPONSABILITÉS portées par le lien, indépendantes les unes des
 *   autres : responsable principal, tuteur légal, responsable financier,
 *   contact d'urgence, autorisé au retrait.
 * Le compte d'accès à l'application est une quatrième chose, gérée ailleurs.
 *
 * Chaque écriture part vers l'action EXACTE de la fiche élève, au nom de
 * l'acteur, et c'est l'action qui garantit : réutilisation d'une fiche
 * existante, refus d'un double rattachement, transfert (jamais retrait) du
 * principal, au moins un responsable conservé, audit. Ici, on résout les noms,
 * on récapitule ce que le BACKEND connaît, on exige un oui net, puis on RELIT.
 */
import { WRITE } from "./guard.js";
import { normaliser } from "./resolveur.js";
import { nomComplet, val } from "./rendu.js";
import { resoudreEleveParNom } from "./tools-dossiers.js";

const required = (v) => v !== undefined && v !== null && v !== "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const donnees = (r) => (r && r.ok !== false ? r.data : null);
const chiffres = (t) => String(t ?? "").replace(/\D/g, "");

export const LIENS = ["PERE", "MERE", "TUTEUR", "ONCLE", "TANTE", "GRAND_PARENT", "FRERE_SOEUR", "AUTRE"];
const LIENS_DITS = {
  PERE: ["pere", "papa"],
  MERE: ["mere", "maman"],
  TUTEUR: ["tuteur", "tutrice"],
  ONCLE: ["oncle"],
  TANTE: ["tante"],
  GRAND_PARENT: ["grand pere", "grand mere", "grand parent", "grand-pere", "grand-mere", "grandpere", "grandmere"],
  FRERE_SOEUR: ["frere", "soeur", "grand frere", "grande soeur"],
  AUTRE: ["autre"],
};

/** « le père », « MERE », « grand-mère » → la valeur de l'énumération, ou null. */
export function lienDe(dit) {
  if (!required(dit)) return null;
  const brut = String(dit).trim().toUpperCase();
  if (LIENS.includes(brut)) return brut;
  // « œ » n'a pas de décomposition Unicode : sans cette ligne, « sœur »
  // sortirait de la normalisation privé de ses lettres.
  const t = normaliser(String(dit).replace(/œ/gi, "oe")).replace(/^(le|la|l|son|sa)\s+/, "").trim();
  for (const [lien, formes] of Object.entries(LIENS_DITS)) if (formes.includes(t)) return lien;
  return null;
}

/** Les responsabilités, dans les mots de l'établissement. */
/** L'outil « responsabilités », défini plus bas dans ce module. */
const RESPONSABILITES_OUTIL = () => PARENTS_TOOLS.find((o) => o.name === "parents.responsabilites");

export const RESPONSABILITES = {
  estPrincipal: "responsable principal",
  estTuteurLegal: "tuteur légal",
  estResponsableFinancier: "responsable financier",
  estContactUrgence: "contact d'urgence",
  autoriseRetrait: "autorisé au retrait",
};

const booleen = (v) => (v === true || v === "true" || v === "oui" ? true : v === false || v === "false" || v === "non" ? false : undefined);

function responsabilitesDemandees(p) {
  const r = {};
  for (const cle of Object.keys(RESPONSABILITES)) {
    const b = booleen(p[cle]);
    if (b !== undefined) r[cle] = b;
  }
  return r;
}

const decrire = (r) =>
  Object.entries(r)
    .map(([k, v]) => `${v ? "" : "plus "}${RESPONSABILITES[k]}`)
    .join(", ");

/** Un responsable déjà rattaché, désigné par son nom, son prénom, son lien ou son téléphone. */
export function choisirTuteur(tuteurs, designation) {
  const liste = Array.isArray(tuteurs) ? tuteurs.filter(Boolean) : [];
  if (!required(designation)) return { ok: false, message: "Précisez quel responsable : son nom, ou « le père », « la mère »…" };
  if (UUID.test(String(designation))) {
    const t = liste.find((x) => x.id === designation);
    return t ? { ok: true, tuteur: t } : { ok: false, message: "Ce responsable n'est pas rattaché à cet élève." };
  }
  const lien = lienDe(designation);
  const d = normaliser(String(designation));
  const num = chiffres(designation);
  const candidats = liste.filter(
    (t) =>
      (lien && t.lien === lien) ||
      (num.length >= 6 && chiffres(t.telephone).endsWith(num.slice(-8))) ||
      [t.nom, t.prenom, `${t.prenom} ${t.nom}`, `${t.nom} ${t.prenom}`].some((x) => x && normaliser(x) === d),
  );
  if (candidats.length === 1) return { ok: true, tuteur: candidats[0] };
  if (candidats.length > 1) {
    return { ok: false, message: `Plusieurs responsables correspondent : ${candidats.map((t) => `${nomComplet(t)} (${t.lien})`).join(", ")}. Lequel ?` };
  }
  return {
    ok: false,
    message: `Aucun responsable « ${designation} » parmi : ${liste.map((t) => `${nomComplet(t)} (${t.lien})`).join(", ") || "aucun"}.`,
  };
}

async function eleveEtResponsables(designation, outils) {
  const r = await resoudreEleveParNom(designation, outils);
  if (!r.ok) return r;
  const f = donnees(await outils.guergne.ficheEleve({ eleveId: r.eleve.id }, outils.ctx));
  if (!f?.identite) return { ok: false, message: "La fiche de l'élève n'a pas pu être relue." };
  return { ok: true, eleve: r.eleve, tuteurs: f.tuteurs ?? [], approchee: r.approchee };
}

async function relireResponsables(eleveId, { guergne, ctx }) {
  const f = donnees(await guergne.ficheEleve({ eleveId }, ctx));
  return Array.isArray(f?.tuteurs) ? f.tuteurs : null;
}

const ELEVE = "OBLIGATOIRE, nom, prenom ou matricule de l'eleve";
const TUTEUR = "OBLIGATOIRE, le responsable deja rattache : son nom, son prenom, son lien (« le pere ») ou son telephone";
const RESP_DOC = Object.fromEntries(
  Object.entries(RESPONSABILITES).map(([k, l]) => [k, `facultatif, true ou false : ${l}`]),
);

export const PARENTS_TOOLS = [
  {
    name: "parents.rattacher",
    module: "parents",
    description:
      "AJOUTER un NOUVEAU responsable a un eleve (avec son telephone). Si une fiche existe deja pour ce telephone (meme parent d'un autre enfant), elle est REUTILISEE. Pour changer le role d'un responsable deja rattache, utiliser parents.responsabilites",
    permission: "tuteur:gerer",
    sensitivity: WRITE,
    confirmationObligatoire: true,
    action: "rattacherTuteur",
    parametres: {
      eleve: ELEVE,
      telephone: "OBLIGATOIRE, telephone du parent",
      nom: "nom du parent (obligatoire si aucune fiche n'existe pour ce telephone)",
      prenom: "prenom du parent (obligatoire si aucune fiche n'existe pour ce telephone)",
      lien: "OBLIGATOIRE, PERE | MERE | TUTEUR | ONCLE | TANTE | GRAND_PARENT | FRERE_SOEUR | AUTRE",
      ...RESP_DOC,
    },
    validate: (p) => {
      const e = {};
      if (!required(p.eleve) && !required(p.eleveId)) e.eleve = "Élève requis.";
      if (chiffres(p.telephone).length < 8) e.telephone = "Téléphone du parent requis.";
      if (!lienDe(p.lien)) e.lien = "Lien requis : père, mère, tuteur, oncle, tante, grand-parent, frère ou sœur, autre.";
      return e;
    },
    summarize: (p) => `Rattacher un parent (${val(p.lien)}).`,
    preparer: async (p, outils) => {
      const r = await resoudreEleveParNom(p.eleveId ?? p.eleve, outils);
      if (!r.ok) return r;
      const lien = lienDe(p.lien);
      const resp = responsabilitesDemandees(p);

      // Le parent existe-t-il déjà ? Par les SEULS chiffres du numéro, comme
      // l'action le fera : le récapitulatif doit annoncer ce qui se passera.
      const num = chiffres(p.telephone);
      const recherche = donnees(await outils.guergne.rechercherTuteurs({ recherche: num.slice(-8), parPage: 10 }, outils.ctx));
      const memes = (recherche?.lignes ?? []).filter((t) => chiffres(t.telephone).endsWith(num.slice(-8)));
      if (memes.length > 1) {
        return {
          ok: false,
          message: `Plusieurs fiches parent partagent ce numéro (${memes.map((t) => nomComplet(t)).join(", ")}) : à fusionner dans l'application avant tout rattachement.`,
        };
      }
      const existant = memes[0];
      // DÉJÀ responsable de CET élève : rattacher échouerait (« déjà
      // rattaché »). Si la demande change un rôle (« la mère devient
      // principale »), c'est une modification de responsabilités : on la
      // prépare comme telle, avec son propre récapitulatif et sa relecture.
      if (existant) {
        const deja = donnees(await outils.guergne.tuteursDeLEleve?.({ eleveId: r.eleve.id }, outils.ctx));
        const lie = (Array.isArray(deja) ? deja : []).find((x) => (x.id ?? x.tuteurId) === existant.id);
        if (lie) {
          const changeLien = lien && lien !== lie.lien;
          if (Object.keys(resp).length === 0 && !changeLien) {
            return { ok: false, message: `${nomComplet(existant)} est déjà responsable de ${nomComplet(r.eleve)} (${val(lie.lien)}) : rien à rattacher.` };
          }
          const prep = await RESPONSABILITES_OUTIL().preparer(
            { eleveId: r.eleve.id, tuteur: existant.telephone, ...(changeLien ? { lien } : {}), ...resp },
            outils,
          );
          return prep?.ok === false ? prep : { ...prep, outil: "parents.responsabilites" };
        }
      }
      if (!existant && (!required(p.nom) || !required(p.prenom))) {
        return { ok: false, message: "Aucune fiche parent n'existe pour ce numéro : donnez son nom et son prénom pour la créer." };
      }
      const params = {
        eleveId: r.eleve.id,
        ...(existant ? { existantId: existant.id, nom: existant.nom, prenom: existant.prenom } : { nom: String(p.nom), prenom: String(p.prenom) }),
        telephone: existant ? existant.telephone : String(p.telephone),
        lien,
        estPrincipal: resp.estPrincipal ?? false,
        estTuteurLegal: resp.estTuteurLegal ?? false,
        estResponsableFinancier: resp.estResponsableFinancier ?? false,
        estContactUrgence: resp.estContactUrgence ?? false,
        autoriseRetrait: resp.autoriseRetrait ?? true,
      };
      const texte = [
        `Rattacher à ${nomComplet(r.eleve)} (${val(r.eleve.matricule)}) :`,
        existant
          ? `• fiche EXISTANTE réutilisée : ${nomComplet(existant)}, ${existant.telephone}${existant.enfants ? ` — déjà responsable de : ${existant.enfants}` : ""}`
          : `• NOUVELLE fiche : ${params.prenom} ${String(params.nom).toUpperCase()}, ${params.telephone}`,
        `• lien : ${lien}${decrire(resp) ? ` — ${decrire(resp)}` : ""}`,
        params.estPrincipal ? "• il deviendra le responsable principal, à la place de l'actuel s'il y en a un" : null,
      ]
        .filter(Boolean)
        .join("\n");
      return { ok: true, params, texte };
    },
    verifier: async ({ params, guergne, ctx }) => {
      const liste = await relireResponsables(params.eleveId, { guergne, ctx });
      if (!liste) return { ok: false, raison: "la fiche de l'élève n'a pas pu être relue" };
      const t = liste.find((x) => (params.existantId ? x.id === params.existantId : chiffres(x.telephone) === chiffres(params.telephone)));
      if (!t) return { ok: false, raison: "le parent n'apparaît pas parmi les responsables relus" };
      if (t.lien !== params.lien) return { ok: false, raison: `le lien relu est ${t.lien}, pas ${params.lien}` };
      if (params.estPrincipal && !t.estPrincipal) return { ok: false, raison: "le parent n'est pas relu comme responsable principal" };
      return { ok: true, texte: `✅ Rattachement vérifié : ${nomComplet(t)} (${t.lien}) est désormais responsable de l'élève — ${liste.length} responsable(s) au total.` };
    },
  },
  {
    name: "parents.detacher",
    module: "parents",
    description: "retirer un responsable d'un eleve (le lien seulement : la fiche du parent est conservee). Refuse si c'est le dernier responsable",
    permission: "tuteur:gerer",
    sensitivity: WRITE,
    confirmationObligatoire: true,
    action: "detacherTuteur",
    parametres: { eleve: ELEVE, tuteur: TUTEUR },
    validate: (p) => (required(p.eleve) || required(p.eleveId) ? (required(p.tuteur) ? {} : { tuteur: "Responsable requis." }) : { eleve: "Élève requis." }),
    summarize: () => "Retirer un responsable.",
    preparer: async (p, outils) => {
      const r = await eleveEtResponsables(p.eleveId ?? p.eleve, outils);
      if (!r.ok) return r;
      const c = choisirTuteur(r.tuteurs, p.tuteurId ?? p.tuteur);
      if (!c.ok) return c;
      if (r.tuteurs.length <= 1) return { ok: false, message: "C'est le seul responsable de l'élève : rattachez-en un autre avant de le retirer." };
      const t = c.tuteur;
      return {
        ok: true,
        params: { eleveId: r.eleve.id, tuteurId: t.id },
        texte: [
          `Retirer ${nomComplet(t)} (${t.lien}) des responsables de ${nomComplet(r.eleve)}.`,
          "La fiche du parent est conservée ; seul le lien avec cet élève disparaît.",
          t.estPrincipal ? "⚠️ C'est le responsable principal : désignez-en un autre ensuite." : null,
        ]
          .filter(Boolean)
          .join("\n"),
      };
    },
    verifier: async ({ params, guergne, ctx }) => {
      const liste = await relireResponsables(params.eleveId, { guergne, ctx });
      if (!liste) return { ok: false, raison: "la fiche de l'élève n'a pas pu être relue" };
      if (liste.some((x) => x.id === params.tuteurId)) return { ok: false, raison: "le responsable apparaît toujours à la relecture" };
      return { ok: true, texte: `✅ Retrait vérifié : il reste ${liste.length} responsable(s).` };
    },
  },
  {
    name: "parents.responsabilites",
    module: "parents",
    description:
      "changer le ROLE d'un responsable DEJA rattache : « X devient responsable principal », « la mere est autorisee au retrait », « le pere n'est plus responsable financier », changer son lien. N'ajoute personne",
    permission: "tuteur:gerer",
    sensitivity: WRITE,
    confirmationObligatoire: true,
    action: "modifierResponsabilitesTuteur",
    parametres: { eleve: ELEVE, tuteur: TUTEUR, lien: "facultatif, nouveau lien", ...RESP_DOC },
    validate: (p) => {
      if (!required(p.eleve) && !required(p.eleveId)) return { eleve: "Élève requis." };
      if (!required(p.tuteur) && !required(p.tuteurId)) return { tuteur: "Responsable requis." };
      if (required(p.lien) && !lienDe(p.lien)) return { lien: "Lien inconnu." };
      if (!required(p.lien) && Object.keys(responsabilitesDemandees(p)).length === 0) return { responsabilites: "Précisez ce qui change." };
      return {};
    },
    summarize: () => "Modifier les responsabilites d'un responsable.",
    preparer: async (p, outils) => {
      const r = await eleveEtResponsables(p.eleveId ?? p.eleve, outils);
      if (!r.ok) return r;
      const c = choisirTuteur(r.tuteurs, p.tuteurId ?? p.tuteur);
      if (!c.ok) return c;
      const t = c.tuteur;
      const resp = responsabilitesDemandees(p);
      const lien = lienDe(p.lien);
      if (resp.estPrincipal === false && t.estPrincipal) {
        return { ok: false, message: "Le responsable principal se transfère : désignez plutôt le nouveau principal." };
      }
      const ancien = resp.estPrincipal === true ? r.tuteurs.find((x) => x.estPrincipal && x.id !== t.id) : null;
      return {
        ok: true,
        params: { eleveId: r.eleve.id, tuteurId: t.id, responsabilites: { ...(lien ? { lien } : {}), ...resp } },
        texte: [
          `Pour ${nomComplet(r.eleve)}, ${nomComplet(t)} (${t.lien}) :`,
          lien ? `• lien : ${t.lien} → ${lien}` : null,
          decrire(resp) ? `• ${decrire(resp)}` : null,
          ancien ? `• ${nomComplet(ancien)} cesse d'être responsable principal` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      };
    },
    verifier: async ({ params, guergne, ctx }) => {
      const liste = await relireResponsables(params.eleveId, { guergne, ctx });
      const t = liste?.find((x) => x.id === params.tuteurId);
      if (!t) return { ok: false, raison: "le responsable n'a pas pu être relu" };
      const attendu = params.responsabilites ?? {};
      for (const [k, v] of Object.entries(attendu)) {
        if (t[k] !== v) return { ok: false, raison: `${k === "lien" ? "le lien" : RESPONSABILITES[k]} relu ne correspond pas` };
      }
      const principaux = liste.filter((x) => x.estPrincipal).length;
      if (principaux > 1) return { ok: false, raison: `${principaux} responsables principaux relus` };
      return { ok: true, texte: `✅ Responsabilités vérifiées pour ${nomComplet(t)} (${t.lien}).` };
    },
  },
];
