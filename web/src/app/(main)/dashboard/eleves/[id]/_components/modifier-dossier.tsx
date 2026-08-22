"use client";

import { useState, useTransition } from "react";

import { Pencil } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

import { modifierEleve } from "../../actions";

export interface DossierModifiable {
  nom: string;
  prenom: string;
  sexe: string;
  dateNaissance: string;
  lieuNaissance: string | null;
  nationalite: string | null;
  acteNaissanceNumero: string | null;
  adresse: string | null;
  quartier: string | null;
  telephone: string | null;
  email: string | null;
  groupeSanguin: string | null;
  allergies: string | null;
  observationsMedicales: string | null;
  situationParticuliere: string | null;
  urgenceNom: string | null;
  urgenceTelephone: string | null;
  urgenceLien: string | null;
  ecoleOrigine: string | null;
}

/**
 * Correction du dossier d'un élève déjà inscrit.
 *
 * Le dossier était en lecture seule une fois l'inscription faite : une faute
 * d'orthographe sur un nom se retrouvait sur chaque bulletin de l'année, et il
 * fallait vivre avec.
 *
 * Trois choses ne se corrigent PAS ici, et c'est délibéré :
 *   - le **matricule**, qui figure sur des cartes et des reçus déjà remis aux
 *     familles ;
 *   - la **classe** et le **statut**, qui ont leurs propres actions — elles
 *     écrivent un historique et préviennent les tuteurs ;
 *   - la **liste des tuteurs**, qui se gère depuis l'onglet Famille.
 *
 * Le formulaire est pré-rempli avec l'existant : une modification est une
 * correction, pas une nouvelle saisie, et repartir d'un formulaire vide ferait
 * perdre les champs qu'on n'a pas retouchés.
 */
export function ModifierDossier({
  eleveId,
  dossier,
}: {
  eleveId: string;
  dossier: DossierModifiable;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [enCours, demarrer] = useTransition();
  const [erreurs, setErreurs] = useState<Record<string, string>>({});

  const erreur = (champ: string) =>
    erreurs[champ] ? <p className="text-destructive text-xs">{erreurs[champ]}</p> : null;

  function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const donnees = Object.fromEntries(new FormData(evenement.currentTarget));
    setErreurs({});

    demarrer(async () => {
      const r = await modifierEleve(eleveId, donnees);
      if (r.ok) {
        toast.success(r.message ?? "Dossier mis à jour.");
        setOuvert(false);
      } else {
        setErreurs(r.erreurs ?? {});
        toast.error(r.message ?? Object.values(r.erreurs ?? {})[0] ?? "La modification a échoué.");
      }
    });
  }

  const champ = (
    nom: keyof DossierModifiable,
    libelle: string,
    options?: { type?: string; requis?: boolean },
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={nom}>
        {libelle}
        {options?.requis ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Input
        id={nom}
        name={nom}
        type={options?.type ?? "text"}
        defaultValue={dossier[nom] ?? ""}
        aria-invalid={Boolean(erreurs[nom])}
      />
      {erreur(nom)}
    </div>
  );

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil aria-hidden />
          Modifier le dossier
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Corriger le dossier</DialogTitle>
          <DialogDescription>
            Chaque modification est journalisée. Le matricule, la classe et le statut se
            modifient depuis leurs actions dédiées.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={soumettre} className="space-y-6">
          <section className="space-y-3">
            <h3 className="font-semibold text-sm">État civil</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {champ("nom", "Nom", { requis: true })}
              {champ("prenom", "Prénom", { requis: true })}

              <div className="space-y-1.5">
                <Label htmlFor="sexe">
                  Sexe<span className="text-destructive"> *</span>
                </Label>
                <NativeSelect id="sexe" name="sexe" defaultValue={dossier.sexe}>
                  <option value="M">Masculin</option>
                  <option value="F">Féminin</option>
                </NativeSelect>
                {erreur("sexe")}
              </div>

              {champ("dateNaissance", "Date de naissance", { type: "date", requis: true })}
              {champ("lieuNaissance", "Lieu de naissance")}
              {champ("nationalite", "Nationalité")}
              {champ("acteNaissanceNumero", "N° d'acte de naissance")}
              {champ("ecoleOrigine", "École d'origine")}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="font-semibold text-sm">Coordonnées</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {champ("adresse", "Adresse")}
              {champ("quartier", "Quartier")}
              {champ("telephone", "Téléphone")}
              {champ("email", "Adresse électronique", { type: "email" })}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="font-semibold text-sm">Santé et urgence</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {champ("groupeSanguin", "Groupe sanguin")}
              {champ("urgenceNom", "Personne à prévenir")}
              {champ("urgenceTelephone", "Téléphone d'urgence")}
              {champ("urgenceLien", "Lien avec l'élève")}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="allergies">Allergies</Label>
              <Textarea id="allergies" name="allergies" rows={2} defaultValue={dossier.allergies ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="observationsMedicales">Observations médicales</Label>
              <Textarea
                id="observationsMedicales"
                name="observationsMedicales"
                rows={2}
                defaultValue={dossier.observationsMedicales ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="situationParticuliere">Situation particulière</Label>
              <Textarea
                id="situationParticuliere"
                name="situationParticuliere"
                rows={2}
                defaultValue={dossier.situationParticuliere ?? ""}
              />
            </div>
          </section>

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
