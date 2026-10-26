"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Copy, KeyRound, Pencil, Plus, Search, ShieldCheck, ShieldOff, Users, Wrench } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { CategoriePersonnel, LignePersonnelNonEnseignant } from "@/server/domain/personnel-non-enseignant";
import { statTile, statusBadge } from "@/vendor/gentelella-v4/markup.js";
import statistiquesStyles from "../../parents/_components/statistiques-parents.module.css";
import styles from "./personnel-stats.module.css";
import {
  basculerPersonnelNonEnseignant, creerPersonnelNonEnseignant, modifierPersonnelNonEnseignant,
  creerComptePersonnel, gererComptePersonnel,
} from "../actions-non-enseignants";

type Props={personnels:LignePersonnelNonEnseignant[];categorie:CategoriePersonnel;peutGererRoles:boolean;creationDemandee?:boolean};
type Couleur="teal"|"blue"|"green"|"yellow"|"red"|"purple";
type Carte={titre:string;valeur:number;detail:string;couleur:Couleur;icone:string};
const svgUsers='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>';
const svgCheck='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12l5 5L20 6"/></svg>';
const svgKey='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="15" r="4"/><path d="M11 12L21 2m-2 2 3 3m-6 0 3 3"/></svg>';
const svgWork='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7h18v13H3V7Zm5 0V4h8v3"/></svg>';
const nombre=(v:number)=>v.toLocaleString("fr-FR");

const ROLES_ADMIN:[string,string][]=[
 ["SURVEILLANT","Surveillance"],["SECRETARIAT","Secrétariat"],["COMPTABLE","Comptabilité"],
 ["CENSEUR","Censeur"],["DIRECTION","Direction"]
];

function StatPersonnel({titre,valeur,detail,couleur,icone}:Carte){
  return <div className={styles.tuile} dangerouslySetInnerHTML={{__html:statTile({label:titre,value:nombre(valeur),subtext:detail,color:couleur,iconHtml:icone})}} />;
}
function nomComplet(p:LignePersonnelNonEnseignant){return p.prenom+" "+p.nom;}

export function RegistrePersonnelNonEnseignant({personnels,categorie,peutGererRoles,creationDemandee=false}:Props){
  const routeur=useRouter();
  const rechercheParams=useSearchParams();
  const [enCours,demarrer]=useTransition();
  const [recherche,setRecherche]=useState("");
  const [etat,setEtat]=useState("TOUS");
  const [page,setPage]=useState(1);
  const [parPage,setParPage]=useState(10);
  const [edition,setEdition]=useState<LignePersonnelNonEnseignant|null|undefined>(creationDemandee?null:undefined);
  useEffect(()=>{if(creationDemandee)setEdition(null);},[creationDemandee]);
  function fermerFiche(){
    setEdition(undefined);setErreurs({});
    if(rechercheParams.has("nouveau")){
      const q=new URLSearchParams(rechercheParams.toString());q.delete("nouveau");
      routeur.replace("/dashboard/personnel"+(q.size?"?"+q.toString():""),{scroll:false});
    }
  }
  const [cibleCompte,setCibleCompte]=useState<LignePersonnelNonEnseignant|null>(null);
  const [motDePasse,setMotDePasse]=useState<string|null>(null);
  const [role,setRole]=useState("SECRETARIAT");
  const [erreurs,setErreurs]=useState<Record<string,string>>({});
  const [cibleEtat,setCibleEtat]=useState<LignePersonnelNonEnseignant|null>(null);
  const libelle=categorie==="ADMINISTRATIF"?"administratif":"technique";
  const nbActifs=personnels.filter(p=>p.actif).length;
  const nbComptes=personnels.filter(p=>p.utilisateurId&&p.compteActif).length;
  const nbSansCompte=personnels.filter(p=>!p.utilisateurId).length;
  const nbServices=new Set(personnels.map(p=>p.service?.trim()).filter(Boolean)).size;
  const statistiques:Carte[]=[
    {titre:"Dossiers "+libelle+"s",valeur:personnels.length,detail:"Effectif",couleur:"teal",icone:svgUsers},
    {titre:"En activité",valeur:nbActifs,detail:"Dossiers actifs",couleur:"green",icone:svgCheck},
    {titre:"Hors activité",valeur:personnels.length-nbActifs,detail:"Inactifs",couleur:"yellow",icone:svgWork},
    {titre:"Services représentés",valeur:nbServices,detail:"Services",couleur:"blue",icone:svgWork},
    {titre:categorie==="ADMINISTRATIF"?"Comptes actifs":"Sans compte portail",valeur:categorie==="ADMINISTRATIF"?nbComptes:nbSansCompte,detail:categorie==="ADMINISTRATIF"?"Comptes actifs":"Sans accès",couleur:"purple",icone:svgKey},
  ];
  const visibles=personnels.filter(p=>{
    const texte=[p.nom,p.prenom,p.matricule,p.fonction,p.service,p.telephone].join(" ").toLocaleLowerCase("fr");
    return texte.includes(recherche.trim().toLocaleLowerCase("fr")) && (etat==="TOUS"||(etat==="ACTIF"?p.actif:!p.actif));
  });
  const nbPages=Math.max(1,Math.ceil(visibles.length/parPage));
  const pageVisible=Math.min(page,nbPages);
  const range=visibles.slice((pageVisible-1)*parPage,pageVisible*parPage);
  const erreursChamp=(cle:string)=>erreurs[cle]?<p className="text-xs text-red-600">{erreurs[cle]}</p>:null;

  function soumettre(formData:FormData){
    const v=Object.fromEntries(formData.entries());
    const identifiant=edition?.id;
    demarrer(async()=>{
      const r=identifiant?await modifierPersonnelNonEnseignant(identifiant,v):await creerPersonnelNonEnseignant(v);
      if(!r.ok){setErreurs(r.erreurs||{});toast.error(r.message||"Enregistrement impossible.");return;}
      toast.success(r.message||"Enregistré.");fermerFiche();routeur.refresh();
    });
  }
  function gererEtat(){
    if(!cibleEtat)return;
    const cible=cibleEtat;demarrer(async()=>{
      const r=await basculerPersonnelNonEnseignant(cible.id,!cible.actif);
      if(r.ok){toast.success(r.message);setCibleEtat(null);routeur.refresh();}
      else toast.error(r.message||"Opération impossible.");
    });
  }
  function creerAcces(){
    if(!cibleCompte)return;
    const cible=cibleCompte;demarrer(async()=>{
      const r=await creerComptePersonnel(cible.id,role);
      if(r.ok&&r.motDePasse){setMotDePasse(r.motDePasse);routeur.refresh();}
      else toast.error(r.message||"La création du compte a échoué.");
    });
  }
  function opererCompte(operation:"REINITIALISER"|"DESACTIVER"|"REACTIVER"){
    if(!cibleCompte)return;
    const cible=cibleCompte;demarrer(async()=>{
      const r=await gererComptePersonnel(cible.id,operation);
      if(!r.ok){toast.error(r.message||"Opération impossible.");return;}
      if(r.motDePasse)setMotDePasse(r.motDePasse);
      else {toast.success(r.message);setCibleCompte(null);}
      routeur.refresh();
    });
  }
  const roleAttribuable=(p:LignePersonnelNonEnseignant)=>peutGererRoles || !["DIRECTION","CENSEUR"].includes(p.roleCompte??"");
  const ouvrirCompte=(p:LignePersonnelNonEnseignant)=>{
    setCibleCompte(p);setMotDePasse(null);setRole("SECRETARIAT");
  };
  return <div className="space-y-4">
    <section className={"gentelella-v4 "+statistiquesStyles.region} aria-label={"Statistiques du personnel "+libelle}>
      <div className={statistiquesStyles.grid}>{statistiques.map(k=><StatPersonnel key={k.titre} {...k}/>)}</div>
    </section>
    {categorie==="TECHNIQUE" ? <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-border dark:bg-muted/40 dark:text-muted-foreground">
      <ShieldCheck className="mr-2 inline size-4 text-emerald-700" aria-hidden/>Aucun accès au portail attribué automatiquement.
    </p> : null}
    <section aria-label="Filtres et recherche" className="flex flex-wrap gap-2 rounded-xl border border-slate-200/80 bg-white p-3 dark:border-border dark:bg-card">
      <div className="relative min-w-[200px] flex-[1_1_260px]"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden/>
        <Input className="h-10 pl-9" placeholder="Nom, fonction, service, matricule…" value={recherche} onChange={e=>{setRecherche(e.target.value);setPage(1);}} aria-label="Rechercher dans le personnel"/>
      </div>
      <NativeSelect className="h-10 w-full sm:w-44" value={etat} onChange={e=>{setEtat(e.target.value);setPage(1);}} aria-label="Filtrer par activité">
        <option value="TOUS">Tous les états</option><option value="ACTIF">En activité</option><option value="INACTIF">Hors activité</option>
      </NativeSelect>
      {(recherche||etat!=="TOUS")?<Button variant="outline" onClick={()=>{setRecherche("");setEtat("TOUS");setPage(1);}}>Effacer les filtres</Button>:null}
    </section>
    <section aria-label="Annuaire du personnel non enseignant" className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 p-4 dark:border-border">
        <div><h2 className="text-sm font-semibold">Annuaire {libelle}</h2><p className="text-xs text-slate-500">{nombre(visibles.length)} résultat(s)</p></div>
        
      </div>
      {visibles.length===0?<div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
        <Users className="size-9 text-slate-300" aria-hidden/><p className="font-semibold">Aucun dossier trouvé</p>
        <p className="text-xs text-slate-500">Modifiez les filtres ou ajoutez un agent.</p>
      </div>:<div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-[13px]">
          <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-muted/40">
            <tr><th className="px-4 py-3">Agent</th><th className="px-3 py-3">Matricule</th><th className="px-3 py-3">Fonction / Service</th><th className="px-3 py-3">État</th><th className="px-3 py-3">Accès au portail</th><th className="px-4 py-3 text-right">Actions</th></tr>
          </thead>
          <tbody>{range.map(p=><tr key={p.id} className="border-t border-slate-100 hover:bg-emerald-50/30 dark:border-border dark:hover:bg-muted/30">
            <td className="px-4 py-3"><div className="flex items-center gap-2.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{p.prenom[0]}{p.nom[0]}</span>
              <div><p className="font-semibold">{nomComplet(p)}</p><p className="text-[11px] text-slate-500">{p.telephone||p.email||"Sans coordonnées"}</p></div>
            </div></td>
            <td className="px-3 py-3 font-mono text-xs">{p.matricule}</td>
            <td className="px-3 py-3"><p className="font-medium">{p.fonction}</p><p className="text-[11px] text-slate-500">{p.service||"Service non précisé"}</p></td>
            <td className="px-3 py-3"><div className="gentelella-v4"><span dangerouslySetInnerHTML={{__html:statusBadge(p.actif?"Actif":"Désactivé",p.actif?"green":"red")}}/></div></td>
            <td className="px-3 py-3">{categorie==="ADMINISTRATIF" ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">{p.utilisateurId?(p.compteActif?(p.roleCompte||"Actif"):"Désactivé"):"Sans compte"}</span>
                {(!p.utilisateurId||roleAttribuable(p))?<Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-lg" onClick={()=>ouvrirCompte(p)}><KeyRound className="size-3.5"/>Gérer</Button>:null}
              </div>
            ):<span className="text-xs text-slate-500">Non attribué</span>}</td>
            <td className="px-4 py-3"><div className="flex justify-end gap-1.5">
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={()=>{setEdition(p);setErreurs({});}}><Pencil className="size-3.5"/>Modifier</Button>
              <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={()=>setCibleEtat(p)}>{p.actif?"Désactiver":"Réactiver"}</Button>
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>}
      {visibles.length>0?<div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs dark:border-border">
        <div className="flex items-center gap-2"><span>{nombre((pageVisible-1)*parPage+1)}–{nombre(Math.min(visibles.length,pageVisible*parPage))} sur {nombre(visibles.length)}</span>
          <NativeSelect className="h-9 w-20" value={String(parPage)} onChange={e=>{setParPage(Number(e.target.value));setPage(1);}} aria-label="Lignes par page">{[10,25,50,100].map(n=><option key={n} value={n}>{n}</option>)}</NativeSelect>
        </div>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" className="size-9 rounded-lg" aria-label="Page précédente" disabled={pageVisible===1} onClick={()=>setPage(pageVisible-1)}><ChevronLeft className="size-4"/></Button>
          <span>Page {pageVisible} / {nbPages}</span>
          <Button size="icon" variant="outline" className="size-9" aria-label="Page suivante" disabled={pageVisible===nbPages} onClick={()=>setPage(pageVisible+1)}><ChevronRight className="size-4"/></Button>
        </div>
      </div>:null}
    </section>

    <Dialog open={edition!==undefined} onOpenChange={o=>{if(!o)fermerFiche();}}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{edition?"Modifier le dossier":"Ajouter un agent "+libelle}</DialogTitle>
          </DialogHeader>
        <form key={edition?.id||"nouveau"} action={soumettre} className="space-y-4">
          <input type="hidden" name="categorie" value={categorie}/>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              ["matricule","Matricule *","text"],["nom","Nom *","text"],["prenom","Prénom *","text"],
              ["fonction","Fonction *","text"],["service","Service","text"],["telephone","Téléphone","tel"],
              ["email","E-mail","email"],["adresse","Adresse","text"],["dateEmbauche","Date d'embauche","date"],
              ["typeContrat","Type de contrat","text"]
            ] as Array<[string,string,string]>).map(([cle,libelleChamp,type])=><div key={cle} className="grid gap-1.5">
              <Label htmlFor={"pne-"+cle}>{libelleChamp}</Label>
              <Input id={"pne-"+cle} name={cle} type={type} required={libelleChamp.endsWith("*")} defaultValue={edition?(edition[cle as keyof LignePersonnelNonEnseignant] as string|null)||"":""}/>
              {erreursChamp(cle)}
            </div>)}
            <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="pne-observations">Observations administratives</Label>
              <textarea id="pne-observations" name="observations" defaultValue={edition?.observations||""} className="min-h-20 w-full rounded-lg border border-input bg-background p-3 text-sm" maxLength={1000}/>
              {erreursChamp("observations")}
            </div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={fermerFiche}>Annuler</Button>
            <Button type="submit" disabled={enCours}>{enCours?"Enregistrement…":"Enregistrer le dossier"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(cibleEtat)} onOpenChange={o=>{if(!o)setCibleEtat(null);}}>
      <DialogContent className="rounded-xl sm:max-w-md"><DialogHeader>
        <DialogTitle>{cibleEtat?.actif?"Désactiver":"Réactiver"} le dossier</DialogTitle>
        <DialogDescription>Confirmer le changement d'état de {cibleEtat?nomComplet(cibleEtat):"cet agent"}.
          {cibleEtat?.actif&&cibleEtat.utilisateurId?" Son compte d'accès sera désactivé et ses sessions seront fermées.":""}
        </DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" onClick={()=>setCibleEtat(null)}>Annuler</Button>
          <Button disabled={enCours} onClick={gererEtat}>{enCours?"En cours…":"Confirmer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(cibleCompte)} onOpenChange={o=>{if(!o){setCibleCompte(null);setMotDePasse(null);}}}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{motDePasse?"Mot de passe provisoire":cibleCompte?.utilisateurId?"Gérer l'accès":"Créer un accès administratif"}</DialogTitle>
          <DialogDescription>{motDePasse?"Copiez le secret et communiquez-le de façon sécurisée. Il n'apparaîtra plus après fermeture.":cibleCompte?"Compte de "+nomComplet(cibleCompte)+" · "+cibleCompte.fonction:""}</DialogDescription>
        </DialogHeader>
        {motDePasse?<div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border bg-slate-50 px-3 py-3 dark:bg-muted/40"><code className="break-all font-mono text-base font-semibold">{motDePasse}</code>
            <Button size="icon" variant="outline" aria-label="Copier le mot de passe" onClick={()=>{void navigator.clipboard.writeText(motDePasse);toast.success("Copié.");}}><Copy className="size-4"/></Button></div>
          <p className="text-xs text-amber-800">Mot de passe temporaire : changement obligatoire à la première connexion. Ne pas le placer dans les notes ou captures publiques.</p>
          <DialogFooter><Button onClick={()=>{setCibleCompte(null);setMotDePasse(null);}}>J'ai noté</Button></DialogFooter>
        </div>:cibleCompte?.utilisateurId?<div className="space-y-3">
          <p className="text-xs text-slate-500">Rôle : {cibleCompte.roleCompte||"Non défini"} · {cibleCompte.compteActif?"Compte actif":"Compte désactivé"}</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={enCours} variant="outline" onClick={()=>opererCompte("REINITIALISER")}><KeyRound className="size-4"/>Réinitialiser le mot de passe</Button>
            <Button disabled={enCours} variant="outline" onClick={()=>opererCompte(cibleCompte.compteActif?"DESACTIVER":"REACTIVER")}><ShieldOff className="size-4"/>{cibleCompte.compteActif?"Désactiver":"Réactiver"} le compte</Button>
          </div>
          <p className="text-xs text-slate-500">Les sessions seront fermées en cas de désactivation ou de réinitialisation.</p>
        </div>:<div className="space-y-3">
          <Label htmlFor="pne-role">Rôle dans l'application</Label>
          <NativeSelect id="pne-role" value={role} onChange={e=>setRole(e.target.value)}>
            {ROLES_ADMIN.filter(([r])=>peutGererRoles||!["DIRECTION","CENSEUR"].includes(r)).map(([valeur,libelleRole])=><option key={valeur} value={valeur}>{libelleRole}</option>)}
          </NativeSelect>
          <p className="text-xs leading-5 text-slate-500">Le rôle détermine les permissions, indépendamment de la fonction RH. Les rôles Direction et Censeur exigent une autorisation supplémentaire.</p>
          <DialogFooter><Button variant="outline" onClick={()=>setCibleCompte(null)}>Annuler</Button>
            <Button disabled={enCours||!cibleCompte?.actif} onClick={creerAcces}>{enCours?"Création…":"Créer l'accès"}</Button></DialogFooter>
        </div>}
      </DialogContent>
    </Dialog>
  </div>;
}
