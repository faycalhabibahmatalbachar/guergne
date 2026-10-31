/**
 * Registre des outils métier. Un outil = une opération réelle de guergne.
 * Les règles de validation reprennent EXACTEMENT celles du code guergne
 * (web/src/app/(main)/dashboard/assiduite/actions.ts et server/domain/vie-scolaire.ts) :
 *   nbHeures ∈ [0.5, 12] ; dureeMinutes retard ∈ [0, 480] ; justification ≤ 200 ;
 *   motif ≥ 3 caractères pour justifier/supprimer.
 */
import { READ, WRITE, SENSITIVE } from "./guard.js";

const required = (v) => v !== undefined && v !== null && v !== "";
const noErrs = () => ({});

function validateAppel(p) {
  const e = {};
  if (!required(p.periodeId)) e.periodeId = "Période requise.";
  if (!required(p.dateAbsence)) e.dateAbsence = "Date requise.";
  const h = p.nbHeures ?? 1;
  if (!(h >= 0.5 && h <= 12)) e.nbHeures = "nbHeures doit être entre 0.5 et 12.";
  if (!Array.isArray(p.absents)) e.absents = "Liste d'absents requise.";
  return e;
}

function validateRetard(p) {
  const e = {};
  if (!required(p.inscriptionId)) e.inscriptionId = "Élève requis.";
  if (!required(p.periodeId)) e.periodeId = "Période requise.";
  if (!required(p.dateRetard)) e.dateRetard = "Date requise.";
  if (p.dureeMinutes != null && !(p.dureeMinutes >= 0 && p.dureeMinutes <= 480)) {
    e.dureeMinutes = "Durée entre 0 et 480 minutes.";
  }
  return e;
}

function validateJustifier(p) {
  const e = {};
  if (!Array.isArray(p.absenceIds) || p.absenceIds.length === 0) e.absenceIds = "Aucune absence sélectionnée.";
  else if (p.absenceIds.length > 200) e.absenceIds = "200 absences au maximum.";
  if (!["JUSTIFIEE", "NON_JUSTIFIEE"].includes(p.statut)) e.statut = "Statut invalide.";
  if (p.statut === "JUSTIFIEE" && (!p.motif || p.motif.trim().length < 3)) e.motif = "Motif requis (≥3 caractères).";
  return e;
}

function validateSupprimer(p) {
  const e = {};
  if (!required(p.absenceId)) e.absenceId = "Absence requise.";
  if (!p.motif || p.motif.trim().length < 3) e.motif = "Motif requis (≥3 caractères).";
  return e;
}

/**
 * Outils du module Assiduité / Vie scolaire.
 * `action` = nom de la fonction guergne appelée à l'exécution.
 * `requiresConfirmation` force une confirmation même pour une écriture ordinaire
 * (cas des modifications en lot).
 */
export const ASSIDUITE_TOOLS = [
  {
    name: "assiduite.consulter_absences",
    module: "assiduite",
    permission: "assiduite:lire",
    sensitivity: READ,
    action: "listerAbsences",
    validate: noErrs,
    summarize: (p) => `Consulter les absences${p.classeId ? " de la classe " + p.classeId : ""}.`,
  },
  {
    name: "assiduite.alertes",
    module: "assiduite",
    permission: "assiduite:lire",
    sensitivity: READ,
    action: "listerAlertes",
    validate: noErrs,
    summarize: () => "Lister les alertes d'assiduité (seuils dépassés).",
  },
  {
    name: "assiduite.controle_saisies",
    module: "assiduite",
    permission: "assiduite:lire",
    sensitivity: READ,
    action: "controleSaisies",
    validate: noErrs,
    summarize: (p) => `Classes sans appel le ${p.date ?? "jour courant"}.`,
  },
  {
    name: "assiduite.enregistrer_appel",
    module: "assiduite",
    permission: "assiduite:saisir",
    sensitivity: WRITE,
    action: "enregistrerAppel",
    validate: validateAppel,
    summarize: (p) =>
      `Enregistrer l'appel du ${p.dateAbsence} : ${(p.absents || []).length} absent(s), ${(p.retards || []).length} retard(s).`,
  },
  {
    name: "assiduite.enregistrer_retard",
    module: "assiduite",
    permission: "retard:saisir",
    sensitivity: WRITE,
    action: "enregistrerRetard",
    validate: validateRetard,
    summarize: (p) => `Enregistrer un retard le ${p.dateRetard}.`,
  },
  {
    name: "assiduite.justifier_absences",
    module: "assiduite",
    permission: "assiduite:justifier",
    sensitivity: WRITE,
    requiresConfirmation: true,
    action: "justifierEnLot",
    validate: validateJustifier,
    summarize: (p) =>
      `${p.statut === "JUSTIFIEE" ? "Justifier" : "Repasser en non justifiée"} ${(p.absenceIds || []).length} absence(s).`,
  },
  {
    name: "assiduite.supprimer_absence",
    module: "assiduite",
    permission: "assiduite:saisir",
    sensitivity: SENSITIVE,
    requiresConfirmation: true,
    action: "supprimerAbsence",
    validate: validateSupprimer,
    summarize: (p) => `SUPPRIMER une absence (motif : ${p.motif}).`,
  },
];

export class ToolRegistry {
  constructor(tools = []) {
    this._byName = new Map();
    for (const t of tools) this.register(t);
  }
  register(t) {
    this._byName.set(t.name, t);
  }
  get(name) {
    return this._byName.get(name) ?? null;
  }
  all() {
    return [...this._byName.values()];
  }
}
