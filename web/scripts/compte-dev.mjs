#!/usr/bin/env node
/**
 * Crée — ou remet en état — le compte parent de développement.
 *
 * POURQUOI CE SCRIPT
 * ------------------
 * Pendant le développement de l'application mobile, on se reconnecte vingt
 * fois par jour : après chaque réinstallation, après chaque effacement des
 * données, après chaque essai de déconnexion. Un code à usage unique envoyé
 * par SMS rend cela impraticable.
 *
 * Le compte créé ici dispose d'un **code permanent** (voir la migration
 * 0023) : jamais consommé, jamais périmé, jamais invalidé par une nouvelle
 * demande. Ce n'est pas une porte dérobée dans le code d'authentification —
 * c'est une ligne de la table `codes_activation`, visible dans la vue
 * `v_acces_permanents`, et qu'un simple DELETE supprime.
 *
 * AVANT LA MISE EN SERVICE RÉELLE
 * -------------------------------
 *     npm run compte:dev -- --retirer
 *
 * Usage :
 *   npm run compte:dev              — crée ou répare le compte
 *   npm run compte:dev -- --retirer — supprime l'accès permanent
 */

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const ICI = path.dirname(fileURLToPath(import.meta.url));

const envLocal = path.resolve(ICI, "../.env.local");
if (existsSync(envLocal)) {
  for (const ligne of readFileSync(envLocal, "utf8").split("\n")) {
    const m = ligne.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const url =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL absente.");
  process.exit(1);
}

const TELEPHONE = process.env.TELEPHONE_DEV ?? "+23591912191";
const CODE = process.env.CODE_DEV ?? "123456";
const RETIRER = process.argv.includes("--retirer");

/** Même empreinte que `web/src/server/auth/mobile.ts` — SHA-256, jamais le code en clair. */
const empreinte = (valeur) => createHash("sha256").update(valeur).digest("hex");

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const q = (texte, valeurs = []) => client.query(texte, valeurs);
const un = async (texte, valeurs = []) => (await q(texte, valeurs)).rows[0];

try {
  if (RETIRER) {
    const r = await q(`DELETE FROM codes_activation WHERE telephone = $1 AND permanent`, [TELEPHONE]);
    console.log(`${r.rowCount} accès permanent(s) retiré(s) pour ${TELEPHONE}.`);
    console.log("Le compte parent lui-même est conservé : il redevient un compte ordinaire.");
    await client.end();
    process.exit(0);
  }

  await q("BEGIN");

  // --- Le tuteur ------------------------------------------------------------
  let tuteur = await un(`SELECT id, utilisateur_id, nom, prenom FROM tuteurs WHERE telephone = $1`, [
    TELEPHONE,
  ]);

  if (!tuteur) {
    tuteur = await un(
      `INSERT INTO tuteurs (nom, prenom, sexe, telephone, profession, quartier, accepte_sms, donnees_semees)
       VALUES ('RECETTE', 'Parent', 'M', $1, 'Développement', 'N''Djamena', FALSE, TRUE)
       RETURNING id, utilisateur_id, nom, prenom`,
      [TELEPHONE],
    );
    console.log(`Tuteur créé : ${tuteur.id}`);
  }

  // --- Le compte utilisateur ------------------------------------------------
  let utilisateurId = tuteur.utilisateur_id;
  if (!utilisateurId) {
    const existant = await un(`SELECT id FROM utilisateurs WHERE telephone = $1`, [TELEPHONE]);
    if (existant) {
      utilisateurId = existant.id;
    } else {
      const compte = await un(
        `INSERT INTO utilisateurs (telephone, role, nom, prenom, mot_de_passe_hash, donnees_semees)
         VALUES ($1, 'PARENT', $2, $3, NULL, TRUE)
         RETURNING id`,
        [TELEPHONE, tuteur.nom, tuteur.prenom],
      );
      utilisateurId = compte.id;
    }
    await q(`UPDATE tuteurs SET utilisateur_id = $1 WHERE id = $2`, [utilisateurId, tuteur.id]);
    console.log(`Compte utilisateur : ${utilisateurId}`);
  }

  await q(`UPDATE utilisateurs SET actif = TRUE WHERE id = $1`, [utilisateurId]);

  // --- Les enfants ----------------------------------------------------------
  //
  // Un compte parent sans enfant n'affiche que l'écran « aucun enfant
  // rattaché » : inutile pour développer. On rattache donc deux élèves de
  // classes différentes, ce qui exerce aussi le sélecteur de fratrie —
  // le cas que le compte à un seul enfant ne permet pas de tester.
  const dejaRattaches = Number(
    (await un(`SELECT count(*)::int AS n FROM eleve_tuteur WHERE tuteur_id = $1`, [tuteur.id])).n,
  );

  if (dejaRattaches === 0) {
    const eleves = (
      await q(
        `SELECT e.id, e.nom, e.prenom, c.libelle AS classe
           FROM eleves e
           JOIN inscriptions i ON i.eleve_id = e.id AND i.active
           JOIN classes c ON c.id = i.classe_id
           JOIN annees_scolaires a ON a.id = i.annee_id AND a.est_courante
          WHERE EXISTS (SELECT 1 FROM bulletins b
                         WHERE b.inscription_id = i.id AND b.est_publie)
          ORDER BY c.libelle, e.nom
          LIMIT 2`,
      )
    ).rows;

    for (const eleve of eleves) {
      // Ni principal, ni responsable financier : ces deux rôles sont uniques
      // par élève et déjà tenus par le vrai tuteur. Le compte de
      // développement s'ajoute, il ne prend la place de personne.
      await q(
        `INSERT INTO eleve_tuteur (eleve_id, tuteur_id, lien, est_principal, est_responsable_financier)
         VALUES ($1, $2, 'TUTEUR'::lien_parente, FALSE, FALSE)`,
        [eleve.id, tuteur.id],
      );
      console.log(`  rattaché : ${eleve.prenom} ${eleve.nom} — ${eleve.classe}`);
    }
  }

  // --- Le code permanent ----------------------------------------------------
  await q(`DELETE FROM codes_activation WHERE telephone = $1 AND permanent`, [TELEPHONE]);
  await q(
    `INSERT INTO codes_activation (telephone, code_hash, expire_le, permanent)
     VALUES ($1, $2, now() + INTERVAL '10 years', TRUE)`,
    [TELEPHONE, empreinte(CODE)],
  );

  await q("COMMIT");

  const bilan = await un(
    `SELECT (SELECT count(*)::int FROM eleve_tuteur WHERE tuteur_id = $1) AS enfants`,
    [tuteur.id],
  );

  console.log("\n===========================================================");
  console.log("  COMPTE PARENT DE DÉVELOPPEMENT");
  console.log("===========================================================");
  console.log(`  Téléphone : ${TELEPHONE}`);
  console.log(`  Code      : ${CODE}   (permanent, ne s'épuise pas)`);
  console.log(`  Enfants   : ${bilan.enfants}`);
  console.log("===========================================================");
  console.log("\nDans l'application, saisir le numéro SANS l'indicatif : "
    + TELEPHONE.replace("+235", ""));
  console.log("puis « J'ai déjà un code » et taper " + CODE + ".");
  console.log("\nÀ retirer avant la mise en service : npm run compte:dev -- --retirer");
} catch (erreur) {
  await q("ROLLBACK");
  console.error("\nÉchec, rien n'a été écrit :", erreur.message);
  if (erreur.detail) console.error("Détail :", erreur.detail);
  await client.end();
  process.exit(1);
}

await client.end();
