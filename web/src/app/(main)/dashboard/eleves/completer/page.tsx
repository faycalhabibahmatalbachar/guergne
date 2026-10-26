import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { ArrowLeft, ArrowRight, ClipboardCheck, FileText, Search, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { statTile, statusBadge } from "@/vendor/gentelella-v4/markup.js";
import { db } from "@/server/db";
import { exigerPage } from "@/server/guard";

import "../../default/gentelella-tokens.css";
import "../../default/gentelella-layout.css";
import "../../default/gentelella-components.css";
import "../../default/gentelella-widgets.css";

export const metadata: Metadata = { title: "Complétude des dossiers élèves" };
export const dynamic = "force-dynamic";

type Champs = {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  classe: string | null;
  acte: boolean;
  ecole: boolean;
  telephone: boolean;
  email: boolean;
  manquants: number;
};
type Totaux = {
  eleves: number;
  dossiers_a_verifier: number;
  actes: number;
  ecoles: number;
  telephones: number;
  emails: number;
  urgences: number;
};
const icone = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect width="15" height="18" x="5" y="3" rx="2"/><path d="M9 8h7M9 12h7M9 16h4"/></svg>';
const num = (n: number) => n.toLocaleString("fr-FR");
const parPage = 25;

function UrlPage({ numero, q, children, active }: { numero: number; q: string; children: React.ReactNode; active?: boolean }) {
  return <Link href={"/dashboard/eleves/completer?page=" + numero + (q ? "&q=" + encodeURIComponent(q) : "")}
    aria-current={active ? "page" : undefined}
    className={"inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-xs font-semibold " +
      (active ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-border dark:bg-card dark:text-foreground")}>
    {children}
  </Link>;
}

export default async function CompleterDossiers({ searchParams }: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  await exigerPage("eleve:modifier");
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0,100);
  const numeroDemande = Number(params.page ?? 1);
  const numeroPage = Number.isSafeInteger(numeroDemande) ? Math.max(1, Math.min(numeroDemande, 10000)) : 1;

  const conditions = sql`(
    NULLIF(BTRIM(e.acte_naissance_numero),'') IS NULL OR
    NULLIF(BTRIM(e.ecole_origine),'') IS NULL OR
    NULLIF(BTRIM(e.telephone),'') IS NULL OR
    NULLIF(BTRIM(e.email),'') IS NULL
  )`;
  const recherche = sql`(${q} = '' OR e.nom ILIKE '%' || ${q} || '%' OR
    e.prenom ILIKE '%' || ${q} || '%' OR e.matricule ILIKE '%' || ${q} || '%')`;

  const [global, resultatTotal] = await Promise.all([
    db.execute<Totaux>(sql`
      SELECT count(*)::int AS eleves,
       count(*) FILTER (WHERE
          NULLIF(BTRIM(acte_naissance_numero),'') IS NULL OR
          NULLIF(BTRIM(ecole_origine),'') IS NULL OR
          NULLIF(BTRIM(telephone),'') IS NULL OR
          NULLIF(BTRIM(email),'') IS NULL
       )::int AS dossiers_a_verifier,
       count(*) FILTER (WHERE NULLIF(BTRIM(acte_naissance_numero),'') IS NULL)::int AS actes,
       count(*) FILTER (WHERE NULLIF(BTRIM(ecole_origine),'') IS NULL)::int AS ecoles,
       count(*) FILTER (WHERE NULLIF(BTRIM(telephone),'') IS NULL)::int AS telephones,
       count(*) FILTER (WHERE NULLIF(BTRIM(email),'') IS NULL)::int AS emails,
       count(*) FILTER (WHERE
         NULLIF(BTRIM(urgence_nom),'') IS NULL OR
         NULLIF(BTRIM(urgence_telephone),'') IS NULL OR
         NULLIF(BTRIM(urgence_lien),'') IS NULL
       )::int AS urgences
      FROM eleves`),
    db.execute<{total:number}>(sql`SELECT count(*)::int AS total FROM eleves e
        WHERE ${conditions} AND ${recherche}`),
  ]);
  const stats=global.rows[0];
  const total=Number(resultatTotal.rows[0]?.total??0);
  const pages=Math.max(1,Math.ceil(total/parPage));
  const page=Math.min(numeroPage,pages);
  const offset=(page-1)*parPage;

  const donnees=await db.execute<Champs>(sql`
    SELECT e.id,e.matricule,e.nom,e.prenom,cl.libelle AS classe,
      (NULLIF(BTRIM(e.acte_naissance_numero),'') IS NULL) AS acte,
      (NULLIF(BTRIM(e.ecole_origine),'') IS NULL) AS ecole,
      (NULLIF(BTRIM(e.telephone),'') IS NULL) AS telephone,
      (NULLIF(BTRIM(e.email),'') IS NULL) AS email,
      ((NULLIF(BTRIM(e.acte_naissance_numero),'') IS NULL)::int +
       (NULLIF(BTRIM(e.ecole_origine),'') IS NULL)::int +
       (NULLIF(BTRIM(e.telephone),'') IS NULL)::int +
       (NULLIF(BTRIM(e.email),'') IS NULL)::int) AS manquants
    FROM eleves e
    LEFT JOIN LATERAL (
      SELECT c.libelle FROM inscriptions i
      JOIN classes c ON c.id = i.classe_id
      WHERE i.eleve_id=e.id AND i.active
      ORDER BY i.date_inscription DESC LIMIT 1
    ) cl ON TRUE
    WHERE ${conditions} AND ${recherche}
    ORDER BY manquants DESC,e.nom,e.prenom,e.id
    LIMIT ${parPage} OFFSET ${offset}
  `);

  return <main className="gentelella-v4 min-w-0 space-y-4 pb-6">
    <header className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 sm:flex-row sm:items-end sm:justify-between dark:border-border">
      <div>
        <h1 className="flex items-center gap-2.5 text-[29px] font-bold tracking-tight sm:text-[34px]">
          <ClipboardCheck className="size-7 shrink-0 text-[#102448]" aria-hidden />Dossiers à compléter
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">Champs à vérifier auprès des familles.</p>
      </div>
      <Button asChild variant="outline" className="h-10 gap-2 rounded-lg border-slate-200 bg-white px-3.5 shadow-none dark:border-border dark:bg-card">
        <Link href="/dashboard/eleves"><ArrowLeft className="size-4" aria-hidden />Élèves</Link>
      </Button>
    </header>

    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="État des renseignements">
      {([
        {titre:"Fiches élèves",valeur:stats.eleves,detail:"Total enregistré",couleur:"blue" as const},
        {titre:"À vérifier",valeur:stats.dossiers_a_verifier,detail:"Au moins un champ non renseigné",couleur:"yellow" as const},
        {titre:"Actes de naissance",valeur:stats.actes,detail:"Numéros non saisis",couleur:"purple" as const},
        {titre:"Contacts d'urgence manquants",valeur:stats.urgences,detail:"Responsables à contacter",couleur:"teal" as const},
      ]).map(item=><div className="min-w-0" key={item.titre} dangerouslySetInnerHTML={{
        __html:statTile({label:item.titre,value:num(item.valeur),subtext:item.detail,color:item.couleur,iconHtml:icone})
      }}/>)}
    </section>

    <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-xs leading-5 text-blue-900 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-200">
      <ShieldCheck className="mr-2 inline size-4 align-middle" aria-hidden />
      Un champ vide n'est pas une preuve d'absence. Le téléphone et l'e-mail personnels de l'élève peuvent être sans objet.
      Les informations médicales ne doivent être complétées qu'après vérification, jamais par déduction.
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card" aria-label="Liste des élèves avec renseignements à vérifier">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-border">
        <div><h2 className="text-sm font-bold">Fiches nécessitant une vérification</h2>
          <p className="mt-0.5 text-xs text-slate-500">{num(total)} dossier(s) selon la recherche.</p>
        </div>
        <form method="get" action="/dashboard/eleves/completer" className="flex w-full gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input type="search" name="q" defaultValue={q} maxLength={100} aria-label="Rechercher un élève" placeholder="Nom ou matricule" className="h-10 min-w-0 rounded-lg pl-9 sm:w-56"/>
          </div><Button type="submit" variant="outline" className="h-10 rounded-lg">Chercher</Button>
        </form>
      </div>
      {donnees.rows.length ? <div className="table-responsive overflow-x-auto">
        <table className="table min-w-[830px]">
          <thead><tr>
            <th>Élève</th><th>Classe</th><th>Acte de naissance</th><th>École d'origine</th><th>Téléphone élève</th><th>E-mail élève</th><th className="text-right">Action</th>
          </tr></thead>
          <tbody>{donnees.rows.map(d=><tr key={d.id}>
            <td><Link href={"/dashboard/eleves/"+d.id} className="font-semibold hover:underline">{d.prenom} {d.nom}</Link><div className="text-xs text-slate-500">{d.matricule}</div></td>
            <td>{d.classe||"—"}</td>
            {([d.acte,d.ecole,d.telephone,d.email] as boolean[]).map((missing,i)=><td key={i}>
              <span dangerouslySetInnerHTML={{__html:statusBadge(missing?"À vérifier":"Renseigné",missing?"yellow":"green")}}/>
            </td>)}
            <td><Button asChild size="sm" variant="outline" className="h-9 gap-1.5 rounded-lg border-slate-200 bg-white shadow-none dark:border-border dark:bg-card">
              <Link href={"/dashboard/eleves/"+d.id+"?completer=1"}>Compléter<ArrowRight className="size-3.5" aria-hidden /></Link>
            </Button></td>
          </tr>)}</tbody>
        </table>
      </div> : <div className="px-4 py-12 text-center text-sm text-slate-500"><FileText className="mx-auto mb-3 size-8" aria-hidden/>Aucune fiche correspondant à cette recherche.</div>}
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-xs dark:border-border">
        <span>{total ? num(offset+1)+"–"+num(Math.min(offset+parPage,total)) : "0"} sur {num(total)} dossiers</span>
        <nav className="flex items-center gap-2" aria-label="Pagination des fiches à vérifier">
          {page>1?<UrlPage numero={page-1} q={q}>Précédent</UrlPage>:null}
          <UrlPage numero={page} q={q} active>{page} / {pages}</UrlPage>
          {page<pages?<UrlPage numero={page+1} q={q}>Suivant</UrlPage>:null}
        </nav>
      </footer>
    </section>
  </main>;
}
