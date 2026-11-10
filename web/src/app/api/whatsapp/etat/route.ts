import { ErreurAutorisation, requirePermission } from "@/server/guard";
import { configurationAppairage, lireEtatWhatsApp } from "@/server/whatsapp/appairage-agent";

/**
 * État de la connexion WhatsApp de l'agent, pour l'écran d'administration.
 *
 * Interrogée en boucle par la page, parce que le QR se renouvelle toutes les
 * vingt secondes : sans rafraîchissement, l'opérateur scannerait un code mort.
 *
 * Elle ne rend JAMAIS la valeur du QR — seulement son existence et le temps
 * qui lui reste. L'image passe par `/api/whatsapp/qr`, qui est une autre
 * requête, avec ses propres en-têtes.
 *
 * Droit exigé : `systeme:administrer`. Associer un appareil à un compte
 * WhatsApp est un geste technique, pas un geste de gestion scolaire : il reste
 * réservé, et il est revérifié ici même — le filtrage de la navigation ne
 * protège rien.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Un secret d'authentification ne se met pas en cache, nulle part. */
const ENTETES = {
  "cache-control": "no-store, no-cache, must-revalidate, private",
  pragma: "no-cache",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
} as const;

export async function GET() {
  try {
    await requirePermission("systeme:administrer");
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      const statut = erreur.code === "NON_AUTHENTIFIE" ? 401 : 403;
      return Response.json({ erreur: "Non autorisé." }, { status: statut, headers: ENTETES });
    }
    throw erreur;
  }

  const conf = configurationAppairage();
  if (!conf.ok) {
    return Response.json(
      {
        agentJoignable: false,
        // On nomme les variables manquantes : c'est un diagnostic de
        // déploiement, et un nom de variable n'est pas un secret.
        indisponibilite: `Liaison non configurée : ${conf.manque.join(", ")} absente(s) de ce déploiement.`,
        appairage: { etat: "attente", qrDisponible: false, resteMs: 0 },
        transport: null,
      },
      { status: 200, headers: ENTETES },
    );
  }

  return Response.json(await lireEtatWhatsApp(), { status: 200, headers: ENTETES });
}
