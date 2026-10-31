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
 * Le verrou porte le PID et un horodatage rafraîchi : un verrou périmé (processus
 * tué sans nettoyage) est repris au bout de `ttlMs`, sinon le second démarrage
 * s'arrête de lui-même.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
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

  get taille() {
    return this._vus.size;
  }
}

/**
 * Verrou d'instance unique, adossé à un fichier.
 *
 * `acquerir()` renvoie false si une autre instance vivante le détient. Le
 * détenteur doit appeler `rafraichir()` périodiquement : sans cela, son verrou
 * est considéré comme périmé après `ttlMs` et peut être repris.
 */
export class VerrouInstance {
  constructor({ chemin, ttlMs = 60_000, pid = process.pid, horloge = () => Date.now() } = {}) {
    this._chemin = chemin;
    this._ttl = ttlMs;
    this._pid = pid;
    this._horloge = horloge;
    this._detenu = false;
  }

  _lire() {
    if (!existsSync(this._chemin)) return null;
    try {
      return JSON.parse(readFileSync(this._chemin, "utf8"));
    } catch {
      return null;
    }
  }

  /** @returns {{ok:true}|{ok:false, detenuPar:number, expireDansMs:number}} */
  acquerir() {
    const actuel = this._lire();
    const t = this._horloge();
    if (actuel && actuel.pid !== this._pid) {
      const age = t - (actuel.vuLe ?? 0);
      if (age < this._ttl) {
        return { ok: false, detenuPar: actuel.pid, expireDansMs: this._ttl - age };
      }
      // Verrou périmé : l'ancien détenteur n'a pas survécu, on le reprend.
    }
    ecrireAtomique(this._chemin, JSON.stringify({ pid: this._pid, vuLe: t }));
    this._detenu = true;
    return { ok: true };
  }

  rafraichir() {
    if (!this._detenu) return false;
    ecrireAtomique(this._chemin, JSON.stringify({ pid: this._pid, vuLe: this._horloge() }));
    return true;
  }

  liberer() {
    if (!this._detenu) return;
    const actuel = this._lire();
    if (actuel && actuel.pid === this._pid) {
      try {
        unlinkSync(this._chemin);
      } catch {
        /* déjà parti */
      }
    }
    this._detenu = false;
  }
}

/** Chemins standard sous le répertoire persistant du service. */
export function cheminsPersistants(racine) {
  return {
    racine,
    session: join(racine, "wwebjs_auth"),
    dedup: join(racine, "dedup.json"),
    verrou: join(racine, "instance.lock"),
  };
}
