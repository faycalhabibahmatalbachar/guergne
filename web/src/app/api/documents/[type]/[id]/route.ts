import { requirePermission } from "@/server/guard";
import { produireDocumentEleve, produireRecu, type TypeDocument } from "@/server/pdf/service";

/**
 * Édition des documents officiels en PDF.
 *
 * Une route plutôt qu'une action serveur : un PDF est un flux binaire que le
 * navigateur doit pouvoir ouvrir ou télécharger directement. Le faire transiter
 * par une action obligerait à l'encoder en base64, ce qui gonfle le transfert
 * d'un tiers — sensible sur une connexion lente.
 *
 * Chaque édition exige le droit `document:emettre` et laisse une trace dans
 * `documents_emis`.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const TYPES: Record<string, TypeDocument> = {
  "certificat-scolarite": "CERTIFICAT_SCOLARITE",
  "certificat-transfert": "CERTIFICAT_TRANSFERT",
  "fiche-inscription": "FICHE_INSCRIPTION",
  recu: "RECU_PAIEMENT",
};

export async function GET(
  requete: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const { type, id } = await params;

  const typeDocument = TYPES[type];
  if (!typeDocument) return new Response("Type de document inconnu", { status: 404 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Identifiant invalide", { status: 400 });

  let acteur;
  try {
    acteur = await requirePermission("document:emettre");
  } catch {
    return new Response("Non autorisé", { status: 403 });
  }

  try {
    const document =
      typeDocument === "RECU_PAIEMENT"
        ? await produireRecu(id, acteur)
        : await produireDocumentEleve(typeDocument, id, acteur);

    if (!document) return new Response("Dossier introuvable", { status: 404 });

    // `inline` ouvre le PDF dans le navigateur ; `?telecharger` force
    // l'enregistrement. Au guichet on imprime, à distance on télécharge.
    const telecharger = new URL(requete.url).searchParams.has("telecharger");

    return new Response(new Uint8Array(document.contenu), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(document.contenu.length),
        "Content-Disposition": `${telecharger ? "attachment" : "inline"}; filename="${document.nomFichier}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (erreur) {
    console.error("[document]", erreur);
    return new Response("La production du document a échoué.", { status: 500 });
  }
}
