import { lireFichier } from "@/server/stockage";
import { exigerSession } from "@/server/guard";

/**
 * Sert un fichier stocké en base.
 *
 * L'accès exige une session : une photo d'élève et un certificat médical sont
 * des données personnelles d'enfants. Une URL devinable suffirait à les
 * exposer — l'identifiant est un UUID, mais l'obscurité n'est pas une
 * protection.
 *
 * Le cache est PRIVÉ et long : le contenu d'un fichier ne change jamais (une
 * nouvelle photo crée un nouvel enregistrement), mais il ne doit pas être
 * conservé par un cache partagé.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _requete: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await exigerSession();
  } catch {
    return new Response("Non autorisé", { status: 401 });
  }

  const { id } = await params;

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return new Response("Identifiant invalide", { status: 400 });
  }

  const fichier = await lireFichier(id);
  if (!fichier) return new Response("Introuvable", { status: 404 });

  return new Response(new Uint8Array(fichier.contenu), {
    headers: {
      "Content-Type": fichier.mimeType,
      "Content-Length": String(fichier.tailleOctets),
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="${encodeURIComponent(fichier.nomOrigine)}"`,
      // Une image ne doit jamais être interprétée comme autre chose.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
