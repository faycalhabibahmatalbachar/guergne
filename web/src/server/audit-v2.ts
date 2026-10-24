import "server-only";
import {randomUUID} from "node:crypto";
import {isIP} from "node:net";
import {sql,type SQL} from "drizzle-orm";
import {headers} from "next/headers";
import {valeursAuditSures} from "@/lib/audit-preuve-v2";
import type {Principal} from "@/server/guard";

/** Preuve atomique : l'écriture dans la même transaction fait échouer
 * toute l'opération métier si le journal est indisponible. */
export interface ContexteAuditV2 {
  correlationId:string;route:string;methode:"POST";source:"server_action";
  adresseIp:string|null;userAgent:string|null;
}
export interface EntreeAuditV2 {
  action:string;entite:string;entiteId?:string|null;eleveId?:string|null;
  avant?:unknown;apres?:unknown;motif?:string|null;
}
export async function preparerContexteAudit(route:string):Promise<ContexteAuditV2>{
  if(!/^\/dashboard\/[a-z0-9/-]+$/.test(route))throw new Error("Route d'audit non autorisée.");
  let adresseIp:string|null=null,userAgent:string|null=null;
  try {
    const h=await headers();
    const ip=h.get("x-forwarded-for")?.split(",")[0]?.trim()||"";
    adresseIp=isIP(ip)?ip:null;
    userAgent=h.get("user-agent")?.slice(0,360)||null;
  }catch{ /* un worker n'a pas toujours de contexte HTTP */ }
  return {correlationId:randomUUID(),route,methode:"POST",source:"server_action",adresseIp,userAgent};
}
type ExecuteAudit={
  execute(requete:SQL):Promise<unknown>;
};
export async function journaliserAtomiquement(tx:ExecuteAudit,acteur:Principal,contexte:ContexteAuditV2,entree:EntreeAuditV2):Promise<void>{
  if(!/^[a-z0-9_.-]{3,100}$/i.test(entree.action)||!/^[a-z0-9_]{2,80}$/i.test(entree.entite))throw new Error("Action d'audit incorrecte.");
  const avant=valeursAuditSures(entree.avant),apres=valeursAuditSures(entree.apres);
  // SQL NULL (absence réelle) plutôt que la valeur JSONB "null" : indispensable
  // pour que COUNT(valeurs_avant) mesure correctement la couverture des preuves.
  const avantSql=avant===null?sql`NULL`:sql`${JSON.stringify(avant)}::jsonb`;
  const apresSql=apres===null?sql`NULL`:sql`${JSON.stringify(apres)}::jsonb`;
  await tx.execute(sql`INSERT INTO journal_audit(
    utilisateur_id,role_acteur,nom_acteur,action,entite,entite_id,eleve_id,
    valeurs_avant,valeurs_apres,motif,adresse_ip,user_agent,
    correlation_id,route_origine,methode_http,type_source,version_preuve
  ) VALUES (
    ${acteur.id}::uuid,${acteur.role}::role_utilisateur,${acteur.prenom+" "+acteur.nom},
    ${entree.action},${entree.entite},${entree.entiteId??null}::uuid,${entree.eleveId??null}::uuid,
    ${avantSql},${apresSql},${(entree.motif??"").slice(0,240)||null},
    ${contexte.adresseIp}::inet,${contexte.userAgent},
    ${contexte.correlationId}::uuid,${contexte.route},${contexte.methode},${contexte.source},2
  )`);
}
