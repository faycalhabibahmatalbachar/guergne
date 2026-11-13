/**
 * Résolution centrale des entités : ce que l'utilisateur a NOMMÉ devient ce que
 * le backend IDENTIFIE.
 *
 * POURQUOI UN SEUL ENDROIT
 * ------------------------
 * Chaque outil résolvait à sa façon — ou pas du tout. Les plus anciens
 * attendaient un `classeId`, un `periodeId`, un `eleveId` : c'était au modèle
 * de recopier un UUID depuis une liste collée dans son invite. Il le faisait
 * souvent, pas toujours, et un UUID recopié de travers ne se distingue pas d'un
 * UUID inventé. Les plus récents résolvaient les noms dans leur `preparer`,
 * chacun avec ses propres messages et sans mémoire du choix proposé.
 *
 * Ici, une seule règle pour tous les outils :
 *   - le modèle écrit ce que l'utilisateur a dit (« 6e A », « 2e trimestre »,
 *     « Amina », « M. Hassan ») ;
 *   - le résolveur le compare aux données RELUES au backend, dans le périmètre
 *     de l'acteur ;
 *   - un seul candidat : l'identifiant est posé ;
 *   - plusieurs : une question ciblée, avec les candidats, dont la réponse
 *     (« 2 », « celle de 6e B », un matricule) est comprise au tour suivant ;
 *   - aucun : on le dit, et on dit ce qui existe.
 *
 * Jamais d'identifiant inventé, jamais de choix arbitraire entre homonymes.
 *
 * LE FOYER
 * --------
 * `foyer` porte les entités dont on vient de parler (mémoire de session). Le
 * modèle les désigne par des JETONS — `@eleve_courant`, `@classe_courante`,
 * `@eleves_du_resultat` — et non par des identifiants qu'il n'a jamais vus.
 * Un jeton sans foyer correspondant produit une question, pas une supposition.
 */
import { canoniserClasse, normaliser, proximite, resoudreClasse, resoudreEleve } from "./resolveur.js";
import { resoudreNomsEleves, separerNoms } from "./resolution-eleves.js";
import { numeroPeriode } from "./tools-scolarite.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const estUuid = (v) => typeof v === "string" && UUID.test(v);
const dit = (v) => v !== undefined && v !== null && String(v).trim() !== "";
const lignesDe = (r) => (Array.isArray(r?.data) ? r.data : Array.isArray(r?.data?.lignes) ? r.data.lignes : []);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const JETONS = {
  ELEVE: "@eleve_courant",
  CLASSE: "@classe_courante",
  ELEVES: "@eleves_du_resultat",
};
const estJeton = (v) => typeof v === "string" && v.trim().startsWith("@");

/** Mots qui désignent quelqu'un sans le nommer. */
const PRONOM_ELEVE = /\b(sa|son|ses|lui|il|elle|cet eleve|cette eleve|ce dossier)\b/;
const PRONOM_PLURIEL = /\b(leurs?|eux|elles|ils|ces eleves|ceux-la|les memes)\b/;

const MAX_CANDIDATS = 8;

/** Les niveaux tels qu'on les dit, pour reconnaître « la sixième à ». */
const NIVEAUX_DITS = "sixi[eè]me|cinqui[eè]me|quatri[eè]me|troisi[eè]me|seconde|premi[eè]re|terminale|[3-6](?:e|[eè]me)|2nde|1[eè]re";

const nomEleve = (e) => `${e.prenom ?? ""} ${e.nom ?? ""}`.trim();
const libelleCandidatEleve = (e) =>
  `${nomEleve(e)}${e.classeLibelle ? ` — ${e.classeLibelle}` : ""}${e.matricule ? ` (${e.matricule})` : ""}`;

function question(quoi, candidats, total = null) {
  const lignes = candidats.map((c, i) => `${i + 1}. ${c.libelle}`);
  const reste = total && total > candidats.length ? `\n… et ${total - candidats.length} autre(s) : précisez davantage.` : "";
  return `Plusieurs ${quoi} correspondent. Lequel ? Répondez par le numéro, ou précisez :\n${lignes.join("\n")}${reste}`;
}

/** « l'élève Mahamat », « matricule 1230 » → ce qui désigne vraiment l'élève. */
function nettoyerEleve(v) {
  return String(v ?? "")
    .replace(/^\s*(l['’]\s*)?[ée]l[èe]ve\s+/iu, "")
    .replace(/^\s*(matricule|n°|numero|numéro)\s*:?\s*/iu, "")
    .trim();
}

/** « la classe de 6e A », « en 6e A » → « 6e A ». */
function nettoyerClasse(v) {
  return String(v ?? "")
    .replace(/^\s*(en\s+|dans\s+)?(la\s+|le\s+|les\s+)?(classes?\s+)?(de\s+la\s+|de\s+|du\s+|d['’])?(la\s+)?/iu, "")
    .trim();
}

/**
 * Comprend la réponse à une question de choix.
 *
 * « 2 », « le 2 », « la deuxième », un matricule, une classe (« celle de
 * 6e B »), ou assez du libellé pour ne désigner qu'un candidat.
 *
 * @returns {object|null} le candidat désigné, ou null si la réponse n'en désigne aucun
 */
export function choisir(choix, texte) {
  const candidats = choix?.candidats ?? [];
  if (!candidats.length) return null;
  const n = normaliser(texte);
  if (!n) return null;

  const ORDINAUX = { premier: 1, premiere: 1, un: 1, deuxieme: 2, second: 2, seconde: 2, deux: 2, troisieme: 3, trois: 3, quatrieme: 4, quatre: 4, cinquieme: 5, cinq: 5, dernier: candidats.length, derniere: candidats.length };
  const chiffre = n.match(/^(?:le |la |numero |n |choix |option )?(\d{1,2})(?:e|eme|er|ere)?$/);
  if (chiffre) return candidats[Number(chiffre[1]) - 1] ?? null;
  const mots = n.split(" ");
  if (mots.length <= 3) {
    const o = mots.map((m) => ORDINAUX[m]).find(Boolean);
    if (o) return candidats[o - 1] ?? null;
  }

  // Un indice propre à un seul candidat : matricule, classe, ou un mot du libellé.
  const parIndice = candidats.filter((c) => (c.indices ?? []).some((i) => i && (n === normaliser(i) || n.includes(normaliser(i)))));
  if (parIndice.length === 1) return parIndice[0];
  const classeDite = canoniserClasse(n.replace(/^(celui|celle|l eleve|eleve)?\s*(de|du|en|dans)?\s*(la\s+)?/, ""));
  const parClasse = candidats.filter((c) => c.classe && canoniserClasse(c.classe) === classeDite);
  if (parClasse.length === 1) return parClasse[0];
  const finDeMatricule = n.match(/\d{3,}/)?.[0];
  if (finDeMatricule) {
    const parFin = candidats.filter((c) => String(c.matricule ?? "").endsWith(finDeMatricule));
    if (parFin.length === 1) return parFin[0];
  }
  const parLibelle = candidats.filter((c) => normaliser(c.libelle).includes(n));
  if (parLibelle.length === 1) return parLibelle[0];
  return null;
}

export class Resolveur {
  /**
   * @param {object} o
   * @param {object} o.guergne       client du backend
   * @param {object} o.referentiel   Referentiel (classes et périodes, en cache)
   * @param {() => Date} [o.maintenant]
   */
  constructor({ guergne, referentiel, maintenant = () => new Date() }) {
    this._guergne = guergne;
    this._referentiel = referentiel;
    this._maintenant = maintenant;
  }

  choisir(choix, texte) {
    return choisir(choix, texte);
  }

  /** Après une écriture sur les classes : la liste en cache est périmée. */
  oublierReferentiel(acteurId) {
    this._referentiel.oublier?.(acteurId);
  }

  /**
   * @param {object} o
   * @param {object} o.outil   l'outil du registre
   * @param {object} o.params  ce que le modèle a écrit
   * @param {object} o.staff   l'acteur
   * @param {object} [o.foyer] entités du fil (mémoire de session)
   * @param {string} [o.texte] le message, pour reconnaître un pronom
   * @returns {Promise<{statut:"ok", params:object, notes:string[]} |
   *                   {statut:"clarifier", question:string, choix?:object, champs?:string[]}>}
   */
  async resoudre({ outil, params, staff, foyer = null, texte = "" }) {
    const p = { ...(params ?? {}) };
    const ctx = { actorId: staff?.id };
    const declare = (n) => Object.prototype.hasOwnProperty.call(outil?.parametres ?? {}, n) || Boolean(outil?.nommes?.[n]);
    const notes = [];
    const n = normaliser(texte);
    const clarifier = (q, extra = {}) => ({ statut: "clarifier", question: q, ...extra });

    // --- 1. Jetons du foyer, et pronoms -----------------------------------
    for (const cle of ["eleve", "eleveId"]) {
      if (estJeton(p[cle])) {
        if (!foyer?.eleveId) return clarifier("De quel élève parlez-vous ? Donnez son nom ou son matricule.", { champs: ["eleve"] });
        delete p[cle];
        p.eleveId = foyer.eleveId;
      }
    }
    for (const cle of ["classe", "classeId"]) {
      if (estJeton(p[cle])) {
        if (!foyer?.classeId) return clarifier("De quelle classe parlez-vous ?", { champs: ["classe"] });
        delete p[cle];
        p.classeId = foyer.classeId;
      }
    }
    if (estJeton(p.eleves)) {
      const ids = foyer?.eleveIds ?? [];
      if (!ids.length) {
        return clarifier("Je n'ai pas de liste d'élèves en cours. Dites-moi de quels élèves ou de quelle classe il s'agit.", { champs: ["eleves"] });
      }
      delete p.eleves;
      p.eleveIds = ids;
      if (foyer.eleveIdsTronques) notes.push("⚠️ La liste précédente était tronquée : seuls les élèves affichés sont pris en compte.");
    }
    // Une LISTE d'élèves donnée à un outil qui ne sait pas en filtrer une : le
    // backend l'ignorerait et rendrait l'école entière (observé au banc :
    // « parmi eux, lesquels ont été absents ? » → 60 absences de toutes les
    // classes). Un seul élève devient `eleveId` ; une liste issue d'une classe
    // devient cette classe ; sinon, on le dit.
    if (Array.isArray(p.eleveIds) && !declare("eleves") && !declare("eleveIds")) {
      const ids = p.eleveIds;
      delete p.eleveIds;
      if (ids.length === 1 && (declare("eleve") || declare("eleveId"))) {
        p.eleveId = ids[0];
      } else if (foyer?.classeId && (declare("classeId") || declare("classe")) && !dit(p.classe) && !dit(p.classeId)) {
        p.classeId = foyer.classeId;
        notes.push("(Consulté pour toute la classe des élèves listés.)");
      } else if (!(dit(p.classe) || dit(p.classeId))) {
        return clarifier("Cette consultation ne sait pas se limiter à une liste d'élèves. Donnez une classe, ou un élève.", { champs: ["classe"] });
      }
    }

    // Filet : l'outil exige un élève, le modèle n'en a mis aucun, mais le
    // message le désigne par un pronom et le fil en porte un.
    const veutEleve = declare("eleve") || declare("eleveId");
    if (veutEleve && !dit(p.eleve) && !dit(p.eleveId) && !dit(p.classe) && !dit(p.classeId) && !p.eleveIds) {
      if (foyer?.eleveId && PRONOM_ELEVE.test(n)) p.eleveId = foyer.eleveId;
      else if (declare("eleves") && foyer?.eleveIds?.length && PRONOM_PLURIEL.test(n)) p.eleveIds = foyer.eleveIds;
    }

    const listes = await this._referentiel.pour(staff?.id);

    // --- 2. Classe -----------------------------------------------------------
    const classeDite = dit(p.classe) ? p.classe : dit(p.classeId) ? p.classeId : null;
    let classeId = null;
    if (classeDite !== null) {
      if (!listes.classes.length) {
        return clarifier("Je n'arrive pas à lire la liste des classes pour l'instant. Réessayez dans un instant.");
      }
      if (estUuid(classeDite)) {
        if (!listes.classes.some((c) => c.id === classeDite)) {
          return clarifier("Cette classe n'existe pas dans l'année scolaire en cours. Donnez son nom, par exemple « 6e A ».", { champs: ["classe"] });
        }
        classeId = classeDite;
      } else {
        let propre = nettoyerClasse(classeDite) || String(classeDite);
        // « la sixième à » : la lettre A, mal transcrite en préposition. Si le
        // modèle n'a transmis que le niveau, le message, lui, porte la lettre.
        const lettreA = new RegExp("\\b(" + NIVEAUX_DITS + ")\\s+à(?=\\s|$|[?.!,])", "iu");
        if (/^\s*\S+\s*$/.test(propre) && lettreA.test(String(texte ?? "")) && !/\s[a-z]$/i.test(propre)) {
          const m = String(texte).match(lettreA);
          if (m && canoniserClasse(m[1]) === canoniserClasse(propre)) propre = propre + " A";
        }
        const r = await this._classe(propre, staff);
        listes.classes = r.classes ?? listes.classes;
        if (r.statut === "unique") classeId = r.classe.id;
        else if (r.statut === "ambigu") {
          const candidats = r.candidats.slice(0, MAX_CANDIDATS).map((c) => ({ id: c.id, libelle: c.libelle ?? c.code, classe: c.libelle, indices: [c.libelle, c.code] }));
          return clarifier(question("classes", candidats), {
            choix: { champ: declare("classeId") || !declare("classe") ? "classeId" : "classe", retirer: ["classe", "classeId"], candidats },
          });
        } else {
          const existantes = listes.classes.map((c) => c.libelle ?? c.code).slice(0, 30).join(", ");
          return clarifier(`Je ne retrouve pas la classe « ${String(classeDite).slice(0, 40)} ». Classes de l'année : ${existantes}.`, { champs: ["classe"] });
        }
      }
      delete p.classe;
      delete p.classeId;
      // L'outil reçoit la classe là où il la déclare : `classeId` pour les
      // outils d'origine, `classe` (identifiant accepté) pour ceux qui la
      // relisent dans leur `preparer`.
      if (declare("classeId") || !declare("classe")) p.classeId = classeId;
      else p.classe = classeId;
    }

    // --- 3. Période ----------------------------------------------------------
    if (declare("periodeId")) {
      const periodeDite = dit(p.periode) ? p.periode : dit(p.periodeId) && !estUuid(p.periodeId) ? p.periodeId : dit(p.periodeNumero) ? p.periodeNumero : null;
      if (estUuid(p.periodeId) && !listes.periodes.some((x) => x.id === p.periodeId)) {
        return clarifier("Cette période n'existe pas dans l'année scolaire en cours. Dites « premier », « deuxième » ou « troisième trimestre ».", { champs: ["periode"] });
      }
      if (periodeDite !== null) {
        const r = this._periode(listes.periodes, periodeDite);
        // « la semaine dernière » rangée dans `periode` alors que les dates
        // sont données à côté : ce sont les dates qui parlent.
        if (!r.ok && !(dit(p.depuis) || dit(p.jusqua))) return clarifier(r.message, { champs: ["periode"] });
        if (r.ok) p.periodeId = r.periode.id;
        else delete p.periodeId;
        // Un trimestre qui ne contient pas les dates demandées viderait la
        // réponse sans le dire : les dates, plus précises, l'emportent.
        if (r.ok && (dit(p.depuis) || dit(p.jusqua))) {
          const d = String(r.periode.dateDebut ?? r.periode.date_debut ?? "").slice(0, 10);
          const fn = String(r.periode.dateFin ?? r.periode.date_fin ?? "").slice(0, 10);
          const hors = (x) => dit(x) && d && fn && (String(x) < d || String(x) > fn);
          if (hors(p.depuis) || hors(p.jusqua)) {
            delete p.periodeId;
            notes.push(`(Les dates demandées ne sont pas dans le ${r.periode.libelle} : ce sont elles qui ont été retenues.)`);
          }
        }
      }
      delete p.periode;
      delete p.periodeNumero;
      if (!dit(p.periodeId) && /^obligatoire/i.test(String(outil.parametres?.periodeId ?? ""))) {
        // Une écriture datée : la période est celle qui contient la date.
        const date = [p.dateAbsence, p.dateRetard, p.dateIncident, p.date].find((d) => DATE.test(String(d ?? "")));
        if (date) {
          const contient = listes.periodes.find((x) => String(x.dateDebut ?? x.date_debut).slice(0, 10) <= date && date <= String(x.dateFin ?? x.date_fin).slice(0, 10));
          if (!contient) {
            return clarifier(`Le ${date} n'appartient à aucune période de l'année scolaire en cours : je ne peux pas enregistrer à cette date.`, { champs: ["date"] });
          }
          p.periodeId = contient.id;
        } else if (outil.sensitivity === "read") {
          const defaut = this._periodeParDefaut(listes.periodes);
          if (defaut) {
            p.periodeId = defaut.id;
            notes.push(`Période retenue : ${defaut.libelle}.`);
          }
        }
      }
    }

    // --- 4. Élèves nommés dans une classe (appel, retard) -------------------
    if (outil?.nommes) {
      const champs = Object.keys(outil.nommes).filter((c) => dit(p[c]) || (c === "eleve" && estUuid(p.eleveId)));
      if (champs.length) {
        if (!p.classeId) {
          // La classe n'a pas été dite : celle de l'élève nommé, s'il est unique.
          const premiers = separerNoms(p[champs[0]] ?? "");
          const r = estUuid(p.eleveId) ? await this._eleveParId(p.eleveId, ctx) : await this.chercherEleve(premiers[0], { ctx });
          if (r.statut !== "unique") return this._issueEleve(r, premiers[0], "eleveId");
          if (!r.eleve.classeId) return clarifier(`${nomEleve(r.eleve)} n'a pas d'inscription active cette année.`);
          p.classeId = r.eleve.classeId;
          if (!dit(p[champs[0]])) p[champs[0]] = nomEleve(r.eleve);
        }
        delete p.eleveId;
        const conv = await resoudreNomsEleves({ outil, params: p, guergne: this._guergne, acteurId: staff?.id });
        if (conv.statut === "clarifier") return clarifier(conv.question, { champs });
        Object.keys(p).forEach((k) => delete p[k]);
        Object.assign(p, conv.params);
      }
    } else if (veutEleve && !estUuid(p.eleveId) && (dit(p.eleve) || dit(p.eleveId))) {
      // --- 5. Élève ----------------------------------------------------------
      const designation = dit(p.eleve) ? p.eleve : p.eleveId;
      const r = await this.chercherEleve(designation, { ctx, classeId: classeId ?? (estUuid(p.classeId) ? p.classeId : null) });
      if (r.statut !== "unique") return this._issueEleve(r, designation, "eleveId");
      p.eleveId = r.eleve.id;
      if (r.approchee) notes.push(`(J'ai compris « ${String(designation).trim()} » comme ${nomEleve(r.eleve)}.)`);
    }

    // --- 6. Enseignant -------------------------------------------------------
    if (declare("enseignantId") && (dit(p.enseignant) || (dit(p.enseignantId) && !estUuid(p.enseignantId)))) {
      const designation = String(p.enseignant ?? p.enseignantId).replace(/^\s*(m\.?|mme\.?|monsieur|madame|mlle|professeur|prof\.?|l['’]enseignante?)\s+/iu, "");
      const r = await this._parmi(lignesDe(await this._guergne.listerEnseignants({}, ctx)), designation, (e) => [nomEleve(e), `${e.nom} ${e.prenom}`, e.nom, e.prenom, e.matricule]);
      if (r.statut === "aucun") return clarifier(`Je ne retrouve aucun enseignant nommé « ${designation} ».`, { champs: ["enseignant"] });
      if (r.statut === "ambigu") {
        const candidats = r.candidats.map((e) => ({ id: e.id, libelle: `${nomEleve(e)}${e.matierePrincipale ? ` — ${e.matierePrincipale}` : ""}`, indices: [e.matricule, e.matierePrincipale] }));
        return clarifier(question("enseignants", candidats), { choix: { champ: "enseignantId", retirer: ["enseignant"], candidats } });
      }
      p.enseignantId = r.element.id;
    }
    delete p.enseignant;

    // --- 7. Matière ----------------------------------------------------------
    if (declare("matiereId") && (dit(p.matiere) || (dit(p.matiereId) && !estUuid(p.matiereId)))) {
      const designation = String(p.matiere ?? p.matiereId);
      const rm = await this._guergne.listerClassesEtMatieres({}, ctx);
      const r = await this._parmi(rm?.data?.matieres ?? [], designation, (m) => [m.libelle, m.libelleCourt, m.code]);
      if (r.statut !== "unique") return clarifier(`Je ne retrouve pas la matière « ${designation} ».`, { champs: ["matiere"] });
      p.matiereId = r.element.id;
    }
    delete p.matiere;

    // --- 8. Année scolaire ---------------------------------------------------
    if (dit(p.annee)) {
      const r = await this._annee(p.annee, ctx);
      if (!r.ok) return clarifier(r.message, { champs: ["annee"] });
      if (r.anneeId && declare("anneeId")) p.anneeId = r.anneeId;
      else if (r.anneeId) return clarifier(`Cette consultation ne porte que sur l'année scolaire en cours (${r.courante}).`);
    }
    delete p.annee;

    return { statut: "ok", params: p, notes };
  }

  // --------------------------------------------------------------------------

  /**
   * Une classe parmi celles de l'année. Le CODE d'abord (« 6A », « 4B »,
   * « TD ») — sauf s'il n'est qu'un niveau (« 6e » désigne la sixième, pas une
   * classe dont le code serait « 6E »). Une classe introuvable fait relire la
   * liste une fois : elle vient peut-être d'être créée.
   */
  async _classe(propre, staff) {
    const essayer = (classes) => {
      const compact = (x) => normaliser(x).split(" ").join("");
      const niveauSeul = /^([1-6]|t)$/.test(canoniserClasse(propre));
      if (niveauSeul) {
        // Un niveau seul désigne TOUTES ses classes : « 6e » face à « 6ème A »,
        // « 6ème B » et une classe nommée « 6E » est une question, pas un choix.
        const niveau = canoniserClasse(propre);
        const duNiveau = classes.filter((c) => {
          const k = canoniserClasse(c.libelle ?? c.code ?? "");
          return k === niveau || k.startsWith(niveau + " ");
        });
        if (duNiveau.length > 1) return { statut: "ambigu", candidats: duNiveau };
      }
      const parCode = niveauSeul ? [] : classes.filter((c) => c.code && compact(c.code) === compact(propre));
      return parCode.length === 1 ? { statut: "unique", classe: parCode[0] } : resoudreClasse(classes, propre);
    };
    let classes = (await this._referentiel.pour(staff?.id)).classes;
    let r = essayer(classes);
    if (r.statut === "aucun" && typeof this._referentiel.oublier === "function") {
      this._referentiel.oublier(staff?.id);
      classes = (await this._referentiel.pour(staff?.id)).classes;
      r = essayer(classes);
    }
    return { ...r, classes };
  }

  _issueEleve(r, designation, champ) {
    if (r.statut === "erreur") return { statut: "clarifier", question: r.message };
    if (r.statut === "ambigu") {
      // Toujours dans le même ordre (le matricule) : la question est
      // reproductible, et « le 2 » désigne le même élève d'une fois à l'autre.
      const tries = [...r.candidats].sort((a, b) => String(a.matricule ?? "").localeCompare(String(b.matricule ?? "")));
      const candidats = tries.slice(0, MAX_CANDIDATS).map((e) => ({
        id: e.id ?? e.eleveId,
        libelle: libelleCandidatEleve(e),
        matricule: e.matricule,
        classe: e.classeLibelle ?? null,
        indices: [e.matricule],
      }));
      return {
        statut: "clarifier",
        question: question("élèves", candidats, r.total ?? r.candidats.length),
        choix: { champ, retirer: ["eleve"], candidats },
      };
    }
    return {
      statut: "clarifier",
      question: `Aucun élève ne correspond à « ${String(designation ?? "").trim().slice(0, 60)} ». Vérifiez l'orthographe, ou donnez son matricule.`,
      champs: ["eleve"],
    };
  }

  async _eleveParId(eleveId, ctx) {
    const r = await this._guergne.consulterEleve({ eleveId }, ctx);
    const e = r?.data?.eleve;
    if (!e) return { statut: "aucun" };
    const i = r.data.inscription ?? {};
    return { statut: "unique", eleve: { ...e, classeId: i.classeId ?? e.classeId ?? null, classeLibelle: i.classeLibelle ?? e.classeLibelle ?? null } };
  }

  /**
   * Un élève, par ce qu'on en a dit : nom, prénom, les deux, un matricule entier
   * ou sa fin, avec ou sans faute.
   *
   * Le backend cherche par sous-chaîne : une lettre fausse et il ne rend rien.
   * On cherche donc d'abord la désignation entière, puis mot par mot, puis par
   * le début de chaque mot, et c'est la comparaison approchée, ici, qui tranche
   * parmi tout ce qui est remonté.
   *
   * @returns {Promise<{statut:"unique", eleve:object, approchee:boolean} | {statut:"ambigu", candidats:object[], total:number} | {statut:"aucun"} | {statut:"erreur", message:string}>}
   */
  async chercherEleve(designation, { ctx, classeId = null } = {}) {
    if (estUuid(designation)) return this._eleveParId(designation, ctx);
    const demande = nettoyerEleve(designation);
    if (demande.length < 2) return { statut: "aucun" };
    const filtre = classeId ? { classeId } : {};
    const vus = new Map();
    let total = 0;
    const chercher = async (recherche) => {
      const r = await this._guergne.rechercherEleves({ recherche, parPage: 50, ...filtre }, ctx);
      if (r?.ok === false) throw new Error(r.message ?? "la recherche d'élève a échoué");
      for (const e of lignesDe(r)) vus.set(e.id ?? e.eleveId, { ...e, id: e.id ?? e.eleveId });
      total = Math.max(total, Number(r?.data?.total ?? 0));
    };
    try {
      await chercher(demande);
      const mots = demande.split(/\s+/).filter((m) => m.length >= 3);
      if (vus.size === 0 && mots.length > 1) for (const m of mots) await chercher(m);
      if (vus.size === 0) for (const m of mots.length ? mots : [demande]) if (m.length >= 4) await chercher(m.slice(0, 3));
    } catch (e) {
      return { statut: "erreur", message: `Je n'ai pas pu chercher l'élève : ${String(e.message).slice(0, 120)}` };
    }
    const lignes = [...vus.values()];
    if (!lignes.length) return { statut: "aucun" };

    // Un matricule, entier ou par sa fin (« le 1230 »).
    const cible = normaliser(demande);
    const chiffres = demande.replace(/\D/g, "");
    if (chiffres.length >= 3 && chiffres.length >= demande.replace(/[\s-]/g, "").length - 4) {
      const parMatricule = lignes.filter((e) => normaliser(e.matricule) === cible || String(e.matricule ?? "").replace(/\D/g, "").endsWith(chiffres));
      if (parMatricule.length === 1) return { statut: "unique", eleve: parMatricule[0], approchee: false };
      if (parMatricule.length > 1) return { statut: "ambigu", candidats: parMatricule, total: parMatricule.length };
    }

    // Deux fiches au nom strictement identique : jamais de choix arbitraire.
    const exacts = lignes.filter((e) => [nomEleve(e), `${e.nom ?? ""} ${e.prenom ?? ""}`].some((x) => normaliser(x) === cible));
    if (exacts.length === 1) return { statut: "unique", eleve: exacts[0], approchee: false };
    if (exacts.length > 1) return { statut: "ambigu", candidats: exacts, total: exacts.length };

    const choix = resoudreEleve(lignes, demande);
    if (choix.statut === "unique") {
      const e = choix.eleve;
      const exacte = [e.nom, e.prenom, e.matricule].filter(Boolean).some((x) => normaliser(x) === cible);
      // Un prénom ou un nom seul, porté par un seul élève de la recherche mais
      // peut-être par d'autres au-delà de la page : on vérifie le total.
      if (exacte && total > lignes.length) return { statut: "ambigu", candidats: lignes, total };
      return { statut: "unique", eleve: e, approchee: !exacte };
    }
    if (choix.statut === "ambigu") return { statut: "ambigu", candidats: choix.candidats.length >= 2 ? this._trier(lignes, demande) : lignes, total: Math.max(total, lignes.length) };
    return { statut: "aucun" };
  }

  /** Les candidats les plus proches d'abord. */
  _trier(lignes, demande) {
    return [...lignes]
      .map((e) => ({ e, s: Math.max(proximite(demande, nomEleve(e)), proximite(demande, e.nom ?? ""), proximite(demande, e.prenom ?? "")) }))
      .filter((x) => x.s >= 0.75)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.e);
  }

  /** Recherche approchée d'un élément dans une liste, par plusieurs libellés. */
  async _parmi(liste, demande, libelles) {
    const notes = (liste ?? [])
      .map((x) => ({ x, s: Math.max(0, ...libelles(x).filter(Boolean).map((l) => proximite(demande, l))) }))
      .sort((a, b) => b.s - a.s);
    const bons = notes.filter((n) => n.s >= 0.75);
    if (!bons.length) return { statut: "aucun" };
    if (bons.length === 1 || bons[0].s - bons[1].s >= 0.15 || (bons[0].s === 1 && bons[1].s < 1)) return { statut: "unique", element: bons[0].x };
    return { statut: "ambigu", candidats: bons.slice(0, MAX_CANDIDATS).map((n) => n.x) };
  }

  _periode(periodes, designation) {
    if (!periodes.length) return { ok: false, message: "Je n'arrive pas à lire les périodes de l'année pour l'instant. Réessayez dans un instant." };
    const parLibelle = periodes.find((x) => normaliser(x.libelle) === normaliser(designation));
    if (parLibelle) return { ok: true, periode: parLibelle };
    const r = numeroPeriode(Number.isInteger(Number(designation)) && String(designation).trim().length <= 2 ? Number(designation) : designation);
    if (r.erreur || !r.numero) return { ok: false, message: r.erreur ?? "Quelle période ? Dites « premier », « deuxième » ou « troisième trimestre »." };
    const p = periodes.find((x) => Number(x.numero) === r.numero);
    return p ? { ok: true, periode: p } : { ok: false, message: `L'année en cours n'a pas de période n°${r.numero}.` };
  }

  /** La période qui contient aujourd'hui ; à défaut la dernière commencée ; à défaut la première. */
  _periodeParDefaut(periodes) {
    const jour = this._maintenant().toISOString().slice(0, 10);
    const debut = (x) => String(x.dateDebut ?? x.date_debut ?? "").slice(0, 10);
    const fin = (x) => String(x.dateFin ?? x.date_fin ?? "").slice(0, 10);
    const tri = [...periodes].sort((a, b) => debut(a).localeCompare(debut(b)));
    return tri.find((x) => debut(x) <= jour && jour <= fin(x)) ?? tri.filter((x) => debut(x) <= jour).at(-1) ?? tri[0] ?? null;
  }

  async _annee(designation, ctx) {
    const rc = await this._guergne.anneeCourante({}, ctx);
    const courante = rc?.data?.libelle ?? null;
    const t = normaliser(designation);
    const annees = String(designation).match(/\d{4}/g) ?? [];
    const vise = annees.length ? annees.slice(0, 2).join("-") : null;
    if (/cette annee|annee en cours|annee courante|annee actuelle/.test(t) || (courante && vise && courante.startsWith(vise))) return { ok: true, anneeId: null, courante };
    if (typeof this._guergne.listerAnnees === "function" && vise) {
      const r = await this._guergne.listerAnnees({}, ctx);
      const a = lignesDe(r).find((x) => String(x.libelle).startsWith(vise));
      if (a) return { ok: true, anneeId: a.id, courante };
      const connues = lignesDe(r).map((x) => x.libelle).join(", ");
      return { ok: false, message: `Je n'ai aucune donnée pour l'année ${vise}. Années enregistrées : ${connues || courante || "aucune"}.` };
    }
    return { ok: false, message: `Je ne peux consulter que l'année scolaire en cours${courante ? ` (${courante})` : ""}.` };
  }
}
