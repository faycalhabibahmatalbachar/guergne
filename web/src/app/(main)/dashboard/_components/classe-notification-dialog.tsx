"use client";

import { useEffect, useState, useTransition } from "react";

import { BellRing, Check, LoaderCircle, MessageSquare, Send, Smartphone, Users, Wallet } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";

import {
  type ApercuCanalClasse,
  apercuClasseCanal,
  type CanalClasse,
  notifierClasseCanal,
} from "../_actions/notifier-classe-canal";
import "./classe-notification-dialog.css";

type Props = {
  cible: { type: "classe"; id: string; nom: string };
  variante?: "default" | "outline" | "ghost";
  libelle?: string;
};

const CANAUX = [
  { id: "AUTO", nom: "Automatique", aide: "Selon la politique", icon: BellRing },
  { id: "APP", nom: "Application", aide: "Push ou boîte interne", icon: Smartphone },
  { id: "SMS", nom: "SMS", aide: "Numéros consentants", icon: MessageSquare },
  { id: "APP_ET_SMS", nom: "Application + SMS", aide: "Deux canaux si possibles", icon: Send },
] as const;

/**
 * Fenêtre des classes conçue pour tenir entièrement dans le viewport :
 * - deux colonnes en paysage / sur desktop
 * - sections compactes sur mobile et écran peu haut
 * - pas de conteneur overflow-y-auto ni de champs défilants hors du modal.
 */
export function ClasseNotificationDialog({ cible, variante = "outline", libelle = "Prévenir les parents" }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const [canal, setCanal] = useState<CanalClasse>("AUTO");
  const [titre, setTitre] = useState("");
  const [corps, setCorps] = useState("");
  const [confirmeCout, setConfirmeCout] = useState(false);
  const [apercu, setApercu] = useState<{ signature: string; data: ApercuCanalClasse } | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState(false);
  const [enCours, demarrer] = useTransition();

  const contenuValide = titre.trim().length >= 3 && corps.trim().length >= 5;
  const signature = [cible.id, canal, titre, corps].join("\u0001");
  const estimation = apercu?.signature === signature ? apercu.data : null;

  useEffect(() => {
    if (!ouvert || !contenuValide) return;
    let actif = true;
    const minuteur = setTimeout(async () => {
      if (!actif) return;
      setChargement(true);
      setErreur(false);
      try {
        const data = await apercuClasseCanal(cible.id, titre, corps, canal);
        if (actif) setApercu({ signature, data });
      } catch {
        if (actif) setErreur(true);
      } finally {
        if (actif) setChargement(false);
      }
    }, 400);
    return () => {
      actif = false;
      clearTimeout(minuteur);
    };
  }, [ouvert, contenuValide, cible.id, titre, corps, canal, signature]);

  function changerCanal(nouveau: CanalClasse) {
    setCanal(nouveau);
    setConfirmeCout(false);
    setErreur(false);
  }

  function changerTitre(valeur: string) {
    setTitre(valeur);
    setConfirmeCout(false);
    setErreur(false);
  }

  function changerCorps(valeur: string) {
    setCorps(valeur);
    setConfirmeCout(false);
    setErreur(false);
  }

  function fermer() {
    if (enCours) return;
    setOuvert(false);
  }

  function envoyer() {
    if (!contenuValide || !estimation || estimation.total === 0 || chargement || erreur) return;
    if (estimation.parSms > 0 && !confirmeCout) {
      toast.error("Confirmez d’abord le coût des SMS.");
      return;
    }
    demarrer(async () => {
      try {
        const resultat = await notifierClasseCanal(cible.id, {
          titre,
          corps,
          canal,
          plafondCoutFcfa: estimation.coutFcfa,
          plafondNotifications: estimation.total,
        });
        if (!resultat.ok) {
          toast.error(resultat.message ?? "L’envoi n’a pas pu être confirmé.");
          setApercu(null);
          return;
        }
        toast.success(resultat.message ?? "Notifications déposées.");
        setOuvert(false);
        setCanal("AUTO");
        setTitre("");
        setCorps("");
        setConfirmeCout(false);
        setApercu(null);
      } catch {
        toast.error("L’envoi n’a pas été confirmé. Vérifiez le journal avant de réessayer.");
      }
    });
  }

  const peutEnvoyer =
    contenuValide &&
    !!estimation &&
    estimation.total > 0 &&
    !chargement &&
    !erreur &&
    !enCours &&
    (estimation.parSms === 0 || confirmeCout);

  return (
    <Dialog
      open={ouvert}
      onOpenChange={(value) => {
        if (!value && enCours) return;
        setOuvert(value);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant={variante}
          size="sm"
          className="w-full justify-center whitespace-nowrap border-info-trait bg-info-doux px-2.5 text-xs font-semibold text-info hover:bg-info-doux/90"
        >
          <BellRing className="size-4 shrink-0" aria-hidden />
          {libelle}
        </Button>
      </DialogTrigger>
      <DialogContent className="classes-notification-dialog !grid w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-2xl border border-border bg-card p-0 shadow-2xl sm:max-w-[840px]">
        <DialogHeader className="classes-notification-header gap-1 border-b border-border bg-card px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2.5 text-lg font-bold leading-snug tracking-tight text-foreground">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <BellRing className="size-[18px]" aria-hidden />
            </span>
            Prévenir les parents
          </DialogTitle>
          <DialogDescription className="classes-notification-description text-xs leading-snug text-muted-foreground">
            Responsables des élèves de <strong className="font-semibold text-foreground">{cible.nom}</strong> · Aucun
            message n’est envoyé avant confirmation.
          </DialogDescription>
        </DialogHeader>

        <div className="classes-notification-body grid min-w-0 grid-cols-1 gap-4 px-5 py-4 min-[600px]:grid-cols-2 min-[600px]:gap-5">
          <section className="classes-notification-channel min-w-0" aria-labelledby={"canaux-" + cible.id}>
            <div className="mb-3">
              <h3 id={"canaux-" + cible.id} className="text-sm font-semibold text-foreground">
                Canal de notification
              </h3>
              <p className="classes-notification-intro mt-1 text-xs leading-snug text-muted-foreground">
                Choisissez comment contacter les responsables.
              </p>
            </div>
            <div
              className="classes-notification-choices grid grid-cols-2 gap-2"
              role="group"
              aria-label="Canal de notification"
            >
              {CANAUX.map((option) => {
                const Icon = option.icon;
                const actif = canal === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={actif}
                    aria-label={option.nom + " : " + option.aide}
                    onClick={() => changerCanal(option.id)}
                    className={
                      "classes-notification-choice flex min-w-0 flex-col justify-center gap-1 rounded-xl border px-3 py-2.5 text-left outline-offset-2 transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 " +
                      (actif
                        ? "border-info-trait bg-info-doux text-info ring-1 ring-info"
                        : "border-border bg-card text-foreground hover:border-info-trait")
                    }
                  >
                    <span className="flex min-w-0 items-start gap-1.5 text-xs font-semibold leading-tight">
                      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1">{option.nom}</span>
                      {actif && <Check className="size-3.5 shrink-0 text-info" aria-hidden />}
                    </span>
                    <span className="classes-notification-option-description pl-5 text-xs leading-snug text-muted-foreground">
                      {option.aide}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="classes-notification-channel-note mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <Wallet className="mt-0.5 size-3.5 shrink-0 text-info" aria-hidden />
              Le devis et les destinataires sont calculés pour le canal choisi. Aucun SMS sans consentement.
            </p>
          </section>

          <section className="classes-notification-message min-w-0 space-y-2.5" aria-label="Composer le message">
            <div className="space-y-1">
              <label
                htmlFor={"classe-notification-titre-" + cible.id}
                className="block text-xs font-semibold text-foreground"
              >
                Objet du message
              </label>
              <Input
                id={"classe-notification-titre-" + cible.id}
                value={titre}
                onChange={(e) => changerTitre(e.target.value)}
                placeholder="Ex. : Réunion avec les familles"
                maxLength={80}
                className="classes-notification-input h-9 rounded-lg border-border bg-muted/40 text-sm"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor={"classe-notification-corps-" + cible.id}
                  className="text-xs font-semibold text-foreground"
                >
                  Message
                </label>
                <span className="text-xs tabular-nums text-muted-foreground">{corps.length}/600</span>
              </div>
              <Textarea
                id={"classe-notification-corps-" + cible.id}
                value={corps}
                onChange={(e) => changerCorps(e.target.value)}
                placeholder="Votre message aux familles…"
                rows={3}
                maxLength={600}
                className="classes-notification-textarea h-[clamp(62px,12dvh,100px)] min-h-0 resize-none rounded-lg border-border bg-muted/40 text-sm"
              />
            </div>
            <div className="classes-notification-preview min-w-0" aria-live="polite">
              {!contenuValide ? (
                <div className="flex items-start gap-2 rounded-lg border border-info-trait bg-info-doux px-3 py-2.5 text-xs leading-snug text-info">
                  <Users className="size-4 shrink-0" aria-hidden />
                  Renseignez l’objet et le message pour calculer les destinataires et le coût.
                </div>
              ) : chargement || (!estimation && !erreur) ? (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                  <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden />
                  Vérification des destinataires et du coût…
                </div>
              ) : erreur ? (
                <div
                  role="alert"
                  className="rounded-lg border border-alerte-trait bg-alerte-doux px-3 py-2.5 text-xs text-alerte"
                >
                  Impossible de vérifier les destinataires. Aucun envoi n’est autorisé.
                </div>
              ) : estimation && estimation.total === 0 ? (
                <div
                  role="status"
                  className="flex items-start gap-2 rounded-lg border border-alerte-trait bg-alerte-doux px-3 py-2.5 text-xs leading-snug text-alerte"
                >
                  <Users className="size-4 shrink-0" aria-hidden />
                  Aucun responsable joignable via ce canal. Essayez un autre canal ou vérifiez les contacts.
                </div>
              ) : estimation ? (
                <div className="space-y-1.5 rounded-lg border border-info-trait bg-info-doux px-3 py-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <strong className="text-foreground">
                      {estimation.total} notification(s) · {estimation.tuteurs} responsable(s)
                    </strong>
                    <strong className="font-semibold text-info">
                      {estimation.coutFcfa.toLocaleString("fr-FR")} FCFA
                    </strong>
                  </div>
                  <p className="text-muted-foreground">
                    {estimation.parPush} push · {estimation.parSms} SMS · {estimation.sansCanal} dans l’application
                  </p>
                  {estimation.exclus > 0 && (
                    <p className="text-alerte">{estimation.exclus} rattachement(s) non joignable(s) par ce canal.</p>
                  )}
                  {estimation.parSms > 0 && (
                    <label className="classes-notification-confirm flex cursor-pointer items-start gap-2 border-t border-info-trait pt-2 text-xs leading-snug text-foreground">
                      <input
                        type="checkbox"
                        checked={confirmeCout}
                        onChange={(e) => setConfirmeCout(e.target.checked)}
                        className="mt-0.5 size-4 shrink-0 accent-blue-600"
                      />
                      <span>
                        Je confirme l’envoi de {estimation.parSms} SMS, coût maximal{" "}
                        <strong>{estimation.coutFcfa.toLocaleString("fr-FR")} FCFA</strong>.
                      </span>
                    </label>
                  )}
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <DialogFooter className="classes-notification-footer !m-0 !flex-row !justify-end gap-2 border-t border-border bg-muted/40 px-4 py-3">
          <Button
            type="button"
            variant="outline"
            onClick={fermer}
            disabled={enCours}
            className="classes-notification-footer-button text-xs"
          >
            Annuler
          </Button>
          <Button
            type="button"
            disabled={!peutEnvoyer}
            onClick={envoyer}
            className="classes-notification-footer-button bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Send className="size-3.5 shrink-0" aria-hidden />
            {enCours ? "Envoi…" : "Envoyer aux parents"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
