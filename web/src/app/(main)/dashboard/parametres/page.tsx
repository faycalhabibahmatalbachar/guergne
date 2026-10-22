import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ArrowLeft,
  Bell,
  BookOpenText,
  CalendarDays,
  ChevronRight,
  GraduationCap,
  Megaphone,
  School,
  ScrollText,
  ShieldCheck,
  Users,
  UserRoundCog,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { APP_CONFIG } from "@/config/app-config";
import {
  listerAnnees,
  listerClassesAnnee,
  listerCoefficients,
  listerMatieres,
  listerNiveaux,
  listerPeriodes,
  listerSeries,
} from "@/server/domain/parametres";
import { exigerSession, peut } from "@/server/guard";

import { OngletAnnees } from "./_components/annees";
import { OngletClasses } from "./_components/classes";
import { OngletCoefficients } from "./_components/coefficients";
import { OngletMatieres } from "./_components/matieres";

export const metadata: Metadata = { title: "Paramètres du lycée" };
export const dynamic = "force-dynamic";

const ONGLETS = ["annees", "matieres", "coefficients", "classes"] as const;
type Onglet = (typeof ONGLETS)[number];
type Lien = { titre: string; description: string; url: string; icone: LucideIcon; note?: string };

function CarteLien({ lien }: { lien: Lien }) {
  const Icone = lien.icone;
  return (
    <Link
      prefetch={false}
      href={lien.url}
      className="group flex min-h-24 items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-foreground">
        <Icone className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-sm">{lien.titre}</span>
        <span className="mt-1 block text-muted-foreground text-xs leading-relaxed">{lien.description}</span>
        {lien.note ? (
          <span className="mt-2 block text-muted-foreground text-[11px]">{lien.note}</span>
        ) : null}
      </span>
      <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

function GroupeReglages({
  titre,
  description,
  liens,
}: {
  titre: string;
  description: string;
  liens: Lien[];
}) {
  if (!liens.length) return null;
  return (
    <section className="space-y-3" aria-label={titre}>
      <div>
        <h2 className="font-semibold text-base">{titre}</h2>
        <p className="mt-0.5 text-muted-foreground text-sm">{description}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {liens.map((lien) => <CarteLien key={lien.url} lien={lien} />)}
      </div>
    </section>
  );
}

/**
 * Paramètres d'un seul établissement : pas de configuration multi-écoles.
 * L'accueil ne charge aucune donnée pédagogique protégée. Chaque page et
 * chaque action restent responsables de leurs propres permissions serveur.
 */
export default async function PageParametres({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string; niveau?: string; serie?: string }>;
}) {
  const principal = await exigerSession();
  const params = await searchParams;
  const [
    peutConfigurer,
    peutNotifier,
    peutAuditer,
    peutFinances,
    peutConfigurerFinances,
    peutPersonnel,
    peutParents,
    peutCommunication,
  ] = await Promise.all([
    peut(principal, "parametre:modifier"),
    peut(principal, "notification:configurer"),
    peut(principal, "audit:lire"),
    peut(principal, "finance:lire"),
    peut(principal, "finance:configurer"),
    peut(principal, "utilisateur:creer"),
    peut(principal, "tuteur:gerer"),
    peut(principal, "annonce:lire"),
  ]);

  if (!peutConfigurer && !peutNotifier && !peutAuditer && !peutConfigurerFinances) {
    redirect("/unauthorized");
  }

  const onglet = ONGLETS.includes(params.onglet as Onglet)
    ? (params.onglet as Onglet)
    : null;

  // Le droit de consulter les politiques SMS ou l'audit ne donne pas accès aux
  // années, classes ni coefficients, même en modifiant manuellement l'URL.
  if (onglet && !peutConfigurer) {
    redirect("/unauthorized");
  }

  if (!onglet) {
    return (
      <div className="space-y-7 pb-8">
        <div>
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-widest">Administration</p>
          <h1 className="mt-1 font-semibold text-2xl tracking-tight">Paramètres du lycée</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground text-sm">
            Retrouvez les configurations autorisées et les accès aux modules existants de {APP_CONFIG.name}.
          </p>
        </div>

        {peutConfigurer ? (
          <section className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-center" aria-label="Identité de l'établissement">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-xl border bg-background">
              <School className="size-7 text-primary" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">{APP_CONFIG.nomComplet}</h2>
              <p className="mt-1 text-muted-foreground text-sm">
                Établissement unique · Enseignement secondaire, de la 6ème à la Terminale
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                Nom officiel, sigle {APP_CONFIG.sigle} et devise {APP_CONFIG.devise} sont pour l'instant définis dans la configuration de l'application.
              </p>
            </div>
            <Badge variant="outline" className="self-start sm:self-center">Identité actuelle</Badge>
          </section>
        ) : null}

        <GroupeReglages
          titre="Identité du lycée"
          description="Une seule fiche institutionnelle, sans gestion de plusieurs établissements."
          liens={peutConfigurer ? [{
            titre: "Coordonnées et signataires officiels",
            description: "Adresse, téléphone, e-mail, tutelle, autorisation, proviseur et censeur.",
            url: "/dashboard/parametres/etablissement",
            icone: School,
          }] : []}
        />

        <GroupeReglages
          titre="Année scolaire et référentiel"
          description="Les paramètres structurants des inscriptions, des notes et des bulletins."
          liens={peutConfigurer ? [
            {
              titre: "Années scolaires et périodes",
              description: "Année courante, trimestres ou semestres, dates et clôture contrôlée.",
              url: "/dashboard/parametres?onglet=annees",
              icone: CalendarDays,
            },
            {
              titre: "Matières et séries",
              description: "Catalogue des matières, séries et états d'activation.",
              url: "/dashboard/parametres?onglet=matieres",
              icone: BookOpenText,
            },
            {
              titre: "Coefficients",
              description: "Pondération des matières et évaluations, par niveau et série.",
              url: "/dashboard/parametres?onglet=coefficients",
              icone: GraduationCap,
            },
          ] : []}
        />

        <GroupeReglages
          titre="Scolarité"
          description="Structure des classes et accès aux responsables des élèves."
          liens={[
            ...(peutConfigurer ? [{
              titre: "Structure des classes",
              description: "Créer, modifier et vérifier les capacités des classes de l'année.",
              url: "/dashboard/parametres?onglet=classes",
              icone: Users,
            }] : []),
            ...(peutConfigurer ? [{
              titre: "Validité des invitations parents",
              description: "Durée des nouveaux codes d'activation et conditions de renouvellement.",
              url: "/dashboard/parametres/parents",
              icone: ShieldCheck,
            }] : []),
            ...(peutParents ? [{
              titre: "Comptes parents et familles",
              description: "Accéder au suivi opérationnel des responsables et invitations.",
              url: "/dashboard/parents",
              icone: Users,
              note: "Ouvre le module Comptes parents",
            }] : []),
          ]}
        />

        <GroupeReglages
          titre="Communication et notifications"
          description="Contrôler les canaux de contact et le coût des SMS."
          liens={[
            ...(peutNotifier ? [{
              titre: "Politiques de notification",
              description: "Application, SMS de secours et seuils de signalement.",
              url: "/dashboard/parametres/notifications",
              icone: Bell,
            }] : []),
            ...(peutCommunication ? [{
              titre: "Communication",
              description: "Consulter les annonces et messages de l'établissement.",
              url: "/dashboard/communication",
              icone: Megaphone,
              note: "Ouvre le module Communication",
            }] : []),
          ]}
        />

        <GroupeReglages
          titre="Finances et bulletins"
          description="Décisions financières du lycée et accès aux opérations."
          liens={[
            ...(peutConfigurerFinances ? [{
              titre: "Règles financières des bulletins",
              description: "Retenue des bulletins pour impayé et seuil de tolérance en FCFA.",
              url: "/dashboard/parametres/finances",
              icone: Wallet,
            }] : []),
            ...(peutFinances ? [{
              titre: "Finances et encaissements",
              description: "Accéder aux frais, aux paiements et au suivi financier.",
              url: "/dashboard/finances",
              icone: Wallet,
              note: "Ouvre le module Finances",
            }] : []),
          ]}
        />

        <GroupeReglages
          titre="Personnel et contrôle"
          description="Gestion des accès et traçabilité des opérations sensibles."
          liens={[
            ...(peutPersonnel ? [{
              titre: "Personnel et comptes",
              description: "Gérer les comptes du personnel depuis leur module dédié.",
              url: "/dashboard/personnel",
              icone: UserRoundCog,
              note: "Ouvre le module Personnel",
            }] : []),
            ...(peutAuditer ? [{
              titre: "Journal d'audit",
              description: "Rechercher qui a modifié un dossier, quand et pourquoi.",
              url: "/dashboard/parametres/audit",
              icone: ScrollText,
            }] : []),
          ]}
        />

        <p className="flex items-center gap-2 text-muted-foreground text-xs">
          <ShieldCheck className="size-4 shrink-0" aria-hidden />
          Les accès sont filtrés selon les droits de la session ; les actions restent contrôlées côté serveur.
        </p>
      </div>
    );
  }

  const [annees, niveaux, series, matieres] = await Promise.all([
    listerAnnees(),
    listerNiveaux(),
    listerSeries(),
    listerMatieres(),
  ]);
  const anneeCourante = annees.find((a) => a.estCourante) ?? null;

  const periodesParAnnee: Record<string, Awaited<ReturnType<typeof listerPeriodes>>> = {};
  if (onglet === "annees") {
    await Promise.all(annees.map(async (annee) => {
      periodesParAnnee[annee.id] = await listerPeriodes(annee.id);
    }));
  }

  const classes = onglet === "classes" && anneeCourante
    ? await listerClassesAnnee(anneeCourante.id)
    : [];

  const niveauInitial = params.niveau ?? null;
  const serieInitiale = params.serie ?? null;
  const coefficientsInitiaux = onglet === "coefficients" && anneeCourante && niveauInitial
    ? await listerCoefficients(anneeCourante.id, niveauInitial, serieInitiale)
    : [];

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2">
            <Link prefetch={false} href="/dashboard/parametres">
              <ArrowLeft className="size-4" aria-hidden />
              Tous les paramètres
            </Link>
          </Button>
          <h1 className="font-semibold text-2xl tracking-tight">Référentiel scolaire</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {APP_CONFIG.name} · Années, matières, coefficients et structure des classes.
          </p>
        </div>
        {anneeCourante ? <Badge variant="outline">Année {anneeCourante.libelle}</Badge> : null}
      </div>

      <Tabs value={onglet}>
        <div className="max-w-full overflow-x-auto pb-1">
          <TabsList>
            <TabsTrigger value="annees" asChild>
              <Link href="/dashboard/parametres?onglet=annees">Années scolaires</Link>
            </TabsTrigger>
            <TabsTrigger value="matieres" asChild>
              <Link href="/dashboard/parametres?onglet=matieres">Matières &amp; séries</Link>
            </TabsTrigger>
            <TabsTrigger value="coefficients" asChild>
              <Link href="/dashboard/parametres?onglet=coefficients">Coefficients</Link>
            </TabsTrigger>
            <TabsTrigger value="classes" asChild>
              <Link href="/dashboard/parametres?onglet=classes">Classes</Link>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="annees" className="mt-6">
          <OngletAnnees annees={annees} periodesParAnnee={periodesParAnnee} />
        </TabsContent>

        <TabsContent value="matieres" className="mt-6">
          <OngletMatieres matieres={matieres} series={series} />
        </TabsContent>

        <TabsContent value="coefficients" className="mt-6">
          <OngletCoefficients
            annees={annees}
            anneeCourante={anneeCourante}
            niveaux={niveaux}
            series={series}
            matieres={matieres}
            coefficientsInitiaux={coefficientsInitiaux}
            niveauInitial={niveauInitial}
            serieInitiale={serieInitiale}
          />
        </TabsContent>

        <TabsContent value="classes" className="mt-6">
          <OngletClasses
            anneeCourante={anneeCourante}
            classes={classes}
            niveaux={niveaux}
            series={series}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
