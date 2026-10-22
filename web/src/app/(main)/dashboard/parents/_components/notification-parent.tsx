"use client";

import { useEffect, useState, useTransition } from "react";
import { BellRing, Check, CircleAlert, LoaderCircle, MessageSquare, Send, Smartphone, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { LigneTuteur } from "@/server/domain/parents";
import { apercuNotificationParent, envoyerNotificationParent, type ApercuNotificationParent, type CanalIndividuel } from "../actions-notification";

const CANAUX = [
  { id: "AUTO", nom: "Automatique", aide: "Selon les règles de l’école", icon: BellRing },
  { id: "APP", nom: "Application", aide: "Push ou boîte interne", icon: Smartphone },
  { id: "SMS", nom: "SMS", aide: "Avec consentement", icon: MessageSquare },
  { id: "APP_ET_SMS", nom: "Application + SMS", aide: "Deux canaux disponibles", icon: Send },
] as const;

export type DestinataireParent = Pick<LigneTuteur, "id" | "nom" | "prenom" | "telephone">;

export function NotificationParent({ parent, onFermer }: { parent: DestinataireParent | null; onFermer: () => void }) {
  const [titre, setTitre] = useState("");
  const [corps, setCorps] = useState("");
  const [canal, setCanal] = useState<CanalIndividuel>("AUTO");
  const [estimation, setEstimation] = useState<{ signature: string; valeur: ApercuNotificationParent } | null>(null);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState(false);
  const [confirmeCout, setConfirmeCout] = useState(false);
  const [cleEnvoi, setCleEnvoi] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const valide = titre.trim().length >= 3 && corps.trim().length >= 5;
  const signature = [parent?.id, titre, corps, canal].join("|");
  const devis = estimation?.signature === signature ? estimation.valeur : null;

  useEffect(() => {
    if (!parent || !valide) return;
    let actif = true;
    const timer = setTimeout(async () => {
      if (!actif) return;
      setCharge(true);
      setErreur(false);
      try {
        const valeur = await apercuNotificationParent(parent.id, titre, corps, canal);
        if (actif) setEstimation({ signature, valeur });
      } catch {
        if (actif) setErreur(true);
      } finally {
        if (actif) setCharge(false);
      }
    }, 400);
    return () => { actif = false; clearTimeout(timer); };
  }, [parent?.id, titre, corps, canal, valide, signature]);

  function modifier(quoi: "titre" | "corps" | "canal", valeur: string) {
    if (quoi === "titre") setTitre(valeur);
    else if (quoi === "corps") setCorps(valeur);
    else setCanal(valeur as CanalIndividuel);
    setEstimation(null);
    setErreur(false);
    setConfirmeCout(false);
    setCleEnvoi(null);
  }

  function fermer() {
    if (enCours) return;
    onFermer();
    setTitre(""); setCorps(""); setCanal("AUTO");
    setEstimation(null); setConfirmeCout(false); setCleEnvoi(null); setErreur(false); setCharge(false);
  }

  function envoyer() {
    if (!parent || !devis || devis.total === 0 || enCours || charge || erreur || !valide || (devis.parSms > 0 && !confirmeCout)) return;
    const cle = cleEnvoi ?? crypto.randomUUID();
    setCleEnvoi(cle);
    demarrer(async () => {
      try {
        const r = await envoyerNotificationParent(parent.id, {
          titre, corps, canal, coutConfirmeFcfa: devis.coutFcfa,
          nombreConfirme: devis.total, cleEnvoi: cle,
        });
        if (r.ok) { toast.success(r.message); fermerApresSucces(); }
        else { toast.error(r.message); setEstimation(null); }
      } catch {
        toast.error("Impossible de confirmer le dépôt. Vérifiez l’historique avant de renvoyer.");
      }
    });
  }

  function fermerApresSucces() {
    onFermer();
    setTitre(""); setCorps(""); setCanal("AUTO"); setConfirmeCout(false);
    setEstimation(null); setCleEnvoi(null); setErreur(false);
  }

  const peutEnvoyer = valide && !!devis && devis.total > 0 && !enCours && !charge && !erreur &&
    (devis.parSms === 0 || confirmeCout);

  return (
    <Dialog open={!!parent} onOpenChange={value => { if (!value) fermer(); }}>
      <DialogContent className="max-h-[calc(100dvh-16px)] w-[calc(100vw-16px)] max-w-[calc(100vw-16px)] gap-0 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl sm:max-w-[820px] dark:border-slate-800 dark:bg-slate-900">
        <DialogHeader className="gap-1 border-b border-slate-200 bg-gradient-to-r from-emerald-50 via-blue-50/40 to-white px-5 py-4 pr-12 dark:border-slate-800 dark:from-emerald-950/30 dark:via-slate-900 dark:to-slate-900">
          <DialogTitle className="flex items-center gap-2.5 text-lg font-bold text-[#102449] dark:text-white">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white"><BellRing className="size-5" /></span>
            Notifier un seul parent
          </DialogTitle>
          <DialogDescription className="text-xs leading-snug">
            Le message sera adressé uniquement à <strong className="text-slate-800 dark:text-slate-100">{parent ? parent.prenom + " " + parent.nom : ""}</strong>, et non à toute la classe ni aux autres tuteurs.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 sm:gap-5">
          <section className="min-w-0 space-y-3" aria-label="Destinataire et canal">
            <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-emerald-700 dark:bg-slate-800"><UserRound className="size-4" /></span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{parent?.prenom} {parent?.nom}</p>
                <p className="truncate text-xs text-slate-500">{parent?.telephone ?? "Numéro non renseigné"}</p>
              </div>
              <span className="ml-auto shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-slate-800 dark:text-emerald-300">1 parent</span>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Canal d’envoi</p>
              <div role="group" aria-label="Choisir le canal de notification" className="grid grid-cols-2 gap-2">
                {CANAUX.map(option => {
                  const Icon = option.icon;
                  const choisi = canal === option.id;
                  return <button key={option.id} type="button" aria-pressed={choisi} onClick={() => modifier("canal", option.id)}
                    className={"flex min-h-[58px] min-w-0 flex-col justify-center gap-1 rounded-xl border px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 " +
                      (choisi ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-950/30" : "border-slate-200 bg-white hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-900")}>
                    <span className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-800 dark:text-white">
                      <Icon className="size-3.5 shrink-0 text-emerald-600" /> <span className="min-w-0">{option.nom}</span>
                      {choisi && <Check className="ml-auto size-3.5 shrink-0 text-emerald-600" />}
                    </span>
                    <span className="text-[11px] leading-tight text-slate-500 dark:text-slate-400">{option.aide}</span>
                  </button>;
                })}
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Les SMS ne sont proposés qu’en présence d’un numéro et du consentement. L’envoi reste soumis aux permissions du personnel.
            </p>
          </section>

          <section className="min-w-0 space-y-3" aria-label="Composer la notification">
            <div className="space-y-1.5">
              <label htmlFor="parent-notif-objet" className="text-xs font-semibold text-slate-800 dark:text-white">Objet du message</label>
              <Input id="parent-notif-objet" value={titre} onChange={e => modifier("titre", e.target.value)}
                placeholder="Ex. : Rendez-vous avec la direction" maxLength={80}
                className="h-10 rounded-lg border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="parent-notif-message" className="text-xs font-semibold text-slate-800 dark:text-white">Message</label>
                <span className="text-[11px] tabular-nums text-slate-500">{corps.length}/600</span>
              </div>
              <Textarea id="parent-notif-message" value={corps} onChange={e => modifier("corps", e.target.value)}
                placeholder="Rédigez votre message au parent concerné…" maxLength={600} rows={3}
                className="min-h-[88px] resize-y rounded-lg border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800" />
            </div>
            <div aria-live="polite">
              {!valide ? <p className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                Saisissez l’objet et le message pour calculer le canal disponible et le prix éventuel.
              </p> : charge || (!devis && !erreur) ? <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800">
                <LoaderCircle className="size-4 animate-spin" /> Vérification du destinataire…
              </p> : erreur ? <p role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
                <CircleAlert className="size-4 shrink-0" /> Impossible de calculer le devis. Aucun envoi autorisé.
              </p> : devis?.total === 0 ? <p role="status" className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                <CircleAlert className="size-4 shrink-0" /> {devis.avertissement}
              </p> : devis ? <div className="space-y-1.5 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 text-xs dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-slate-900 dark:text-white">{devis.total} notification{devis.total > 1 ? "s" : ""} prévue{devis.total > 1 ? "s" : ""}</strong>
                  <strong className="tabular-nums text-emerald-700 dark:text-emerald-300">{devis.coutFcfa.toLocaleString("fr-FR")} FCFA</strong>
                </div>
                <p className="text-slate-600 dark:text-slate-300">{devis.parPush} PUSH · {devis.parSms} SMS · {devis.dansApplication} interne</p>
                {devis.avertissement && <p className="text-amber-700 dark:text-amber-300">{devis.avertissement}</p>}
                {devis.parSms > 0 && <label className="flex cursor-pointer items-start gap-2 border-t border-emerald-200 pt-2 leading-snug text-slate-800 dark:border-emerald-800 dark:text-slate-200">
                  <input className="mt-0.5 size-4 shrink-0 accent-emerald-600" type="checkbox" checked={confirmeCout} onChange={e => setConfirmeCout(e.target.checked)} />
                  <span>Je confirme l’envoi de {devis.parSms} SMS et son coût maximal estimé à <strong>{devis.coutFcfa.toLocaleString("fr-FR")} FCFA</strong>.</span>
                </label>}
              </div> : null}
            </div>
          </section>
        </div>

        <DialogFooter className="!m-0 !flex-row !justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
          <Button type="button" variant="outline" className="h-9 rounded-lg" disabled={enCours} onClick={fermer}>Annuler</Button>
          <Button type="button" className="h-9 gap-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800" disabled={!peutEnvoyer} onClick={envoyer}>
            <Send className="size-3.5" /> {enCours ? "Enregistrement…" : "Envoyer au parent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
