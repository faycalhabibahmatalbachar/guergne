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
import { avecDelai } from "../delai.js";
import { analyserJid } from "../jid.js";

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
    /** Cache LID → JID téléphonique : chaque résolution est un aller-retour. */
    this._lidVersNumero = new Map();
  }

  /** Trace structuree du transport. Jamais de numero, jamais de contenu. */
  _tracer(champs) {
    this._log.log?.(JSON.stringify({ ts: new Date().toISOString(), type: "whatsapp", ...champs }));
  }

  getConnectionStatus() {
    return { state: this._etat, reconnexions: this._reconnexions };
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
      this._log.info?.("[whatsapp] QR a scanner (non journalise)");
      this._surQr?.(qr);
    });
    this._client.on("ready", () => {
      this._etat = "ready";
      this._log.info?.("[whatsapp] session prete");
      this._surPret?.();
    });
    this._client.on("auth_failure", (m) => {
      this._etat = "disconnected";
      this._log.error?.("[whatsapp] echec d'authentification", m);
    });
    this._client.on("disconnected", async (raison) => {
      this._etat = "disconnected";
      this._log.warn?.("[whatsapp] deconnecte:", raison);
      this._surDeconnexion?.(raison);
      await this.reconnect();
    });
    this._client.on("message", async (msg) => {
      // Un `runId` naît ICI, au plus tôt, et accompagne le message jusqu'à la
      // réponse. Sans lui, un message disparu ne laisse aucune piste à suivre.
      const run = nouveauRun();
      const debut = Date.now();
      this._tracer({
        event: "message_received",
        run,
        idMessage: empreinteCourte(msg?.id?._serialized),
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
          erreur: String(e?.message ?? e).slice(0, 200),
        });
        this._log.error?.("[whatsapp] traitement du message:", e?.message ?? e);
      }
    });

    await this._client.initialize();
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
    return {
      id: msg.id?._serialized ?? msg.id?.id ?? null,
      from: msg.from,
      body: msg.body ?? "",
      kind,
      timestamp: (msg.timestamp ?? 0) * 1000,
      _brut: msg,
    };
  }

  async getMedia(message) {
    const brut = message?._brut ?? message;
    if (!brut?.hasMedia) return null;
    const media = await brut.downloadMedia();
    if (!media) return null;
    return { mimetype: media.mimetype, data: Buffer.from(media.data, "base64"), filename: media.filename ?? null };
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
      this._tracer({
        event: "reply_accepted",
        jidType: typeJid(jid),
        dureeMs: Date.now() - debut,
        idMessage: empreinteCourte(envoye?.id?._serialized),
      });
      return { ok: true };
    } catch (e) {
      // Une reponse qui ne part pas doit etre bruyante : l'utilisateur, lui,
      // ne verra qu'un silence.
      this._tracer({
        event: "reply_failed",
        jidType: typeJid(jid),
        dureeMs: Date.now() - debut,
        erreur: String(e?.message ?? e).slice(0, 160),
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

  async sendAudio(jid, { data, mimetype = "audio/ogg; codecs=opus" } = {}) {
    const { default: wweb } = await import("whatsapp-web.js");
    const media = new wweb.MessageMedia(mimetype, Buffer.from(data).toString("base64"), "reponse.ogg");
    await this._client.sendMessage(jid, media, { sendAudioAsVoice: true });
    return { ok: true };
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
