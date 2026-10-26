"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight, BookOpenCheck, ChevronRight, ClipboardList, GraduationCap,
  School, Wallet, Users, BellRing, Clock3,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { statTile, statusBadge, visitorRow } from "@/vendor/gentelella-v4/markup.js";
import { formaterFcfa } from "@/lib/finances-format";
import type {
  Alerte, IndicateursCles, PointClasse, PointMatiere, PointMois, PointNiveau, PointRecouvrement,
} from "@/server/domain/pilotage";

export interface AccesTableauDeBord {
  eleves: boolean;
  classes: boolean;
  assiduite: boolean;
  notes: boolean;
  finances: boolean;
  communication: boolean;
  personnel: boolean;
}
type Donnees = {
  indicateurs: IndicateursCles;
  niveaux: PointNiveau[];
  absences: PointMois[];
  classes: PointClasse[];
  matieres: PointMatiere[];
  recouvrement: PointRecouvrement[];
  listeAlertes: Alerte[];
  acces: AccesTableauDeBord;
};
type Couleur = "teal" | "blue" | "green" | "yellow" | "red" | "purple";
const nf = (v: number) => v.toLocaleString("fr-FR");
const tick = { fontSize: 11, fill: "#7e8896" };
const infoBulle = { contentStyle: { borderRadius: 6, backgroundColor: "var(--bg-surface)", color: "var(--text)", border: "1px solid var(--border-color)", fontSize: 12 } };

// These static SVGs are taken from Gentelella v4 production/index.html.
const usersSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>';
const clockSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
const moneySVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>';
const chartSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>';

function Statistique({ label, value, subtext, color, iconHtml, href }: {
  label: string; value: string; subtext: string; color: Couleur; iconHtml: string; href?: string;
}) {
  // This is the ORIGINAL Gentelella v4 markup helper, not a re-created stat component.
  // It escapes all dynamic data; iconHtml comes exclusively from the trusted constants above.
  const markup = <div dangerouslySetInnerHTML={{ __html: statTile({ label, value, subtext, color, iconHtml }) }} />;
  return href
    ? <Link href={href} className="lgr-card-link" aria-label={label + " : " + value}>{markup}</Link>
    : <div>{markup}</div>;
}

function Vide({ children }: { children: React.ReactNode }) {
  return <div className="lgr-chart-empty">{children}</div>;
}

export function Pilotage({ indicateurs: i, niveaux, absences, classes, matieres, recouvrement, listeAlertes, acces }: Donnees) {
  const [graphique, setGraphique] = useState<"effectifs" | "finances">(acces.eleves ? "effectifs" : "finances");
  const vue = graphique === "finances" && acces.finances ? "finances" : acces.eleves ? "effectifs" : "finances";
  const totalEncaisse = recouvrement.at(-1)?.cumul ?? null;
  const garcons = niveaux.reduce((sum, n) => sum + n.garcons, 0);
  const filles = niveaux.reduce((sum, n) => sum + n.filles, 0);
  const sexue = garcons + filles;
  const priorites = [...listeAlertes].sort((a, b) => {
    const urgence = { danger: 0, alerte: 1, info: 2 };
    return urgence[a.gravite] - urgence[b.gravite] || b.nombre - a.nombre;
  });
  const classement = [...classes].filter(c => c.moyenne !== null)
    .sort((a, b) => (b.moyenne ?? 0) - (a.moyenne ?? 0)).slice(0, 5);
  const raccourcis = [
    acces.eleves ? { titre: "Dossiers des élèves", lien: "/dashboard/eleves", Icon: Users } : null,
    acces.classes ? { titre: "Classes", lien: "/dashboard/classes", Icon: School } : null,
    acces.notes ? { titre: "Notes et résultats", lien: "/dashboard/notes", Icon: GraduationCap } : null,
    acces.assiduite ? { titre: "Assiduité", lien: "/dashboard/assiduite", Icon: Clock3 } : null,
    acces.finances ? { titre: "Finances", lien: "/dashboard/finances", Icon: Wallet } : null,
    acces.communication ? { titre: "Communication", lien: "/dashboard/communication", Icon: BellRing } : null,
  ].filter(item => item !== null);
  const kpis: Array<{label:string;value:string;subtext:string;color:Couleur;iconHtml:string;href?:string}> = [
    { label:"Élèves inscrits", value:nf(i.effectif), subtext:nf(i.nouveauxInscrits)+" nouvelles inscriptions", color:"teal", iconHtml:usersSVG, href:acces.eleves ? "/dashboard/eleves" : undefined },
    { label:"Classes actives", value:nf(i.classes), subtext:"Pour l'année courante", color:"blue", iconHtml:clockSVG, href:acces.classes ? "/dashboard/classes" : undefined },
    { label:"Enseignants", value:nf(i.enseignants), subtext:"Personnel actif", color:"purple", iconHtml:usersSVG, href:acces.personnel ? "/dashboard/personnel" : undefined },
    ...(acces.notes ? [{ label:"Réussite scolaire", value:i.tauxReussite === null ? "—" : nf(i.tauxReussite)+" %", subtext:i.moyenneGenerale === null ? "Moyenne non calculée" : "Moyenne : "+nf(i.moyenneGenerale)+"/20", color:"green" as Couleur, iconHtml:chartSVG, href:"/dashboard/notes" }] : []),
    ...(acces.assiduite ? [{ label:"Absences signalées", value:nf(i.absentsAujourdhui), subtext:"Aujourd'hui · présence non certifiée", color:"yellow" as Couleur, iconHtml:clockSVG, href:"/dashboard/assiduite" }] : []),
    ...(acces.finances ? [{ label:"Encaissements", value:totalEncaisse === null ? "—" : formaterFcfa(totalEncaisse), subtext:"Cumul de l'année scolaire", color:"teal" as Couleur, iconHtml:moneySVG, href:"/dashboard/finances" }] : []),
  ];

  return <div className="page-wrapper" data-template="gentelella" data-template-version="4.2.0">
    <section className="row col-3" aria-label="Chiffres-clés de l'établissement">
      {kpis.map(kpi => <Statistique key={kpi.label} {...kpi} />)}
    </section>

    <section className="row col-8-4" aria-label="Graphique principal et alertes">
      <div className="card">
        <div className="chart-header">
          <div className="chart-header-left">
            <div className="card-title">Vue d'ensemble des données</div>
            <div className="card-subtitle">{vue === "effectifs" ? "Effectifs par niveau et par sexe" : "Recouvrement des frais de scolarité"}</div>
            {vue === "finances" && totalEncaisse !== null ? <div className="chart-stat">{formaterFcfa(totalEncaisse)}</div> : null}
          </div>
          <div className="chart-tabs" role="tablist" aria-label="Données présentées">
            {acces.eleves ? <button type="button" role="tab" aria-selected={vue==="effectifs"} className={"chart-tab"+(vue==="effectifs"?" active":"")} onClick={()=>setGraphique("effectifs")}>Effectifs</button> : null}
            {acces.finances ? <button type="button" role="tab" aria-selected={vue==="finances"} className={"chart-tab"+(vue==="finances"?" active":"")} onClick={()=>setGraphique("finances")}>Finances</button> : null}
          </div>
        </div>
        <div className="chart-area">
          {vue === "effectifs" && acces.eleves
            ? niveaux.length ? <div className="lgr-chart-container" role="img" aria-label="Effectifs par niveau">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={niveaux} margin={{top:5,right:8,left:-12,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6e7eb"/>
                  <XAxis tick={tick} dataKey="niveau"/><YAxis tick={tick} allowDecimals={false}/>
                  <Tooltip {...infoBulle}/><Legend wrapperStyle={{fontSize:11}}/>
                  <Bar dataKey="garcons" name="Garçons" fill="#066fd1" stackId="total" maxBarSize={38}/>
                  <Bar dataKey="filles" name="Filles" fill="#1abb9c" stackId="total" maxBarSize={38} radius={[3,3,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div> : <Vide>Aucun effectif disponible.</Vide>
            : acces.finances && recouvrement.length ? <div className="lgr-chart-container" role="img" aria-label="Évolution des encaissements">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={recouvrement} margin={{top:5,right:8,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6e7eb"/>
                  <XAxis tick={tick} dataKey="libelle"/><YAxis tick={tick} tickFormatter={v=>Math.round(Number(v)/1000000)+" M"}/>
                  <Tooltip {...infoBulle} formatter={v=>formaterFcfa(Number(v))}/><Legend wrapperStyle={{fontSize:11}}/>
                  <Line type="monotone" dataKey="encaisse" name="Par mois" stroke="#4299e1" strokeWidth={2} dot={false}/>
                  <Line type="monotone" dataKey="cumul" name="Cumul" stroke="#1abb9c" strokeWidth={2} dot={{r:2}}/>
                </LineChart>
              </ResponsiveContainer>
            </div> : <Vide>Aucune série statistique disponible.</Vide>}
        </div>
        <div className="card-footer lgr-meta">Données issues du système scolaire · aucune donnée fictive.</div>
      </div>

      <div className="card">
        <div className="card-header">
          <div><div className="card-title">À traiter en priorité</div><div className="card-subtitle">{priorites.length} situation(s) à examiner</div></div>
          <ClipboardList className="lgr-icon" aria-hidden/>
        </div>
        {priorites.length ? <div className="card-body" style={{padding:"0 12px"}}>
          <ul className="activity-list">
            {priorites.slice(0,6).map(a=><li className="activity-item" key={a.categorie+a.libelle}>
              <span className="activity-avatar" style={{background:a.gravite==="danger"?"var(--red-lt)":a.gravite==="alerte"?"var(--yellow-lt)":"var(--blue-lt)",color:a.gravite==="danger"?"var(--red)":a.gravite==="alerte"?"#b45309":"var(--blue)"}}>{a.nombre>99?"99+":a.nombre}</span>
              <div style={{flex:1,minWidth:0}}>
                <Link href={a.url} className="activity-body" style={{color:"var(--text)",fontWeight:500}}>{a.libelle}</Link>
                <div className="activity-time">{a.categorie}</div>
              </div>
              <span dangerouslySetInnerHTML={{__html:statusBadge(a.gravite==="danger"?"Urgent":a.gravite==="alerte"?"À traiter":"Information",a.gravite==="danger"?"red":a.gravite==="alerte"?"yellow":"blue")}}/>
            </li>)}
          </ul>
        </div> : <Vide>Aucune alerte active pour les modules autorisés.</Vide>}
        <div className="card-footer lgr-meta">Cliquez sur une situation pour accéder au traitement.</div>
      </div>
    </section>

    <section className="row col-8-4" aria-label="Performances et suivi scolaire">
      {acces.notes ? <div className="card">
        <div className="card-header">
          <div><div className="card-title">Classement scolaire</div><div className="card-subtitle">Les cinq premières classes évaluées</div></div>
          <Link href="/dashboard/notes" className="btn btn-outline btn-sm">Voir les notes <ArrowRight className="lgr-icon" aria-hidden/></Link>
        </div>
        {classement.length ? <div className="table-responsive"><table className="table">
          <thead><tr><th>Classe</th><th>Effectif</th><th>Moyenne /20</th><th>Réussite</th></tr></thead>
          <tbody>{classement.map(c=><tr key={c.classeId}>
            <td className="cell-strong">{c.classe}</td>
            <td className="cell-mono">{nf(c.effectif)}</td>
            <td className="cell-strong">{c.moyenne?.toFixed(2).replace(".",",")}</td>
            <td><span dangerouslySetInnerHTML={{__html:statusBadge(c.tauxReussite===null?"Non calculée":nf(c.tauxReussite)+" %",c.tauxReussite!==null&&c.tauxReussite<50?"yellow":"green")}}/></td>
          </tr>)}</tbody>
        </table></div> : <Vide>Aucune classe évaluée pour la période.</Vide>}
      </div> : <div className="card">
        <div className="card-header"><div className="card-title">Scolarité</div></div>
        <Vide>Les modules disponibles dépendent de votre rôle.</Vide>
      </div>}
      {acces.assiduite ? <div className="card">
        <div className="card-header"><div><div className="card-title">Assiduité du jour</div><div className="card-subtitle">Signalements, heure du Tchad</div></div></div>
        <div className="lgr-soft-warning">Le nombre de présents reste non disponible tant qu'un pointage exhaustif n'est pas effectué.</div>
        <div className="card-body" style={{paddingTop:4}}>
          <div className="visitor-row"><span className="visitor-name">Absences signalées</span><span className="visitor-pct">{nf(i.absentsAujourdhui)}</span></div>
          <div className="visitor-row"><span className="visitor-name">Retards signalés</span><span className="visitor-pct">{nf(i.retardsAujourdhui)}</span></div>
        </div>
        <Link href="/dashboard/assiduite" className="lgr-item-link"><span>Ouvrir le registre</span><ChevronRight className="lgr-icon" aria-hidden/></Link>
      </div> : <div className="card">
        <div className="card-header"><div className="card-title">Accès administratifs</div></div>
        {raccourcis.slice(0,4).map(a=><Link className="lgr-item-link" href={a.lien} key={a.lien}><a.Icon className="lgr-icon" aria-hidden/><span>{a.titre}</span><ChevronRight className="lgr-icon" aria-hidden/></Link>)}
      </div>}
    </section>

    <section className="row col-3" aria-label="Informations complémentaires">
      {acces.eleves ? <div className="card">
        <div className="card-header"><div><div className="card-title">Effectifs par sexe</div><div className="card-subtitle">Inscriptions actives</div></div></div>
        {sexue ? <div className="card-body">
          <div dangerouslySetInnerHTML={{__html:visitorRow({name:"Garçons",pct:Math.round(100*garcons/sexue)})}}/>
          <div dangerouslySetInnerHTML={{__html:visitorRow({name:"Filles",pct:Math.round(100*filles/sexue)})}}/>
          <p className="lgr-meta" style={{paddingTop:12}}>Élèves dont le sexe est renseigné : {nf(sexue)}.</p>
        </div> : <Vide>Aucune donnée de répartition.</Vide>}
      </div> : null}
      {acces.assiduite ? <div className="card">
        <div className="card-header"><div><div className="card-title">Absences mensuelles</div><div className="card-subtitle">Heures justifiées et non justifiées</div></div></div>
        {absences.length ? <div className="card-body"><div className="lgr-chart-container" style={{height:190}} role="img" aria-label="Histogramme mensuel des absences"><ResponsiveContainer width="100%" height="100%">
          <BarChart data={absences} margin={{top:2,right:4,left:-20,bottom:2}}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6e7eb"/>
            <XAxis tick={tick} dataKey="libelle"/><YAxis tick={tick}/><Tooltip {...infoBulle}/>
            <Bar dataKey="justifiees" name="Justifiées" stackId="a" fill="#2fb344"/>
            <Bar dataKey="nonJustifiees" name="Non justifiées" stackId="a" fill="#f59f00" radius={[3,3,0,0]}/>
          </BarChart>
        </ResponsiveContainer></div></div> : <Vide>Aucune absence enregistrée.</Vide>}
      </div> : null}
      <div className="card">
        <div className="card-header"><div><div className="card-title">Accès rapides</div><div className="card-subtitle">Modules du lycée</div></div></div>
        {raccourcis.length ? raccourcis.map(a=><Link key={a.lien} href={a.lien} className="lgr-item-link"><a.Icon className="lgr-icon" aria-hidden/><span>{a.titre}</span><ChevronRight className="lgr-icon" aria-hidden/></Link>) : <Vide>Aucun raccourci disponible.</Vide>}
      </div>
    </section>
  </div>;
}
