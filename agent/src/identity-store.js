/**
 * Associations persistantes : numéro WhatsApp → compte interne guergne.
 *
 * POURQUOI CE MODULE REMPLACE LE MAGASIN EN MÉMOIRE
 * --------------------------------------------------
 * `IdentityStore` repartait vide à chaque redémarrage : plus personne n'était
 * reconnu, et l'agent refusait tout le monde. Les associations doivent donc
 * vivre sur le volume persistant, au même titre que la session WhatsApp.
 *
 * CE QUI N'EST PAS FAIT ICI, DÉLIBÉRÉMENT
 * ----------------------------------------
 * Aucune association automatique. Un numéro inconnu qui écrit n'est JAMAIS lié
 * de lui-même : ce serait offrir le compte d'un responsable à quiconque connaît
 * le numéro de l'établissement. Toute liaison est explicite, tracée, et porte
 * l'identité de qui l'a décidée.
 *
 * Les numéros ne sont jamais écrits dans le dépôt : ils vivent dans le fichier
 * de données du serveur, provisionné séparément.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Normalise un numéro en forme comparable : chiffres seuls. */
export function normaliserNumero(valeur) {
  return String(valeur ?? "").replace(/\D/g, "");
}

/** Extrait le numéro d'un JID WhatsApp (`235xxxxxxxx@c.us`). */
export function numeroDeJid(jid) {
  return normaliserNumero(String(jid ?? "").split("@")[0]);
}

function ecrireAtomique(chemin, contenu) {
  mkdirSync(dirname(chemin), { recursive: true });
  const tmp = `${chemin}.tmp`;
  writeFileSync(tmp, contenu, "utf8");
  renameSync(tmp, chemin);
}

export class IdentityStorePersistant {
  /**
   * @param chemin  fichier JSON sur le volume persistant
   * @param journal fonction (evenement) => void pour tracer les liaisons
   */
  constructor({ chemin, journal = null, horloge = () => new Date().toISOString() } = {}) {
    this._chemin = chemin;
    this._journal = journal;
    this._horloge = horloge;
    this._parNumero = new Map();
    this._charger();
  }

  _charger() {
    if (!this._chemin || !existsSync(this._chemin)) return;
    try {
      const d = JSON.parse(readFileSync(this._chemin, "utf8"));
      for (const a of Array.isArray(d) ? d : []) {
        if (a?.numero) this._parNumero.set(normaliserNumero(a.numero), a);
      }
    } catch {
      // Fichier illisible : on repart vide plutôt que de reconnaître n'importe
      // qui. Le défaut sûr est de ne reconnaître personne.
    }
  }

  _sauver() {
    if (this._chemin) ecrireAtomique(this._chemin, JSON.stringify([...this._parNumero.values()], null, 2));
  }

  _tracer(evenement, details) {
    this._journal?.({ type: "identite", evenement, at: this._horloge(), ...details });
  }

  /**
   * Résout un JID. Renvoie null si le numéro est inconnu, révoqué ou suspendu —
   * trois situations distinctes, mais une seule conséquence : aucune action.
   */
  resolve(jid) {
    const a = this._parNumero.get(numeroDeJid(jid));
    if (!a || a.revoqueLe || a.suspendu) return null;
    return { id: a.utilisateurId, nom: a.nom, role: a.role, msisdn: a.numero };
  }

  /** État détaillé, pour l'administration et le diagnostic. */
  etatDe(jid) {
    const a = this._parNumero.get(numeroDeJid(jid));
    if (!a) return { statut: "inconnu" };
    if (a.revoqueLe) return { statut: "revoque", revoqueLe: a.revoqueLe };
    if (a.suspendu) return { statut: "suspendu" };
    return { statut: "actif", role: a.role };
  }

  /**
   * Associe un numéro à un compte interne.
   *
   * @param parQui identité de l'administrateur qui décide — jamais "système".
   *               Une liaison sans auteur ne serait pas auditable.
   * @returns {{ok:true}|{ok:false, raison:string}}
   */
  lier({ numero, utilisateurId, nom, role, parQui }) {
    const n = normaliserNumero(numero);
    if (!n || n.length < 8) return { ok: false, raison: "numero_invalide" };
    if (!utilisateurId || !role) return { ok: false, raison: "compte_incomplet" };
    if (!parQui) return { ok: false, raison: "auteur_requis" };

    const existant = this._parNumero.get(n);
    if (existant && !existant.revoqueLe) {
      // Un numéro déjà lié à un AUTRE compte ne se détourne pas en silence :
      // il faut d'abord révoquer explicitement.
      if (existant.utilisateurId !== utilisateurId) return { ok: false, raison: "deja_lie" };
      return { ok: false, raison: "deja_lie_meme_compte" };
    }

    this._parNumero.set(n, {
      numero: n,
      utilisateurId,
      nom: nom ?? null,
      role,
      lieLe: this._horloge(),
      liePar: parQui,
      revoqueLe: null,
      suspendu: false,
    });
    this._sauver();
    // On trace l'identifiant du compte, jamais le numéro complet.
    this._tracer("liaison", { utilisateurId, role, parQui, numeroMasque: masquer(n) });
    return { ok: true };
  }

  /** Révocation immédiate : le numéro ne peut plus rien faire. */
  revoquer({ numero, parQui }) {
    const n = normaliserNumero(numero);
    const a = this._parNumero.get(n);
    if (!a || a.revoqueLe) return { ok: false, raison: "aucune_liaison_active" };
    if (!parQui) return { ok: false, raison: "auteur_requis" };
    a.revoqueLe = this._horloge();
    a.revoquePar = parQui;
    this._sauver();
    this._tracer("revocation", { utilisateurId: a.utilisateurId, parQui, numeroMasque: masquer(n) });
    return { ok: true };
  }

  /**
   * Remplacement de numéro : révoque l'ancien et lie le nouveau au même compte,
   * en une opération tracée. Un responsable qui change de téléphone ne doit pas
   * laisser son ancien numéro actif.
   */
  remplacerNumero({ ancien, nouveau, parQui }) {
    const a = this._parNumero.get(normaliserNumero(ancien));
    if (!a || a.revoqueLe) return { ok: false, raison: "aucune_liaison_active" };
    const r = this.revoquer({ numero: ancien, parQui });
    if (!r.ok) return r;
    return this.lier({ numero: nouveau, utilisateurId: a.utilisateurId, nom: a.nom, role: a.role, parQui });
  }

  /** Suspension réversible, sans perdre l'historique de la liaison. */
  suspendre({ numero, suspendu = true, parQui }) {
    const a = this._parNumero.get(normaliserNumero(numero));
    if (!a || a.revoqueLe) return { ok: false, raison: "aucune_liaison_active" };
    if (!parQui) return { ok: false, raison: "auteur_requis" };
    a.suspendu = Boolean(suspendu);
    this._sauver();
    this._tracer(suspendu ? "suspension" : "reactivation", { utilisateurId: a.utilisateurId, parQui });
    return { ok: true };
  }

  /** Liaisons actives, numéros masqués — jamais de liste de numéros en clair. */
  listerActives() {
    return [...this._parNumero.values()]
      .filter((a) => !a.revoqueLe)
      .map((a) => ({
        numeroMasque: masquer(a.numero),
        utilisateurId: a.utilisateurId,
        nom: a.nom,
        role: a.role,
        suspendu: a.suspendu,
        lieLe: a.lieLe,
      }));
  }

  get nombreActives() {
    return [...this._parNumero.values()].filter((a) => !a.revoqueLe && !a.suspendu).length;
  }
}

/** `23568663737` → `235•••••737` : identifiable sans être divulgué. */
export function masquer(numero) {
  const n = normaliserNumero(numero);
  if (n.length < 7) return "•".repeat(n.length);
  return `${n.slice(0, 3)}${"•".repeat(n.length - 6)}${n.slice(-3)}`;
}
