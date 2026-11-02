/**
 * Verrou d'instance unique — qui détient la session WhatsApp.
 *
 * POURQUOI CE MODULE A ÉTÉ RÉÉCRIT
 * ---------------------------------
 * La première version décidait de la mort du détenteur sur un seul critère :
 * l'âge du dernier battement, comparé à un TTL. Ce critère est faux dans un
 * conteneur, et il a mis le service à l'arrêt :
 *
 *   [verrou] une autre instance (pid 15) utilise deja la session ; arret.
 *
 * Un PID à deux chiffres est la signature d'un conteneur : les numéros y
 * repartent de zéro à chaque démarrage et se recyclent vite. Trois défauts se
 * combinaient :
 *
 *   1. Le PID seul n'identifie personne. Si le nouveau processus reçoit
 *      justement le numéro inscrit dans le verrou, il se croit propriétaire et
 *      écrase le verrou d'un autre. Et si un processus étranger hérite de ce
 *      numéro, il est pris pour le détenteur — à vie.
 *   2. L'âge dépend de l'horloge. Une horloge qui se recale au démarrage du
 *      conteneur peut placer `vuLe` dans l'avenir : l'âge devient négatif, le
 *      verrou paraît éternellement frais, et AUCUN démarrage ne réussit plus.
 *   3. L'écriture n'était pas une création. `write` + `rename` écrase
 *      inconditionnellement : deux démarrages simultanés se déclaraient tous
 *      deux propriétaires.
 *
 * LE PRINCIPE DE LA CORRECTION
 * -----------------------------
 * La liveness est décidée par le PROCESSUS, pas par l'horloge. Sous Linux,
 * `/proc/<pid>/stat` donne l'état réel et l'instant de démarrage du processus ;
 * cet instant sert d'identité, ce qui règle le recyclage de PID. Le TTL ne
 * subsiste que comme repli là où `/proc` n'existe pas (développement local).
 *
 * L'acquisition devient une vraie création exclusive (`link`, qui échoue si la
 * cible existe). Et parce qu'aucune exclusion de fichier n'est parfaite sur un
 * système de fichiers partagé, le détenteur VÉRIFIE qu'il l'est encore : à
 * chaque battement, et juste avant de connecter WhatsApp. Un perdant de course
 * s'en aperçoit en quelques secondes et s'arrête de lui-même.
 */
import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";

const TTL_DEFAUT = 60_000;

/** Commande du processus, pour les diagnostics. Jamais utilisée comme identité forte. */
function lireCommande(pid) {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0+/g, " ").trim().slice(0, 120) || null;
  } catch {
    return null;
  }
}

/**
 * État réel d'un processus.
 *
 * @returns {{vivant:boolean|null, identite:string|null, commande:string|null, raison:string}}
 *   `vivant: null` signifie « indéterminable » : l'appelant doit se replier sur
 *   le TTL. On ne confond jamais « je ne sais pas » avec « il est mort » : se
 *   tromper dans ce sens lance une seconde instance et fait bannir le numéro.
 */
export function sonderProcessus(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return { vivant: false, identite: null, commande: null, raison: "pid-invalide" };
  }

  // Linux : la seule source qui distingue un PID vivant d'un PID recyclé.
  if (existsSync("/proc/self/stat")) {
    let brut;
    try {
      brut = readFileSync(`/proc/${pid}/stat`, "utf8");
    } catch {
      return { vivant: false, identite: null, commande: null, raison: "absent" };
    }
    // Le nom de l'exécutable est entre parenthèses et peut contenir n'importe
    // quoi, espaces compris : on découpe après la DERNIÈRE parenthèse.
    const champs = brut.slice(brut.lastIndexOf(")") + 1).trim().split(/\s+/);
    const etat = champs[0];
    // 22e champ du fichier = instant de démarrage, en tops d'horloge depuis le
    // démarrage du noyau. Deux processus de même PID ne peuvent pas le partager.
    const identite = champs[19] ?? null;
    const commande = lireCommande(pid);
    if (etat === "Z") {
      // Un zombie ne tient plus aucune socket : il ne détient pas la session.
      return { vivant: false, identite, commande, raison: "zombie" };
    }
    return { vivant: true, identite, commande, raison: `etat=${etat}` };
  }

  // Ailleurs (développement Windows/macOS) : on sait si un PID existe, pas qui
  // il est. L'identité reste inconnue, donc le TTL tranchera.
  try {
    process.kill(pid, 0);
    return { vivant: true, identite: null, commande: null, raison: "signal" };
  } catch (e) {
    if (e?.code === "EPERM") {
      // Le processus existe, mais appartient à quelqu'un d'autre.
      return { vivant: true, identite: null, commande: null, raison: "eperm" };
    }
    return { vivant: false, identite: null, commande: null, raison: "esrch" };
  }
}

/**
 * Décision pure : ce verrou est-il opposable ?
 *
 * Isolée de toute entrée-sortie, pour être testable sur les cas que la
 * production sait réellement produire.
 */
export function evaluerVerrou({ actuel, moiInstanceId, maintenant, ttlMs, sondage }) {
  if (!actuel || typeof actuel !== "object") return { decision: "libre", ageMs: null };
  if (actuel.corrompu || !actuel.pid) return { decision: "perime-corrompu", ageMs: null };
  if (actuel.instanceId && actuel.instanceId === moiInstanceId) {
    return { decision: "a-nous", ageMs: maintenant - (actuel.vuLe ?? maintenant) };
  }

  const ageMs = actuel.vuLe == null ? null : maintenant - actuel.vuLe;

  if (sondage.vivant === false) return { decision: "perime-mort", ageMs };

  if (sondage.vivant === true) {
    // Le PID existe. Est-ce le MÊME processus ? L'identité inscrite dans le
    // verrou doit correspondre à l'instant de démarrage observé.
    if (actuel.identiteProcessus != null && sondage.identite != null) {
      if (String(actuel.identiteProcessus) !== String(sondage.identite)) {
        return { decision: "perime-reutilise", ageMs };
      }
      return { decision: "detenu", ageMs };
    }
    // Verrou d'ancienne génération : aucune identité n'y a été inscrite — c'est
    // exactement le verrou resté sur la production. On ne peut plus prouver que
    // ce PID est l'agent ; le dernier indice est la commande. Si ce n'est pas
    // notre application, le numéro a été recyclé par un autre programme.
    if (sondage.commande != null && !/node/.test(sondage.commande)) {
      return { decision: "perime-reutilise", ageMs };
    }
    // Doute résiduel : on refuse plutôt que de risquer un double démarrage,
    // sauf si le TTL est franchement dépassé ou l'horloge incohérente.
    if (ageMs != null && ageMs < -ttlMs) return { decision: "perime-horloge", ageMs };
    if (ageMs != null && ageMs >= ttlMs) return { decision: "perime-ttl", ageMs };
    return { decision: "detenu", ageMs };
  }

  // Liveness indéterminable : repli sur le TTL.
  if (ageMs == null) return { decision: "perime-corrompu", ageMs };
  // Un battement daté dans l'avenir ne vient pas d'un processus sain : c'est
  // l'horloge qui a bougé. Sans ce cas, le verrou ne se libère JAMAIS.
  if (ageMs < -ttlMs) return { decision: "perime-horloge", ageMs };
  if (ageMs >= ttlMs) return { decision: "perime-ttl", ageMs };
  return { decision: "detenu", ageMs };
}

const PERIMES = new Set(["perime-mort", "perime-reutilise", "perime-ttl", "perime-horloge", "perime-corrompu"]);

export class VerrouInstance {
  constructor({
    chemin,
    ttlMs = TTL_DEFAUT,
    pid = process.pid,
    horloge = () => Date.now(),
    sonde = sonderProcessus,
    instanceId = randomUUID(),
    journal = null,
  } = {}) {
    this._chemin = chemin;
    this._ttl = ttlMs;
    this._pid = pid;
    this._horloge = horloge;
    this._sonde = sonde;
    this._instanceId = instanceId;
    this._journal = journal;
    this._detenu = false;
    this._demarreLe = horloge();
  }

  get instanceId() {
    return this._instanceId;
  }

  /** Trace exploitable, sans secret ni numéro de téléphone. */
  _tracer(champs) {
    const ligne =
      `[verrou] pid=${champs.pid ?? "-"} owner=${champs.owner ?? "-"} ageMs=${champs.ageMs ?? "-"} ` +
      `processAlive=${champs.processAlive ?? "-"} decision=${champs.decision}` +
      (champs.detail ? ` detail=${champs.detail}` : "");
    (this._journal ?? console).log(ligne);
  }

  _lire() {
    if (!existsSync(this._chemin)) return null;
    try {
      const d = JSON.parse(readFileSync(this._chemin, "utf8"));
      if (!d || typeof d !== "object") return { corrompu: true };
      return d;
    } catch {
      // Fichier tronqué ou illisible : c'est un verrou, mais il n'identifie
      // personne. Il ne doit pas bloquer le service indéfiniment.
      return { corrompu: true };
    }
  }

  _moi() {
    const sondage = this._sonde(this._pid);
    return {
      version: 2,
      instanceId: this._instanceId,
      pid: this._pid,
      identiteProcessus: sondage.identite,
      demarreLe: this._demarreLe,
      vuLe: this._horloge(),
    };
  }

  /**
   * Création exclusive, par `link`.
   *
   * `link` échoue si la cible existe déjà : c'est l'opération atomique dont
   * `write` + `rename` ne dispose pas. Deux démarrages simultanés ne peuvent
   * donc pas réussir tous les deux.
   */
  _creerExclusif(contenu) {
    mkdirSync(dirname(this._chemin), { recursive: true });
    const tmp = `${this._chemin}.${this._instanceId}.tmp`;
    try {
      const fd = openSync(tmp, "wx", 0o600);
      try {
        writeSync(fd, JSON.stringify(contenu));
      } finally {
        closeSync(fd);
      }
      linkSync(tmp, this._chemin);
      return true;
    } catch {
      return false; // la cible existe : quelqu'un a été plus rapide
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
        /* déjà parti */
      }
    }
  }

  /**
   * @returns {{ok:true, decision:string}|{ok:false, detenuPar:number, decision:string, expireDansMs:number|null}}
   */
  acquerir() {
    for (let essai = 0; essai < 3; essai += 1) {
      const actuel = this._lire();
      const sondage = actuel?.pid
        ? this._sonde(actuel.pid)
        : { vivant: false, identite: null, commande: null, raison: "sans-pid" };
      const { decision, ageMs } = evaluerVerrou({
        actuel,
        moiInstanceId: this._instanceId,
        maintenant: this._horloge(),
        ttlMs: this._ttl,
        sondage,
      });

      this._tracer({
        pid: this._pid,
        owner: actuel?.pid ?? "aucun",
        ageMs: ageMs ?? "-",
        processAlive: actuel?.pid ? String(sondage.vivant) : "-",
        decision,
        detail: actuel?.pid ? sondage.raison : null,
      });

      if (decision === "detenu") {
        return {
          ok: false,
          detenuPar: actuel.pid,
          decision,
          expireDansMs: ageMs == null ? null : Math.max(0, this._ttl - ageMs),
        };
      }

      if (decision === "a-nous") {
        // Redémarrage dans le même processus : le verrou est déjà le nôtre.
        this._detenu = true;
        this.rafraichir();
        return { ok: true, decision };
      }

      if (decision === "libre") {
        if (this._creerExclusif(this._moi()) && this.detientToujours()) {
          this._detenu = true;
          return { ok: true, decision };
        }
        continue; // course perdue : on relit et on réévalue
      }

      if (PERIMES.has(decision)) {
        // Remplacement d'un verrou périmé. On ne retire que CE verrou-là : on
        // relit juste avant, et on abandonne si son contenu a changé entre-temps
        // — signe qu'une autre instance l'a déjà repris.
        if (JSON.stringify(this._lire()) !== JSON.stringify(actuel)) continue;
        try {
          unlinkSync(this._chemin);
        } catch {
          /* déjà retiré par un concurrent */
        }
        if (this._creerExclusif(this._moi()) && this.detientToujours()) {
          this._detenu = true;
          return { ok: true, decision };
        }
        continue;
      }
    }

    const actuel = this._lire();
    this._tracer({ pid: this._pid, owner: actuel?.pid ?? "aucun", decision: "course-perdue" });
    return { ok: false, detenuPar: actuel?.pid ?? 0, decision: "course-perdue", expireDansMs: null };
  }

  /** Le verrou sur disque porte-t-il TOUJOURS notre identifiant d'instance ? */
  detientToujours() {
    return this._lire()?.instanceId === this._instanceId;
  }

  /**
   * Battement.
   *
   * N'actualise que le verrou que nous possédons encore : sans cette
   * vérification, une instance évincée continuerait à rafraîchir le verrou
   * d'une autre, et le vrai détenteur se ferait expulser.
   *
   * @returns {boolean} false si nous ne détenons plus le verrou — l'appelant
   *   doit alors s'arrêter, car une autre instance tient la session.
   */
  rafraichir() {
    if (!this._detenu) return false;
    if (!this.detientToujours()) {
      const owner = this._lire()?.pid ?? "aucun";
      this._detenu = false;
      this._tracer({ pid: this._pid, owner, decision: "perdu" });
      return false;
    }
    const tmp = `${this._chemin}.${this._instanceId}.bat`;
    try {
      const fd = openSync(tmp, "w", 0o600);
      try {
        writeSync(fd, JSON.stringify(this._moi()));
      } finally {
        closeSync(fd);
      }
      // `rename` écrase : acceptable ici, puisqu'on vient de vérifier que la
      // cible est bien la nôtre.
      renameSync(tmp, this._chemin);
      return true;
    } catch {
      try {
        unlinkSync(tmp);
      } catch {
        /* sans importance */
      }
      // Un battement raté n'est pas fatal : le suivant réessaiera, et le TTL
      // laisse plusieurs battements de marge.
      return true;
    }
  }

  /** Libération, à l'arrêt. Ne retire que notre propre verrou. */
  liberer() {
    if (!this._detenu) return false;
    this._detenu = false;
    if (!this.detientToujours()) {
      this._tracer({ pid: this._pid, decision: "liberation-ignoree" });
      return false;
    }
    try {
      unlinkSync(this._chemin);
    } catch {
      /* déjà parti */
    }
    this._tracer({ pid: this._pid, decision: "libere" });
    return true;
  }
}

/**
 * Frein contre les redémarrages en rafale.
 *
 * Altare relance le conteneur dès qu'il s'arrête. Un démarrage qui échoue tôt
 * produit donc une boucle : à chaque tour, WhatsApp ouvre et referme une
 * session, ce que le service d'en face finit par traiter comme un abus. Le
 * frein ne cache pas la panne — il espace les tentatives pour qu'un échec coûte
 * une pause plutôt que le numéro.
 */
export class FreinRedemarrage {
  constructor({ chemin, fenetreMs = 120_000, seuil = 3, pauseMs = 30_000, horloge = () => Date.now(), journal = null } = {}) {
    this._chemin = chemin;
    this._fenetre = fenetreMs;
    this._seuil = seuil;
    this._pause = pauseMs;
    this._horloge = horloge;
    this._journal = journal;
  }

  _lire() {
    try {
      const d = JSON.parse(readFileSync(this._chemin, "utf8"));
      return Array.isArray(d) ? d.filter((t) => Number.isFinite(t)) : [];
    } catch {
      return [];
    }
  }

  /**
   * Enregistre ce démarrage et renvoie la pause à observer avant de continuer.
   *
   * @returns {{pauseMs:number, recents:number}}
   */
  enregistrer() {
    const t = this._horloge();
    const recents = [...this._lire().filter((x) => t - x < this._fenetre), t];
    try {
      mkdirSync(dirname(this._chemin), { recursive: true });
      const tmp = `${this._chemin}.tmp`;
      const fd = openSync(tmp, "w", 0o600);
      try {
        writeSync(fd, JSON.stringify(recents.slice(-20)));
      } finally {
        closeSync(fd);
      }
      renameSync(tmp, this._chemin);
    } catch {
      // Ne jamais empêcher un démarrage parce que le compteur n'a pas pu être
      // écrit : le frein est une protection, pas une condition de service.
    }
    const pauseMs = recents.length > this._seuil ? this._pause : 0;
    if (pauseMs > 0) {
      (this._journal ?? console).log(
        `[frein] ${recents.length} demarrages en ${Math.round(this._fenetre / 1000)}s — pause de ${Math.round(pauseMs / 1000)}s avant de reprendre la session`,
      );
    }
    return { pauseMs, recents: recents.length };
  }
}
