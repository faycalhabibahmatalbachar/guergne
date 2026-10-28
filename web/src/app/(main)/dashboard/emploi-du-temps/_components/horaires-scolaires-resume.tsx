"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlageHoraireScolaire } from "@/server/domain/horaires-scolaires";

const JOURS: Record<number, string> = {
  1: "Lundi",
  2: "Mardi",
  3: "Mercredi",
  4: "Jeudi",
  5: "Vendredi",
  6: "Samedi",
  7: "Dimanche",
};

function heure(valeur: string): string {
  return valeur.slice(0, 5);
}

export function HorairesScolairesResume({
  plages,
}: {
  plages: PlageHoraireScolaire[];
}) {
  const profils = new Map<string, { jours: Set<number>; plages: PlageHoraireScolaire[] }>();

  for (const plage of plages) {
    let profil = profils.get(plage.profilLibelle);
    if (!profil) {
      profil = { jours: new Set<number>(), plages: [] };
      profils.set(plage.profilLibelle, profil);
    }
    profil.jours.add(plage.jourSemaine);
    if (!profil.plages.some((p) => p.ordreAffichage === plage.ordreAffichage)) {
      profil.plages.push(plage);
    }
  }

  const entreeProfils = [...profils.entries()].map(([libelle, profil]) => ({
    libelle,
    jours: [...profil.jours].sort((a, b) => a - b).map((jour) => JOURS[jour]),
    plages: profil.plages.sort((a, b) => a.ordreAffichage - b.ordreAffichage),
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Horaires de l’établissement</CardTitle>
        <CardDescription>
          Horaires configurés pour l’année sélectionnée. Les pauses sont affichées à part et ne
          constituent pas des créneaux de cours.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {entreeProfils.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {entreeProfils.map((profil) => (
              <section key={profil.libelle} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-sm">{profil.libelle}</h3>
                  <span className="text-xs text-muted-foreground">{profil.jours.join(" · ")}</span>
                </div>
                <ol className="mt-3 space-y-2">
                  {profil.plages.map((plage) => (
                    <li
                      key={plage.ordreAffichage}
                      className={`flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm ${
                        plage.nature === "PAUSE" ? "bg-muted/70 text-muted-foreground" : "bg-muted/25"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="font-medium">{plage.libelle}</span>
                        {plage.nature === "PAUSE" ? (
                          <span className="ml-2 text-xs">Pause</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums">
                        {heure(plage.heureDebut)}–{heure(plage.heureFin)}
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Dates de configuration : {profil.plages[0]?.dateDebut} au{" "}
                  {profil.plages[0]?.dateFin}
                </p>
              </section>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            Aucun profil horaire n’est configuré pour cette année scolaire.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Le samedi et les créneaux au-delà de la 5e séance (dont les horaires de l’après-midi)
          ne sont pas configurés ici. Ils restent signalés comme à confirmer dans la grille : aucun
          horaire n’est déduit automatiquement.
        </p>
      </CardContent>
    </Card>
  );
}
