"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { AlertTriangle, Plus, Search, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LigneEnseignant } from "@/server/domain/personnel";

import { basculerEnseignant, creerEnseignant } from "../actions";

export const STATUTS_ENSEIGNANT = [
  { valeur: "PERMANENT", libelle: "Permanent" },
  { valeur: "CONTRACTUEL", libelle: "Contractuel" },
  { valeur: "VACATAIRE", libelle: "Vacataire" },
  { valeur: "STAGIAIRE", libelle: "Stagiaire" },
  { valeur: "SUSPENDU", libelle: "Suspendu" },
  { valeur: "RETRAITE", libelle: "Retraité" },
  { valeur: "DEMISSIONNAIRE", libelle: "Démissionnaire" },
] as const;

const LIBELLE_STATUT = Object.fromEntries(
  STATUTS_ENSEIGNANT.map((s) => [s.valeur, s.libelle]),
) as Record<string, string>;

export function ListeEnseignants({ enseignants }: { enseignants: LigneEnseignant[] }) {
  const [enCours, demarrer] = useTransition();
  const [ouvert, setOuvert] = useState(false);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [recherche, setRecherche] = useState("");
  const [filtreStatut, setFiltreStatut] = useState("");

  const visibles = enseignants.filter((e) => {
    const texte = `${e.nom} ${e.prenom} ${e.matricule} ${e.specialite ?? ""}`.toLowerCase();
    return (
      texte.includes(recherche.toLowerCase()) && (filtreStatut === "" || e.statut === filtreStatut)
    );
  });

  function soumettre(formulaire: FormData) {
    setErreurs({});
    const brut = Object.fromEntries(formulaire.entries());
    demarrer(async () => {
      const r = await creerEnseignant({
        ...brut,
        sexe: brut.sexe || null,
        heuresContractuelles: brut.heuresContractuelles === "" ? null : brut.heuresContractuelles,
      });
      if (r.ok) {
        toast.success("Enseignant enregistré.");
        setOuvert(false);
      } else {
        setErreurs(r.erreurs ?? {});
        if (r.message) toast.error(r.message);
      }
    });
  }

  const erreur = (c: string) =>
    erreurs[c] ? <p className="text-destructive text-sm">{erreurs[c]}</p> : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Personnel enseignant</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {enseignants.length === 0
              ? "Aucun enseignant enregistré"
              : `${enseignants.length} enseignant${enseignants.length > 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/*
            L'import est en retrait : c'est un geste de reprise, fait une fois
            en début d'année, là où la création unitaire est le quotidien.
          */}
          <Button size="sm" variant="outline" asChild>
            <Link href="/dashboard/personnel/importer">
              <Upload aria-hidden />
              Importer un fichier
            </Link>
          </Button>
          <Button size="sm" onClick={() => setOuvert(true)}>
            <Plus aria-hidden />
            Nouvel enseignant
          </Button>
        </div>
      </div>

      {enseignants.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-64 flex-1">
            <Search
              className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Nom, matricule, spécialité…"
              className="pl-9"
              aria-label="Rechercher un enseignant"
            />
          </div>
          <NativeSelect
            value={filtreStatut}
            onChange={(e) => setFiltreStatut(e.target.value)}
            className="w-52"
            aria-label="Filtrer par statut"
          >
            <option value="">Tous les statuts</option>
            {STATUTS_ENSEIGNANT.map((s) => (
              <option key={s.valeur} value={s.valeur}>
                {s.libelle}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {visibles.length === 0 ? (
            <p className="py-14 text-center text-muted-foreground text-sm">
              {enseignants.length === 0
                ? "Enregistrez les enseignants, puis affectez-les aux couples classe × matière."
                : "Aucun enseignant ne correspond à cette recherche."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Enseignant</TableHead>
                  <TableHead>Matricule</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Matière principale</TableHead>
                  <TableHead>Charge</TableHead>
                  <TableHead>Actif</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((e) => {
                  const contrat = e.heuresContractuelles ? Number(e.heuresContractuelles) : null;
                  const surcharge = contrat != null && e.heuresAffectees > contrat;

                  return (
                    <TableRow key={e.id} className={e.actif ? undefined : "opacity-55"}>
                      <TableCell>
                        <Link
                          href={`/dashboard/personnel/${e.id}`}
                          className="font-medium hover:underline"
                        >
                          {e.prenom} {e.nom}
                        </Link>
                        {e.telephone ? (
                          <p className="text-muted-foreground text-xs">{e.telephone}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {e.matricule}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={e.statut === "PERMANENT" ? "default" : "secondary"}>
                          {LIBELLE_STATUT[e.statut] ?? e.statut}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {e.matierePrincipale ?? e.specialite ?? "—"}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        <span className={surcharge ? "text-amber-600 dark:text-amber-400" : undefined}>
                          {e.heuresAffectees}
                          {contrat != null ? ` / ${contrat} h` : " h"}
                        </span>
                        {surcharge ? (
                          <AlertTriangle
                            className="ml-1 inline size-3.5 text-amber-600 dark:text-amber-400"
                            aria-label="Charge supérieure au contrat"
                          />
                        ) : null}
                        <p className="text-muted-foreground text-xs">
                          {e.nbAffectations} affectation{e.nbAffectations > 1 ? "s" : ""} ·{" "}
                          {e.creneauxPlaces} créneau{e.creneauxPlaces > 1 ? "x" : ""}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={e.actif}
                          disabled={enCours}
                          aria-label={`Activer ${e.prenom} ${e.nom}`}
                          onCheckedChange={(v) =>
                            demarrer(async () => {
                              const r = await basculerEnseignant(e.id, v);
                              if (!r.ok) toast.error(r.message ?? "Échec.");
                            })
                          }
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <form action={soumettre}>
            <DialogHeader>
              <DialogTitle>Nouvel enseignant</DialogTitle>
              <DialogDescription>
                Les affectations aux classes et matières se règlent ensuite depuis sa fiche.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="matricule">Matricule *</Label>
                <Input id="matricule" name="matricule" placeholder="ENS-001" required />
                {erreur("matricule")}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="statut">Statut *</Label>
                <NativeSelect id="statut" name="statut" defaultValue="PERMANENT">
                  {STATUTS_ENSEIGNANT.map((s) => (
                    <option key={s.valeur} value={s.valeur}>
                      {s.libelle}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="nom">Nom *</Label>
                <Input id="nom" name="nom" required />
                {erreur("nom")}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="prenom">Prénom *</Label>
                <Input id="prenom" name="prenom" required />
                {erreur("prenom")}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sexe">Sexe</Label>
                <NativeSelect id="sexe" name="sexe" defaultValue="">
                  <option value="">—</option>
                  <option value="M">Masculin</option>
                  <option value="F">Féminin</option>
                </NativeSelect>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dateNaissance">Date de naissance</Label>
                <Input id="dateNaissance" name="dateNaissance" type="date" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="telephone">Téléphone</Label>
                <Input id="telephone" name="telephone" placeholder="+235 66 00 00 00" />
                {erreur("telephone")}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" name="email" type="email" />
                {erreur("email")}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="diplome">Diplôme</Label>
                <Input id="diplome" name="diplome" placeholder="Licence de mathématiques" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="specialite">Spécialité</Label>
                <Input id="specialite" name="specialite" placeholder="Mathématiques" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dateEmbauche">Date d&apos;embauche</Label>
                <Input id="dateEmbauche" name="dateEmbauche" type="date" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="heuresContractuelles">Heures hebdomadaires</Label>
                <Input
                  id="heuresContractuelles"
                  name="heuresContractuelles"
                  type="number"
                  min={0}
                  max={40}
                  step={0.5}
                  placeholder="18"
                />
                <p className="text-muted-foreground text-xs">
                  Sert de référence pour repérer les surcharges.
                </p>
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="adresse">Adresse</Label>
                <Input id="adresse" name="adresse" />
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={enCours}>
                {enCours ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
