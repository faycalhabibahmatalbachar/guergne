"use client";

import { useState, useTransition } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { CircleSlash, Repeat, UserCheck, UserX, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { CoursDuJour, EnseignantDisponible } from "@/server/domain/remplacements";

import { annulerRemplacement, declarerRemplacement } from "../actions-remplacement";

/**
 * La journée de cours (E-48) et les remplacements (E-49).
 *
 * DEUX BESOINS, UN SEUL ÉCRAN, ET C'EST DÉLIBÉRÉ
 * -----------------------------------------------
 * « Qui est où aujourd'hui » et « qui prend le cours de M. X » sont la même
 * question posée à trente secondes d'intervalle. Séparer les deux obligerait à
 * retrouver le cours dans un second écran, et le remplacement se déciderait de
 * mémoire — c'est-à-dire mal.
 *
 * LA JOURNÉE EST LUE PAR CRÉNEAU, PAS PAR CLASSE
 * -----------------------------------------------
 * À 10 h, le censeur veut savoir quelles salles sont couvertes maintenant. Un
 * regroupement par classe l'obligerait à parcourir vingt blocs pour reconstituer
 * une heure.
 */

const MOTIFS = ["Maladie", "Convocation administrative", "Mission", "Congé", "Absence non justifiée"];

export function VueJournee({
  date,
  cours,
  classes,
  enseignants,
  classeId,
  enseignantId,
  peutGerer,
  disponibles,
  coursOuvert,
}: {
  date: string;
  cours: CoursDuJour[];
  classes: Array<{ id: string; libelle: string }>;
  enseignants: Array<{ id: string; libelle: string }>;
  classeId: string;
  enseignantId: string;
  peutGerer: boolean;
  /** Professeurs libres sur le créneau du cours ouvert. Chargé côté serveur. */
  disponibles: EnseignantDisponible[];
  coursOuvert: string | null;
}) {
  const routeur = useRouter();
  const params = useSearchParams();
  const [enCours, demarrer] = useTransition();

  const [motif, setMotif] = useState(MOTIFS[0]);
  const [remplacantId, setRemplacantId] = useState("");
  const [rattrapage, setRattrapage] = useState("");

  function naviguer(cle: string, valeur: string) {
    const p = new URLSearchParams(params.toString());
    if (valeur) p.set(cle, valeur);
    else p.delete(cle);
    routeur.push(`/dashboard/emploi-du-temps/journee?${p.toString()}`);
  }

  function ouvrir(id: string | null) {
    setRemplacantId("");
    setRattrapage("");
    setMotif(MOTIFS[0]);
    naviguer("cours", id ?? "");
  }

  const ouvert = cours.find((c) => c.emploiDuTempsId === coursOuvert) ?? null;

  function enregistrer() {
    if (!ouvert) return;
    demarrer(async () => {
      const r = await declarerRemplacement({
        emploiDuTempsId: ouvert.emploiDuTempsId,
        dateCours: date,
        motif,
        remplacantId: remplacantId || null,
        dateRattrapage: rattrapage || null,
      });
      toast[r.ok ? "success" : "error"](r.message ?? "Terminé.");
      if (r.ok) {
        ouvrir(null);
        routeur.refresh();
      }
    });
  }

  function annuler(id: string) {
    demarrer(async () => {
      const r = await annulerRemplacement(id);
      toast[r.ok ? "success" : "error"](r.message ?? "Terminé.");
      if (r.ok) routeur.refresh();
    });
  }

  // Regroupement par créneau, dans l'ordre déjà trié par le serveur.
  const parCreneau = new Map<string, CoursDuJour[]>();
  for (const c of cours) {
    const liste = parCreneau.get(c.creneauLibelle);
    if (liste) liste.push(c);
    else parCreneau.set(c.creneauLibelle, [c]);
  }

  const perturbes = cours.filter((c) => c.remplacementId);
  const decouverts = perturbes.filter((c) => !c.remplacant && !c.dateRattrapage);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="grid gap-2">
            <Label htmlFor="j-date">Jour</Label>
            <Input
              id="j-date"
              type="date"
              className="w-44"
              value={date}
              onChange={(e) => naviguer("date", e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="j-classe">Classe</Label>
            <NativeSelect
              id="j-classe"
              className="w-44"
              value={classeId}
              onChange={(e) => naviguer("classe", e.target.value)}
            >
              <option value="">Toutes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.libelle}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="j-ens">Professeur</Label>
            <NativeSelect
              id="j-ens"
              className="w-52"
              value={enseignantId}
              onChange={(e) => naviguer("enseignant", e.target.value)}
            >
              <option value="">Tous</option>
              {enseignants.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.libelle}
                </option>
              ))}
            </NativeSelect>
          </div>
        </CardContent>
      </Card>

      {decouverts.length > 0 ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm">
            <span className="font-medium">
              {decouverts.length} cours ni remplacé(s) ni rattrapé(s) :
            </span>{" "}
            {decouverts.map((c) => `${c.classe} (${c.matiere})`).join(", ")}. Ces heures sont
            perdues pour le programme tant qu&apos;aucune date de rattrapage n&apos;est fixée.
          </CardContent>
        </Card>
      ) : null}

      {cours.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            Aucun cours ce jour-là. Vérifiez la date : les dimanches et les jours fériés sont
            naturellement vides.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {cours.length} cours · {perturbes.length} perturbé(s)
            </CardTitle>
            <CardDescription>
              Lecture par heure et non par classe : à 10 h, ce qu&apos;on cherche est la liste des
              salles couvertes maintenant.
            </CardDescription>
          </CardHeader>

          <CardContent className="divide-y p-0">
            {[...parCreneau.entries()].map(([creneau, liste]) => (
              <div key={creneau} className="grid gap-2 px-4 py-3 sm:grid-cols-[9rem_1fr]">
                <p className="text-muted-foreground text-sm tabular-nums">{creneau}</p>

                <div className="space-y-1.5">
                  {liste.map((c) => {
                    const decouvert = c.remplacementId && !c.remplacant && !c.dateRattrapage;
                    return (
                      <div
                        key={c.emploiDuTempsId}
                        className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-3 py-2 text-sm ${
                          decouvert
                            ? "border-destructive/40 bg-destructive/5"
                            : c.remplacementId
                              ? "border-amber-500/40 bg-amber-500/5"
                              : ""
                        }`}
                      >
                        <span className="font-medium">{c.classe}</span>
                        <span className="text-muted-foreground">{c.matiere}</span>
                        <span className="text-muted-foreground">
                          {c.enseignant ?? (
                            <span className="text-destructive">aucun professeur</span>
                          )}
                        </span>
                        {c.salle ? (
                          <span className="text-muted-foreground text-xs">salle {c.salle}</span>
                        ) : null}

                        {c.remplacant ? (
                          <Badge variant="outline" className="gap-1">
                            <UserCheck aria-hidden className="size-3" />
                            remplacé par {c.remplacant}
                          </Badge>
                        ) : c.dateRattrapage ? (
                          <Badge variant="outline" className="gap-1">
                            <Repeat aria-hidden className="size-3" />
                            rattrapage le{" "}
                            {new Date(`${c.dateRattrapage}T00:00:00`).toLocaleDateString("fr-FR")}
                          </Badge>
                        ) : c.remplacementId ? (
                          <Badge variant="outline" className="text-destructive gap-1">
                            <CircleSlash aria-hidden className="size-3" />
                            non assuré
                          </Badge>
                        ) : null}

                        {c.motif ? (
                          <span className="text-muted-foreground text-xs">— {c.motif}</span>
                        ) : null}

                        {peutGerer ? (
                          <span className="ml-auto flex gap-1">
                            {c.remplacementId ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={enCours}
                                onClick={() => annuler(c.remplacementId!)}
                                title="Retirer la déclaration"
                              >
                                <X aria-hidden />
                                <span className="sr-only">Retirer</span>
                              </Button>
                            ) : null}
                            {c.enseignantId ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => ouvrir(c.emploiDuTempsId)}
                              >
                                <UserX aria-hidden />
                                {c.remplacementId ? "Modifier" : "Professeur absent"}
                              </Button>
                            ) : null}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={Boolean(ouvert)} onOpenChange={(o) => (o ? null : ouvrir(null))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {ouvert?.classe} — {ouvert?.matiere}
            </DialogTitle>
            <DialogDescription>
              {ouvert?.enseignant} absent le{" "}
              {new Date(`${date}T00:00:00`).toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
              , {ouvert?.creneauLibelle}.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="r-motif">Motif</Label>
              <NativeSelect
                id="r-motif"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
              >
                {MOTIFS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </NativeSelect>
              <p className="text-muted-foreground text-xs">
                Il distingue la maladie de la convocation. C&apos;est ce qui permet de dire, en fin
                de trimestre, si le service est désorganisé ou si un agent est défaillant.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="r-remplacant">Remplaçant</Label>
              <NativeSelect
                id="r-remplacant"
                value={remplacantId}
                onChange={(e) => {
                  setRemplacantId(e.target.value);
                  if (e.target.value) setRattrapage("");
                }}
              >
                <option value="">Aucun</option>
                {disponibles.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nom}
                    {d.memeMatiere ? " — enseigne la matière" : ""} ({d.creneauxCeJour} h ce jour)
                  </option>
                ))}
              </NativeSelect>
              <p className="text-muted-foreground text-xs">
                Seuls les professeurs réellement libres sur ce créneau sont listés : désigner
                quelqu&apos;un qui a déjà cours laisserait une autre classe sans personne. Ceux qui
                enseignent la matière sont en tête — hors matière, c&apos;est une surveillance, pas
                un cours.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="r-rattrapage">Ou rattrapage le</Label>
              <Input
                id="r-rattrapage"
                type="date"
                value={rattrapage}
                disabled={Boolean(remplacantId)}
                onChange={(e) => setRattrapage(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                Sans remplaçant ni rattrapage, l&apos;heure est enregistrée comme perdue — et c&apos;est
                bien ce qu&apos;il faut écrire pour qu&apos;elle apparaisse au bilan.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => ouvrir(null)}>
              Annuler
            </Button>
            <Button onClick={enregistrer} disabled={enCours || motif.trim().length < 3}>
              {enCours ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
