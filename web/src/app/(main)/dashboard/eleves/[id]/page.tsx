import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ArrowLeft,
  CalendarDays,
  FileText,
  HeartPulse,
  Phone,
  ShieldAlert,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BadgeStatut } from "../_components/badge-statut";
import { chargerDossierComplet } from "@/server/domain/dossier";
import { listerClassesCourantes } from "@/server/domain/eleves";
import { exigerPage } from "@/server/guard";

import { ActionsDossier } from "./_components/actions-dossier";
import { DocumentsEleve } from "./_components/documents-eleve";
import { PhotoEleve } from "./_components/photo-eleve";

export const dynamic = "force-dynamic";

const LIENS: Record<string, string> = {
  PERE: "Père",
  MERE: "Mère",
  TUTEUR: "Tuteur légal",
  ONCLE: "Oncle",
  TANTE: "Tante",
  GRAND_PARENT: "Grand-parent",
  FRERE_SOEUR: "Frère / Sœur",
  AUTRE: "Autre",
};

const STATUTS_DOSSIER: Record<string, string> = {
  BROUILLON: "Brouillon",
  A_VALIDER: "À valider",
  VALIDE: "Validé",
  INCOMPLET: "Incomplet",
  REFUSE: "Refusé",
};

const dateFr = (v: string | null) =>
  v
    ? new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
    : "—";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const dossier = await chargerDossierComplet(id);
  return { title: dossier ? `${dossier.eleve.prenom} ${dossier.eleve.nom}` : "Élève" };
}

export default async function PageDossier({ params }: { params: Promise<{ id: string }> }) {
  await exigerPage("eleve:lire");

  const { id } = await params;
  const dossier = await chargerDossierComplet(id);
  if (!dossier) notFound();

  const { eleve, inscription, tuteurs, parcours, historiqueStatuts, changementsClasse } = dossier;
  const classes = await listerClassesCourantes();

  const age = Math.floor(
    (Date.now() - new Date(eleve.dateNaissance).getTime()) / (365.25 * 24 * 3600 * 1000),
  );

  const Info = ({ libelle, valeur }: { libelle: string; valeur: React.ReactNode }) => (
    <div>
      <dt className="text-muted-foreground text-xs">{libelle}</dt>
      <dd className="mt-0.5 text-sm">{valeur || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/dashboard/eleves">
          <ArrowLeft aria-hidden />
          Tous les élèves
        </Link>
      </Button>

      {/* En-tête */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <PhotoEleve
            eleveId={eleve.id}
            photoId={eleve.photoId}
            nomComplet={`${eleve.prenom} ${eleve.nom}`}
          />
          <div>
            <h1 className="font-semibold text-2xl tracking-tight">
              {eleve.prenom} {eleve.nom}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">
                {eleve.matricule}
              </Badge>
              <BadgeStatut statut={eleve.statut} />
              {inscription ? (
                <span className="text-muted-foreground text-sm">
                  {inscription.classeLibelle} — {inscription.anneeLibelle}
                </span>
              ) : (
                <span className="text-amber-600 text-sm dark:text-amber-400">
                  Aucune inscription active
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DocumentsEleve
            eleveId={eleve.id}
            estParti={["TRANSFERE", "ABANDON", "EXCLU", "ARCHIVE"].includes(eleve.statut)}
          />
          <ActionsDossier
          eleveId={eleve.id}
          statut={eleve.statut}
          inscriptionId={inscription?.id ?? null}
          classeActuelleId={inscription?.classeId ?? null}
          statutDossier={inscription?.statutDossier ?? null}
          classes={classes.map((c) => ({ id: c.id, libelle: c.libelle }))}
          />
        </div>
      </div>

      <Tabs defaultValue="identite">
        <TabsList>
          <TabsTrigger value="identite">Identité</TabsTrigger>
          <TabsTrigger value="tuteurs">Tuteurs ({tuteurs.length})</TabsTrigger>
          <TabsTrigger value="scolarite">Scolarité</TabsTrigger>
          <TabsTrigger value="historique">Historique</TabsTrigger>
        </TabsList>

        {/* --- Identité --- */}
        <TabsContent value="identite" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">État civil</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-3">
                <Info libelle="Nom" valeur={eleve.nom} />
                <Info libelle="Prénom" valeur={eleve.prenom} />
                <Info libelle="Sexe" valeur={eleve.sexe === "M" ? "Masculin" : "Féminin"} />
                <Info libelle="Date de naissance" valeur={`${dateFr(eleve.dateNaissance)} (${age} ans)`} />
                <Info libelle="Lieu de naissance" valeur={eleve.lieuNaissance} />
                <Info libelle="Nationalité" valeur={eleve.nationalite} />
                <Info libelle="N° acte de naissance" valeur={eleve.acteNaissanceNumero} />
                <Info libelle="Adresse" valeur={eleve.adresse} />
                <Info libelle="Quartier" valeur={eleve.quartier} />
                <Info libelle="Téléphone" valeur={eleve.telephone} />
                <Info libelle="E-mail" valeur={eleve.email} />
                <Info libelle="École d'origine" valeur={eleve.ecoleOrigine} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <HeartPulse className="size-4" aria-hidden />
                Santé et situation
              </CardTitle>
              <CardDescription>
                Informations sensibles — réservées à la direction et à la vie scolaire.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Info libelle="Groupe sanguin" valeur={eleve.groupeSanguin} />
                <Info libelle="Allergies" valeur={eleve.allergies} />
                <Info libelle="Observations médicales" valeur={eleve.observationsMedicales} />
                <Info libelle="Situation particulière" valeur={eleve.situationParticuliere} />
              </dl>

              <Separator className="my-4" />

              <p className="mb-3 flex items-center gap-2 font-medium text-sm">
                <Phone className="size-4" aria-hidden />
                Contact d&apos;urgence
              </p>
              <dl className="grid gap-4 sm:grid-cols-3">
                <Info libelle="Nom" valeur={eleve.urgenceNom} />
                <Info libelle="Téléphone" valeur={eleve.urgenceTelephone} />
                <Info libelle="Lien" valeur={eleve.urgenceLien} />
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Tuteurs --- */}
        <TabsContent value="tuteurs" className="mt-6 space-y-4">
          {tuteurs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                Aucun tuteur rattaché. Un élève doit avoir au moins un responsable joignable.
              </CardContent>
            </Card>
          ) : (
            tuteurs.map((t) => (
              <Card key={t.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">
                        {t.prenom} {t.nom}
                      </CardTitle>
                      <CardDescription>{LIENS[t.lien] ?? t.lien}</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {t.estPrincipal ? <Badge>Principal</Badge> : null}
                      {t.estTuteurLegal ? <Badge variant="secondary">Tuteur légal</Badge> : null}
                      {t.estResponsableFinancier ? (
                        <Badge variant="secondary">Responsable financier</Badge>
                      ) : null}
                      {t.estContactUrgence ? <Badge variant="secondary">Urgence</Badge> : null}
                      <Badge variant={t.appActivee ? "default" : "outline"}>
                        {t.appActivee ? "Application activée" : "Application non activée"}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <dl className="grid gap-4 sm:grid-cols-3">
                    <Info libelle="Téléphone" valeur={t.telephone} />
                    <Info libelle="Téléphone secondaire" valeur={t.telephoneSecondaire} />
                    <Info libelle="E-mail" valeur={t.email} />
                    <Info libelle="Profession" valeur={t.profession} />
                    <Info libelle="Adresse" valeur={t.adresse} />
                    <Info
                      libelle="Retrait de l'élève"
                      valeur={t.autoriseRetrait ? "Autorisé" : "Non autorisé"}
                    />
                  </dl>

                  {t.autresEnfants.length > 0 ? (
                    <>
                      <Separator />
                      <div>
                        <p className="mb-2 flex items-center gap-2 font-medium text-sm">
                          <Users className="size-4" aria-hidden />
                          Autres enfants scolarisés ici
                        </p>
                        <ul className="space-y-1">
                          {t.autresEnfants.map((f) => (
                            <li key={f.id}>
                              <Link
                                href={`/dashboard/eleves/${f.id}`}
                                className="text-primary text-sm hover:underline"
                              >
                                {f.prenom} {f.nom}
                                {f.classe ? (
                                  <span className="text-muted-foreground"> — {f.classe}</span>
                                ) : null}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* --- Scolarité --- */}
        <TabsContent value="scolarite" className="mt-6 space-y-6">
          {inscription ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="size-4" aria-hidden />
                  Inscription en cours
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4 sm:grid-cols-3">
                  <Info libelle="Année scolaire" valeur={inscription.anneeLibelle} />
                  <Info libelle="Classe" valeur={inscription.classeLibelle} />
                  <Info libelle="Niveau" valeur={inscription.niveauLibelle} />
                  <Info libelle="Série" valeur={inscription.serieCode} />
                  <Info libelle="N° de dossier" valeur={inscription.numeroInscription} />
                  <Info
                    libelle="État du dossier"
                    valeur={
                      <Badge
                        variant={inscription.statutDossier === "VALIDE" ? "default" : "outline"}
                      >
                        {STATUTS_DOSSIER[inscription.statutDossier] ?? inscription.statutDossier}
                      </Badge>
                    }
                  />
                  <Info libelle="Nature" valeur={inscription.type} />
                  <Info libelle="Date d'inscription" valeur={dateFr(inscription.dateInscription)} />
                  <Info
                    libelle="Particularités"
                    valeur={
                      [
                        inscription.estRedoublant ? "Redoublant" : null,
                        inscription.estBoursier ? "Boursier" : null,
                      ]
                        .filter(Boolean)
                        .join(", ") || "—"
                    }
                  />
                </dl>
                {inscription.observations ? (
                  <>
                    <Separator className="my-4" />
                    <Info libelle="Observations" valeur={inscription.observations} />
                  </>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="size-4" aria-hidden />
                Parcours dans l&apos;établissement
              </CardTitle>
            </CardHeader>
            <CardContent>
              {parcours.length === 0 ? (
                <p className="text-muted-foreground text-sm">Aucune scolarité enregistrée.</p>
              ) : (
                <ul className="space-y-3">
                  {parcours.map((p) => (
                    <li
                      key={`${p.anneeLibelle}-${p.classeLibelle}`}
                      className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-3 last:border-0 last:pb-0"
                    >
                      <div>
                        <span className="font-medium">{p.anneeLibelle}</span>
                        <span className="text-muted-foreground"> — {p.classeLibelle}</span>
                        {p.estRedoublant ? (
                          <Badge variant="outline" className="ml-2">
                            Redoublement
                          </Badge>
                        ) : null}
                      </div>
                      {p.dateSortie ? (
                        <span className="text-muted-foreground text-sm">
                          Sortie le {dateFr(p.dateSortie)}
                          {p.motifSortie ? ` — ${p.motifSortie}` : ""}
                        </span>
                      ) : p.active ? (
                        <Badge>En cours</Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Historique --- */}
        <TabsContent value="historique" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="size-4" aria-hidden />
                Changements de statut
              </CardTitle>
              <CardDescription>
                Chaque décision est conservée avec son auteur et son motif — non modifiable.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {historiqueStatuts.length === 0 ? (
                <p className="text-muted-foreground text-sm">Aucun changement enregistré.</p>
              ) : (
                <ol className="space-y-4">
                  {historiqueStatuts.map((h) => (
                    <li key={h.id} className="border-l-2 pl-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {h.ancienStatut ? (
                          <>
                            <BadgeStatut statut={h.ancienStatut} />
                            <span className="text-muted-foreground">→</span>
                          </>
                        ) : null}
                        <BadgeStatut statut={h.nouveauStatut} />
                        <span className="text-muted-foreground text-xs">
                          {dateFr(h.dateEffet)}
                          {h.dateFinPrevue ? ` → ${dateFr(h.dateFinPrevue)}` : ""}
                        </span>
                      </div>
                      <p className="mt-1 text-sm">{h.motif}</p>
                      {h.decidePar ? (
                        <p className="mt-0.5 text-muted-foreground text-xs">Décidé par {h.decidePar}</p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Changements de classe</CardTitle>
            </CardHeader>
            <CardContent>
              {changementsClasse.length === 0 ? (
                <p className="text-muted-foreground text-sm">Aucun changement de classe.</p>
              ) : (
                <ul className="space-y-3">
                  {changementsClasse.map((c) => (
                    <li key={c.id} className="border-b pb-3 last:border-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium">{c.origine}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-medium">{c.destination}</span>
                        <span className="text-muted-foreground text-xs">{dateFr(c.dateEffet)}</span>
                      </div>
                      <p className="mt-1 text-muted-foreground text-sm">{c.motif}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
