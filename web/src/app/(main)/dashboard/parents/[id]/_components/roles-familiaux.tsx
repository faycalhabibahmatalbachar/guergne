"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Pencil, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { mettreAJourRolesFamiliaux } from "../actions";

type Roles = {
  eleveId: string; tuteurId: string; enfant: string; lien: string;
  estPrincipal: boolean; estTuteurLegal: boolean; estResponsableFinancier: boolean;
  estContactUrgence: boolean; autoriseRetrait: boolean;
};

const liens: Array<[string, string]> = [
  ["PERE", "Père"], ["MERE", "Mère"], ["TUTEUR", "Tuteur"],
  ["ONCLE", "Oncle"], ["TANTE", "Tante"], ["GRAND_PARENT", "Grand-parent"],
  ["FRERE_SOEUR", "Frère / sœur"], ["AUTRE", "Autre"],
];

export function RolesFamiliaux({ roles }: { roles: Roles }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [enCours, demarrer] = useTransition();
  const [lien, setLien] = useState(roles.lien);
  const [legal, setLegal] = useState(roles.estTuteurLegal);
  const [finances, setFinances] = useState(roles.estResponsableFinancier);
  const [urgence, setUrgence] = useState(roles.estContactUrgence);
  const [retrait, setRetrait] = useState(roles.autoriseRetrait);
  const [motif, setMotif] = useState("");
  const [verifie, setVerifie] = useState(false);

  function ouvrir() {
    setLien(roles.lien);
    setLegal(roles.estTuteurLegal);
    setFinances(roles.estResponsableFinancier);
    setUrgence(roles.estContactUrgence);
    setRetrait(roles.autoriseRetrait);
    setMotif("");
    setVerifie(false);
    setOuvert(true);
  }
  function enregistrer() {
    if (!verifie || enCours || motif.trim().length < 10) return;
    demarrer(async () => {
      const resultat = await mettreAJourRolesFamiliaux({
        tuteurId: roles.tuteurId, eleveId: roles.eleveId,
        lien, estTuteurLegal: legal, estResponsableFinancier: finances,
        estContactUrgence: urgence, autoriseRetrait: retrait,
        motif: motif.trim(), piecesVerifiees: true,
      });
      toast[resultat.ok ? "success" : "error"](resultat.message);
      if (resultat.ok) { setOuvert(false); router.refresh(); }
    });
  }
  const option = (id: string, titre: string, description: string, checked: boolean, changer: (v: boolean) => void) =>
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 dark:border-border">
      <Checkbox id={id} checked={checked} onCheckedChange={v => changer(v === true)} className="mt-0.5" />
      <span className="min-w-0"><span className="block text-sm font-semibold">{titre}</span><span className="mt-0.5 block text-xs leading-relaxed text-slate-500 dark:text-muted-foreground">{description}</span></span>
    </label>;

  return <>
    <Button type="button" size="sm" variant="outline" onClick={ouvrir} className="h-8 gap-1.5 rounded-lg border-slate-200 bg-white px-3 text-xs shadow-none dark:border-border dark:bg-card">
      <Pencil className="size-3.5" aria-hidden />Gérer les rôles
    </Button>
    <Dialog open={ouvert} onOpenChange={v => { if (!enCours) setOuvert(v); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <span className="mb-1 inline-flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950"><ShieldCheck className="size-5" aria-hidden /></span>
          <DialogTitle>Vérifier les responsabilités familiales</DialogTitle>
          <DialogDescription>
            Élève : <strong>{roles.enfant}</strong>. Toute modification doit reposer sur une vérification de l'établissement.
            Le statut de responsable principal est conservé ; son transfert nécessite un autre parcours de contrôle.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={"role-lien-" + roles.eleveId}>Lien avec l'élève</Label>
            <NativeSelect id={"role-lien-" + roles.eleveId} value={lien} onChange={e => setLien(e.target.value)} className="h-10 w-full rounded-lg">
              {liens.map(([valeur, label]) => <option key={valeur} value={valeur}>{label}</option>)}
            </NativeSelect>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950">
            Responsable principal : <strong>{roles.estPrincipal ? "Oui, inchangé" : "Non, inchangé"}</strong>
          </div>
          <div className="grid gap-2">
            {option("role-legal-" + roles.eleveId, "Tuteur légal", "Représentation légale vérifiée par l'établissement", legal, setLegal)}
            {option("role-finances-" + roles.eleveId, "Responsable financier", "Référent des obligations de paiement", finances, setFinances)}
            {option("role-urgence-" + roles.eleveId, "Contact d'urgence", "Peut être contacté lors d'une urgence scolaire", urgence, setUrgence)}
            {option("role-retrait-" + roles.eleveId, "Autorisé au retrait", "Peut venir chercher l'élève selon les règles de l'établissement", retrait, setRetrait)}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={"roles-motif-" + roles.eleveId}>Motif de la vérification (obligatoire)</Label>
            <Textarea id={"roles-motif-" + roles.eleveId} rows={2} maxLength={300} value={motif} onChange={e => setMotif(e.target.value)} placeholder="Préciser les pièces ou les informations contrôlées…" />
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <Checkbox checked={verifie} onCheckedChange={v => setVerifie(v === true)} className="mt-0.5" />
            <span>Je confirme avoir vérifié le lien familial et les justificatifs nécessaires pour les autorisations sélectionnées.</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={enCours} onClick={() => setOuvert(false)}>Annuler</Button>
          <Button disabled={enCours || !verifie || motif.trim().length < 10} onClick={enregistrer} className="gap-2 bg-emerald-700 text-white hover:bg-emerald-800">
            <ClipboardCheck className="size-4" aria-hidden />{enCours ? "Enregistrement…" : "Enregistrer et journaliser"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
