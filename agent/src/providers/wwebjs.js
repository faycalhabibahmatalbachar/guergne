/**
 * Implémentation réelle de `WhatsAppProvider` avec `whatsapp-web.js`.
 *
 * CHOIX DU TRANSPORT
 * ------------------
 * Baileys et whatsapp-web.js ont été comparés. whatsapp-web.js est retenu :
 * c'est le transport des deux intégrations qui fonctionnent déjà sur ce compte
 * (`moov-ai`, `canalplus-whatsapp-bot`), avec une persistance de session
 * (`LocalAuth`) éprouvée en production et un retour d'expérience sur ses pièges
 * (verrous Chrome, besoin mémoire). Repartir sur Baileys aurait écarté ce
 * capital pour un gain non démontré. Le coût est la dépendance à Chromium, donc
 * une empreinte mémoire supérieure — les 2 Gio du serveur la couvrent.
 *
 * L'import est fait à la demande : le module reste chargeable (et le reste de
 * l'agent testable) sur une machine où la dépendance n'est pas installée.
 */
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import { WhatsAppProvider } from "../provider.js";
import { DelaiDepasse, avecDelai } from "../delai.js";
import { ETATS, EtatWhatsApp, doitSuivreChargement } from "../etat-whatsapp.js";
import { analyserJid } from "../jid.js";
import { decrireErreur, resumerErreur } from "../erreurs.js";
import { chaineIdentifiant, partieIdMessage, reparerIdMessage, serialiserIdMessage } from "./identifiant-message.js";

/**
 * Bornes des appels sortants.
 *
 * La resolution LID traverse Puppeteer et le reseau : 10 s suffisent largement
 * quand WhatsApp repond, et transforment une requete en suspens en refus
 * explicite plutot qu'en silence.
 */
const DELAI_LID_MS = Number(process.env.DELAI_LID_MS ?? 10_000);
/** L'envoi d'un message : genereux, mais fini. */
const DELAI_ENVOI_MS = Number(process.env.DELAI_ENVOI_MS ?? 30_000);
/**
 * Le telechargement d'un media.
 *
 * Il traverse Puppeteer, puis le reseau de WhatsApp, puis un dechiffrement
 * dans la page. Sans borne, une note vocale dont le media a expire laissait le
 * traitement suspendu, et l'expediteur devant un silence.
 */
const DELAI_MEDIA_MS = Number(process.env.DELAI_MEDIA_MS ?? 60_000);
/**
 * Taille maximale acceptee pour un media entrant.
 *
 * Une note vocale de deux minutes pese moins de 500 Ko. Au-dela de cette
 * borne, il ne s'agit plus d'une note vocale, et la memoire du conteneur
 * (2355 Mo partages avec Chromium) n'a pas a l'absorber.
 */
export const MEDIA_MAX_OCTETS = Number(process.env.MEDIA_MAX_OCTETS ?? 16 * 1024 * 1024);
/**
 * Fenetre pendant laquelle une note vocale deja presente dans l'historique
 * fait renoncer a un nouvel envoi. Elle protege contre la relance d'un appel
 * dont la premiere issue etait ambigue.
 */
const FENETRE_DOUBLON_MS = Number(process.env.FENETRE_DOUBLON_MS ?? 5 * 60 * 1000);

/** Lecture des codes d'acquittement de WhatsApp, pour ne pas les confondre. */
export const ETATS_ACK = Object.freeze({
  "-1": "erreur",
  0: "en_attente",
  1: "parti_du_serveur",
  2: "livre",
  3: "lu",
  4: "ecoute",
});

const typeJid = (jid) => analyserJid(jid).serveur ?? "invalide";

/**
 * Empreinte courte d'un identifiant de message.
 *
 * Un identifiant WhatsApp porte le numero du correspondant : le journaliser
 * tel quel reviendrait a publier des numeros. L'empreinte permet de suivre un
 * message d'un bout a l'autre de la chaine sans rien divulguer.
 */
function empreinteCourte(valeur) {
  const v = String(valeur ?? "");
  if (!v) return null;
  let h = 0x811c9dc5;
  for (const c of v) {
    h ^= c.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

let compteur = 0;
const nouveauRun = () => `run_${Date.now().toString(36)}_${(compteur++).toString(36)}`;

/** Verrous laissés par un Chrome tué : ils empêchent le redémarrage s'ils subsistent. */
function nettoyerVerrousChrome(dossierSession, clientId) {
  const base = join(dossierSession, `session-${clientId}`);
  for (const nom of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    try {
      unlinkSync(join(base, nom));
    } catch {
      /* absent = normal */
    }
  }
}


/**
 * Configuration Chromium, reprise de `moov-ai/index.js`.
 *
 * Cette liste n'est pas décorative : elle est le produit d'incidents de
 * production réels sur ce même transport. On la réutilise plutôt que de la
 * redécouvrir par les mêmes pannes.
 *
 * CE QUI N'EST PAS REPRIS, ET POURQUOI
 * ------------------------------------
 * `moov-ai` ajoute `--single-process`, `--no-zygote` et un tas JavaScript
 * plafonné à 80 Mo. C'est un compromis imposé par Render Starter (512 Mo), où
 * Chromium multi-process déclenchait des OOM en pleine navigation
 * (« Execution context was destroyed »). Altare offre **2 Gio** : appliquer ce
 * bridage ici dégraderait les performances sans aucun bénéfice. Il reste
 * activable par `CHROME_SINGLE_PROCESS=true` si la mémoire venait à manquer.
 *
 * `--blink-settings=imagesEnabled=false` est volontairement ABSENT : il
 * économise de la mémoire mais **casse l'envoi de médias image** — piège
 * documenté dans moov-ai, où la photo ne partait plus.
 */
/**
 * Plafond de l'initialisation du client.
 *
 * `initialize()` lance Chromium puis charge WhatsApp Web. Le 2 novembre 2026,
 * Chromium s'est effondre — un `core` de 1,16 Go le prouve, nomme
 * `chrome-linux64/chrome` et ecrit a la seconde du demarrage — et Puppeteer
 * n'a PAS rejete : la promesse est restee suspendue. Le `await` au niveau du
 * module a gele le demarrage, et le service est reste muet 7 h 27 sans qu'une
 * seule ligne de journal le dise.
 *
 * Six minutes suffisent largement a restaurer une session sur un conteneur
 * modeste. Au-dela, ce n'est plus de la lenteur : c'est un blocage, et il doit
 * devenir une erreur nommee plutot qu'un silence.
 */
const DELAI_INITIALISATION_MS = Number(process.env.WHATSAPP_DELAI_INIT_MS || 6 * 60 * 1000);

const ARGS_CHROME = [
  // Indispensables en conteneur : pas de namespace de sandbox, et un /dev/shm
  // trop petit fait planter Chrome au bout de quelques pages.
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  // Aucun GPU dans un conteneur : tout rendu accéléré est une source de crash.
  "--disable-gpu",
  "--disable-software-rasterizer",
  "--disable-accelerated-2d-canvas",
  // Surface inutile pour un client WhatsApp : autant ne pas la charger.
  "--disable-extensions",
  "--disable-default-apps",
  "--disable-background-networking",
  "--disable-sync",
  "--disable-translate",
  "--disable-client-side-phishing-detection",
  // Un onglet d'arrière-plan bridé fait expirer les requêtes de whatsapp-web.js.
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
  "--disable-hang-monitor",
  "--mute-audio",
  "--hide-scrollbars",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-blink-features=AutomationControlled",
  "--window-size=800,600",
  "--lang=fr-FR",
  // Le cache disque ne sert à rien ici et remplit le volume persistant.
  "--disk-cache-size=1",
  "--media-cache-size=1",
  "--aggressive-cache-discard",
  "--disable-features=TranslateUI,BlinkGenPropertyTrees",
];

// Repli pour environnement contraint, hérité de moov-ai : à n'activer que si
// la mémoire manque réellement.
if (String(process.env.CHROME_SINGLE_PROCESS || "false").toLowerCase() === "true") {
  ARGS_CHROME.push("--single-process", "--no-zygote", "--js-flags=--max-old-space-size=80 --expose-gc");
}

export class WwebjsProvider extends WhatsAppProvider {
  /**
   * @param dossierSession répertoire PERSISTANT (volume), jamais un FS éphémère
   * @param surQr          callback(qr) — l'agent ne diffuse jamais le QR dans les logs publics
   */
  constructor({ dossierSession, clientId = "lycee", surQr = null, surPret = null, surDeconnexion = null, journal = console } = {}) {
    super();
    this._dossier = dossierSession;
    this._clientId = clientId;
    this._surQr = surQr;
    this._surPret = surPret;
    this._surDeconnexion = surDeconnexion;
    this._log = journal;
    this._client = null;
    this._etat = "disconnected";
    this._handler = null;
    this._reconnexions = 0;
    /**
     * Observation riche, a cote de `_etat`.
     *
     * `_etat` garde ses quatre valeurs historiques, dont dependent `/sante`,
     * le surveillant et leurs tests. La machine raconte en plus : depuis quand,
     * ce qui a ete tente, la derniere erreur, le dernier message. Enrichir ne
     * doit pas casser ce qui marche.
     */
    this.machine = new EtatWhatsApp({ journal: (e) => this._tracer(e) });
    /** Cache LID → JID téléphonique : chaque résolution est un aller-retour. */
    this._lidVersNumero = new Map();
  }

  /** Trace structuree du transport. Jamais de numero, jamais de contenu. */
  _tracer(champs) {
    this._log.log?.(JSON.stringify({ ts: new Date().toISOString(), type: "whatsapp", ...champs }));
  }

  getConnectionStatus() {
    return { state: this._etat, reconnexions: this._reconnexions, machine: this.machine.resume() };
  }

  onMessage(handler) {
    this._handler = handler;
  }

  /**
   * Numéro de téléphone réel derrière un identifiant LID.
   *
   * Depuis la migration de WhatsApp vers les LID, un message peut arriver de
   * `…@lid`, dont la partie numérique est un identifiant interne — pas un
   * abonné. `getContactLidAndPhone` est le mécanisme officiel de
   * `whatsapp-web.js` 1.34 pour obtenir la correspondance ; il interroge
   * WhatsApp, qui seul la connaît.
   *
   * Le résultat est mémorisé : un responsable envoie plusieurs messages, et
   * chaque résolution est un aller-retour vers la page du navigateur.
   *
   * @returns {Promise<string|null>} le JID téléphonique (`…@c.us`), ou `null`
   *   si WhatsApp ne sait pas répondre — auquel cas l'agent refuse l'identité
   *   plutôt que de deviner.
   */
  async resoudreLid(jid) {
    if (!this._client || typeof this._client.getContactLidAndPhone !== "function") return null;
    const connu = this._lidVersNumero.get(jid);
    if (connu !== undefined) return connu;
    try {
      // Cet appel traverse Puppeteer jusqu'a la page WhatsApp, qui interroge le
      // reseau. Sans borne, une requete en suspens suspend le traitement du
      // message — sans erreur, sans reponse, sans trace. C'est exactement la
      // panne qui a rendu l'agent muet.
      const [r] =
        (await avecDelai(() => this._client.getContactLidAndPhone([jid]), {
          ms: DELAI_LID_MS,
          operation: "resolution LID",
          defaut: [],
        })) ?? [];
      const pn = r?.pn ?? null;
      // On ne met en cache qu'une réponse exploitable : graver un échec
      // condamnerait ce correspondant jusqu'au redémarrage, pour une panne
      // d'une seconde.
      if (pn) this._lidVersNumero.set(jid, pn);
      return pn;
    } catch (e) {
      this._log.error?.(`[whatsapp] resolution LID impossible : ${e?.message ?? e}`);
      return null;
    }
  }

  async connect() {
    if (!existsSync(this._dossier)) mkdirSync(this._dossier, { recursive: true });
    nettoyerVerrousChrome(this._dossier, this._clientId);

    const { default: wweb } = await import("whatsapp-web.js");
    const { Client, LocalAuth } = wweb;

    this._etat = "connecting";
    this.machine.transiter(ETATS.WHATSAPP_INITIALIZING, { raison: "lancement de Chromium" });
    this._client = new Client({
      authStrategy: new LocalAuth({ clientId: this._clientId, dataPath: this._dossier }),
      puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: ARGS_CHROME,
      },
    });

    this._client.on("qr", (qr) => {
      this._etat = "qr";
      this.machine.qrPropose();
      this._log.info?.("[whatsapp] QR a scanner (non journalise)");
      this._surQr?.(qr);
    });
    this._client.on("ready", () => {
      this._etat = "ready";
      this.machine.transiter(ETATS.WHATSAPP_READY);
      this._log.info?.("[whatsapp] session prete");
      this._surPret?.();
    });
    this._client.on("auth_failure", (m) => {
      this._etat = "disconnected";
      this.machine.transiter(ETATS.WHATSAPP_AUTH_FAILURE, { raison: String(m ?? "echec d'authentification") });
      this._log.error?.("[whatsapp] echec d'authentification", m);
    });
    this._client.on("disconnected", async (raison) => {
      this._etat = "disconnected";
      this.machine.transiter(ETATS.WHATSAPP_DISCONNECTED, { raison: String(raison ?? "sans raison"), compterReconnexion: true });
      this._log.warn?.("[whatsapp] deconnecte:", raison);
      this._surDeconnexion?.(raison);
      await this.reconnect();
    });
    // Ces trois evenements n'etaient pas ecoutes, et ce sont EXACTEMENT ceux
    // qui auraient dit ou le demarrage s'arretait. `authenticated` prouve que
    // la session restauree est acceptee ; `loading_screen` prouve que la page
    // progresse ; `change_state` nomme l'etat interne de WhatsApp Web. Sans
    // eux, « connecting » couvrait indifferemment un Chromium mort, une page
    // blanche et une session refusee.
    this._client.on("authenticated", () => {
      this.machine.transiter(ETATS.WHATSAPP_AUTHENTICATED, { raison: "session restauree et acceptee" });
      this._log.info?.("[whatsapp] authentifie");
    });
    this._client.on("loading_screen", (pourcent, message) => {
      // NE PAS REGRESSER DEPUIS « READY ».
      //
      // Defaut observe en production : apres avoir atteint READY, WhatsApp Web
      // emet encore des `loading_screen` lors de ses re-synchronisations. Cette
      // transition inconditionnelle ramenait donc l'etat a CONNECTING, ou il
      // est reste 5 h 42 pendant que le client servait normalement — un etat
      // detaille qui contredisait `whatsapp = ready`.
      //
      // Le chargement reste trace, parce qu'il est utile ; il ne change
      // simplement plus un etat deja etabli.
      const chargement = `chargement ${pourcent ?? "?"}% ${message ?? ""}`.trim();
      this._tracer({ event: "loading_screen", detail: chargement });
      if (!doitSuivreChargement(this.machine.etat)) return;
      this.machine.transiter(ETATS.WHATSAPP_CONNECTING, { raison: chargement });
    });
    this._client.on("change_state", (etat) => {
      // L'etat interne de WhatsApp Web n'est pas le notre : on le consigne
      // sans le laisser ecraser la machine, sauf s'il annonce un conflit.
      this._tracer({ event: "change_state", etat: String(etat ?? "") });
      if (String(etat) === "CONFLICT" || String(etat) === "UNPAIRED") {
        this.machine.transiter(ETATS.WHATSAPP_ERROR, { raison: `WhatsApp Web signale ${etat}` });
      }
    });

    this._client.on("message", async (msg) => {
      // Un `runId` naît ICI, au plus tôt, et accompagne le message jusqu'à la
      // réponse. Sans lui, un message disparu ne laisse aucune piste à suivre.
      const run = nouveauRun();
      this.machine.messageRecu();
      const debut = Date.now();
      this._tracer({
        event: "message_received",
        run,
        // `_serialized` est absent des objets rendus par la passerelle : on le
        // reconstitue (voir `identifiant-message.js`). `idPartie` est la
        // fraction opaque, journalisable parce qu'elle ne porte aucun numero.
        idMessage: empreinteCourte(serialiserIdMessage(msg?.id)),
        idPartie: partieIdMessage(msg?.id),
        jidType: typeJid(msg?.from),
        typeMessage: msg?.type ?? "inconnu",
        fromMe: Boolean(msg?.fromMe),
        aMedia: Boolean(msg?.hasMedia),
      });

      if (!this._handler) {
        // Aucun gestionnaire : le message serait perdu sans que rien ne le dise.
        this._tracer({ event: "handler_absent", run });
        return;
      }

      try {
        const normalise = await this._normaliser(msg);
        this._tracer({
          event: "message_normalized",
          run,
          jidType: typeJid(normalise.from),
          kind: normalise.kind,
          aTexte: Boolean(normalise.body),
        });

        this._tracer({ event: "handler_started", run });
        const r = await this._handler({ ...normalise, runId: run });
        this._tracer({
          event: "handler_completed",
          run,
          statut: r?.status ?? "inconnu",
          raison: r?.raison ?? null,
          dureeMs: Date.now() - debut,
        });
      } catch (e) {
        this._tracer({
          event: "handler_error",
          run,
          dureeMs: Date.now() - debut,
          erreur: resumerErreur(e),
          detail: decrireErreur(e),
        });
        this._log.error?.("[whatsapp] traitement du message:", resumerErreur(e));
      }
    });

    // LE POINT QUI A COUTE 7 H 27 DE SILENCE.
    //
    // `initialize()` lance Chromium puis charge WhatsApp Web. Quand Chromium
    // s'effondre, Puppeteer ne rejette pas toujours : la promesse reste
    // suspendue. Ce module bornait deja la resolution LID et l'envoi de
    // message — mais pas cet appel-ci, le seul capable de geler le demarrage
    // entier, puisqu'il est attendu au niveau du module.
    try {
      await avecDelai(() => this._client.initialize(), {
        ms: DELAI_INITIALISATION_MS,
        operation: "whatsapp.initialize",
      });
    } catch (e) {
      const bloque = e instanceof DelaiDepasse;
      const raison = bloque
        ? `initialisation suspendue au-dela de ${Math.round(DELAI_INITIALISATION_MS / 60000)} min ` +
          `(Chromium lance mais aucun evenement recu) ; dernier etat connu : ${this.machine.etat}`
        : `initialisation en echec : ${String(e?.message ?? e).slice(0, 180)}`;
      this._etat = "disconnected";
      this.machine.transiter(ETATS.WHATSAPP_ERROR, { raison });
      this._log.error?.(`[whatsapp] ${raison}`);
      this._tracer({ event: "initialize_echec", bloque, raison });
      // On remonte : l'appelant doit pouvoir decider de continuer a servir
      // `/sante` plutot que de mourir, et le surveillant doit pouvoir
      // reessayer. Avaler ici reproduirait le silence qu'on corrige.
      throw e;
    }

    // Chromium peut mourir APRES une initialisation reussie. Sans cette
    // ecoute, sa disparition se manifeste seulement par des envois qui
    // echouent, un par un, sans que l'etat change jamais.
    try {
      const navigateur = this._client.pupBrowser;
      navigateur?.on?.("disconnected", () => {
        this._etat = "disconnected";
        this.machine.transiter(ETATS.WHATSAPP_ERROR, { raison: "le navigateur s'est detache (Chromium arrete ou tombe)" });
        this._log.error?.("[whatsapp] le navigateur s'est detache");
      });
      this._client.pupPage?.on?.("error", (e) => {
        // Une page qui meurt n'interrompt pas le processus Node : sans cette
        // trace, l'incident est invisible.
        this.machine.erreur(`page Chromium : ${String(e?.message ?? e)}`);
        this._tracer({ event: "page_error", erreur: String(e?.message ?? e).slice(0, 200) });
      });
    } catch (e) {
      // L'absence de ces poignees n'est pas une raison de refuser une session
      // qui fonctionne : on le note et on continue.
      this._tracer({ event: "surveillance_navigateur_indisponible", erreur: String(e?.message ?? e).slice(0, 120) });
    }
  }

  /** Traduit un message whatsapp-web.js en forme stable attendue par l'agent. */
  async _normaliser(msg) {
    const kind =
      msg.type === "ptt" || msg.type === "audio"
        ? "audio"
        : msg.type === "image"
          ? "image"
          : msg.type === "document"
            ? "document"
            : "text";
    // L'EXPEDITEUR EST LA SEULE DONNEE DONT DEPEND TOUTE LA SUITE.
    //
    // Sans lui, aucune identite ne se resout et le message est refuse. La
    // bibliotheque le derive de `data.from._serialized`, le nom que WhatsApp
    // Web a renomme `$1` en juillet 2026 ; la version publiee que nous
    // epinglons ne connait pas encore le nouveau. En production ce champ
    // fonctionnait — les refus d'identite auraient ete massifs sinon — mais
    // nous ne le laissons pas dependre d'un nom qui a deja change une fois.
    let expediteur = typeof msg.from === "string" ? msg.from : null;
    if (!expediteur) {
      expediteur = chaineIdentifiant(msg.from) ?? chaineIdentifiant(msg.id?.remote) ?? "";
      this._tracer({
        event: "expediteur_reconstitue",
        trouve: Boolean(expediteur),
        typeRecu: msg.from === null ? "null" : typeof msg.from,
      });
    }
    return {
      id: serialiserIdMessage(msg.id) ?? msg.id?.id ?? null,
      from: expediteur,
      body: msg.body ?? "",
      kind,
      timestamp: (msg.timestamp ?? 0) * 1000,
      _brut: msg,
    };
  }

  /**
   * Télécharge le média d'un message entrant.
   *
   * LE DÉFAUT QUI BLOQUAIT TOUTE NOTE VOCALE ENTRANTE
   * --------------------------------------------------
   * `Message.downloadMedia()` passe `this.id._serialized` au code de la page.
   * Or cette propriété est absente des objets rendus par la passerelle — un
   * accesseur de prototype perdu dans la traversée de Puppeteer, expliqué en
   * détail dans `identifiant-message.js`. WhatsApp Web recevait donc
   * `undefined`, et levait une erreur minifiée d'une seule lettre : le
   * `handler_failed: "r"` qui faisait échouer chaque note vocale avant même
   * l'appel au modèle. On répare l'identifiant avant d'appeler la
   * bibliothèque, plutôt que de recopier son code chez nous.
   *
   * Chaque étape est tracée séparément : « la voix ne marche pas » ne dit pas
   * s'il faut regarder le téléchargement, le déchiffrement ou la taille.
   */
  async getMedia(message) {
    const brut = message?._brut ?? message;
    if (!brut) return null;
    if (!brut.hasMedia) {
      this._tracer({ event: "media_absent", raison: "le message ne porte aucun media" });
      return null;
    }

    const reparation = reparerIdMessage(brut);
    if (!reparation.ok) {
      // Inutile d'appeler la bibliothèque : elle lèverait la même erreur
      // illisible qu'avant. On nomme la cause.
      throw new Error(
        "telechargement impossible : l'identifiant du message est inexploitable " +
          "(ni `_serialized`, ni `remote`+`id` utilisables)",
      );
    }
    if (reparation.repare) {
      this._tracer({ event: "media_id_repare", idPartie: partieIdMessage(brut.id) });
    }

    const debut = Date.now();
    this._tracer({
      event: "media_download_started",
      idPartie: partieIdMessage(brut.id),
      typeMessage: brut.type ?? "inconnu",
      mimetype: brut.mimetype ?? null,
      dureeAnnonceeS: typeof brut.duration === "number" ? brut.duration : null,
    });

    let media;
    try {
      media = await avecDelai(() => brut.downloadMedia(), {
        ms: DELAI_MEDIA_MS,
        operation: "telechargement du media",
      });
    } catch (e) {
      this._tracer({
        event: "media_download_failed",
        dureeMs: Date.now() - debut,
        erreur: resumerErreur(e),
        detail: decrireErreur(e),
      });
      throw e;
    }

    // `undefined` signifie quelque chose de précis chez whatsapp-web.js : le
    // média a expiré, est en cours de réenvoi, ou le serveur a répondu 404.
    // Ce n'est pas une panne de l'agent, et le message d'erreur doit le dire.
    if (!media || !media.data) {
      this._tracer({ event: "media_indisponible", dureeMs: Date.now() - debut });
      return null;
    }

    const data = Buffer.from(media.data, "base64");
    if (data.length === 0) {
      this._tracer({ event: "media_vide", dureeMs: Date.now() - debut });
      return null;
    }
    if (data.length > MEDIA_MAX_OCTETS) {
      this._tracer({ event: "media_trop_volumineux", octets: data.length, limite: MEDIA_MAX_OCTETS });
      throw new Error(`media trop volumineux : ${Math.round(data.length / 1024)} Ko (limite ${Math.round(MEDIA_MAX_OCTETS / 1024)} Ko)`);
    }

    this._tracer({
      event: "media_downloaded",
      dureeMs: Date.now() - debut,
      octets: data.length,
      mimetype: media.mimetype ?? null,
    });
    return {
      mimetype: media.mimetype ?? null,
      data,
      filename: media.filename ?? null,
      // La durée annoncée par WhatsApp, quand elle existe : utile pour refuser
      // un enregistrement d'une heure avant de le télécharger entièrement.
      dureeS: typeof brut.duration === "number" ? brut.duration : null,
    };
  }

  async sendText(jid, texte) {
    const debut = Date.now();
    this._tracer({ event: "reply_started", jidType: typeJid(jid), taille: texte?.length ?? 0 });
    try {
      // La promesse resolue prouve que WhatsApp a ACCEPTE le message. Elle ne
      // prouve ni la livraison ni la lecture : ne pas confondre les trois.
      const envoye = await avecDelai(() => this._client.sendMessage(jid, texte), {
        ms: DELAI_ENVOI_MS,
        operation: "envoi WhatsApp",
      });
      const id = serialiserIdMessage(envoye?.id);
      this._tracer({
        event: "reply_accepted",
        jidType: typeJid(jid),
        dureeMs: Date.now() - debut,
        idMessage: empreinteCourte(id),
        idPartie: partieIdMessage(envoye?.id),
        // L'acquittement au moment de l'acceptation : 1 signifie « parti du
        // serveur ». Les etats superieurs (livre, lu) arrivent plus tard et ne
        // peuvent pas etre constates ici.
        ack: typeof envoye?.ack === "number" ? envoye.ack : null,
      });
      return { ok: true, id, idPartie: partieIdMessage(envoye?.id), ack: envoye?.ack ?? null };
    } catch (e) {
      // Une reponse qui ne part pas doit etre bruyante : l'utilisateur, lui,
      // ne verra qu'un silence.
      this._tracer({
        event: "reply_failed",
        jidType: typeJid(jid),
        dureeMs: Date.now() - debut,
        erreur: resumerErreur(e, { max: 160 }),
        detail: decrireErreur(e),
      });
      throw e;
    }
  }

  async sendMedia(jid, { data, mimetype, filename, caption } = {}) {
    const { default: wweb } = await import("whatsapp-web.js");
    const media = new wweb.MessageMedia(mimetype, Buffer.from(data).toString("base64"), filename);
    await this._client.sendMessage(jid, media, { caption });
    return { ok: true };
  }

  /**
   * Envoie une note vocale.
   *
   * POURQUOI LE TYPE MIME EST DÉPOUILLÉ DE SES PARAMÈTRES
   * ------------------------------------------------------
   * Le premier envoi réel a échoué sur « Data passed to getter must include an
   * id property (it's how we memoize) but got undefined », levé par le code de
   * WhatsApp Web. Dans `util/Injected/Utils.js`, le type de média est résolu
   * par `msgToMediaType({ type: mediaData.type, … })`, et `mediaData.type`
   * découle du type MIME. Un `audio/ogg; codecs=opus` non reconnu rend donc
   * `type` indéfini, et le getter mémoïsé en aval échoue sur exactement ce
   * message. Le paramètre `codecs` est pourtant inutile ici : le conteneur et
   * le codec sont déjà garantis par `ffprobe` avant l'envoi.
   *
   * POURQUOI TROIS TENTATIVES
   * --------------------------
   * L'envoi de texte vers ce même numéro fonctionnait déjà, donc le JID est
   * joignable. Mais le chemin média exige en plus que la conversation soit
   * résolue dans le magasin de la page, et que l'identifiant soit celui que
   * WhatsApp reconnaît — l'adressage ayant migré vers les LID. Chaque
   * tentative lève une hypothèse différente, et la trace dit laquelle a
   * abouti : sans cela, un succès n'apprendrait rien pour la fois suivante.
   *
   * L'identifiant du message est RENDU. L'ancienne version le jetait, ce qui
   * rendait impossible de distinguer un envoi accepté d'un envoi perdu.
   */
  async sendAudio(jid, { data, mimetype = "audio/ogg" } = {}) {
    const debut = Date.now();
    const { default: wweb } = await import("whatsapp-web.js");
    // `audio/ogg; codecs=opus` -> `audio/ogg` : voir l'en-tête.
    const type = String(mimetype).split(";")[0].trim() || "audio/ogg";
    const media = new wweb.MessageMedia(type, Buffer.from(data).toString("base64"), "reponse.ogg");
    this._tracer({ event: "audio_started", jidType: typeJid(jid), type, octets: data?.length ?? 0 });

    const tentatives = [
      {
        nom: "direct",
        faire: () => this._client.sendMessage(jid, media, { sendAudioAsVoice: true }),
      },
      {
        // La conversation doit exister dans le magasin de la page : un envoi
        // media vers une conversation jamais ouverte echoue la ou un texte
        // l'aurait creee.
        nom: "conversation_resolue",
        faire: async () => {
          const chat = await this._client.getChatById(jid);
          return chat.sendMessage(media, { sendAudioAsVoice: true });
        },
      },
      {
        // Dernier recours : demander a WhatsApp l'identifiant canonique du
        // numero. Depuis la migration vers les LID, celui que nous composons
        // n'est pas toujours celui qu'il reconnait.
        nom: "identifiant_canonique",
        faire: async () => {
          const resolu = await this._client.getNumberId(String(jid).split("@")[0]);
          if (!resolu?._serialized) throw new Error("numero non resolu par WhatsApp");
          return this._client.sendMessage(resolu._serialized, media, { sendAudioAsVoice: true });
        },
      },
    ];

    // AVANT la premiere tentative : si une note vocale de nous figure deja
    // dans l'historique recent, c'est que l'appel precedent a abouti malgre
    // son apparence d'echec. On ne double pas.
    const anterieur = await this._noteVocaleRecente(jid, debut - FENETRE_DOUBLON_MS);
    if (anterieur) {
      this._tracer({ event: "audio_deja_envoye", jidType: typeJid(jid), idPartie: anterieur.idPartie });
      return { ok: true, voie: "deja_envoye", ...anterieur, doublonEvite: true };
    }

    let derniere = null;
    for (const { nom, faire } of tentatives) {
      try {
        const envoye = await avecDelai(faire, { ms: DELAI_ENVOI_MS, operation: `envoi audio (${nom})` });
        const id = serialiserIdMessage(envoye?.id);
        this._tracer({
          event: "audio_accepted",
          voie: nom,
          jidType: typeJid(jid),
          dureeMs: Date.now() - debut,
          idMessage: empreinteCourte(id),
          idPartie: partieIdMessage(envoye?.id),
          ack: typeof envoye?.ack === "number" ? envoye.ack : null,
        });
        this.machine.envoiTente({ ok: true });
        return { ok: true, voie: nom, id, idPartie: partieIdMessage(envoye?.id), ack: envoye?.ack ?? null };
      } catch (e) {
        derniere = e;
        this._tracer({
          event: "audio_retry",
          voie: nom,
          erreur: resumerErreur(e, { max: 180 }),
          detail: decrireErreur(e),
        });

        // UN ECHEC N'EST PAS UNE PREUVE DE NON-ENVOI.
        //
        // Un depassement de delai, en particulier, peut survenir alors que le
        // media est deja parti. Enchainer la voie suivante enverrait alors un
        // second vocal au destinataire. On consulte donc l'historique avant de
        // continuer ; c'est la seule source qui tranche.
        const arrive = await this._noteVocaleRecente(jid, debut);
        if (arrive) {
          this._tracer({ event: "audio_deja_envoye", voie: nom, jidType: typeJid(jid), idPartie: arrive.idPartie });
          this.machine.envoiTente({ ok: true });
          return { ok: true, voie: nom, ...arrive, erreurApparente: resumerErreur(e, { max: 120 }) };
        }
      }
    }

    // Les trois voies ont echoue : on le dit, plutot que de rendre un succes.
    // La reponse ecrite, elle, a deja ete envoyee par l'appelant.
    this._tracer({ event: "audio_failed", jidType: typeJid(jid), dureeMs: Date.now() - debut, detail: decrireErreur(derniere) });
    this.machine.envoiTente({ ok: false, raison: resumerErreur(derniere) });
    throw new Error(`envoi audio impossible apres 3 voies : ${resumerErreur(derniere)}`);
  }

  /**
   * Cherche dans l'historique une note vocale que NOUS avons envoyée depuis
   * un instant donné.
   *
   * C'est l'arbitre des envois ambigus. Elle ne lève jamais : ne pas savoir
   * répondre « oui » doit se traduire par « je n'ai rien trouvé », et non par
   * une erreur qui masquerait l'échec d'origine.
   */
  async _noteVocaleRecente(jid, depuisMs) {
    try {
      const chat = await avecDelai(() => this._client.getChatById(jid), { ms: DELAI_LID_MS, operation: "lecture de la conversation" });
      const messages = await avecDelai(() => chat.fetchMessages({ limit: 12 }), {
        ms: DELAI_LID_MS,
        operation: "lecture de l'historique",
      });
      for (const m of messages ?? []) {
        if (!m?.fromMe) continue;
        if (m.type !== "ptt" && m.type !== "audio") continue;
        if ((m.timestamp ?? 0) * 1000 < depuisMs) continue;
        return {
          id: serialiserIdMessage(m.id),
          idPartie: partieIdMessage(m.id),
          ack: typeof m.ack === "number" ? m.ack : null,
          typeMedia: m.type,
        };
      }
      return null;
    } catch (e) {
      this._tracer({ event: "historique_illisible", erreur: resumerErreur(e, { max: 140 }) });
      return null;
    }
  }

  /**
   * Relit l'acquittement d'un message déjà envoyé.
   *
   * « Accepté » et « livré » sont deux faits distincts, séparés par le réseau
   * du destinataire. Seule une relecture après coup peut constater le second.
   * Codes WhatsApp : -1 erreur, 0 en attente, 1 parti du serveur, 2 livré,
   * 3 lu, 4 écouté.
   */
  async acquittement(identifiant) {
    try {
      const msg = await avecDelai(() => this._client.getMessageById(identifiant), {
        ms: DELAI_LID_MS,
        operation: "relecture du message",
      });
      if (!msg) return { trouve: false, ack: null, etat: "introuvable" };
      const ack = typeof msg.ack === "number" ? msg.ack : null;
      return { trouve: true, ack, etat: ETATS_ACK[ack] ?? "inconnu", typeMedia: msg.type ?? null };
    } catch (e) {
      return { trouve: false, ack: null, etat: "illisible", erreur: resumerErreur(e, { max: 140 }) };
    }
  }

  /** Reconnexion avec recul exponentiel plafonné : un réseau coupé ne doit pas marteler WhatsApp. */
  async reconnect() {
    this._reconnexions++;
    const attente = Math.min(60_000, 2_000 * 2 ** Math.min(this._reconnexions - 1, 5));
    this._log.warn?.(`[whatsapp] reconnexion #${this._reconnexions} dans ${attente}ms`);
    await new Promise((r) => setTimeout(r, attente));
    try {
      await this._client?.destroy();
    } catch {
      /* deja detruit */
    }
    await this.connect();
  }

  async disconnect() {
    this._etat = "disconnected";
    try {
      await this._client?.destroy();
    } catch {
      /* rien a faire */
    }
  }
}
