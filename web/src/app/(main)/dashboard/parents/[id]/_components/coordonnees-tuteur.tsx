"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { modifierCoordonnees, modifierProfilTuteur } from "../../actions";

type Profil = {
  nom: string; prenom: string; sexe: string | null;
  telephoneSecondaire: string | null; profession: string | null;
  employeur: string | null; adresse: string | null; quartier: string | null;
};

export function CoordonneesTuteur({
  tuteurId, nomComplet, telephone, email, accepteSms,
  variante = "secondaire", profil,
}: {
  tuteurId: string; nomComplet: string; telephone: string;
  email: string | null; accepteSms: boolean;
  variante?: "primaire" | "secondaire"; profil?: Profil;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [sms, setSms] = useState(accepteSms);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [enCours, demarrer] = useTransition();

  function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const donnees = new FormData(evenement.currentTarget);
    setErreurs({});
    demarrer(async () => {
      const r = profil
        ? await modifierProfilTuteur(tuteurId, {
            nom: String(donnees.get("nom") ?? ""),
            prenom: String(donnees.get("prenom") ?? ""),
            sexe: String(donnees.get("sexe") ?? ""),
            telephone: String(donnees.get("telephone") ?? ""),
            telephoneSecondaire: String(donnees.get("telephoneSecondaire") ?? ""),
            email: String(donnees.get("email") ?? ""),
            profession: String(donnees.get("profession") ?? ""),
            employeur: String(donnees.get("employeur") ?? ""),
            adresse: String(donnees.get("adresse") ?? ""),
            quartier: String(donnees.get("quartier") ?? ""),
            accepteSms: sms,
          })
        : await modifierCoordonnees(tuteurId, {
            telephone: String(donnees.get("telephone") ?? ""),
            email: String(donnees.get("email") ?? ""),
            accepteSms: sms,
          });

      if (r.ok) {
        toast.success(r.message ?? "Informations mises à jour.");
        setOuvert(false);
        router.refresh();
      } else {
        setErreurs(r.erreurs ?? {});
        toast.error(r.message ?? Object.values(r.erreurs ?? {})[0] ?? "La modification a échoué.");
      }
    });
  }
  const champ = (nom: string, libelle: string, valeur: string | null, requis = false, type = "text") => (
    <div className="space-y-1.5">
      <Label htmlFor={nom + "-" + tuteurId}>{libelle}{requis ? <span className="text-red-600"> *</span> : null}</Label>
      <Input id={nom + "-" + tuteurId} name={nom} type={type} required={requis}
        defaultValue={valeur ?? ""} aria-invalid={Boolean(erreurs[nom])} />
      {erreurs[nom] ? <p role="alert" className="text-xs text-red-600">{erreurs[nom]}</p> : null}
    </div>
  );
  return <Dialog open={ouvert} onOpenChange={v => { if (!enCours) setOuvert(v); }}>
    <DialogTrigger asChild>
      <Button variant={variante === "primaire" ? "default" : "outline"} size="sm"
        className={variante === "primaire"
          ? "h-10 gap-2 rounded-xl bg-blue-600 px-4 font-semibold text-white shadow-sm hover:bg-blue-700"
          : "h-9 gap-2 rounded-xl border-slate-200 bg-white px-3.5 text-xs font-semibold shadow-none dark:border-border dark:bg-card"}>
        <Pencil className="size-4" aria-hidden />
        {variante === "primaire" ? "Corriger les coordonnées" : "Modifier"}
      </Button>
    </DialogTrigger>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Informations de {nomComplet}</DialogTitle>
        <DialogDescription>
          Modifiez les informations du responsable. Son numéro principal sert aussi d'identifiant de connexion. La mise à jour du compte associé est effectuée automatiquement.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={soumettre} className="space-y-4">
        {profil ? <div className="grid gap-3 sm:grid-cols-2">
          {champ("nom", "Nom", profil.nom, true)}
          {champ("prenom", "Prénom", profil.prenom, true)}
          <div className="space-y-1.5"><Label htmlFor={"sexe-" + tuteurId}>Sexe</Label>
            <NativeSelect name="sexe" id={"sexe-" + tuteurId} defaultValue={profil.sexe ?? ""}>
              <option value="">Non renseigné</option>
              <option value="M">Masculin</option><option value="F">Féminin</option>
            </NativeSelect>
          </div>
          {champ("profession", "Profession", profil.profession)}
          {champ("employeur", "Employeur", profil.employeur)}
        </div> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {champ("telephone", "Téléphone principal", telephone, true, "tel")}
          {profil ? champ("telephoneSecondaire", "Second numéro", profil.telephoneSecondaire, false, "tel") : null}
          {champ("email", "Adresse électronique", email, false, "email")}
          {profil ? champ("quartier", "Quartier", profil.quartier) : null}
          {profil ? <div className="sm:col-span-2">{champ("adresse", "Adresse", profil.adresse)}</div> : null}
        </div>
        <div className="flex items-start gap-2.5 border-t border-slate-100 pt-3 dark:border-border">
          <Checkbox id={"accepteSms-" + tuteurId} checked={sms} onCheckedChange={v => setSms(v === true)} className="mt-0.5" />
          <div><Label htmlFor={"accepteSms-" + tuteurId} className="font-normal">Accepte de recevoir des SMS</Label>
            <p className="text-xs leading-relaxed text-muted-foreground">Les notifications SMS peuvent être facturées. Les changements de consentement seront enregistrés dans le dossier.</p></div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={enCours} onClick={() => setOuvert(false)}>Annuler</Button>
          <Button type="submit" disabled={enCours}>{enCours ? "Enregistrement…" : "Enregistrer"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
