"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Download, EyeOff, FileText, Play, Search, Send,
  Clock3, CheckCircle2, TrendingUp, Users,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { genererPourClasse, type ResultatGeneration } from "../actions";
import { depublierClasse, publierClasse } from "../actions-conseil";
import { AvisConseil } from "./avis-conseil";

export interface BulletinListe {
  inscriptionId: string;
  eleve: string;
  matricule: string;
  moyenne: string | null;
  rang: number | null;
  mention: string | null;
  appreciation: string | null;
  decision: string | null;
  publie: boolean;
  classeId: string;
  classe: string;
  periodeId: string;
  periode: string;
}

export function GenerationBulletins({
  classes,
  periodes,
  classeChoisie,
  periodeChoisie,
  bulletins,
  effectifTotal,
}: {
  classes: Array<{ id: string; libelle: string; effectif: number }>;
  periodes: Array<{ id: string; libelle: string }>;
  classeChoisie: string;
  periodeChoisie: string;
  bulletins: BulletinListe[];
  effectifTotal: number;
}) {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();
  const [rapport, setRapport] = useState<ResultatGeneration["rapport"] | null>(null);
  const [recherche, setRecherche] = useState("");
  const [filtreClasse, setFiltreClasse] = useState(classeChoisie);
  const [filtrePeriode, setFiltrePeriode] = useState(periodeChoisie);
  const [page, setPage] = useState(1);
  const parPage = 10;

  function naviguer(classe: string, periode: string) {
    const p = new URLSearchParams();
    if (classe) p.set("classe", classe);
    if (periode) p.set("periode", periode);
    routeur.push(`/dashboard/bulletins?${p.toString()}`);
  }

  function appliquerFiltres() {
    setPage(1);
    naviguer(filtreClasse, filtrePeriode);
  }

  function generer() {
    if (!classeChoisie || !periodeChoisie) return;
    setRapport(null);
    demarrer(async () => {
      const r = await genererPourClasse(classeChoisie, periodeChoisie);
      setRapport(r.rapport ?? null);
      toast[r.ok ? "success" : "error"](r.message ?? "Terminé.");
      if (r.ok) routeur.refresh();
    });
  }

  const publies = bulletins.filter((b) => b.publie).length;
  const enAttente = bulletins.length - publies;
  const bulletinsSelectionnes = bulletins.filter(
    (b) => b.classeId === classeChoisie && b.periodeId === periodeChoisie,
  );
  const publiesSelectionnes = bulletinsSelectionnes.filter((b) => b.publie).length;
  const attenteSelectionnes = bulletinsSelectionnes.length - publiesSelectionnes;
  const tauxPublies = bulletins.length > 0 ? (publies / bulletins.length) * 100 : 0;
  const tauxAttente = bulletins.length > 0 ? (enAttente / bulletins.length) * 100 : 0;

  const filtres = useMemo(() => {
    const q = recherche.trim().toLocaleLowerCase("fr");
    return bulletins.filter((b) => {
      const texte = [b.eleve, b.matricule, b.classe, b.periode].join(" ").toLocaleLowerCase("fr");
      return (!q || texte.includes(q))
        && (!filtreClasse || b.classeId === filtreClasse)
        && (!filtrePeriode || b.periodeId === filtrePeriode);
    });
  }, [bulletins, recherche, filtreClasse, filtrePeriode]);

  const pages = Math.max(1, Math.ceil(filtres.length / parPage));
  const pageCourante = Math.min(page, pages);
  const visibles = filtres.slice((pageCourante - 1) * parPage, pageCourante * parPage);
  const moyennes = filtres
    .map((b) => (b.moyenne !== null && b.moyenne !== "" ? Number(b.moyenne) : NaN))
    .filter(Number.isFinite);
  const moyenne = moyennes.length
    ? (moyennes.reduce((s, v) => s + v, 0) / moyennes.length).toFixed(2).replace(".", ",")
    : "—";

  function exporter() {
    const lignes = [
      ["Élève", "Matricule", "Classe", "Période", "Moyenne générale", "Rang", "Mention", "Statut"],
      ...filtres.map((b) => [
        b.eleve, b.matricule, b.classe, b.periode, b.moyenne ?? "",
        b.rang?.toString() ?? "", b.mention ?? "", b.publie ? "Publié" : "En attente",
      ]),
    ];
    const csv = "\uFEFF" + lignes.map((ligne) =>
      ligne.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"),
    ).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const lien = document.createElement("a");
    lien.href = url;
    lien.download = "bulletins-scolaires.csv";
    lien.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 pb-6">
      <Card className="rounded-2xl border-border/70 shadow-sm">
        <CardHeader className="border-b bg-muted/20 pb-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-cyan-700/10 p-2.5 text-cyan-800 dark:text-cyan-300"><Search className="size-5" aria-hidden /></div>
            <div><CardTitle className="text-base">Rechercher et filtrer les bulletins</CardTitle>
              <CardDescription className="mt-1">Recherchez un élève par son nom, son prénom ou son matricule, puis choisissez une classe et une période.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(220px,1.5fr)_1fr_1fr_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="recherche-bulletins">Recherche</Label>
              <div className="relative">
                <Search className="text-slate-600 dark:text-slate-300 absolute left-3 top-1/2 size-4 -translate-y-1/2" aria-hidden />
                <input id="recherche-bulletins" value={recherche} onChange={(e) => { setRecherche(e.target.value); setPage(1); }}
                  placeholder="Nom, prénom ou matricule…" className="border-input bg-background placeholder:text-slate-600 dark:text-slate-300 focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-md border py-2 pl-9 pr-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filtre-classe">Classe</Label>
              <NativeSelect id="filtre-classe" value={filtreClasse} onChange={(e) => { setFiltreClasse(e.target.value); setPage(1); }}>
                <option value="">Toutes les classes</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filtre-periode">Période</Label>
              <NativeSelect id="filtre-periode" value={filtrePeriode} onChange={(e) => { setFiltrePeriode(e.target.value); setPage(1); }}>
                <option value="">Toutes les périodes</option>
                {periodes.map((p) => <option key={p.id} value={p.id}>{p.libelle}</option>)}
              </NativeSelect>
            </div>
            <div className="flex items-end">
              <Button onClick={appliquerFiltres} className="w-full bg-cyan-700 text-white hover:bg-cyan-800 dark:bg-cyan-600 dark:hover:bg-cyan-500">
                Appliquer
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <p className="text-slate-600 dark:text-slate-300 text-sm">{filtres.length} bulletin(s) trouvé(s)</p>
            <Button variant="outline" onClick={exporter} disabled={filtres.length === 0}>
              <Download aria-hidden /> Exporter en CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="h-full rounded-2xl border-border/70 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-cyan-500/10 p-3 text-cyan-700 dark:text-cyan-300"><Users className="size-5" aria-hidden /></div>
            <div><p className="text-slate-600 dark:text-slate-300 text-sm">Total des élèves</p><p className="text-2xl font-semibold tabular-nums">{effectifTotal}</p><p className="text-slate-600 dark:text-slate-300 text-xs">Inscrits dans l’année courante</p></div>
          </CardContent>
        </Card>
        <Card className="h-full rounded-2xl border-border/70 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-indigo-500/10 p-3 text-indigo-600"><FileText className="size-5" aria-hidden /></div>
            <div><p className="text-slate-600 dark:text-slate-300 text-sm">Bulletins générés</p><p className="text-2xl font-semibold tabular-nums">{bulletins.length}</p><p className="text-slate-600 dark:text-slate-300 text-xs">Pour l’année scolaire courante</p></div>
          </CardContent>
        </Card>
        <Card className="h-full rounded-2xl border-border/70 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-amber-500/10 p-3 text-amber-600"><Clock3 className="size-5" aria-hidden /></div>
            <div><p className="text-slate-600 dark:text-slate-300 text-sm">À publier</p><p className="text-2xl font-semibold tabular-nums">{enAttente}</p><p className="text-slate-600 dark:text-slate-300 text-xs">{tauxAttente.toFixed(1).replace(".", ",")}% des bulletins produits</p></div>
          </CardContent>
        </Card>
        <Card className="h-full rounded-2xl border-border/70 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-emerald-500/10 p-3 text-emerald-600"><CheckCircle2 className="size-5" aria-hidden /></div>
            <div><p className="text-slate-600 dark:text-slate-300 text-sm">Publiés</p><p className="text-2xl font-semibold tabular-nums">{publies}</p><p className="text-slate-600 dark:text-slate-300 text-xs">{tauxPublies.toFixed(1).replace(".", ",")}% des bulletins</p></div>
          </CardContent>
        </Card>
        <Card className="h-full rounded-2xl border-border/70 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-violet-500/10 p-3 text-violet-700 dark:text-violet-300"><TrendingUp className="size-5" aria-hidden /></div>
            <div><p className="text-slate-600 dark:text-slate-300 text-sm">Moyenne affichée</p><p className="text-2xl font-semibold tabular-nums">{moyenne}</p><p className="text-slate-600 dark:text-slate-300 text-xs">Bulletins correspondant aux filtres</p></div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm">
        <CardHeader className="border-b bg-muted/20 pb-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <CardTitle className="text-lg">Liste des bulletins</CardTitle>
              <CardDescription className="mt-1">{filtres.length} bulletin(s) correspondant aux filtres</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <NativeSelect aria-label="Classe à produire" value={classeChoisie} onChange={(e) => naviguer(e.target.value, periodeChoisie)} className="min-w-36">
                <option value="">Classe à produire</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
              </NativeSelect>
              <NativeSelect aria-label="Période à produire" value={periodeChoisie} onChange={(e) => naviguer(classeChoisie, e.target.value)} className="min-w-36">
                <option value="">Période à produire</option>
                {periodes.map((p) => <option key={p.id} value={p.id}>{p.libelle}</option>)}
              </NativeSelect>
              {classeChoisie ? (
                <Button asChild variant="outline">
                  <a href={`/api/bulletins/conseil-orientation/${classeChoisie}`} target="_blank" rel="noopener noreferrer">
                    <FileText aria-hidden /> Conseil d’orientation
                  </a>
                </Button>
              ) : null}
              <Button onClick={generer} disabled={!classeChoisie || !periodeChoisie || enCours} className="bg-cyan-700 text-white shadow-sm hover:bg-cyan-800 focus-visible:ring-2 focus-visible:ring-cyan-700 dark:bg-cyan-600 dark:hover:bg-cyan-500">
                <Play aria-hidden /> {enCours ? "Calcul…" : "Produire"}
              </Button>
            </div>
          </div>
        </CardHeader>
        {rapport ? <div className="border-b bg-muted/30 p-4 text-sm">
          <p><strong>{rapport.bulletinsEcrits}</strong> bulletin(s) produit(s) pour {rapport.classe} — {rapport.periode}, soit <strong>{rapport.moyennesEcrites}</strong> moyennes de matière.</p>
          {rapport.ignores.length > 0 ? <p className="mt-2 text-amber-700 dark:text-amber-300">{rapport.sansNote} élève(s) ignoré(s) : {rapport.ignores.map((i) => `${i.nom} — ${i.raison}`).join("; ")}</p> : null}
        </div> : null}
        {classeChoisie && periodeChoisie && (publiesSelectionnes > 0 || attenteSelectionnes > 0) ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/10 px-4 py-3">
            <p className="text-slate-600 dark:text-slate-300 text-sm">{publiesSelectionnes} publié(s) · {attenteSelectionnes} en attente. La publication rend les bulletins visibles aux familles.</p>
            <div className="flex gap-2">
              {attenteSelectionnes > 0 ? <Button size="sm" disabled={enCours} onClick={() => demarrer(async () => {
                const r = await publierClasse(classeChoisie, periodeChoisie);
                toast[r.ok ? "success" : "error"](r.message ?? "Terminé.");
                routeur.refresh();
              })}><Send aria-hidden /> Publier la classe</Button> : null}
              {publiesSelectionnes > 0 ? <Button size="sm" variant="outline" disabled={enCours} onClick={() => {
                if (!window.confirm("Retirer ces bulletins de la publication ? Les notifications déjà envoyées ne seront pas rappelées.")) return;
                demarrer(async () => {
                  const r = await depublierClasse(classeChoisie, periodeChoisie);
                  toast[r.ok ? "success" : "error"](r.message ?? "Terminé.");
                  routeur.refresh();
                });
              }}><EyeOff aria-hidden /> Dépublier</Button> : null}
            </div>
          </div>
        ) : null}
        <CardContent className="p-0">
          {visibles.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
              <FileText className="text-slate-600 dark:text-slate-300 size-8" aria-hidden />
              <p className="font-medium">Aucun bulletin trouvé</p>
              <p className="text-slate-600 dark:text-slate-300 text-sm">Modifiez la recherche ou les filtres, ou produisez les bulletins d’une classe.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40 text-foreground">
                  <TableRow>
                    <TableHead>Élève</TableHead><TableHead>Matricule</TableHead><TableHead>Classe</TableHead>
                    <TableHead className="text-right">Moyenne générale</TableHead><TableHead className="text-right">Rang</TableHead>
                    <TableHead>Statut</TableHead><TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibles.map((b) => (
                    <TableRow key={b.inscriptionId + b.periodeId} className="transition-colors hover:bg-cyan-500/[0.04]">
                      <TableCell className="min-w-44">
                        <div className="font-medium">{b.eleve}</div>
                        <div className="text-slate-600 dark:text-slate-300 text-xs">{b.periode}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{b.matricule}</TableCell>
                      <TableCell>{b.classe}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{b.moyenne !== null && b.moyenne !== "" ? Number(b.moyenne).toFixed(2).replace(".", ",") : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.rang ?? "—"}</TableCell>
                      <TableCell><Badge variant={b.publie ? "default" : "outline"}>{b.publie ? "Publié" : "En attente"}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <AvisConseil inscriptionId={b.inscriptionId} periodeId={b.periodeId} eleve={b.eleve} mention={b.mention} appreciation={b.appreciation} decision={b.decision} publie={b.publie} />
                          <Button asChild variant="ghost" size="sm">
                            <a href={`/api/bulletins/${b.inscriptionId}/${b.periodeId}`} target="_blank" rel="noopener noreferrer" aria-label={`Imprimer le bulletin de ${b.eleve}`}>
                              <FileText aria-hidden /> <span className="hidden xl:inline">Imprimer</span>
                            </a>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
            <p className="text-slate-600 dark:text-slate-300 text-sm">Affichage de {filtres.length ? (pageCourante - 1) * parPage + 1 : 0} à {Math.min(pageCourante * parPage, filtres.length)} sur {filtres.length}</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={pageCourante <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Précédent</Button>
              <span className="text-slate-600 dark:text-slate-300 text-sm">{pageCourante} / {pages}</span>
              <Button variant="outline" size="sm" disabled={pageCourante >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>Suivant</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
