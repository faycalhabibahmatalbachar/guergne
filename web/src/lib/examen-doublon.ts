import { z } from "zod";

/** Seule une classification manuelle est autorisée : aucun état « fusionner ». */
export const schemaExamenDoublon = z.object({
  tuteurId: z.string().uuid(),
  autreTuteurId: z.string().uuid(),
  decision: z.enum(["DISTINCTS", "MEME_PERSONNE_A_VERIFIER"]),
  motif: z.string().trim().min(15).max(400),
  justificatifsVerifies: z.literal(true),
}).refine(v => v.tuteurId !== v.autreTuteurId, {
  message: "Sélectionnez deux dossiers différents.",
  path: ["autreTuteurId"],
});

export function paireCanonique(a: string, b: string): readonly [string, string] {
  return a.localeCompare(b) <= 0 ? [a, b] as const : [b, a] as const;
}
