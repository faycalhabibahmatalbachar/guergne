import type { Metadata } from "next";

import { sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ArrowLeft, CalendarDays, ChevronRight, Clock3, CreditCard, FileText, GraduationCap,
  HeartPulse, MapPin, Phone, ShieldAlert, Users, UserRound, Wallet, History, ClipboardList,
  RefreshCw, LayoutDashboard, ContactRound, School2, Files, BookOpenCheck, CalendarCheck2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BadgeStatut } from "../_components/badge-statut";
import { chargerDossierComplet } from "@/server/domain/dossier";
import { listerClassesCourantes } from "@/server/domain/eleves";
import { db } from "@/server/db";
import { chargerDossierScolarite } from "@/server/domain/dossier-eleve";
import { chargerStatistiques } from "@/server/domain/tableau-de-bord";
import { sessionCourante } from "@/server/auth/session";
import { exigerPage, peut } from "@/server/guard";
import { preparerReinscription } from "../actions-reinscription";

import { ActionsDossier } from "./_components/actions-dossier";
import { ModifierDossier } from "./_components/modifier-dossier";

import { BoutonNotifier } from "../../_components/bouton-notifier";
import { DocumentsEleve } from "./_components/documents-eleve";
import { GestionTuteurs } from "./_components/gestion-tuteurs";
import { Reinscription } from "./_components/reinscription";
import {
  OngletAssiduite,
  OngletDiscipline,
  OngletFinances,
  OngletNotes,
} from "./_components/dossier-scolarite";
import { PhotoEleve } from "./_components/photo-eleve";
import { VueEnsembleEleve } from "./_components/vue-ensemble";
import { ImprimerDossier, RaccourciOnglet } from "./_components/raccourci-onglet";
import entete from "./_components/entete-dossier.module.css";

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
  const principal = await sessionCourante();
  const [classes, peutGererTuteurs, peutInscrire] = await Promise.all([
    listerClassesCourantes(),
    peut(principal, "tuteur:gerer"),
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
  const bulletinsDisponibles = inscription && peutVoirBulletins
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

  // Les quatre volets du dossier scolaire.
  //
  // La période courante conditionne le relevé par matière : sans elle, on
  // cumulerait les trois trimestres et la moyenne affichée ne correspondrait à
  // aucun bulletin.
  const { periode } = await chargerStatistiques();
  const scolarite = inscription
    ? await chargerDossierScolarite(inscription.id, periode?.id ?? null)
    : null;

  const [peutVoirFinances, peutVoirNotes, peutVoirAssiduite, peutVoirDiscipline, peutVoirSante, peutModifier, peutGererActions, peutEmettreDocument] = await Promise.all([
    peut(principal, "finance:lire", { eleveId: id, classeId: inscription?.classeId }),
    peut(principal, "note:lire", { eleveId: id, classeId: inscription?.classeId }),
    peut(principal, "assiduite:lire", { eleveId: id, classeId: inscription?.classeId }),
    peut(principal, "discipline:lire", { eleveId: id, classeId: inscription?.classeId }),
    Promise.resolve(Boolean(principal && ["SUPER_ADMIN", "DIRECTION", "CENSEUR", "SURVEILLANT"].includes(principal.role))),
    peut(principal, "eleve:modifier", { eleveId: id, classeId: inscription?.classeId }),
    peut(principal, "eleve:affecter", { eleveId: id, classeId: inscription?.classeId }),
    peut(principal, "document:emettre", { eleveId: id, classeId: inscription?.classeId }),
  ]);
  const peutModifierSensible = peutModifier && peutVoirSante;
  const peutAdministrer = peutGererActions && Boolean(principal && ["SUPER_ADMIN", "DIRECTION", "CENSEUR"].includes(principal.role));
  const resteFinancier = peutVoirFinances && scolarite?.echeances.length ? scolarite.echeances.reduce((s, e) => s + e.reste, 0) : null;
  const derniereActivite = [
    ...historiqueStatuts.map((h) => h.creeLe || h.dateEffet),
    ...changementsClasse.map((c) => c.dateEffet),
    ...(peutVoirAssiduite ? (scolarite?.assiduite ?? []).map((a) => a.date) : []),
    ...(peutVoirFinances ? (scolarite?.paiements ?? []).map((p) => p.date) : []),
  ].sort((a, b) => b.localeCompare(a))[0] ?? null;
  // Navigation par voisins dans la classe courante, fondée sur les élèves actifs.
  const voisins = inscription && peutAdministrer ? (await db.execute<{ precedent: string | null; suivant: string | null }>(sql`
    WITH ordre AS (
      SELECT e.id,
             lag(e.id) OVER (ORDER BY e.nom, e.prenom, e.id) AS precedent,
             lead(e.id) OVER (ORDER BY e.nom, e.prenom, e.id) AS suivant
        FROM eleves e JOIN inscriptions i ON i.eleve_id = e.id
       WHERE i.classe_id = ${inscription.classeId}::uuid AND i.active
    ) SELECT precedent, suivant FROM ordre WHERE id = ${id}::uuid
  `)).rows[0] : null;
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
    <div className="space-y-4">
      <nav aria-label="Fil d’Ariane du dossier élève" className="flex min-h-10 flex-wrap items-center gap-2 rounded-xl border border-slate-200/70 bg-slate-50/70 px-3 py-2 text-xs text-slate-600 dark:border-border dark:bg-card dark:text-muted-foreground print:hidden">
        <Link href="/dashboard/eleves" className="font-medium hover:text-emerald-700">Élèves</Link>
        <ChevronRight className="size-3.5 text-slate-400" aria-hidden />
        <Link href="/dashboard/eleves" className="hover:text-emerald-700">Liste des élèves</Link>
        <ChevronRight className="size-3.5 text-slate-400" aria-hidden />
        <span aria-current="page" className="font-semibold text-slate-900 dark:text-foreground">{eleve.prenom} {eleve.nom}</span>
      </nav>

      <section aria-label="En-tête du dossier élève" className={entete.header + " min-w-0 rounded-[24px] border border-slate-200/80 bg-white px-4 py-4 shadow-[0_5px_22px_rgba(15,23,42,0.045)] dark:border-border dark:bg-card sm:px-6 sm:py-5"}>
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 dark:border-border md:flex-row md:items-center md:justify-between print:hidden">
          <Button asChild variant="outline" size="sm" className="h-9 w-fit gap-1.5 rounded-lg bg-white px-3 shadow-none dark:bg-card">
            <Link href="/dashboard/eleves"><ArrowLeft className="size-4" aria-hidden />Retour à la liste</Link>
          </Button>
          <div role="group" aria-label="Commandes du dossier" className="flex flex-wrap items-center gap-2 sm:justify-end">
            {voisins?.precedent ? <Button asChild variant="outline" size="sm" className="h-9 gap-1 rounded-lg bg-white shadow-none dark:bg-card"><Link href={"/dashboard/eleves/" + voisins.precedent}><ArrowLeft className="size-4" aria-hidden />Précédent</Link></Button> : <Button disabled variant="outline" size="sm" className="h-9 gap-1 rounded-lg"><ArrowLeft className="size-4" aria-hidden />Précédent</Button>}
            {voisins?.suivant ? <Button asChild variant="outline" size="sm" className="h-9 gap-1 rounded-lg bg-white shadow-none dark:bg-card"><Link href={"/dashboard/eleves/" + voisins.suivant}>Suivant<ChevronRight className="size-4" aria-hidden /></Link></Button> : <Button disabled variant="outline" size="sm" className="h-9 gap-1 rounded-lg">Suivant<ChevronRight className="size-4" aria-hidden /></Button>}
            <ImprimerDossier />
            {peutModifierSensible ? <ModifierDossier
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
          /> : null}
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
              <h1 className="break-words text-[23px] font-extrabold leading-[1.15] tracking-tight text-[#0b2046] dark:text-foreground sm:text-[30px]">{eleve.prenom} {eleve.nom}</h1>
              <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-medium text-slate-600 dark:text-muted-foreground sm:text-sm">
                <span className="font-semibold tabular-nums">{eleve.matricule}</span>
                <span aria-hidden className="text-slate-300">|</span>
                <span>{inscription?.classeLibelle ?? "Sans classe"}</span>
                <span aria-hidden className="text-slate-300">|</span>
                <span className="tabular-nums">{age} ans</span>
              </p>
              <div className="mt-3.5 flex flex-wrap items-center gap-2">
                <BadgeStatut statut={eleve.statut} />
                {inscription?.type ? (
                  <Badge variant="outline" className="gap-1.5 rounded-full border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700 dark:border-border dark:bg-muted dark:text-foreground">
                    <RefreshCw className="size-3.5" aria-hidden />{inscription.type.replaceAll("_", " ").toLowerCase()}
                  </Badge>
                ) : null}
                {inscription?.estRedoublant ? <Badge className="rounded-full border-0 bg-amber-50 px-2.5 py-1 text-xs text-amber-800 hover:bg-amber-50">Redoublant(e)</Badge> : null}
              </div>
              <div className={entete.meta + " mt-4"}>
                <div className="flex min-w-0 items-start gap-2">
                  <CalendarDays className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-500 dark:text-muted-foreground">Né(e) le</p>
                    <p className="mt-0.5 break-words text-[12px] font-semibold text-[#213153] dark:text-foreground">{dateFr(eleve.dateNaissance)}</p>
                  </div>
                </div>
                <div className="flex min-w-0 items-start gap-2">
                  <UserRound className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-500 dark:text-muted-foreground">Sexe</p>
                    <p className="mt-0.5 text-[12px] font-semibold text-[#213153] dark:text-foreground">{eleve.sexe === "F" ? "Féminin" : eleve.sexe === "M" ? "Masculin" : "Non renseigné"}</p>
                  </div>
                </div>
                <div className="flex min-w-0 items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-500 dark:text-muted-foreground">Ville de naissance</p>
                    <p className="mt-0.5 break-words text-[12px] font-semibold text-[#213153] dark:text-foreground">{eleve.lieuNaissance ?? "Non renseignée"}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={entete.cards} aria-label="Indicateurs du dossier">
            <RaccourciOnglet onglet="scolarite" className={entete.card + " h-auto justify-start border-emerald-100 bg-emerald-50/60 shadow-none hover:bg-emerald-50/90 dark:border-emerald-900 dark:bg-emerald-950/20"}>
              <span className={entete.iconTile + " bg-emerald-600"}><GraduationCap className="size-[25px]" aria-hidden /></span>
              <span className={entete.cardText}>
                <span className="text-xs font-medium text-slate-600 dark:text-muted-foreground">Statut scolaire</span>
                <span className="break-words text-lg font-bold text-emerald-700 dark:text-emerald-300">{eleve.statut.replaceAll("_", " ")}</span>
                <span className="text-[11px] font-normal text-slate-500 dark:text-muted-foreground">{inscription ? "Inscrit le " + dateFr(inscription.dateInscription) : "Sans inscription active"}</span>
              </span>
              <span className={entete.cardArrow + " bg-emerald-100/80 text-emerald-700 dark:bg-emerald-950"}><ChevronRight className="size-4" aria-hidden /></span>
            </RaccourciOnglet>

            <RaccourciOnglet onglet="documents" className={entete.card + " h-auto justify-start border-blue-100 bg-blue-50/60 shadow-none hover:bg-blue-50/90 dark:border-blue-900 dark:bg-blue-950/20"}>
              <span className={entete.iconTile + " bg-blue-600"}><ClipboardList className="size-[24px]" aria-hidden /></span>
              <span className={entete.cardText}>
                <span className="text-xs font-medium text-slate-600 dark:text-muted-foreground">Dossier administratif</span>
                <span className="break-words text-lg font-bold text-blue-700 dark:text-blue-300">{inscription ? STATUTS_DOSSIER[inscription.statutDossier] ?? inscription.statutDossier : "Non renseigné"}</span>
                <span className="text-[11px] font-normal text-slate-500 dark:text-muted-foreground">État du dossier</span>
              </span>
              <span className={entete.cardArrow + " bg-blue-100/80 text-blue-700 dark:bg-blue-950"}><ChevronRight className="size-4" aria-hidden /></span>
            </RaccourciOnglet>

            {peutVoirFinances ? (
              <RaccourciOnglet onglet="finances" className={entete.card + " h-auto justify-start border-orange-100 bg-orange-50/65 shadow-none hover:bg-orange-50/90 dark:border-orange-900 dark:bg-orange-950/20"}>
                <span className={entete.iconTile + " bg-orange-500"}><CreditCard className="size-[24px]" aria-hidden /></span>
                <span className={entete.cardText}>
                  <span className="text-xs font-medium text-slate-600 dark:text-muted-foreground">Situation financière</span>
                  <span className="break-words text-lg font-bold text-orange-700 dark:text-orange-300">{resteFinancier === null ? "Non renseignée" : resteFinancier > 0 ? "En attente" : "À jour"}</span>
                  <span className="text-[11px] font-normal text-slate-500 dark:text-muted-foreground">{resteFinancier !== null ? "Reste : " + resteFinancier.toLocaleString("fr-FR") + " FCFA" : "Aucune échéance enregistrée"}</span>
                </span>
                <span className={entete.cardArrow + " bg-orange-100/80 text-orange-700 dark:bg-orange-950"}><ChevronRight className="size-4" aria-hidden /></span>
              </RaccourciOnglet>
            ) : null}

            <RaccourciOnglet onglet="historique" className={entete.card + " h-auto justify-start border-violet-100 bg-violet-50/65 shadow-none hover:bg-violet-50/90 dark:border-violet-900 dark:bg-violet-950/20"}>
              <span className={entete.iconTile + " bg-violet-600"}><Clock3 className="size-[24px]" aria-hidden /></span>
              <span className={entete.cardText}>
                <span className="text-xs font-medium text-slate-600 dark:text-muted-foreground">Dernière activité</span>
                <span className="break-words text-lg font-bold text-violet-700 dark:text-violet-300">{derniereActivite ? dateFr(derniereActivite) : "Aucune"}</span>
                <span className="text-[11px] font-normal text-slate-500 dark:text-muted-foreground">Événement enregistré</span>
              </span>
              <span className={entete.cardArrow + " bg-violet-100/80 text-violet-700 dark:bg-violet-950"}><ChevronRight className="size-4" aria-hidden /></span>
            </RaccourciOnglet>
          </div>
        </div>
      </section>
      <Tabs defaultValue="ensemble" className="gap-3">
        <nav aria-label="Rubriques du dossier" className="min-w-0 overflow-x-auto overflow-y-hidden rounded-2xl border border-slate-200/80 bg-white px-2 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-border dark:bg-card">
          <TabsList variant="line" className="flex h-[56px] w-max min-w-full items-center justify-start gap-1.5 p-1.5">
            <TabsTrigger id="dossier-onglet-ensemble" value="ensemble" className="h-10 flex-none gap-2 rounded-xl px-3.5 text-xs font-semibold after:hidden data-active:bg-emerald-50 data-active:text-emerald-800 dark:data-active:bg-emerald-950 sm:text-sm"><LayoutDashboard className="size-4" aria-hidden />Vue d’ensemble</TabsTrigger>
            <TabsTrigger id="dossier-onglet-identite" value="identite" className="h-10 flex-none gap-2 rounded-xl px-3.5 text-xs after:hidden data-active:bg-emerald-50 data-active:text-emerald-800 sm:text-sm"><ContactRound className="size-4" aria-hidden />Identité</TabsTrigger>
            <TabsTrigger id="dossier-onglet-scolarite" value="scolarite" className="h-10 flex-none gap-2 rounded-xl px-3.5 text-xs after:hidden data-active:bg-emerald-50 data-active:text-emerald-800 sm:text-sm"><School2 className="size-4" aria-hidden />Scolarité</TabsTrigger>
            <TabsTrigger id="dossier-onglet-tuteurs" value="tuteurs" className="h-10 flex-none gap-2 rounded-xl px-3.5 text-xs after:hidden data-active:bg-emerald-50 data-active:text-emerald-800 sm:text-sm"><Users className="size-4" aria-hidden />Parents & tuteurs</TabsTrigger>
            <TabsTrigger id="dossier-onglet-documents" value="documents" className="h-10 flex-none gap-2 rounded-xl px-3.5 text-xs after:hidden data-active:bg-emerald-50 data-active:text-emerald-800 sm:text-sm"><Files className="size-4" aria-hidden />Documents</TabsTrigger>
            {peutVoirNotes ? <TabsTrigger id="dossier-onglet-notes" value="notes" className="h-10 flex-none gap-2 rounded-xl px-3.5 text-xs after:hidden data-active:bg-emerald-50 data-active:text-emerald-800 sm:text-sm"><BookOpenCheck className="size-4" aria-hidden />Notes</TabsTrigger> : null}
            {peutVoirAssiduite ? <TabsTrigger id="dossier-onglet-assiduite" value="assiduite" className="h-10 flex-none gap-2 rounded-xl px-3.5 text-xs after:hidden data-active:bg-emerald-50 data-active:text-emerald-800 sm:text-sm"><CalendarCheck2 className="size-4" aria-hidden />Assiduité</TabsTrigger> : null}
            {peutVoirFinances ? <TabsTrigger id="dossier-onglet-finances" value="finances" className="h-10 flex-none gap-2 rounded-xl px-3.5 text-xs after:hidden data-active:bg-emerald-50 data-active:text-emerald-800 sm:text-sm"><Wallet className="size-4" aria-hidden />Finances</TabsTrigger> : null}
            <TabsTrigger id="dossier-onglet-historique" value="historique" className="h-10 flex-none gap-2 rounded-xl px-3.5 text-xs after:hidden data-active:bg-emerald-50 data-active:text-emerald-800 sm:text-sm"><History className="size-4" aria-hidden />Historique</TabsTrigger>
            {peutVoirDiscipline ? <TabsTrigger id="dossier-onglet-discipline" value="discipline" className="h-10 flex-none gap-2 rounded-xl px-3.5 text-xs after:hidden data-active:bg-emerald-50 data-active:text-emerald-800 sm:text-sm"><ShieldAlert className="size-4" aria-hidden />Discipline</TabsTrigger> : null}
          </TabsList>
        </nav>

        <TabsContent value="ensemble" className="mt-1">
          <VueEnsembleEleve
            dossier={dossier}
            modifierDossier={peutModifierSensible ? <ModifierDossier
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
          /> : null}
            scolarite={scolarite}
            peutVoirFinances={peutVoirFinances}
            peutVoirNotes={peutVoirNotes}
            peutVoirAssiduite={peutVoirAssiduite}
            peutVoirTuteurs={true}
            notification={peutNotifier ? <BoutonNotifier cible={{ type: "eleve", id: eleve.id, nom: eleve.prenom + " " + eleve.nom }} contexteEleves variante="default" /> : null}
            actions={peutAdministrer ? <ActionsDossier
              eleveId={eleve.id}
              statut={eleve.statut}
              inscriptionId={inscription?.id ?? null}
              classeActuelleId={inscription?.classeId ?? null}
              statutDossier={inscription?.statutDossier ?? null}
              classes={classes.map((c) => ({ id: c.id, libelle: c.libelle }))}
            /> : null}
            documents={peutEmettreDocument ? <DocumentsEleve eleveId={eleve.id} estParti={["TRANSFERE", "ABANDON", "EXCLU", "ARCHIVE"].includes(eleve.statut)} bulletins={bulletinsDisponibles} /> : null}
            gestionTuteurs={peutGererTuteurs ? <GestionTuteurs eleveId={eleve.id} compact placement="ajout" tuteurs={tuteurs.map((t) => ({ id: t.id, nom: t.nom, prenom: t.prenom }))} /> : null}
            gestionTuteursHeader={peutGererTuteurs ? <GestionTuteurs eleveId={eleve.id} compact placement="gestion" tuteurs={tuteurs.map((t) => ({ id: t.id, nom: t.nom, prenom: t.prenom }))} /> : null}
            bulletins={bulletinsDisponibles}
          />
        </TabsContent>
        <TabsContent value="documents" className="mt-5 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Documents officiels du dossier</CardTitle><CardDescription>Les documents éditables ne sont pas assimilés à des pièces déjà déposées ou validées.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {peutEmettreDocument ? <DocumentsEleve eleveId={eleve.id} estParti={["TRANSFERE", "ABANDON", "EXCLU", "ARCHIVE"].includes(eleve.statut)} bulletins={bulletinsDisponibles} /> : <p className="text-sm text-muted-foreground">Édition non autorisée pour ce compte.</p>}
              {bulletinsDisponibles.map((b) => <a key={b.periodeId} href={"/api/bulletins/" + b.inscriptionId + "/" + b.periodeId} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-muted"><span>Bulletin — {b.periodeLibelle}</span><Badge variant={b.publie ? "default" : "outline"}>{b.publie ? "Publié" : "Brouillon"}</Badge></a>)}
            </CardContent>
          </Card>
        </TabsContent>

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

          {peutVoirSante ? (
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

        {peutVoirNotes ?         <TabsContent value="notes" className="mt-6">
          {scolarite ? (
            <OngletNotes dossier={scolarite} />
          ) : (
            <p className="text-muted-foreground py-10 text-center text-sm">
              Cet élève n&apos;a pas d&apos;inscription active cette année.
            </p>
          )}
        </TabsContent> : null}

        {peutVoirAssiduite ?         <TabsContent value="assiduite" className="mt-6">
          {scolarite ? <OngletAssiduite dossier={scolarite} /> : null}
        </TabsContent> : null}

        {peutVoirDiscipline ?         <TabsContent value="discipline" className="mt-6">
          {scolarite ? <OngletDiscipline dossier={scolarite} /> : null}
        </TabsContent> : null}

        {peutVoirFinances ?         <TabsContent value="finances" className="mt-6">
          {scolarite ? <OngletFinances dossier={scolarite} /> : null}
        </TabsContent> : null}

        {/* --- Scolarité --- */}
        <TabsContent value="scolarite" className="mt-6 space-y-6">
          {/*
            La réinscription est en tête de l'onglet Scolarité : c'est le geste
            de juin, et il porte sur l'année SUIVANTE. Le placer sous
            l'inscription en cours le ferait chercher.
          */}
          {proposition ? <Reinscription eleveId={eleve.id} proposition={proposition} /> : null}

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
      <footer aria-label="Bas du dossier élève" className="mt-1 flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm dark:border-border dark:bg-card sm:flex-row sm:items-center sm:justify-between sm:px-5 print:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <FileText className="size-[19px]" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[#142450] dark:text-foreground">Fiche scolaire de l’élève</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 dark:text-muted-foreground">
              <span className="break-all tabular-nums">{eleve.matricule}</span>
              {inscription ? <><span aria-hidden className="text-slate-300">·</span><span>Année scolaire {inscription.anneeLibelle}</span></> : null}
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="h-10 w-full justify-center gap-2 rounded-xl border-slate-200 bg-white px-4 text-xs font-semibold text-[#142450] shadow-none hover:border-emerald-200 hover:bg-emerald-50 dark:border-border dark:bg-background dark:text-foreground sm:w-auto">
          <Link href="/dashboard/eleves"><ArrowLeft className="size-4" aria-hidden />Retour à la liste des élèves</Link>
        </Button>
      </footer>
    </div>
  );
}
