"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Eye, KeyRound, MoreHorizontal, Pencil, Send, ShieldOff, Trash2, UserRoundX } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { LigneTuteur } from "@/server/domain/parents";
import { inviterTuteur, modifierProfilTuteur, revoquerAcces, supprimerTuteurOrphelin } from "../actions";

export function ActionsParent({ t }: { t: LigneTuteur }) {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();
  const [fenetre, setFenetre] = useState<"modifier" | "revoquer" | "supprimer" | null>(null);
  const [sms, setSms] = useState(t.accepteSms);
  const [motif, setMotif] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreurs, setErreurs] = useState<Record<string, string>>({});

  const nomComplet = t.prenom + " " + t.nom;
  const statutInvite = !t.utilisateurId || !t.derniereConnexion || t.compteActif === false;
  const peutSupprimer = t.nbEnfants === 0 && !t.utilisateurId;

  function fermer() {
    if (enCours) return;
    setFenetre(null);
    setMotif("");
    setConfirmation("");
    setErreurs({});
  }

  function enregistrer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const donnees = {
      nom: String(form.get("nom") ?? ""),
      prenom: String(form.get("prenom") ?? ""),
      sexe: String(form.get("sexe") ?? ""),
      telephone: String(form.get("telephone") ?? ""),
      telephoneSecondaire: String(form.get("telephoneSecondaire") ?? ""),
      email: String(form.get("email") ?? ""),
      profession: String(form.get("profession") ?? ""),
      employeur: String(form.get("employeur") ?? ""),
      adresse: String(form.get("adresse") ?? ""),
      quartier: String(form.get("quartier") ?? ""),
      accepteSms: sms,
    };
    setErreurs({});
    demarrer(async () => {
      const r = await modifierProfilTuteur(t.id, donnees);
      if (!r.ok) {
        setErreurs(r.erreurs ?? {});
        toast.error(r.message ?? "La modification du tuteur a échoué.");
      } else {
        toast.success(r.message ?? "Profil enregistré.");
        setFenetre(null);
        routeur.refresh();
      }
    });
  }

  function inviter() {
    demarrer(async () => {
      const r = await inviterTuteur(t.id);
      if (r.ok) toast.success(r.message ?? "Invitation transmise.", {
        duration: 12000,
        description: r.code ? "Code d’activation : " + r.code + " — à transmettre de manière sécurisée au parent." : undefined,
      });
      else toast.error(r.message ?? "Invitation impossible.");
      routeur.refresh();
    });
  }

  function confirmerRevoquer() {
    if (motif.trim().length < 3) return;
    demarrer(async () => {
      const r = await revoquerAcces(t.id, motif.trim());
      if (r.ok) { toast.success(r.message ?? "Accès révoqué."); setFenetre(null); setMotif(""); routeur.refresh(); }
      else toast.error(r.message ?? "Échec de révocation.");
    });
  }

  function confirmerSupprimer() {
    if (!peutSupprimer || confirmation.trim() !== nomComplet || motif.trim().length < 8) return;
    demarrer(async () => {
      const r = await supprimerTuteurOrphelin(t.id, confirmation, motif);
      if (r.ok) {
        toast.success(r.message ?? "Fiche orpheline supprimée.");
        setFenetre(null);
        routeur.refresh();
      } else toast.error(r.message ?? "Suppression refusée.");
    });
  }

  const champ = (nom: string, libelle: string, valeur: string | null, requis = false, type = "text") =>
    <div className="space-y-1.5" key={nom}>
      <Label htmlFor={nom + "-" + t.id}>{libelle}{requis ? <span className="text-red-600"> *</span> : null}</Label>
      <Input id={nom + "-" + t.id} name={nom} type={type} defaultValue={valeur ?? ""} required={requis} aria-invalid={Boolean(erreurs[nom])} />
      {erreurs[nom] ? <p className="text-xs text-red-700">{erreurs[nom]}</p> : null}
    </div>;

  return <>
    <div className="flex items-center justify-end gap-1.5">
      <Button asChild variant="outline" size="icon" className="size-9 rounded-lg border-slate-200 bg-white shadow-none dark:border-border dark:bg-card" title="Ouvrir la fiche parent">
        <Link href={"/dashboard/parents/" + t.id} aria-label={"Ouvrir la fiche de " + nomComplet}><Eye className="size-4" aria-hidden /></Link>
      </Button>
      <Button variant="outline" size="icon" className="size-9 rounded-lg border-slate-200 bg-white shadow-none dark:border-border dark:bg-card"
        title="Modifier le profil" aria-label={"Modifier le profil de " + nomComplet} onClick={() => { setErreurs({}); setSms(t.accepteSms); setFenetre("modifier"); }}>
        <Pencil className="size-4" aria-hidden />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="size-9 rounded-lg border-slate-200 bg-white shadow-none dark:border-border dark:bg-card" aria-label={"Autres actions pour " + nomComplet}>
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Compte de {nomComplet}</DropdownMenuLabel>
          <DropdownMenuItem asChild><Link href={"/dashboard/parents/" + t.id}><Eye className="size-4" aria-hidden />Consulter le dossier</Link></DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { setErreurs({}); setFenetre("modifier"); }}><Pencil className="size-4" aria-hidden />Modifier les informations</DropdownMenuItem>
          <DropdownMenuSeparator />
          {statutInvite ? (
            <DropdownMenuItem disabled={enCours} onSelect={() => inviter()}>
              {t.compteActif === false ? <KeyRound className="size-4" aria-hidden /> : <Send className="size-4" aria-hidden />}
              {t.compteActif === false ? "Réactiver et inviter" : !t.utilisateurId ? "Inviter le parent" : "Renvoyer le code"}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem className="text-red-700 focus:text-red-700" onSelect={() => { setMotif(""); setFenetre("revoquer"); }}>
              <ShieldOff className="size-4" aria-hidden />Révoquer l’accès
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!peutSupprimer} className="text-red-700 focus:text-red-700" onSelect={() => { setMotif(""); setConfirmation(""); setFenetre("supprimer"); }}>
            <Trash2 className="size-4" aria-hidden />Supprimer la fiche orpheline
          </DropdownMenuItem>
          {!peutSupprimer ? <p className="px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">Suppression bloquée : ce tuteur est lié à un compte ou à un enfant.</p> : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <Dialog open={fenetre === "modifier"} onOpenChange={v => { if (!v) fermer(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Modifier le parent — {nomComplet}</DialogTitle><DialogDescription>Corrigez les coordonnées et informations professionnelles. Les changements sont journalisés. Les enfants rattachés ne sont pas modifiés.</DialogDescription></DialogHeader>
        <form onSubmit={enregistrer} className="space-y-5">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">Identité du responsable</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {champ("nom","Nom",t.nom,true)}
              {champ("prenom","Prénom",t.prenom,true)}
              <div className="space-y-1.5">
                <Label htmlFor={"sexe-"+t.id}>Sexe</Label>
                <NativeSelect id={"sexe-"+t.id} name="sexe" defaultValue={t.sexe ?? ""}>
                  <option value="">Non renseigné</option><option value="M">Masculin</option><option value="F">Féminin</option>
                </NativeSelect>
              </div>
              {champ("profession","Profession",t.profession)}
              {champ("employeur","Employeur",t.employeur)}
            </div>
          </section>
          <section className="space-y-3 border-t border-slate-100 pt-4 dark:border-border">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">Coordonnées</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {champ("telephone","Téléphone principal",t.telephone,true,"tel")}
              {champ("telephoneSecondaire","Téléphone secondaire",t.telephoneSecondaire,false,"tel")}
              {champ("email","Adresse e-mail",t.email,false,"email")}
              {champ("quartier","Quartier",t.quartier)}
              <div className="sm:col-span-2">{champ("adresse","Adresse",t.adresse)}</div>
            </div>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={sms} onCheckedChange={v => setSms(v===true)} /> Accepte les notifications SMS</label>
          </section>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={enCours} onClick={fermer}>Annuler</Button>
            <Button type="submit" disabled={enCours} className="bg-emerald-700 text-white hover:bg-emerald-800">{enCours ? "Enregistrement…" : "Enregistrer les modifications"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={fenetre === "revoquer"} onOpenChange={v => { if (!v) fermer(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Révoquer l’accès parent</DialogTitle><DialogDescription>Les sessions de {nomComplet} seront fermées. La fiche et les liens avec les enfants seront conservés.</DialogDescription></DialogHeader>
        <div className="space-y-2"><Label htmlFor={"motif-rev-"+t.id}>Motif obligatoire</Label><Input id={"motif-rev-"+t.id} value={motif} onChange={e=>setMotif(e.target.value)} placeholder="Exemple : accès à désactiver sur demande..." /></div>
        <DialogFooter><Button variant="outline" disabled={enCours} onClick={fermer}>Annuler</Button><Button variant="destructive" disabled={enCours || motif.trim().length < 3} onClick={confirmerRevoquer}>Confirmer la révocation</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={fenetre === "supprimer"} onOpenChange={v => { if (!v) fermer(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Supprimer une fiche orpheline</DialogTitle><DialogDescription>Action irréversible, autorisée uniquement si aucun compte, enfant ou historique de notification n’existe. Saisissez le nom complet exactement.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor={"conf-del-"+t.id}>Confirmation : {nomComplet}</Label><Input id={"conf-del-"+t.id} value={confirmation} onChange={e=>setConfirmation(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor={"motif-del-"+t.id}>Motif (8 caractères minimum)</Label><Input id={"motif-del-"+t.id} value={motif} onChange={e=>setMotif(e.target.value)} /></div>
        </div>
        <DialogFooter><Button variant="outline" disabled={enCours} onClick={fermer}>Annuler</Button><Button variant="destructive" disabled={enCours || confirmation.trim() !== nomComplet || motif.trim().length < 8} onClick={confirmerSupprimer}><UserRoundX className="size-4" aria-hidden />Supprimer définitivement</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
