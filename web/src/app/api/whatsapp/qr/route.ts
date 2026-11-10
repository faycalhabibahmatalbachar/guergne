import { ErreurAutorisation, requirePermission } from "@/server/guard";
import { lireQrWhatsApp } from "@/server/whatsapp/appairage-agent";

/**
 * Image du QR d'appairage WhatsApp.
 *
 * LE QR EST UN SECRET. Quiconque le scanne lie son téléphone au numéro de
 * l'établissement et lit les conversations. Cette route est donc, dans l'ordre :
 * authentifiée, autorisée côté serveur, non mise en cache, et muette dans les
 * journaux. Elle ne rend que des octets PNG, générés à la demande par l'agent
 * et jamais conservés — ni ici, ni chez lui.
 *
 * Le QR ne passe jamais par l'URL : une URL finit dans l'historique du
 * navigateur et dans les journaux d'accès du proxy.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ENTETES = {
  "cache-control": "no-store, no-cache, must-revalidate, private",
  pragma: "no-cache",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  // Un QR affiché dans un cadre étranger serait un hameçonnage prêt à l'emploi.
  "x-frame-options": "DENY",
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

  const r = await lireQrWhatsApp();
  if (!r.ok) {
    // 409 : l'agent n'a pas de QR à montrer (session déjà liée, ou code
    // expiré). Ce n'est pas une panne, et la page sait quoi en dire.
    return Response.json({ erreur: r.raison }, { status: r.statut, headers: ENTETES });
  }

  return new Response(r.png, {
    status: 200,
    headers: { ...ENTETES, "content-type": "image/png", "content-length": String(r.png.byteLength) },
  });
}
