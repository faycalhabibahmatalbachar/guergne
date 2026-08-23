import { renderToBuffer } from "@react-pdf/renderer";

import { chargerBulletin } from "@/server/domain/bulletin-donnees";
import { ErreurAutorisation, requirePermission } from "@/server/guard";
import { Bulletin } from "@/server/pdf/bulletin";

/**
 * Édition d'un bulletin de notes en PDF.
 *
 * Route séparée de `/api/documents/[type]/[id]` : un bulletin se désigne par
 * DEUX identifiants — l'inscription et la période — là où les autres documents
 * n'en ont qu'un. Le forcer dans le même chemin obligerait à encoder la période
 * dans une chaîne de requête, et une pièce officielle ne doit pas dépendre d'un
 * paramètre facultatif qu'on peut oublier.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(
  requete: Request,
  { params }: { params: Promise<{ inscriptionId: string; periodeId: string }> },
) {
  const { inscriptionId, periodeId } = await params;

  if (!UUID.test(inscriptionId) || !UUID.test(periodeId)) {
    return new Response("Identifiant invalide", { status: 400 });
  }

  try {
    await requirePermission("bulletin:lire");
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return new Response("Non autorisé", { status: 403 });
    }
    throw erreur;
  }

  const donnees = await chargerBulletin(inscriptionId, periodeId);
  if (!donnees) return new Response("Bulletin introuvable", { status: 404 });

  const pdf = await renderToBuffer(<Bulletin d={donnees} />);

  const nom = `bulletin-${donnees.eleve.matricule}-${donnees.periodeLibelle}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .toLowerCase();

  const telecharger = new URL(requete.url).searchParams.has("telecharger");

  return new Response(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${telecharger ? "attachment" : "inline"}; filename="${nom}.pdf"`,
      // Un bulletin se régénère à chaque appel : les notes peuvent avoir été
      // corrigées entre deux impressions, et une version en cache ferait
      // circuler des chiffres périmés.
      "Cache-Control": "no-store",
    },
  });
}
