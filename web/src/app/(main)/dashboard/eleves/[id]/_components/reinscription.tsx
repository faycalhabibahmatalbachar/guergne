"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { ArrowUpRight, GraduationCap } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

import { reinscrire, type PropositionReinscription } from "../../actions-reinscription";

/**
 * Réinscription pour l'année suivante (E-36).
 *
 * LA PROPOSITION EST AFFICHÉE, LA CLASSE RESTE CHOISIE
 * ------------------------------------------------------
 * La décision du conseil dit où l'élève devrait aller — ADMIS au niveau
 * suivant, REDOUBLE au même. Elle ne le décide pas : une famille peut demander
 * un redoublement volontaire, un admis sous condition peut être orienté
 * ailleurs. Verrouiller la classe sur la décision obligerait à contourner
 * l'écran dans ces cas-là, c'est-à-dire à réinscrire à la main.
 *
 * LES CLASSES DU NIVEAU PROPOSÉ SONT EN TÊTE, LES AUTRES RESTENT ACCESSIBLES
 * ---------------------------------------------------------------------------
 * Masquer les autres niveaux forcerait à ressortir de l'écran pour le cas
 * minoritaire. Les places restantes sont indiquées : réinscrire dans une classe
 * pleine ferait échouer l'écriture au dernier moment, après la conversation
 * avec la famille.
 */

const LIBELLE_DECISION: Record<string, string> = {
  ADMIS: "Admis en classe supérieure",
  ADMIS_CONDITION: "Admis sous condition",
  REDOUBLE: "Redouble",
  EXCLU: "Exclu",
  REORIENTE: "Réorienté",
  EN_ATTENTE: "En attente",
};

export function Reinscription({
  eleveId,
  proposition,
}: {
  eleveId: string;
  proposition: PropositionReinscription;
}) {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();

  const classesDuNiveau = (proposition.classes ?? []).filter(
    (c) => c.niveauId === proposition.niveauProposeId,
  );
  const autresClasses = (proposition.classes ?? []).filter(
    (c) => c.niveauId !== proposition.niveauProposeId,
  );

  const [classeId, setClasseId] = useState(
    classesDuNiveau.find((c) => c.places > 0)?.id ?? classesDuNiveau[0]?.id ?? "",
  );
  const [estRedoublant, setEstRedoublant] = useState(proposition.redoublementPropose ?? false);
  const [estBoursier, setEstBoursier] = useState(false);

  if (!proposition.possible) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <GraduationCap className="size-4" aria-hidden />
            Réinscription
          </CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">{proposition.raison}</CardContent>
      </Card>
    );
  }

  const choisie = (proposition.classes ?? []).find((c) => c.id === classeId);

  function valider() {
    demarrer(async () => {
      const r = await reinscrire({
        eleveId,
        anneeId: proposition.anneeSuivanteId,
        classeId,
        estRedoublant,
        estBoursier,
      });
      toast[r.ok ? "success" : "error"](r.message ?? "Terminé.");
      if (r.ok) routeur.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <GraduationCap className="size-4" aria-hidden />
          Réinscrire pour {proposition.anneeSuivanteLibelle}
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-2">
          <span>
            {proposition.niveauActuel} <ArrowUpRight aria-hidden className="inline size-3.5" />{" "}
            {proposition.niveauProposeLibelle}
          </span>
          {proposition.decision ? (
            <Badge variant={proposition.decision === "REDOUBLE" ? "outline" : "secondary"}>
              conseil : {LIBELLE_DECISION[proposition.decision] ?? proposition.decision}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
              aucune décision de fin d&apos;année
            </Badge>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!proposition.decision ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
            Le conseil de classe ne s&apos;est pas prononcé sur cet élève. La classe proposée
            découle du niveau actuel seulement — vérifiez-la avant de valider.
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="ri-classe">Classe d&apos;affectation</Label>
            <NativeSelect
              id="ri-classe"
              value={classeId}
              onChange={(e) => setClasseId(e.target.value)}
            >
              <option value="">Choisir…</option>
              {classesDuNiveau.length > 0 ? (
                <optgroup label={`Niveau proposé — ${proposition.niveauProposeLibelle}`}>
                  {classesDuNiveau.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.libelle} ({c.places > 0 ? `${c.places} place(s)` : "complète"})
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {autresClasses.length > 0 ? (
                <optgroup label="Autres niveaux">
                  {autresClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.libelle} ({c.places > 0 ? `${c.places} place(s)` : "complète"})
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </NativeSelect>
            {choisie && choisie.places <= 0 ? (
              <p className="text-destructive text-xs">
                Cette classe est complète. L&apos;enregistrement sera refusé.
              </p>
            ) : null}
          </div>

          <div className="grid content-end gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={estRedoublant}
                onCheckedChange={(v) => setEstRedoublant(v === true)}
              />
              Redoublant
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={estBoursier}
                onCheckedChange={(v) => setEstBoursier(v === true)}
              />
              Boursier
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={valider} disabled={enCours || !classeId}>
            {enCours ? "Enregistrement…" : "Réinscrire"}
          </Button>
          <p className="text-muted-foreground text-xs">
            L&apos;échéancier n&apos;est pas créé ici : il dépend de la grille tarifaire de la
            nouvelle année, qui n&apos;est pas forcément arrêtée. Le générer avec les tarifs de
            l&apos;année écoulée produirait des montants faux, visibles des familles.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
