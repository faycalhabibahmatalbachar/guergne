#!/usr/bin/env node
/**
 * Inventaire des doublons d'absences — LECTURE SEULE.
 *
 * POURQUOI CET INVENTAIRE AVANT TOUTE CORRECTION
 * -----------------------------------------------
 * La table `absences` n'a jamais eu de contrainte d'unicité. La production
 * porte donc des groupes de lignes identiques (même inscription, même date,
 * même séance/créneau). La migration 0038 pose cette contrainte et ÉCHOUERA
 * tant que ces groupes existent — volontairement : chaque ligne en surnombre
 * a fait partir une notification au tuteur via le trigger
 * `absences_notification` de 0016, et a doublé le volume horaire reporté sur
 * le bulletin. Supprimer ces lignes sans arbitrage humain reviendrait à
 * réécrire l'assiduité d'élèves réels.
 *
 * Ce script ne corrige RIEN. Il dit ce qu'il y a, pour que la vie scolaire
 * puisse décider groupe par groupe.
 *
 * AUCUN ORDRE D'ÉCRITURE
 * -----------------------
 * Pas de DELETE, pas d'UPDATE, pas d'INSERT, pas de DDL. La session est en
 * plus placée en `READ ONLY` par la base elle-même : si une requête d'écriture
 * se glissait ici un jour, PostgreSQL la refuserait au lieu de l'exécuter.
 *
 * AUCUN NOM D'ÉLÈVE EN CLAIR
 * ---------------------------
 * La sortie peut être collée dans un rapport ou un fil de discussion. Un
 * matricule et une classe suffisent à retrouver le dossier dans la plateforme ;
 * un nom complet, lui, sort de la plateforme et n'y rentre plus.
 *
 *   node agent/scripts/inventaire-doublons-absences.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Lecture d'une clé dans un fichier d'environnement, sans dépendance externe. */
const lire = (fichier, cle) => {
  const abs = resolve(racine, fichier);
  if (!existsSync(abs)) return undefined;
  const m = readFileSync(abs, "utf8")
    .replace(/^﻿/, "")
    .match(new RegExp(`^\\s*${cle}\\s*=\\s*(.*)$`, "m"));
  return m?.[1]?.trim().replace(/^["']|["']$/g, "");
};

const url =
  process.env.DATABASE_URL ??
  lire("web/.env.local", "DATABASE_URL") ??
  lire("web/.env.local", "DATABASE_URL_UNPOOLED");

if (!url) {
  console.error("ARRET : DATABASE_URL introuvable dans web/.env.local.");
  process.exit(1);
}

let hote = "(inconnu)";
try {
  hote = new URL(url).hostname;
} catch {
  /* une URL illisible sera de toute façon refusée à la connexion */
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

// Le garde-fou le plus solide n'est pas une relecture du code : c'est la base
// qui refuse d'écrire. Toute la suite se déroule dans cette transaction.
await client.query("BEGIN TRANSACTION READ ONLY");
console.log(`[source] ${hote} — session READ ONLY`);

const masquer = (texte) => {
  const s = String(texte ?? "");
  if (s.length <= 4) return "****";
  return `${s.slice(0, 3)}${"*".repeat(Math.max(3, s.length - 4))}${s.slice(-1)}`;
};

/**
 * Le regroupement reprend exactement la clé de 0038, COALESCE compris : deux
 * NULL doivent compter comme égaux, sinon l'inventaire ne verrait aucun des
 * doublons que la contrainte, elle, bloquera.
 */
const SENTINELLE = "'00000000-0000-0000-0000-000000000000'::uuid";
const { rows: groupes } = await client.query(`
  WITH doublons AS (
    -- to_char et non la colonne brute : le pilote rendrait un objet Date JS,
    -- que l'affichage transformerait en « Thu Oct 02 » — illisible et sans année.
    SELECT a.inscription_id,
           to_char(a.date_absence, 'YYYY-MM-DD') AS date_absence,
           COALESCE(a.seance_id,  ${SENTINELLE}) AS seance,
           COALESCE(a.creneau_id, ${SENTINELLE}) AS creneau,
           COUNT(*)                                       AS nb_lignes,
           COUNT(*) FILTER (WHERE a.parents_notifies)     AS nb_notifiees,
           SUM(a.nb_heures)                               AS heures_cumulees,
           COUNT(DISTINCT a.statut)                       AS nb_statuts,
           COUNT(DISTINCT a.saisie_par)                   AS nb_saisissants,
           MIN(a.cree_le)                                 AS premiere_saisie,
           MAX(a.cree_le)                                 AS derniere_saisie
      FROM absences a
     GROUP BY a.inscription_id, a.date_absence, seance, creneau
    HAVING COUNT(*) > 1
  )
  SELECT d.*,
         e.matricule,
         c.code      AS classe_code,
         c.libelle   AS classe_libelle,
         an.libelle  AS annee
    FROM doublons d
    JOIN inscriptions i    ON i.id = d.inscription_id
    JOIN eleves e          ON e.id = i.eleve_id
    JOIN classes c         ON c.id = i.classe_id
    JOIN annees_scolaires an ON an.id = i.annee_id
   ORDER BY d.nb_lignes DESC, d.date_absence, e.matricule
`);

const { rows: totaux } = await client.query("SELECT COUNT(*)::int AS n FROM absences");

if (groupes.length === 0) {
  console.log("\nAucun doublon : la migration 0038 peut être appliquée.");
} else {
  const surnombre = groupes.reduce((s, g) => s + (Number(g.nb_lignes) - 1), 0);
  const notifies = groupes.filter((g) => Number(g.nb_notifiees) > 0);

  console.log(`\n${groupes.length} groupe(s) de doublons — ${surnombre} ligne(s) en surnombre sur ${totaux[0].n} absences.`);
  console.log(`${notifies.length} groupe(s) ont au moins une ligne deja notifiee aux tuteurs.\n`);

  console.log("matricule      classe        date         lignes  notifiees  heures  statuts  saisissants");
  console.log("-".repeat(92));
  for (const g of groupes) {
    console.log(
      [
        masquer(g.matricule).padEnd(14),
        String(g.classe_code ?? g.classe_libelle ?? "?").padEnd(13),
        String(g.date_absence).slice(0, 10).padEnd(12),
        String(g.nb_lignes).padStart(6),
        String(g.nb_notifiees).padStart(10),
        String(g.heures_cumulees).padStart(7),
        String(g.nb_statuts).padStart(8),
        String(g.nb_saisissants).padStart(12),
      ].join(" "),
    );
  }

  // Les colonnes « statuts » et « saisissants » décident de la difficulté de
  // l'arbitrage : un groupe à un seul statut et un seul saisissant est un rejeu
  // technique ; plusieurs statuts veulent dire qu'une ligne a été justifiée et
  // l'autre pas, et choisir laquelle conserver change le dossier de l'élève.
  const divergents = groupes.filter((g) => Number(g.nb_statuts) > 1);
  console.log(`\n${divergents.length} groupe(s) ont des statuts de justification DIVERGENTS : arbitrage obligatoire.`);
  console.log(`${groupes.length - divergents.length} groupe(s) sont homogenes et ressemblent a un rejeu de saisie.`);
}

await client.query("ROLLBACK");
await client.end();
