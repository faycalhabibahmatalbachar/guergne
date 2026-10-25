"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Bell, Check, Pencil, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet, SheetContent, SheetDescription, SheetFooter,
  SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { definirPolitique } from "../notifications/actions";

export interface ApercuPolitique {
  type: string;
  libelle: string;
  politique: string;
  description: string | null;
  dejaProduites: number;
  coutTotalFcfa: number;
}

const OPTIONS = [
  { valeur: "PUSH_SINON_SMS", libelle: "Application, SMS en repli", detail: "Push si possible, sinon SMS si joignable et autorisé.", facture: true },
  { valeur: "PUSH_ET_SMS", libelle: "Application et SMS", detail: "Les deux canaux selon l’éligibilité du parent. Peut augmenter les frais.", facture: true },
  { valeur: "PUSH_SEUL", libelle: "Application uniquement", detail: "Aucun SMS. Certaines familles peuvent ne pas recevoir l’alerte.", facture: false },
  { valeur: "SMS_SEUL", libelle: "SMS uniquement", detail: "Pas de Push. Le SMS est facturé et nécessite consentement et numéro.", facture: true },
  { valeur: "AUCUN", libelle: "Désactivé", detail: "Aucune nouvelle notification de ce type n'est générée.", facture: false },
] as const;

type Filtre = "tous" | "sms" | "sans_sms" | "desactive";
function option(value: string) { return OPTIONS.find((o) => o.valeur === value); }
function facturable(value: string) { return Boolean(option(value)?.facture); }

export function CommunicationPolicies({ lignes }: { lignes: ApercuPolitique[] }) {
  const router = useRouter();
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [selection, setSelection] = useState<ApercuPolitique | null>(null);
  const [choix, setChoix] = useState("");
  const [enCours, lancer] = useTransition();

  const filtres = useMemo(() => {
    const q = recherche.trim().toLocaleLowerCase("fr-FR");
    return lignes.filter((ligne) =>
      (!q || [ligne.libelle, ligne.description ?? "", ligne.type].some((t) => t.toLocaleLowerCase("fr-FR").includes(q))) &&
      (filtre === "tous" ||
        (filtre === "sms" && facturable(ligne.politique)) ||
        (filtre === "sans_sms" && ligne.politique === "PUSH_SEUL") ||
        (filtre === "desactive" && ligne.politique === "AUCUN"))
    );
  }, [lignes, recherche, filtre]);

  const sms = lignes.filter((l) => facturable(l.politique)).length;
  const seulementPush = lignes.filter((l) => l.politique === "PUSH_SEUL").length;
  const inactives = lignes.filter((l) => l.politique === "AUCUN").length;
  const modifie = selection !== null && choix !== selection.politique && Boolean(option(choix));

  function ouvrir(ligne: ApercuPolitique) {
    setSelection(ligne);
    setChoix(ligne.politique);
  }
  function fermer() {
    if (!enCours) setSelection(null);
  }
  function enregistrer() {
    if (!selection || !modifie || enCours) return;
    const type = selection.type;
    lancer(async () => {
      const resultat = await definirPolitique({ type, politique: choix });
      toast[resultat.ok ? "success" : "error"](resultat.message ?? "Enregistrement impossible.");
      if (resultat.ok) {
        setSelection(null);
        router.refresh();
      }
    });
  }

  return (
    <section aria-labelledby="politiques-communication-titre" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="politiques-communication-titre" className="text-sm font-bold">Politiques par événement</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">Chaque règle peut être modifiée séparément, avec confirmation et audit.</p>
        </div>
        <Link href="/dashboard/parametres/notifications" className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400">
          Voir le détail technique <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-3 lg:flex-row lg:items-center lg:justify-between dark:border-border">
          <div role="group" aria-label="Filtrer les politiques" className="flex flex-wrap gap-1.5">
            {([
              ["tous", "Toutes", lignes.length], ["sms", "SMS possibles", sms],
              ["sans_sms", "Push seul", seulementPush], ["desactive", "Désactivées", inactives],
            ] as const).map(([key, label, count]) => (
              <button key={key} type="button" aria-pressed={filtre === key}
                onClick={() => setFiltre(key)}
                className={`inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${filtre === key ? "bg-emerald-700 text-white" : "bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-muted dark:text-foreground"}`}>
                {label} <span className="tabular-nums opacity-75">({count})</span>
              </button>
            ))}
          </div>
          <div className="relative min-w-0 lg:w-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input className="h-9 w-full border-slate-200 pl-9 shadow-none dark:border-border"
              aria-label="Rechercher un type de notification" value={recherche}
              onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un événement…" />
          </div>
        </div>
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead className="bg-slate-50/70 text-xs text-slate-500 dark:bg-muted/30 dark:text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Événement</th>
                <th scope="col" className="px-4 py-3 font-semibold">Règle actuelle</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Produites</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Coût cumulé</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-border">
              {filtres.map((ligne) => (
                <tr key={ligne.type} className="hover:bg-slate-50/70 dark:hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{ligne.libelle}</p>
                    <p className="mt-0.5 max-w-xs text-[11px] text-slate-500 dark:text-muted-foreground">{ligne.description ?? ligne.type}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${ligne.politique === "AUCUN"
                      ? "bg-slate-100 text-slate-600 dark:bg-muted dark:text-foreground"
                      : facturable(ligne.politique) ? "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300" : "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"}`}>
                      {option(ligne.politique)?.libelle ?? ligne.politique}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{ligne.dejaProduites.toLocaleString("fr-FR")}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{ligne.coutTotalFcfa.toLocaleString("fr-FR")} F</td>
                  <td className="px-4 py-3 text-right">
                    <Button type="button" size="sm" variant="outline" onClick={() => ouvrir(ligne)}
                      aria-label={`Modifier la politique pour ${ligne.libelle}`}
                      className="h-9 gap-1.5 border-slate-200 bg-white text-xs shadow-none dark:border-border dark:bg-card">
                      <Pencil className="size-3.5" aria-hidden /> Modifier
                    </Button>
                  </td>
                </tr>
              ))}
              {filtres.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">Aucun événement trouvé avec ces filtres.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-border dark:text-muted-foreground">
          {filtres.length.toLocaleString("fr-FR")} événements affichés sur {lignes.length.toLocaleString("fr-FR")}.
        </div>
      </div>

      <Sheet open={selection !== null} onOpenChange={(ouvert) => { if (!ouvert) fermer(); }}>
        <SheetContent side="right" className="w-full max-w-full gap-0 p-0 sm:max-w-[490px]">
          <SheetHeader className="border-b border-slate-200 px-5 py-5 dark:border-border">
            <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"><Bell className="size-5" aria-hidden /></div>
            <SheetTitle className="text-xl font-bold">Règle de notification</SheetTitle>
            <SheetDescription className="mt-2">
              {selection?.libelle}. Modifiez le canal des prochaines notifications de cet événement.
            </SheetDescription>
          </SheetHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); enregistrer(); }}>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <div className="flex justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-border dark:bg-muted/40">
                <div><p className="text-xs text-slate-500 dark:text-muted-foreground">Règle enregistrée</p><p className="mt-1 text-sm font-semibold">{option(selection?.politique ?? "")?.libelle ?? selection?.politique}</p></div>
                <Check className="size-4 shrink-0 text-emerald-700" aria-hidden />
              </div>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-semibold">Choisir le canal pour les prochains événements</legend>
                {OPTIONS.map((o) => (
                  <label key={o.valeur} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${choix === o.valeur
                    ? "border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/20"
                    : "border-slate-200 hover:bg-slate-50 dark:border-border dark:hover:bg-muted/30"}`}>
                    <input type="radio" name="nouvelle-politique" value={o.valeur} checked={choix === o.valeur}
                      disabled={enCours} onChange={() => setChoix(o.valeur)}
                      className="mt-1 accent-emerald-700" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{o.libelle}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-slate-500 dark:text-muted-foreground">{o.detail}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{facturable(choix)
                  ? "Ce choix peut déclencher des SMS payants lors de prochains événements. Le coût dépend des destinataires et du nombre de segments."
                  : "Cette règle peut empêcher certains parents de recevoir des alertes, notamment ceux sans application."}
                  {" "}Cette modification ne renvoie pas les notifications déjà créées.
                </span>
              </div>
            </div>
            <SheetFooter className="flex-row gap-2 border-t border-slate-200 bg-white px-5 py-4 dark:border-border dark:bg-card">
              <Button type="button" variant="outline" className="h-10 flex-1 border-slate-200" disabled={enCours} onClick={fermer}>Annuler</Button>
              <Button type="submit" className="h-10 flex-1 bg-emerald-700 font-semibold text-white hover:bg-emerald-800" disabled={!modifie || enCours}>
                {enCours ? "Enregistrement…" : "Enregistrer la règle"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </section>
  );
}
