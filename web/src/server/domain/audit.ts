import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { appareilLisible, libelleAction, libelleFamille, rendreChangements, type DetailLisible } from "@/lib/audit-presentation";

export interface LigneAudit {
  id:string; date:string; acteur:string; acteurId:string|null; role:string|null;
  action:string; actionLibelle:string; famille:string; familleLibelle:string;
  entite:string; entiteId:string|null; eleveId:string|null; eleve:string|null;
  motif:string|null; ip:string|null; appareil:string; preuve:DetailLisible;
}
export interface FiltresAudit {
  action?:string; entite?:string; eleveId?:string; acteurId?:string;
  recherche?:string; depuis?:string; jusqua?:string; page?:number;
}
export interface ResultatAudit {
  lignes:LigneAudit[]; total:number; page:number; nbPages:number; parPage:number;
  couverture:{adresseIp:number;appareil:number;avant:number;apres:number};
}
const PAR_PAGE=25;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dateISO(v:string|undefined):string|null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d=new Date(v+"T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v)?v:null;
}
export function nettoyerFiltres(f:FiltresAudit):Required<FiltresAudit> {
  return {
    action:(f.action??"").slice(0,64),entite:(f.entite??"").slice(0,64),
    eleveId:f.eleveId&&UUID.test(f.eleveId)?f.eleveId:"",
    acteurId:f.acteurId&&UUID.test(f.acteurId)?f.acteurId:"",
    recherche:(f.recherche??"").trim().slice(0,90),
    depuis:dateISO(f.depuis)??"",jusqua:dateISO(f.jusqua)??"",
    page:Math.min(10000,Math.max(1,Number.isFinite(f.page)?Math.floor(f.page!):1)),
  };
}
function motifLisible(motif:string|null):string|null {
  if (!motif) return null;
  if (/Bearer\s|(?:sk-|re_)[A-Za-z0-9]{12,}|password\s*[:=]/i.test(motif)) return "Motif contenant une information protégée";
  return motif.length<=220?motif:motif.slice(0,217)+"…";
}
export async function listerAudit(filtres:FiltresAudit={}):Promise<ResultatAudit>{
  const f=nettoyerFiltres(filtres);
  const decalage=(f.page-1)*PAR_PAGE;
  const action=f.action||null, entite=f.entite||null;
  const eleveId=f.eleveId||null, acteurId=f.acteurId||null;
  const depuis=f.depuis||null,jusqua=f.jusqua||null,recherche=f.recherche||null;
  const conditions=sql`
      (${action}::text IS NULL OR split_part(j.action,'.',1)=${action}::text)
      AND (${entite}::text IS NULL OR j.entite=${entite}::text)
      AND (${eleveId}::uuid IS NULL OR j.eleve_id=${eleveId}::uuid)
      AND (${acteurId}::uuid IS NULL OR j.utilisateur_id=${acteurId}::uuid)
      AND (${depuis}::date IS NULL OR j.cree_le>=${depuis}::date)
      AND (${jusqua}::date IS NULL OR j.cree_le<${jusqua}::date+INTERVAL '1 day')
      AND (${recherche}::text IS NULL OR
        j.nom_acteur ILIKE '%'||${recherche}::text||'%' OR
        j.action ILIKE '%'||${recherche}::text||'%' OR
        j.entite ILIKE '%'||${recherche}::text||'%' OR
        j.motif ILIKE '%'||${recherche}::text||'%' OR
        e.nom ILIKE '%'||${recherche}::text||'%' OR
        e.prenom ILIKE '%'||${recherche}::text||'%')
  `;
  const [liste, compte]=await Promise.all([
    db.execute<{
      id:string;date:string;acteur:string|null;acteur_id:string|null;
      role:string|null;action:string;entite:string;entite_id:string|null;
      eleve_id:string|null;eleve:string|null;motif:string|null;
      avant:unknown;apres:unknown;ip:string|null;agent:string|null;
    }>(sql`
      SELECT j.id::text, j.cree_le::text AS date, j.nom_acteur AS acteur,
        j.utilisateur_id::text AS acteur_id,j.role_acteur::text AS role,
        j.action,j.entite,j.entite_id::text,j.eleve_id::text,
        e.nom||' '||e.prenom AS eleve,j.motif,j.valeurs_avant AS avant,
        j.valeurs_apres AS apres,j.adresse_ip::text AS ip,j.user_agent AS agent
      FROM journal_audit j LEFT JOIN eleves e ON e.id=j.eleve_id
      WHERE ${conditions} ORDER BY j.cree_le DESC,j.id DESC
      LIMIT ${PAR_PAGE} OFFSET ${decalage}
    `),
    db.execute<{n:number;adresse_ip:number;appareil:number;avant:number;apres:number}>(sql`
      SELECT COUNT(*)::int AS n,COUNT(j.adresse_ip)::int AS adresse_ip,
        COUNT(j.user_agent)::int AS appareil,COUNT(j.valeurs_avant)::int AS avant,
        COUNT(j.valeurs_apres)::int AS apres
      FROM journal_audit j LEFT JOIN eleves e ON e.id=j.eleve_id
      WHERE ${conditions}
    `),
  ]);
  const compteur=compte.rows[0],total=Number(compteur?.n??0);
  return {
    lignes:liste.rows.map(x=>{
      const famille=x.action.split(".")[0]??"autre";
      return {
        id:x.id,date:x.date,
        acteur:x.acteur?.trim()||(x.acteur_id?"Compte non identifié":"Système / processus"),
        acteurId:x.acteur_id,role:x.role,action:x.action,actionLibelle:libelleAction(x.action),
        famille,familleLibelle:libelleFamille(famille),
        entite:x.entite,entiteId:x.entite_id,eleveId:x.eleve_id,eleve:x.eleve,
        motif:motifLisible(x.motif),ip:x.ip,appareil:appareilLisible(x.agent),
        preuve:rendreChangements(x.avant,x.apres),
      };
    }),
    total,page:f.page,nbPages:Math.max(1,Math.ceil(total/PAR_PAGE)),parPage:PAR_PAGE,
    couverture:{
      adresseIp:Number(compteur?.adresse_ip??0),appareil:Number(compteur?.appareil??0),
      avant:Number(compteur?.avant??0),apres:Number(compteur?.apres??0),
    },
  };
}
export async function famillesAudit():Promise<Array<{famille:string;label:string;nombre:number}>>{
  const r=await db.execute<{famille:string;nombre:number}>(sql`
    SELECT split_part(action,'.',1) AS famille,COUNT(*)::int AS nombre
    FROM journal_audit GROUP BY 1 ORDER BY 2 DESC LIMIT 80
  `);
  return r.rows.map(x=>({famille:x.famille,label:libelleFamille(x.famille),nombre:Number(x.nombre)}));
}
export async function acteursAudit():Promise<Array<{id:string;nom:string;role:string|null;nombre:number}>>{
  const r=await db.execute<{id:string;nom:string|null;role:string|null;nombre:number}>(sql`
    SELECT utilisateur_id::text AS id,MAX(nom_acteur) AS nom,
      MAX(role_acteur::text) AS role,COUNT(*)::int AS nombre
    FROM journal_audit WHERE utilisateur_id IS NOT NULL
    GROUP BY utilisateur_id ORDER BY nombre DESC LIMIT 100
  `);
  return r.rows.map(x=>({id:x.id,nom:x.nom||"Compte non identifié",role:x.role,nombre:Number(x.nombre)}));
}
