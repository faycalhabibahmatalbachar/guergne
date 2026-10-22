"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowRight, CheckCircle2, Download,
  Eye, LoaderCircle, RefreshCcw, Send, ShieldCheck, Smartphone, Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { COUT_SMS_FCFA } from "@/lib/tarifs";
import {
  confirmerInvitationsClasse, previsualiserInvitationsClasse,
  type ApercuInvitationsClasse,
} from "../actions-invitations-classe";

interface Classe { id: string; libelle: string }

function csvCell(value: string): string {
  const safe = /^[=+@\-\t\r]/.test(value.trimStart()) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}
function exporterApercu(apercu: ApercuInvitationsClasse) {
  const lignes = [
    ["Prénom", "Nom", "Téléphone", "Canal", "Statut"],
    ...apercu.eligibles.map(p => [p.prenom, p.nom, p.telephone, "SMS", "Sans compte"]),
  ];
  const csv = "\uFEFF" + lignes.map(r => r.map(csvCell).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = "invitations-parents-classe.csv";
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  URL.revokeObjectURL(url);
}

export function InvitationClasse({
  classes, sansCompte,
}: {
  classes: Classe[];
  sansCompte: number;
}) {
  const routeur = useRouter();
  const [classeId, setClasseId] = useState("");
  const [apercu, setApercu] = useState<ApercuInvitationsClasse | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const [dialogueOuvert, setDialogueOuvert] = useState(false);
  const [enCours, demarrer] = useTransition();

  const classe = classes.find(c => c.id === classeId);

  function reinitialiser() {
    if (enCours) return;
    setClasseId("");
    setApercu(null);
    setConfirmation(false);
    setDialogueOuvert(false);
  }

  function previsualiser() {
    if (!classeId) return;
    const choix = classeId;
    demarrer(async () => {
      const r = await previsualiserInvitationsClasse(choix);
      if (choix !== classeId) return;
      if (!r.ok) {
        setApercu(null);
        toast.error(r.message);
        return;
      }
      setApercu(r.apercu);
      toast.success("Destinataires et coût indicatif calculés.");
    });
  }

  function envoyer() {
    if (!apercu || !confirmation) return;
    const original = apercu;
    demarrer(async () => {
      const r = await confirmerInvitationsClasse({
        classeId: original.classeId,
        empreinte: original.empreinte,
        confirmation: true,
        canal: "SMS",
        portee: "PRINCIPAUX_SANS_COMPTE",
      });
      toast[r.ok ? "success" : "error"](r.message, { duration: 8500 });
      setDialogueOuvert(false);
      setConfirmation(false);
      setApercu(null);
      routeur.refresh();
    });
  }

  return (
    <section aria-labelledby="invitations-classe-titre" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 dark:border-border sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <Send className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="invitations-classe-titre" className="text-[15px] font-bold leading-snug text-[#11264b] dark:text-foreground sm:text-[16px]">
              Invitation des responsables par classe
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-muted-foreground">
              Sélectionnez une classe et vérifiez les destinataires avant de créer leurs accès.
            </p>
          </div>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold tabular-nums text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {sansCompte.toLocaleString("fr-FR")} sans compte
        </span>
      </header>

      <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-1.5">
            <Label htmlFor="invitation-classe-id" className="text-xs font-semibold text-slate-700 dark:text-foreground">Classe à inviter</Label>
            <NativeSelect id="invitation-classe-id" aria-label="Classe à inviter" className="h-11 w-full rounded-xl border-slate-200 bg-white text-sm dark:border-border dark:bg-card"
              value={classeId} disabled={enCours}
              onChange={e => { setClasseId(e.target.value); setApercu(null); setConfirmation(false); }}>
              <option value="">Sélectionnez une classe…</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.libelle}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invitation-classe-canal" className="text-xs font-semibold text-slate-700 dark:text-foreground">Canal d’invitation</Label>
            <NativeSelect id="invitation-classe-canal" aria-label="Canal d’invitation" className="h-11 w-full rounded-xl border-slate-200 bg-white text-sm dark:border-border dark:bg-card" value="SMS" onChange={() => {}}>
              <option value="SMS">SMS automatique · payant</option>
              <option value="APP" disabled>Application (compte requis)</option>
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invitation-classe-cibles" className="text-xs font-semibold text-slate-700 dark:text-foreground">Responsables ciblés</Label>
            <div id="invitation-classe-cibles" className="flex min-h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-[13px] font-medium text-slate-700 dark:border-border dark:bg-muted/30 dark:text-foreground">
              Principaux · sans compte · SMS accepté
            </div>
          </div>
        </div>

        {apercu ? (
          <div className="space-y-3" aria-live="polite">
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Tuteurs principaux", apercu.totalPrincipaux.toLocaleString("fr-FR")],
                ["Invitations éligibles", apercu.eligibles.length.toLocaleString("fr-FR")],
                ["Exclus", (apercu.dejaAvecCompte + apercu.sansConsentementSms).toLocaleString("fr-FR")],
                ["Coût SMS indicatif max.", apercu.coutMaxFcfa.toLocaleString("fr-FR") + " FCFA"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-200/90 bg-slate-50/70 px-3.5 py-3 dark:border-border dark:bg-muted/25">
                  <p className="text-[11px] font-medium text-slate-500 dark:text-muted-foreground">{label}</p>
                  <p className="mt-1 text-[18px] font-bold tabular-nums text-[#142750] dark:text-foreground">{value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-slate-100 bg-white px-3.5 py-3 dark:border-border dark:bg-card">
              <p className="text-xs font-semibold text-slate-800 dark:text-foreground"><Eye className="mr-1.5 inline size-4" aria-hidden />Aperçu des destinataires · {classe?.libelle}</p>
              <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-slate-100 dark:border-border">
                {apercu.eligibles.length ? (
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-muted dark:text-muted-foreground">
                      <tr><th className="px-3 py-2 font-medium">Responsable</th><th className="px-3 py-2 font-medium">Téléphone</th><th className="px-3 py-2 font-medium">Canal</th></tr>
                    </thead>
                    <tbody>{apercu.eligibles.slice(0, 30).map(p => <tr key={p.id} className="border-t border-slate-100 dark:border-border">
                      <td className="px-3 py-2 font-medium">{p.prenom} {p.nom}</td><td className="px-3 py-2 tabular-nums">{p.telephone}</td><td className="px-3 py-2">SMS</td>
                    </tr>)}</tbody>
                  </table>
                ) : <p className="p-3 text-xs text-slate-500">Aucun destinataire éligible pour cette classe.</p>}
              </div>
              {apercu.eligibles.length > 30 ? <p className="mt-1.5 text-[11px] text-slate-500">30 premiers affichés sur {apercu.eligibles.length} · l’export contient la liste complète.</p> : null}
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                {apercu.dejaAvecCompte} avec compte existant ; {apercu.sansConsentementSms} sans consentement SMS.
                Ces derniers ne recevront rien de cette opération.
              </p>
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3 text-xs leading-relaxed text-slate-600 dark:border-border dark:bg-muted/15 dark:text-muted-foreground">
            <Users className="mr-1.5 inline size-4" aria-hidden />Choisissez une classe, puis cliquez sur <strong>Prévisualiser</strong> pour connaître le nombre exact de tuteurs concernés et le coût maximal indicatif.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-border">
          <Button variant="outline" className="h-10 gap-2 rounded-xl border-slate-200 bg-white px-4 shadow-none dark:border-border dark:bg-card"
            disabled={!classeId || enCours} onClick={previsualiser}>
            {enCours ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Eye className="size-4" aria-hidden />}Prévisualiser
          </Button>
          <Button className="h-10 gap-2 rounded-xl bg-emerald-700 px-4 font-semibold text-white hover:bg-emerald-800" disabled={!apercu?.eligibles.length || enCours}
            onClick={() => { setConfirmation(false); setDialogueOuvert(true); }}>
            <Send className="size-4" aria-hidden />Envoyer les invitations<ArrowRight className="size-4" aria-hidden />
          </Button>
          <Button variant="outline" className="h-10 gap-2 rounded-xl border-slate-200 bg-white px-4 shadow-none dark:border-border dark:bg-card"
            disabled={!apercu?.eligibles.length || enCours} onClick={() => { if (apercu) exporterApercu(apercu); }}>
            <Download className="size-4" aria-hidden />Exporter la liste
          </Button>
          <Button variant="ghost" className="h-10 gap-2 text-slate-600 dark:text-muted-foreground" disabled={enCours || (!classeId && !apercu)} onClick={reinitialiser}>
            <RefreshCcw className="size-4" aria-hidden />Réinitialiser
          </Button>
        </div>
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          Le SMS coûte {COUT_SMS_FCFA} FCFA par segment. Le montant est indicatif, seuls les messages réellement expédiés sont facturés. Les seconds responsables s’invitent individuellement ; une application sans compte ne peut pas recevoir de notification push.
        </p>
      </div>

      <Dialog open={dialogueOuvert} onOpenChange={v => { if (!enCours) { setDialogueOuvert(v); if (!v) setConfirmation(false); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirmer les invitations SMS</DialogTitle>
            <DialogDescription>Les comptes seront créés et les codes mis en file d’envoi. Cette action ne peut pas être annulée après confirmation.</DialogDescription>
          </DialogHeader>
          {apercu ? <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-border dark:bg-muted/20">
              <p><span className="text-slate-500">Classe :</span> <strong>{classe?.libelle}</strong></p>
              <p className="mt-2"><span className="text-slate-500">Destinataires :</span> <strong>{apercu.eligibles.length} tuteurs principaux</strong></p>
              <p className="mt-2"><span className="text-slate-500">Canal :</span> <strong>SMS</strong></p>
              <p className="mt-2"><span className="text-slate-500">Coût maximal indicatif :</span> <strong className="text-amber-800">{apercu.coutMaxFcfa.toLocaleString("fr-FR")} FCFA</strong></p>
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-950">
              <Checkbox checked={confirmation} onCheckedChange={v => setConfirmation(v === true)} className="mt-0.5" />
              J’autorise la création des accès et la mise en file de SMS payants pour ces responsables.
            </label>
          </div> : null}
          <DialogFooter>
            <Button variant="outline" disabled={enCours} onClick={() => setDialogueOuvert(false)}>Annuler</Button>
            <Button disabled={enCours || !confirmation || !apercu?.eligibles.length} onClick={envoyer} className="gap-2 bg-emerald-700 text-white hover:bg-emerald-800">
              {enCours ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}
              Confirmer et envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
