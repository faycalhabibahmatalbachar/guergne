"use client";

import { useEffect, useState, useTransition } from "react";

import { Copy, Info } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { copierCoefficients, definirCoefficient } from "../actions";
import type {
  CoefficientSaisi,
  LigneAnnee,
  LigneMatiere,
  LigneNiveau,
  LigneSerie,
} from "@/server/domain/parametres";

/**
 * Grille des coefficients.
 *
 * C'est l'écran le plus structurant de la configuration : sans coefficients,
 * aucune moyenne générale n'est calculable, donc aucun bulletin n'existe.
 *
 * La saisie se fait par couple (niveau × série), une colonne par réglage.
 * Un coefficient à 0 signifie « matière non enseignée à ce niveau » et
 * supprime la ligne — c'est plus naturel qu'un bouton de suppression séparé.
 */
export function OngletCoefficients({
  annees,
  anneeCourante,
  niveaux,
  series,
  matieres,
  coefficientsInitiaux,
  niveauInitial,
  serieInitiale,
}: {
  annees: LigneAnnee[];
  anneeCourante: LigneAnnee | null;
  niveaux: LigneNiveau[];
  series: LigneSerie[];
  matieres: LigneMatiere[];
  coefficientsInitiaux: CoefficientSaisi[];
  niveauInitial: string | null;
  serieInitiale: string | null;
}) {
  const [enCours, demarrer] = useTransition();
  const [niveauId, setNiveauId] = useState(niveauInitial ?? "");
  const [serieId, setSerieId] = useState(serieInitiale ?? "");

  const niveau = niveaux.find((n) => n.id === niveauId) ?? null;
  const seriesActives = series.filter((s) => s.active);

  // Naviguer recharge la page côté serveur avec les coefficients du couple
  // sélectionné : la grille peut compter plusieurs centaines de valeurs, il
  // serait absurde de toutes les envoyer au navigateur.
  useEffect(() => {
    if (!niveauId) return;
    const params = new URLSearchParams(window.location.search);
    params.set("onglet", "coefficients");
    params.set("niveau", niveauId);
    if (serieId) params.set("serie", serieId);
    else params.delete("serie");

    const cible = `${window.location.pathname}?${params}`;
    if (cible !== window.location.pathname + window.location.search) {
      window.location.replace(cible);
    }
  }, [niveauId, serieId]);

  if (!anneeCourante) {
    return (
      <Card>
        <CardContent className="py-14 text-center text-muted-foreground text-sm">
          Créez d&apos;abord une année scolaire et désignez-la comme année en cours.
        </CardContent>
      </Card>
    );
  }

  const parMatiere = new Map(coefficientsInitiaux.map((c) => [c.matiereId, c]));
  const matieresActives = matieres.filter((m) => m.active);
  const autresAnnees = annees.filter((a) => a.id !== anneeCourante.id);

  const totalCoefficients = matieresActives.reduce((somme, m) => {
    const c = parMatiere.get(m.id);
    return somme + (c ? Number(c.coefficient) : 0);
  }, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-medium text-lg">Coefficients</h2>
        <p className="text-muted-foreground text-sm">
          Année {anneeCourante.libelle}. Le coefficient pondère la matière dans la moyenne générale.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 py-4">
          <div className="grid min-w-48 gap-2">
            <Label htmlFor="niveau">Niveau</Label>
            <NativeSelect
              id="niveau"
              value={niveauId}
              onChange={(e) => {
                setNiveauId(e.target.value);
                setSerieId("");
              }}
            >
              <option value="">Choisir un niveau…</option>
              {niveaux.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.libelle}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid min-w-48 gap-2">
            <Label htmlFor="serie">Série</Label>
            <NativeSelect
              id="serie"
              value={serieId}
              disabled={!niveau?.seriesApplicables}
              onChange={(e) => setSerieId(e.target.value)}
            >
              <option value="">
                {niveau?.seriesApplicables ? "Sans série (indifférenciée)" : "Sans objet au collège"}
              </option>
              {niveau?.seriesApplicables
                ? seriesActives.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.libelle}
                    </option>
                  ))
                : null}
            </NativeSelect>
          </div>

          {autresAnnees.length > 0 ? (
            <div className="ml-auto">
              <ReprendreAnnee annees={autresAnnees} cibleId={anneeCourante.id} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {!niveauId ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <Info className="size-7 text-muted-foreground" aria-hidden />
            <p className="text-muted-foreground text-sm">
              Choisissez un niveau pour saisir ses coefficients.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Matière</TableHead>
                  <TableHead className="w-28">Coefficient</TableHead>
                  <TableHead className="w-28">Heures/sem.</TableHead>
                  <TableHead className="w-24">Interro.</TableHead>
                  <TableHead className="w-24">Devoir</TableHead>
                  <TableHead className="w-24">Compo.</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matieresActives.map((matiere) => (
                  <LigneCoefficient
                    key={matiere.id}
                    matiere={matiere}
                    existant={parMatiere.get(matiere.id) ?? null}
                    enCours={enCours}
                    onEnregistrer={(valeurs) =>
                      demarrer(async () => {
                        const r = await definirCoefficient({
                          anneeId: anneeCourante.id,
                          niveauId,
                          serieId: serieId || null,
                          matiereId: matiere.id,
                          ...valeurs,
                        });
                        toast[r.ok ? "success" : "error"](
                          r.ok
                            ? valeurs.coefficient === 0
                              ? `${matiere.libelle} retirée de ce niveau.`
                              : `${matiere.libelle} : coefficient ${valeurs.coefficient}.`
                            : (r.message ?? "Échec."),
                        );
                      })
                    }
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {niveauId ? (
        <p className="text-muted-foreground text-sm">
          Somme des coefficients :{" "}
          <span className="font-medium text-foreground tabular-nums">{totalCoefficients}</span>. C&apos;est
          le dénominateur de la moyenne générale à ce niveau.
        </p>
      ) : null}
    </div>
  );
}

function LigneCoefficient({
  matiere,
  existant,
  enCours,
  onEnregistrer,
}: {
  matiere: LigneMatiere;
  existant: CoefficientSaisi | null;
  enCours: boolean;
  onEnregistrer: (valeurs: {
    coefficient: number;
    volumeHoraire: number | null;
    poidsInterro: number;
    poidsDevoir: number;
    poidsComposition: number;
  }) => void;
}) {
  const [coefficient, setCoefficient] = useState(existant ? String(Number(existant.coefficient)) : "");
  const [heures, setHeures] = useState(existant?.volumeHoraire ? String(Number(existant.volumeHoraire)) : "");
  const [interro, setInterro] = useState(existant ? String(Number(existant.poidsInterro)) : "1");
  const [devoir, setDevoir] = useState(existant ? String(Number(existant.poidsDevoir)) : "1");
  const [compo, setCompo] = useState(existant ? String(Number(existant.poidsComposition)) : "2");

  const modifie =
    coefficient !== (existant ? String(Number(existant.coefficient)) : "") ||
    heures !== (existant?.volumeHoraire ? String(Number(existant.volumeHoraire)) : "") ||
    interro !== (existant ? String(Number(existant.poidsInterro)) : "1") ||
    devoir !== (existant ? String(Number(existant.poidsDevoir)) : "1") ||
    compo !== (existant ? String(Number(existant.poidsComposition)) : "2");

  return (
    <TableRow className={existant ? undefined : "opacity-70"}>
      <TableCell>
        <span className="flex items-center gap-2 font-medium">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: matiere.couleur ?? "#64748b" }}
          />
          {matiere.libelle}
        </span>
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          max={20}
          step={0.5}
          value={coefficient}
          placeholder="—"
          onChange={(e) => setCoefficient(e.target.value)}
          className="h-8 tabular-nums"
          aria-label={`Coefficient de ${matiere.libelle}`}
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          max={40}
          step={0.5}
          value={heures}
          placeholder="—"
          onChange={(e) => setHeures(e.target.value)}
          className="h-8 tabular-nums"
          aria-label={`Volume horaire de ${matiere.libelle}`}
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          max={10}
          step={0.5}
          value={interro}
          onChange={(e) => setInterro(e.target.value)}
          className="h-8 tabular-nums"
          aria-label={`Poids des interrogations en ${matiere.libelle}`}
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          max={10}
          step={0.5}
          value={devoir}
          onChange={(e) => setDevoir(e.target.value)}
          className="h-8 tabular-nums"
          aria-label={`Poids des devoirs en ${matiere.libelle}`}
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          max={10}
          step={0.5}
          value={compo}
          onChange={(e) => setCompo(e.target.value)}
          className="h-8 tabular-nums"
          aria-label={`Poids des compositions en ${matiere.libelle}`}
        />
      </TableCell>
      <TableCell className="text-right">
        <Button
          size="sm"
          variant={modifie ? "default" : "ghost"}
          disabled={enCours || !modifie || coefficient === ""}
          onClick={() =>
            onEnregistrer({
              coefficient: Number(coefficient),
              volumeHoraire: heures === "" ? null : Number(heures),
              poidsInterro: Number(interro),
              poidsDevoir: Number(devoir),
              poidsComposition: Number(compo),
            })
          }
        >
          {modifie ? "Enregistrer" : "À jour"}
        </Button>
      </TableCell>
    </TableRow>
  );
}

function ReprendreAnnee({ annees, cibleId }: { annees: LigneAnnee[]; cibleId: string }) {
  const [enCours, demarrer] = useTransition();
  const [source, setSource] = useState("");

  return (
    <div className="flex items-end gap-2">
      <div className="grid gap-2">
        <Label htmlFor="source">Reprendre d&apos;une autre année</Label>
        <NativeSelect id="source" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Choisir…</option>
          {annees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.libelle}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button
        variant="outline"
        disabled={!source || enCours}
        onClick={() => {
          if (
            !window.confirm(
              "Cette reprise REMPLACE tous les coefficients déjà saisis pour l'année en cours. Continuer ?",
            )
          )
            return;
          demarrer(async () => {
            const r = await copierCoefficients(source, cibleId);
            toast[r.ok ? "success" : "error"](r.message ?? (r.ok ? "Coefficients repris." : "Échec."));
          });
        }}
      >
        <Copy aria-hidden />
        Reprendre
      </Button>
    </div>
  );
}
