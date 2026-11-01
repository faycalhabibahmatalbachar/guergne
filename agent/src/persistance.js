/**
 * Persistance sur disque : déduplication des messages et verrou d'instance.
 *
 * POURQUOI SUR DISQUE
 * -------------------
 * Les deux mécanismes doivent survivre à un redémarrage du processus et du
 * conteneur. Un cache en mémoire se vide au redémarrage : WhatsApp rejoue alors
 * les messages non acquittés, et l'agent enregistrerait une seconde fois des
 * absences déjà saisies.
 *
 * POURQUOI UN VERROU
 * ------------------
 * Deux instances partageant la même session WhatsApp font bannir le numéro.
 * Le mécanisme lui-même est dans `verrou.js`, réexporté en fin de fichier.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Écriture atomique : un crash en plein écrit ne doit pas laisser un fichier tronqué. */
function ecrireAtomique(chemin, contenu) {
  mkdirSync(dirname(chemin), { recursive: true });
  const tmp = `${chemin}.tmp`;
  writeFileSync(tmp, contenu, "utf8");
  renameSync(tmp, chemin);
}

/**
 * Déduplication persistante, bornée en taille.
 *
 * On conserve les identifiants des messages déjà traités. La borne évite que le
 * fichier grossisse sans fin sur un service qui tourne des mois : au-delà de
 * `max`, les plus anciens sortent (les rejeux WhatsApp portent sur des messages
 * récents).
 */
export class DedupPersistant {
  constructor({ chemin, max = 5000 } = {}) {
    this._chemin = chemin;
    this._max = max;
    this._vus = new Map(); // id -> horodatage
    this._charger();
  }

  _charger() {
    if (!this._chemin || !existsSync(this._chemin)) return;
    try {
      const d = JSON.parse(readFileSync(this._chemin, "utf8"));
      if (Array.isArray(d)) for (const [id, t] of d) this._vus.set(id, t);
    } catch {
      // Fichier illisible : on repart à vide plutôt que d'empêcher le démarrage.
      // Le pire cas est un éventuel doublon, que la confirmation métier rattrape.
    }
  }

  _sauver() {
    if (!this._chemin) return;
    ecrireAtomique(this._chemin, JSON.stringify([...this._vus.entries()]));
  }

  seen(id) {
    return id != null && this._vus.has(id);
  }

  remember(id, horodatage = Date.now()) {
    if (id == null) return;
    this._vus.set(id, horodatage);
    while (this._vus.size > this._max) {
      const plusAncien = this._vus.keys().next().value;
      this._vus.delete(plusAncien);
    }
    this._sauver();
  }

  /**
   * Relache une revendication.
   *
   * Un message dont le traitement a echoue AVANT toute action metier doit
   * pouvoir etre retente : le marquer vu a vie le condamnerait pour une panne
   * d'une seconde. L'appelant ne doit jamais relacher une revendication dont
   * l'ecriture metier est incertaine — rejouer une absence en creerait une
   * seconde.
   */
  oublier(id) {
    if (id == null || !this._vus.delete(id)) return false;
    this._sauver();
    return true;
  }

  get taille() {
    return this._vus.size;
  }
}

// Le verrou d'instance vit désormais dans son propre module : décider qui
// détient la session WhatsApp exige de sonder les processus, ce qui n'a rien à
// voir avec la déduplication des messages. Il reste réexporté ici pour que les
// appelants n'aient qu'un seul point d'entrée vers la persistance.
export { FreinRedemarrage, VerrouInstance, evaluerVerrou, sonderProcessus } from "./verrou.js";

/** Chemins standard sous le répertoire persistant du service. */
export function cheminsPersistants(racine) {
  return {
    racine,
    session: join(racine, "wwebjs_auth"),
    dedup: join(racine, "dedup.json"),
    verrou: join(racine, "instance.lock"),
    redemarrages: join(racine, "redemarrages.json"),
  };
}
