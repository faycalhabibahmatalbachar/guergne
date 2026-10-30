import Link from "next/link";
import { notFound } from "next/navigation";

import { sql } from "drizzle-orm";
import {
  ArrowLeft,
  BookOpenCheck,
  CalendarCheck2,
  CalendarDays,
  ChevronRight,
  ContactRound,
  Files,
  FileText,
  HeartPulse,
  History,
  LayoutDashboard,
  MapPin,
  Phone,
  RefreshCw,
  School2,
  ShieldAlert,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/server/db";
import { chargerDossierComplet } from "@/server/domain/dossier";
import { chargerDossierScolarite } from "@/server/domain/dossier-eleve";
import { listerClassesCourantes } from "@/server/domain/eleves";
import { chargerStatistiques } from "@/server/domain/tableau-de-bord";
import { exigerPage, exigerSession, peut } from "@/server/guard";

import { BoutonNotifier } from "../../_components/bouton-notifier";
import { BadgeStatut } from "../_components/badge-statut";
import { preparerReinscription } from "../actions-reinscription";
import { ActionsDossier } from "./_components/actions-dossier";
import { DocumentsEleve } from "./_components/documents-eleve";
import { DocumentsGentelella } from "./_components/documents-gentelella";
import { OngletAssiduite, OngletDiscipline, OngletFinances, OngletNotes } from "./_components/dossier-scolarite";
import entete from "./_components/entete-dossier.module.css";
import { GestionTuteurs } from "./_components/gestion-tuteurs";
import { IndicateursDossierGentelella, type StatDossier } from "./_components/indicateurs-gentelella";
import { ModifierDossier } from "./_components/modifier-dossier";
import { PhotoEleve } from "./_components/photo-eleve";
import { ImprimerDossier, RaccourciOnglet } from "./_components/raccourci-onglet";
import { Reinscription } from "./_components/reinscription";
import { VueEnsembleEleve } from "./_components/vue-ensemble";
import "../../default/gentelella-tokens.css";
import "../../default/gentelella-layout.css";
import "../../default/gentelella-components.css";
import "../../default/gentelella-widgets.css";
import "./gentelella-pages.css";
import "./gentelella-forms.css";
import "./gentelella-datatable.css";
import "./gentelella-apps.css";

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
  v ? new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "—";

// Ne jamais consulter ni exposer un nom d'élève dans les métadonnées
// avant la vérification des droits individuels.
export async function generateMetadata(): Promise<Metadata> {
  return { title: "Dossier élève" };
}

export default async function PageDossier({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();

  // Authentifier d'abord, puis vérifier la portée réelle sur cette classe.
  await exigerSession();
  const contexte = await db.execute<{ classe_id: string | null }>(sql`
    SELECT i.classe_id FROM eleves e
    LEFT JOIN LATERAL (
      SELECT classe_id FROM inscriptions
      WHERE eleve_id = e.id
      ORDER BY active DESC, date_inscription DESC
      LIMIT 1
    ) i ON TRUE
    WHERE e.id = ${id}::uuid LIMIT 1
  `);
  if (!contexte.rows[0]) notFound();
  const principal = await exigerPage("eleve:lire", {
    eleveId: id,
    classeId: contexte.rows[0].classe_id ?? undefined,
  });

  const dossier = await chargerDossierComplet(id);
  if (!dossier) notFound();
  const { eleve, inscription, tuteurs, parcours, historiqueStatuts, changementsClasse } = dossier;
  const [classes, peutGererTuteurs, peutInscrire] = await Promise.all([
    listerClassesCourantes(),
    peut(principal, "tuteur:gerer", { eleveId: id, classeId: inscription?.classeId }),
    peut(principal, "eleve:creer"),
  ]);

  // E-36 : la proposition de réinscription est lue seulement si l'on a le
  // droit d'inscrire — inutile de calculer une orientation que l'utilisateur
  // ne pourrait pas enregistrer.
  const proposition = peutInscrire ? await preparerReinscription(id) : null;

  const [peutVoirBulletins, peutNotifier] = await Promise.all([
    peut(principal, "bulletin:lire", { eleveId: id, classeId: inscription?.classeId }),
    peut(principal, "message:envoyer", { eleveId: id, classeId: inscription?.classeId }),
  ]);
  // Périodes pour lesquelles un bulletin existe. On les charge ici plutôt que
  // dans le composant : c'est une page serveur, la requête ne coûte pas un
  // aller-retour supplémentaire au navigateur.
  const bulletinsDisponibles =
    inscription && peutVoirBulletins
      ? (
          await db.execute<{
            inscription_id: string;
            periode_id: string;
            periode_libelle: string;
            est_publie: boolean;
          }>(sql`
          SELECT b.inscription_id, b.periode_id, p.libelle AS periode_libelle, b.est_publie
            FROM bulletins b
            JOIN periodes p ON p.id = b.periode_id
           WHERE b.inscription_id = ${inscription.id}::uuid
           ORDER BY p.numero
        `)
        ).rows.map((r) => ({
          inscriptionId: r.inscription_id,
          periodeId: r.periode_id,
          periodeLibelle: r.periode_libelle,
          publie: r.est_publie,
        }))
      : [];

  const [
    peutVoirFinances,
    peutVoirNotes,
    peutVoirAssiduite,
    peutVoirDiscipline,
    peutVoirSante,
    peutModifier,
    peutGererActions,
    peutEmettreDocument,
  ] = await Promise.all([
    peut(principal, "finance:lire", { eleveId: id, classeId: inscription?.classeId }),
    peut(principal, "note:lire", { eleveId: id, classeId: inscription?.classeId }),
    peut(principal, "assiduite:lire", { eleveId: id, classeId: inscription?.classeId }),
    peut(principal, "discipline:lire", { eleveId: id, classeId: inscription?.classeId }),
    Promise.resolve(
      Boolean(principal && ["SUPER_ADMIN", "DIRECTION", "CENSEUR", "SURVEILLANT"].includes(principal.role)),
    ),
    peut(principal, "eleve:modifier", { eleveId: id, classeId: inscription?.classeId }),
    peut(principal, "eleve:affecter", { eleveId: id, classeId: inscription?.classeId }),
    peut(principal, "document:emettre", { eleveId: id, classeId: inscription?.classeId }),
  ]);
  // Les quatre volets du dossier scolaire.
  //
  // La période courante conditionne le relevé par matière : sans elle, on
  // cumulerait les trois trimestres et la moyenne affichée ne correspondrait à
  // aucun bulletin.
  const { periode } = await chargerStatistiques();
  const scolarite =
    inscription && (peutVoirFinances || peutVoirNotes || peutVoirAssiduite || peutVoirDiscipline)
      ? await chargerDossierScolarite(inscription.id, periode?.id ?? null, {
          notes: peutVoirNotes,
          assiduite: peutVoirAssiduite,
          discipline: peutVoirDiscipline,
          finances: peutVoirFinances,
        })
      : null;

  const peutModifierSensible = peutModifier && peutVoirSante;
  const peutAdministrer =
    peutGererActions && Boolean(principal && ["SUPER_ADMIN", "DIRECTION", "CENSEUR"].includes(principal.role));
  const resteFinancier =
    peutVoirFinances && scolarite?.echeances.length ? scolarite.echeances.reduce((s, e) => s + e.reste, 0) : null;
  const derniereActivite =
    [
      ...historiqueStatuts.map((h) => h.creeLe || h.dateEffet),
      ...changementsClasse.map((c) => c.dateEffet),
      ...(peutVoirAssiduite ? (scolarite?.assiduite ?? []).map((a) => a.date) : []),
      ...(peutVoirFinances ? (scolarite?.paiements ?? []).map((p) => p.date) : []),
    ].sort((a, b) => b.localeCompare(a))[0] ?? null;
  // Navigation par voisins dans la classe courante, fondée sur les élèves actifs.
  const voisins =
    inscription && peutAdministrer
      ? (
          await db.execute<{ precedent: string | null; suivant: string | null }>(sql`
    WITH ordre AS (
      SELECT e.id,
             lag(e.id) OVER (ORDER BY e.nom, e.prenom, e.id) AS precedent,
             lead(e.id) OVER (ORDER BY e.nom, e.prenom, e.id) AS suivant
        FROM eleves e JOIN inscriptions i ON i.eleve_id = e.id
       WHERE i.classe_id = ${inscription.classeId}::uuid AND i.active
    ) SELECT precedent, suivant FROM ordre WHERE id = ${id}::uuid
  `)
        ).rows[0]
      : null;
  // Âge civil exact dans le fuseau du Tchad, sans approximation à 365,25 jours.
  const maintenantTchad = Object.fromEntries(
    new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Ndjamena", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date())
      .map((p) => [p.type, Number(p.value)]),
  );
  const [anneeN, moisN, jourN] = String(eleve.dateNaissance).slice(0, 10).split("-").map(Number);
  const age =
    Number(maintenantTchad.year) -
    anneeN -
    (Number(maintenantTchad.month) < moisN ||
    (Number(maintenantTchad.month) === moisN && Number(maintenantTchad.day) < jourN)
      ? 1
      : 0);

  const Info = ({ libelle, valeur }: { libelle: string; valeur: React.ReactNode }) => (
    <div>
      <dt className="text-muted-foreground text-xs">{libelle}</dt>
      <dd className="mt-0.5 text-sm">{valeur || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );

  const indicateursDossier: StatDossier[] = [
    {
      onglet: "scolarite",
      libelle: "Statut scolaire",
      valeur: eleve.statut.replaceAll("_", " "),
      detail: inscription ? inscription.classeLibelle + " · " + inscription.anneeLibelle : "Sans inscription active",
      couleur: "teal",
    },
    {
      onglet: "documents",
      libelle: "Dossier administratif",
      valeur: inscription ? (STATUTS_DOSSIER[inscription.statutDossier] ?? inscription.statutDossier) : "Non renseigné",
      detail: "Consulter les documents",
      couleur: "blue",
    },
    ...(peutVoirFinances
      ? [
          {
            onglet: "finances" as const,
            libelle: "Situation financière",
            valeur: resteFinancier === null ? "Non renseignée" : resteFinancier > 0 ? "En attente" : "À jour",
            detail:
              resteFinancier === null ? "Aucune échéance" : resteFinancier.toLocaleString("fr-FR") + " FCFA restant",
            couleur: "yellow" as const,
          },
        ]
      : []),
    {
      onglet: "historique",
      libelle: "Dernière activité",
      valeur: derniereActivite ? dateFr(derniereActivite) : "Aucune",
      detail: "Voir l'historique",
      couleur: "purple",
    },
  ];

  return (
    <div className="gentelella-v4 space-y-4">
      <section
        aria-label="En-tête du dossier élève"
        className={entete.header + " min-w-0 rounded-xl border bg-card px-4 py-4 shadow-carte sm:px-5 sm:py-5"}
      >
        <div className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center md:justify-end print:hidden">
          <div
            role="group"
            aria-label="Commandes du dossier"
            className="flex flex-wrap items-center gap-2 sm:justify-end"
          >
            {voisins?.precedent ? (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href={"/dashboard/eleves/" + voisins.precedent}>
                  <ArrowLeft className="size-4" aria-hidden />
                  Précédent
                </Link>
              </Button>
            ) : (
              <Button disabled variant="outline" size="sm" className="gap-1.5">
                <ArrowLeft className="size-4" aria-hidden />
                Précédent
              </Button>
            )}
            {voisins?.suivant ? (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href={"/dashboard/eleves/" + voisins.suivant}>
                  Suivant
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              </Button>
            ) : (
              <Button disabled variant="outline" size="sm" className="gap-1.5">
                Suivant
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            )}
            <ImprimerDossier />
            {peutNotifier ? (
              <div className="[&>button]:h-10 [&>button]:rounded-lg [&>button]:border-border [&>button]:bg-card [&>button]:px-3.5 [&>button]:text-foreground [&>button]:shadow-none dark:[&>button]:border-border dark:[&>button]:bg-card dark:[&>button]:text-foreground">
                <BoutonNotifier
                  cible={{ type: "eleve", id: eleve.id, nom: eleve.prenom + " " + eleve.nom }}
                  libelle="Prévenir"
                  variante="outline"
                  contexteEleves
                />
              </div>
            ) : null}
            {peutModifierSensible ? (
              <ModifierDossier
                eleveId={eleve.id}
                activerDepuisUrl
                dossier={{
                  nom: eleve.nom,
                  prenom: eleve.prenom,
                  sexe: eleve.sexe,
                  // L'input `type="date"` n'accepte que AAAA-MM-JJ : une date
                  // horodatée le laisserait vide, sans le dire.
                  dateNaissance: String(eleve.dateNaissance).slice(0, 10),
                  lieuNaissance: eleve.lieuNaissance,
                  nationalite: eleve.nationalite,
                  acteNaissanceNumero: eleve.acteNaissanceNumero,
                  adresse: eleve.adresse,
                  quartier: eleve.quartier,
                  telephone: eleve.telephone,
                  email: eleve.email,
                  groupeSanguin: eleve.groupeSanguin,
                  allergies: eleve.allergies,
                  observationsMedicales: eleve.observationsMedicales,
                  situationParticuliere: eleve.situationParticuliere,
                  urgenceNom: eleve.urgenceNom,
                  urgenceTelephone: eleve.urgenceTelephone,
                  urgenceLien: eleve.urgenceLien,
                  ecoleOrigine: eleve.ecoleOrigine,
                }}
              />
            ) : null}
          </div>
        </div>

        <div className={entete.body}>
          <div className={entete.identity}>
            <PhotoEleve
              eleveId={eleve.id}
              photoId={eleve.photoId}
              nomComplet={eleve.prenom + " " + eleve.nom}
              sexe={eleve.sexe}
              peutModifier={peutModifierSensible}
            />
            <div className={entete.identityText}>
              <h1 className="break-words leading-[1.15] tracking-tight text-foreground">
                {eleve.prenom} {eleve.nom}
              </h1>
              <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-muted-foreground sm:text-sm">
                <span className="font-semibold tabular-nums">{eleve.matricule}</span>
                <span aria-hidden className="text-muted-foreground">
                  |
                </span>
                <span>{inscription?.classeLibelle ?? "Sans classe"}</span>
                <span aria-hidden className="text-muted-foreground">
                  |
                </span>
                <span className="tabular-nums">{age} ans</span>
              </p>
              <div className="mt-3.5 flex flex-wrap items-center gap-2">
                <BadgeStatut statut={eleve.statut} />
                {inscription?.type ? (
                  <Badge
                    variant="outline"
                    className="gap-1.5 rounded-full border-border bg-muted/40 px-2.5 py-1 text-xs font-semibold capitalize text-foreground"
                  >
                    <RefreshCw className="size-3.5" aria-hidden />
                    {inscription.type.replaceAll("_", " ").toLowerCase()}
                  </Badge>
                ) : null}
                {inscription?.estRedoublant ? (
                  <Badge className="rounded-full border-0 bg-alerte-doux px-2.5 py-1 text-xs text-alerte hover:bg-alerte-doux/90">
                    Redoublant(e)
                  </Badge>
                ) : null}
              </div>
              <div className={entete.meta + " mt-4"}>
                <div className="flex min-w-0 items-start gap-2">
                  <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Né(e) le</p>
                    <p className="mt-0.5 break-words text-xs font-semibold text-foreground">
                      {dateFr(eleve.dateNaissance)}
                    </p>
                  </div>
                </div>
                <div className="flex min-w-0 items-start gap-2">
                  <UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Sexe</p>
                    <p className="mt-0.5 text-xs font-semibold text-foreground">
                      {eleve.sexe === "F" ? "Féminin" : eleve.sexe === "M" ? "Masculin" : "Non renseigné"}
                    </p>
                  </div>
                </div>
                <div className="flex min-w-0 items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Ville de naissance</p>
                    <p className="mt-0.5 break-words text-xs font-semibold text-foreground">
                      {eleve.lieuNaissance ?? "Non renseignée"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <IndicateursDossierGentelella indicateurs={indicateursDossier} />
        </div>
      </section>
      <Tabs defaultValue="ensemble" className="gap-3">
        <nav
          aria-label="Rubriques du dossier"
          className="gentelella-v4 min-w-0 overflow-x-auto overflow-y-hidden rounded-xl border border-border bg-card px-2 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden print:hidden"
        >
          <TabsList
            variant="line"
            className="tabs-underline flex h-[54px] w-max min-w-full items-center justify-start gap-1 p-1"
          >
            <TabsTrigger
              id="dossier-onglet-ensemble"
              value="ensemble"
              className="tab h-10 flex-none gap-2 rounded-lg px-3 text-xs font-semibold after:hidden data-active:border-b-2 data-active:border-succes-trait data-active:text-succes dark:data-active:text-succes sm:text-sm"
            >
              <LayoutDashboard className="size-4" aria-hidden />
              Vue d’ensemble
            </TabsTrigger>
            <TabsTrigger
              id="dossier-onglet-identite"
              value="identite"
              className="tab h-10 flex-none gap-2 rounded-lg px-3 text-xs after:hidden data-active:border-b-2 data-active:border-succes-trait data-active:text-succes dark:data-active:text-succes sm:text-sm"
            >
              <ContactRound className="size-4" aria-hidden />
              Identité
            </TabsTrigger>
            <TabsTrigger
              id="dossier-onglet-scolarite"
              value="scolarite"
              className="tab h-10 flex-none gap-2 rounded-lg px-3 text-xs after:hidden data-active:border-b-2 data-active:border-succes-trait data-active:text-succes dark:data-active:text-succes sm:text-sm"
            >
              <School2 className="size-4" aria-hidden />
              Scolarité
            </TabsTrigger>
            <TabsTrigger
              id="dossier-onglet-tuteurs"
              value="tuteurs"
              className="tab h-10 flex-none gap-2 rounded-lg px-3 text-xs after:hidden data-active:border-b-2 data-active:border-succes-trait data-active:text-succes dark:data-active:text-succes sm:text-sm"
            >
              <Users className="size-4" aria-hidden />
              Parents & tuteurs
            </TabsTrigger>
            <TabsTrigger
              id="dossier-onglet-documents"
              value="documents"
              className="tab h-10 flex-none gap-2 rounded-lg px-3 text-xs after:hidden data-active:border-b-2 data-active:border-succes-trait data-active:text-succes dark:data-active:text-succes sm:text-sm"
            >
              <Files className="size-4" aria-hidden />
              Documents
            </TabsTrigger>
            {peutVoirNotes ? (
              <TabsTrigger
                id="dossier-onglet-notes"
                value="notes"
                className="tab h-10 flex-none gap-2 rounded-lg px-3 text-xs after:hidden data-active:border-b-2 data-active:border-succes-trait data-active:text-succes dark:data-active:text-succes sm:text-sm"
              >
                <BookOpenCheck className="size-4" aria-hidden />
                Notes
              </TabsTrigger>
            ) : null}
            {peutVoirAssiduite ? (
              <TabsTrigger
                id="dossier-onglet-assiduite"
                value="assiduite"
                className="tab h-10 flex-none gap-2 rounded-lg px-3 text-xs after:hidden data-active:border-b-2 data-active:border-succes-trait data-active:text-succes dark:data-active:text-succes sm:text-sm"
              >
                <CalendarCheck2 className="size-4" aria-hidden />
                Assiduité
              </TabsTrigger>
            ) : null}
            {peutVoirFinances ? (
              <TabsTrigger
                id="dossier-onglet-finances"
                value="finances"
                className="tab h-10 flex-none gap-2 rounded-lg px-3 text-xs after:hidden data-active:border-b-2 data-active:border-succes-trait data-active:text-succes dark:data-active:text-succes sm:text-sm"
              >
                <Wallet className="size-4" aria-hidden />
                Finances
              </TabsTrigger>
            ) : null}
            <TabsTrigger
              id="dossier-onglet-historique"
              value="historique"
              className="tab h-10 flex-none gap-2 rounded-lg px-3 text-xs after:hidden data-active:border-b-2 data-active:border-succes-trait data-active:text-succes dark:data-active:text-succes sm:text-sm"
            >
              <History className="size-4" aria-hidden />
              Historique
            </TabsTrigger>
            {peutVoirDiscipline ? (
              <TabsTrigger
                id="dossier-onglet-discipline"
                value="discipline"
                className="tab h-10 flex-none gap-2 rounded-lg px-3 text-xs after:hidden data-active:border-b-2 data-active:border-succes-trait data-active:text-succes dark:data-active:text-succes sm:text-sm"
              >
                <ShieldAlert className="size-4" aria-hidden />
                Discipline
              </TabsTrigger>
            ) : null}
          </TabsList>
        </nav>

        <TabsContent value="ensemble" className="mt-1">
          <VueEnsembleEleve
            dossier={dossier}
            modifierDossier={
              peutModifierSensible ? (
                <ModifierDossier
                  eleveId={eleve.id}
                  dossier={{
                    nom: eleve.nom,
                    prenom: eleve.prenom,
                    sexe: eleve.sexe,
                    // L'input `type="date"` n'accepte que AAAA-MM-JJ : une date
                    // horodatée le laisserait vide, sans le dire.
                    dateNaissance: String(eleve.dateNaissance).slice(0, 10),
                    lieuNaissance: eleve.lieuNaissance,
                    nationalite: eleve.nationalite,
                    acteNaissanceNumero: eleve.acteNaissanceNumero,
                    adresse: eleve.adresse,
                    quartier: eleve.quartier,
                    telephone: eleve.telephone,
                    email: eleve.email,
                    groupeSanguin: eleve.groupeSanguin,
                    allergies: eleve.allergies,
                    observationsMedicales: eleve.observationsMedicales,
                    situationParticuliere: eleve.situationParticuliere,
                    urgenceNom: eleve.urgenceNom,
                    urgenceTelephone: eleve.urgenceTelephone,
                    urgenceLien: eleve.urgenceLien,
                    ecoleOrigine: eleve.ecoleOrigine,
                  }}
                />
              ) : null
            }
            scolarite={scolarite}
            peutVoirFinances={peutVoirFinances}
            peutVoirNotes={peutVoirNotes}
            peutVoirAssiduite={peutVoirAssiduite}
            peutVoirTuteurs={true}
            notification={null}
            actions={
              peutAdministrer ? (
                <ActionsDossier
                  eleveId={eleve.id}
                  statut={eleve.statut}
                  inscriptionId={inscription?.id ?? null}
                  classeActuelleId={inscription?.classeId ?? null}
                  statutDossier={inscription?.statutDossier ?? null}
                  classes={classes.map((c) => ({ id: c.id, libelle: c.libelle }))}
                />
              ) : null
            }
            documents={
              peutEmettreDocument ? (
                <DocumentsEleve
                  eleveId={eleve.id}
                  estParti={["TRANSFERE", "ABANDON", "EXCLU", "ARCHIVE"].includes(eleve.statut)}
                  bulletins={bulletinsDisponibles}
                />
              ) : null
            }
            gestionTuteurs={
              peutGererTuteurs ? (
                <GestionTuteurs
                  eleveId={eleve.id}
                  compact
                  placement="ajout"
                  tuteurs={tuteurs.map((t) => ({ id: t.id, nom: t.nom, prenom: t.prenom }))}
                />
              ) : null
            }
            gestionTuteursHeader={
              peutGererTuteurs ? (
                <GestionTuteurs
                  eleveId={eleve.id}
                  compact
                  placement="gestion"
                  tuteurs={tuteurs.map((t) => ({ id: t.id, nom: t.nom, prenom: t.prenom }))}
                />
              ) : null
            }
            bulletins={bulletinsDisponibles}
          />
        </TabsContent>
        <TabsContent value="documents" className="mt-5 space-y-4">
          <Card className="card">
            <CardHeader className="card-header">
              <CardTitle className="card-title text-base">Documents du dossier</CardTitle>
            </CardHeader>
            <CardContent className="card-body space-y-3">
              {peutEmettreDocument ? (
                <DocumentsGentelella
                  eleveId={eleve.id}
                  estParti={["TRANSFERE", "ABANDON", "EXCLU", "ARCHIVE"].includes(eleve.statut)}
                />
              ) : null}
              {peutEmettreDocument ? (
                <DocumentsEleve
                  eleveId={eleve.id}
                  estParti={["TRANSFERE", "ABANDON", "EXCLU", "ARCHIVE"].includes(eleve.statut)}
                  bulletins={bulletinsDisponibles}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Édition non autorisée pour ce compte.</p>
              )}
              {bulletinsDisponibles.map((b) => (
                <a
                  key={b.periodeId}
                  href={"/api/bulletins/" + b.inscriptionId + "/" + b.periodeId}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm hover:bg-muted/40 dark:hover:bg-muted/90"
                >
                  <span>Bulletin — {b.periodeLibelle}</span>
                  <Badge variant={b.publie ? "default" : "outline"}>{b.publie ? "Publié" : "Brouillon"}</Badge>
                </a>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Identité --- */}
        <TabsContent value="identite" className="mt-6 space-y-6">
          <Card className="card">
            <CardHeader className="card-header">
              <CardTitle className="card-title text-base">État civil</CardTitle>
            </CardHeader>
            <CardContent className="card-body">
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

          {peutVoirSante ? (
            <Card className="card">
              <CardHeader className="card-header">
                <CardTitle className="card-title flex items-center gap-2 text-base">
                  <HeartPulse className="size-4" aria-hidden />
                  Santé et situation
                </CardTitle>
                <CardDescription className="card-subtitle">
                  Informations sensibles — réservées à la direction et à la vie scolaire.
                </CardDescription>
              </CardHeader>
              <CardContent className="card-body">
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
          ) : null}
        </TabsContent>

        {/* --- Tuteurs --- */}
        <TabsContent value="tuteurs" className="mt-6 space-y-4">
          {/*
            Rattacher se fait ICI et non à l'inscription : un parent se déclare
            après coup, un tuteur change en cours d'année, une mère est ajoutée
            trois mois après le père. Renvoyer sur le formulaire d'inscription
            pour cela obligerait à rouvrir un dossier déjà validé.
          */}
          {peutGererTuteurs ? (
            <GestionTuteurs
              eleveId={eleve.id}
              tuteurs={tuteurs.map((t) => ({ id: t.id, nom: t.nom, prenom: t.prenom }))}
            />
          ) : null}

          {tuteurs.length === 0 ? (
            <Card className="card">
              <CardContent className="card-body py-12 text-center text-muted-foreground text-sm">
                Aucun tuteur rattaché. Un élève doit avoir au moins un responsable joignable.
              </CardContent>
            </Card>
          ) : (
            tuteurs.map((t) => (
              <Card key={t.id} className="card">
                <CardHeader className="card-header pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="card-title text-base">
                        {t.prenom} {t.nom}
                      </CardTitle>
                      <CardDescription className="card-subtitle">{LIENS[t.lien] ?? t.lien}</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {t.estPrincipal ? <Badge>Principal</Badge> : null}
                      {t.estTuteurLegal ? <Badge variant="secondary">Tuteur légal</Badge> : null}
                      {t.estResponsableFinancier ? <Badge variant="secondary">Responsable financier</Badge> : null}
                      {t.estContactUrgence ? <Badge variant="secondary">Urgence</Badge> : null}
                      <Badge variant={t.appActivee ? "default" : "outline"}>
                        {t.appActivee ? "Application activée" : "Application non activée"}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="card-body space-y-4">
                  <dl className="grid gap-4 sm:grid-cols-3">
                    <Info libelle="Téléphone" valeur={t.telephone} />
                    <Info libelle="Téléphone secondaire" valeur={t.telephoneSecondaire} />
                    <Info libelle="E-mail" valeur={t.email} />
                    <Info libelle="Profession" valeur={t.profession} />
                    <Info libelle="Adresse" valeur={t.adresse} />
                    <Info libelle="Retrait de l'élève" valeur={t.autoriseRetrait ? "Autorisé" : "Non autorisé"} />
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
                              <Link href={`/dashboard/eleves/${f.id}`} className="text-primary text-sm hover:underline">
                                {f.prenom} {f.nom}
                                {f.classe ? <span className="text-muted-foreground"> — {f.classe}</span> : null}
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

        {peutVoirNotes ? (
          <TabsContent value="notes" className="mt-6">
            {scolarite ? (
              <OngletNotes dossier={scolarite} />
            ) : (
              <p className="text-muted-foreground py-10 text-center text-sm">
                Cet élève n&apos;a pas d&apos;inscription active cette année.
              </p>
            )}
          </TabsContent>
        ) : null}

        {peutVoirAssiduite ? (
          <TabsContent value="assiduite" className="mt-6">
            {scolarite ? <OngletAssiduite dossier={scolarite} /> : null}
          </TabsContent>
        ) : null}

        {peutVoirDiscipline ? (
          <TabsContent value="discipline" className="mt-6">
            {scolarite ? <OngletDiscipline dossier={scolarite} /> : null}
          </TabsContent>
        ) : null}

        {peutVoirFinances ? (
          <TabsContent value="finances" className="mt-6">
            {scolarite ? <OngletFinances dossier={scolarite} /> : null}
          </TabsContent>
        ) : null}

        {/* --- Scolarité --- */}
        <TabsContent value="scolarite" className="mt-6 space-y-6">
          {/*
            La réinscription est en tête de l'onglet Scolarité : c'est le geste
            de juin, et il porte sur l'année SUIVANTE. Le placer sous
            l'inscription en cours le ferait chercher.
          */}
          {proposition ? <Reinscription eleveId={eleve.id} proposition={proposition} /> : null}

          {inscription ? (
            <Card className="card">
              <CardHeader className="card-header">
                <CardTitle className="card-title flex items-center gap-2 text-base">
                  <FileText className="size-4" aria-hidden />
                  Inscription en cours
                </CardTitle>
              </CardHeader>
              <CardContent className="card-body">
                <dl className="grid gap-4 sm:grid-cols-3">
                  <Info libelle="Année scolaire" valeur={inscription.anneeLibelle} />
                  <Info libelle="Classe" valeur={inscription.classeLibelle} />
                  <Info libelle="Niveau" valeur={inscription.niveauLibelle} />
                  <Info libelle="Série" valeur={inscription.serieCode} />
                  <Info libelle="N° de dossier" valeur={inscription.numeroInscription} />
                  <Info
                    libelle="État du dossier"
                    valeur={
                      <Badge variant={inscription.statutDossier === "VALIDE" ? "default" : "outline"}>
                        {STATUTS_DOSSIER[inscription.statutDossier] ?? inscription.statutDossier}
                      </Badge>
                    }
                  />
                  <Info libelle="Nature" valeur={inscription.type} />
                  <Info libelle="Date d'inscription" valeur={dateFr(inscription.dateInscription)} />
                  <Info
                    libelle="Particularités"
                    valeur={
                      [inscription.estRedoublant ? "Redoublant" : null, inscription.estBoursier ? "Boursier" : null]
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

          <Card className="card">
            <CardHeader className="card-header">
              <CardTitle className="card-title flex items-center gap-2 text-base">
                <CalendarDays className="size-4" aria-hidden />
                Parcours dans l&apos;établissement
              </CardTitle>
            </CardHeader>
            <CardContent className="card-body">
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
          <Card className="card">
            <CardHeader className="card-header">
              <CardTitle className="card-title flex items-center gap-2 text-base">
                <ShieldAlert className="size-4" aria-hidden />
                Changements de statut
              </CardTitle>
              <CardDescription className="card-subtitle">
                Chaque décision est conservée avec son auteur et son motif — non modifiable.
              </CardDescription>
            </CardHeader>
            <CardContent className="card-body">
              {historiqueStatuts.length === 0 ? (
                <p className="text-muted-foreground text-sm">Aucun changement enregistré.</p>
              ) : (
                <ol className="activity-list">
                  {historiqueStatuts.map((h) => (
                    <li key={h.id} className="activity-item">
                      <span className="activity-avatar">
                        <History className="size-4" aria-hidden />
                      </span>
                      <div className="activity-body min-w-0">
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
                        {h.decidePar ? <p className="activity-time">Décidé par {h.decidePar}</p> : null}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card className="card">
            <CardHeader className="card-header">
              <CardTitle className="card-title text-base">Changements de classe</CardTitle>
            </CardHeader>
            <CardContent className="card-body">
              {changementsClasse.length === 0 ? (
                <p className="text-muted-foreground text-sm">Aucun changement de classe.</p>
              ) : (
                <ul className="activity-list">
                  {changementsClasse.map((c) => (
                    <li key={c.id} className="activity-item">
                      <span className="activity-avatar">
                        <School2 className="size-4" aria-hidden />
                      </span>
                      <div className="activity-body min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium">{c.origine}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-medium">{c.destination}</span>
                          <span className="text-muted-foreground text-xs">{dateFr(c.dateEffet)}</span>
                        </div>
                        <p className="activity-time">{c.motif}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <footer
        aria-label="Bas du dossier élève"
        className="mt-1 flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-5 print:hidden"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-succes-doux text-succes"
          >
            <FileText className="size-[19px]" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Fiche scolaire de l’élève</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span className="break-all tabular-nums">{eleve.matricule}</span>
              {inscription ? (
                <>
                  <span aria-hidden className="text-muted-foreground">
                    ·
                  </span>
                  <span>Année scolaire {inscription.anneeLibelle}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="w-full justify-center text-xs font-semibold hover:border-succes-trait hover:bg-succes-doux/90 dark:bg-background sm:w-auto"
        >
          <Link href="/dashboard/eleves">
            <ArrowLeft className="size-4" aria-hidden />
            Retour à la liste des élèves
          </Link>
        </Button>
      </footer>
    </div>
  );
}
