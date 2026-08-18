"use client";

import { useState, useTransition } from "react";

import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FicheEnseignant } from "@/server/domain/personnel";

import {
  affecter,
  ajouterIndisponibilite,
  definirSpecialite,
  retirerAffectation,
  retirerIndisponibilite,
  retirerSpecialite,
} from "../../actions";

const JOURS = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

interface Option {
  id: string;
  libelle: string;
}

export function Fiche({
  fiche,
  anneeId,
  classes,
  matieres,
  creneaux,
}: {
  fiche: FicheEnseignant;
  anneeId: string | null;
  classes: Option[];
  matieres: Option[];
  creneaux: Option[];
}) {
  const [enCours, demarrer] = useTransition();
  const { enseignant, specialites, affectations, indisponibilites } = fiche;

  const contrat = enseignant.heuresContractuelles ? Number(enseignant.heuresContractuelles) : null;
  const affectees = affectations.reduce((s, a) => s + Number(a.heuresSemaine ?? 0), 0);
  const places = affectations.reduce((s, a) => s + a.creneauxPlaces, 0);

  const idsSpecialites = new Set(specialites.map((s) => s.matiereId));

  return (
    <div className="space-y-6">
      {/* Charge horaire */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { libelle: "Heures au contrat", valeur: contrat != null ? `${contrat} h` : "Non renseigné" },
          {
            libelle: "Heures affectées",
            valeur: `${affectees} h`,
            alerte: contrat != null && affectees > contrat,
          },
          { libelle: "Créneaux placés", valeur: `${places}` },
        ].map((k) => (
          <Card key={k.libelle}>
            <CardContent className="py-4">
              <p className="text-muted-foreground text-xs">{k.libelle}</p>
              <p
                className={`mt-1 font-semibold text-xl tabular-nums ${
                  k.alerte ? "text-amber-600 dark:text-amber-400" : ""
                }`}
              >
                {k.valeur}
              </p>
              {k.alerte ? (
                <p className="mt-1 text-amber-600 text-xs dark:text-amber-400">
                  Charge supérieure au contrat
                </p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Spécialités */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Matières enseignables</CardTitle>
          <CardDescription>
            Ce que l&apos;enseignant est qualifié pour enseigner. Distinct des affectations : on peut
            être qualifié en physique sans se la voir confier cette année.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {specialites.length === 0 ? (
              <p className="text-muted-foreground text-sm">Aucune matière déclarée.</p>
            ) : (
              specialites.map((s) => (
                <Badge
                  key={s.id}
                  variant={s.estPrincipale ? "default" : "secondary"}
                  className="gap-1.5 py-1"
                >
                  {s.libelle}
                  {s.estPrincipale ? " · principale" : ""}
                  <button
                    type="button"
                    aria-label={`Retirer ${s.libelle}`}
                    disabled={enCours}
                    onClick={() =>
                      demarrer(async () => {
                        const r = await retirerSpecialite(enseignant.id, s.matiereId);
                        if (!r.ok) toast.error(r.message ?? "Échec.");
                      })
                    }
                  >
                    <Trash2 className="size-3" aria-hidden />
                  </button>
                </Badge>
              ))
            )}
          </div>

          <form
            className="flex flex-wrap items-end gap-2"
            action={(f) =>
              demarrer(async () => {
                const r = await definirSpecialite(
                  enseignant.id,
                  String(f.get("matiereId") ?? ""),
                  f.get("principale") === "on",
                );
                toast[r.ok ? "success" : "error"](r.ok ? "Matière ajoutée." : (r.message ?? "Échec."));
              })
            }
          >
            <div className="grid gap-2">
              <Label htmlFor="spec-matiere">Ajouter une matière</Label>
              <NativeSelect id="spec-matiere" name="matiereId" required className="w-64">
                <option value="">Choisir…</option>
                {matieres
                  .filter((m) => !idsSpecialites.has(m.id))
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.libelle}
                    </option>
                  ))}
              </NativeSelect>
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input type="checkbox" name="principale" className="size-4 accent-primary" />
              Matière principale
            </label>
            <Button type="submit" size="sm" variant="outline" disabled={enCours}>
              <Plus aria-hidden />
              Ajouter
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Affectations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Affectations classe × matière</CardTitle>
          <CardDescription>
            C&apos;est cette table qui autorise l&apos;enseignant à saisir des notes : il ne voit que
            les classes et matières qui lui sont confiées.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {affectations.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucune affectation pour cette année.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Classe</TableHead>
                  <TableHead>Matière</TableHead>
                  <TableHead>Heures/sem.</TableHead>
                  <TableHead>Créneaux placés</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {affectations.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.classeLibelle}</TableCell>
                    <TableCell>{a.matiereLibelle}</TableCell>
                    <TableCell className="tabular-nums">
                      {a.heuresSemaine ? `${Number(a.heuresSemaine)} h` : "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">{a.creneauxPlaces}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={enCours}
                        onClick={() =>
                          demarrer(async () => {
                            const r = await retirerAffectation(a.id, enseignant.id);
                            toast[r.ok ? "success" : "error"](
                              r.ok ? "Affectation retirée." : (r.message ?? "Échec."),
                            );
                          })
                        }
                      >
                        <Trash2 aria-hidden />
                        <span className="sr-only">Retirer</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {anneeId ? (
            <form
              className="flex flex-wrap items-end gap-2 border-t pt-4"
              action={(f) =>
                demarrer(async () => {
                  const r = await affecter({
                    anneeId,
                    enseignantId: enseignant.id,
                    classeId: String(f.get("classeId") ?? ""),
                    matiereId: String(f.get("matiereId") ?? ""),
                    heuresSemaine: f.get("heures") === "" ? null : f.get("heures"),
                  });
                  toast[r.ok ? "success" : "error"](r.ok ? "Affectation enregistrée." : (r.message ?? "Échec."));
                })
              }
            >
              <div className="grid gap-2">
                <Label htmlFor="aff-classe">Classe</Label>
                <NativeSelect id="aff-classe" name="classeId" required className="w-48">
                  <option value="">Choisir…</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.libelle}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="aff-matiere">Matière</Label>
                <NativeSelect id="aff-matiere" name="matiereId" required className="w-48">
                  <option value="">Choisir…</option>
                  {matieres.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.libelle}
                      {idsSpecialites.has(m.id) ? "" : " (hors spécialité)"}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="aff-heures">Heures/sem.</Label>
                <Input
                  id="aff-heures"
                  name="heures"
                  type="number"
                  min={0}
                  max={40}
                  step={0.5}
                  className="w-28"
                />
              </div>
              <Button type="submit" size="sm" disabled={enCours}>
                <Plus aria-hidden />
                Affecter
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      {/* Indisponibilités */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Indisponibilités</CardTitle>
          <CardDescription>
            Créneaux où l&apos;enseignant ne peut pas être placé — utile pour les vacataires qui
            interviennent dans plusieurs établissements.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {indisponibilites.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucune indisponibilité déclarée.</p>
          ) : (
            <ul className="space-y-2">
              {indisponibilites.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 border-b pb-2 text-sm">
                  <span>
                    <span className="font-medium">{JOURS[i.jourSemaine]}</span>
                    {" — "}
                    {i.creneauLibelle ?? "toute la journée"}
                    {i.motif ? <span className="text-muted-foreground"> · {i.motif}</span> : null}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={enCours}
                    onClick={() =>
                      demarrer(async () => {
                        await retirerIndisponibilite(i.id, enseignant.id);
                      })
                    }
                  >
                    <Trash2 aria-hidden />
                    <span className="sr-only">Retirer</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {anneeId ? (
            <form
              className="flex flex-wrap items-end gap-2 border-t pt-4"
              action={(f) =>
                demarrer(async () => {
                  const r = await ajouterIndisponibilite({
                    enseignantId: enseignant.id,
                    anneeId,
                    jourSemaine: Number(f.get("jour")),
                    creneauId: String(f.get("creneauId") ?? "") || null,
                    motif: String(f.get("motif") ?? ""),
                  });
                  toast[r.ok ? "success" : "error"](r.ok ? "Indisponibilité ajoutée." : (r.message ?? "Échec."));
                })
              }
            >
              <div className="grid gap-2">
                <Label htmlFor="ind-jour">Jour</Label>
                <NativeSelect id="ind-jour" name="jour" required className="w-36">
                  {[1, 2, 3, 4, 5, 6].map((j) => (
                    <option key={j} value={j}>
                      {JOURS[j]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ind-creneau">Créneau</Label>
                <NativeSelect id="ind-creneau" name="creneauId" defaultValue="" className="w-44">
                  <option value="">Toute la journée</option>
                  {creneaux.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.libelle}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ind-motif">Motif</Label>
                <Input id="ind-motif" name="motif" className="w-56" placeholder="Autre établissement" />
              </div>
              <Button type="submit" size="sm" variant="outline" disabled={enCours}>
                <Plus aria-hidden />
                Ajouter
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
