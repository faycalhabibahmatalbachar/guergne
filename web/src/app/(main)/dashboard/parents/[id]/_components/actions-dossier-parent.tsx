"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, MoreHorizontal, Send, KeyRound, ShieldOff, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { COUT_SMS_FCFA } from "@/lib/tarifs";
import { inviterTuteur, revoquerAcces } from "../../actions";
import { programmerSmsParent, rattacherEnfantParent } from "../actions";
import { CoordonneesTuteur } from "./coordonnees-tuteur";

type Parent = {
  id: string; nomComplet: string; telephone: string; email: string | null;
  accepteSms: boolean; utilisateurId: string | null; compteActif: boolean | null;
  profil: { nom: string; prenom: string; sexe: string | null; telephoneSecondaire: string | null; profession: string | null; employeur: string | null; adresse: string | null; quartier: string | null };
};
export function ActionsDossierParent({ parent, peutSms, peutInviter }: {
  parent: Parent; peutSms: boolean; peutInviter: boolean;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState<"sms" | "revoquer" | null>(null);
  const [enCours, lancer] = useTransition();
  const [titre, setTitre] = useState("");
  const [message, setMessage] = useState("");
  const [motif, setMotif] = useState("");
  const [confirme, setConfirme] = useState(false);
  const peutRevoquer = parent.utilisateurId && parent.compteActif !== false;

  function inviter() {
    lancer(async () => {
      const r = await inviterTuteur(parent.id);
      if (r.ok) {
        toast.success(r.message ?? "Invitation programmée.", {
          duration: 12000,
          description: r.code ? "Code d'activation : " + r.code + " — à transmettre au parent de manière sûre." : undefined,
        });
      } else toast.error(r.message ?? "Impossible de créer le code.");
      router.refresh();
    });
  }
  function envoyer() {
    if (!confirme) return;
    lancer(async () => {
      const r = await programmerSmsParent({ tuteurId: parent.id, titre, contenu: message, confirmationCout: true });
      toast[r.ok ? "success" : "error"](r.message);
      if (r.ok) {
        setOuvert(null); setTitre(""); setMessage(""); setConfirme(false);
        router.refresh();
      }
    });
  }
  function revoquer() {
    lancer(async () => {
      const r = await revoquerAcces(parent.id, motif);
      toast[r.ok ? "success" : "error"](r.message ?? "La révocation a échoué.");
      if (r.ok) { setOuvert(null); setMotif(""); router.refresh(); }
    });
  }
  return <>
    <div className="flex flex-wrap items-center gap-2">
      <CoordonneesTuteur
        tuteurId={parent.id}
        nomComplet={parent.nomComplet}
        telephone={parent.telephone}
        email={parent.email}
        accepteSms={parent.accepteSms}
        profil={parent.profil}
        variante="primaire"
      />
      {peutSms ? <Button variant="outline" size="sm"
        className="h-10 gap-2 rounded-xl border-slate-200 bg-white px-3.5 font-semibold shadow-none dark:border-border dark:bg-card"
        disabled={!parent.accepteSms} title={!parent.accepteSms ? "Le parent a refusé les SMS" : undefined}
        onClick={() => setOuvert("sms")}><Mail className="size-4" aria-hidden />Envoyer un SMS</Button> : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="outline" className="size-10 rounded-xl border-slate-200 bg-white shadow-none dark:border-border dark:bg-card" aria-label="Autres actions du compte parent"><MoreHorizontal className="size-5" aria-hidden /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {peutInviter ? <DropdownMenuItem disabled={enCours} onSelect={inviter}><KeyRound className="size-4" aria-hidden />{parent.compteActif === false ? "Réactiver et inviter" : parent.utilisateurId ? "Renvoyer un code" : "Inviter à l’application"}</DropdownMenuItem> : null}
          {peutRevoquer ? <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => setOuvert("revoquer")} className="text-red-700 focus:text-red-700"><ShieldOff className="size-4" aria-hidden />Révoquer l’accès</DropdownMenuItem></> : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <Dialog open={ouvert === "sms"} onOpenChange={v => { if (!v && !enCours) { setOuvert(null); setConfirme(false); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Envoyer un SMS à {parent.nomComplet}</DialogTitle><DialogDescription>Un SMS sera mis en file pour {parent.telephone}. Le coût est facturé par segment, uniquement après expédition effective.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="sms-titre-parent">Objet</Label><Input id="sms-titre-parent" value={titre} maxLength={100} onChange={e => setTitre(e.target.value)} placeholder="Information de l'établissement" /></div>
          <div className="space-y-1.5"><Label htmlFor="sms-corps-parent">Message</Label><Textarea id="sms-corps-parent" rows={4} value={message} maxLength={320} onChange={e => setMessage(e.target.value)} placeholder="Saisir le message destiné au parent…" /><p className="text-right text-xs text-muted-foreground">{message.length}/320 caractères</p></div>
          <label className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
            <input type="checkbox" className="mt-0.5" checked={confirme} onChange={e => setConfirme(e.target.checked)} />
            Je confirme l'envoi payant. Tarif indicatif : {COUT_SMS_FCFA} FCFA par segment. Plusieurs segments peuvent être facturés.
          </label>
        </div>
        <DialogFooter><Button variant="outline" disabled={enCours} onClick={() => setOuvert(null)}>Annuler</Button><Button disabled={enCours || !confirme || titre.trim().length < 3 || message.trim().length < 5} onClick={envoyer}><Send className="size-4" aria-hidden />{enCours ? "Programmation…" : "Confirmer l’envoi"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={ouvert === "revoquer"} onOpenChange={v => { if (!v && !enCours) setOuvert(null); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Révoquer l'accès parent</DialogTitle><DialogDescription>Les connexions seront révoquées ; les enfants et leur historique resteront liés au dossier.</DialogDescription></DialogHeader>
        <div className="space-y-1.5"><Label htmlFor="rev-motif-parent">Motif obligatoire</Label><Input id="rev-motif-parent" value={motif} onChange={e => setMotif(e.target.value)} placeholder="Préciser le motif…" /></div>
        <DialogFooter><Button variant="outline" disabled={enCours} onClick={() => setOuvert(null)}>Annuler</Button><Button variant="destructive" disabled={enCours || motif.trim().length < 3} onClick={revoquer}>Révoquer l’accès</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

export function AjouterEnfantParent({ tuteurId }: { tuteurId: string }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [enCours, lancer] = useTransition();
  const [matricule, setMatricule] = useState("");
  const [lien, setLien] = useState("PERE");
  const [confirme, setConfirme] = useState(false);
  function rattacher() {
    lancer(async () => {
      const r = await rattacherEnfantParent({ tuteurId, matricule, lien, confirmation: confirme });
      toast[r.ok ? "success" : "error"](r.message);
      if (r.ok) { setOuvert(false); setMatricule(""); setConfirme(false); router.refresh(); }
    });
  }
  return <>
    <Button size="sm" variant="outline" className="h-9 gap-2 rounded-xl border-slate-200 bg-white shadow-none dark:border-border dark:bg-card" onClick={() => setOuvert(true)}><UserPlus className="size-4" aria-hidden />Ajouter un enfant</Button>
    <Dialog open={ouvert} onOpenChange={v => { if (!enCours) setOuvert(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Rattacher un élève à ce parent</DialogTitle><DialogDescription>Le matricule identifie précisément l’élève existant. Cette opération crée un lien familial, sans donner automatiquement le droit de retirer l’enfant, d’accéder aux finances ou de devenir tuteur principal.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="parent-enfant-matricule">Matricule de l'élève</Label><Input id="parent-enfant-matricule" value={matricule} onChange={e => setMatricule(e.target.value)} placeholder="LGR-2025-..." /></div>
          <div className="space-y-1.5"><Label htmlFor="parent-enfant-lien">Lien de parenté</Label>
            <NativeSelect id="parent-enfant-lien" value={lien} onChange={e => setLien(e.target.value)}>
              <option value="PERE">Père</option><option value="MERE">Mère</option><option value="TUTEUR">Tuteur</option><option value="ONCLE">Oncle</option><option value="TANTE">Tante</option><option value="GRAND_PARENT">Grand-parent</option><option value="FRERE_SOEUR">Frère / sœur</option><option value="AUTRE">Autre</option>
            </NativeSelect>
          </div>
          <label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" className="mt-0.5" checked={confirme} onChange={e => setConfirme(e.target.checked)} />Je confirme que l’établissement a vérifié le lien familial avec cet élève.</label>
        </div>
        <DialogFooter><Button variant="outline" disabled={enCours} onClick={() => setOuvert(false)}>Annuler</Button><Button disabled={enCours || matricule.trim().length < 3 || !confirme} onClick={rattacher}>Rattacher l’enfant</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
