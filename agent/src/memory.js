import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import pg from "pg";
import { estTexteGeneralMemorisable } from "./memory-policy.js";

const { Pool } = pg;
const VERSION_CLE = 1;
const VERSION_HMAC = 1;
const MAX_TEXTE = 12_000;
const MAX_HISTORIQUE = 12;
const PARAMETRES_CONTEXTE_AUTORISES = new Set([
  "classeId", "periodeId", "depuis", "jusqua", "statut", "limite",
  // Ajoutés avec le fil de conversation : toujours des RÉFÉRENCES et des
  // filtres, jamais un nom ni un résultat.
  "eleveId", "periodeNumero", "seulementImpayes", "enRetard", "boursier", "etat",
]);
const UUID_MEMOIRE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Au-delà, un contexte n'est plus « ce dont on vient de parler ». */
const CONTEXTE_FRAIS_MS = 30 * 60 * 1000;

/**
 * Le foyer tel qu'il a le droit d'être persisté : des identifiants et deux
 * drapeaux. Tout le reste est écarté — à l'écriture comme à la relecture.
 */
export function validerFoyer(f) {
  if (!f || typeof f !== "object") return null;
  const out = {};
  for (const cle of ["classeId", "periodeId", "eleveId"]) {
    if (typeof f[cle] === "string" && UUID_MEMOIRE.test(f[cle])) out[cle] = f[cle];
  }
  if (Array.isArray(f.eleveIds)) {
    out.eleveIds = f.eleveIds.filter((x) => typeof x === "string" && UUID_MEMOIRE.test(x)).slice(0, 80);
    out.eleveIdsTronques = f.eleveIdsTronques === true;
    if (typeof f.origineEleves === "string" && /^[a-z0-9_.]{1,100}$/.test(f.origineEleves)) out.origineEleves = f.origineEleves;
  }
  if (typeof f.outil === "string" && /^[a-z0-9_.]{1,100}$/.test(f.outil)) out.outil = f.outil;
  return Object.keys(out).length ? out : null;
}

export function filtrerParametresContexte(params = {}) {
  const propres = {};
  for (const [cle, valeur] of Object.entries(params ?? {})) {
    if (!PARAMETRES_CONTEXTE_AUTORISES.has(cle) || valeur == null || valeur === "") continue;
    if (["seulementImpayes", "enRetard", "boursier"].includes(cle)) {
      if (typeof valeur === "boolean") propres[cle] = valeur;
      continue;
    }
    if (cle === "etat") {
      if (typeof valeur === "string" && /^[a-z_]{3,20}$/i.test(valeur)) propres[cle] = valeur;
      continue;
    }
    if (cle === "periodeNumero") {
      if ([1, 2, 3].includes(Number(valeur))) propres[cle] = Number(valeur);
      continue;
    }
    if (["classeId", "periodeId", "eleveId"].includes(cle)) {
      if (typeof valeur === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valeur)) {
        propres[cle] = valeur;
      }
      continue;
    }
    if (["depuis", "jusqua"].includes(cle)) {
      if (typeof valeur === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valeur) &&
          Number.isFinite(Date.parse(valeur + "T00:00:00Z"))) propres[cle] = valeur;
      continue;
    }
    if (cle === "statut" && ["JUSTIFIEE", "NON_JUSTIFIEE"].includes(valeur)) {
      propres[cle] = valeur;
      continue;
    }
    if (cle === "limite" && Number.isInteger(Number(valeur)) && Number(valeur) >= 1 && Number(valeur) <= 1000) {
      propres[cle] = Number(valeur);
    }
  }
  return propres;
}

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
  return createHmac("sha256", hmacKey).update("peer:" + jid, "utf8").digest("hex");
}

export function empreinteMessageId(messageId, hmacKey) {
  if (messageId == null) return null;
  return createHmac("sha256", hmacKey)
    .update("message:" + String(messageId).slice(0, 512), "utf8")
    .digest("hex");
}

function typeMessage(type) {
  return ["text", "audio", "image", "document", "location", "other"].includes(type) ? type : "other";
}

export class NeonConversationMemory {
  constructor({ connectionString, encryptionKey, hmacKey, pool = null, logger = null, maxConnections = 4, storeGeneralChat = false, contexteFraisMs = CONTEXTE_FRAIS_MS } = {}) {
    this.contexteFraisMs = contexteFraisMs;
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
    this.storeGeneralChat = storeGeneralChat === true;
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
    let lastTask = null;
    let foyer = null;

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

      const contextResult = await client.query(
        "SELECT outil, parametres_chiffres, nonce_chiffrement, tag_authentification, modifie_le, expire_le " +
        "FROM public.wa_conversation_context WHERE conversation_id = $1 AND expire_le > now() LIMIT 1",
        [conversationId],
      );
      if (contextResult.rows?.length) {
        const row = contextResult.rows[0];
        try {
          const params = JSON.parse(dechiffrer({
            ciphertext: row.parametres_chiffres,
            nonce: row.nonce_chiffrement,
            tag: row.tag_authentification,
          }, this.encryptionKey));
          // Un contexte vieux de plus d'une demi-heure n'est plus « ce dont on
          // vient de parler » : « et les retards ? » ne doit pas se rattacher à
          // une classe évoquée la veille. La ligne reste en base jusqu'à son
          // expiration ; elle n'est simplement plus servie comme fil.
          const frais = Date.now() - new Date(row.modifie_le).getTime() <= this.contexteFraisMs;
          if (frais) {
            lastTask = row.outil === "foyer" ? null : {
              tool: row.outil,
              params: filtrerParametresContexte(params),
              updatedAt: row.modifie_le,
              expiresAt: row.expire_le,
            };
            foyer = validerFoyer(params?.__foyer);
          }
        } catch {
          this._log("memory_context_decrypt_failed");
          lastTask = null;
        }
      }

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
        const attente = params?.__attente ?? null;
        if (params && attente) delete params.__attente;
        pending = params === null ? null : {
          intention: row.intention_en_attente,
          tool: row.outil_en_attente,
          params,
          ...(attente ? { empreinte: attente.empreinte, expireA: attente.expireA, staffId: attente.staffId, runId: attente.runId } : {}),
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

      // Le texte entrant reste en mémoire applicative le temps de classifier
      // l'intention. La base ne reçoit d'abord que les métadonnées : après le
      // NLU, annotateInbound ne conservera le texte que si la politique l'autorise.
      const providerId = empreinteMessageId(providerMessageId, this.hmacKey);
      await client.query(
        "INSERT INTO public.wa_messages " +
        "(conversation_id, provider_message_id, direction, type_message, contenu_chiffre, nonce_chiffrement, " +
        "tag_authentification, version_cle, statut, metadonnees) " +
        "VALUES ($1, $2, 'inbound', $3, NULL, NULL, NULL, $4, 'received', $5::jsonb) " +
        "ON CONFLICT (conversation_id, provider_message_id) WHERE provider_message_id IS NOT NULL DO NOTHING",
        [conversationId, providerId, typeMessage(messageType), VERSION_CLE,
          JSON.stringify({ origin: "whatsapp", schemaVersion: 1, memoryClass: "pending-classification" })],
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
    return { conversationId, actorId, history, pending, summaries, facts, lastTask, foyer };
  }

  async annotateInbound({ session, providerMessageId, text = "", intention = null, tool = null, retainContent = false } = {}) {
    if (!session?.conversationId || providerMessageId == null) return;
    const providerId = empreinteMessageId(providerMessageId, this.hmacKey);
    const keep = this.storeGeneralChat && retainContent && estTexteGeneralMemorisable(text);
    const encrypted = keep ? chiffrer(String(text).slice(0, MAX_TEXTE), this.encryptionKey) : null;
    await this.pool.query(
      "UPDATE public.wa_messages SET intention = $3, outil = $4, statut = 'processed', " +
      "contenu_chiffre = $5, nonce_chiffrement = $6, tag_authentification = $7, version_cle = $8, " +
      "metadonnees = COALESCE(metadonnees, '{}'::jsonb) || jsonb_build_object('memoryClass', $9::text) " +
      "WHERE conversation_id = $1 AND provider_message_id = $2",
      [session.conversationId, providerId, intention, tool, encrypted?.ciphertext ?? null,
        encrypted?.nonce ?? null, encrypted?.tag ?? null, VERSION_CLE,
        keep ? "safe-general-chat" : "metadata-only"],
    );
  }

  async appendMessage({
    session, text = "", direction = "outbound", messageType = "text",
    providerMessageId = null, intent = null, tool = null, retainContent = false,
  } = {}) {
    if (!session?.conversationId) return;
    if (!["inbound", "outbound", "system"].includes(direction)) throw new Error("Direction mémoire invalide.");
    const keep = this.storeGeneralChat && retainContent && estTexteGeneralMemorisable(text);
    const encrypted = keep ? chiffrer(String(text).slice(0, MAX_TEXTE), this.encryptionKey) : null;
    const providerId = empreinteMessageId(providerMessageId, this.hmacKey);
    await this.pool.query(
      "INSERT INTO public.wa_messages " +
      "(conversation_id, provider_message_id, direction, type_message, contenu_chiffre, nonce_chiffrement, " +
      "tag_authentification, version_cle, statut, intention, outil, metadonnees) " +
      "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb) " +
      "ON CONFLICT (conversation_id, provider_message_id) WHERE provider_message_id IS NOT NULL DO NOTHING",
      [session.conversationId, providerId, direction, typeMessage(messageType),
        encrypted?.ciphertext ?? null, encrypted?.nonce ?? null, encrypted?.tag ?? null, VERSION_CLE,
        direction === "outbound" ? "sent" : "processed", intent, tool,
        JSON.stringify({ origin: "whatsapp", schemaVersion: 1, memoryClass: keep ? "safe-general-chat" : "metadata-only" })],
    );
    await this.pool.query(
      "UPDATE public.wa_conversations SET dernier_message_le = now(), modifie_le = now() WHERE id = $1",
      [session.conversationId],
    );
  }

  async saveLastTask(session, { tool, params = {} } = {}) {
    if (!session?.conversationId) return;
    if (typeof tool !== "string" || !/^[a-z0-9_.]{1,100}$/.test(tool)) {
      throw new Error("Outil mémoire invalide.");
    }
    const propres = filtrerParametresContexte(params);
    // Le foyer voyage dans la MÊME ligne chiffrée : une conversation, un contexte.
    const foyer = validerFoyer(session.foyer);
    session.lastTask = { tool, params: propres };
    const encrypted = chiffrer(JSON.stringify(foyer ? { ...propres, __foyer: foyer } : propres), this.encryptionKey);
    await this.pool.query(
      "INSERT INTO public.wa_conversation_context " +
      "(conversation_id, outil, parametres_chiffres, nonce_chiffrement, tag_authentification, version_cle, expire_le, modifie_le) " +
      "VALUES ($1, $2, $3, $4, $5, $6, now() + interval '7 days', now()) " +
      "ON CONFLICT (conversation_id) DO UPDATE SET outil = EXCLUDED.outil, " +
      "parametres_chiffres = EXCLUDED.parametres_chiffres, nonce_chiffrement = EXCLUDED.nonce_chiffrement, " +
      "tag_authentification = EXCLUDED.tag_authentification, version_cle = EXCLUDED.version_cle, " +
      "expire_le = EXCLUDED.expire_le, modifie_le = now()",
      [session.conversationId, tool, encrypted.ciphertext, encrypted.nonce, encrypted.tag, encrypted.keyVersion],
    );
  }

  /**
   * Le foyer du fil : les entités dont on vient de parler, en identifiants.
   * Fusionné avec celui de la session, puis réécrit avec la dernière tâche.
   */
  async saveFocus(session, foyer = {}) {
    if (!session?.conversationId) return;
    const fusion = { ...(session.foyer ?? {}) };
    for (const [cle, valeur] of Object.entries(foyer ?? {})) if (valeur !== undefined) fusion[cle] = valeur;
    session.foyer = validerFoyer(fusion);
    const tache = session.lastTask ?? null;
    const propres = filtrerParametresContexte(tache?.params ?? {});
    const encrypted = chiffrer(JSON.stringify(session.foyer ? { ...propres, __foyer: session.foyer } : propres), this.encryptionKey);
    await this.pool.query(
      "INSERT INTO public.wa_conversation_context " +
      "(conversation_id, outil, parametres_chiffres, nonce_chiffrement, tag_authentification, version_cle, expire_le, modifie_le) " +
      "VALUES ($1, $2, $3, $4, $5, $6, now() + interval '7 days', now()) " +
      "ON CONFLICT (conversation_id) DO UPDATE SET outil = EXCLUDED.outil, " +
      "parametres_chiffres = EXCLUDED.parametres_chiffres, nonce_chiffrement = EXCLUDED.nonce_chiffrement, " +
      "tag_authentification = EXCLUDED.tag_authentification, version_cle = EXCLUDED.version_cle, " +
      "expire_le = EXCLUDED.expire_le, modifie_le = now()",
      [session.conversationId, tache?.tool ?? "foyer", encrypted.ciphertext, encrypted.nonce, encrypted.tag, encrypted.keyVersion],
    );
  }

  async saveState(session, { intention = "clarification", tool = null, params = {}, missingFields = [], empreinte = null, expireA = null, staffId = null, runId = null } = {}) {
    if (!session?.conversationId) return;
    // Une confirmation en attente porte ses GARANTIES : l'empreinte de
    // l'action exacte, son expiration, l'acteur. Sans elles, l'attente relue
    // après un redémarrage est inutilisable — le moteur la rejette, à raison.
    // Elles voyagent dans le même bloc chiffré que les paramètres.
    const garanties = empreinte && Number.isFinite(expireA) ? { __attente: { empreinte, expireA, staffId, runId } } : {};
    const encrypted = chiffrer(JSON.stringify({ ...(params ?? {}), ...garanties }), this.encryptionKey);
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

  /** Ferme le fil durable : l'attente et le contexte de suivi. Les préférences restent. */
  async resetFil(session) {
    if (!session?.conversationId) return;
    session.foyer = null;
    session.lastTask = null;
    await this.pool.query("DELETE FROM public.wa_conversation_state WHERE conversation_id = $1", [session.conversationId]);
    await this.pool.query("DELETE FROM public.wa_conversation_context WHERE conversation_id = $1", [session.conversationId]);
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
    const valeursAutorisees = {
      language: new Set(["français", "arabe", "anglais"]),
      response_style: new Set(["réponses courtes", "réponses détaillées"]),
      report_format: new Set(["PDF", "EXCEL", "WORD"]),
    };
    const valeur = String(value ?? "").trim();
    if (!actorId || !valeur || valeur.length > 80) throw new Error("Fait mémoire invalide.");
    if (category !== "preference" || !valeursAutorisees[key]?.has(valeur)) {
      throw new Error("Seules les préférences autorisées (langue, style, format) peuvent être mémorisées.");
    }
    if (!["user_explicit", "user_confirmed"].includes(source)) {
      throw new Error("Un fait durable doit être explicitement demandé ou confirmé.");
    }
    let expiration = null;
    if (expiresAt != null) {
      expiration = new Date(expiresAt);
      if (!Number.isFinite(expiration.getTime()) || expiration.getTime() <= Date.now()) {
        throw new Error("Date d'expiration mémoire invalide.");
      }
    }
    const encrypted = chiffrer(valeur, this.encryptionKey);
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
        Math.max(1, Math.min(5, Number(importance) || 3)), source, expiration],
    );
  }

  async listFacts(actorId) {
    if (!actorId) throw new Error("Acteur requis pour lire la mémoire.");
    const result = await this.pool.query(
      "SELECT categorie, cle, valeur_chiffree, nonce_chiffrement, tag_authentification, confiance, importance, source " +
      "FROM public.wa_memory_facts WHERE acteur_id = $1 AND (expire_le IS NULL OR expire_le > now()) " +
      "ORDER BY importance DESC, modifie_le DESC LIMIT 20",
      [actorId],
    );
    return result.rows.flatMap((row) => {
      try {
        return [{
          category: row.categorie,
          key: row.cle,
          value: this._dechiffrerRow(row, "valeur_chiffree"),
          confidence: Number(row.confiance),
          importance: row.importance,
          source: row.source,
        }];
      } catch {
        this._log("memory_fact_decrypt_failed");
        return [];
      }
    });
  }

  async forgetActor(actorId) {
    if (!actorId) throw new Error("Acteur requis pour effacer la mémoire.");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const summaries = await client.query("DELETE FROM public.wa_memory_summaries WHERE acteur_id = $1", [actorId]);
      const facts = await client.query("DELETE FROM public.wa_memory_facts WHERE acteur_id = $1", [actorId]);
      const conversations = await client.query("DELETE FROM public.wa_conversations WHERE acteur_id = $1", [actorId]);
      await client.query("COMMIT");
      return {
        summaries: summaries.rowCount ?? 0,
        facts: facts.rowCount ?? 0,
        conversations: conversations.rowCount ?? 0,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async purgeExpired() {
    const [messages, states, summaries, facts] = await Promise.all([
      this.pool.query("DELETE FROM public.wa_messages WHERE expire_le <= now()"),
      this.pool.query("DELETE FROM public.wa_conversation_state WHERE expire_le <= now()"),
      this.pool.query("DELETE FROM public.wa_memory_summaries WHERE expire_le <= now()"),
      this.pool.query("DELETE FROM public.wa_memory_facts WHERE expire_le IS NOT NULL AND expire_le <= now()"),
    ]);
    const contexts = await this.pool.query("DELETE FROM public.wa_conversation_context WHERE expire_le <= now()");
    const conversations = await this.pool.query(
      "DELETE FROM public.wa_conversations c " +
      "WHERE COALESCE(c.dernier_message_le, c.cree_le) < now() - interval '180 days' " +
      "AND NOT EXISTS (SELECT 1 FROM public.wa_messages m WHERE m.conversation_id = c.id) " +
      "AND NOT EXISTS (SELECT 1 FROM public.wa_conversation_state s WHERE s.conversation_id = c.id) " +
      "AND NOT EXISTS (SELECT 1 FROM public.wa_conversation_context x WHERE x.conversation_id = c.id)",
    );
    return {
      messages: messages.rowCount ?? 0,
      states: states.rowCount ?? 0,
      summaries: summaries.rowCount ?? 0,
      facts: facts.rowCount ?? 0,
      contexts: contexts.rowCount ?? 0,
      conversations: conversations.rowCount ?? 0,
    };
  }

  async close() {
    await this.pool.end?.();
  }
}
