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
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { empreinte } from "./jid.js";
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
      const chargees = new Map();
      for (const a of Array.isArray(d) ? d : []) {
        if (a?.numero) chargees.set(normaliserNumero(a.numero), a);
      }
      // Remplacement d'un bloc : un fichier amputé doit retirer les
      // associations disparues, pas les laisser vivre en mémoire. Une
      // révocation faite sur le fichier doit prendre effet.
      this._parNumero = chargees;
      this._empreinteFichier = this._signature();
    } catch {
      // Fichier illisible : on ne touche à rien. Écraser des associations
      // valides parce qu'une écriture s'est mal passée priverait
      // l'établissement de son accès ; le défaut sûr est de garder l'état
      // connu et de réessayer au prochain message.
    }
  }

  /** Signature bon marché du fichier : taille et date de dernière écriture. */
  _signature() {
    try {
      const s = statSync(this._chemin);
      return `${s.size}:${s.mtimeMs}`;
    } catch {
      return null;
    }
  }

  /**
   * Relit le fichier s'il a changé depuis la dernière lecture.
   *
   * POURQUOI
   * --------
   * Les associations étaient lues une seule fois, au démarrage. Provisionner un
   * responsable exigeait donc de redémarrer le service — donc de couper
   * WhatsApp, de reprendre le verrou, et de demander à un humain d'appuyer sur
   * un bouton, pour une ligne ajoutée dans un fichier. Un `stat` par message
   * coûte moins qu'un aller-retour réseau, et supprime cette friction.
   */
  rafraichir() {
    if (!this._chemin) return false;
    const signature = this._signature();
    if (signature === this._empreinteFichier) return false;
    this._charger();
    this._journal?.({ type: "identite", evenement: "rechargement", at: this._horloge(), actives: this.nombreActives });
    return true;
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
    this.rafraichir();
    const a = this._parNumero.get(numeroDeJid(jid));
    if (!a || a.revoqueLe || a.suspendu) return null;
    return { id: a.utilisateurId, nom: a.nom, role: a.role, msisdn: a.numero };
  }

  /** État détaillé, pour l'administration et le diagnostic. */
  etatDe(jid) {
    this.rafraichir();
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
  /**
   * JID des responsables a prevenir, par role.
   *
   * Le JID porte le numero : il ne sort donc d'ici que pour etre remis au
   * transport, jamais pour etre journalise. Les associations suspendues ou
   * revoquees sont exclues — prevenir un acces retire serait au mieux inutile.
   */
  destinatairesParRole(roles = []) {
    const voulus = new Set(roles);
    return [...this._parNumero.values()]
      .filter((a) => !a.revoqueLe && !a.suspendu && voulus.has(a.role))
      .map((a) => `${a.numero}@c.us`);
  }

  /**
   * Empreintes des associations, pour le diagnostic.
   *
   * Le calcul se fait ICI, et non chez l'appelant : c'est la seule façon de
   * produire une empreinte sans que le numéro brut ne sorte du magasin. Sans
   * cela, un refus ne dirait pas si le numéro qui a écrit est un AUTRE numéro
   * ou le bon mal résolu — la question qu'il faut trancher en premier.
   */
  empreintes(sel = "") {
    return [...this._parNumero.values()].map((a) => ({
      numeroMasque: masquer(a.numero),
      empreinte: empreinte(a.numero, sel),
      utilisateurId: a.utilisateurId,
      role: a.role,
      actif: !a.revoqueLe && !a.suspendu,
    }));
  }

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
