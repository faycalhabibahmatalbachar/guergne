import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Statistiques } from "@/lib/statistiques-notes";

/**
 * Statistiques d'une évaluation (E-42).
 *
 * PLACÉ SOUS LA GRILLE, PAS AU-DESSUS
 * ------------------------------------
 * Ces chiffres n'ont de sens qu'une fois les notes saisies. Au-dessus, ils
 * occuperaient la place au moment où le professeur cherche la première case,
 * et n'afficheraient que des tirets.
 *
 * L'HISTOGRAMME EST LA PARTIE UTILE
 * ----------------------------------
 * Deux devoirs à 10 de moyenne n'ont rien à voir : l'un groupé entre 8 et 12,
 * l'autre coupant la classe en deux paquets à 5 et à 15. Le second décrit un
 * chapitre compris par la moitié de la classe — c'est celui-là qu'il faut
 * reprendre, et la moyenne seule ne le dit pas.
 */

const fmt = (v: number | null, unite = "") =>
  v === null ? "—" : `${v.toFixed(2).replace(".", ",")}${unite}`;

function Chiffre({
  libelle,
  valeur,
  detail,
  accent,
}: {
  libelle: string;
  valeur: string;
  detail?: string;
  accent?: "bon" | "alerte";
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{libelle}</p>
      <p
        className={`font-semibold text-lg tabular-nums ${
          accent === "alerte"
            ? "text-destructive"
            : accent === "bon"
              ? "text-emerald-600 dark:text-emerald-400"
              : ""
        }`}
      >
        {valeur}
      </p>
      {detail ? <p className="text-muted-foreground text-xs">{detail}</p> : null}
    </div>
  );
}

export function StatistiquesEvaluation({
  stats,
  titre,
}: {
  stats: Statistiques;
  titre: string;
}) {
  const { moyenne, mediane, notees } = stats;
  const tauxReussite = notees > 0 && stats.reussite !== null ? stats.reussite / notees : null;
  const maxTranche = Math.max(1, ...stats.tranches.map((t) => t.effectif));

  // Une médiane nettement au-dessus de la moyenne dit que quelques très
  // mauvaises notes tirent l'ensemble vers le bas ; l'inverse, que quelques
  // excellents résultats masquent une majorité en difficulté. On ne le
  // commente qu'au-delà d'un point d'écart : en deçà, c'est du bruit.
  const ecartMedian = moyenne !== null && mediane !== null ? mediane - moyenne : null;
  const lecture =
    ecartMedian === null
      ? null
      : ecartMedian > 1
        ? "La médiane dépasse la moyenne de plus d'un point : quelques très faibles notes tirent l'ensemble vers le bas. La classe va mieux que sa moyenne ne le dit."
        : ecartMedian < -1
          ? "La moyenne dépasse la médiane de plus d'un point : quelques très bons résultats masquent une majorité en difficulté."
          : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Résultats — {titre}</CardTitle>
        <CardDescription>
          {notees} note(s) retenue(s) sur {stats.effectif} élève(s)
          {stats.nonSaisies > 0 ? ` · ${stats.nonSaisies} non saisie(s)` : ""}
          {stats.absentsExclus > 0
            ? ` · ${stats.absentsExclus} absent(s) ou dispensé(s), exclu(s) du calcul`
            : ""}
          {stats.bareme !== 20 ? ` · barème sur ${stats.bareme}, ramené sur 20` : ""}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Chiffre libelle="Moyenne" valeur={fmt(moyenne)} />
          <Chiffre libelle="Médiane" valeur={fmt(mediane)} />
          <Chiffre
            libelle="Écart-type"
            valeur={fmt(stats.ecartType)}
            detail={
              stats.ecartType === null
                ? undefined
                : stats.ecartType < 2
                  ? "classe homogène"
                  : stats.ecartType > 4
                    ? "notes très dispersées"
                    : undefined
            }
          />
          <Chiffre libelle="Plus basse" valeur={fmt(stats.min)} />
          <Chiffre libelle="Plus haute" valeur={fmt(stats.max)} />
          <Chiffre
            libelle="Au-dessus de 10"
            valeur={
              tauxReussite === null ? "—" : `${Math.round(tauxReussite * 100)} %`
            }
            detail={stats.reussite === null ? undefined : `${stats.reussite} / ${notees}`}
            accent={
              tauxReussite === null ? undefined : tauxReussite < 0.5 ? "alerte" : "bon"
            }
          />
        </div>

        <div className="space-y-1.5">
          {stats.tranches.map((t) => (
            <div key={t.libelle} className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground w-16 shrink-0 text-xs tabular-nums">
                {t.libelle}
              </span>
              <div className="bg-muted h-5 flex-1 overflow-hidden rounded-sm">
                <div
                  className={`h-full ${t.max <= 10 ? "bg-amber-500/70" : "bg-primary/70"}`}
                  style={{ width: `${(t.effectif / maxTranche) * 100}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right tabular-nums">{t.effectif || ""}</span>
            </div>
          ))}
        </div>

        {lecture ? <p className="text-muted-foreground border-t pt-3 text-sm">{lecture}</p> : null}

        {tauxReussite !== null && tauxReussite < 0.35 ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
            Moins d&apos;un tiers de la classe atteint la moyenne. Avant d&apos;en conclure que le
            travail n&apos;a pas été fait, il vaut la peine de relire le sujet : un barème trop
            serré ou une question hors programme produit exactement cette courbe.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
