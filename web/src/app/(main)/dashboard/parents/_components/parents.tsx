"use client";

import Link from "next/link";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Download, KeyRound, Search, Send, ShieldOff, Smartphone, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LigneTuteur, StatistiquesParents } from "@/server/domain/parents";

import { inviterClasse, inviterTuteur, revoquerAcces } from "../actions";
import { CreerParent } from "./creer-parent";

interface Option {
  id: string;
  libelle: string;
}

const dateFr = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export function Parents({
  tuteurs,
  total,
  page,
  parPage,
  classes,
  stats,
  filtres,
}: {
  tuteurs: LigneTuteur[];
  total: number;
  page: number;
  parPage: number;
  classes: Option[];
  stats: StatistiquesParents;
  filtres: { recherche: string; etat: string; classeId: string };
}) {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();
  const [recherche, setRecherche] = useState(filtres.recherche);

  const naviguer = (params: Record<string, string>) => {
    const url = new URLSearchParams({
      recherche: filtres.recherche,
      etat: filtres.etat,
      classe: filtres.classeId,
      ...params,
    });
    for (const [cle, valeur] of [...url.entries()]) if (!valeur) url.delete(cle);
    routeur.push(`/dashboard/parents?${url}`);
  };

  const nbPages = Math.max(1, Math.ceil(total / parPage));

  const KPI = [
    { libelle: "Tuteurs enregistrés", valeur: stats.total, icone: Users },
    { libelle: "Sans compte", valeur: stats.sansCompte, icone: KeyRound, alerte: stats.sansCompte > 0 },
    { libelle: "Invités, jamais connectés", valeur: stats.invites, icone: Send },
    { libelle: "Application installée", valeur: stats.avecAppareil, icone: Smartphone, bon: true },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <CreerParent />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPI.map((k) => (
          <Card key={k.libelle}>
            <CardContent className="py-4">
              <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <k.icone className="size-3.5" aria-hidden />
                {k.libelle}
              </p>
              <p
                className={`mt-1 font-semibold text-2xl tabular-nums ${
                  k.alerte
                    ? "text-amber-600 dark:text-amber-400"
                    : k.bon
                      ? "text-emerald-600 dark:text-emerald-400"
                      : ""
                }`}
              >
                {k.valeur}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {stats.sansCompte > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ouvrir les accès en masse</CardTitle>
            <CardDescription>
              Seuls les tuteurs <span className="font-medium">principaux</span> sont invités : ouvrir
              un compte aux deux parents double le coût SMS pour un même foyer. Le second parent
              peut être invité individuellement.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-2">
              <NativeSelect
                id="classe-masse"
                defaultValue=""
                className="w-56"
                aria-label="Classe à inviter"
                onChange={(e) => {
                  const classeId = e.target.value;
                  if (!classeId) return;
                  const libelle = classes.find((c) => c.id === classeId)?.libelle ?? "";
                  if (
                    !window.confirm(
                      `Ouvrir l'accès aux tuteurs principaux de ${libelle} ?\n\nUn SMS contenant un code d'activation partira vers chacun d'eux.`,
                    )
                  ) {
                    e.target.value = "";
                    return;
                  }
                  demarrer(async () => {
                    const r = await inviterClasse(classeId);
                    toast[r.ok ? "success" : "error"](r.message ?? "Échec.");
                    routeur.refresh();
                  });
                  e.target.value = "";
                }}
              >
                <option value="">Inviter toute une classe…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.libelle}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Filtres */}
      <div className="flex flex-wrap gap-3">
        <form
          className="relative min-w-64 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            naviguer({ recherche, page: "" });
          }}
        >
          <Search
            className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Nom, prénom, téléphone…"
            className="pl-9"
            aria-label="Rechercher un tuteur"
          />
        </form>

        <NativeSelect
          value={filtres.etat}
          onChange={(e) => naviguer({ etat: e.target.value, page: "" })}
          className="w-52"
          aria-label="Filtrer par état du compte"
        >
          <option value="">Tous les états</option>
          <option value="sans_compte">Sans compte</option>
          <option value="invite">Invité, jamais connecté</option>
          <option value="actif">Compte actif</option>
        </NativeSelect>

        <NativeSelect
          value={filtres.classeId}
          onChange={(e) => naviguer({ classe: e.target.value, page: "" })}
          className="w-48"
          aria-label="Filtrer par classe"
        >
          <option value="">Toutes les classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.libelle}
            </option>
          ))}
        </NativeSelect>

        {/*
          L'export part de la liste complète, sans les filtres : le tableur sert
          justement à filtrer autrement, et un export partiel se confondrait
          avec le fichier de référence de l'établissement.
        */}
        <Button asChild variant="outline" size="sm" className="ml-auto">
          <a href="/api/export/parents">
            <Download aria-hidden />
            Exporter
          </a>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {tuteurs.length === 0 ? (
            <p className="py-14 text-center text-muted-foreground text-sm">
              Aucun tuteur ne correspond à cette recherche.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tuteur</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead>Enfants</TableHead>
                  <TableHead>Accès</TableHead>
                  <TableHead>Dernière connexion</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tuteurs.map((t) => {
                  const sansCompte = !t.utilisateurId;
                  const jamaisConnecte = !sansCompte && !t.derniereConnexion;
                  const desactive = t.compteActif === false;

                  return (
                    <TableRow key={t.id} className={desactive ? "opacity-55" : undefined}>
                      <TableCell>
                        {/*
                          Le nom mène au dossier : c'est le geste attendu quand
                          on cherche à comprendre pourquoi un parent ne reçoit
                          rien, et il n'existait pas.
                        */}
                        <Link
                          href={`/dashboard/parents/${t.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {t.prenom} {t.nom}
                        </Link>
                        {t.profession ? (
                          <span className="block text-muted-foreground text-xs">{t.profession}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {t.telephone}
                        {!t.accepteSms ? (
                          <span className="block text-amber-600 text-xs dark:text-amber-400">
                            SMS refusé
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <span className="text-sm">{t.nbEnfants}</span>
                        <span className="block truncate text-muted-foreground text-xs" title={t.enfants}>
                          {t.enfants}
                        </span>
                      </TableCell>
                      <TableCell>
                        {desactive ? (
                          <Badge variant="destructive">Révoqué</Badge>
                        ) : sansCompte ? (
                          <Badge variant="outline">Sans compte</Badge>
                        ) : jamaisConnecte ? (
                          <Badge variant="secondary">Invité</Badge>
                        ) : (
                          <Badge>Actif</Badge>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums text-sm">
                        {dateFr(t.derniereConnexion)}
                      </TableCell>
                      <TableCell className="space-x-1 text-right">
                        {sansCompte || jamaisConnecte || desactive ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={enCours}
                            onClick={() =>
                              demarrer(async () => {
                                const r = await inviterTuteur(t.id);
                                if (r.ok) {
                                  toast.success(r.message ?? "Invitation envoyée.", {
                                    duration: 12000,
                                    description: r.code
                                      ? `Code : ${r.code} — valable 7 jours, à communiquer au tuteur.`
                                      : undefined,
                                  });
                                } else {
                                  toast.error(r.message ?? "Échec.");
                                }
                                routeur.refresh();
                              })
                            }
                          >
                            <Send aria-hidden />
                            {sansCompte ? "Inviter" : "Renvoyer le code"}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={enCours}
                            onClick={() => {
                              const motif = window.prompt(
                                `Révoquer l'accès de ${t.prenom} ${t.nom} ?\n\nSes sessions seront fermées immédiatement.\n\nMotif :`,
                              );
                              if (!motif) return;
                              demarrer(async () => {
                                const r = await revoquerAcces(t.id, motif);
                                toast[r.ok ? "success" : "error"](r.message ?? "Échec.");
                                routeur.refresh();
                              });
                            }}
                          >
                            <ShieldOff aria-hidden />
                            Révoquer
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {nbPages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            {total} tuteur{total > 1 ? "s" : ""} — page {page} sur {nbPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => naviguer({ page: String(page - 1) })}
            >
              Précédent
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= nbPages}
              onClick={() => naviguer({ page: String(page + 1) })}
            >
              Suivant
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
