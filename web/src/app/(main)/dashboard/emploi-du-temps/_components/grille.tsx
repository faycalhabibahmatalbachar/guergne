"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { CoursEdt, Creneau } from "@/server/domain/personnel";

import { poserCours, publierEmploiDuTemps, retirerCours } from "../../personnel/actions";

const JOURS = [
  { numero: 1, libelle: "Lundi" },
  { numero: 2, libelle: "Mardi" },
  { numero: 3, libelle: "Mercredi" },
  { numero: 4, libelle: "Jeudi" },
  { numero: 5, libelle: "Vendredi" },
  { numero: 6, libelle: "Samedi" },
];

interface Option {
  id: string;
  libelle: string;
}

/**
 * Grille hebdomadaire de l'emploi du temps.
 *
 * Une seule grille sert les trois vues — classe, enseignant, salle — parce
 * qu'elles montrent la même chose sous trois angles. Ce qui change, c'est ce
 * qu'on affiche dans la case : la vue « classe » veut la matière et le
 * professeur, la vue « professeur » veut la classe.
 */
export function Grille({
  anneeId,
  anneeLibelle,
  portee,
  cibleId,
  cours,
  creneaux,
  classes,
  matieres,
  enseignants,
  salles,
}: {
  anneeId: string;
  anneeLibelle: string;
  portee: "classe" | "enseignant" | "salle";
  cibleId: string;
  cours: CoursEdt[];
  creneaux: Creneau[];
  classes: Option[];
  matieres: Option[];
  enseignants: Option[];
  salles: Option[];
}) {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();
  const [ajout, setAjout] = useState<{ jour: number; creneauId: string } | null>(null);

  const publie = cours.length > 0 && cours.every((c) => c.publie);

  /** Case occupée par un cours, en tenant compte des séances multi-créneaux. */
  function coursDe(jour: number, ordre: number): { cours: CoursEdt; debut: boolean } | null {
    for (const c of cours) {
      if (c.jourSemaine !== jour) continue;
      if (ordre >= c.creneauOrdre && ordre < c.creneauOrdre + c.nbCreneaux) {
        return { cours: c, debut: ordre === c.creneauOrdre };
      }
    }
    return null;
  }

  function poser(formulaire: FormData) {
    if (!ajout) return;
    demarrer(async () => {
      const r = await poserCours({
        anneeId,
        classeId: portee === "classe" ? cibleId : String(formulaire.get("classeId") ?? ""),
        matiereId: String(formulaire.get("matiereId") ?? ""),
        enseignantId:
          portee === "enseignant" ? cibleId : String(formulaire.get("enseignantId") ?? "") || null,
        salleId: portee === "salle" ? cibleId : String(formulaire.get("salleId") ?? "") || null,
        jourSemaine: ajout.jour,
        creneauId: ajout.creneauId,
        nbCreneaux: String(formulaire.get("nbCreneaux") ?? "1"),
        semaineType: String(formulaire.get("semaineType") ?? "") || null,
      });

      if (r.ok) {
        toast[r.message ? "warning" : "success"](r.message ?? "Cours ajouté.");
        setAjout(null);
        routeur.refresh();
      } else {
        toast.error(r.message ?? "Impossible d'ajouter ce cours.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Année {anneeLibelle} — {cours.length} créneau{cours.length > 1 ? "x" : ""} placé
          {cours.length > 1 ? "s" : ""}
        </p>

        {portee === "classe" && cours.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            disabled={enCours}
            onClick={() =>
              demarrer(async () => {
                const r = await publierEmploiDuTemps(anneeId, cibleId, !publie);
                toast[r.ok ? "success" : "error"](
                  r.ok
                    ? publie
                      ? "Emploi du temps masqué aux familles."
                      : "Emploi du temps publié : visible dans l'application parent."
                    : (r.message ?? "Échec."),
                );
                routeur.refresh();
              })
            }
          >
            {publie ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            {publie ? "Masquer aux familles" : "Publier aux familles"}
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[880px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-32 border-b bg-muted/40 p-2 text-left font-medium text-muted-foreground text-xs">
                  Horaire
                </th>
                {JOURS.map((j) => (
                  <th key={j.numero} className="border-b bg-muted/40 p-2 text-center font-medium">
                    {j.libelle}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {creneaux.map((cr) => (
                <tr key={cr.id}>
                  <td className="border-b p-2 text-muted-foreground text-xs tabular-nums">
                    {cr.libelle}
                  </td>
                  {JOURS.map((j) => {
                    const occupe = coursDe(j.numero, cr.ordre);

                    // Case couverte par une séance longue : on ne réaffiche rien,
                    // la case de départ porte déjà le rowSpan.
                    if (occupe && !occupe.debut) return null;

                    if (occupe) {
                      const c = occupe.cours;
                      return (
                        <td
                          key={j.numero}
                          rowSpan={c.nbCreneaux}
                          className="border-b border-l p-1 align-top"
                        >
                          <div
                            className="group h-full rounded-md p-2"
                            style={{ backgroundColor: `${c.matiereCouleur ?? "#64748b"}18` }}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <span className="font-medium leading-tight">{c.matiereLibelle}</span>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-6 opacity-0 transition-opacity group-hover:opacity-100"
                                disabled={enCours}
                                onClick={() => {
                                  if (!window.confirm("Retirer ce cours de l'emploi du temps ?")) return;
                                  demarrer(async () => {
                                    const r = await retirerCours(c.id);
                                    toast[r.ok ? "success" : "error"](
                                      r.ok ? "Cours retiré." : (r.message ?? "Échec."),
                                    );
                                    routeur.refresh();
                                  });
                                }}
                              >
                                <Trash2 className="size-3" aria-hidden />
                                <span className="sr-only">Retirer</span>
                              </Button>
                            </div>
                            <p className="mt-0.5 text-muted-foreground text-xs leading-tight">
                              {portee === "classe"
                                ? (c.enseignantNom ?? "Sans professeur")
                                : c.classeLibelle}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {c.salleCode && portee !== "salle" ? (
                                <Badge variant="outline" className="text-[10px]">
                                  {c.salleCode}
                                </Badge>
                              ) : null}
                              {c.semaineType ? (
                                <Badge variant="secondary" className="text-[10px]">
                                  Sem. {c.semaineType}
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      );
                    }

                    return (
                      <td key={j.numero} className="border-b border-l p-1 align-top">
                        <button
                          type="button"
                          onClick={() => setAjout({ jour: j.numero, creneauId: cr.id })}
                          className="flex h-12 w-full items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
                          aria-label={`Ajouter un cours ${j.libelle} à ${cr.libelle}`}
                        >
                          <Plus className="size-4" aria-hidden />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={ajout !== null} onOpenChange={(v) => !v && setAjout(null)}>
        <DialogContent>
          <form action={poser}>
            <DialogHeader>
              <DialogTitle>Ajouter un cours</DialogTitle>
              <DialogDescription>
                {ajout
                  ? `${JOURS.find((j) => j.numero === ajout.jour)?.libelle} — ${
                      creneaux.find((c) => c.id === ajout.creneauId)?.libelle
                    }`
                  : ""}
                . Les conflits de professeur, de classe et de salle sont vérifiés à l&apos;enregistrement.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {portee !== "classe" ? (
                <div className="grid gap-2">
                  <Label htmlFor="classeId">Classe *</Label>
                  <NativeSelect id="classeId" name="classeId" required>
                    <option value="">Choisir…</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.libelle}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="matiereId">Matière *</Label>
                <NativeSelect id="matiereId" name="matiereId" required>
                  <option value="">Choisir…</option>
                  {matieres.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.libelle}
                    </option>
                  ))}
                </NativeSelect>
              </div>

              {portee !== "enseignant" ? (
                <div className="grid gap-2">
                  <Label htmlFor="enseignantId">Enseignant</Label>
                  <NativeSelect id="enseignantId" name="enseignantId" defaultValue="">
                    <option value="">Déduire de l&apos;affectation</option>
                    {enseignants.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.libelle}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ) : null}

              {portee !== "salle" ? (
                <div className="grid gap-2">
                  <Label htmlFor="salleId">Salle</Label>
                  <NativeSelect id="salleId" name="salleId" defaultValue="">
                    <option value="">Non précisée</option>
                    {salles.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.libelle}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="nbCreneaux">Durée</Label>
                  <NativeSelect id="nbCreneaux" name="nbCreneaux" defaultValue="1">
                    <option value="1">1 créneau</option>
                    <option value="2">2 créneaux</option>
                    <option value="3">3 créneaux</option>
                    <option value="4">4 créneaux</option>
                  </NativeSelect>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="semaineType">Semaine</Label>
                  <NativeSelect id="semaineType" name="semaineType" defaultValue="">
                    <option value="">Toutes les semaines</option>
                    <option value="A">Semaine A</option>
                    <option value="B">Semaine B</option>
                  </NativeSelect>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={enCours}>
                {enCours ? "Ajout…" : "Ajouter"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
