"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { CalendarPlus, Check, Pencil, Send, XCircle } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";

import {
  annulerEvenementCalendrier,
  creerEvenementCalendrier,
  modifierEvenementCalendrier,
  publierEvenementCalendrier,
  validerEvenementCalendrier,
} from "./actions";

export interface EvenementGestion {
  id: string;
  type: string;
  titre: string;
  description: string | null;
  dateDebut: string;
  dateFin: string;
  visibleParents: boolean;
  impactCours: string;
  statutValidation: string;
  sourceOfficielle: string | null;
  sourceVerifieeLe: string | null;
}

const TYPES = [
  ["VACANCES", "Vacances scolaires"],
  ["FERIE", "Jour férié"],
  ["COMPOSITION", "Composition"],
  ["EXAMEN_BLANC", "Examen blanc"],
  ["REUNION_PARENTS", "Réunion parents"],
  ["CONSEIL_CLASSE", "Conseil de classe"],
  ["RENTREE", "Rentrée"],
  ["AUTRE", "Autre événement"],
] as const;

const IMPACTS = [
  ["INFORMATIF", "Informatif — ne bloque pas les cours"],
  ["SUSPENDRE_COURS", "Suspendre les cours (après validation)"],
  ["ORGANISATION_SPECIALE", "Organisation spéciale"],
] as const;

function statutLibelle(statut: string): string {
  const libelles: Record<string, string> = {
    A_VERIFIER: "À vérifier",
    BROUILLON: "Brouillon",
    VALIDE: "Validé",
    PUBLIE: "Publié",
    ANNULE: "Annulé",
  };
  return libelles[statut] ?? statut;
}

function payload(formulaire: FormData, anneeId: string) {
  return {
    anneeId,
    type: String(formulaire.get("type") ?? ""),
    titre: String(formulaire.get("titre") ?? ""),
    description: String(formulaire.get("description") ?? ""),
    dateDebut: String(formulaire.get("dateDebut") ?? ""),
    dateFin: String(formulaire.get("dateFin") ?? ""),
    impactCours: String(formulaire.get("impactCours") ?? "INFORMATIF"),
    sourceOfficielle: String(formulaire.get("sourceOfficielle") ?? ""),
    sourceVerifieeLe: String(formulaire.get("sourceVerifieeLe") ?? ""),
  };
}

function FormulaireEvenement({
  anneeId,
  initial,
  enCours,
  onSubmit,
  onAnnuler,
  libelleBouton,
}: {
  anneeId: string;
  initial?: EvenementGestion | null;
  enCours: boolean;
  onSubmit: (formulaire: FormData, element: HTMLFormElement) => void;
  onAnnuler?: () => void;
  libelleBouton: string;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const element = event.currentTarget;
        onSubmit(new FormData(element), element);
      }}
      className="space-y-4"
    >
      <input type="hidden" name="anneeId" value={anneeId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor={initial ? "edit-titre" : "new-titre"}>Libellé de l’événement *</Label>
          <Input
            id={initial ? "edit-titre" : "new-titre"}
            name="titre"
            required
            minLength={3}
            maxLength={180}
            defaultValue={initial?.titre ?? ""}
            placeholder="Ex. : Congés de fin du premier trimestre"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={initial ? "edit-type" : "new-type"}>Type *</Label>
          <NativeSelect
            id={initial ? "edit-type" : "new-type"}
            name="type"
            required
            defaultValue={initial?.type ?? "AUTRE"}
          >
            {TYPES.map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={initial ? "edit-impact" : "new-impact"}>Effet sur les cours *</Label>
          <NativeSelect
            id={initial ? "edit-impact" : "new-impact"}
            name="impactCours"
            required
            defaultValue={initial?.impactCours ?? "INFORMATIF"}
          >
            {IMPACTS.map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={initial ? "edit-debut" : "new-debut"}>Date de début *</Label>
          <Input
            id={initial ? "edit-debut" : "new-debut"}
            type="date"
            name="dateDebut"
            required
            defaultValue={initial?.dateDebut ?? ""}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={initial ? "edit-fin" : "new-fin"}>Date de fin *</Label>
          <Input
            id={initial ? "edit-fin" : "new-fin"}
            type="date"
            name="dateFin"
            required
            defaultValue={initial?.dateFin ?? ""}
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor={initial ? "edit-description" : "new-description"}>Description (facultatif)</Label>
          <Textarea
            id={initial ? "edit-description" : "new-description"}
            name="description"
            rows={2}
            maxLength={4000}
            defaultValue={initial?.description ?? ""}
            placeholder="Précisions utiles aux personnels et aux familles."
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor={initial ? "edit-source" : "new-source"}>Source ou référence de la décision</Label>
          <Input
            id={initial ? "edit-source" : "new-source"}
            name="sourceOfficielle"
            maxLength={1000}
            defaultValue={initial?.sourceOfficielle ?? ""}
            placeholder="Référence du communiqué, note de service ou décision"
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor={initial ? "edit-verifiee" : "new-verifiee"}>Date de vérification de la source</Label>
          <Input
            id={initial ? "edit-verifiee" : "new-verifiee"}
            type="date"
            name="sourceVerifieeLe"
            defaultValue={initial?.sourceVerifieeLe ?? ""}
          />
          <p className="text-xs text-muted-foreground">
            Requise avant de valider un jour férié, des vacances ou une fermeture de cours.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {onAnnuler ? (
          <Button type="button" variant="outline" onClick={onAnnuler}>
            Annuler
          </Button>
        ) : null}
        <Button type="submit" disabled={enCours}>
          {enCours ? "Enregistrement…" : libelleBouton}
        </Button>
      </div>
    </form>
  );
}

export function GestionEvenements({
  anneeId,
  evenements,
  peutGerer,
}: {
  anneeId: string;
  evenements: EvenementGestion[];
  peutGerer: boolean;
}) {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();
  const [edition, setEdition] = useState<EvenementGestion | null>(null);

  function sauvegarder(formulaire: FormData, element: HTMLFormElement, id?: string) {
    const donnees = payload(formulaire, anneeId);
    demarrer(async () => {
      const resultat = id ? await modifierEvenementCalendrier(id, donnees) : await creerEvenementCalendrier(donnees);
      toast[resultat.ok ? "success" : "error"](resultat.message);
      if (resultat.ok) {
        element.reset();
        setEdition(null);
        routeur.refresh();
      }
    });
  }

  function valider(id: string) {
    demarrer(async () => {
      const resultat = await validerEvenementCalendrier(id);
      toast[resultat.ok ? "success" : "error"](resultat.message);
      if (resultat.ok) routeur.refresh();
    });
  }

  function publier(id: string, visibleParents: boolean) {
    demarrer(async () => {
      const resultat = await publierEvenementCalendrier(id, visibleParents);
      toast[resultat.ok ? "success" : "error"](resultat.message);
      if (resultat.ok) routeur.refresh();
    });
  }

  function annuler(id: string) {
    if (!window.confirm("Annuler cet événement ? Son historique sera conservé.")) return;
    demarrer(async () => {
      const resultat = await annulerEvenementCalendrier(id);
      toast[resultat.ok ? "success" : "error"](resultat.message);
      if (resultat.ok) routeur.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {peutGerer ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarPlus aria-hidden className="size-4" />
              Ajouter un événement
            </CardTitle>
            <CardDescription>
              Les nouveaux événements commencent en brouillon et ne sont pas visibles aux familles. Un effet de
              suspension n’est appliqué qu’après vérification et validation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <details>
              <summary className="cursor-pointer text-sm font-medium">Ouvrir le formulaire</summary>
              <div className="pt-4">
                <FormulaireEvenement
                  anneeId={anneeId}
                  enCours={enCours}
                  onSubmit={(formulaire, element) => sauvegarder(formulaire, element)}
                  libelleBouton="Créer le brouillon"
                />
              </div>
            </details>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Événements de l’année</CardTitle>
          <CardDescription>
            {evenements.length} événement(s) enregistrés, hors annulations. Les événements à vérifier sont visibles aux
            administrateurs mais ne doivent pas piloter les cours.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {evenements.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">Aucun événement enregistré pour cette année scolaire.</p>
          ) : (
            evenements.map((evenement) => (
              <article key={evenement.id} className="flex flex-col gap-3 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold">{evenement.titre}</h4>
                      <Badge variant="outline">
                        {TYPES.find(([type]) => type === evenement.type)?.[1] ?? evenement.type}
                      </Badge>
                      <Badge variant="outline">{statutLibelle(evenement.statutValidation)}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Du {evenement.dateDebut} au {evenement.dateFin}
                      {" · "}
                      {evenement.impactCours === "SUSPENDRE_COURS"
                        ? "Suspend les cours lorsque validé"
                        : evenement.impactCours === "ORGANISATION_SPECIALE"
                          ? "Organisation spéciale"
                          : "Informatif"}
                      {" · "}
                      {evenement.visibleParents ? "Publié aux parents" : "Non visible aux parents"}
                    </p>
                    {evenement.description ? (
                      <p className="whitespace-pre-wrap text-sm">{evenement.description}</p>
                    ) : null}
                    {evenement.sourceOfficielle ? (
                      <p className="break-all text-xs text-muted-foreground">
                        Source : {evenement.sourceOfficielle}
                        {evenement.sourceVerifieeLe ? ` · vérifiée le ${evenement.sourceVerifieeLe}` : ""}
                      </p>
                    ) : null}
                  </div>
                  {peutGerer && evenement.statutValidation !== "ANNULE" ? (
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={enCours}
                        onClick={() => setEdition(evenement)}
                      >
                        <Pencil aria-hidden className="size-3.5" />
                        Modifier
                      </Button>
                      {evenement.statutValidation === "BROUILLON" || evenement.statutValidation === "A_VERIFIER" ? (
                        <Button type="button" size="sm" disabled={enCours} onClick={() => valider(evenement.id)}>
                          <Check aria-hidden className="size-3.5" />
                          Valider
                        </Button>
                      ) : null}
                      {evenement.statutValidation === "VALIDE" ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={enCours}
                            onClick={() => publier(evenement.id, false)}
                          >
                            <Send aria-hidden className="size-3.5" />
                            Publier interne
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={enCours}
                            onClick={() => publier(evenement.id, true)}
                          >
                            <Send aria-hidden className="size-3.5" />
                            Publier aux parents
                          </Button>
                        </>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={enCours}
                        onClick={() => annuler(evenement.id)}
                      >
                        <XCircle aria-hidden className="size-3.5" />
                        Annuler
                      </Button>
                    </div>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={edition !== null} onOpenChange={(ouvert) => !ouvert && setEdition(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modifier l’événement</DialogTitle>
            <DialogDescription>
              Toute modification remet l’événement en vérification et le masque temporairement aux familles.
            </DialogDescription>
          </DialogHeader>
          {edition ? (
            <FormulaireEvenement
              key={edition.id}
              anneeId={anneeId}
              initial={edition}
              enCours={enCours}
              onSubmit={(formulaire, element) => sauvegarder(formulaire, element, edition.id)}
              onAnnuler={() => setEdition(null)}
              libelleBouton="Enregistrer et renvoyer en vérification"
            />
          ) : null}
          <DialogFooter />
        </DialogContent>
      </Dialog>
    </div>
  );
}
