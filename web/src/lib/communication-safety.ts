/** Fail-closed policy shared by every outbound adapter, including OTP. */
export type DispatchMode = "suspended" | "simulation" | "live";
export function dispatchMode(env: Record<string, string | undefined>): DispatchMode {
  if (env.NOTIFICATIONS_SUSPENDUES !== "false") return "suspended";
  return env.NOTIFICATIONS_MODE === "live" ? "live" : "simulation";
}

/** Never echo provider payloads: they may contain phones, tokens or message bodies. */
export function maskPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8) return "Numéro masqué";
  const national = digits.slice(-8);
  return `+${digits.slice(0, -8) || "235"} ${national.slice(0, 2)} •• •• ${national.slice(-2)}`;
}

export function redactPhones(text: string): string {
  return text.replace(/(?:\+|00)?\d[\d ()-]{6,}\d/g, (phone) => maskPhone(phone) ?? "Masqué");
}
