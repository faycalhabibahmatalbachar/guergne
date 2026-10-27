import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EvenementCalendaireDate, JourCalendrier } from "@/server/domain/calendrier-scolaire";

interface EvenementAffiche extends EvenementCalendaireDate {
  description: string | null;
  visibleParents: boolean;
  impactCours: string;
  statutValidation: string;
  sourceOfficielle: string | null;
  sourceVerifieeLe: string | null;
}

interface MoisCalendrier {
  cle: string;
  libelle: string;
  jours: JourCalendrier[];
}

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const TYPES: Record<string, string> = {
  VACANCES: "Vacances",
  FERIE: "Jour férié",
  COMPOSITION: "Composition",
  EXAMEN_BLANC: "Examen blanc",
  REUNION_PARENTS: "Réunion parents",
  CONSEIL_CLASSE: "Conseil de classe",
  RENTREE: "Rentrée",
  AUTRE: "Autre",
};

function classeEvenement(evenement: EvenementAffiche): string {
  if (evenement.statutValidation === "A_VERIFIER") {
    return "border-amber-500/40 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100";
  }
  if (evenement.statutValidation === "BROUILLON") {
    return "border-border bg-muted/70 text-foreground";
  }
  if (evenement.impactCours === "SUSPENDRE_COURS") {
    return "border-red-500/40 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-100";
  }
  if (evenement.impactCours === "ORGANISATION_SPECIALE") {
    return "border-violet-500/40 bg-violet-50 text-violet-950 dark:bg-violet-950/40 dark:text-violet-100";
  }
  return "border-sky-500/30 bg-sky-50 text-sky-950 dark:bg-sky-950/30 dark:text-sky-100";
}

function statutLibelle(statut: string): string {
  const libelles: Record<string, string> = {
    A_VERIFIER: "À vérifier",
    BROUILLON: "Brouillon",
    VALIDE: "Validé",
    PUBLIE: "Publié",
    ANNULE: "Annulé",
  };
  return libelles[statut] ?? statut;
}

function moisLibelle(annee: number, mois: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(annee, mois - 1, 1)));
}

export function VueCalendrierAnnuel({
  anneeLibelle,
  dateDebut,
  dateFin,
  jours,
  evenements,
}: {
  anneeLibelle: string;
  dateDebut: string;
  dateFin: string;
  jours: JourCalendrier[];
  evenements: EvenementAffiche[];
}) {
  const moisMap = new Map<string, MoisCalendrier>();

  for (const jour of jours) {
    const cle = `${jour.annee}-${String(jour.mois).padStart(2, "0")}`;
    let mois = moisMap.get(cle);
    if (!mois) {
      mois = { cle, libelle: moisLibelle(jour.annee, jour.mois), jours: [] };
      moisMap.set(cle, mois);
    }
    mois.jours.push(jour);
  }

  const evenementsPourJour = (date: string) =>
    evenements.filter((evenement) => evenement.dateDebut <= date && date <= evenement.dateFin);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline" className="border-red-500/40 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-100">Cours suspendus</Badge>
        <Badge variant="outline" className="border-violet-500/40 bg-violet-50 text-violet-950 dark:bg-violet-950/40 dark:text-violet-100">Organisation spéciale</Badge>
        <Badge variant="outline" className="border-sky-500/30 bg-sky-50 text-sky-950 dark:bg-sky-950/30 dark:text-sky-100">Information</Badge>
        <Badge variant="outline" className="border-amber-500/40 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">À vérifier</Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Vue annuelle — {anneeLibelle}</CardTitle>
          <CardDescription>
            Du {dateDebut} au {dateFin}. Les libellés sont répétés sur chaque date couverte par
            un événement multi-jours. « À vérifier » indique qu’un événement n’est pas encore
            confirmé pour piloter les cours.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 p-3 sm:p-4 md:grid-cols-2 xl:grid-cols-3">
          {[...moisMap.values()].map((mois) => {
            const joursAvant = (mois.jours[0]?.jourSemaineISO ?? 1) - 1;
            return (
              <section key={mois.cle} className="min-w-0 rounded-lg border">
                <h3 className="border-b bg-muted/30 px-3 py-2 text-sm font-semibold capitalize">
                  {mois.libelle}
                </h3>
                <div className="grid grid-cols-7 border-b bg-muted/20">
                  {JOURS.map((jour) => (
                    <div key={jour} className="py-1.5 text-center text-[10px] font-medium text-muted-foreground">
                      {jour}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {Array.from({ length: joursAvant }, (_, i) => (
                    <div key={`vide-${mois.cle}-${i}`} className="min-h-16 border-b border-r bg-muted/10 sm:min-h-[5.25rem]" />
                  ))}
                  {mois.jours.map((jour) => {
                    const liste = evenementsPourJour(jour.date);
                    return (
                      <div
                        key={jour.date}
                        className={`min-w-0 border-b border-r p-1 ${liste.some((e) => e.impactCours === "SUSPENDRE_COURS" && e.statutValidation === "VALIDE") ? "bg-red-50/60 dark:bg-red-950/10" : ""}`}
                        title={`${jour.date} · ${liste.map((e) => e.titre).join(", ")}`}
                      >
                        <div className="mb-1 text-[11px] font-semibold tabular-nums">{jour.jourDuMois}</div>
                        <div className="space-y-1">
                          {liste.slice(0, 2).map((evenement) => (
                            <div
                              key={evenement.id}
                              className={`overflow-hidden rounded border px-1 py-0.5 text-[9px] leading-tight ${classeEvenement(evenement)}`}
                              title={`${TYPES[evenement.type] ?? evenement.type} : ${evenement.titre} · ${statutLibelle(evenement.statutValidation)}`}
                            >
                              <span className="block truncate font-semibold">{evenement.titre}</span>
                            </div>
                          ))}
                          {liste.length > 2 ? (
                            <div className="text-[9px] text-muted-foreground">+{liste.length - 2} autres</div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Événements de l’année</CardTitle>
          <CardDescription>{evenements.length} événement(s) enregistrés, tous états de validation confondus sauf annulation.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {evenements.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">Aucun événement enregistré pour cette année scolaire.</p>
          ) : (
            evenements.map((evenement) => (
              <article key={evenement.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-semibold">{evenement.titre}</h4>
                    <Badge variant="outline">{TYPES[evenement.type] ?? evenement.type}</Badge>
                    <Badge variant="outline">{statutLibelle(evenement.statutValidation)}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Du {evenement.dateDebut} au {evenement.dateFin}
                    {" · "}
                    {evenement.impactCours === "SUSPENDRE_COURS"
                      ? "Suspend les cours lorsque validé"
                      : evenement.impactCours === "ORGANISATION_SPECIALE"
                        ? "Nécessite une organisation spécifique"
                        : "Informatif"}
                    {" · "}
                    {evenement.visibleParents ? "Visible aux parents" : "Interne"}
                  </p>
                  {evenement.description ? <p className="whitespace-pre-wrap text-sm">{evenement.description}</p> : null}
                  {evenement.sourceOfficielle ? (
                    <p className="break-all text-xs text-muted-foreground">
                      Source : {evenement.sourceOfficielle}
                      {evenement.sourceVerifieeLe ? ` · vérifiée le ${evenement.sourceVerifieeLe}` : ""}
                    </p>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
