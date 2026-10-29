"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive, Download, Eye, EyeOff, ExternalLink, FileText, Maximize2, Minimize2, Play, Printer, Search, Send, X,
  Clock3, CheckCircle2, TrendingUp, UserRound, Users,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { genererPourClasse, type ResultatGeneration } from "../actions";
import { depublierClasse, publierClasse } from "../actions-conseil";
import { AvisConseil } from "./avis-conseil";


type FichierArchive = { nom: string; contenu: Uint8Array };

const tableCrc32 = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let valeur = n;
    for (let bit = 0; bit < 8; bit++) {
      valeur = valeur & 1 ? 0xedb88320 ^ (valeur >>> 1) : valeur >>> 1;
    }
    table[n] = valeur >>> 0;
  }
  return table;
})();

function calculerCrc32(donnees: Uint8Array): number {
  let crc = 0xffffffff;
  for (const octet of donnees) {
    const index = (crc ^ octet) & 0xff;
    crc = (tableCrc32[index] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function nomFichierSecurise(valeur: string): string {
  return valeur
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "bulletin";
}

/** Crée une archive ZIP sans dépendance externe ; les PDF sont déjà compressés. */
function creerArchiveZip(fichiers: FichierArchive[]): Uint8Array {
  if (fichiers.length > 0xffff) {
    throw new Error("Trop de bulletins pour créer une seule archive ZIP.");
  }

  const encodeur = new TextEncoder();
  const morceaux: Uint8Array[] = [];
  const entrees: Array<{ nom: Uint8Array; crc: number; taille: number; decalage: number }> = [];
  const maintenant = new Date();
  const heureDos = (maintenant.getHours() << 11) | (maintenant.getMinutes() << 5) | Math.floor(maintenant.getSeconds() / 2);
  const dateDos = ((Math.max(1980, maintenant.getFullYear()) - 1980) << 9) | ((maintenant.getMonth() + 1) << 5) | maintenant.getDate();
  let decalage = 0;

  for (const fichier of fichiers) {
    const nom = encodeur.encode(fichier.nom);
    if (nom.byteLength > 0xffff || fichier.contenu.byteLength > 0xffffffff) {
      throw new Error("Un fichier est trop volumineux pour être ajouté à l’archive ZIP.");
    }
    const crc = calculerCrc32(fichier.contenu);
    const entete = new Uint8Array(30 + nom.byteLength);
    const vue = new DataView(entete.buffer);
    vue.setUint32(0, 0x04034b50, true);
    vue.setUint16(4, 20, true);
    vue.setUint16(6, 0x0800, true);
    vue.setUint16(8, 0, true);
    vue.setUint16(10, heureDos, true);
    vue.setUint16(12, dateDos, true);
    vue.setUint32(14, crc, true);
    vue.setUint32(18, fichier.contenu.byteLength, true);
    vue.setUint32(22, fichier.contenu.byteLength, true);
    vue.setUint16(26, nom.byteLength, true);
    vue.setUint16(28, 0, true);
    entete.set(nom, 30);

    morceaux.push(entete, fichier.contenu);
    entrees.push({ nom, crc, taille: fichier.contenu.byteLength, decalage });
    decalage += entete.byteLength + fichier.contenu.byteLength;
  }

  const decalageCentral = decalage;
  for (const entree of entrees) {
    const entete = new Uint8Array(46 + entree.nom.byteLength);
    const vue = new DataView(entete.buffer);
    vue.setUint32(0, 0x02014b50, true);
    vue.setUint16(4, 20, true);
    vue.setUint16(6, 20, true);
    vue.setUint16(8, 0x0800, true);
    vue.setUint16(10, 0, true);
    vue.setUint16(12, heureDos, true);
    vue.setUint16(14, dateDos, true);
    vue.setUint32(16, entree.crc, true);
    vue.setUint32(20, entree.taille, true);
    vue.setUint32(24, entree.taille, true);
    vue.setUint16(28, entree.nom.byteLength, true);
    vue.setUint16(30, 0, true);
    vue.setUint16(32, 0, true);
    vue.setUint16(34, 0, true);
    vue.setUint16(36, 0, true);
    vue.setUint32(38, 0, true);
    vue.setUint32(42, entree.decalage, true);
    entete.set(entree.nom, 46);
    morceaux.push(entete);
    decalage += entete.byteLength;
  }

  const fin = new Uint8Array(22);
  const vueFin = new DataView(fin.buffer);
  vueFin.setUint32(0, 0x06054b50, true);
  vueFin.setUint16(4, 0, true);
  vueFin.setUint16(6, 0, true);
  vueFin.setUint16(8, entrees.length, true);
  vueFin.setUint16(10, entrees.length, true);
  vueFin.setUint32(12, decalage - decalageCentral, true);
  vueFin.setUint32(16, decalageCentral, true);
  vueFin.setUint16(20, 0, true);
  morceaux.push(fin);

  const tailleTotale = morceaux.reduce((total, morceau) => total + morceau.byteLength, 0);
  const archive = new Uint8Array(tailleTotale);
  let position = 0;
  for (const morceau of morceaux) {
    archive.set(morceau, position);
    position += morceau.byteLength;
  }
  return archive;
}


export interface BulletinListe {
  inscriptionId: string;
  eleveId: string;
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
  const [telechargementEnCours, setTelechargementEnCours] = useState(false);
  const controleurTelechargement = useRef<AbortController | null>(null);
  const [impressionEnCours, setImpressionEnCours] = useState(false);
  const [apercuImpression, setApercuImpression] = useState<{ url: string; nombre: number } | null>(null);
  const [apercuImpressionPret, setApercuImpressionPret] = useState(false);
  const [apercuImpressionPleinEcran, setApercuImpressionPleinEcran] = useState(false);
  const impressionIframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const url = apercuImpression?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [apercuImpression?.url]);
  const [bulletinApercu, setBulletinApercu] = useState<BulletinListe | null>(null);
  const [apercuPleinEcran, setApercuPleinEcran] = useState(false);
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


  async function telechargerBulletins() {
    if (filtres.length === 0 || telechargementEnCours) return;

    const controleur = new AbortController();
    controleurTelechargement.current = controleur;
    setTelechargementEnCours(true);
    const selection = filtres;
    const idNotification = toast.loading("Préparation de " + selection.length + " bulletin(s)…");
    try {
      const fichiers: FichierArchive[] = [];
      const tailleGroupe = 4;

      for (let index = 0; index < selection.length; index += tailleGroupe) {
        const groupe = selection.slice(index, index + tailleGroupe);
        const telecharges = await Promise.all(groupe.map(async (bulletin) => {
          const reponse = await fetch(
            "/api/bulletins/" + encodeURIComponent(bulletin.inscriptionId) + "/" + encodeURIComponent(bulletin.periodeId) + "?telecharger=1",
            { credentials: "same-origin", signal: controleur.signal },
          );
          if (!reponse.ok) {
            throw new Error("Le bulletin de " + bulletin.eleve + " n’a pas pu être téléchargé (HTTP " + reponse.status + ").");
          }

          return {
            nom: nomFichierSecurise(bulletin.classe) + "-" + nomFichierSecurise(bulletin.eleve) + "-" + nomFichierSecurise(bulletin.periode) + "-" + nomFichierSecurise(bulletin.matricule) + ".pdf",
            contenu: new Uint8Array(await reponse.arrayBuffer()),
          };
        }));

        if (controleur.signal.aborted) throw new DOMException("Téléchargement annulé.", "AbortError");
        fichiers.push(...telecharges);
        const progression = Math.min(index + groupe.length, selection.length);
        toast.loading("Téléchargement des PDF : " + progression + "/" + selection.length, { id: idNotification });
      }

      if (controleur.signal.aborted) throw new DOMException("Téléchargement annulé.", "AbortError");
      const archive = creerArchiveZip(fichiers);
      const contenuZip = archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer;
      const url = URL.createObjectURL(new Blob([contenuZip], { type: "application/zip" }));
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = "bulletins-scolaires-" + new Date().toISOString().slice(0, 10) + ".zip";
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(fichiers.length + " bulletin(s) regroupé(s) dans une archive ZIP.", { id: idNotification });
    } catch (erreur) {
      if (controleur.signal.aborted || (erreur instanceof DOMException && erreur.name === "AbortError")) {
        toast.info("Téléchargement annulé.", { id: idNotification });
      } else {
        toast.error(erreur instanceof Error ? erreur.message : "Impossible de télécharger les bulletins.", { id: idNotification });
      }
    } finally {
      if (controleurTelechargement.current === controleur) controleurTelechargement.current = null;
      setTelechargementEnCours(false);
    }
  }

  function annulerTelechargement() {
    if (!controleurTelechargement.current) return;
    controleurTelechargement.current.abort();
  }

  async function preparerImpressionBulletins() {
    if (filtres.length === 0 || impressionEnCours) return;

    const selection = filtres.map((bulletin) => ({
      inscriptionId: bulletin.inscriptionId,
      periodeId: bulletin.periodeId,
    }));
    setImpressionEnCours(true);
    setApercuImpressionPret(false);
    const idNotification = toast.loading("Préparation de l’aperçu de " + selection.length + " bulletin(s)…");

    try {
      const reponse = await fetch("/api/bulletins/impression", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulletins: selection }),
      });

      if (!reponse.ok) {
        const detail = await reponse.text().catch(() => "");
        throw new Error(detail || "Impossible de préparer les bulletins à imprimer.");
      }

      const pdf = await reponse.blob();
      const url = URL.createObjectURL(pdf);
      setApercuImpression({ url, nombre: selection.length });
      toast.success("Aperçu prêt : " + selection.length + " bulletin(s). Vérifiez-les avant d’imprimer.", { id: idNotification });
    } catch (erreur) {
      toast.error(erreur instanceof Error ? erreur.message : "Impossible de préparer les bulletins à imprimer.", { id: idNotification });
    } finally {
      setImpressionEnCours(false);
    }
  }

  function fermerApercuImpression() {
    setApercuImpression(null);
    setApercuImpressionPret(false);
    setApercuImpressionPleinEcran(false);
  }

  function confirmerImpressionBulletins() {
    const fenetre = impressionIframeRef.current?.contentWindow;
    if (!fenetre || !apercuImpressionPret) {
      toast.error("L’aperçu n’est pas encore prêt. Veuillez patienter.");
      return;
    }
    fenetre.focus();
    fenetre.print();
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
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={exporter} disabled={filtres.length === 0}>
                <Download aria-hidden /> Exporter en CSV
              </Button>
              <Button
                onClick={telechargerBulletins}
                disabled={filtres.length === 0 || telechargementEnCours}
                className="bg-cyan-700 text-white hover:bg-cyan-800 dark:bg-cyan-600 dark:hover:bg-cyan-500"
              >
                <Archive aria-hidden />
                {telechargementEnCours ? "Préparation du ZIP…" : "Télécharger les bulletins"}
              </Button>
              {telechargementEnCours ? (
                <Button type="button" variant="destructive" onClick={annulerTelechargement}>
                  <X aria-hidden /> Annuler le téléchargement
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={preparerImpressionBulletins}
                disabled={filtres.length === 0 || impressionEnCours}
              >
                <Printer aria-hidden />
                {impressionEnCours ? "Préparation de l’aperçu…" : "Imprimer les bulletins"}
              </Button>
            </div>
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
                        <Link href={`/dashboard/eleves/${b.eleveId}`} className="group inline-flex max-w-full items-center gap-1.5 rounded-sm font-semibold text-slate-900 underline-offset-4 hover:text-cyan-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 dark:text-slate-100 dark:hover:text-cyan-300" aria-label={`Ouvrir le dossier de ${b.eleve}`}>
                          <UserRound className="size-4 shrink-0 text-cyan-700 dark:text-cyan-300" aria-hidden />
                          <span>{b.eleve}</span>
                          <ExternalLink className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
                        </Link>
                        <div className="mt-1 text-slate-600 dark:text-slate-300 text-xs">{b.periode}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{b.matricule}</TableCell>
                      <TableCell>{b.classe}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{b.moyenne !== null && b.moyenne !== "" ? Number(b.moyenne).toFixed(2).replace(".", ",") : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.rang ?? "—"}</TableCell>
                      <TableCell><Badge variant={b.publie ? "default" : "outline"}>{b.publie ? "Publié" : "En attente"}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <AvisConseil inscriptionId={b.inscriptionId} periodeId={b.periodeId} eleve={b.eleve} mention={b.mention} appreciation={b.appreciation} decision={b.decision} publie={b.publie} />
                          <Button type="button" variant="outline" size="sm" onClick={() => { setApercuPleinEcran(false); setBulletinApercu(b); }} aria-label={`Prévisualiser le bulletin de ${b.eleve}`} title="Aperçu du bulletin" className="h-7 min-w-[5.75rem] justify-center gap-2 px-4 py-0 text-xs border-cyan-700/30 text-cyan-800 hover:bg-cyan-50 hover:text-cyan-950 dark:border-cyan-400/30 dark:text-cyan-200 dark:hover:bg-cyan-950/50">
                            <Eye className="size-3.5 shrink-0" aria-hidden /> <span className="hidden md:inline">Aperçu</span>
                          </Button>
                          <Button asChild variant="ghost" size="sm">
                            <a href={`/api/bulletins/${b.inscriptionId}/${b.periodeId}`} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir pour imprimer le bulletin de ${b.eleve}`} title="Ouvrir le PDF pour impression">
                              <Printer aria-hidden /> <span className="hidden xl:inline">Imprimer</span>
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

      {recherche.trim() && filtres.length > 0 ? (
        <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm dark:border-border">
          <CardHeader className="border-b bg-slate-50/70 py-3 dark:bg-muted/20">
            <CardTitle className="flex items-center gap-2 text-sm font-bold">
              <UserRound className="size-4 text-cyan-700 dark:text-cyan-300" aria-hidden />
              Aperçu de la recherche d’élève
            </CardTitle>
            <CardDescription>Premier résultat correspondant à votre recherche, comme dans l’onglet Élèves.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-base font-bold text-slate-900 dark:text-foreground">{filtres[0].eleve}</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-muted-foreground">Matricule : {filtres[0].matricule} · Classe : {filtres[0].classe}</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-muted-foreground">Période : {filtres[0].periode} · Moyenne générale : {filtres[0].moyenne !== null && filtres[0].moyenne !== "" ? Number(filtres[0].moyenne).toFixed(2).replace(".", ",") : "—"} · Rang : {filtres[0].rang ?? "—"}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button type="button" variant="outline" className="gap-2" onClick={() => { setApercuPleinEcran(false); setBulletinApercu(filtres[0]); }}>
                <Eye className="size-4" aria-hidden /> Aperçu du bulletin
              </Button>
              <Button asChild className="gap-2 bg-cyan-700 text-white hover:bg-cyan-800 dark:bg-cyan-600 dark:hover:bg-cyan-500">
                <Link href={`/dashboard/eleves/${filtres[0].eleveId}`}>Ouvrir le dossier <ExternalLink className="size-4" aria-hidden /></Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {bulletinApercu ? (
        <Dialog open onOpenChange={(ouvert) => { if (!ouvert) { setBulletinApercu(null); setApercuPleinEcran(false); } }}>
          <DialogContent showCloseButton className={apercuPleinEcran ? "fixed inset-0 left-0 top-0 z-50 flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:max-w-none sm:rounded-none" : "flex h-[88vh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl"}>
            <DialogHeader className="shrink-0 flex-row items-start justify-between gap-3 border-b bg-card p-4 pr-24">
              <div className="min-w-0">
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <FileText className="size-5 shrink-0 text-cyan-700 dark:text-cyan-300" aria-hidden />
                  Aperçu du bulletin
                </DialogTitle>
                <DialogDescription className="mt-1">
                  {bulletinApercu.eleve} · {bulletinApercu.classe} · {bulletinApercu.periode}
                </DialogDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="absolute right-12 top-2 border-cyan-700/30 text-cyan-800 hover:bg-cyan-50 dark:border-cyan-400/30 dark:text-cyan-200 dark:hover:bg-cyan-950/50"
                onClick={() => setApercuPleinEcran((plein) => !plein)}
                aria-label={apercuPleinEcran ? "Quitter le plein écran" : "Agrandir le bulletin en plein écran"}
                title={apercuPleinEcran ? "Réduire" : "Plein écran"}
              >
                {apercuPleinEcran ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
              </Button>
            </DialogHeader>
            <div className="min-h-0 flex-1 bg-slate-100 p-2 dark:bg-slate-950 sm:p-4">
              <iframe
                key={bulletinApercu.inscriptionId + bulletinApercu.periodeId}
                title={"Aperçu PDF du bulletin de " + bulletinApercu.eleve}
                src={"/api/bulletins/" + bulletinApercu.inscriptionId + "/" + bulletinApercu.periodeId}
                className="h-full w-full rounded-lg border border-slate-300 bg-white shadow-sm dark:border-slate-700"
              />
            </div>
            <DialogFooter className="shrink-0 flex-row flex-wrap justify-between gap-2 border-t bg-card px-4 py-3">
              <Button asChild variant="outline" className="gap-2">
                <a href={"/api/bulletins/" + bulletinApercu.inscriptionId + "/" + bulletinApercu.periodeId + "?telecharger=1"} aria-label={"Télécharger le bulletin de " + bulletinApercu.eleve}>
                  <Download aria-hidden /> Télécharger PDF
                </a>
              </Button>
              <Button asChild className="gap-2 bg-cyan-700 text-white hover:bg-cyan-800 dark:bg-cyan-600 dark:hover:bg-cyan-500">
                <a href={"/api/bulletins/" + bulletinApercu.inscriptionId + "/" + bulletinApercu.periodeId} target="_blank" rel="noopener noreferrer">
                  <Printer aria-hidden /> Ouvrir pour imprimer
                </a>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      <Dialog
        open={Boolean(apercuImpression)}
        onOpenChange={(ouvert) => { if (!ouvert) fermerApercuImpression(); }}
      >
        <DialogContent className={apercuImpressionPleinEcran ? "fixed inset-0 left-0 top-0 z-50 flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:max-w-none sm:rounded-none" : "flex h-[88vh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl"}>
          <DialogHeader className="relative shrink-0 flex-row items-start justify-between gap-3 border-b bg-card p-4 pr-24">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Printer className="size-5 text-cyan-700 dark:text-cyan-300" aria-hidden />
                Aperçu des bulletins avant impression
              </DialogTitle>
              <DialogDescription className="mt-1">
                {apercuImpression?.nombre ?? 0} bulletin(s) correspondant à votre recherche et à vos filtres.
                Vérifiez l’aperçu, puis cliquez sur « Imprimer » pour confirmer.
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="absolute right-12 top-2 border-cyan-700/30 text-cyan-800 hover:bg-cyan-50 dark:border-cyan-400/30 dark:text-cyan-200 dark:hover:bg-cyan-950/50"
              onClick={() => setApercuImpressionPleinEcran((plein) => !plein)}
              aria-label={apercuImpressionPleinEcran ? "Quitter le plein écran de l’aperçu d’impression" : "Agrandir l’aperçu des bulletins en plein écran"}
              title={apercuImpressionPleinEcran ? "Réduire" : "Plein écran"}
            >
              {apercuImpressionPleinEcran ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
            </Button>
          </DialogHeader>
          <div className="min-h-0 flex-1 bg-slate-100 p-2 dark:bg-slate-950 sm:p-4">
            {apercuImpression ? (
              <iframe
                key={apercuImpression.url}
                ref={impressionIframeRef}
                title="Aperçu PDF des bulletins filtrés"
                src={apercuImpression.url}
                onLoad={() => setApercuImpressionPret(true)}
                className="h-full w-full rounded-lg border border-slate-300 bg-white shadow-sm dark:border-slate-700"
              />
            ) : null}
          </div>
          <DialogFooter className="shrink-0 flex-row flex-wrap justify-between gap-2 border-t bg-card px-4 py-3">
            <Button type="button" variant="outline" onClick={fermerApercuImpression}>
              Annuler
            </Button>
            <Button
              type="button"
              onClick={confirmerImpressionBulletins}
              disabled={!apercuImpressionPret}
              className="gap-2 bg-cyan-700 text-white hover:bg-cyan-800 dark:bg-cyan-600 dark:hover:bg-cyan-500"
            >
              <Printer aria-hidden /> Imprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
