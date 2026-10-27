/** Planification des canaux de notification — fonction pure, partagée et testable. */
export type PolitiqueCanal =
  | "PUSH_SINON_SMS"
  | "PUSH_ET_SMS"
  | "PUSH_SEUL"
  | "SMS_SEUL"
  | "AUCUN";

export type CanalPlanifie = "PUSH" | "SMS" | "IN_APP";

export interface CapacitesContact {
  utilisateurId: string | null;
  compteActif: boolean;
  telephone: string | null;
  accepteSms: boolean;
  pushDisponible: boolean;
}

/**
 * Applique exactement la politique de l'établissement à un contact.
 * Un repli IN_APP est permis uniquement lorsqu'un compte actif existe.
 * AUCUN reste strictement désactivé, sans notification silencieuse.
 */
export function choisirCanaux(
  contact: CapacitesContact,
  politique: PolitiqueCanal,
): CanalPlanifie[] {
  const compteActif = Boolean(contact.utilisateurId && contact.compteActif);
  const push = compteActif && contact.pushDisponible;
  const sms = Boolean(contact.telephone?.trim()) && contact.accepteSms;
  const resultat: CanalPlanifie[] = [];

  switch (politique) {
    case "AUCUN":
      return [];
    case "PUSH_SINON_SMS":
      if (push) return ["PUSH"];
      if (sms) return ["SMS"];
      return compteActif ? ["IN_APP"] : [];
    case "PUSH_ET_SMS":
      if (push) resultat.push("PUSH");
      if (sms) resultat.push("SMS");
      return resultat.length ? resultat : compteActif ? ["IN_APP"] : [];
    case "PUSH_SEUL":
      return push ? ["PUSH"] : compteActif ? ["IN_APP"] : [];
    case "SMS_SEUL":
      return sms ? ["SMS"] : compteActif ? ["IN_APP"] : [];
  }
}
