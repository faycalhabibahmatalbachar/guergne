import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const VERSION_CLE = 1;
const VERSION_HMAC = 1;
const MAX_TEXTE = 12_000;
const MAX_HISTORIQUE = 12;

function lireCle(value, nom) {
  if (!value || typeof value !== "string") {
    throw new Error(nom + " est obligatoire lorsque la mémoire WhatsApp est activée.");
  }
  const raw = value.trim();
  const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(nom + " doit contenir exactement 32 octets (base64 ou hexadécimal).");
  }
  return key;
}

export function lireCleMemoire(value, nom = "AGENT_MEMORY_ENCRYPTION_KEY") {
  return lireCle(value, nom);
}

export function chiffrer(texte, key) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(String(texte ?? ""), "utf8"), cipher.final()]);
  return { ciphertext, nonce, tag: cipher.getAuthTag(), keyVersion: VERSION_CLE };
}

export function dechiffrer(enveloppe, key) {
  if (!enveloppe || !Buffer.isBuffer(enveloppe.ciphertext) ||
      !Buffer.isBuffer(enveloppe.nonce) || !Buffer.isBuffer(enveloppe.tag)) {
    throw new Error("Enveloppe mémoire chiffrée invalide.");
  }
  if (enveloppe.nonce.length !== 12 || enveloppe.tag.length !== 16) {
    throw new Error("Paramètres AES-GCM invalides.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, enveloppe.nonce);
  decipher.setAuthTag(enveloppe.tag);
  return Buffer.concat([decipher.update(enveloppe.ciphertext), decipher.final()]).toString("utf8");
}

export function empreintePair(jid, hmacKey) {
  if (!jid || typeof jid !== "string") throw new Error("JID WhatsApp absent.");
  return createHmac("sha256", hmacKey).update(jid, "utf8").digest("hex");
}

function typeMessage(type) {
  return ["text", "audio", "image", "document", "location", "other"].includes(type) ? type : "other";
}

export class NeonConversationMemory {
  constructor({ connectionString, encryptionKey, hmacKey, pool = null, logger = null, maxConnections = 4 } = {}) {
    if (!connectionString && !pool) throw new Error("AGENT_MEMORY_DATABASE_URL est obligatoire.");
    this.encryptionKey = lireCle(encryptionKey, "AGENT_MEMORY_ENCRYPTION_KEY");
    this.hmacKey = lireCle(hmacKey, "AGENT_MEMORY_HMAC_KEY");
    this.pool = pool ?? new Pool({
      connectionString,
      max: Math.max(1, Math.min(Number(maxConnections) || 4, 8)),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: "guergne-whatsapp-memory",
    });
    this.logger = logger;
    this.enabled = true;
    this.lastPurgeAt = 0;
  }

  _log(event, details = {}) {
    this.logger?.({ event, ...details });
  }

  async ping() {
    await this.pool.query("SELECT 1");
    return true;
  }

  _dechiffrerRow(row, column) {
    return dechiffrer({
      ciphertext: row[column],
      nonce: row.nonce_chiffrement,
      tag: row.tag_authentification,
    }, this.encryptionKey);
  }

  async prepare({ actorId, jid, providerMessageId = null, text = "", messageType = "text" } = {}) {
    if (!actorId || !jid) throw new Error("Identité authentifiée et JID requis pour ouvrir une mémoire.");
    const peerHash = empreintePair(jid, this.hmacKey);
    const client = await this.pool.connect();
    let conversationId;
    let history = [];
    let pending = null;
    let summaries = [];
    let facts = [];

    try {
      await client.query("BEGIN");
      const conversation = await client.query(
        "INSERT INTO public.wa_conversations " +
        "(acteur_id, canal, peer_hash_version, peer_hash, dernier_message_le) " +
        "VALUES ($1, 'whatsapp', $2, $3, now()) " +
        "ON CONFLICT (canal, peer_hash_version, peer_hash) DO UPDATE " +
        "SET modifie_le = now() " +
        "WHERE public.wa_conversations.acteur_id = EXCLUDED.acteur_id " +
        "RETURNING id, acteur_id",
        [actorId, VERSION_HMAC, peerHash],
      );
      if (!conversation.rows?.length) {
        throw new Error("L'identité propriétaire de cette conversation a changé ; accès mémoire refusé.");
      }
      conversationId = conversation.rows[0].id;

      const recent = await client.query(
        "SELECT direction, contenu_chiffre, nonce_chiffrement, tag_authentification " +
        "FROM public.wa_messages WHERE conversation_id = $1 AND expire_le > now() " +
        "AND contenu_chiffre IS NOT NULL ORDER BY cree_le DESC LIMIT $2",
        [conversationId, MAX_HISTORIQUE],
      );
      history = recent.rows.reverse().flatMap((row) => {
        try {
          const content = this._dechiffrerRow(row, "contenu_chiffre");
          return [{ role: row.direction === "outbound" ? "assistant" : "user", content: content.slice(-MAX_TEXTE) }];
        } catch {
          this._log("memory_message_decrypt_failed");
          return [];
        }
      });

      const stateResult = await client.query(
        "SELECT intention_en_attente, outil_en_attente, parametres_chiffres, " +
        "nonce_chiffrement, tag_authentification, champs_manquants, expire_le " +
        "FROM public.wa_conversation_state WHERE conversation_id = $1 AND expire_le > now() LIMIT 1",
        [conversationId],
      );
      if (stateResult.rows?.length) {
        const row = stateResult.rows[0];
        let params = {};
        if (row.parametres_chiffres) {
          try {
            params = JSON.parse(dechiffrer({
              ciphertext: row.parametres_chiffres,
              nonce: row.nonce_chiffrement,
              tag: row.tag_authentification,
            }, this.encryptionKey));
          } catch {
            this._log("memory_state_decrypt_failed");
            params = null;
          }
        }
        pending = params === null ? null : {
          intention: row.intention_en_attente,
          tool: row.outil_en_attente,
          params,
          missingFields: row.champs_manquants ?? [],
          expiresAt: row.expire_le,
        };
      }

      const summariesResult = await client.query(
        "SELECT resume_chiffre, nonce_chiffrement, tag_authentification FROM public.wa_memory_summaries " +
        "WHERE acteur_id = $1 AND expire_le > now() ORDER BY cree_le DESC LIMIT 3",
        [actorId],
      );
      summaries = summariesResult.rows.reverse().flatMap((row) => {
        try { return [this._dechiffrerRow(row, "resume_chiffre")]; }
        catch { this._log("memory_summary_decrypt_failed"); return []; }
      });

      const factsResult = await client.query(
        "SELECT categorie, cle, valeur_chiffree, nonce_chiffrement, tag_authentification, confiance, importance " +
        "FROM public.wa_memory_facts WHERE acteur_id = $1 " +
        "AND (expire_le IS NULL OR expire_le > now()) " +
        "ORDER BY importance DESC, modifie_le DESC LIMIT 12",
        [actorId],
      );
      facts = factsResult.rows.flatMap((row) => {
        try {
          return [{
            category: row.categorie,
            key: row.cle,
            value: this._dechiffrerRow(row, "valeur_chiffree"),
            confidence: Number(row.confiance),
            importance: row.importance,
          }];
        } catch {
          this._log("memory_fact_decrypt_failed");
          return [];
        }
      });

      const encrypted = chiffrer(String(text ?? "").slice(0, MAX_TEXTE), this.encryptionKey);
      const providerId = providerMessageId == null ? null : String(providerMessageId).slice(0, 512);
      await client.query(
        "INSERT INTO public.wa_messages " +
        "(conversation_id, provider_message_id, direction, type_message, contenu_chiffre, nonce_chiffrement, " +
        "tag_authentification, version_cle, statut, metadonnees) " +
        "VALUES ($1, $2, 'inbound', $3, $4, $5, $6, $7, 'received', $8::jsonb) " +
        "ON CONFLICT (conversation_id, provider_message_id) WHERE provider_message_id IS NOT NULL DO NOTHING",
        [conversationId, providerId, typeMessage(messageType), encrypted.ciphertext, encrypted.nonce,
          encrypted.tag, encrypted.keyVersion, JSON.stringify({ origin: "whatsapp", schemaVersion: 1 })],
      );
      await client.query(
        "UPDATE public.wa_conversations SET dernier_message_le = now(), modifie_le = now() WHERE id = $1",
        [conversationId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    if (Date.now() - this.lastPurgeAt > 60 * 60 * 1000) {
      this.lastPurgeAt = Date.now();
      this.purgeExpired().catch(() => this._log("memory_purge_failed"));
    }
    return { conversationId, actorId, history, pending, summaries, facts };
  }

  async appendMessage({ session, text = "", direction = "outbound", messageType = "text", providerMessageId = null, intent = null, tool = null } = {}) {
    if (!session?.conversationId) return;
    if (!["inbound", "outbound", "system"].includes(direction)) throw new Error("Direction mémoire invalide.");
    const encrypted = chiffrer(String(text ?? "").slice(0, MAX_TEXTE), this.encryptionKey);
    const providerId = providerMessageId == null ? null : String(providerMessageId).slice(0, 512);
    await this.pool.query(
      "INSERT INTO public.wa_messages " +
      "(conversation_id, provider_message_id, direction, type_message, contenu_chiffre, nonce_chiffrement, " +
      "tag_authentification, version_cle, statut, intention, outil, metadonnees) " +
      "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb) " +
      "ON CONFLICT (conversation_id, provider_message_id) WHERE provider_message_id IS NOT NULL DO NOTHING",
      [session.conversationId, providerId, direction, typeMessage(messageType), encrypted.ciphertext,
        encrypted.nonce, encrypted.tag, encrypted.keyVersion, direction === "outbound" ? "sent" : "processed",
        intent, tool, JSON.stringify({ origin: "whatsapp", schemaVersion: 1 })],
    );
    await this.pool.query(
      "UPDATE public.wa_conversations SET dernier_message_le = now(), modifie_le = now() WHERE id = $1",
      [session.conversationId],
    );
  }

  async saveState(session, { intention = "clarification", tool = null, params = {}, missingFields = [] } = {}) {
    if (!session?.conversationId) return;
    const encrypted = chiffrer(JSON.stringify(params ?? {}), this.encryptionKey);
    await this.pool.query(
      "INSERT INTO public.wa_conversation_state " +
      "(conversation_id, intention_en_attente, outil_en_attente, parametres_chiffres, nonce_chiffrement, " +
      "tag_authentification, champs_manquants, expire_le, modifie_le) " +
      "VALUES ($1, $2, $3, $4, $5, $6, $7, now() + interval '48 hours', now()) " +
      "ON CONFLICT (conversation_id) DO UPDATE SET intention_en_attente = EXCLUDED.intention_en_attente, " +
      "outil_en_attente = EXCLUDED.outil_en_attente, parametres_chiffres = EXCLUDED.parametres_chiffres, " +
      "nonce_chiffrement = EXCLUDED.nonce_chiffrement, tag_authentification = EXCLUDED.tag_authentification, " +
      "champs_manquants = EXCLUDED.champs_manquants, expire_le = EXCLUDED.expire_le, modifie_le = now()",
      [session.conversationId, intention, tool, encrypted.ciphertext, encrypted.nonce, encrypted.tag,
        Array.isArray(missingFields) ? missingFields.map(String).slice(0, 20) : []],
    );
  }

  async clearState(session) {
    if (!session?.conversationId) return;
    await this.pool.query("DELETE FROM public.wa_conversation_state WHERE conversation_id = $1", [session.conversationId]);
  }

  async saveSummary({ actorId, conversationId = null, text, sourceMessageCount = 0, expiresDays = 180 } = {}) {
    if (!actorId || !text) throw new Error("Acteur et résumé requis.");
    const encrypted = chiffrer(String(text).slice(0, 8_000), this.encryptionKey);
    const days = Math.max(1, Math.min(365, Number(expiresDays) || 180));
    await this.pool.query(
      "INSERT INTO public.wa_memory_summaries " +
      "(acteur_id, conversation_id, resume_chiffre, nonce_chiffrement, tag_authentification, " +
      "version_cle, nb_messages_source, expire_le) VALUES ($1, $2, $3, $4, $5, $6, $7, now() + ($8 * interval '1 day'))",
      [actorId, conversationId, encrypted.ciphertext, encrypted.nonce, encrypted.tag,
        encrypted.keyVersion, Math.max(0, Number(sourceMessageCount) || 0), days],
    );
  }

  async saveFact({ actorId, category, key, value, confidence = 1, importance = 3, source = "user_explicit", expiresAt = null } = {}) {
    if (!actorId || !value || String(value).length > 2_000) throw new Error("Fait mémoire invalide.");
    if (!["preference", "procedure", "contexte_non_sensible"].includes(category)) {
      throw new Error("Cette catégorie de fait ne peut pas être mémorisée.");
    }
    if (!/^[a-z0-9_.:-]{1,80}$/.test(String(key ?? ""))) throw new Error("Clé de fait invalide.");
    if (!["user_explicit", "user_confirmed", "conversation_inferred"].includes(source)) {
      throw new Error("Source de fait invalide.");
    }
    const encrypted = chiffrer(String(value), this.encryptionKey);
    await this.pool.query(
      "INSERT INTO public.wa_memory_facts " +
      "(acteur_id, categorie, cle, valeur_chiffree, nonce_chiffrement, tag_authentification, " +
      "version_cle, confiance, importance, source, confirme_le, expire_le, modifie_le) " +
      "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, " +
      "CASE WHEN $10 IN ('user_explicit','user_confirmed') THEN now() ELSE NULL END, $11, now()) " +
      "ON CONFLICT (acteur_id, categorie, cle) DO UPDATE SET " +
      "valeur_chiffree = EXCLUDED.valeur_chiffree, nonce_chiffrement = EXCLUDED.nonce_chiffrement, " +
      "tag_authentification = EXCLUDED.tag_authentification, version_cle = EXCLUDED.version_cle, " +
      "confiance = EXCLUDED.confiance, importance = EXCLUDED.importance, source = EXCLUDED.source, " +
      "confirme_le = EXCLUDED.confirme_le, expire_le = EXCLUDED.expire_le, modifie_le = now()",
      [actorId, category, key, encrypted.ciphertext, encrypted.nonce, encrypted.tag,
        encrypted.keyVersion, Math.max(0, Math.min(1, Number(confidence) || 0)),
        Math.max(1, Math.min(5, Number(importance) || 3)), source, expiresAt],
    );
  }

  async purgeExpired() {
    const [messages, states, summaries, facts] = await Promise.all([
      this.pool.query("DELETE FROM public.wa_messages WHERE expire_le <= now()"),
      this.pool.query("DELETE FROM public.wa_conversation_state WHERE expire_le <= now()"),
      this.pool.query("DELETE FROM public.wa_memory_summaries WHERE expire_le <= now()"),
      this.pool.query("DELETE FROM public.wa_memory_facts WHERE expire_le IS NOT NULL AND expire_le <= now()"),
    ]);
    return {
      messages: messages.rowCount ?? 0,
      states: states.rowCount ?? 0,
      summaries: summaries.rowCount ?? 0,
      facts: facts.rowCount ?? 0,
    };
  }

  async close() {
    await this.pool.end();
  }
}
