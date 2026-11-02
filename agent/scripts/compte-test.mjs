/**
 * Crée un compte de recette DANS LA BRANCHE DE TEST, et nulle part ailleurs.
 *
 * POURQUOI CE SCRIPT EXISTE
 * --------------------------
 * La liste blanche est provisionnée à partir des comptes de PRODUCTION, mais
 * les démonstrations de bout en bout tournent sur la branche Neon de test, qui
 * ignore ces comptes. Le garde refuse alors un acteur inconnu — bon réflexe,
 * mais la chaîne complète (identité → permission → périmètre → données) reste
 * de ce fait non démontrée pour cet acteur.
 *
 * Le compte créé ici lève cet obstacle sans rien toucher à la plateforme réelle.
 *
 * GARANTIES
 * ---------
 *   - refus catégorique d'écrire ailleurs que sur la branche de test ;
 *   - le nom et l'adresse portent une marque `ZZTEST` et un domaine
 *     `example.invalid`, pour qu'aucun compte de recette ne passe jamais pour
 *     un compte réel ;
 *   - aucun mot de passe n'est posé : ce compte ne peut pas se connecter au
 *     portail, il ne sert qu'à l'API agent via `x-acteur-id` ;
 *   - idempotent : relancé, il réutilise le compte existant.
 *
 *   node agent/scripts/compte-test.mjs --role DIRECTION
 *   node agent/scripts/compte-test.mjs --role DIRECTION --id <uuid de production>
 *   node agent/scripts/compte-test.mjs --lister
 *   node agent/scripts/compte-test.mjs --retirer
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const lire = (f, k) => {
  const p = resolve(racine, f);
  if (!existsSync(p)) return undefined;
  return (readFileSync(p, "utf8").match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]
    ?.trim()
    .replace(/^["']|["']$/g, "");
};
const hote = (v) => {
  try {
    return new URL(String(v)).hostname;
  } catch {
    return null;
  }
};
const arg = (nom) => {
  const i = process.argv.indexOf(nom);
  return i === -1 ? null : (process.argv[i + 1] ?? "").trim() || null;
};

// --- Garde-fou : la branche de test, et rien d'autre ------------------------
const urlTest = lire("web/.env.development.local", "DATABASE_URL");
const hoteAttendu = hote(lire("web/.env.test.local", "DATABASE_URL_TEST"));
const hoteCible = hote(urlTest);
const hoteProd = hote(lire("web/.env.local", "DATABASE_URL"));

if (!hoteAttendu) {
  console.error("ARRET : web/.env.test.local introuvable — impossible de savoir quelle base est celle de test.");
  process.exit(1);
}
if (!hoteCible || hoteCible !== hoteAttendu) {
  console.error("ARRET : la surcharge de developpement ne pointe pas sur la branche de test.");
  console.error(`  attendu : ${hoteAttendu}   trouve : ${hoteCible ?? "(absent)"}`);
  process.exit(1);
}
if (hoteCible === hoteProd) {
  console.error("ARRET : la cible est la base de PRODUCTION. Ce script n'y ecrira jamais.");
  process.exit(1);
}
console.log(`[garde] base ciblee : ${hoteCible} (branche de test, distincte de la production)`);

// `ZZTEST` est la convention deja utilisee par les comptes de recette
// precedents : elle rend un compte de test reconnaissable d'un coup d'oeil,
// dans l'annuaire comme dans un journal d'audit.
const MARQUE = "ZZTEST-AGENT";
const ROLES = ["SUPER_ADMIN", "DIRECTION", "CENSEUR", "SURVEILLANT", "SECRETARIAT", "COMPTABLE", "ENSEIGNANT"];

const client = new pg.Client({ connectionString: urlTest });
await client.connect();

try {
  if (process.argv.includes("--lister")) {
    const { rows } = await client.query(
      `select id, email, prenom, nom, role::text as role, actif
         from utilisateurs where nom like $1 order by role`,
      [`${MARQUE}%`],
    );
    console.log(`\n${rows.length} compte(s) de recette dans la branche de test :`);
    for (const r of rows) {
      console.log(`  ${r.role.padEnd(12)} actif=${String(r.actif).padEnd(5)} ${r.prenom} ${r.nom}  id=${r.id}`);
    }
    process.exit(0);
  }

  if (process.argv.includes("--retirer")) {
    const { rowCount } = await client.query(`delete from utilisateurs where nom like $1`, [`${MARQUE}%`]);
    console.log(`[retrait] ${rowCount} compte(s) de recette supprime(s) de la branche de test.`);
    process.exit(0);
  }

  const role = (arg("--role") ?? "DIRECTION").toUpperCase();
  if (!ROLES.includes(role)) {
    console.error(`ARRET : role inconnu « ${role} ». Attendus : ${ROLES.join(", ")}`);
    process.exit(1);
  }
  const idDemande = arg("--id");

  // Reutiliser plutot que multiplier : chaque relance doit rendre le meme
  // compte, sinon la branche de test se remplit de doublons.
  const existant = idDemande
    ? await client.query(`select id, role::text as role, actif, nom from utilisateurs where id = $1`, [idDemande])
    : await client.query(
        `select id, role::text as role, actif, nom from utilisateurs where nom = $1 and role = $2::role_utilisateur`,
        [`${MARQUE}-${role}`, role],
      );

  if (existant.rows.length > 0) {
    const u = existant.rows[0];
    const estTest = String(u.nom).startsWith(MARQUE);
    if (!estTest) {
      // Un identifiant de production reutilise tel quel : on ne touche pas a un
      // compte qui n'a pas ete cree par ce script.
      console.error(`ARRET : l'identifiant ${u.id} existe deja et n'est PAS un compte de recette (${u.nom}).`);
      process.exit(1);
    }
    if (!u.actif || u.role !== role) {
      await client.query(`update utilisateurs set actif = true, role = $2::role_utilisateur, modifie_le = now() where id = $1`, [u.id, role]);
      console.log("[compte] compte de recette existant reactive / role aligne");
    } else {
      console.log("[compte] compte de recette deja present, reutilise");
    }
    console.log(`\n  role : ${role}`);
    console.log(`  id   : ${u.id}`);
    console.log("\n  ACTEUR_ID=" + u.id + "  node agent/scripts/e2e-catalogue.mjs");
    process.exit(0);
  }

  const suffixe = Math.random().toString(36).slice(2, 10);
  const email = `${role.toLowerCase()}.${suffixe}@example.invalid`;
  const { rows } = await client.query(
    `insert into utilisateurs (${idDemande ? "id, " : ""}email, role, nom, prenom, actif, doit_changer_mdp)
     values (${idDemande ? "$5, " : ""}$1, $2::role_utilisateur, $3, $4, true, false)
     returning id`,
    idDemande ? [email, role, `${MARQUE}-${role}`, "Recette", idDemande] : [email, role, `${MARQUE}-${role}`, "Recette"],
  );
  const id = rows[0].id;

  console.log("[compte] compte de recette cree dans la branche de TEST");
  console.log(`\n  role         : ${role}`);
  console.log(`  id           : ${id}`);
  console.log(`  nom          : ${MARQUE}-${role} (marque, donc jamais confondu avec un compte reel)`);
  console.log("  mot de passe : AUCUN — ce compte ne peut pas se connecter au portail");
  console.log(`\n  ACTEUR_ID=${id}  node agent/scripts/e2e-catalogue.mjs`);
  console.log("  retrait : node agent/scripts/compte-test.mjs --retirer");
} finally {
  await client.end();
}
