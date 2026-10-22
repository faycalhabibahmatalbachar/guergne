import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { exigerPage } from "@/server/guard";

export const metadata: Metadata = { title: "Suivi des invitations parents" };
export const dynamic = "force-dynamic";

type Ligne = {
  id: string;
  telephone: string | null;
  statut: string;
  tentatives: number;
  cree_le: string;
  envoye_le: string | null;
  erreur: string | null;
};
type Compte = { statut: string; total: number };

function masquer(numero: string | null): string {
  if (!numero) return "Non renseigné";
  const chiffres = numero.replace(/\D/g, "");
  return chiffres.length >= 4 ? "•••• " + chiffres.slice(-4) : "••••";
}
function dateFr(valeur: string | null) {
  return valeur ? new Date(valeur).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";
}
const libelles: Record<string, string> = {
  EN_ATTENTE: "En attente", ENVOYE: "Envoyé", ECHOUE: "Échoué", LU: "Lu",
};
export default async function SuiviInvitations({
  searchParams,
}: { searchParams: Promise<{ statut?: string; page?: string }> }) {
  await exigerPage("tuteur:inviter");
  const params = await searchParams;
  const etat = ["EN_ATTENTE", "ENVOYE", "ECHOUE", "LU"].includes(params.statut ?? "") ? params.statut! : "";
  const pageBrute = Number(params.page ?? 1);
  const page = Number.isSafeInteger(pageBrute) && pageBrute > 0 ? Math.min(pageBrute, 10000) : 1;
  const taille = 25;
  const filtre = etat ? sql` AND n.statut::text = ${etat}` : sql``;
  // Les codes d'activation figurent dans le corps des SMS : ne jamais lire
  // n.corps, même temporairement, dans les composants de suivi.
  const [statistiques, effectif, historique] = await Promise.all([
    db.execute<Compte>(sql`
      SELECT n.statut::text AS statut, count(*)::int AS total
      FROM notifications n
      WHERE n.canal = 'SMS'::canal_notification
        AND n.titre = 'Accès à l''application'
      GROUP BY n.statut
    `),
    db.execute<{ total: number }>(sql`
      SELECT count(*)::int AS total FROM notifications n
      WHERE n.canal = 'SMS'::canal_notification
        AND n.titre = 'Accès à l''application' ${filtre}
    `),
    db.execute<Ligne>(sql`
      SELECT n.id::text, n.telephone, n.statut::text AS statut,
             n.tentatives::int, n.cree_le::text, n.envoye_le::text, n.erreur
      FROM notifications n
      WHERE n.canal = 'SMS'::canal_notification
        AND n.titre = 'Accès à l''application' ${filtre}
      ORDER BY n.cree_le DESC, n.id DESC
      LIMIT ${taille} OFFSET ${(page - 1) * taille}
    `),
  ]);
  const comptes = Object.fromEntries(statistiques.rows.map(x => [x.statut, Number(x.total)]));
  const total = Number(effectif.rows[0]?.total ?? 0);
  const nbPages = Math.max(1, Math.ceil(total / taille));
  const href = (statut: string, numeroPage = 1) =>
    "/dashboard/parents/invitations?" + new URLSearchParams({
      ...(statut ? { statut } : {}), page: String(numeroPage),
    }).toString();
  return (
    <main className="space-y-6 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link className="text-sm text-emerald-700 hover:underline" href="/dashboard/parents">← Parents & tuteurs</Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Suivi des invitations</h1>
          <p className="mt-1 text-sm text-slate-500">Suivi des SMS d’activation mis en file. Aucun code secret n’est affiché et aucune relance n’est déclenchée depuis cet écran.</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Filtrer les invitations par statut">
        {([{ key: "", label: "Tous" }, { key: "EN_ATTENTE", label: "En attente" },
          { key: "ENVOYE", label: "Envoyés" }, { key: "ECHOUE", label: "Échoués" },
          { key: "LU", label: "Lus" }] as const).map(item =>
          <Link key={item.key} href={href(item.key)} aria-current={etat === item.key ? "page" : undefined}
            className={`rounded-xl border p-4 transition hover:border-emerald-500 ${etat === item.key ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" : "border-slate-200 bg-white dark:border-border dark:bg-card"}`}>
            <div className="text-sm text-slate-600 dark:text-slate-300">{item.label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{item.key ? (comptes[item.key] ?? 0) : Object.values(comptes).reduce((a,b)=>a+b,0)}</div>
          </Link>
        )}
      </div>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-border dark:bg-card" aria-label="Historique des invitations">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-medium dark:border-border">{total.toLocaleString("fr-FR")} invitation(s) correspondant au filtre</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 dark:bg-muted/30 dark:text-slate-300">
              <tr><th className="px-4 py-3">Créée le</th><th className="px-4 py-3">Téléphone masqué</th><th className="px-4 py-3">Statut</th><th className="px-4 py-3">Tentatives</th><th className="px-4 py-3">Envoyée le</th><th className="px-4 py-3">Erreur technique</th></tr>
            </thead>
            <tbody>
              {historique.rows.map(n => <tr key={n.id} className="border-t border-slate-100 dark:border-border">
                <td className="whitespace-nowrap px-4 py-3">{dateFr(n.cree_le)}</td>
                <td className="px-4 py-3 font-mono">{masquer(n.telephone)}</td>
                <td className="px-4 py-3">{libelles[n.statut] ?? n.statut}</td>
                <td className="px-4 py-3 tabular-nums">{n.tentatives}</td>
                <td className="whitespace-nowrap px-4 py-3">{dateFr(n.envoye_le)}</td>
                <td className="max-w-xs truncate px-4 py-3 text-slate-500" title={n.erreur ?? undefined}>{n.erreur ?? "—"}</td>
              </tr>)}
              {!historique.rows.length && <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">Aucune invitation pour ce filtre.</td></tr>}
            </tbody>
          </table>
        </div>
        <nav aria-label="Pages de l’historique" className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm dark:border-border">
          <span>Page {page} sur {nbPages}</span>
          <div className="flex gap-4">
            {page > 1 && <Link href={href(etat, page - 1)} className="font-semibold text-emerald-700 hover:underline">← Précédente</Link>}
            {page < nbPages && <Link href={href(etat, page + 1)} className="font-semibold text-emerald-700 hover:underline">Suivante →</Link>}
          </div>
        </nav>
      </section>
      <p className="text-xs text-slate-500">« Envoyé » désigne le statut de la plateforme ; il ne prouve pas la lecture ou la réception sur le téléphone.</p>
    </main>
  );
}
