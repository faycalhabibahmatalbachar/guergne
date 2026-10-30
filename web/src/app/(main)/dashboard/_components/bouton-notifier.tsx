"use client";

import { useEffect, useState, useTransition } from "react";

import {
  AlertCircle,
  BellRing,
  Check,
  LoaderCircle,
  MessageSquare,
  Send,
  ShieldCheck,
  Smartphone,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  type ApercuCanalClasse,
  apercuClasseCanal,
  apercuElevesCanal,
  type CanalClasse,
  notifierClasseCanal,
  notifierElevesCanal,
} from "../_actions/notifier-classe-canal";
import { ClasseNotificationDialog } from "./classe-notification-dialog";

type Cible =
  | { type: "eleve"; id: string; nom: string }
  | { type: "classe"; id: string; nom: string }
  | { type: "selection"; ids: string[]; nom: string };
type BoutonNotifierProps = {
  cible: Cible;
  variante?: "default" | "outline" | "ghost";
  libelle?: string;
  contexteEleves?: boolean;
  contexteClasses?: boolean;
};

const CANAUX = [
  { value: "AUTO", titre: "Automatique", detail: "Selon la politique du lycée", icon: BellRing },
  { value: "APP", titre: "Application", detail: "Push ou boîte interne, sans SMS", icon: Smartphone },
  { value: "SMS", titre: "SMS uniquement", detail: "Aux numéros ayant donné leur accord", icon: MessageSquare },
  { value: "APP_ET_SMS", titre: "Application + SMS", detail: "Les deux canaux si disponibles", icon: Send },
] as const;

export function BoutonNotifier(props: BoutonNotifierProps) {
  if (props.contexteClasses && props.cible.type === "classe") {
    return <ClasseNotificationDialog cible={props.cible} variante={props.variante} libelle={props.libelle} />;
  }
  return <FenetreNotifier {...props} />;
}

function FenetreNotifier({
  cible,
  variante = "outline",
  libelle = "Prévenir les parents",
  contexteEleves = false,
}: BoutonNotifierProps) {
  const [ouvert, setOuvert] = useState(false);
  const [canal, setCanal] = useState<CanalClasse>("AUTO");
  const [titre, setTitre] = useState("");
  const [corps, setCorps] = useState("");
  const [confirmeCout, setConfirmeCout] = useState(false);
  const [apercu, setApercu] = useState<ApercuCanalClasse | null>(null);
  const [chargeApercu, setChargeApercu] = useState(false);
  const [erreurApercu, setErreurApercu] = useState(false);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [enCours, lancer] = useTransition();
  const signature = cible.type === "selection" ? cible.ids.join(",") : cible.id;

  useEffect(() => {
    if (!ouvert) return;
    let actif = true;
    setApercu(null);
    setErreurApercu(false);
    setChargeApercu(true);
    const timer = setTimeout(async () => {
      try {
        const info =
          cible.type === "classe"
            ? await apercuClasseCanal(cible.id, titre || "Message", corps || "…", canal)
            : await apercuElevesCanal(
                cible.type === "eleve" ? [cible.id] : cible.ids,
                titre || "Message",
                corps || "…",
                canal,
              );
        if (actif) setApercu(info);
      } catch {
        if (actif) {
          setApercu(null);
          setErreurApercu(true);
        }
      } finally {
        if (actif) setChargeApercu(false);
      }
    }, 350);
    return () => {
      actif = false;
      clearTimeout(timer);
    };
    // signature stabilise la sélection, même si le parent reçoit un nouvel objet cible
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert, canal, titre, corps, cible.type, signature]);

  function changerCanal(mode: CanalClasse) {
    setCanal(mode);
    setConfirmeCout(false);
  }

  function fermer(value: boolean) {
    if (enCours) return;
    setOuvert(value);
    if (!value) {
      setConfirmeCout(false);
      setErreurs({});
    }
  }

  function envoyer() {
    if (!apercu || chargeApercu || erreurApercu || apercu.total === 0) {
      toast.error("Aucun destinataire confirmé pour ce canal.");
      return;
    }
    if (apercu.parSms > 0 && !confirmeCout) {
      toast.error("Confirmez le coût estimé des SMS avant l'envoi.");
      return;
    }
    if (titre.trim().length < 3 || corps.trim().length < 5) {
      toast.error("Complétez l'objet et le message.");
      return;
    }
    setErreurs({});
    lancer(async () => {
      try {
        const options = {
          titre,
          corps,
          canal,
          plafondCoutFcfa: apercu.coutFcfa,
          plafondNotifications: apercu.total,
        };
        const result =
          cible.type === "classe"
            ? await notifierClasseCanal(cible.id, options)
            : await notifierElevesCanal(cible.type === "eleve" ? [cible.id] : cible.ids, options);
        if (result.ok) {
          toast.success(result.message ?? "Notifications déposées dans la file.");
          setOuvert(false);
          setTitre("");
          setCorps("");
          setCanal("AUTO");
          setConfirmeCout(false);
        } else {
          setErreurs(result.erreurs ?? {});
          toast.error(result.message ?? "Envoi non confirmé.");
        }
      } catch {
        toast.error("Impossible de confirmer l'envoi. Vérifiez le journal avant de réessayer.");
      }
    });
  }

  const envoiPossible =
    !enCours &&
    !chargeApercu &&
    !erreurApercu &&
    Boolean(apercu?.total) &&
    titre.trim().length >= 3 &&
    corps.trim().length >= 5 &&
    (!apercu?.parSms || confirmeCout);
  const description =
    cible.type === "eleve"
      ? `Responsables de ${cible.nom}`
      : cible.type === "classe"
        ? `Responsables de la classe ${cible.nom}`
        : `Responsables des ${cible.ids.length} élèves sélectionnés`;

  return (
    <Dialog open={ouvert} onOpenChange={fermer}>
      <DialogTrigger asChild>
        <Button
          variant={variante}
          size="sm"
          className={
            contexteEleves
              ? "h-9 gap-2 rounded-lg border-info-trait bg-info-doux px-3 font-semibold text-info hover:bg-info-doux/90"
              : "h-9 gap-2 rounded-lg font-semibold"
          }
        >
          <BellRing className="size-4" aria-hidden /> {libelle}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[min(92dvh,850px)] w-[calc(100vw-1.25rem)] max-w-[calc(100vw-1.25rem)] flex-col gap-0 overflow-hidden rounded-2xl border border-border bg-card p-0 shadow-2xl sm:max-w-[min(870px,calc(100vw-2.5rem))]">
        <DialogHeader className="shrink-0 border-b border-border bg-muted/40 px-5 py-4 pr-12 dark:bg-muted/30">
          <DialogTitle className="flex items-center gap-3 text-lg font-bold tracking-tight">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <BellRing className="size-5" aria-hidden />
            </span>
            Prévenir les parents
          </DialogTitle>
          <DialogDescription className="pl-[52px] text-xs leading-5 text-muted-foreground">
            {description} · Choisissez un canal et vérifiez le devis avant d'envoyer.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="grid min-w-0 gap-5 md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <section aria-label="Choix du canal" className="min-w-0">
              <h3 className="text-sm font-bold">Chemin de notification</h3>
              <p className="mb-3 mt-1 text-xs leading-5 text-muted-foreground">
                Automatique utilise la règle du lycée. Un choix manuel s'applique uniquement à cet envoi.
              </p>
              <div role="group" aria-label="Canal de notification" className="grid grid-cols-2 gap-2">
                {CANAUX.map((opt) => {
                  const Icon = opt.icon;
                  const choisi = canal === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={choisi}
                      disabled={enCours}
                      onClick={() => changerCanal(opt.value)}
                      className={`flex min-h-24 min-w-0 flex-col justify-between rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                        choisi
                          ? "border-info-trait bg-info-doux text-info ring-1 ring-info"
                          : "border-border bg-card text-foreground hover:border-info-trait"
                      }`}
                    >
                      <span className="flex w-full items-start gap-1.5 text-xs font-bold leading-4">
                        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1">{opt.titre}</span>
                        {choisi && <Check className="size-3.5 shrink-0 text-info" aria-hidden />}
                      </span>
                      <span className="mt-2 text-xs leading-4 text-muted-foreground">{opt.detail}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs leading-5 text-muted-foreground dark:bg-muted/30">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
                Aucun SMS sans consentement. L'application exige un compte parent, les Push un appareil actif.
              </p>
            </section>

            <section aria-label="Composition du message" className="min-w-0 space-y-3">
              <h3 className="text-sm font-bold">Composer le message</h3>
              <div className="space-y-1.5">
                <Label htmlFor="notif-objet" className="text-xs font-semibold">
                  Objet du message
                </Label>
                <Input
                  id="notif-objet"
                  value={titre}
                  onChange={(e) => {
                    setTitre(e.target.value);
                    setConfirmeCout(false);
                  }}
                  placeholder="Ex. : Réunion avec les familles"
                  maxLength={80}
                  aria-invalid={!!erreurs.titre}
                  className="h-10 rounded-lg border-border bg-muted/40 text-sm dark:bg-muted/20"
                />
                {erreurs.titre && <p className="text-xs text-danger">{erreurs.titre}</p>}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="notif-texte" className="text-xs font-semibold">
                    Message
                  </Label>
                  <span className="text-xs tabular-nums text-muted-foreground">{corps.length}/600</span>
                </div>
                <Textarea
                  id="notif-texte"
                  rows={4}
                  value={corps}
                  onChange={(e) => {
                    setCorps(e.target.value);
                    setConfirmeCout(false);
                  }}
                  placeholder="Saisissez votre message aux responsables…"
                  maxLength={600}
                  aria-invalid={!!erreurs.corps}
                  className="min-h-28 resize-y rounded-lg border-border bg-muted/40 text-sm dark:bg-muted/20"
                />
                {erreurs.corps && <p className="text-xs text-danger">{erreurs.corps}</p>}
              </div>
            </section>
          </div>

          <section
            aria-label="Estimation de l'envoi"
            className="min-w-0 rounded-xl border border-info-trait bg-info-doux p-3.5"
            aria-live="polite"
          >
            {chargeApercu ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" aria-hidden /> Recalcul des destinataires et du coût…
              </p>
            ) : erreurApercu ? (
              <p role="alert" className="flex items-center gap-2 text-xs text-alerte">
                <AlertCircle className="size-4" aria-hidden /> Impossible d'obtenir une estimation fiable. Envoi
                désactivé.
              </p>
            ) : !apercu || apercu.total === 0 ? (
              <p className="flex items-center gap-2 text-xs text-alerte">
                <Users className="size-4" aria-hidden /> Aucun responsable joignable sur ce canal.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold">
                    {apercu.total} notification(s) prévue(s) · {apercu.tuteurs} responsable(s)
                  </p>
                  <span className="inline-flex items-center gap-1.5 text-sm font-bold tabular-nums text-info">
                    <Wallet className="size-4" aria-hidden /> {apercu.coutFcfa.toLocaleString("fr-FR")} FCFA estimés
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Smartphone className="size-3.5" aria-hidden /> {apercu.parPush} Push
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MessageSquare className="size-3.5" aria-hidden /> {apercu.parSms} SMS
                  </span>
                  <span className="flex items-center gap-1.5">
                    <BellRing className="size-3.5" aria-hidden /> {apercu.sansCanal} boîte interne
                  </span>
                  {apercu.exclus > 0 && (
                    <span className="text-alerte">{apercu.exclus} rattachement(s) non joignable(s)</span>
                  )}
                </div>
                {apercu.segments > 1 && apercu.parSms > 0 && (
                  <p className="mt-2 text-xs text-alerte">
                    SMS : {apercu.segments} segments par message, facturés selon le prestataire.
                  </p>
                )}
                {apercu.parSms > 0 && (
                  <label className="mt-3 flex items-start gap-2.5 rounded-lg border border-alerte-trait bg-alerte-doux p-2.5 text-xs leading-5 text-alerte">
                    <input
                      type="checkbox"
                      checked={confirmeCout}
                      onChange={(e) => setConfirmeCout(e.target.checked)}
                      className="mt-1 size-4 accent-blue-600"
                    />
                    <span>
                      Je confirme l'envoi de <strong>{apercu.parSms} SMS</strong> pour un coût estimé maximal de{" "}
                      <strong>{apercu.coutFcfa.toLocaleString("fr-FR")} FCFA</strong>.
                    </span>
                  </label>
                )}
              </>
            )}
          </section>
        </div>

        <DialogFooter className="shrink-0 flex-row justify-end gap-2 border-t border-border bg-card px-5 py-3">
          <Button
            type="button"
            variant="outline"
            disabled={enCours}
            onClick={() => fermer(false)}
            className="h-10 rounded-lg"
          >
            Annuler
          </Button>
          <Button
            type="button"
            disabled={!envoiPossible}
            onClick={envoyer}
            className="bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Send className="size-4" aria-hidden /> {enCours ? "Envoi…" : "Envoyer aux parents"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
