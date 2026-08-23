"use client";

import { useState, useTransition } from "react";

import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { modifierCoordonnees } from "../../actions";

/**
 * Correction des coordonnées d'un tuteur.
 *
 * Un numéro erroné est la PREMIÈRE cause d'échec des notifications, et jusqu'ici
 * il était impossible de le corriger : l'action serveur existait depuis
 * l'origine, mais aucun écran ne l'appelait.
 *
 * La correction met aussi à jour le compte associé — l'identifiant de connexion
 * du parent EST son numéro. Le changer d'un côté seulement le mettrait dehors.
 */
export function CoordonneesTuteur({
  tuteurId,
  nomComplet,
  telephone,
  email,
  accepteSms,
}: {
  tuteurId: string;
  nomComplet: string;
  telephone: string;
  email: string | null;
  accepteSms: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [sms, setSms] = useState(accepteSms);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [enCours, demarrer] = useTransition();

  function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const donnees = new FormData(evenement.currentTarget);
    setErreurs({});

    demarrer(async () => {
      const r = await modifierCoordonnees(tuteurId, {
        telephone: String(donnees.get("telephone") ?? ""),
        email: String(donnees.get("email") ?? ""),
        accepteSms: sms,
      });

      if (r.ok) {
        toast.success(r.message ?? "Coordonnées mises à jour.");
        setOuvert(false);
      } else {
        setErreurs(r.erreurs ?? {});
        toast.error(r.message ?? Object.values(r.erreurs ?? {})[0] ?? "La modification a échoué.");
      }
    });
  }

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil aria-hidden />
          Corriger les coordonnées
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Coordonnées de {nomComplet}</DialogTitle>
          <DialogDescription>
            Le numéro sert aussi d&apos;identifiant de connexion : le corriger ici met le
            compte à jour en même temps.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={soumettre} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="telephone">
              Téléphone<span className="text-destructive"> *</span>
            </Label>
            <Input
              id="telephone"
              name="telephone"
              defaultValue={telephone}
              aria-invalid={Boolean(erreurs.telephone)}
            />
            {erreurs.telephone ? (
              <p className="text-destructive text-xs">{erreurs.telephone}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Adresse électronique</Label>
            <Input id="email" name="email" type="email" defaultValue={email ?? ""} />
            {erreurs.email ? <p className="text-destructive text-xs">{erreurs.email}</p> : null}
          </div>

          <div className="flex items-start gap-2.5">
            <Checkbox
              id="accepteSms"
              checked={sms}
              onCheckedChange={(v) => setSms(v === true)}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="accepteSms" className="font-normal">
                Accepte de recevoir des SMS
              </Label>
              <p className="text-muted-foreground text-xs">
                Décoché, ce tuteur ne recevra que les notifications de l&apos;application. Les
                messages ne sont pas perdus : ils l&apos;attendent.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOuvert(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={enCours}>
              {enCours ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
