/**
 * Fournisseur Piper : le démon Python, vu depuis Node.
 *
 * POURQUOI UN DÉMON ET UNE FILE
 * ------------------------------
 * Charger un modèle coûte 3,7 s en français et 7,7 s en arabe — mesuré. Le
 * conteneur Altare n'a qu'UN cœur effectif (`parallelismeDisponible: 1`,
 * relevé par la sonde). Deux conséquences qui dictent toute cette classe :
 *
 *  - le processus Python vit aussi longtemps que l'agent, et les modèles y
 *    restent chargés ;
 *  - les demandes sont SÉRIALISÉES. Sur un seul cœur, lancer trois synthèses
 *    de front ne les accélère pas : cela les ralentit toutes les trois et rend
 *    la première aussi tardive que la dernière. Mesuré : trois demandes
 *    simultanées rendent en 1 004 / 1 974 / 2 994 ms. La première part vite
 *    précisément parce qu'elle ne partage pas le processeur.
 *
 * POURQUOI LA VOIX NE DOIT JAMAIS EMPORTER L'AGENT
 * -------------------------------------------------
 * La voix est un supplément. Si le démon meurt, si Python disparaît, si un
 * modèle manque, la réponse écrite doit partir quand même. Toute méthode de
 * cette classe échoue donc proprement, avec une raison nommée, et jamais en
 * laissant une promesse en suspens — un appelant bloqué ne répondrait plus du
 * tout, ce qui serait pire que l'absence de voix.
 */
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { EchecSynthese, FORMATS, FournisseurVoix, Metriques } from "./fournisseur.js";

/** Le démon, à côté de ce fichier : il est livré avec lui. */
const SERVEUR = fileURLToPath(new URL("./piper-serveur.py", import.meta.url));

/** Plafond d'une synthèse. Au-delà, c'est un blocage, pas une lenteur. */
export const DELAI_SYNTHESE_MS = 30_000;

/** Plafond du démarrage : deux modèles à charger sur un cœur lent. */
export const DELAI_DEMARRAGE_MS = 60_000;

/**
 * Longueur maximale d'un texte confié au moteur.
 *
 * La segmentation en amont découpe déjà ; ce plafond est un filet. Un texte
 * démesuré monopoliserait le seul cœur disponible pendant des minutes, et la
 * réception WhatsApp passe avant la voix.
 */
export const CARACTERES_MAX = 1200;

export class FournisseurPiper extends FournisseurVoix {
  /**
   * @param {object} o
   * @param {string} o.python            interpréteur, `python3` sur Altare
   * @param {Record<string,string>} o.modeles  langue -> chemin du .onnx
   * @param {string} o.dossierTemporaire  où écrire les WAV
   * @param {(e:object)=>void} [o.journal]
   */
  constructor({ python = "python3", modeles = {}, dossierTemporaire, journal = null, serveur = SERVEUR } = {}) {
    super();
    this._python = python;
    this._modeles = modeles;
    this._dossier = dossierTemporaire;
    this._journal = journal;
    this._serveur = serveur;
    this._proc = null;
    this._langues = [];
    this._attentes = new Map();
    this._tampon = "";
    this._compteur = 0;
    this._file = Promise.resolve();
    this._metriques = new Metriques();
    this._demarrage = null;
    this._arrete = false;
    this._derniereErreur = null;
  }

  _tracer(champs) {
    // Jamais le texte : une trace de synthèse ne doit pas recopier le contenu
    // d'une conversation scolaire dans les journaux du serveur.
    this._journal?.({ type: "voix", ...champs });
  }

  async initialize() {
    if (this._demarrage) return this._demarrage;
    this._demarrage = this._demarrer();
    return this._demarrage;
  }

  async _demarrer() {
    const langues = Object.keys(this._modeles);
    if (langues.length === 0) {
      this._derniereErreur = "aucun modele configure";
      return { pret: false, raison: this._derniereErreur };
    }
    await mkdir(this._dossier, { recursive: true }).catch(() => {});

    const env = { ...process.env, PYTHONIOENCODING: "utf-8" };
    // UN seul thread : le conteneur n'a qu'un coeur, et laisser ONNX en
    // reclamer quatre le ferait se battre contre lui-meme et contre Node.
    env.OMP_NUM_THREADS = "1";
    if (this._modeles.fr) env.VOICE_FR_MODEL = this._modeles.fr;
    if (this._modeles.ar) env.VOICE_AR_MODEL = this._modeles.ar;

    let proc;
    try {
      proc = spawn(this._python, [this._serveur], { env, stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      this._derniereErreur = `demarrage impossible : ${String(e?.message ?? e).slice(0, 160)}`;
      this._tracer({ evenement: "demarrage_echec", raison: this._derniereErreur });
      return { pret: false, raison: this._derniereErreur };
    }
    this._proc = proc;
    proc.stdout.setEncoding("utf-8");
    proc.stdout.on("data", (d) => this._lire(d));
    // Le bruit de Python (avertissements d'espeak) est consigné sans être
    // confondu avec un échec : il en produit beaucoup et toujours.
    proc.stderr.setEncoding("utf-8");
    proc.stderr.on("data", (d) => this._tracer({ evenement: "python", detail: String(d).slice(0, 200) }));

    const fin = (raison) => {
      this._proc = null;
      this._derniereErreur = raison;
      this._tracer({ evenement: "demon_termine", raison });
      // Toute attente en cours doit etre liberee : sans cela, les reponses
      // concernees resteraient suspendues et l'agent muet.
      for (const [, rejeter] of this._attentes) rejeter(new EchecSynthese(`demon arrete : ${raison}`));
      this._attentes.clear();
      // Et le DEMARRAGE aussi. Sans cette ligne, un interpreteur introuvable
      // faisait attendre le plafond entier — observe : 60 s avant d'abandonner
      // sur un simple ENOENT, alors que le processus etait mort en quelques
      // millisecondes. Chaque seconde la est une seconde ou l'agent ne repond
      // meme pas par ecrit.
      this._pret?.({ pret: false, erreur: raison });
    };
    proc.on("exit", (code, signal) => fin(`code ${code ?? "?"}${signal ? ` signal ${signal}` : ""}`));
    proc.on("error", (e) => fin(String(e?.message ?? e).slice(0, 160)));

    const amorce = await new Promise((resoudre) => {
      const minuteur = setTimeout(
        () => resoudre({ pret: false, raison: `aucune reponse du demon en ${Math.round(DELAI_DEMARRAGE_MS / 1000)} s` }),
        DELAI_DEMARRAGE_MS,
      );
      this._pret = (j) => {
        clearTimeout(minuteur);
        resoudre(j.pret ? { pret: true, langues: j.langues ?? [], erreurs: j.erreurs ?? {} } : { pret: false, raison: j.erreur ?? "demon non pret", erreurs: j.erreurs ?? {} });
      };
    });
    this._pret = null;
    this._langues = amorce.langues ?? [];
    if (!amorce.pret) this._derniereErreur = amorce.raison ?? null;
    this._tracer({ evenement: amorce.pret ? "demon_pret" : "demon_non_pret", langues: this._langues, raison: amorce.raison });
    return amorce;
  }

  /** Découpe le flux en lignes JSON et réveille l'attente correspondante. */
  _lire(donnees) {
    this._tampon += donnees;
    let i;
    while ((i = this._tampon.indexOf("\n")) >= 0) {
      const ligne = this._tampon.slice(0, i).trim();
      this._tampon = this._tampon.slice(i + 1);
      if (!ligne) continue;
      let j;
      try {
        j = JSON.parse(ligne);
      } catch {
        // Une ligne illisible n'est pas une raison de tuer le flux : le démon
        // peut écrire autre chose un jour, et la suivante sera peut-être bonne.
        this._tracer({ evenement: "ligne_illisible", detail: ligne.slice(0, 120) });
        continue;
      }
      if (j.pret !== undefined) {
        this._pret?.(j);
        continue;
      }
      const attente = this._attentes.get(j.id);
      if (!attente) continue;
      this._attentes.delete(j.id);
      attente(j);
    }
  }

  async synthesize({ text, language = "fr", voice = null, speed = 1, outputFormat = "wav" } = {}) {
    this._metriques.demande();
    const texte = String(text ?? "").trim();
    if (texte === "") {
      this._metriques.echoue("texte vide");
      throw new EchecSynthese("texte vide");
    }
    if (texte.length > CARACTERES_MAX) {
      this._metriques.echoue("texte trop long");
      throw new EchecSynthese(`texte de ${texte.length} caracteres : au-dela de ${CARACTERES_MAX}, segmenter en amont`);
    }
    if (!FORMATS.includes(outputFormat)) {
      this._metriques.echoue(`format inconnu : ${outputFormat}`);
      throw new EchecSynthese(`format inconnu : ${outputFormat}`);
    }
    if (voice && !Object.values(this._modeles).some((m) => String(m).includes(voice))) {
      this._metriques.echoue(`voix inconnue : ${voice}`);
      throw new EchecSynthese(`voix non configuree : ${voice}`, { langue: language });
    }

    const amorce = await this.initialize();
    if (!amorce.pret) {
      this._metriques.echoue(amorce.raison ?? "demon indisponible");
      throw new EchecSynthese(`moteur vocal indisponible : ${amorce.raison ?? "raison inconnue"}`, { langue: language });
    }
    if (!this._langues.includes(language)) {
      this._metriques.echoue(`langue non chargee : ${language}`);
      throw new EchecSynthese(`langue non chargee : ${language}`, { langue: language });
    }

    // La file : une synthese a la fois. Voir l'en-tete du fichier.
    const place = this._file.then(() => this._synthetiser({ texte, language, speed }));
    // La file continue meme si cette demande echoue, sinon un seul echec
    // bloquerait toutes les suivantes.
    this._file = place.then(
      () => undefined,
      () => undefined,
    );
    const r = await place;
    return { ...r, format: "wav", demandeFormat: outputFormat };
  }

  async _synthetiser({ texte, language, speed }) {
    const id = `v${++this._compteur}`;
    const chemin = join(this._dossier, `${id}-${language}.wav`);
    const debut = process.hrtime.bigint();

    const reponse = await new Promise((resoudre, rejeter) => {
      if (!this._proc?.stdin?.writable) {
        rejeter(new EchecSynthese(`demon indisponible : ${this._derniereErreur ?? "flux ferme"}`, { langue: language }));
        return;
      }
      const minuteur = setTimeout(() => {
        this._attentes.delete(id);
        rejeter(new EchecSynthese(`synthese sans reponse en ${Math.round(DELAI_SYNTHESE_MS / 1000)} s`, { langue: language }));
      }, DELAI_SYNTHESE_MS);
      this._attentes.set(id, (j) => {
        clearTimeout(minuteur);
        if (j instanceof Error) return rejeter(j);
        resoudre(j);
      });
      const req = { id, texte, langue: language, chemin };
      if (speed && speed !== 1) req.vitesse = speed;
      try {
        this._proc.stdin.write(`${JSON.stringify(req)}\n`);
      } catch (e) {
        clearTimeout(minuteur);
        this._attentes.delete(id);
        rejeter(new EchecSynthese(`ecriture vers le demon impossible : ${String(e?.message ?? e).slice(0, 120)}`, { langue: language }));
      }
    }).catch((e) => {
      this._metriques.echoue(e?.message ?? e);
      throw e;
    });

    const ms = Number(process.hrtime.bigint() - debut) / 1e6;
    if (!reponse.ok) {
      this._metriques.echoue(reponse.erreur ?? "echec sans raison");
      throw new EchecSynthese(`synthese refusee : ${reponse.erreur ?? "raison inconnue"}`, { langue: language });
    }
    this._metriques.reussi({ ms, caracteres: texte.length, dureeS: reponse.duree_s ?? 0 });
    this._tracer({ evenement: "synthese", langue: language, caracteres: texte.length, ms: Math.round(ms), dureeS: reponse.duree_s });
    return { chemin: reponse.chemin, dureeS: reponse.duree_s ?? null, msGeneration: Math.round(ms) };
  }

  async healthCheck() {
    if (this._arrete) return { sain: false, raison: "arrete" };
    if (!this._demarrage) return { sain: false, raison: "non initialise" };
    const amorce = await this._demarrage.catch(() => ({ pret: false, raison: "demarrage en echec" }));
    const vivant = Boolean(this._proc?.stdin?.writable);
    return {
      sain: Boolean(amorce.pret) && vivant,
      langues: this._langues,
      processusVivant: vivant,
      raison: amorce.pret ? (vivant ? undefined : `demon mort : ${this._derniereErreur ?? "sans raison"}`) : amorce.raison,
      enAttente: this._attentes.size,
    };
  }

  getCapabilities() {
    return {
      moteur: "piper",
      langues: [...this._langues],
      formats: [...FORMATS],
      modeles: Object.fromEntries(Object.entries(this._modeles).map(([l, m]) => [l, String(m).split(/[\\/]/).pop()])),
      // Une seule a la fois, et c'est un choix : voir l'en-tete du fichier.
      concurrence: 1,
    };
  }

  async shutdown() {
    this._arrete = true;
    const p = this._proc;
    this._proc = null;
    if (!p) return;
    try {
      p.stdin?.end();
    } catch {
      /* flux deja ferme */
    }
    // Laisser au demon le temps de finir sa ligne, puis insister. Un orphelin
    // garderait un modele de 63 Mo en memoire pour rien.
    await new Promise((r) => {
      const minuteur = setTimeout(() => {
        try {
          p.kill("SIGKILL");
        } catch {
          /* deja mort */
        }
        r();
      }, 2000);
      p.once("exit", () => {
        clearTimeout(minuteur);
        r();
      });
    });
  }

  getMetrics() {
    return { ...this._metriques.resume(), enAttente: this._attentes.size, langues: this._langues };
  }
}
