"use client";

import { useEffect, useState, useTransition } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { LoaderCircle, Pencil } from "lucide-react";
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

import { chargerDossierPourModification, modifierEleve } from "../../actions";

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
  declencheur = "bouton",
  nomEleve,
  activerDepuisUrl = false,
}: {
  eleveId: string;
  dossier?: DossierModifiable;
  declencheur?: "bouton" | "icone";
  nomEleve?: string;
  activerDepuisUrl?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const demandeOuverture = activerDepuisUrl && params.get("completer") === "1";
  const [ouvert, setOuvert] = useState(demandeOuverture);
  useEffect(() => {
    if (demandeOuverture) setOuvert(true);
  }, [demandeOuverture]);
  function nettoyerUrl() {
    if (!activerDepuisUrl || !params.has("completer")) return;
    const nouveaux = new URLSearchParams(params.toString());
    nouveaux.delete("completer");
    router.replace("/dashboard/eleves/" + eleveId + (nouveaux.size ? "?" + nouveaux.toString() : ""), {
      scroll: false,
    });
  }
  const [charge, setCharge] = useState<DossierModifiable | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreurChargement, setErreurChargement] = useState("");
  const valeurs = dossier ?? charge;
  async function changerOuverture(next: boolean) {
    setOuvert(next);
    if (!next) {
      nettoyerUrl();
      return;
    }
    if (dossier) return;
    setCharge(null);
    setErreurChargement("");
    setChargement(true);
    try {
      const reponse = await chargerDossierPourModification(eleveId);
      if (reponse.ok) setCharge(reponse.dossier);
      else setErreurChargement(reponse.message);
    } catch {
      setErreurChargement("Chargement du dossier impossible.");
    } finally {
      setChargement(false);
    }
  }
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
        nettoyerUrl();
        router.refresh();
      } else {
        setErreurs(r.erreurs ?? {});
        toast.error(r.message ?? Object.values(r.erreurs ?? {})[0] ?? "La modification a échoué.");
      }
    });
  }

  const champ = (nom: keyof DossierModifiable, libelle: string, options?: { type?: string; requis?: boolean }) => (
    <div className="form-group space-y-1.5">
      <Label htmlFor={nom}>
        {libelle}
        {options?.requis ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Input
        id={nom}
        name={nom}
        type={options?.type ?? "text"}
        defaultValue={valeurs?.[nom] ?? ""}
        className="form-control rounded-lg"
        aria-invalid={Boolean(erreurs[nom])}
      />
      {erreur(nom)}
    </div>
  );

  return (
    <Dialog open={ouvert} onOpenChange={changerOuverture}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={declencheur === "icone" ? "outline" : "default"}
          size={declencheur === "icone" ? "icon" : "sm"}
          className={
            declencheur === "icone"
              ? "size-8 rounded-lg border-border bg-card text-foreground shadow-none hover:bg-succes-doux/90"
              : ""
          }
          title={declencheur === "icone" ? "Modifier le dossier" : undefined}
          aria-label={declencheur === "icone" ? "Modifier le dossier de " + (nomEleve ?? "cet élève") : undefined}
        >
          <Pencil className="size-4" aria-hidden />
          {declencheur === "icone" ? null : "Modifier le dossier"}
        </Button>
      </DialogTrigger>

      <DialogContent className="gentelella-v4 max-h-[90dvh] w-[calc(100vw-2rem)] overflow-y-auto rounded-xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Corriger le dossier</DialogTitle>
          <DialogDescription>
            Chaque modification est journalisée. Le matricule, la classe et le statut se modifient depuis leurs actions
            dédiées.
          </DialogDescription>
        </DialogHeader>

        {valeurs ? (
          <p className="alert alert-info rounded-lg border border-info-trait bg-info-doux px-3 py-2 text-xs leading-5 text-info">
            Utilisez les documents et déclarations des familles. Un champ vide ne signifie pas « néant », notamment pour
            la santé.
          </p>
        ) : null}
        {chargement ? (
          <div className="flex min-h-36 items-center justify-center gap-3 text-sm text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" aria-hidden />
            Chargement des informations…
          </div>
        ) : erreurChargement ? (
          <p role="alert" className="rounded-lg bg-danger-doux p-4 text-sm text-danger">
            {erreurChargement}
          </p>
        ) : valeurs ? (
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
                  <NativeSelect id="sexe" name="sexe" className="form-control rounded-lg" defaultValue={valeurs.sexe}>
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
                <Textarea
                  id="allergies"
                  name="allergies"
                  className="form-control rounded-lg"
                  rows={2}
                  defaultValue={valeurs.allergies ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="observationsMedicales">Observations médicales</Label>
                <Textarea
                  id="observationsMedicales"
                  name="observationsMedicales"
                  className="form-control rounded-lg"
                  rows={2}
                  defaultValue={valeurs.observationsMedicales ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="situationParticuliere">Situation particulière</Label>
                <Textarea
                  id="situationParticuliere"
                  name="situationParticuliere"
                  className="form-control rounded-lg"
                  rows={2}
                  defaultValue={valeurs.situationParticuliere ?? ""}
                />
              </div>
            </section>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOuvert(false);
                  nettoyerUrl();
                }}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={enCours}>
                {enCours ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
