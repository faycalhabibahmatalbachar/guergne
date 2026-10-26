import { estGsm7, segmentsSms } from "./segments-sms.ts";
import { formatInternational, telephoneValide } from "./telephone.ts";

export const OUTBOX_STATES = [
  "DRAFT",
  "SCHEDULED",
  "QUEUED",
  "PROCESSING",
  "ACCEPTED",
  "DELIVERED",
  "READ",
  "RETRYABLE",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type OutboxState = (typeof OUTBOX_STATES)[number];
export type FailureCategory =
  | "INVALID_NUMBER"
  | "SUSPECT_NUMBER"
  | "UNSUPPORTED_OPERATOR"
  | "BALANCE"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "UNAVAILABLE"
  | "CONFIGURATION"
  | "UNKNOWN";
export const FAILURE_ACTIONS: Record<FailureCategory, string> = {
  INVALID_NUMBER: "Corriger le numéro dans la fiche parent",
  SUSPECT_NUMBER: "Vérifier le numéro auprès de la famille",
  UNSUPPORTED_OPERATOR: "Choisir un fournisseur couvrant cet opérateur",
  BALANCE: "Vérifier le crédit fournisseur avant de relancer",
  RATE_LIMIT: "Réessai automatique avec délai",
  TIMEOUT: "Rapprocher la référence fournisseur avant relance",
  UNAVAILABLE: "Réessai automatique avec délai",
  CONFIGURATION: "Vérifier les identifiants et la configuration",
  UNKNOWN: "Examiner la référence fournisseur et le journal technique",
};
export function classifyFailure(error: string | null): FailureCategory {
  const s = (error ?? "").toLowerCase();
  if (/invalid_phone|numéro|numero/.test(s)) return "INVALID_NUMBER";
  if (/moov|unsupported_operator/.test(s)) return "UNSUPPORTED_OPERATOR";
  if (/402|credit|crédit|solde|balance/.test(s)) return "BALANCE";
  if (/429|rate.limit/.test(s)) return "RATE_LIMIT";
  if (/timeout|timed.out|délai/.test(s)) return "TIMEOUT";
  if (/401|403|configur|project_not_found/.test(s)) return "CONFIGURATION";
  if (/50[0234]|network|fetch failed|réseau/.test(s)) return "UNAVAILABLE";
  return "UNKNOWN";
}
export function retryDelay(attempt: number, random: number): number {
  if (!Number.isInteger(attempt) || attempt < 1 || random < 0 || random > 1 || !Number.isFinite(random))
    throw new Error("Invalid retry parameters");
  return Math.round(Math.min(3_600_000, 60_000 * 2 ** Math.min(attempt - 1, 6)) * (0.5 + random * 0.5));
}
export function prepareSms(title: string, body: string, signature = "LGR"): string {
  const prefix = signature.trim() ? `${signature.trim()} : ` : "";
  return `${prefix}${title}\n${body}`;
}
export function estimateSms(text: string, unitPrice: number) {
  if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) throw new Error("Invalid tariff");
  const segments = segmentsSms(text);
  return {
    segments,
    encoding: estGsm7(text) ? "GSM-7" : "UTF-16",
    cost: segments * unitPrice,
    currency: "XAF" as const,
  };
}
export function validatedChadPhone(value: string): { phone: string | null; failure: FailureCategory | null } {
  const phone = formatInternational(value);
  if (!phone.startsWith("+235") || !telephoneValide(value)) return { phone: null, failure: "INVALID_NUMBER" };
  // Suspected seeds are quarantined, never declared fictitious without confirmation.
  if (/^\+235\d{2}0{3}\d{3}$/.test(phone) || /(\d)\1{5}/.test(phone.slice(4)))
    return { phone, failure: "SUSPECT_NUMBER" };
  return { phone, failure: null };
}
export function assertBudget(
  cost: number,
  spent: number,
  reserved: number,
  budget: number,
  threshold: number,
  confirmed: boolean,
) {
  if (![cost, spent, reserved, budget, threshold].every((n) => Number.isSafeInteger(n) && n >= 0))
    throw new Error("Invalid budget");
  if (cost > 0 && spent + reserved + cost > budget) throw new Error("Budget mensuel dépassé");
  if (cost > threshold && !confirmed) throw new Error("Confirmation du coût requise");
}
