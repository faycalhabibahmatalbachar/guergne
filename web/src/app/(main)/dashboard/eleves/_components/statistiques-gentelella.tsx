import { statTile } from "@/vendor/gentelella-v4/markup.js";
import styles from "./statistiques-gentelella.module.css";

type Couleur = "teal" | "blue" | "yellow" | "red" | "purple";
export type StatistiqueEleves = {
  titre: string;
  valeur: number;
  detail: string;
  icone: "effectifs" | "nouveaux" | "incomplets" | "suspendus" | "reinscriptions";
  couleur: Couleur;
};

const icones: Record<StatistiqueEleves["icone"], string> = {
  effectifs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="9" cy="7" r="4"/><path d="M1 21v-2a5 5 0 015-5h6a5 5 0 015 5v2M17 3a4 4 0 010 8M19 14a5 5 0 014 5v2"/></svg>',
  nouveaux: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="9" cy="7" r="4"/><path d="M1 21v-2a5 5 0 015-5h6a5 5 0 015 5v2M19 9v8m-4-4h8"/></svg>',
  incomplets: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 2h9l4 4v16H6zM14 2v5h5M9 11h7M9 15h5"/></svg>',
  suspendus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3 2 21h20zM12 9v5m0 3v1"/></svg>',
  reinscriptions: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m3 10 9-5 9 5-9 5zM6 12v5c4 2 8 2 12 0v-5"/></svg>',
};

/** Widgets statTile() originaux Gentelella v4, code MIT vendored.
 * Toutes les chaînes dynamiques sont échappées par Gentelella.
 */
export function StatistiquesGentelellaEleves({ statistiques }: { statistiques: StatistiqueEleves[] }) {
  return (
    <section aria-label="Statistiques élèves" className={"gentelella-v4 " + styles.grille}>
      {statistiques.map(stat => (
        <div key={stat.icone} className={styles.tuile}
          dangerouslySetInnerHTML={{
            __html: statTile({
              label: stat.titre,
              value: stat.valeur.toLocaleString("fr-FR"),
              subtext: stat.detail,
              color: stat.couleur,
              iconHtml: icones[stat.icone],
            }),
          }}
        />
      ))}
    </section>
  );
}
