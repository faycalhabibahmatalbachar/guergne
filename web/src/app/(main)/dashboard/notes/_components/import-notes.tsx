"use client";

import { useRef, useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { AlertTriangle, CheckCircle2, Download, Upload } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import {
  analyserFichierNotes,
  importerNotes,
  type ResultatImportNotes,
} from "../actions-import";

/**
 * Import des notes d'une évaluation.
 *
 * TOUT OU RIEN, ET C'EST DÉLIBÉRÉ
 * --------------------------------
 * Contrairement à l'import des élèves — où chaque inscription est un acte
 * indépendant — une grille de notes est un tout. Une classe à moitié notée
 * fausse la moyenne et le rang de TOUS les élèves, et personne ne sait quelles
 * lignes ont été prises. À la moindre erreur, rien n'est écrit.
 *
 * Le gabarit est PRÉ-REMPLI avec la classe et les notes déjà saisies : sans
 * cela, le professeur recopierait cinquante matricules et l'import lui
 * coûterait plus cher que la saisie à l'écran.
 */
export function ImportNotes({
  evaluationId,
  titre,
  verrouillee,
}: {
  evaluationId: string;
  titre: string;
  verrouillee: boolean;
}) {
  const routeur = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [resultat, setResultat] = useState<ResultatImportNotes | null>(null);
  const [termine, setTermine] = useState(false);
  const [enCours, demarrer] = useTransition();
  const champ = useRef<HTMLInputElement>(null);

  function corps() {
    const donnees = new FormData();
    const fichier = champ.current?.files?.[0];
    if (fichier) donnees.set("fichier", fichier);
    donnees.set("evaluationId", evaluationId);
    return donnees;
  }

  function analyser() {
    setResultat(null);
    setTermine(false);
    demarrer(async () => {
      const r = await analyserFichierNotes(corps());
      setResultat(r);
      if (!r.ok) toast.error(r.message ?? "Lecture impossible.");
    });
  }

  function confirmer() {
    demarrer(async () => {
      const r = await importerNotes(corps());
      setResultat(r);
      setTermine(r.ok);
      toast[r.ok ? "success" : "error"](r.message ?? "Terminé.");
      if (r.ok) routeur.refresh();
    });
  }

  const rapport = resultat?.rapport;
  const problemes = rapport
    ? [...rapport.erreurs, ...rapport.doublonsFichier].sort((a, b) => a.ligne - b.ligne)
    : [];

  return (
    <Dialog
      open={ouvert}
      onOpenChange={(v) => {
        setOuvert(v);
        if (!v) {
          setResultat(null);
          setTermine(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={verrouillee}>
          <Upload aria-hidden />
          Importer
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importer les notes — {titre}</DialogTitle>
          <DialogDescription>
            La grille est pré-remplie avec la classe et les notes déjà saisies. Remplissez la
            colonne Note, puis redéposez le fichier.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a href={`/api/notes/gabarit/${evaluationId}`} download>
                <Download aria-hidden />
                Télécharger la grille
              </a>
            </Button>

            <input
              ref={champ}
              type="file"
              accept=".xlsx,.xlsm,.csv,.txt"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) analyser();
              }}
            />
            <Button onClick={() => champ.current?.click()} disabled={enCours}>
              <Upload aria-hidden />
              {enCours ? "Lecture…" : "Déposer le fichier rempli"}
            </Button>
          </div>

          {rapport ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 rounded-md border p-3">
                <div>
                  <p className="text-muted-foreground text-xs">
                    {termine ? "Notes écrites" : "Notes lues"}
                  </p>
                  <p className="font-semibold text-emerald-600 text-xl tabular-nums dark:text-emerald-400">
                    {resultat?.ecrites ?? rapport.valides.length}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Erreurs</p>
                  <p
                    className={`font-semibold text-xl tabular-nums ${
                      problemes.length > 0 ? "text-destructive" : ""
                    }`}
                  >
                    {problemes.length}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Absents du fichier</p>
                  <p className="font-semibold text-xl tabular-nums">
                    {rapport.nonFournis.length}
                  </p>
                </div>
              </div>

              {rapport.colonnesIgnorees.length > 0 ? (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  Colonnes non reconnues, donc ignorées : {rapport.colonnesIgnorees.join(", ")}.
                </p>
              ) : null}

              {problemes.length > 0 ? (
                <>
                  <p className="flex items-center gap-2 text-destructive text-sm">
                    <AlertTriangle aria-hidden className="size-4" />
                    Rien ne sera écrit tant que ces lignes ne sont pas corrigées : une classe à
                    moitié notée fausse la moyenne de tous les élèves.
                  </p>
                  <div className="max-h-60 overflow-y-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-20">Ligne</TableHead>
                          <TableHead className="w-32">Colonne</TableHead>
                          <TableHead>Problème</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {problemes.map((p, i) => (
                          <TableRow key={`${p.ligne}-${i}`}>
                            <TableCell className="tabular-nums">{p.ligne}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {p.colonne ?? "—"}
                            </TableCell>
                            <TableCell>{p.message}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : null}

              {rapport.nonFournis.length > 0 ? (
                <p className="text-muted-foreground text-sm">
                  Absents du fichier, note inchangée :{" "}
                  {rapport.nonFournis
                    .slice(0, 6)
                    .map((n) => n.eleve)
                    .join(", ")}
                  {rapport.nonFournis.length > 6 ? ` et ${rapport.nonFournis.length - 6} autre(s)` : ""}.
                </p>
              ) : null}

              {rapport.valides.length > 0 && !termine && problemes.length === 0 ? (
                <div className="max-h-64 overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Élève</TableHead>
                        <TableHead className="text-right">Actuelle</TableHead>
                        <TableHead className="text-right">Nouvelle</TableHead>
                        <TableHead>Statut</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rapport.valides.map((n) => (
                        <TableRow key={n.inscriptionId}>
                          <TableCell>
                            {n.eleve}
                            <span className="text-muted-foreground ml-2 font-mono text-xs">
                              {n.matricule}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {n.ancienneValeur ?? "—"}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {n.valeur ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {n.statut === "NOTEE" ? "" : n.statut.toLowerCase().replace(/_/g, " ")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOuvert(false)}>
            Fermer
          </Button>
          {rapport && !termine && problemes.length === 0 && rapport.valides.length > 0 ? (
            <Button onClick={confirmer} disabled={enCours}>
              <CheckCircle2 aria-hidden />
              {enCours ? "Écriture…" : `Enregistrer ces ${rapport.valides.length} note(s)`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
