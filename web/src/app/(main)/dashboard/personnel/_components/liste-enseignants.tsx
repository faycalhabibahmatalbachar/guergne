"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { AlertTriangle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Eye, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { statTile, statusBadge } from "@/vendor/gentelella-v4/markup.js";

import statistiquesStyles from "../../parents/_components/statistiques-parents.module.css";
import { basculerEnseignant, creerEnseignant } from "../actions";
import { CompteAcces } from "./compte-acces";
import personnelStyles from "./personnel-stats.module.css";

export const STATUTS_ENSEIGNANT = [
  { valeur: "PERMANENT", libelle: "Permanent" },
  { valeur: "CONTRACTUEL", libelle: "Contractuel" },
  { valeur: "VACATAIRE", libelle: "Vacataire" },
  { valeur: "STAGIAIRE", libelle: "Stagiaire" },
  { valeur: "SUSPENDU", libelle: "Suspendu" },
  { valeur: "RETRAITE", libelle: "Retraité" },
  { valeur: "DEMISSIONNAIRE", libelle: "Démissionnaire" },
] as const;

const LIBELLE_STATUT: Record<string, string> = Object.fromEntries(STATUTS_ENSEIGNANT.map((s) => [s.valeur, s.libelle]));

// Icônes SVG statiques issues de Gentelella v4. Les valeurs dynamiques sont
// échappées par la fonction statTile originale du code source sous licence MIT.
const iconPersonnes =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>';
const iconHorloge =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
const iconVerif =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12l5 5L20 6"/></svg>';
const iconCle =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="15" r="4"/><path d="M11 12L21 2m-2 2 3 3m-6 0 3 3"/></svg>';
const iconCharge =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>';

type Couleur = "teal" | "blue" | "green" | "yellow" | "red" | "purple";
const nf = (valeur: number) => valeur.toLocaleString("fr-FR");

function CarteGentelella({
  titre,
  valeur,
  detail,
  couleur,
  icone,
}: {
  titre: string;
  valeur: number;
  detail: string;
  couleur: Couleur;
  icone: string;
}) {
  const balisage = statTile({ label: titre, value: nf(valeur), color: couleur, iconHtml: icone, subtext: detail });
  return <div className={personnelStyles.tuile} dangerouslySetInnerHTML={{ __html: balisage }} />;
}

function ServiceEnseignant({ enseignant }: { enseignant: LigneEnseignant }) {
  const contrat = enseignant.heuresContractuelles ? Number(enseignant.heuresContractuelles) : null;
  const surcharge = contrat !== null && enseignant.heuresAffectees > contrat;
  const souscharge = contrat !== null && contrat > 0 && enseignant.heuresAffectees < contrat;
  return (
    <div className="space-y-1">
      <p
        className={
          "text-sm font-semibold tabular-nums " +
          (surcharge ? "text-danger" : souscharge ? "text-alerte" : "text-foreground")
        }
      >
        {nf(enseignant.heuresAffectees)}
        {contrat !== null ? " / " + nf(contrat) : ""} h
        {surcharge ? <AlertTriangle className="ml-1 inline size-3.5" aria-label="Surcharge" /> : null}
      </p>
      <p className="text-xs text-muted-foreground">
        {enseignant.nbAffectations} affectation(s) · {enseignant.creneauxPlaces} créneau(x)
      </p>
    </div>
  );
}

/** L'URL porte les filtres ; seule la pagination/présentation est locale. */
export function ListeEnseignants({
  enseignants,
  creationDemandee = false,
}: {
  enseignants: LigneEnseignant[];
  creationDemandee?: boolean;
}) {
  const routeur = useRouter();
  const rechercheParams = useSearchParams();
  const [enCours, demarrer] = useTransition();
  const [ouvert, setOuvert] = useState(creationDemandee);
  useEffect(() => {
    if (creationDemandee) setOuvert(true);
  }, [creationDemandee]);
  function fermerCreation(visible: boolean) {
    setOuvert(visible);
    if (!visible && rechercheParams.has("nouveau")) {
      const q = new URLSearchParams(rechercheParams.toString());
      q.delete("nouveau");
      routeur.replace("/dashboard/personnel" + (q.size ? "?" + q.toString() : ""), { scroll: false });
    }
  }
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [parPage, setParPage] = useState(10);
  const [page, setPage] = useState(1);
  const [ordre, setOrdre] = useState("nom");

  useEffect(() => {
    setPage(1);
  }, [enseignants]);
  const lignes = useMemo(
    () =>
      [...enseignants].sort((a, b) => {
        if (ordre === "service") return b.heuresAffectees - a.heuresAffectees || a.nom.localeCompare(b.nom, "fr");
        if (ordre === "statut") return a.statut.localeCompare(b.statut, "fr") || a.nom.localeCompare(b.nom, "fr");
        return a.nom.localeCompare(b.nom, "fr") || a.prenom.localeCompare(b.prenom, "fr");
      }),
    [enseignants, ordre],
  );
  const total = lignes.length;
  const nbPages = Math.max(1, Math.ceil(total / parPage));
  const pageVisible = Math.min(page, nbPages);
  const debut = (pageVisible - 1) * parPage;
  const affichees = lignes.slice(debut, debut + parPage);
  const pages = [
    ...new Set([1, Math.max(1, pageVisible - 1), pageVisible, Math.min(nbPages, pageVisible + 1), nbPages]),
  ].sort((a, b) => a - b);
  const sansCompte = enseignants.filter((e) => !e.aCompte).length;
  const actifs = enseignants.filter((e) => e.actif).length;
  const comptesActifs = enseignants.filter((e) => e.aCompte && e.compteActif).length;
  const sousCharges = enseignants.filter(
    (e) =>
      e.heuresContractuelles !== null &&
      Number(e.heuresContractuelles) > 0 &&
      e.heuresAffectees < Number(e.heuresContractuelles),
  ).length;

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
        fermerCreation(false);
        routeur.refresh();
      } else {
        setErreurs(r.erreurs ?? {});
        if (r.message) toast.error(r.message);
      }
    });
  }

  const erreur = (c: string) => (erreurs[c] ? <p className="text-destructive text-sm">{erreurs[c]}</p> : null);

  const indicateurs: Array<{ titre: string; valeur: number; detail: string; couleur: Couleur; icone: string }> = [
    {
      titre: "Dossiers enseignants",
      valeur: total,
      detail: "Résultats correspondant aux filtres",
      couleur: "teal",
      icone: iconPersonnes,
    },
    { titre: "En activité", valeur: actifs, detail: "En activité", couleur: "green", icone: iconVerif },
    { titre: "Accès actifs", valeur: comptesActifs, detail: "Accès actifs", couleur: "blue", icone: iconCle },
    { titre: "Sans compte", valeur: sansCompte, detail: "Sans accès", couleur: "yellow", icone: iconCle },
    {
      titre: "Service incomplet",
      valeur: sousCharges,
      detail: "Charge à compléter",
      couleur: "purple",
      icone: iconCharge,
    },
  ];

  return (
    <div className="space-y-4">
      <section
        className={"gentelella-v4 " + statistiquesStyles.region}
        aria-label="Indicateurs du personnel enseignant"
      >
        <div className={statistiquesStyles.grid}>
          {indicateurs.map((indicateur) => (
            <CarteGentelella key={indicateur.titre} {...indicateur} />
          ))}
        </div>
      </section>

      {sansCompte > 0 || sousCharges > 0 ? (
        <section
          className="flex flex-wrap items-center gap-2.5 rounded-xl border border-alerte-trait bg-alerte-doux px-4 py-3 text-xs text-alerte"
          aria-label="Situations du personnel à examiner"
        >
          <AlertTriangle className="size-4 shrink-0 text-alerte" aria-hidden />
          <strong>À examiner :</strong>
          {sansCompte > 0 ? <span>{nf(sansCompte)} enseignant(s) sans compte d'accès</span> : null}
          {sousCharges > 0 ? <span className="font-medium">· {nf(sousCharges)} service(s) incomplet(s)</span> : null}
          <span className="text-alerte" />
        </section>
      ) : null}

      <section
        aria-label="Annuaire du personnel"
        className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Annuaire des enseignants</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{nf(total)} résultat(s)</p>
          </div>
          <NativeSelect
            value={ordre}
            onChange={(e) => {
              setOrdre(e.target.value);
              setPage(1);
            }}
            aria-label="Trier les enseignants"
            className="h-9 w-full max-w-[210px] border-border bg-card text-xs shadow-none"
          >
            <option value="nom">Trier par nom</option>
            <option value="statut">Trier par statut</option>
            <option value="service">Trier par charge horaire</option>
          </NativeSelect>
        </div>
        {total === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
            <Users className="size-9 text-muted-foreground" aria-hidden />
            <p className="text-sm font-semibold">Aucun enseignant trouvé</p>
            <Button variant="outline" size="sm" onClick={() => routeur.push("/dashboard/personnel")}>
              Réinitialiser les filtres
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[1120px] text-sm">
              <TableHeader>
                <TableRow className="bg-muted/40 dark:bg-muted/30">
                  <TableHead className="px-4 py-3">Enseignant</TableHead>
                  <TableHead className="px-3 py-3">Matricule</TableHead>
                  <TableHead className="px-3 py-3">Statut</TableHead>
                  <TableHead className="px-3 py-3">Matière</TableHead>
                  <TableHead className="px-3 py-3">Service</TableHead>
                  <TableHead className="px-3 py-3">Accès au portail</TableHead>
                  <TableHead className="px-3 py-3">Activité</TableHead>
                  <TableHead className="px-4 py-3 text-right">Dossier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {affichees.map((e) => (
                  <TableRow
                    key={e.id}
                    className={
                      "border-border transition-colors hover:bg-succes-doux/90 dark:hover:bg-muted/30 " +
                      (!e.actif ? "opacity-65" : "")
                    }
                  >
                    <TableCell className="px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-succes-doux text-xs font-bold text-succes">
                          {e.prenom.charAt(0)}
                          {e.nom.charAt(0)}
                        </span>
                        <div className="min-w-0">
                          <Link
                            href={"/dashboard/personnel/" + e.id}
                            className="block font-semibold text-foreground hover:underline"
                          >
                            {e.prenom} {e.nom}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {e.telephone || e.email || "Coordonnées non renseignées"}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-3 font-mono text-xs text-muted-foreground">{e.matricule}</TableCell>
                    <TableCell className="px-3 py-3">
                      <div className="gentelella-v4">
                        <span
                          dangerouslySetInnerHTML={{
                            __html: statusBadge(
                              LIBELLE_STATUT[e.statut] || e.statut,
                              e.statut === "PERMANENT" ? "green" : e.statut === "SUSPENDU" ? "red" : "blue",
                            ),
                          }}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-3 text-muted-foreground">
                      {e.matierePrincipale || e.specialite || "—"}
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      <ServiceEnseignant enseignant={e} />
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      <CompteAcces
                        enseignantId={e.id}
                        nom={e.prenom + " " + e.nom}
                        aCompte={e.aCompte}
                        compteActif={e.compteActif}
                        roleCompte={e.roleCompte}
                      />
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      <Switch
                        checked={e.actif}
                        disabled={enCours}
                        aria-label={(e.actif ? "Désactiver " : "Activer ") + e.prenom + " " + e.nom}
                        onCheckedChange={(actif) =>
                          demarrer(async () => {
                            const result = await basculerEnseignant(e.id, actif);
                            if (!result.ok) toast.error(result.message || "Échec de mise à jour.");
                            else {
                              toast.success(actif ? "Enseignant réactivé." : "Enseignant désactivé.");
                              routeur.refresh();
                            }
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" asChild className="h-8 gap-1.5">
                        <Link href={"/dashboard/personnel/" + e.id}>
                          <Eye className="size-3.5" aria-hidden />
                          Voir
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {total > 0 ? (
          <footer className="flex flex-col gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                <strong className="text-foreground">
                  {nf(debut + 1)}–{nf(Math.min(debut + parPage, total))}
                </strong>{" "}
                sur <strong className="text-foreground">{nf(total)}</strong> enseignants
              </span>
              <div className="flex items-center gap-2">
                <span>Lignes :</span>
                <NativeSelect
                  value={String(parPage)}
                  onChange={(e) => {
                    setParPage(Number(e.target.value));
                    setPage(1);
                  }}
                  aria-label="Nombre d'enseignants par page"
                  className="h-9 w-20 rounded-lg bg-card text-xs"
                >
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
            <nav className="flex items-center justify-end gap-1" aria-label="Pagination de l'annuaire des enseignants">
              <Button
                variant="outline"
                size="icon"
                className="hidden size-9 sm:inline-flex"
                disabled={pageVisible <= 1}
                onClick={() => setPage(1)}
                aria-label="Première page"
              >
                <ChevronsLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-9"
                disabled={pageVisible <= 1}
                onClick={() => setPage(pageVisible - 1)}
                aria-label="Page précédente"
              >
                <ChevronLeft className="size-4" />
              </Button>
              {pages.map((n) => (
                <Button
                  key={n}
                  size="icon"
                  variant={n === pageVisible ? "default" : "outline"}
                  className={
                    "hidden size-9 sm:inline-flex " +
                    (n === pageVisible ? "bg-succes text-primary-foreground hover:bg-succes/90" : "")
                  }
                  onClick={() => setPage(n)}
                  aria-label={"Page " + n}
                  aria-current={n === pageVisible ? "page" : undefined}
                >
                  {n}
                </Button>
              ))}
              <span className="px-2 text-xs sm:hidden">
                Page {pageVisible} / {nbPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="size-9"
                disabled={pageVisible >= nbPages}
                onClick={() => setPage(pageVisible + 1)}
                aria-label="Page suivante"
              >
                <ChevronRight className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="hidden size-9 sm:inline-flex"
                disabled={pageVisible >= nbPages}
                onClick={() => setPage(nbPages)}
                aria-label="Dernière page"
              >
                <ChevronsRight className="size-4" />
              </Button>
            </nav>
          </footer>
        ) : null}
      </section>

      <Dialog open={ouvert} onOpenChange={fermerCreation}>
        <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] overflow-y-auto rounded-xl sm:max-w-2xl">
          <form action={soumettre}>
            <DialogHeader>
              <DialogTitle>Nouvel enseignant</DialogTitle>
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
                <p className="text-muted-foreground text-xs">Sert de référence pour repérer les surcharges.</p>
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
