"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { Gavel, Lock } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

import { enregistrerAvis } from "../actions-conseil";

const MENTIONS = [
  { valeur: "AUCUNE", libelle: "Aucune" },
  { valeur: "FELICITATIONS", libelle: "Félicitations" },
  { valeur: "ENCOURAGEMENTS", libelle: "Encouragements" },
  { valeur: "TABLEAU_HONNEUR", libelle: "Tableau d'honneur" },
  { valeur: "AVERTISSEMENT_TRAVAIL", libelle: "Avertissement travail" },
  { valeur: "AVERTISSEMENT_CONDUITE", libelle: "Avertissement conduite" },
  { valeur: "BLAME", libelle: "Blâme" },
];

const DECISIONS = [
  { valeur: "", libelle: "Non arrêtée" },
  { valeur: "ADMIS", libelle: "Admis(e)" },
  { valeur: "ADMIS_CONDITION", libelle: "Admis(e) sous condition" },
  { valeur: "REDOUBLE", libelle: "Redouble" },
  { valeur: "REORIENTE", libelle: "Réorienté(e)" },
  { valeur: "EXCLU", libelle: "Exclu(e)" },
  { valeur: "EN_ATTENTE", libelle: "En attente" },
];

/**
 * Avis du conseil de classe sur un bulletin.
 *
 * LA MENTION EST PROPOSÉE, JAMAIS IMPOSÉE
 * ----------------------------------------
 * Le calcul propose d'après la moyenne, la conduite et l'absentéisme. Le
 * conseil tranche : il peut refuser des félicitations à un élève brillant mais
 * perturbateur, ou en accorder à un élève en net progrès. La proposition sert à
 * ne rien oublier, pas à décider à la place des professeurs.
 *
 * UN BULLETIN PUBLIÉ NE SE RÉÉCRIT PAS
 * -------------------------------------
 * La famille l'a peut-être déjà lu. Le formulaire se verrouille alors, et
 * affiche la marche à suivre : dépublier, corriger, republier — chaque étape
 * étant journalisée.
 */
export function AvisConseil({
  inscriptionId,
  periodeId,
  eleve,
  mention,
  appreciation,
  decision,
  publie,
}: {
  inscriptionId: string;
  periodeId: string;
  eleve: string;
  mention: string | null;
  appreciation: string | null;
  decision: string | null;
  publie: boolean;
}) {
  const routeur = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [enCours, demarrer] = useTransition();

  function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const d = new FormData(evenement.currentTarget);

    demarrer(async () => {
      const r = await enregistrerAvis(inscriptionId, periodeId, {
        appreciationGenerale: String(d.get("appreciation") ?? ""),
        mention: String(d.get("mention") ?? "AUCUNE"),
        decision: String(d.get("decision") ?? "") || undefined,
      });

      toast[r.ok ? "success" : "error"](r.message ?? "Terminé.");
      if (r.ok) {
        setOuvert(false);
        routeur.refresh();
      }
    });
  }

  // Un bulletin déjà annoté se distingue d'un bulletin vierge : le conseil
  // parcourt trente élèves et doit voir d'un coup d'œil ce qui reste à faire.
  const annote = Boolean(appreciation || decision);

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>
        <Button variant={annote ? "ghost" : "outline"} size="sm">
          {publie ? <Lock aria-hidden /> : <Gavel aria-hidden />}
          {annote ? "Avis" : "Annoter"}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Conseil de classe — {eleve}</DialogTitle>
          <DialogDescription>
            {publie
              ? "Ce bulletin est publié : la famille peut déjà l'avoir lu. Dépubliez la classe pour modifier l'avis du conseil."
              : "La mention est proposée par le calcul. Le conseil décide."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={soumettre} className="space-y-4">
          <fieldset disabled={publie} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="mention">Mention</Label>
              <NativeSelect id="mention" name="mention" defaultValue={mention ?? "AUCUNE"}>
                {MENTIONS.map((m) => (
                  <option key={m.valeur} value={m.valeur}>
                    {m.libelle}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="appreciation">Appréciation générale</Label>
              <Textarea
                id="appreciation"
                name="appreciation"
                rows={3}
                maxLength={500}
                defaultValue={appreciation ?? ""}
                placeholder="Élève sérieux, en progrès constant. Doit consolider les mathématiques."
              />
              <p className="text-muted-foreground text-xs">
                Elle figure sur le bulletin remis à la famille.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="decision">Décision d&apos;orientation</Label>
              <NativeSelect id="decision" name="decision" defaultValue={decision ?? ""}>
                {DECISIONS.map((d) => (
                  <option key={d.valeur} value={d.valeur}>
                    {d.libelle}
                  </option>
                ))}
              </NativeSelect>
              <p className="text-muted-foreground text-xs">
                N&apos;apparaît sur le bulletin qu&apos;à la dernière période, et conditionne sa
                publication.
              </p>
            </div>
          </fieldset>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOuvert(false)}>
              Fermer
            </Button>
            {publie ? null : (
              <Button type="submit" disabled={enCours}>
                {enCours ? "Enregistrement…" : "Enregistrer"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
