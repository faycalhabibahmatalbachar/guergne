"use client";

import { useEffect, useState, useTransition } from "react";

import { AlertCircle, BellRing, LoaderCircle, MessageSquare, Send, Smartphone, Users } from "lucide-react";
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
}: {
  cible: Cible;
  variante?: "default" | "outline" | "ghost";
  libelle?: string;
  contexteEleves?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [titre, setTitre] = useState("");
  const [corps, setCorps] = useState("");
  const [apercu, setApercu] = useState<Apercu | null>(null);
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
          cible.type === "eleve"
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
  }, [ouvert, titre, corps, cible.type, cibleSignature]);

  function envoyer() {
    if (contexteEleves && (!apercu || apercu.total === 0 || chargeApercu)) {
      toast.error("Vérifiez les destinataires avant d’envoyer ce message.");
      return;
    }
    setErreurs({});
    demarrer(async () => {
      try {
      const r =
        cible.type === "eleve"
          ? await notifierEleve(cible.id, { titre, corps })
          : cible.type === "classe"
            ? await notifierClasse(cible.id, { titre, corps })
            : await notifierSelection(cible.ids, { titre, corps });

      if (r.ok) {
        toast.success(r.message ?? "Message déposé.");
        setOuvert(false);
        setTitre("");
        setCorps("");
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
        <Button variant={variante} size="sm" className={contexteEleves ? "h-9 gap-2 rounded-lg px-3 font-medium text-emerald-950 hover:bg-emerald-100 dark:text-emerald-50" : undefined}>
          <BellRing aria-hidden />
          {libelle}
        </Button>
      </DialogTrigger>

      <DialogContent className={contexteEleves ? "max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] gap-0 overflow-y-auto rounded-2xl border border-slate-200 p-0 shadow-2xl sm:max-w-xl dark:border-border" : "sm:max-w-lg"}>
        <DialogHeader className={contexteEleves ? "border-b border-slate-100 bg-slate-50/60 px-6 py-6 pr-14 dark:border-border dark:bg-muted/15" : undefined}>
          <DialogTitle className={contexteEleves ? "flex items-center gap-2 text-lg font-semibold tracking-tight" : undefined}>{contexteEleves ? <span aria-hidden className="flex size-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><BellRing className="size-[19px]" /></span> : null}Prévenir les parents</DialogTitle>
          <DialogDescription className={contexteEleves ? "pt-1 text-sm leading-relaxed" : undefined}>
            {cible.type === "eleve"
              ? `Les responsables de ${cible.nom} seront prévenus.`
              : cible.type === "selection"
                ? `Vous vous adressez aux responsables de ${cible.ids.length} élève${cible.ids.length > 1 ? "s" : ""} sélectionné${cible.ids.length > 1 ? "s" : ""}.`
                : `Les responsables des élèves de la classe ${cible.nom} seront prévenus.`}
          </DialogDescription>
        </DialogHeader>

        <div className={contexteEleves ? "space-y-5 px-6 py-5" : "space-y-4"}>
          <div className="space-y-1.5">
            <Label htmlFor="titre-notif" className={contexteEleves ? "text-sm font-semibold" : undefined}>Objet du message</Label>
            <Input
              id="titre-notif"
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              placeholder="Ex. : Réunion avec les familles"
              className={contexteEleves ? "h-11 rounded-lg border-slate-200 bg-white dark:bg-background" : undefined}
              maxLength={80}
              aria-invalid={Boolean(erreurs.titre)}
            />
            {erreurs.titre ? <p className="text-destructive text-xs">{erreurs.titre}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="corps-notif" className={contexteEleves ? "text-sm font-semibold" : undefined}>Message</Label>
            <Textarea
              id="corps-notif"
              value={corps}
              onChange={(e) => setCorps(e.target.value)}
              rows={4}
              placeholder="Saisissez votre message aux responsables des élèves concernés…"
              className={contexteEleves ? "min-h-[120px] resize-y rounded-lg border-slate-200 bg-white dark:bg-background" : undefined}
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

          {contexteEleves && chargeApercu ? <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-border dark:bg-muted/20"><LoaderCircle className="size-4 animate-spin" aria-hidden /> Vérification des destinataires et du coût…</div> : null}
          {contexteEleves && erreurApercu ? <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> Impossible de calculer les destinataires. Vérifiez votre connexion avant l’envoi.</div> : null}
          {contexteEleves && !chargeApercu && apercu?.total === 0 ? <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><Users className="mt-0.5 size-4 shrink-0" aria-hidden /> Aucun responsable joignable trouvé pour cette sélection.</div> : null}
          {apercu && apercu.total > 0 ? (
            <div className={contexteEleves ? "space-y-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/20" : "bg-muted/50 space-y-2 rounded-md border p-3 text-sm"}>
              <p className="font-medium">{apercu.total} destinataire(s)</p>
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

              {apercu.sansCanal > 0 ? (
                <p className="text-amber-600 dark:text-amber-400">
                  {apercu.sansCanal} tuteur(s) sans application ni consentement SMS : le message
                  les attendra dans l&apos;application.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className={contexteEleves ? "mx-0 mb-0 rounded-b-2xl border-t border-slate-100 bg-slate-50/80 px-6 py-4 dark:border-border dark:bg-muted/10" : undefined}>
          <Button variant="outline" onClick={() => setOuvert(false)} className={contexteEleves ? "h-10 rounded-lg bg-white px-4 dark:bg-card" : undefined}>
            Annuler
          </Button>
          <Button onClick={envoyer} className={contexteEleves ? "h-10 gap-2 rounded-lg bg-emerald-700 px-5 font-semibold text-white hover:bg-emerald-800" : undefined} disabled={enCours || titre.trim().length < 3 || corps.trim().length < 5 || (contexteEleves && (chargeApercu || !apercu || apercu.total < 1))}>
            <Send className="size-4" aria-hidden /> {enCours ? "Envoi…" : "Envoyer aux parents"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
