"use client";

import { useEffect, useState, useTransition } from "react";

import { BellRing, Check, CircleAlert, LoaderCircle, MessageSquare, Send, Smartphone, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { LigneTuteur } from "@/server/domain/parents";

import {
  type ApercuNotificationParent,
  apercuNotificationParent,
  type CanalIndividuel,
  envoyerNotificationParent,
} from "../actions-notification";

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
    return () => {
      actif = false;
      clearTimeout(timer);
    };
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
    setTitre("");
    setCorps("");
    setCanal("AUTO");
    setEstimation(null);
    setConfirmeCout(false);
    setCleEnvoi(null);
    setErreur(false);
    setCharge(false);
  }

  function envoyer() {
    if (
      !parent ||
      !devis ||
      devis.total === 0 ||
      enCours ||
      charge ||
      erreur ||
      !valide ||
      (devis.parSms > 0 && !confirmeCout)
    )
      return;
    const cle = cleEnvoi ?? crypto.randomUUID();
    setCleEnvoi(cle);
    demarrer(async () => {
      try {
        const r = await envoyerNotificationParent(parent.id, {
          titre,
          corps,
          canal,
          coutConfirmeFcfa: devis.coutFcfa,
          nombreConfirme: devis.total,
          cleEnvoi: cle,
        });
        if (r.ok) {
          toast.success(r.message);
          fermerApresSucces();
        } else {
          toast.error(r.message);
          setEstimation(null);
        }
      } catch {
        toast.error("Impossible de confirmer le dépôt. Vérifiez l’historique avant de renvoyer.");
      }
    });
  }

  function fermerApresSucces() {
    onFermer();
    setTitre("");
    setCorps("");
    setCanal("AUTO");
    setConfirmeCout(false);
    setEstimation(null);
    setCleEnvoi(null);
    setErreur(false);
  }

  const peutEnvoyer =
    valide && !!devis && devis.total > 0 && !enCours && !charge && !erreur && (devis.parSms === 0 || confirmeCout);

  return (
    <Dialog
      open={!!parent}
      onOpenChange={(value) => {
        if (!value) fermer();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-16px)] w-[calc(100vw-16px)] max-w-[calc(100vw-16px)] gap-0 overflow-y-auto rounded-2xl border border-border bg-card p-0 shadow-2xl sm:max-w-[820px]">
        <DialogHeader className="gap-1 border-b border-border bg-card px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2.5 text-lg font-bold text-foreground">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-succes text-primary-foreground">
              <BellRing className="size-5" />
            </span>
            Notifier un seul parent
          </DialogTitle>
          <DialogDescription className="text-xs leading-snug">
            Le message sera adressé uniquement à{" "}
            <strong className="text-foreground">{parent ? parent.prenom + " " + parent.nom : ""}</strong>, et non à
            toute la classe ni aux autres tuteurs.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 sm:gap-5">
          <section className="min-w-0 space-y-3" aria-label="Destinataire et canal">
            <div className="flex items-center gap-3 rounded-xl border border-succes-trait bg-succes-doux px-3 py-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-succes">
                <UserRound className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {parent?.prenom} {parent?.nom}
                </p>
                <p className="truncate text-xs text-muted-foreground">{parent?.telephone ?? "Numéro non renseigné"}</p>
              </div>
              <span className="ml-auto shrink-0 rounded-full bg-card px-2 py-0.5 text-xs font-semibold text-succes">
                1 parent
              </span>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-foreground">Canal d’envoi</p>
              <div role="group" aria-label="Choisir le canal de notification" className="grid grid-cols-2 gap-2">
                {CANAUX.map((option) => {
                  const Icon = option.icon;
                  const choisi = canal === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={choisi}
                      onClick={() => modifier("canal", option.id)}
                      className={
                        "flex min-h-[58px] min-w-0 flex-col justify-center gap-1 rounded-xl border px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 " +
                        (choisi
                          ? "border-succes-trait bg-succes-doux ring-1 ring-succes"
                          : "border-border bg-card hover:border-succes-trait")
                      }
                    >
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <Icon className="size-3.5 shrink-0 text-succes" /> <span className="min-w-0">{option.nom}</span>
                        {choisi && <Check className="ml-auto size-3.5 shrink-0 text-succes" />}
                      </span>
                      <span className="text-xs leading-tight text-muted-foreground">{option.aide}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Les SMS ne sont proposés qu’en présence d’un numéro et du consentement. L’envoi reste soumis aux
              permissions du personnel.
            </p>
          </section>

          <section className="min-w-0 space-y-3" aria-label="Composer la notification">
            <div className="space-y-1.5">
              <label htmlFor="parent-notif-objet" className="text-xs font-semibold text-foreground">
                Objet du message
              </label>
              <Input
                id="parent-notif-objet"
                value={titre}
                onChange={(e) => modifier("titre", e.target.value)}
                placeholder="Ex. : Rendez-vous avec la direction"
                maxLength={80}
                className="h-10 rounded-lg border-border bg-muted/40"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="parent-notif-message" className="text-xs font-semibold text-foreground">
                  Message
                </label>
                <span className="text-xs tabular-nums text-muted-foreground">{corps.length}/600</span>
              </div>
              <Textarea
                id="parent-notif-message"
                value={corps}
                onChange={(e) => modifier("corps", e.target.value)}
                placeholder="Rédigez votre message au parent concerné…"
                maxLength={600}
                rows={3}
                className="min-h-[88px] resize-y rounded-lg border-border bg-muted/40"
              />
            </div>
            <div aria-live="polite">
              {!valide ? (
                <p className="rounded-xl border border-info-trait bg-info-doux px-3 py-2.5 text-xs text-info">
                  Saisissez l’objet et le message pour calculer le canal disponible et le prix éventuel.
                </p>
              ) : charge || (!devis && !erreur) ? (
                <p className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" /> Vérification du destinataire…
                </p>
              ) : erreur ? (
                <p
                  role="alert"
                  className="flex gap-2 rounded-xl border border-danger-trait bg-danger-doux px-3 py-2.5 text-xs text-danger"
                >
                  <CircleAlert className="size-4 shrink-0" /> Impossible de calculer le devis. Aucun envoi autorisé.
                </p>
              ) : devis?.total === 0 ? (
                <p
                  role="status"
                  className="flex gap-2 rounded-xl border border-alerte-trait bg-alerte-doux px-3 py-2.5 text-xs text-alerte"
                >
                  <CircleAlert className="size-4 shrink-0" /> {devis.avertissement}
                </p>
              ) : devis ? (
                <div className="space-y-1.5 rounded-xl border border-succes-trait bg-succes-doux px-3 py-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-foreground">
                      {devis.total} notification{devis.total > 1 ? "s" : ""} prévue{devis.total > 1 ? "s" : ""}
                    </strong>
                    <strong className="tabular-nums text-succes">{devis.coutFcfa.toLocaleString("fr-FR")} FCFA</strong>
                  </div>
                  <p className="text-muted-foreground">
                    {devis.parPush} PUSH · {devis.parSms} SMS · {devis.dansApplication} interne
                  </p>
                  {devis.avertissement && <p className="text-alerte">{devis.avertissement}</p>}
                  {devis.parSms > 0 && (
                    <label className="flex cursor-pointer items-start gap-2 border-t border-succes-trait pt-2 leading-snug text-foreground">
                      <input
                        className="mt-0.5 size-4 shrink-0 accent-emerald-600"
                        type="checkbox"
                        checked={confirmeCout}
                        onChange={(e) => setConfirmeCout(e.target.checked)}
                      />
                      <span>
                        Je confirme l’envoi de {devis.parSms} SMS et son coût maximal estimé à{" "}
                        <strong>{devis.coutFcfa.toLocaleString("fr-FR")} FCFA</strong>.
                      </span>
                    </label>
                  )}
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <DialogFooter className="!m-0 !flex-row !justify-end gap-2 border-t border-border bg-muted/40 px-5 py-3">
          <Button type="button" variant="outline" disabled={enCours} onClick={fermer}>
            Annuler
          </Button>
          <Button
            type="button"
            className="bg-succes text-primary-foreground hover:bg-succes/90"
            disabled={!peutEnvoyer}
            onClick={envoyer}
          >
            <Send className="size-3.5" /> {enCours ? "Enregistrement…" : "Envoyer au parent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
