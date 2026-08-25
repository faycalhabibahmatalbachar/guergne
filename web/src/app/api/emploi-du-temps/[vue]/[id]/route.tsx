import { renderToBuffer } from "@react-pdf/renderer";

import { grilleImpression } from "@/server/domain/emploi-du-temps";
import { chargerAnneeCourante } from "@/server/domain/tableau-de-bord";
import { requirePermission } from "@/server/guard";
import { DocumentEmploiDuTemps } from "@/server/pdf/emploi-du-temps";

/**
 * Emploi du temps imprimable (E-47).
 *
 * Une route et non une action serveur : un PDF est un flux binaire que le
 * navigateur ouvre directement. Le faire passer par une action obligerait à
 * l'encoder en base64, soit un tiers de transfert en plus — sensible sur une
 * connexion lente.
 *
 * Le droit exigé est `emploi_du_temps:lire` et non `document:emettre` : ce
 * n'est pas un document officiel opposable comme un certificat de scolarité,
 * c'est une commodité d'affichage. Exiger le droit d'émission empêcherait un
 * professeur d'imprimer son propre emploi du temps.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const VUES = new Set(["classe", "enseignant", "salle"]);

export async function GET(
  requete: Request,
  { params }: { params: Promise<{ vue: string; id: string }> },
) {
  const { vue, id } = await params;

  if (!VUES.has(vue)) return new Response("Vue inconnue", { status: 404 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Identifiant invalide", { status: 400 });

  try {
    await requirePermission("emploi_du_temps:lire");
  } catch {
    return new Response("Non autorisé", { status: 403 });
  }

  try {
    const annee = await chargerAnneeCourante();
    if (!annee) return new Response("Aucune année scolaire courante", { status: 404 });

    const grille = await grilleImpression(annee.id, {
      type: vue as "classe" | "enseignant" | "salle",
      id,
    });
    if (!grille) return new Response("Emploi du temps introuvable", { status: 404 });

    const contenu = await renderToBuffer(
      <DocumentEmploiDuTemps
        grille={grille}
        portee={vue as "classe" | "enseignant" | "salle"}
      />,
    );

    // `inline` par défaut : on veut voir la grille avant de lancer
    // l'impression. `?telecharger` sert à l'envoyer par messagerie.
    const telecharger = new URL(requete.url).searchParams.has("telecharger");
    const nom = `emploi-du-temps-${grille.titre.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`;

    return new Response(new Uint8Array(contenu), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(contenu.length),
        "Content-Disposition": `${telecharger ? "attachment" : "inline"}; filename="${nom}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (erreur) {
    console.error("[edt-pdf]", erreur);
    return new Response("La production du document a échoué.", { status: 500 });
  }
}
