import { renderToBuffer } from "@react-pdf/renderer";

import { sql } from "drizzle-orm";

import { db } from "@/server/db";
import { ErreurAutorisation, requirePermission } from "@/server/guard";
import { ConseilOrientationPDF, type LigneConseilOrientation } from "@/server/pdf/conseil-orientation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const UUID = /^[0-9a-f-]{36}$/i;

function observation(
  decision: string | null,
  appreciation: string | null,
  moyenneAnnuelle: number | null,
  conduite: number | null,
): string {
  const messages: Record<string, string> = {
    ADMIS: "Admis (e) en Classe Supérieure",
    ADMIS_CONDITION: "Admis (e) en Classe Supérieure mais efforts à fournir",
    REDOUBLE: "Admis (e)  à Redoubler",
    EXCLU: "Exclu (e)",
    REORIENTE: "Réorienté (e)",
    EN_ATTENTE: "En attente d'une décision",
  };
  const base = decision
    ? (messages[decision] ?? decision.replace(/_/g, " "))
    : moyenneAnnuelle !== null && conduite !== null
      ? moyenneAnnuelle >= 9.99 && conduite >= 8
        ? messages.ADMIS
        : moyenneAnnuelle >= 9.5 && conduite >= 8
          ? messages.ADMIS_CONDITION
          : moyenneAnnuelle >= 6 && conduite >= 8
            ? messages.REDOUBLE
            : messages.EXCLU
      : "";
  const detail = appreciation?.trim();
  if (!base) return detail ?? "";
  return detail && !base.toLocaleLowerCase("fr").includes(detail.toLocaleLowerCase("fr"))
    ? base + " — " + detail
    : base;
}
export async function GET(
  requete: Request,
  { params }: { params: Promise<{ classeId: string }> },
) {
  const { classeId } = await params;
  if (!UUID.test(classeId)) return new Response("Identifiant de classe invalide", { status: 400 });

  try {
    await requirePermission("bulletin:lire");
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) return new Response("Non autorisé", { status: 403 });
    throw erreur;
  }

  const contexte = await db.execute<{
    classe: string;
    annee: string;
    nom: string | null;
    sigle: string | null;
    adresse: string | null;
    ville: string | null;
    pays: string | null;
    telephone: string | null;
    email: string | null;
    ministere_tutelle: string | null;
    autorisation_numero: string | null;
    nom_proviseur: string | null;
    nom_censeur: string | null;
  }>(sql`
    SELECT c.libelle AS classe, a.libelle AS annee,
           e.nom, e.sigle, e.adresse, e.ville, e.pays, e.telephone, e.email,
           e.ministere_tutelle, e.autorisation_numero, e.nom_proviseur, e.nom_censeur
      FROM classes c
      JOIN annees_scolaires a ON a.id = c.annee_id AND a.est_courante
      LEFT JOIN etablissement e ON TRUE
     WHERE c.id = ${classeId}::uuid
     LIMIT 1
  `);
  const ctx = contexte.rows[0];
  if (!ctx) return new Response("Classe introuvable dans l'année scolaire courante", { status: 404 });

  const resultat = await db.execute<{
    inscription_id: string;
    matricule: string;
    nom: string;
    prenom: string;
    moyenne_t1: string | null;
    moyenne_t2: string | null;
    moyenne_t3: string | null;
    moyenne_annuelle: string | null;
    conduite: string | null;
    decision: string | null;
    appreciation: string | null;
  }>(sql`
    WITH moyennes AS (
      SELECT b.inscription_id,
             round(avg(b.moyenne_generale) FILTER (WHERE p.numero = 1), 2)::text AS moyenne_t1,
             round(avg(b.moyenne_generale) FILTER (WHERE p.numero = 2), 2)::text AS moyenne_t2,
             round(avg(b.moyenne_generale) FILTER (WHERE p.numero = 3), 2)::text AS moyenne_t3,
             round(avg(b.moyenne_generale), 2)::text AS moyenne_annuelle
        FROM bulletins b
        JOIN periodes p ON p.id = b.periode_id
       WHERE p.annee_id = (SELECT annee_id FROM classes WHERE id = ${classeId}::uuid)
       GROUP BY b.inscription_id
    ),
    conduites AS (
      SELECT nc.inscription_id, round(avg(nc.note), 2)::text AS conduite
        FROM notes_conduite nc
        JOIN periodes p ON p.id = nc.periode_id
       WHERE p.annee_id = (SELECT annee_id FROM classes WHERE id = ${classeId}::uuid)
       GROUP BY nc.inscription_id
    )
    SELECT i.id AS inscription_id, e.matricule, e.nom, e.prenom,
           m.moyenne_t1, m.moyenne_t2, m.moyenne_t3, m.moyenne_annuelle,
           co.conduite,
           (SELECT b2.decision::text
              FROM bulletins b2 JOIN periodes p2 ON p2.id = b2.periode_id
             WHERE b2.inscription_id = i.id AND p2.annee_id = i.annee_id
             ORDER BY p2.numero DESC LIMIT 1) AS decision,
           (SELECT b2.appreciation_generale
              FROM bulletins b2 JOIN periodes p2 ON p2.id = b2.periode_id
             WHERE b2.inscription_id = i.id AND p2.annee_id = i.annee_id
             ORDER BY p2.numero DESC LIMIT 1) AS appreciation
      FROM inscriptions i
      JOIN eleves e ON e.id = i.eleve_id
      LEFT JOIN moyennes m ON m.inscription_id = i.id
      LEFT JOIN conduites co ON co.inscription_id = i.id
     WHERE i.classe_id = ${classeId}::uuid AND i.active
     ORDER BY e.prenom, e.nom
  `);

  const lignes: LigneConseilOrientation[] = resultat.rows.map((r, index) => ({
    numero: index + 1,
    matricule: /^\d+$/.test(r.matricule) ? r.matricule.padStart(3, "0") : r.matricule,
    nomComplet: `${r.prenom} ${r.nom}`,
    moyenneT1: r.moyenne_t1 === null ? null : Number(r.moyenne_t1),
    moyenneT2: r.moyenne_t2 === null ? null : Number(r.moyenne_t2),
    moyenneT3: r.moyenne_t3 === null ? null : Number(r.moyenne_t3),
    moyenneAnnuelle: r.moyenne_annuelle === null ? null : Number(r.moyenne_annuelle),
    conduite: r.conduite === null ? null : Number(r.conduite),
    observation: observation(r.decision, r.appreciation, r.moyenne_annuelle === null ? null : Number(r.moyenne_annuelle), r.conduite === null ? null : Number(r.conduite)),
  }));

  const document = {
    etablissement: {
      nom: ctx.nom ?? "Lycée Guergné La Renaissance",
      sigle: ctx.sigle ?? "LGR",
      adresse: ctx.adresse,
      ville: ctx.ville,
      pays: ctx.pays,
      telephone: ctx.telephone,
      email: ctx.email,
      ministereTutelle: ctx.ministere_tutelle,
      autorisationNumero: ctx.autorisation_numero,
      nomProviseur: ctx.nom_proviseur,
      nomCenseur: ctx.nom_censeur,
    },
    anneeScolaire: ctx.annee,
    classe: ctx.classe,
    lignes,
  };

  const pdf = await renderToBuffer(<ConseilOrientationPDF d={document} />);
  const nom = `conseil-orientation-${ctx.classe}-${ctx.annee}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .toLowerCase();
  const telecharger = new URL(requete.url).searchParams.has("telecharger");

  return new Response(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${telecharger ? "attachment" : "inline"}; filename="${nom}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
