"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PointEvolution } from "@/server/domain/dossier-eleve";

/**
 * Données réelles uniquement. Le cadrage chart-header/chart-area et les
 * tokens proviennent de Gentelella v4.2.0 (MIT, sources dans vendor).
 * Recharts, déjà présent dans Next.js, dessine le SVG accessible.
 */
export function CourbeResultats({ points }: { points: PointEvolution[] }) {
  if (!points.some(p => p.moyenne !== null || p.moyenneClasse !== null)) {
    return <div className="lgr-chart-empty min-h-28">Pas encore de moyenne disponible pour ces périodes.</div>;
  }

  const series = points.map(p => ({
    periode: p.periode,
    eleve: p.moyenne,
    classe: p.moyenneClasse,
  }));

  return (
    <figure aria-label="Évolution de la moyenne de l'élève et de sa classe" className="min-w-0">
      <div className="chart-header">
        <div className="chart-header-left">
          <div className="card-title">Progression scolaire</div>
          <div className="card-subtitle">Élève et moyenne de classe par période</div>
        </div>
      </div>
      <div className="chart-area min-w-0">
        <div className="h-[250px] w-full min-w-0 sm:h-[290px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 12, right: 18, left: -20, bottom: 3 }}>
              <CartesianGrid stroke="var(--border-color-light, #e6edf3)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="periode" tick={{ fill: "var(--text-muted, #64748b)", fontSize: 11 }} />
              <YAxis domain={[0, 20]} ticks={[0, 5, 10, 15, 20]} tick={{ fill: "var(--text-muted, #64748b)", fontSize: 11 }} />
              <Tooltip formatter={(v, nom) => [typeof v === "number" ? v.toFixed(2).replace(".", ",") + " /20" : "—", String(nom)]}
                contentStyle={{ background: "var(--bg-surface, #fff)", border: "1px solid var(--border-color, #e2e8f0)", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Line type="monotone" dataKey="eleve" name="Élève" stroke="var(--primary, #1abb9c)" strokeWidth={2.5}
                dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls={false} />
              <Line type="monotone" dataKey="classe" name="Classe" stroke="var(--blue, #3b82f6)"
                strokeDasharray="5 4" strokeWidth={1.7} dot={{ r: 3 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <figcaption className="card-footer text-xs">Échelle sur 20. Une période sans résultat reste vide.</figcaption>
    </figure>
  );
}
