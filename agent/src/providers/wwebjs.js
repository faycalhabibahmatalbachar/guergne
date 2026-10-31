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

export class WwebjsProvider extends WhatsAppProvider {
  /**
   * @param dossierSession répertoire PERSISTANT (volume), jamais un FS éphémère
   * @param surQr          callback(qr) — l'agent ne diffuse jamais le QR dans les logs publics
   */
  constructor({ dossierSession, clientId = "lycee", surQr = null, journal = console } = {}) {
    super();
    this._dossier = dossierSession;
    this._clientId = clientId;
    this._surQr = surQr;
    this._log = journal;
    this._client = null;
    this._etat = "disconnected";
    this._handler = null;
    this._reconnexions = 0;
  }

  getConnectionStatus() {
    return { state: this._etat, reconnexions: this._reconnexions };
  }

  onMessage(handler) {
    this._handler = handler;
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
        // Obligatoire en conteneur : pas de sandbox namespace, et /dev/shm trop
        // petit fait planter Chrome au bout de quelques pages.
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
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
    });
    this._client.on("auth_failure", (m) => {
      this._etat = "disconnected";
      this._log.error?.("[whatsapp] echec d'authentification", m);
    });
    this._client.on("disconnected", async (raison) => {
      this._etat = "disconnected";
      this._log.warn?.("[whatsapp] deconnecte:", raison);
      await this.reconnect();
    });
    this._client.on("message", async (msg) => {
      if (!this._handler) return;
      try {
        await this._handler(await this._normaliser(msg));
      } catch (e) {
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
    await this._client.sendMessage(jid, texte);
    return { ok: true };
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
