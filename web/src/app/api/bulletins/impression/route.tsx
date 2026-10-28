import { renderToBuffer, Document } from "@react-pdf/renderer";

import { chargerBulletin } from "@/server/domain/bulletin-donnees";
import { ErreurAutorisation, requirePermission } from "@/server/guard";
import { PageBulletin } from "@/server/pdf/bulletin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_BULLETINS = 500;

type SelectionBulletin = { inscriptionId: string; periodeId: string };

export async function POST(requete: Request) {
  try {
    await requirePermission("bulletin:lire");
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return new Response("Non autorisé", { status: 403 });
    }
    throw erreur;
  }

  const corps = await requete.json().catch(() => null) as { bulletins?: unknown } | null;
  if (!corps || !Array.isArray(corps.bulletins) || corps.bulletins.length === 0) {
    return new Response("Aucun bulletin sélectionné.", { status: 400 });
  }
  if (corps.bulletins.length > MAX_BULLETINS) {
    return new Response("La sélection dépasse la limite de 500 bulletins par impression.", { status: 413 });
  }

  const selection: SelectionBulletin[] = [];
  const vus = new Set<string>();
  for (const element of corps.bulletins) {
    if (!element || typeof element !== "object") {
      return new Response("Sélection de bulletins invalide.", { status: 400 });
    }
    const candidat = element as Record<string, unknown>;
    if (
      typeof candidat.inscriptionId !== "string" ||
      typeof candidat.periodeId !== "string" ||
      !UUID.test(candidat.inscriptionId) ||
      !UUID.test(candidat.periodeId)
    ) {
      return new Response("Identifiant de bulletin invalide.", { status: 400 });
    }

    const cle = candidat.inscriptionId + ":" + candidat.periodeId;
    if (!vus.has(cle)) {
      vus.add(cle);
      selection.push({
        inscriptionId: candidat.inscriptionId,
        periodeId: candidat.periodeId,
      });
    }
  }

  if (selection.length === 0) {
    return new Response("Aucun bulletin valide à imprimer.", { status: 400 });
  }

  // Charger les données par petits groupes pour éviter de saturer la base.
  const donnees = [];
  const tailleGroupe = 6;
  for (let index = 0; index < selection.length; index += tailleGroupe) {
    const groupe = selection.slice(index, index + tailleGroupe);
    const resultats = await Promise.all(
      groupe.map(({ inscriptionId, periodeId }) => chargerBulletin(inscriptionId, periodeId)),
    );
    if (resultats.some((donnee) => !donnee)) {
      return new Response("Au moins un bulletin sélectionné est introuvable.", { status: 404 });
    }
    donnees.push(...resultats);
  }

  const pages = donnees.map((donnee, index) => (
    <PageBulletin key={selection[index]?.inscriptionId + ":" + selection[index]?.periodeId} d={donnee!} />
  ));
  const pdf = await renderToBuffer(
    <Document title="Bulletins scolaires — sélection filtrée" author="Lycée Guergné : la Renaissance">
      {pages}
    </Document>,
  );

  return new Response(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="bulletins-scolaires-selection.pdf"',
      "Cache-Control": "no-store",
      "X-Bulletins-Count": String(selection.length),
    },
  });
}
