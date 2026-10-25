"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, Bell, CalendarDays, Check, Clock3, FileText,
  Megaphone, Pencil, Search, ShieldAlert, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { definirPolitique } from "../notifications/actions";

export interface ApercuPolitique {
  type: string;
  libelle: string;
  politique: string;
  description: string | null;
  dejaProduites: number;
  coutTotalFcfa: number;
  envoyees30Jours: number;
  echouees30Jours: number;
}

const OPTIONS = [
  { valeur: "PUSH_SINON_SMS", libelle: "Application, SMS en repli", detail: "Push si joignable, sinon SMS si autorisé.", facture: true },
  { valeur: "PUSH_ET_SMS", libelle: "Application et SMS", detail: "Deux canaux si le responsable y est éligible.", facture: true },
  { valeur: "PUSH_SEUL", libelle: "Application uniquement", detail: "Aucun SMS. Certaines familles ne recevront pas l’alerte.", facture: false },
  { valeur: "SMS_SEUL", libelle: "SMS uniquement", detail: "SMS facturé si numéro et consentement valides.", facture: true },
  { valeur: "AUCUN", libelle: "Désactivé", detail: "Les prochains événements de ce type ne génèrent pas de notification.", facture: false },
] as const;

type Filtre = "tous" | "sms" | "push";
function option(value: string) { return OPTIONS.find((o) => o.valeur === value); }
function utiliseSms(v: string) { return ["PUSH_SINON_SMS", "PUSH_ET_SMS", "SMS_SEUL"].includes(v); }
function utilisePush(v: string) { return ["PUSH_SINON_SMS", "PUSH_ET_SMS", "PUSH_SEUL"].includes(v); }

function iconEvent(type: string): LucideIcon {
  switch (type) {
    case "ABSENCE": return CalendarDays;
    case "RETARD": return Clock3;
    case "BULLETIN_PUBLIE": return FileText;
    case "CONVOCATION": return Megaphone;
    default: return Bell;
  }
}
function RegleActuelle({ politique }: { politique: string }) {
  if (politique === "AUCUN") return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-muted dark:text-foreground">Désactivé</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {utilisePush(politique) && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">Push</span>}
      {utiliseSms(politique) && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">SMS</span>}
      {politique === "PUSH_SINON_SMS" && <span className="text-[10px] text-slate-400" title="SMS uniquement en repli">repli</span>}
    </div>
  );
}

export function CommunicationPolicies({
  lignes, apercu = false, onViewAll,
}: {
  lignes: ApercuPolitique[];
  apercu?: boolean;
  onViewAll?: () => void;
}) {
  const router = useRouter();
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [selection, setSelection] = useState<ApercuPolitique | null>(null);
  const [choix, setChoix] = useState("");
  const [enCours, lancer] = useTransition();
  const filtres = useMemo(() => {
    const rechercheNorm = recherche.trim().toLocaleLowerCase("fr-FR");
    return lignes.filter((l) =>
      (!rechercheNorm || [l.libelle, l.description ?? "", l.type].some((t) => t.toLocaleLowerCase("fr-FR").includes(rechercheNorm))) &&
      (filtre === "tous" || (filtre === "sms" && utiliseSms(l.politique)) || (filtre === "push" && utilisePush(l.politique)))
    );
  }, [lignes, recherche, filtre]);
  const visibles = apercu && !recherche.trim() && filtre === "tous" ? filtres.slice(0, 4) : filtres;
  const modifie = selection !== null && choix !== selection.politique && Boolean(option(choix));

  function modifier(ligne: ApercuPolitique) { setChoix(ligne.politique); setSelection(ligne); }
  function fermer() { if (!enCours) setSelection(null); }
  function enregistrer() {
    if (!selection || !modifie || enCours) return;
    const type = selection.type;
    lancer(async () => {
      const resultat = await definirPolitique({ type, politique: choix });
      toast[resultat.ok ? "success" : "error"](resultat.message ?? "Enregistrement impossible.");
      if (resultat.ok) { setSelection(null); router.refresh(); }
    });
  }

  return (
    <>
      <section aria-label="Politiques de notification" className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Bell className="mt-0.5 size-5 text-emerald-700" aria-hidden />
            <div>
              <h2 className="text-base font-bold tracking-tight">Politiques de notification</h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-muted-foreground">Définissez les règles d’envoi pour chaque événement.</p>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative min-w-[195px] flex-1 sm:w-[245px] sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input value={recherche} onChange={(e) => setRecherche(e.target.value)}
                className="h-9 border-slate-200 pl-9 text-xs shadow-none dark:border-border"
                aria-label="Rechercher un événement" placeholder="Rechercher un événement…" />
            </div>
            <div className="flex items-center gap-1" role="group" aria-label="Filtre par canal">
              {([["tous", `Toutes (${lignes.length})`], ["sms", "SMS"], ["push", "Push"]] as const).map(([key, label]) => (
                <button key={key} type="button" aria-pressed={filtre === key} onClick={() => setFiltre(key)}
                  className={`h-9 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${filtre === key ? "bg-emerald-700 text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-muted dark:text-foreground"}`}>{label}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[690px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-xs text-slate-500 dark:border-border dark:bg-muted/30 dark:text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-semibold sm:px-4">Événement</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold sm:px-4">Description</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold sm:px-4">Règle actuelle</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold sm:px-4">Notifications (30 jours)</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold sm:px-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-border">
                {visibles.map((l) => {
                  const Icon = iconEvent(l.type);
                  return (
                    <tr key={l.type} className="hover:bg-slate-50/70 dark:hover:bg-muted/25">
                      <td className="px-3 py-2.5 sm:px-4">
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-700 dark:bg-muted dark:text-foreground"><Icon className="size-4" aria-hidden /></span>
                          <strong className="whitespace-nowrap text-xs">{l.libelle}</strong>
                        </div>
                      </td>
                      <td className="max-w-[320px] px-3 py-2.5 text-xs text-slate-500 dark:text-muted-foreground sm:px-4">
                        <span className="line-clamp-2">{l.description ?? "Notification de l’événement."}</span>
                      </td>
                      <td className="px-3 py-2.5 sm:px-4"><RegleActuelle politique={l.politique} /></td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-slate-600 dark:text-muted-foreground sm:px-4">
                        {l.envoyees30Jours.toLocaleString("fr-FR")} envoyées
                        <span className="mx-1.5 text-slate-300">•</span>
                        {l.echouees30Jours.toLocaleString("fr-FR")} échecs
                      </td>
                      <td className="px-3 py-2.5 text-right sm:px-4">
                        <Button type="button" variant="outline" size="sm" onClick={() => modifier(l)}
                          aria-label={`Modifier la politique pour ${l.libelle}`}
                          className="h-8 min-w-[98px] gap-1.5 border-slate-200 bg-white text-xs shadow-none dark:border-border dark:bg-card">
                          <Pencil className="size-3.5" aria-hidden /> Modifier
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {visibles.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">Aucun événement correspondant à votre recherche.</td></tr>}
              </tbody>
            </table>
          </div>
          {apercu && onViewAll && !recherche.trim() && filtre === "tous" && lignes.length > 4 && (
            <div className="flex justify-end border-t border-slate-100 px-4 py-2 dark:border-border">
              <button type="button" onClick={onViewAll} className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400">
                Voir les {lignes.length} politiques →
              </button>
            </div>
          )}
        </div>
      </section>

      <Sheet open={selection !== null} onOpenChange={(v) => { if (!v) fermer(); }}>
        <SheetContent side="right" className="w-full max-w-full gap-0 p-0 sm:max-w-[490px]">
          <SheetHeader className="border-b border-slate-200 px-5 py-5 dark:border-border">
            <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"><Bell className="size-5" aria-hidden /></div>
            <SheetTitle className="text-xl font-bold">Règle de notification</SheetTitle>
            <SheetDescription className="mt-2">{selection?.libelle} — canal des prochaines notifications de cet événement.</SheetDescription>
          </SheetHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); enregistrer(); }}>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-border dark:bg-muted/40">
                <div><p className="text-xs text-slate-500 dark:text-muted-foreground">Règle actuelle</p><p className="mt-1 text-sm font-semibold">{option(selection?.politique ?? "")?.libelle ?? selection?.politique}</p></div>
                <Check className="size-4 text-emerald-700" aria-hidden />
              </div>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-semibold">Canal à appliquer aux futurs événements</legend>
                {OPTIONS.map((o) => (
                  <label key={o.valeur} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${choix === o.valeur ? "border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/20" : "border-slate-200 hover:bg-slate-50 dark:border-border dark:hover:bg-muted/30"}`}>
                    <input type="radio" name="canal-evenement" checked={choix === o.valeur} disabled={enCours} onChange={() => setChoix(o.valeur)} className="mt-1 accent-emerald-700" />
                    <span><span className="block text-sm font-semibold">{o.libelle}</span><span className="mt-1 block text-xs leading-relaxed text-slate-500 dark:text-muted-foreground">{o.detail}</span></span>
                  </label>
                ))}
              </fieldset>
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{option(choix)?.facture
                  ? "Cette règle peut entraîner des SMS facturés selon le nombre de destinataires et de segments."
                  : "Ce choix peut limiter les notifications reçues par certaines familles."}
                  {" "}Aucun envoi n’est déclenché par le changement de politique.</span>
              </p>
              {selection && selection.echouees30Jours > 0 &&
                <p className="flex items-start gap-2 text-xs text-slate-500 dark:text-muted-foreground"><AlertTriangle className="size-4 shrink-0" aria-hidden /> {selection.echouees30Jours.toLocaleString("fr-FR")} échecs sur les 30 derniers jours pour cet événement.</p>}
            </div>
            <SheetFooter className="flex-row gap-2 border-t border-slate-200 bg-white px-5 py-4 dark:border-border dark:bg-card">
              <Button type="button" variant="outline" disabled={enCours} className="h-10 flex-1" onClick={fermer}>Annuler</Button>
              <Button type="submit" disabled={!modifie || enCours} className="h-10 flex-1 bg-emerald-700 text-white hover:bg-emerald-800">
                {enCours ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
