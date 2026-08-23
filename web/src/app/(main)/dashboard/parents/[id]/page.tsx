import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeft, MessageSquare, Smartphone, UserX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { chargerDossierTuteur } from "@/server/domain/parents";
import { exigerPage } from "@/server/guard";

import { CoordonneesTuteur } from "./_components/coordonnees-tuteur";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const dossier = await chargerDossierTuteur(id).catch(() => null);
  return {
    title: dossier ? `${dossier.tuteur.prenom} ${dossier.tuteur.nom}` : "Compte parent",
  };
}

const dateFr = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const dateHeureFr = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const LIENS: Record<string, string> = {
  PERE: "Père",
  MERE: "Mère",
  TUTEUR: "Tuteur",
  ONCLE: "Oncle",
  TANTE: "Tante",
  GRAND_PARENT: "Grand-parent",
  FRERE_SOEUR: "Frère / sœur",
  AUTRE: "Autre",
};

function Info({ libelle, valeur }: { libelle: string; valeur: string | null }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{libelle}</p>
      <p className="mt-0.5 text-sm">{valeur || "—"}</p>
    </div>
  );
}

/**
 * Dossier d'un compte parent.
 *
 * Le secrétariat vient ici pour trois raisons, et une seule était couverte
 * jusqu'à présent — l'invitation. Les deux autres manquaient :
 *
 *   - **Corriger un numéro.** Première cause d'échec des notifications ; la
 *     liste ne permettait que d'inviter ou de révoquer.
 *   - **Vérifier ce qui a réellement été envoyé.** Un parent qui affirme
 *     n'avoir rien reçu a souvent raison, et le journal tranche.
 */
export default async function PageDossierParent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerPage("tuteur:gerer");

  const { id } = await params;
  const dossier = await chargerDossierTuteur(id);
  if (!dossier) notFound();

  const { tuteur, enfants, notifications, canalJoignable, nbAppareils } = dossier;
  const nomComplet = `${tuteur.prenom} ${tuteur.nom}`;

  const etat = !tuteur.utilisateurId
    ? { libelle: "Sans compte", variante: "outline" as const }
    : tuteur.compteActif === false
      ? { libelle: "Révoqué", variante: "destructive" as const }
      : tuteur.derniereConnexion
        ? { libelle: "Actif", variante: "default" as const }
        : { libelle: "Invité", variante: "secondary" as const };

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/dashboard/parents">
          <ArrowLeft aria-hidden />
          Retour aux comptes parents
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-semibold text-2xl tracking-tight">{nomComplet}</h1>
            <Badge variant={etat.variante}>{etat.libelle}</Badge>
          </div>
          <p className="mt-1 text-muted-foreground text-sm">
            {tuteur.telephone}
            {tuteur.profession ? ` · ${tuteur.profession}` : ""} · fiche créée le{" "}
            {dateFr(tuteur.creeLe)}
          </p>
        </div>

        <CoordonneesTuteur
          tuteurId={tuteur.id}
          nomComplet={nomComplet}
          telephone={tuteur.telephone}
          email={tuteur.email}
          accepteSms={tuteur.accepteSms}
        />
      </div>

      {/* --- Joignabilité : le renseignement le plus utile de la page ------ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Comment ce parent est joint</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            {canalJoignable === "PUSH" ? (
              <Badge className="gap-1.5">
                <Smartphone aria-hidden className="size-3.5" />
                Notifications de l&apos;application — gratuit
              </Badge>
            ) : canalJoignable === "SMS" ? (
              <Badge variant="secondary" className="gap-1.5">
                <MessageSquare aria-hidden className="size-3.5" />
                SMS — facturé
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1.5">
                <UserX aria-hidden className="size-3.5" />
                Aucun canal — les messages attendent dans l&apos;application
              </Badge>
            )}
            <span className="text-muted-foreground text-sm">
              {nbAppareils} appareil{nbAppareils > 1 ? "s" : ""} enregistré
              {nbAppareils > 1 ? "s" : ""} · SMS {tuteur.accepteSms ? "accepté" : "refusé"}
            </span>
          </div>

          <p className="text-muted-foreground text-sm">
            {canalJoignable === "PUSH"
              ? "Ce parent reçoit les notifications par l'application : c'est gratuit et immédiat."
              : canalJoignable === "SMS"
                ? "Aucun appareil actif n'est enregistré. Chaque notification part donc en SMS, et coûte."
                : "Sans application ni consentement SMS, rien ne part. Les notifications sont conservées et lui seront présentées dès qu'il installera l'application."}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* --- État civil ------------------------------------------------- */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Coordonnées</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Info libelle="Téléphone" valeur={tuteur.telephone} />
            <Info libelle="Second numéro" valeur={tuteur.telephoneSecondaire} />
            <Info libelle="Adresse électronique" valeur={tuteur.email} />
            <Info libelle="Pièce d'identité" valeur={tuteur.pieceIdentite} />
            <Info libelle="Profession" valeur={tuteur.profession} />
            <Info libelle="Employeur" valeur={tuteur.employeur} />
            <Info libelle="Adresse" valeur={tuteur.adresse} />
            <Info libelle="Quartier" valeur={tuteur.quartier} />
            <Info libelle="Application activée le" valeur={dateFr(tuteur.appActiveeLe)} />
            <Info libelle="Dernière connexion" valeur={dateFr(tuteur.derniereConnexion)} />
          </CardContent>
        </Card>

        {/* --- Enfants ---------------------------------------------------- */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Enfants rattachés ({enfants.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {enfants.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Aucun enfant rattaché. Ce tuteur ne recevra donc aucune notification : elles
                sont toutes liées à un élève.
              </p>
            ) : (
              <div className="space-y-3">
                {enfants.map((e) => (
                  <div key={e.eleveId} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link
                          href={`/dashboard/eleves/${e.eleveId}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {e.prenom} {e.nom}
                        </Link>
                        <p className="text-muted-foreground text-xs">
                          {e.matricule}
                          {e.classe ? ` · ${e.classe}` : " · non inscrit cette année"}
                        </p>
                      </div>
                      <Badge variant="outline">{LIENS[e.lien] ?? e.lien}</Badge>
                    </div>

                    {/*
                      Les rôles ne sont pas décoratifs : celui qui paie n'est pas
                      toujours celui qu'on appelle en urgence, ni celui qui peut
                      venir chercher l'enfant.
                    */}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {e.estPrincipal ? <Badge variant="secondary">Principal</Badge> : null}
                      {e.estTuteurLegal ? <Badge variant="secondary">Tuteur légal</Badge> : null}
                      {e.estResponsableFinancier ? (
                        <Badge variant="secondary">Responsable financier</Badge>
                      ) : null}
                      {e.estContactUrgence ? (
                        <Badge variant="secondary">Contact d&apos;urgence</Badge>
                      ) : null}
                      {e.autoriseRetrait ? (
                        <Badge variant="secondary">Autorisé au retrait</Badge>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* --- Journal des notifications ------------------------------------ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ce qui lui a été envoyé</CardTitle>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucune notification à ce jour.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Objet</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>État</TableHead>
                    <TableHead className="text-right">Coût</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifications.map((n) => (
                    <TableRow key={n.id}>
                      <TableCell className="whitespace-nowrap tabular-nums text-sm">
                        {dateHeureFr(n.envoyeLe ?? n.creeLe)}
                      </TableCell>
                      <TableCell>
                        {n.titre}
                        {n.erreur ? (
                          <p className="text-destructive text-xs">{n.erreur}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{n.canal}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            n.statut === "ENVOYE" || n.statut === "LU"
                              ? "default"
                              : n.statut === "ECHOUE"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {n.statut === "EN_ATTENTE" ? "En attente" : n.statut}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {n.coutFcfa ? `${n.coutFcfa} F` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
