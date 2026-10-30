"use client";

import { statTile } from "@/vendor/gentelella-v4/markup.js";

import styles from "./indicateurs-gentelella.module.css";
import { RaccourciOnglet } from "./raccourci-onglet";

export type StatDossier = {
  onglet: "scolarite" | "documents" | "finances" | "historique";
  libelle: string;
  valeur: string;
  detail?: string;
  couleur: "teal" | "blue" | "green" | "yellow" | "purple";
};

const icones: Record<StatDossier["onglet"], string> = {
  scolarite:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m2 10 10-5 10 5-10 5-10-5Z"/><path d="M6 12v5c4 3 8 3 12 0v-5"/><path d="M22 10v7"/></svg>',
  documents:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="15" height="18" x="5" y="3" rx="2"/><path d="M9 8h7M9 12h7M9 16h4"/></svg>',
  finances:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M7 15h4"/></svg>',
  historique:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
};

/**
 * Gentelella v4 (MIT) : le HTML de chaque carte provient réellement de
 * statTile() dans src/vendor/gentelella-v4/markup.js.
 * Les champs de l'élève sont échappés par cette fonction upstream.
 * L'icône est exclusivement une constante SVG de confiance ci-dessus.
 *
 * Le bouton Radix existant permet de changer l'onglet, sans rechargement
 * de page ni modification des contrôles d'accès.
 */
export function IndicateursDossierGentelella({
  indicateurs,
  className = "",
}: {
  indicateurs: StatDossier[];
  className?: string;
}) {
  return (
    <div
      className={"gentelella-v4 " + styles.grille + " " + className}
      aria-label="Indicateurs du dossier"
      data-template="gentelella-v4"
    >
      {indicateurs.map((indicateur) => (
        <RaccourciOnglet key={indicateur.onglet} onglet={indicateur.onglet} className={styles.bouton}>
          <span
            className={styles.contenu}
            dangerouslySetInnerHTML={{
              __html: statTile({
                label: indicateur.libelle,
                value: indicateur.valeur,
                subtext: indicateur.detail,
                color: indicateur.couleur,
                iconHtml: icones[indicateur.onglet],
              }),
            }}
          />
        </RaccourciOnglet>
      ))}
    </div>
  );
}
