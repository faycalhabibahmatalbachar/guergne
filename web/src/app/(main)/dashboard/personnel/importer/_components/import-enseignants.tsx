"use client";

import { useRef, useState, useTransition } from "react";

import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import {
  analyserFichierEnseignants,
  importerEnseignants,
  type ResultatImportEnseignants,
} from "../../actions-import";

/**
 * Import du personnel enseignant.
 *
 * Deux temps, comme pour les élèves : on lit et on montre, puis on écrit. Le
 * volume est plus faible — quinze à cinquante personnes — mais l'enjeu est le
 * même : un enseignant créé en double a deux matricules, et ses heures sont
 * comptées deux fois dans la charge de service.
 */
export function ImportEnseignants() {
  const [resultat, setResultat] = useState<ResultatImportEnseignants | null>(null);
  const [termine, setTermine] = useState(false);
  const [enCours, demarrer] = useTransition();
  const champFichier = useRef<HTMLInputElement>(null);
  const [nomFichier, setNomFichier] = useState<string | null>(null);

  function analyser(fichier: File) {
    setResultat(null);
    setTermine(false);
    setNomFichier(fichier.name);

    const donnees = new FormData();
    donnees.set("fichier", fichier);

    demarrer(async () => {
      const r = await analyserFichierEnseignants(donnees);
      setResultat(r);
      if (!r.ok) toast.error(r.message ?? "Lecture impossible.");
    });
  }

  function confirmer() {
    const fichier = champFichier.current?.files?.[0];
    if (!fichier) return;

    const donnees = new FormData();
    donnees.set("fichier", fichier);

    demarrer(async () => {
      const r = await importerEnseignants(donnees);
      setResultat(r);
      setTermine(r.ok);
      if (r.ok) toast.success(r.message ?? "Import terminé.");
      else toast.error(r.message ?? "L'import a échoué.");
    });
  }

  const rapport = resultat?.rapport;
  const problemes = rapport
    ? [...rapport.erreurs, ...rapport.doublonsFichier, ...rapport.dejaPresents].sort(
        (a, b) => a.ligne - b.ligne,
      )
    : [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Préparer le fichier</CardTitle>
          <CardDescription>
            Le gabarit porte les colonnes attendues, la liste des statuts admis et les
            matières de l&apos;établissement avec leur code. Ce sont les deux colonnes où une
            valeur approximative fait échouer la ligne.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <a href="/api/personnel/gabarit" download>
              <Download aria-hidden />
              Télécharger le gabarit
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Déposer le fichier rempli</CardTitle>
          <CardDescription>
            Formats acceptés : .xlsx et .csv. Rien n&apos;est écrit à cette étape.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={champFichier}
            type="file"
            accept=".xlsx,.xlsm,.csv,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) analyser(f);
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => champFichier.current?.click()} disabled={enCours}>
              <Upload aria-hidden />
              Choisir un fichier
            </Button>
            {nomFichier ? (
              <span className="text-muted-foreground flex items-center gap-2 text-sm">
                <FileSpreadsheet aria-hidden className="size-4" />
                {nomFichier}
              </span>
            ) : null}
            {enCours ? <span className="text-muted-foreground text-sm">Lecture…</span> : null}
          </div>
        </CardContent>
      </Card>

      {rapport ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Vérifier avant d&apos;écrire</CardTitle>
            <CardDescription>
              {termine ? "Import terminé." : "Rien n'a encore été enregistré."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {rapport.colonnesManquantes.length > 0 ? (
              <p className="text-destructive text-sm">
                Colonnes absentes : <strong>{rapport.colonnesManquantes.join(", ")}</strong>.
              </p>
            ) : null}

            {rapport.colonnesIgnorees.length > 0 ? (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Colonnes non reconnues, donc <strong>ignorées</strong> :{" "}
                {rapport.colonnesIgnorees.join(", ")}.
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-4">
              {[
                {
                  libelle: termine ? "Créés" : "Prêts à créer",
                  valeur: resultat?.crees ?? rapport.valides.length,
                  bon: true,
                },
                { libelle: "Lignes en erreur", valeur: rapport.erreurs.length },
                { libelle: "Doublons du fichier", valeur: rapport.doublonsFichier.length },
                { libelle: "Matricules déjà pris", valeur: rapport.dejaPresents.length },
              ].map((k) => (
                <div key={k.libelle}>
                  <p className="text-muted-foreground text-xs">{k.libelle}</p>
                  <p
                    className={`mt-0.5 font-semibold text-xl tabular-nums ${
                      k.bon
                        ? "text-emerald-600 dark:text-emerald-400"
                        : k.valeur > 0
                          ? "text-amber-600 dark:text-amber-400"
                          : ""
                    }`}
                  >
                    {k.valeur}
                  </p>
                </div>
              ))}
            </div>

            {problemes.length > 0 ? (
              <div className="max-h-80 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Ligne</TableHead>
                      <TableHead className="w-48">Colonne</TableHead>
                      <TableHead>Problème</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {problemes.map((p, i) => (
                      <TableRow key={`${p.ligne}-${p.colonne ?? "x"}-${i}`}>
                        <TableCell className="tabular-nums">{p.ligne}</TableCell>
                        <TableCell className="text-muted-foreground">{p.colonne ?? "—"}</TableCell>
                        <TableCell>{p.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}

            {rapport.valides.length > 0 && !termine ? (
              <div className="space-y-3">
                <div className="max-h-72 overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Ligne</TableHead>
                        <TableHead>Matricule</TableHead>
                        <TableHead>Enseignant</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead>Matières</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rapport.valides.map((e) => (
                        <TableRow key={e.ligne}>
                          <TableCell className="tabular-nums">{e.ligne}</TableCell>
                          <TableCell className="font-mono text-xs">{e.matricule}</TableCell>
                          <TableCell>
                            {e.prenom} {e.nom}
                            {e.heuresContractuelles ? (
                              <span className="text-muted-foreground"> · {e.heuresContractuelles} h</span>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{e.statut}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {e.matieresLibelles.join(", ") || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center gap-3">
                  <Button onClick={confirmer} disabled={enCours}>
                    <CheckCircle2 aria-hidden />
                    {enCours ? "Création…" : `Créer ces ${rapport.valides.length} enseignant(s)`}
                  </Button>
                  <p className="text-muted-foreground text-sm">
                    Chaque enseignant est créé séparément : un refus n&apos;annule pas les autres.
                  </p>
                </div>
              </div>
            ) : null}

            {rapport.valides.length === 0 && !termine && rapport.colonnesManquantes.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangle aria-hidden className="size-4" />
                Aucune ligne exploitable : corrigez le fichier puis redéposez-le.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
