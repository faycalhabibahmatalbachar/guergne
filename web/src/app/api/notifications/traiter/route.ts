import { traiterFile } from "@/server/notifications/expediteur";

/**
 * Traitement de la file de notifications.
 *
 * Deux appelants :
 *   - une tâche planifiée (cron Vercel ou externe), qui doit présenter le
 *     secret `CRON_SECRET` ;
 *   - le bouton « Traiter la file » de la page Communication, qui passe par
 *     une action serveur déjà authentifiée.
 *
 * La route est protégée par secret et non par session : un cron n'a pas de
 * cookie. Sans secret configuré, elle refuse tout appel externe — une route
 * ouverte permettrait à n'importe qui de vider la file, donc de faire dépenser
 * des SMS à l'établissement.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Vide la file, quel que soit le verbe.
 *
 * Vercel appelle ses tâches planifiées en **GET**, en joignant lui-même
 * l'en-tête `Authorization: Bearer $CRON_SECRET`. Le bouton de la page
 * Communication, lui, passe par un POST. Les deux mènent au même traitement —
 * n'exposer que POST faisait répondre 405 au cron, silencieusement.
 */
async function traiter(requete: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return Response.json(
      {
        erreur:
          "CRON_SECRET n'est pas configuré. Cette route reste fermée tant qu'un secret n'est pas défini.",
      },
      { status: 503 },
    );
  }

  // Deux en-têtes acceptés, et le second a une raison précise.
  //
  // `Authorization: Bearer xxx` est la forme standard, celle que Vercel joint
  // lui-même à ses tâches planifiées.
  //
  // `X-Cron-Secret: xxx` existe parce que sa valeur ne contient AUCUN espace.
  // L'API de Northflank découpe la commande d'un job sur les espaces : un
  // `-H "Authorization: Bearer xxx"` y arrive en morceaux, et aucune forme de
  // `sh -c` ne survit non plus. Un en-tête sans espace tient en un seul jeton
  // et passe intact. Ce n'est pas un contournement de sécurité — c'est le même
  // secret, comparé de la même façon.
  const entete = requete.headers.get("authorization");
  const alternatif = requete.headers.get("x-cron-secret");

  if (entete !== `Bearer ${secret}` && alternatif !== secret) {
    return Response.json({ erreur: "Non autorisé." }, { status: 401 });
  }

  const debut = Date.now();
  const rapport = await traiterFile(200);

  return Response.json({
    ...rapport,
    duree_ms: Date.now() - debut,
    horodatage: new Date().toISOString(),
  });
}

export const GET = traiter;
export const POST = traiter;
