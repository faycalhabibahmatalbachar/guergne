import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarDays, BookOpenText, Calculator, GraduationCap, Users, NotebookPen, FileText, Wallet, Send, Megaphone, ClipboardCheck, UserRoundCog } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  listerAnnees, listerClassesAnnee, listerCoefficients,
  listerMatieres, listerNiveaux, listerPeriodes, listerSeries,
} from "@/server/domain/parametres";
import { exigerSession, peut } from "@/server/guard";

import { OngletAnnees } from "./_components/annees";
import { OngletClasses } from "./_components/classes";
import { OngletCoefficients } from "./_components/coefficients";
import { OngletMatieres } from "./_components/matieres";
import { SettingsCards } from "./_components/settings-cards";
import { SettingsCategoryPanel, type IndicateurParametre, type AccesModule } from "./_components/settings-category-panel";
import { findSettingsCategory, type SettingsCategoryId } from "@/navigation/sidebar/settings-categories";
import type { Action } from "@/server/guard/permissions";
import { reglageBlocage } from "@/server/domain/caisse";
import { dureeInvitationJours } from "@/server/domain/parametres";
import { SETTINGS_CARDS, type SettingsPermission } from "./settings-catalog";

export const metadata: Metadata = { title: "Paramètres du lycée" };
export const dynamic = "force-dynamic";

const ONGLETS = ["annees", "matieres", "coefficients", "classes"] as const;
type Onglet = (typeof ONGLETS)[number];

const INFOS: Record<Onglet, { titre: string; description: string; icon: typeof CalendarDays }> = {
  annees: {
    titre: "Années scolaires et périodes",
    description: "Gérez l'année courante, les dates, les périodes et la clôture.",
    icon: CalendarDays,
  },
  matieres: {
    titre: "Matières et séries",
    description: "Organisez les matières et les séries de l'établissement.",
    icon: BookOpenText,
  },
  coefficients: {
    titre: "Coefficients",
    description: "Définissez les coefficients et les poids des évaluations par niveau et série.",
    icon: Calculator,
  },
  classes: {
    titre: "Structure des classes",
    description: "Configurez les classes, leurs séries et leurs capacités.",
    icon: GraduationCap,
  },
};

type LienOperationnel = AccesModule & { permission: Action };

const ACTIONS_PAR_SECTION: Record<SettingsCategoryId, readonly LienOperationnel[]> = {
  lycee: [
    { titre: "Gestion des élèves", description: "Inscriptions et dossiers", href: "/dashboard/eleves", icon: Users, permission: "eleve:lire" },
    { titre: "Gestion des classes", description: "Effectifs et capacités", href: "/dashboard/classes", icon: GraduationCap, permission: "classe:lire" },
    { titre: "Diagnostic du lycée", description: "Vérifier les prérequis", href: "/dashboard/parametres/diagnostic", icon: ClipboardCheck, permission: "parametre:modifier" },
  ],
  scolarite: [
    { titre: "Notes", description: "Évaluations et saisies", href: "/dashboard/notes", icon: NotebookPen, permission: "note:lire" },
    { titre: "Bulletins", description: "Documents et publications", href: "/dashboard/bulletins", icon: FileText, permission: "bulletin:lire" },
    { titre: "Emploi du temps", description: "Organisation des séances", href: "/dashboard/emploi-du-temps", icon: CalendarDays, permission: "emploi_du_temps:lire" },
  ],
  finances: [
    { titre: "Suivi financier", description: "Frais et règlements", href: "/dashboard/finances", icon: Wallet, permission: "finance:lire" },
    { titre: "Journal de caisse", description: "Encaissements du jour", href: "/dashboard/finances/caisse", icon: FileText, permission: "finance:lire" },
    { titre: "Bulletins", description: "Publication et retenues", href: "/dashboard/bulletins", icon: FileText, permission: "bulletin:lire" },
  ],
  communication: [
    { titre: "Comptes parents", description: "Responsables et familles", href: "/dashboard/parents", icon: Users, permission: "tuteur:gerer" },
    { titre: "Suivi des invitations", description: "Historique des invitations", href: "/dashboard/parents/invitations", icon: Send, permission: "tuteur:inviter" },
    { titre: "Communication", description: "Messages et annonces", href: "/dashboard/communication", icon: Megaphone, permission: "annonce:lire" },
  ],
  "controle-securite": [
    { titre: "Personnel", description: "Comptes et accès", href: "/dashboard/personnel", icon: UserRoundCog, permission: "utilisateur:creer" },
  ],
};

async function indicateursDeSection(
  section: SettingsCategoryId,
  peutVoirInvitations: boolean,
): Promise<IndicateurParametre[]> {
  if (section === "lycee") {
    const annees = await listerAnnees();
    const courante = annees.find((a) => a.estCourante);
    return [
      { titre: "Année scolaire", valeur: courante?.libelle ?? "Non définie", precision: courante ? "Année courante" : "À configurer" },
      { titre: "Classes de l'année", valeur: (courante?.nbClasses ?? 0).toLocaleString("fr-FR"), precision: "Classes enregistrées" },
      { titre: "Inscriptions actives", valeur: (courante?.nbInscriptions ?? 0).toLocaleString("fr-FR"), precision: "Année courante" },
    ];
  }
  if (section === "scolarite") {
    const [annees, matieres, series] = await Promise.all([listerAnnees(), listerMatieres(), listerSeries()]);
    const annee = annees.find((a) => a.estCourante);
    return [
      { titre: "Matières actives", valeur: matieres.filter((m) => m.active).length.toLocaleString("fr-FR"), precision: "Catalogue du lycée" },
      { titre: "Séries actives", valeur: series.filter((serie) => serie.active).length.toLocaleString("fr-FR"), precision: "Séries disponibles" },
      { titre: "Classes configurées", valeur: (annee?.nbClasses ?? 0).toLocaleString("fr-FR"), precision: annee ? "Année " + annee.libelle : "Aucune année courante" },
    ];
  }
  if (section === "finances") {
    const reglage = await reglageBlocage();
    return [
      { titre: "Retenue des bulletins", valeur: reglage.actif ? "Activée" : "Désactivée", precision: "Règle d'impayé" },
      { titre: "Seuil de tolérance", valeur: reglage.seuilFcfa.toLocaleString("fr-FR") + " FCFA", precision: "Reste à payer autorisé" },
    ];
  }
  if (section === "communication" && peutVoirInvitations) {
    const jours = await dureeInvitationJours();
    return [
      { titre: "Validité des codes parents", valeur: jours + (jours > 1 ? " jours" : " jour"), precision: "Nouvelles invitations" },
    ];
  }
  return [];
}

export default async function PageParametres({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string; section?: string; niveau?: string; serie?: string }>;
}) {
  const principal = await exigerSession();
  const params = await searchParams;

  const [
    peutConfigurer, peutGererAnnees, peutGererPeriodes,
    peutDeverrouillerPeriodes, peutGererMatieres,
    peutGererCoefficients, peutCreerClasses, peutModifierClasses,
    peutNotifier, peutAuditer, peutConfigurerFinances,
  ] = await Promise.all([
    peut(principal, "parametre:modifier"),
    peut(principal, "annee:cloturer"),
    peut(principal, "periode:verrouiller"),
    peut(principal, "periode:deverrouiller"),
    peut(principal, "matiere:gerer"),
    peut(principal, "coefficient:gerer"),
    peut(principal, "classe:creer"),
    peut(principal, "classe:modifier"),
    peut(principal, "notification:configurer"),
    peut(principal, "audit:lire"),
    peut(principal, "finance:configurer"),
  ]);

  const accesOnglet: Record<Onglet, boolean> = {
    annees: peutGererAnnees || peutGererPeriodes || peutDeverrouillerPeriodes,
    matieres: peutGererMatieres,
    coefficients: peutGererCoefficients,
    classes: peutCreerClasses || peutModifierClasses,
  };

  const onglet = ONGLETS.includes(params.onglet as Onglet)
    ? (params.onglet as Onglet)
    : null;

  if (!onglet) {
    // The landing page is the actual cards overview, not an automatic redirect.
    // Never expose links to settings unavailable to the current role.
    const droits = new Set<SettingsPermission>();
    if (peutConfigurer) droits.add("parametre:modifier");
    if (peutGererAnnees) droits.add("annee:cloturer");
    if (peutGererPeriodes) droits.add("periode:verrouiller");
    if (peutDeverrouillerPeriodes) droits.add("periode:deverrouiller");
    if (peutGererMatieres) droits.add("matiere:gerer");
    if (peutGererCoefficients) droits.add("coefficient:gerer");
    if (peutCreerClasses) droits.add("classe:creer");
    if (peutModifierClasses) droits.add("classe:modifier");
    if (peutNotifier) droits.add("notification:configurer");
    if (peutConfigurerFinances) droits.add("finance:configurer");
    if (peutAuditer) droits.add("audit:lire");

    const liensAutorises = SETTINGS_CARDS.filter((carte) =>
      carte.droits.some((droit) => droits.has(droit)),
    );
    if (!liensAutorises.length) redirect("/unauthorized");

    const categorie = findSettingsCategory(params.section);
    if (categorie) {
      const rubrique = liensAutorises.filter((carte) =>
        (categorie.cards as readonly string[]).includes(carte.id),
      );
      if (!rubrique.length) redirect("/unauthorized");

      const raccourcis = ACTIONS_PAR_SECTION[categorie.id];
      const [permisRaccourcis, indicateurs] = await Promise.all([
        Promise.all(raccourcis.map((lien) => peut(principal, lien.permission))),
        indicateursDeSection(categorie.id, peutConfigurer),
      ]);
      const accesModules = raccourcis
        .filter((_, index) => permisRaccourcis[index])
        .map(({ permission: _permission, ...lien }) => lien);

      return (
        <SettingsCategoryPanel
          category={categorie}
          items={rubrique}
          indicateurs={indicateurs}
          accesModules={accesModules}
        />
      );
    }

    return <SettingsCards items={liensAutorises} />;
  }

  if (!accesOnglet[onglet]) redirect("/unauthorized");

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

  const info = INFOS[onglet];
  const Icon = info.icon;

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-5 dark:border-border">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl dark:text-foreground">{info.titre}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">{info.description}</p>
          </div>
        </div>
        {anneeCourante ? (
          <Badge variant="outline" className="self-start whitespace-nowrap tabular-nums">
            Année {anneeCourante.libelle}
          </Badge>
        ) : null}
      </header>

      {onglet === "annees" ? (
        <OngletAnnees
          annees={annees}
          periodesParAnnee={periodesParAnnee}
          peutGererAnnees={peutGererAnnees}
          peutGererPeriodes={peutGererPeriodes}
          peutDeverrouillerPeriodes={peutDeverrouillerPeriodes}
        />
      ) : null}
      {onglet === "matieres" ? <OngletMatieres matieres={matieres} series={series} /> : null}
      {onglet === "coefficients" ? (
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
      ) : null}
      {onglet === "classes" ? (
        <OngletClasses
          anneeCourante={anneeCourante}
          classes={classes}
          niveaux={niveaux}
          series={series}
          peutCreer={peutCreerClasses}
          peutModifier={peutModifierClasses}
        />
      ) : null}
    </div>
  );
}
