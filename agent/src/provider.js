/**
 * WhatsAppProvider — l'interface que l'agent utilise pour parler à WhatsApp.
 *
 * L'agent n'importe JAMAIS `whatsapp-web.js` directement (mitigation DT-001) :
 * un `WwebjsProvider` (whatsapp-web.js) et un `CloudApiProvider` (API officielle)
 * implémenteront ce même contrat, interchangeables sans toucher à l'agent.
 */
export class WhatsAppProvider {
  async connect() {
    throw new Error("WhatsAppProvider.connect non implémenté");
  }
  async disconnect() {
    throw new Error("WhatsAppProvider.disconnect non implémenté");
  }
  getConnectionStatus() {
    throw new Error("WhatsAppProvider.getConnectionStatus non implémenté");
  }
  onMessage(_handler) {
    throw new Error("WhatsAppProvider.onMessage non implémenté");
  }
  async sendText(_jid, _text) {
    throw new Error("WhatsAppProvider.sendText non implémenté");
  }
  async sendMedia(_jid, _media) {
    throw new Error("WhatsAppProvider.sendMedia non implémenté");
  }
  async sendAudio(_jid, _media) {
    throw new Error("WhatsAppProvider.sendAudio non implémenté");
  }
  async getMedia(_message) {
    throw new Error("WhatsAppProvider.getMedia non implémenté");
  }
  async reconnect() {
    throw new Error("WhatsAppProvider.reconnect non implémenté");
  }
}

/**
 * Provider en mémoire pour les tests et le mode simulation : enregistre ce qui
 * est envoyé et laisse un test injecter un message entrant. Aucun accès réseau,
 * aucun QR code — c'est ce qui rend le cœur de l'agent testable hors ligne.
 */
export class FakeProvider extends WhatsAppProvider {
  constructor() {
    super();
    this.sent = [];
    this._handler = null;
    this._status = "ready";
  }
  async connect() {
    this._status = "ready";
  }
  async disconnect() {
    this._status = "disconnected";
  }
  getConnectionStatus() {
    return { state: this._status };
  }
  onMessage(handler) {
    this._handler = handler;
  }
  async sendText(jid, text) {
    this.sent.push({ jid, kind: "text", text });
    return { ok: true };
  }
  async sendMedia(jid, media) {
    this.sent.push({ jid, kind: "media", media });
    return { ok: true };
  }
  async sendAudio(jid, media) {
    this.sent.push({ jid, kind: "audio", media });
    return { ok: true };
  }
  /**
   * Rend un média dans la MÊME forme que le transport réel.
   *
   * Un faux qui rendait la forme libre fournie par le test a laissé passer un
   * défaut de production pendant des semaines : le moteur n'avait jamais été
   * éprouvé contre le contrat réel `{ mimetype, data: Buffer }`. Le faux le
   * respecte donc maintenant, quelle que soit la forme écrite dans le test.
   */
  async getMedia(message) {
    const m = message?.media;
    if (!m) return null;
    const brut = m.data ?? m.bytes ?? m;
    const data = Buffer.isBuffer(brut) ? brut : Buffer.from(String(brut));
    return { mimetype: m.mimetype ?? "audio/ogg; codecs=opus", data, filename: m.filename ?? null, dureeS: m.dureeS ?? null };
  }
  async reconnect() {
    this._status = "ready";
  }
  /** Dernier texte envoyé à un JID (utilitaire de test). */
  lastTextTo(jid) {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      if (this.sent[i].jid === jid && this.sent[i].kind === "text") return this.sent[i].text;
    }
    return null;
  }
}
