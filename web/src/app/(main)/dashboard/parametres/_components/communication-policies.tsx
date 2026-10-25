"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Search, SlidersHorizontal, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
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
  { valeur: "PUSH_SINON_SMS", libelle: "Application, SMS en repli", sms: true },
  { valeur: "PUSH_ET_SMS", libelle: "Application et SMS", sms: true },
  { valeur: "PUSH_SEUL", libelle: "Application uniquement", sms: false },
  { valeur: "SMS_SEUL", libelle: "SMS uniquement", sms: true },
  { valeur: "AUCUN", libelle: "Désactivé", sms: false },
] as const;

type Filtre = "tous" | "sms" | "gratuit" | "desactive";

function smsPossible(politique: string) {
  return OPTIONS.some((option) => option.valeur === politique && option.sms);
}
function descriptionPolitique(politique: string) {
  return OPTIONS.find((o) => o.valeur === politique)?.libelle ?? politique;
}

export function CommunicationPolicies({ lignes }: { lignes: ApercuPolitique[] }) {
  const router = useRouter();
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [afficherTout, setAfficherTout] = useState(false);
  const [proposition, setProposition] = useState<{ ligne: ApercuPolitique; valeur: string } | null>(null);
  const [enCours, demarrer] = useTransition();

  const filtres = useMemo(() => {
    const query = recherche.trim().toLocaleLowerCase("fr-FR");
    return lignes.filter((l) =>
      (!query || [l.libelle, l.description ?? "", l.type].some((texte) => texte.toLocaleLowerCase("fr-FR").includes(query))) &&
      (filtre === "tous" ||
        (filtre === "sms" && smsPossible(l.politique)) ||
        (filtre === "gratuit" && l.politique === "PUSH_SEUL") ||
        (filtre === "desactive" && l.politique === "AUCUN"))
    );
  }, [lignes, recherche, filtre]);

  const affiches = afficherTout || recherche.trim() || filtre !== "tous" ? filtres : filtres.slice(0, 6);
  const nbSms = lignes.filter((l) => smsPossible(l.politique)).length;
  const nbGratuit = lignes.filter((l) => l.politique === "PUSH_SEUL").length;
  const nbDesactives = lignes.filter((l) => l.politique === "AUCUN").length;

  function enregistrer() {
    if (!proposition || enCours) return;
    const { ligne, valeur } = proposition;
    setProposition(null);
    demarrer(async () => {
      const resultat = await definirPolitique({ type: ligne.type, politique: valeur });
      toast[resultat.ok ? "success" : "error"](resultat.message ?? "Modification impossible.");
      if (resultat.ok) router.refresh();
    });
  }

  return (
    <section aria-labelledby="politiques-communication-titre" className="min-w-0 space-y-3">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="politiques-communication-titre" className="text-base font-bold tracking-tight">
            Politiques de notification
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">
            Ajustez le canal de chaque événement. Les changements sont enregistrés et audités.
          </p>
        </div>
        <Button asChild variant="outline" className="h-9 shrink-0 gap-2 border-slate-200 bg-white shadow-none dark:border-border dark:bg-card">
          <Link href="/dashboard/parametres/notifications">Configuration complète <ArrowRight className="size-4" aria-hidden /></Link>
        </Button>
      </header>

      <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between dark:border-border">
          <div role="group" aria-label="Filtrer les politiques" className="flex min-w-0 flex-wrap items-center gap-1.5">
            {([
              ["tous", "Toutes", lignes.length],
              ["sms", "SMS possibles", nbSms],
              ["gratuit", "Push uniquement", nbGratuit],
              ["desactive", "Désactivées", nbDesactives],
            ] as const).map(([key, label, count]) => (
              <button
                type="button"
                key={key}
                aria-pressed={filtre === key}
                onClick={() => setFiltre(key)}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${filtre === key ? "bg-emerald-700 text-white" : "bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-muted dark:text-foreground"}`}
              >
                {label} <span className="tabular-nums opacity-80">({count})</span>
              </button>
            ))}
          </div>
          <div className="relative w-full lg:max-w-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              value={recherche}
              onChange={(event) => setRecherche(event.target.value)}
              aria-label="Rechercher une politique de notification"
              placeholder="Rechercher un événement…"
              className="h-9 border-slate-200 pl-9 shadow-none dark:border-border"
            />
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-xs text-slate-500 dark:border-border dark:bg-muted/30 dark:text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Événement</th>
                <th scope="col" className="w-[275px] px-4 py-3 font-semibold">Canal configuré</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Envois produits</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Coût enregistré</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-border">
              {affiches.map((l) => (
                <tr key={l.type} className="hover:bg-slate-50/70 dark:hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-950 dark:text-foreground">{l.libelle}</p>
                    <p className="mt-0.5 max-w-md text-xs leading-4 text-slate-500 dark:text-muted-foreground">{l.description ?? l.type}</p>
                  </td>
                  <td className="px-4 py-3">
                    <NativeSelect
                      aria-label={`Modifier le canal pour ${l.libelle}`}
                      className="h-9 w-full rounded-lg border-slate-200 bg-white text-xs dark:border-border dark:bg-card"
                      value={l.politique}
                      disabled={enCours}
                      onChange={(event) => {
                        if (event.target.value !== l.politique) setProposition({ ligne: l, valeur: event.target.value });
                      }}
                    >
                      {OPTIONS.map((option) => <option key={option.valeur} value={option.valeur}>{option.libelle}</option>)}
                    </NativeSelect>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-foreground">
                    {l.dejaProduites.toLocaleString("fr-FR")}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-foreground">
                    {l.coutTotalFcfa.toLocaleString("fr-FR")} FCFA
                  </td>
                </tr>
              ))}
              {affiches.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-500">Aucune politique ne correspond à ce filtre.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {!afficherTout && !recherche.trim() && filtre === "tous" && lignes.length > 6 ? (
          <div className="flex justify-center border-t border-slate-100 p-3 dark:border-border">
            <Button type="button" variant="outline" className="h-9 border-slate-200" onClick={() => setAfficherTout(true)}>
              <SlidersHorizontal className="size-4" aria-hidden /> Afficher les {lignes.length} politiques
            </Button>
          </div>
        ) : null}
        {afficherTout && filtre === "tous" && !recherche.trim() && lignes.length > 6 ? (
          <div className="flex justify-center border-t border-slate-100 p-3 dark:border-border">
            <Button type="button" variant="outline" size="sm" onClick={() => setAfficherTout(false)}>Réduire la liste</Button>
          </div>
        ) : null}
      </div>

      <AlertDialog open={proposition !== null} onOpenChange={(open) => { if (!open && !enCours) setProposition(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifier la politique de notification ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-slate-600 dark:text-muted-foreground">
                <p><strong>{proposition?.ligne.libelle}</strong> : « {descriptionPolitique(proposition?.ligne.politique ?? "")} » devient « {descriptionPolitique(proposition?.valeur ?? "")} ».</p>
                <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {proposition && smsPossible(proposition.valeur)
                    ? "Cette politique peut générer des SMS facturés selon le nombre de destinataires et de segments. Aucun message n’est envoyé par cette modification."
                    : "Cette politique peut limiter ou supprimer les notifications de certains parents. Aucun message n’est envoyé par cette modification."}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={enCours}>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={enCours} onClick={enregistrer} className="bg-emerald-700 text-white hover:bg-emerald-800">
              Confirmer le changement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
