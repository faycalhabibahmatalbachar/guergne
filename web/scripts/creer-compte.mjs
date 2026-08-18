#!/usr/bin/env node
/**
 * Crée un compte utilisateur réel en base.
 *
 * Il n'existe volontairement AUCUN compte semé par les migrations : un compte
 * par défaut connu de tous (admin/admin) est la première porte d'entrée d'une
 * intrusion. Chaque compte est créé explicitement, avec un mot de passe
 * aléatoire affiché une seule fois et à changer à la première connexion.
 *
 * Usage :
 *   node scripts/creer-compte.mjs --role SUPER_ADMIN --nom HABIB --prenom Faycal \
 *        --email faycal@example.com [--telephone +23566000000] [--mdp motdepasse]
 */

import { randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { hash } from "@node-rs/argon2";
import pg from "pg";

const ICI = path.dirname(fileURLToPath(import.meta.url));

// --- Chargement de .env.local -------------------------------------------------
const envLocal = path.resolve(ICI, "../.env.local");
if (existsSync(envLocal)) {
  for (const ligne of readFileSync(envLocal, "utf8").split("\n")) {
    const m = ligne.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// --- Arguments ----------------------------------------------------------------
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
}

const ROLES = [
  "SUPER_ADMIN", "DIRECTION", "CENSEUR", "SURVEILLANT",
  "SECRETARIAT", "COMPTABLE", "ENSEIGNANT", "PARENT", "ELEVE",
];

const { role, nom, prenom, email, telephone } = args;

if (!role || !ROLES.includes(role)) {
  console.error(`--role est requis, parmi : ${ROLES.join(", ")}`);
  process.exit(1);
}
if (!nom || !prenom) {
  console.error("--nom et --prenom sont requis.");
  process.exit(1);
}
if (!email && !telephone) {
  console.error("Au moins --email ou --telephone est requis.");
  process.exit(1);
}

/**
 * Mot de passe aléatoire lisible : on écarte les caractères ambigus
 * (0/O, 1/l/I) — ce mot de passe est souvent recopié à la main depuis un
 * écran, et une confusion coûte un appel au support.
 */
function motDePasseAleatoire(longueur = 14) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const octets = randomBytes(longueur);
  return Array.from(octets, (o) => alphabet[o % alphabet.length]).join("");
}

const motDePasse = args.mdp ?? motDePasseAleatoire();

// Paramètres OWASP pour Argon2id (19 Mio, 2 passes, parallélisme 1)
const empreinte = await hash(motDePasse, {
  algorithm: 2, // Argon2id
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

try {
  const { rows } = await client.query(
    `INSERT INTO utilisateurs (email, telephone, mot_de_passe_hash, role, nom, prenom, doit_changer_mdp)
     VALUES ($1, $2, $3, $4::role_utilisateur, $5, $6, TRUE)
     RETURNING id, role::text, nom, prenom, email, telephone`,
    [email ?? null, telephone ?? null, empreinte, role, nom, prenom],
  );

  const u = rows[0];
  console.log("\nCompte créé.\n");
  console.log(`  Identifiant : ${u.email ?? u.telephone}`);
  console.log(`  Rôle        : ${u.role}`);
  console.log(`  Nom         : ${u.prenom} ${u.nom}`);
  if (!args.mdp) {
    console.log(`  Mot de passe: ${motDePasse}`);
    console.log("\n  Ce mot de passe n'est affiché qu'une fois et devra être");
    console.log("  changé à la première connexion.\n");
  }
} catch (erreur) {
  if (erreur.code === "23505") {
    console.error("Un compte existe déjà avec cet email ou ce téléphone.");
  } else {
    console.error(`Échec de la création : ${erreur.message}`);
  }
  process.exitCode = 1;
} finally {
  await client.end();
}
