/**
 * Traduit un message brut (whatsapp-web.js ou FakeProvider) en forme stable,
 * indépendante du transport. Point d'entrée unique de l'idempotence (par `id`)
 * et de l'audit.
 */
export function normalizeIncoming(raw) {
  const fromJid = raw.from ?? raw.fromJid ?? "";
  const senderMsisdn = String(fromJid).split("@")[0] || null;
  return {
    id: raw.id?.id ?? raw.id ?? null,
    fromJid,
    senderMsisdn,
    timestamp: raw.timestamp ?? Date.now(),
    kind: raw.kind ?? inferKind(raw),
    text: raw.body ?? raw.text ?? "",
    media: raw.media ?? null,
  };
}

function inferKind(raw) {
  const t = raw.type;
  if (t === "ptt" || t === "audio") return "audio";
  if (t === "image") return "image";
  if (t === "document") return "document";
  return "text";
}
