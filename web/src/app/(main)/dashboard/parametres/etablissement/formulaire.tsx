"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SaisieIdentiteLycee } from "@/lib/parametres-identite";
import type { chargerIdentiteLycee } from "@/server/domain/identite-lycee";

import { sauvegarderIdentiteLycee } from "./actions";

type Identite = NonNullable<Awaited<ReturnType<typeof chargerIdentiteLycee>>>;

type Cle = Exclude<keyof SaisieIdentiteLycee, "version">;
const champs: Array<{ nom: Cle; titre: string; type?: string; placeholder?: string }> = [
  { nom: "ville", titre: "Ville", placeholder: "N'Djamena" },
  { nom: "pays", titre: "Pays", placeholder: "Tchad" },
  { nom: "telephone", titre: "Téléphone officiel", type: "tel", placeholder: "+235 …" },
  { nom: "email", titre: "E-mail officiel", type: "email", placeholder: "contact@exemple.td" },
  { nom: "siteWeb", titre: "Site officiel (HTTPS)", type: "url", placeholder: "https://exemple.td" },
  { nom: "ministereTutelle", titre: "Ministère de tutelle" },
  { nom: "autorisationNumero", titre: "Numéro d'autorisation" },
  { nom: "nomProviseur", titre: "Nom du proviseur" },
  { nom: "nomCenseur", titre: "Nom du censeur" },
];

export function FormulaireIdentiteLycee({ identite }: { identite: Identite }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [valeurs, setValeurs] = useState<SaisieIdentiteLycee>({
    version: identite.version,
    adresse: identite.adresse ?? "",
    ville: identite.ville ?? "",
    pays: identite.pays ?? "",
    telephone: identite.telephone ?? "",
    email: identite.email ?? "",
    siteWeb: identite.siteWeb ?? "",
    ministereTutelle: identite.ministereTutelle ?? "",
    autorisationNumero: identite.autorisationNumero ?? "",
    nomProviseur: identite.nomProviseur ?? "",
    nomCenseur: identite.nomCenseur ?? "",
  });

  function modifier(nom: Cle, valeur: string) {
    setValeurs((actuel) => ({ ...actuel, [nom]: valeur }));
    setErreurs((actuel) => ({ ...actuel, [nom]: "" }));
  }

  function enregistrer() {
    demarrer(async () => {
      const resultat = await sauvegarderIdentiteLycee(valeurs);
      setErreurs(resultat.erreurs ?? {});
      toast[resultat.ok ? "success" : "error"](resultat.message ?? "Enregistrement impossible.");
      if (resultat.ok) router.refresh();
    });
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(evenement) => {
        evenement.preventDefault();
        enregistrer();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="adresse-lycee">Adresse postale et repères</Label>
        <Textarea
          id="adresse-lycee"
          value={valeurs.adresse}
          onChange={(e) => modifier("adresse", e.target.value)}
          maxLength={240}
          rows={2}
          disabled={enCours}
          aria-invalid={Boolean(erreurs.adresse)}
        />
        {erreurs.adresse && <p className="text-destructive text-xs">{erreurs.adresse}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {champs.map((champ) => (
          <div key={champ.nom} className="space-y-2">
            <Label htmlFor={champ.nom}>{champ.titre}</Label>
            <Input
              id={champ.nom}
              type={champ.type ?? "text"}
              placeholder={champ.placeholder}
              value={valeurs[champ.nom]}
              onChange={(e) => modifier(champ.nom, e.target.value)}
              aria-invalid={Boolean(erreurs[champ.nom])}
              maxLength={champ.nom === "email" ? 254 : champ.nom === "telephone" ? 32 : champ.nom === "siteWeb" ? 250 : 180}
              required={champ.nom === "ville" || champ.nom === "pays"}
              disabled={enCours}
            />
            {erreurs[champ.nom] && (
              <p className="text-destructive text-xs">{erreurs[champ.nom]}</p>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-muted-foreground text-xs">
          Seuls les utilisateurs autorisés peuvent modifier ces informations. Chaque opération est journalisée.
        </p>
        <Button type="submit" disabled={enCours}>
          {enCours ? "Enregistrement…" : "Enregistrer les coordonnées"}
        </Button>
      </div>
    </form>
  );
}
