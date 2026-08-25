"use server";

import { sql } from "drizzle-orm";

import { sessionCourante } from "@/server/auth/session";
import { db } from "@/server/db";
import { peut } from "@/server/guard";

/**
 * Recherche globale depuis la palette (E-39).
 *
 * CE QU'ON CHERCHE DANS UN LOGICIEL D'ÉCOLE, C'EST UN ÉLÈVE
 * -----------------------------------------------------------
 * La palette existait déjà, mais ne cherchait que des noms de pages — c'est-à-
 * dire la chose qu'on trouve déjà dans le menu de gauche. Le geste réel est :
 * un parent au téléphone dit un nom, il faut ouvrir le dossier en trois
 * secondes. Aujourd'hui cela demande d'aller sur la page Élèves, de taper dans
 * le filtre, d'attendre le rechargement.
 *
 * LE MATRICULE COMPTE AUTANT QUE LE NOM
 * --------------------------------------
 * Il figure sur le reçu que le parent a en main et sur le bulletin. C'est
 * souvent la seule chose qu'il sait épeler correctement.
 *
 * LES DROITS SONT VÉRIFIÉS PAR CATÉGORIE
 * ---------------------------------------
 * Un surveillant cherche des élèves, pas des salaires ni des enseignants. Une
 * palette qui ignorerait les droits ferait de la recherche une porte dérobée
 * vers ce que les écrans refusent d'afficher.
 *
 * LA RECHERCHE EST INSENSIBLE AUX ACCENTS
 * ----------------------------------------
 * « Grace » doit trouver « Grâce », et « Elie » doit trouver « Élie ». Sans
 * `unaccent`, la moitié des noms tchadiens deviendrait introuvable pour qui
 * tape sans accents — c'est-à-dire à peu près tout le monde au guichet.
 */

export interface ResultatRecherche {
  type: "eleve" | "enseignant" | "classe";
  id: string;
  libelle: string;
  detail: string | null;
  url: string;
}

export async function rechercheGlobale(terme: string): Promise<ResultatRecherche[]> {
  const q = terme.trim();
  // Deux caractères ne discriminent rien : la requête remonterait la moitié du
  // fichier et l'utilisateur lirait une liste au hasard.
  if (q.length < 2) return [];

  const principal = await sessionCourante();
  if (!principal) return [];

  const [voitEleves, voitPersonnel, voitClasses] = await Promise.all([
    peut(principal, "eleve:lire"),
    peut(principal, "utilisateur:creer"),
    peut(principal, "classe:lire"),
  ]);

  const motif = `%${q}%`;
  const resultats: ResultatRecherche[] = [];

  if (voitEleves) {
    const r = await db.execute<{
      id: string;
      nom: string;
      matricule: string;
      classe: string | null;
      statut: string;
    }>(sql`
      SELECT e.id, e.nom || ' ' || e.prenom AS nom, e.matricule,
             c.libelle AS classe, e.statut::text
        FROM eleves e
        LEFT JOIN inscriptions i ON i.eleve_id = e.id AND i.active
        LEFT JOIN classes c      ON c.id = i.classe_id
       WHERE unaccent(e.nom || ' ' || e.prenom) ILIKE unaccent(${motif})
          OR e.matricule ILIKE ${motif}
       ORDER BY (e.matricule ILIKE ${motif}) DESC, e.nom, e.prenom
       LIMIT 8
    `);
    for (const x of r.rows) {
      resultats.push({
        type: "eleve",
        id: x.id,
        libelle: x.nom,
        detail: [x.matricule, x.classe ?? "non affecté"].join(" · "),
        url: `/dashboard/eleves/${x.id}`,
      });
    }
  }

  if (voitPersonnel) {
    const r = await db.execute<{
      id: string;
      nom: string;
      matricule: string;
      specialite: string | null;
    }>(sql`
      SELECT en.id, en.nom || ' ' || en.prenom AS nom, en.matricule, en.specialite
        FROM enseignants en
       WHERE unaccent(en.nom || ' ' || en.prenom) ILIKE unaccent(${motif})
          OR en.matricule ILIKE ${motif}
       ORDER BY en.nom, en.prenom
       LIMIT 5
    `);
    for (const x of r.rows) {
      resultats.push({
        type: "enseignant",
        id: x.id,
        libelle: x.nom,
        detail: [x.matricule, x.specialite].filter(Boolean).join(" · ") || null,
        url: `/dashboard/personnel?enseignant=${x.id}`,
      });
    }
  }

  if (voitClasses) {
    const r = await db.execute<{ id: string; libelle: string; effectif: number }>(sql`
      SELECT c.id, c.libelle,
             (SELECT count(*) FROM inscriptions i
               WHERE i.classe_id = c.id AND i.active)::int AS effectif
        FROM classes c
        JOIN annees_scolaires a ON a.id = c.annee_id AND a.est_courante
       WHERE unaccent(c.libelle) ILIKE unaccent(${motif})
          OR c.code ILIKE ${motif}
       ORDER BY c.libelle
       LIMIT 5
    `);
    for (const x of r.rows) {
      resultats.push({
        type: "classe",
        id: x.id,
        libelle: x.libelle,
        detail: `${x.effectif} élève(s)`,
        url: `/dashboard/eleves?classe=${x.id}`,
      });
    }
  }

  return resultats;
}
