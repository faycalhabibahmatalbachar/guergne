"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, FileBadge2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { enregistrerIdentiteLycee } from "./actions";

type Champs = {
  adresse: string | null;
  ville: string | null;
  pays: string | null;
  telephone: string | null;
  email: string | null;
  siteWeb: string | null;
  ministereTutelle: string | null;
  autorisationNumero: string | null;
  nomProviseur: string | null;
  nomCenseur: string | null;
};

const CHAMPS = [
  { nom: "adresse", etiquette: "Adresse du lycée", aide: "Quartier, rue ou référence de localisation", taille: 220 },
  { nom: "ville", etiquette: "Ville", aide: "Ville officielle", taille: 100 },
  { nom: "pays", etiquette: "Pays", aide: "Pays de l'établissement", taille: 100 },
  { nom: "telephone", etiquette: "Téléphone de contact", aide: "Numéro communiqué aux familles", taille: 30 },
  { nom: "email", etiquette: "E-mail institutionnel", aide: "Adresse publique de l'établissement", taille: 160 },
  { nom: "siteWeb", etiquette: "Site web", aide: "Adresse complète commençant par https://", taille: 240 },
] as const;

const ADMIN = [
  { nom: "ministereTutelle", etiquette: "Ministère de tutelle", aide: "Entête des documents officiels", taille: 180 },
  { nom: "autorisationNumero", etiquette: "Référence de l'autorisation", aide: "Numéro officiel si disponible", taille: 100 },
  { nom: "nomProviseur", etiquette: "Proviseur / Directeur", aide: "Signataire utilisé sur les documents", taille: 140 },
  { nom: "nomCenseur", etiquette: "Censeur", aide: "Responsable pédagogique", taille: 140 },
] as const;

function Groupe({
  liste,
  initial,
  enCours,
  erreurs,
}: {
  liste: readonly ((typeof CHAMPS)[number] | (typeof ADMIN)[number])[];
  initial: Champs;
  enCours: boolean;
  erreurs: Record<string, string>;
}) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {liste.map((champ) => (
          <div key={champ.nom} className="grid min-w-0 gap-1.5">
            <Label htmlFor={champ.nom}>{champ.etiquette}</Label>
            <Input
              id={champ.nom}
              name={champ.nom}
              type={champ.nom === "email" ? "email" : champ.nom === "siteWeb" ? "url" : "text"}
              defaultValue={initial[champ.nom] ?? ""}
              placeholder={champ.nom === "siteWeb" ? "https://exemple.td" : undefined}
              maxLength={champ.taille}
              aria-invalid={Boolean(erreurs[champ.nom])}
              aria-describedby={champ.nom + "-info"}
              disabled={enCours}
            />
            <p id={champ.nom + "-info"} className={erreurs[champ.nom] ? "text-destructive text-xs" : "text-muted-foreground text-xs"}>
              {erreurs[champ.nom] ?? champ.aide}
            </p>
          </div>
        ))}
      </div>
    );
  }

export function FormulaireIdentite({ initial }: { initial: Champs }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreurs, setErreurs] = useState<Record<string, string>>({});

  function enregistrer(donnees: FormData) {
    const saisie = Object.fromEntries([...CHAMPS, ...ADMIN].map((c) => [
      c.nom,
      String(donnees.get(c.nom) ?? ""),
    ]));
    setErreurs({});
    demarrer(async () => {
      const resultat = await enregistrerIdentiteLycee(saisie);
      if (!resultat.ok) {
        setErreurs(resultat.erreurs ?? {});
        toast.error(resultat.message);
        return;
      }
      toast.success(resultat.message);
      router.refresh();
    });
  }



  return (
    <form action={enregistrer} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="size-5" aria-hidden /> Coordonnées de contact
          </CardTitle>
          <CardDescription>
            Informations utilisées pour joindre le lycée et compléter ses documents.
          </CardDescription>
        </CardHeader>
        <CardContent><Groupe liste={CHAMPS} initial={initial} enCours={enCours} erreurs={erreurs} /></CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileBadge2 className="size-5" aria-hidden /> Administration et signataires
          </CardTitle>
          <CardDescription>
            Vérifiez les noms avant toute émission de document. Les modifications ne changent
            pas les bulletins déjà délivrés.
          </CardDescription>
        </CardHeader>
        <CardContent><Groupe liste={ADMIN} initial={initial} enCours={enCours} erreurs={erreurs} /></CardContent>
      </Card>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-md backdrop-blur supports-backdrop-filter:bg-background/85">
        <p className="max-w-xl text-muted-foreground text-xs">
          Les changements sont enregistrés et tracés. Les champs vides sont effacés.
        </p>
        <Button type="submit" disabled={enCours}>
          <Save className="size-4" aria-hidden />
          {enCours ? "Enregistrement…" : "Enregistrer les informations"}
        </Button>
      </div>
    </form>
  );
}
