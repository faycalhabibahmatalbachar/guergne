import type { Metadata } from "next";
import Link from "next/link";

import { Download, GraduationCap, Plus, Search, Upload, Users } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EnTeteTriable } from "@/components/ui/entete-triable";
import { CaseSelection, EnTeteSelection, ZoneSelection } from "@/components/ui/selection-lot";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getInitials } from "@/lib/utils";
import { exigerPage, peut } from "@/server/guard";
import { sessionCourante } from "@/server/auth/session";
import type { StatutEleve } from "@/lib/eleves-constantes";
import { listerClassesCourantes, listerEleves } from "@/server/domain/eleves";

import { BadgeStatut } from "./_components/badge-statut";
import { FiltresEleves } from "./_components/filtres";
import { ActionsLotEleves } from "./_components/actions-lot";

export const metadata: Metadata = { title: "Élèves" };
export const dynamic = "force-dynamic";

const ageDepuis = (iso: string) => {
  const n = new Date(iso);
  const maintenant = new Date();
  let age = maintenant.getFullYear() - n.getFullYear();
  const m = maintenant.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && maintenant.getDate() < n.getDate())) age -= 1;
  return age;
};

export default async function PageEleves({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    classe?: string;
    statut?: string;
    page?: string;
    tri?: string;
    sens?: string;
  }>;
}) {
  await exigerPage("eleve:lire");
  const principal = await sessionCourante();

  const params = await searchParams;
  const [resultat, classesDisponibles, peutCreer, peutAffecter, peutEnvoyer] = await Promise.all([
    listerEleves({
      recherche: params.q,
      tri: params.tri,
      sens: params.sens,
      classeId: params.classe,
      statut: params.statut as StatutEleve | undefined,
      page: Number(params.page) || 1,
    }),
    listerClassesCourantes(),
    peut(principal, "eleve:creer"),
    peut(principal, "eleve:affecter"),
    peut(principal, "message:envoyer"),
  ]);

  const { lignes, total, page, nbPages } = resultat;
  const filtreActif = Boolean(params.q || params.classe || params.statut);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Élèves</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {total > 0
              ? `${total} élève${total > 1 ? "s" : ""} ${filtreActif ? "correspondant aux filtres" : "au fichier"}`
              : "Aucun élève au fichier"}
          </p>
        </div>

        {peutCreer ? (
          <div className="flex flex-wrap gap-2">
            {/*
              L'import est en retrait par rapport à l'inscription : c'est un
              geste de rentrée, fait quelques fois dans l'année, quand
              l'inscription au guichet est le quotidien.
            */}
            {/*
              L'export reprend les filtres affichés : exporter autre chose que
              ce qu'on voit obligerait à refiltrer dans Excel, et laisserait
              douter duquel des deux jeux est le bon.
            */}
            <Button asChild variant="outline">
              <a
                href={`/api/export/eleves?${new URLSearchParams(
                  Object.entries({
                    recherche: params.q ?? "",
                    classe: params.classe ?? "",
                    statut: params.statut ?? "",
                  }).filter(([, v]) => v) as [string, string][],
                ).toString()}`}
              >
                <Download aria-hidden />
                Exporter
              </a>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/eleves/importer">
                <Upload aria-hidden />
                Importer un fichier
              </Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/eleves/nouveau">
                <Plus aria-hidden />
                Inscrire un élève
              </Link>
            </Button>
          </div>
        ) : null}
      </div>

      <FiltresEleves
        classes={classesDisponibles.map((c) => ({ id: c.id, libelle: c.libelle }))}
        valeurs={{ q: params.q ?? "", classe: params.classe ?? "", statut: params.statut ?? "" }}
      />

      {lignes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            {filtreActif ? (
              <>
                <Search className="size-8 text-muted-foreground" aria-hidden />
                <div>
                  <p className="font-medium">Aucun résultat</p>
                  <p className="mt-1 text-muted-foreground text-sm">
                    Aucun élève ne correspond à cette recherche.
                  </p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/eleves">Effacer les filtres</Link>
                </Button>
              </>
            ) : (
              <>
                <GraduationCap className="size-8 text-muted-foreground" aria-hidden />
                <div>
                  <p className="font-medium">Le fichier élèves est vide</p>
                  <p className="mt-1 max-w-md text-muted-foreground text-sm">
                    Inscrivez le premier élève pour commencer. Les classes doivent avoir été
                    créées au préalable.
                  </p>
                </div>
                {peutCreer ? (
                  <Button asChild size="sm">
                    <Link href="/dashboard/eleves/nouveau">
                      <Plus aria-hidden />
                      Inscrire un élève
                    </Link>
                  </Button>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4" aria-hidden />
              Liste des élèves
            </CardTitle>
            <CardDescription>Cliquez sur une ligne pour ouvrir le dossier complet.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ZoneSelection ids={lignes.map((e) => e.id)}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    {peutAffecter || peutEnvoyer ? <EnTeteSelection /> : null}
                    <EnTeteTriable colonne="nom" className="px-4 py-2.5">
                      Élève
                    </EnTeteTriable>
                    <EnTeteTriable colonne="matricule" className="px-4 py-2.5">
                      Matricule
                    </EnTeteTriable>
                    <EnTeteTriable colonne="classe" className="px-4 py-2.5">
                      Classe
                    </EnTeteTriable>
                    <th className="px-4 py-2.5 text-right font-medium">Âge</th>
                    <EnTeteTriable colonne="statut" className="px-4 py-2.5">
                      Statut
                    </EnTeteTriable>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((e) => (
                    <tr key={e.id} className="border-b transition-colors last:border-0 hover:bg-muted/50">
                      {peutAffecter || peutEnvoyer ? <CaseSelection id={e.id} /> : null}
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/dashboard/eleves/${e.id}`}
                          className="flex items-center gap-2.5 font-medium hover:underline"
                        >
                          <Avatar className="size-8">
                            <AvatarImage src={e.photoUrl ?? undefined} alt="" />
                            <AvatarFallback className="text-xs">
                              {getInitials(`${e.prenom} ${e.nom}`)}
                            </AvatarFallback>
                          </Avatar>
                          <span>
                            {e.nom} {e.prenom}
                            {e.estRedoublant ? (
                              <span className="ml-1.5 text-amber-600 text-xs">(redoublant)</span>
                            ) : null}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground text-xs tabular-nums">
                        {e.matricule}
                      </td>
                      <td className="px-4 py-2.5">
                        {e.classeLibelle ?? (
                          <span className="text-muted-foreground">Non affecté</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {ageDepuis(e.dateNaissance)} ans
                      </td>
                      <td className="px-4 py-2.5">
                        <BadgeStatut statut={e.statut} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/*
              La barre est DANS la zone de sélection et sous le tableau : elle
              colle au bas de la fenêtre tant que des lignes sont cochées, donc
              reste atteignable sans remonter, sur une liste de cinquante noms.
            */}
            {peutAffecter || peutEnvoyer ? (
              <ActionsLotEleves
                classes={classesDisponibles.map((c) => ({ id: c.id, libelle: c.libelle }))}
                peutAffecter={peutAffecter}
                peutEnvoyer={peutEnvoyer}
              />
            ) : null}
            </ZoneSelection>
          </CardContent>
        </Card>
      )}

      {nbPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Page {page} sur {nbPages}
          </p>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" disabled={page <= 1}>
              <Link href={{ query: { ...params, page: page - 1 } }}>Précédent</Link>
            </Button>
            <Button asChild variant="outline" size="sm" disabled={page >= nbPages}>
              <Link href={{ query: { ...params, page: page + 1 } }}>Suivant</Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
