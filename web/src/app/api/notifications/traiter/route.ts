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

export async function POST(requete: Request) {
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

  const entete = requete.headers.get("authorization");
  if (entete !== `Bearer ${secret}`) {
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
