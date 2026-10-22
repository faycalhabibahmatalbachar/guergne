"use client";

import { useEffect, useState, useTransition } from "react";

import { AlertCircle, BellRing, LoaderCircle, MessageSquare, Send, Smartphone, Users } from "lucide-react";
import { toast } from "sonner";

import { apercuClasseCanal, notifierClasseCanal, type CanalClasse } from "../_actions/notifier-classe-canal";

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
  apercuClasse,
  apercuEleve,
  apercuSelection,
  notifierClasse,
  notifierEleve,
  notifierSelection,
  type Apercu,
} from "../_actions/notifier";

/**
 * La cible « selection » (E-38) porte une liste d'identifiants plutôt qu'un
 * seul : c'est la sélection cochée dans une liste. Elle passe par le même
 * aperçu et le même dépôt que les deux autres — un troisième chemin d'envoi
 * finirait par diverger sur le calcul du coût, qui est justement ce qu'on
 * montre pour engager la dépense en connaissance de cause.
 */
type Cible =
  | { type: "eleve"; id: string; nom: string }
  | { type: "classe"; id: string; nom: string }
  | { type: "selection"; ids: string[]; nom: string };

/**
 * Prévenir les familles sans quitter la page.
 *
 * DEUX CHOSES SONT MONTRÉES AVANT L'ENVOI, ET C'EST L'ESSENTIEL
 * -------------------------------------------------------------
 * Combien de personnes seront touchées, et combien cela coûtera. Le SMS est le
 * seul poste variable du budget de l'établissement : un envoi de routine à une
 * classe entière peut représenter plusieurs milliers de francs, et personne ne
 * peut le deviner en tapant son message.
 *
 * L'aperçu est recalculé côté serveur avec la MÊME fonction que les
 * déclencheurs — `fn_canal_tuteur` — pour qu'il ne puisse pas annoncer autre
 * chose que ce qui partira.
 */
export function BoutonNotifier({
  cible,
  variante = "outline",
  libelle = "Prévenir les parents",
  contexteEleves = false,
  contexteClasses = false,
}: {
  cible: Cible;
  variante?: "default" | "outline" | "ghost";
  libelle?: string;
  contexteEleves?: boolean;
  contexteClasses?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [canal, setCanal] = useState<CanalClasse>("AUTO");
  const [confirmeCout, setConfirmeCout] = useState(false);
  const premium = contexteEleves || contexteClasses;
  const [titre, setTitre] = useState("");
  const [corps, setCorps] = useState("");
  const [apercu, setApercu] = useState<(Apercu & { exclus?: number; tuteurs?: number }) | null>(null);
  const [chargeApercu, setChargeApercu] = useState(false);
  const [erreurApercu, setErreurApercu] = useState(false);
  const cibleSignature = cible.type === "selection" ? cible.ids.join(",") : cible.id;
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [enCours, demarrer] = useTransition();

  // L'aperçu suit la frappe, mais avec un délai : recalculer à chaque touche
  // ferait une requête par caractère.
  useEffect(() => {
    if (!ouvert) return;
    let actif = true;
    setApercu(null);
    setErreurApercu(false);
    setChargeApercu(true);
    const minuteur = setTimeout(async () => {
      try {
        const a =
          contexteClasses && cible.type === "classe"
            ? await apercuClasseCanal(cible.id, titre || "Message", corps || "…", canal)
            : cible.type === "eleve"
            ? await apercuEleve(cible.id, titre || "Message", corps || "…")
            : cible.type === "classe"
              ? await apercuClasse(cible.id, titre || "Message", corps || "…")
              : await apercuSelection(cible.ids, titre || "Message", corps || "…");
        if (actif) setApercu(a);
      } catch {
        if (actif) { setApercu(null); setErreurApercu(true); }
      } finally {
        if (actif) setChargeApercu(false);
      }
    }, 450);
    return () => { actif = false; clearTimeout(minuteur); };
    // La signature primitive empêche des rechargements continus dus à un
    // nouvel objet « cible » construit par la barre de sélection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert, titre, corps, canal, contexteClasses, cible.type, cibleSignature]);

  function envoyer() {
    if (premium && (!apercu || apercu.total === 0 || chargeApercu)) {
      toast.error("Vérifiez les destinataires avant d’envoyer ce message.");
      return;
    }
    if (contexteClasses && (erreurApercu || (apercu?.parSms ?? 0) > 0 && !confirmeCout)) {
      toast.error("Veuillez confirmer le coût estimé des SMS.");
      return;
    }
    setErreurs({});
    demarrer(async () => {
      try {
      const r =
        cible.type === "eleve"
          ? await notifierEleve(cible.id, { titre, corps })
          : cible.type === "classe"
            ? (contexteClasses
              ? await notifierClasseCanal(cible.id, { titre, corps, canal, plafondCoutFcfa: apercu?.coutFcfa ?? 0, plafondNotifications: apercu?.total ?? 0 })
              : await notifierClasse(cible.id, { titre, corps }))
            : await notifierSelection(cible.ids, { titre, corps });

      if (r.ok) {
        toast.success(r.message ?? "Message déposé.");
        setOuvert(false);
        setTitre("");
        setCorps("");
        setCanal("AUTO");
        setConfirmeCout(false);
      } else {
        setErreurs(r.erreurs ?? {});
        toast.error(r.message ?? Object.values(r.erreurs ?? {})[0] ?? "Envoi impossible.");
      }
      } catch {
        toast.error("Envoi indisponible. Aucun nouveau message n’a été confirmé.");
      }
    });
  }

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>
        <Button variant={variante} size="sm" className={contexteClasses ? "h-10 w-full justify-center gap-2 rounded-xl border-blue-200 bg-blue-50 font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-900/20 dark:text-blue-300" : contexteEleves ? "h-9 gap-2 rounded-lg px-3 font-medium text-emerald-950 hover:bg-emerald-100 dark:text-emerald-50" : undefined}>
          <BellRing aria-hidden />
          {libelle}
        </Button>
      </DialogTrigger>

      <DialogContent className={premium ? "max-h-[min(90dvh,840px)] w-[calc(100%-1.5rem)] gap-0 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl sm:max-w-xl dark:border-slate-700 dark:bg-slate-900" : "sm:max-w-lg"}>
        <DialogHeader className={premium ? "border-b border-slate-200 bg-gradient-to-r from-blue-50 via-white to-white px-6 py-6 pr-14 dark:border-slate-800 dark:from-blue-950/40 dark:via-slate-900 dark:to-slate-900" : undefined}>
          <DialogTitle className={premium ? "flex items-center gap-3 text-xl font-bold tracking-tight" : undefined}>{premium ? <span aria-hidden className="flex size-10 items-center justify-center rounded-xl bg-blue-600 text-white"><BellRing className="size-5" /></span> : null}Prévenir les parents</DialogTitle>
          <DialogDescription className={premium ? "pt-1 text-sm leading-relaxed" : undefined}>
            {cible.type === "eleve"
              ? `Les responsables de ${cible.nom} seront prévenus.`
              : cible.type === "selection"
                ? `Vous vous adressez aux responsables de ${cible.ids.length} élève${cible.ids.length > 1 ? "s" : ""} sélectionné${cible.ids.length > 1 ? "s" : ""}.`
                : `Les responsables des élèves de la classe ${cible.nom} seront prévenus.`}
          </DialogDescription>
        </DialogHeader>

        {contexteClasses && (
          <div className="space-y-3 border-b border-slate-100 px-6 py-5 dark:border-slate-800">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Canal de notification</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Choisissez comment contacter les responsables. Les destinataires et le coût sont recalculés avant l’envoi.</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {([
                { value: "AUTO", titre: "Automatique", sousTitre: "Selon la politique", icon: BellRing },
                { value: "APP", titre: "Application", sousTitre: "Push ou boîte interne", icon: Smartphone },
                { value: "SMS", titre: "SMS", sousTitre: "Numéros consentants", icon: MessageSquare },
                { value: "APP_ET_SMS", titre: "Application + SMS", sousTitre: "Les deux si possibles", icon: Send },
              ] as const).map((option) => {
                const Icon = option.icon;
                return <button key={option.value} type="button" aria-pressed={canal === option.value} onClick={() => {setCanal(option.value);setConfirmeCout(false);}} className={"flex min-w-0 flex-col items-start gap-1 rounded-xl border px-3.5 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 " + (canal === option.value ? "border-blue-500 bg-blue-50 text-blue-800 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-200" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200")}>
                  <span className="flex w-full items-center gap-2 text-sm font-semibold"><Icon className="size-4 shrink-0" />{option.titre}{canal === option.value && <span className="ml-auto text-blue-600">✓</span>}</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{option.sousTitre}</span>
                </button>;
              })}
            </div>
          </div>
        )}
        <div className={premium ? "space-y-5 px-6 py-5" : "space-y-4"}>
          <div className="space-y-1.5">
            <Label htmlFor="titre-notif" className={premium ? "text-sm font-semibold" : undefined}>Objet du message</Label>
            <Input
              id="titre-notif"
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              placeholder="Ex. : Réunion avec les familles"
              className={premium ? "h-11 rounded-xl border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800" : undefined}
              maxLength={80}
              aria-invalid={Boolean(erreurs.titre)}
            />
            {erreurs.titre ? <p className="text-destructive text-xs">{erreurs.titre}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="corps-notif" className={premium ? "text-sm font-semibold" : undefined}>Message</Label>
            <Textarea
              id="corps-notif"
              value={corps}
              onChange={(e) => setCorps(e.target.value)}
              rows={4}
              placeholder="Saisissez votre message aux responsables des élèves concernés…"
              className={premium ? "min-h-[110px] resize-y rounded-xl border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800" : undefined}
              maxLength={600}
              aria-invalid={Boolean(erreurs.corps)}
            />
            <div className="flex justify-between">
              {erreurs.corps ? (
                <p className="text-destructive text-xs">{erreurs.corps}</p>
              ) : (
                <span />
              )}
              <p className="text-muted-foreground text-xs tabular-nums">{corps.length}/600</p>
            </div>
          </div>

          {premium && chargeApercu ? <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-border dark:bg-muted/20"><LoaderCircle className="size-4 animate-spin" aria-hidden /> Vérification des destinataires et du coût…</div> : null}
          {premium && erreurApercu ? <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> Impossible de calculer les destinataires. Vérifiez votre connexion avant l’envoi.</div> : null}
          {premium && !chargeApercu && apercu?.total === 0 ? <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><Users className="mt-0.5 size-4 shrink-0" aria-hidden /> Aucun responsable joignable trouvé pour cette sélection.</div> : null}
          {apercu && apercu.total > 0 ? (
            <div className={premium ? "space-y-2 rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-sm dark:border-blue-900 dark:bg-blue-950/20" : "bg-muted/50 space-y-2 rounded-md border p-3 text-sm"}>
              <p className="font-semibold">{apercu.total} notification(s) prévue(s){contexteClasses && apercu.tuteurs !== undefined ? ` · ${apercu.tuteurs} parent(s) concerné(s)` : ""}</p>
              <div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1">
                <span className="flex items-center gap-1.5">
                  <Smartphone aria-hidden className="size-3.5" />
                  {apercu.parPush} par notification — gratuit
                </span>
                <span className="flex items-center gap-1.5">
                  <MessageSquare aria-hidden className="size-3.5" />
                  {apercu.parSms} par SMS
                </span>
              </div>

              {apercu.parSms > 0 ? (
                <p>
                  Coût estimé :{" "}
                  <strong className="tabular-nums">
                    {apercu.coutFcfa.toLocaleString("fr-FR")} F
                  </strong>
                  {apercu.segments > 1 ? (
                    <span className="text-muted-foreground">
                      {" "}
                      — {apercu.segments} segments par message, votre texte dépasse la longueur
                      d&apos;un SMS
                    </span>
                  ) : null}
                </p>
              ) : null}

              {contexteClasses && apercu.exclus !== undefined && apercu.exclus > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400">{apercu.exclus} rattachement(s) non joignable(s) par le canal sélectionné ; ils seront exclus de l’envoi.</p>
              )}
              {contexteClasses && apercu.parSms > 0 && (
                <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                  <input type="checkbox" checked={confirmeCout} onChange={(e) => setConfirmeCout(e.target.checked)} className="mt-0.5 size-4 accent-blue-600" />
                  <span>Je confirme l’envoi de {apercu.parSms} SMS pour un coût estimé maximal de <strong>{apercu.coutFcfa.toLocaleString("fr-FR")} FCFA</strong>.</span>
                </label>
              )}
              {apercu.sansCanal > 0 ? (
                <p className="text-amber-600 dark:text-amber-400">
                  {apercu.sansCanal} tuteur(s) sans application ni consentement SMS : le message
                  les attendra dans l&apos;application.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className={premium ? "mx-0 mb-0 rounded-b-2xl border-t border-slate-200 bg-slate-50/80 px-6 py-4 dark:border-slate-800 dark:bg-slate-900" : undefined}>
          <Button variant="outline" onClick={() => setOuvert(false)} className={premium ? "h-11 rounded-xl border-slate-200 bg-white px-4 dark:border-slate-700 dark:bg-slate-900" : undefined}>
            Annuler
          </Button>
          <Button onClick={envoyer} className={contexteClasses ? "h-11 gap-2 rounded-xl bg-blue-600 px-5 font-semibold text-white hover:bg-blue-700" : contexteEleves ? "h-10 gap-2 rounded-lg bg-emerald-700 px-5 font-semibold text-white hover:bg-emerald-800" : undefined} disabled={enCours || titre.trim().length < 3 || corps.trim().length < 5 || (premium && (chargeApercu || erreurApercu || !apercu || apercu.total < 1)) || (contexteClasses && Boolean(apercu?.parSms && !confirmeCout))}>
            <Send className="size-4" aria-hidden /> {enCours ? "Envoi…" : "Envoyer aux parents"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
