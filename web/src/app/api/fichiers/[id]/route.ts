import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { lireFichier } from "@/server/stockage";
import { exigerSession, peut } from "@/server/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Les UUID ne sont pas une autorisation.
 * Vérification du rattachement AVANT de charger les octets en mémoire.
 * Les parents accèdent uniquement aux photos des enfants auxquels ils sont liés.
 * Les autres usages (pièces médicales, justificatifs, etc.) restent fermés
 * tant qu'une autorisation de lecture par ressource n'est pas définie.
 */
export async function GET(
  _requete: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let principal;
  try { principal = await exigerSession(); }
  catch { return new Response("Non autorisé", { status: 401 }); }

  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    return new Response("Identifiant invalide", { status: 400 });

  const liens = await db.execute<{
    usage: string;
    eleve_id: string | null;
    classe_id: string | null;
    compte_enseignant: string | null;
  }>(sql`
    SELECT f.usage::text AS usage, e.id AS eleve_id,
      (SELECT i.classe_id FROM inscriptions i
       WHERE i.eleve_id=e.id
       ORDER BY i.active DESC, i.date_inscription DESC
       LIMIT 1) AS classe_id,
      en.utilisateur_id AS compte_enseignant
    FROM fichiers f
    LEFT JOIN eleves e ON e.photo_id=f.id
    LEFT JOIN enseignants en ON en.photo_id=f.id
    WHERE f.id=${id}::uuid
  `);

  if (!liens.rows.length) return new Response("Introuvable", { status: 404 });

  let autorise=false;
  for (const ligne of liens.rows) {
    if (ligne.eleve_id) {
      if (principal.role === "PARENT") {
        const t=await db.execute<{ok:number}>(sql`
          SELECT 1 AS ok FROM tuteurs tu JOIN eleve_tuteur et ON et.tuteur_id=tu.id
          WHERE tu.utilisateur_id=${principal.id}::uuid
            AND et.eleve_id=${ligne.eleve_id}::uuid LIMIT 1`);
        autorise=t.rows.length>0;
      } else {
        autorise=await peut(principal,"eleve:lire",{
          eleveId:ligne.eleve_id,classeId:ligne.classe_id??undefined,
        });
      }
    }
    if (!autorise && ligne.compte_enseignant) {
      autorise=ligne.compte_enseignant===principal.id ||
        await peut(principal,"utilisateur:modifier") ||
        await peut(principal,"utilisateur:creer");
    }
    if (autorise) break;
  }
  if (!autorise) return new Response("Accès refusé", { status: 403 });

  const fichier=await lireFichier(id);
  if(!fichier)return new Response("Introuvable", {status:404});
  return new Response(new Uint8Array(fichier.contenu),{
    headers:{
      "Content-Type":fichier.mimeType,
      "Content-Length":String(fichier.tailleOctets),
      "Content-Disposition":`inline; filename="${encodeURIComponent(fichier.nomOrigine)}"`,
      "Cache-Control":"private, no-store",
      "X-Content-Type-Options":"nosniff",
    }
  });
}
