/**
 * Recette de la route de notification : bornes, file, déduplication, accusés.
 *
 * CE SCRIPT ENVOIE DE VRAIS MESSAGES WHATSAPP
 * --------------------------------------------
 * Aux deux identités dirigeantes, et à elles seules. Le contenu est le message
 * de test figé, identifié comme tel dès sa première ligne et explicitement
 * dépourvu de donnée scolaire. Aucun parent n'est joint, aucun élève n'est
 * nommé.
 *
 * « ACCEPTÉ » N'EST PAS « LIVRÉ »
 * -------------------------------
 * C'est la limite que ce script ne peut pas franchir, et il vaut mieux le dire
 * que le masquer. La passerelle accuse la PRISE EN CHARGE d'un message ; la
 * réception sur un téléphone ne peut être constatée que sur ce téléphone.
 * Le script prouve donc tout ce qui précède la livraison — et nomme ce qui
 * reste à vérifier de visu.
 *
 * L'ORDRE DES ÉPREUVES N'EST PAS ARBITRAIRE
 * -----------------------------------------
 * Les refus passent AVANT l'envoi. Une fois un message accepté, la limitation
 * de fréquence empêche d'éprouver quoi que ce soit d'autre pendant dix
 * minutes : tester les refus après l'envoi reviendrait à les tester contre un
 * verrou de fréquence, et non contre les bornes qu'on veut prouver.
 *
 *   node agent/scripts/recette-notification.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const lire = (f, k) =>
  (readFileSync(resolve(racine, f), "utf8").match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]
    ?.trim()
    .replace(/^["']|["']$/g, "");

const AGENT = process.env.BASE_AGENT ?? "http://se-kna02.altare.global:25278";
const JETON = lire("web/.env.local", "AGENT_SERVICE_TOKEN");
if (!JETON) {
  console.error("ARRET : AGENT_SERVICE_TOKEN introuvable.");
  process.exit(1);
}

const sante = async () => {
  const r = await fetch(`${AGENT}/sante`, { signal: AbortSignal.timeout(25_000) });
  return r.json();
};

async function declencher({ jeton = JETON, cible } = {}) {
  const entetes = {};
  if (jeton) entetes.authorization = `Bearer ${jeton}`;
  const q = cible === undefined ? "" : `?cible=${encodeURIComponent(cible)}`;
  try {
    const r = await fetch(`${AGENT}/diagnostic/notification${q}`, {
      method: "POST",
      headers: entetes,
      signal: AbortSignal.timeout(60_000),
    });
    return { status: r.status, j: await r.json().catch(() => null) };
  } catch (e) {
    return { status: 0, j: null, erreur: e.message };
  }
}

let echecs = 0;
const controler = (libelle, attendu, obtenu, detail = "") => {
  const ok = obtenu.status === attendu;
  console.log(
    `  ${ok ? "OK   " : "ECHEC"} ${libelle}\n          attendu ${attendu}, obtenu ${obtenu.status || obtenu.erreur}` +
      (detail ? ` — ${detail}` : "") +
      (obtenu.j?.message ? `\n          « ${obtenu.j.message} »` : ""),
  );
  if (!ok) echecs += 1;
  return ok;
};

// --- 0. La session doit être prête -----------------------------------------
console.log(`agent : ${AGENT}\n`);
console.log("=== 0. La session WhatsApp est-elle prete ? ===");
const avant = await sante();
console.log(`    whatsapp = ${avant.whatsapp}   instance = ${avant.verrou?.instance}   file = ${JSON.stringify(avant.notifications)}`);
if (avant.whatsapp !== "ready") {
  console.log("\nARRET : la session n'est pas « ready ». Un envoi serait mis en file sans");
  console.log("        pouvoir partir, et la recette mesurerait l'attente, pas la livraison.");
  process.exit(1);
}
console.log("  OK    session prete");

// --- 1. Les refus, AVANT tout envoi ----------------------------------------
console.log("\n=== 1. Les bornes, eprouvees avant le premier envoi ===");
controler("aucun jeton", 401, await declencher({ jeton: null, cible: "SUPER_ADMIN" }));
controler(
  "jeton errone de MEME longueur",
  401,
  await declencher({ jeton: "x".repeat(JETON.length), cible: "SUPER_ADMIN" }),
  "comparaison a temps constant",
);
console.log("\n    Aucune valeur fournie ne doit devenir un destinataire :");
for (const cible of ["23599999999@c.us", "PARENT", "__proto__", "constructor", "SUPER_ADMIN;DIRECTION", ""]) {
  controler(`cible « ${cible || "(vide)"} »`, 400, await declencher({ cible }));
}

const apresRefus = await sante();
const bouge =
  JSON.stringify(apresRefus.notifications) !== JSON.stringify(avant.notifications);
console.log(
  `  ${bouge ? "ECHEC" : "OK   "} la file n'a PAS bouge pendant les refus — ${JSON.stringify(apresRefus.notifications)}`,
);
if (bouge) echecs += 1;

// --- 2. L'envoi réel, aux deux identités -----------------------------------
console.log("\n=== 2. Envoi reel aux DEUX identites dirigeantes ===");
const envoi = await declencher({ cible: "tous" });
controler("cible « tous »", 200, envoi);
if (envoi.j?.resultats) {
  for (const r of envoi.j.resultats) console.log(`          ${r.cible} -> ${r.etat}${r.detail ? ` (${r.detail})` : ""}`);
}
const accep = (envoi.j?.resultats ?? []).filter((r) => r.etat === "accepte_par_la_passerelle");
if (accep.length === 2) {
  console.log("  OK    deux prises en charge, une par identite");
} else {
  console.log(`  ECHEC ${accep.length} prise(s) en charge au lieu de 2`);
  echecs += 1;
}
if (envoi.j?.avertissement) console.log(`          avertissement : « ${envoi.j.avertissement} »`);

// --- 3. La file persistante a-t-elle enregistré ? --------------------------
console.log("\n=== 3. La file persistante a-t-elle enregistre les envois ? ===");
const apres = await sante();
const d = (c) => (apres.notifications?.[c] ?? 0) - (avant.notifications?.[c] ?? 0);
console.log(`    avant : ${JSON.stringify(avant.notifications)}`);
console.log(`    apres : ${JSON.stringify(apres.notifications)}`);
if (d("total") === 2) {
  console.log("  OK    deux entrees de plus dans la file");
} else {
  console.log(`  ECHEC la file compte ${d("total")} entree(s) de plus au lieu de 2`);
  echecs += 1;
}
if (d("envoyee") === 2) {
  console.log("  OK    les deux sont marquees envoyees par la passerelle");
} else {
  console.log(`  NOTE  ${d("envoyee")} marquee(s) envoyee(s), ${apres.notifications?.en_attente ?? 0} en attente`);
  console.log("        un envoi encore en attente n'est pas un echec : la file reessaie.");
}
if ((apres.notifications?.abandonnee ?? 0) > (avant.notifications?.abandonnee ?? 0)) {
  console.log("  ECHEC un envoi a ete ABANDONNE apres ses tentatives");
  echecs += 1;
}

// --- 4. Déduplication et limitation de fréquence ---------------------------
console.log("\n=== 4. Un second appel immediat ne doit pas renvoyer ===");
const second = await declencher({ cible: "tous" });
controler("rappel immediat", 200, second);
const limites = (second.j?.resultats ?? []).filter((r) => r.etat === "limite" || r.etat === "doublon_ignore");
for (const r of second.j?.resultats ?? []) console.log(`          ${r.cible} -> ${r.etat}${r.detail ? ` (${r.detail})` : ""}`);
if (limites.length === 2) {
  console.log("  OK    les deux sont retenues — ni doublon, ni campagne possible");
} else {
  console.log(`  ECHEC ${limites.length} retenue(s) au lieu de 2 : un doublon a pu partir`);
  echecs += 1;
}
const apresSecond = await sante();
if ((apresSecond.notifications?.total ?? 0) === (apres.notifications?.total ?? 0)) {
  console.log("  OK    la file n'a pas grossi : rien n'a ete confie une seconde fois");
} else {
  console.log(`  ECHEC la file a grossi de ${(apresSecond.notifications?.total ?? 0) - (apres.notifications?.total ?? 0)}`);
  echecs += 1;
}

// --- 5. Ce que ce script NE peut pas prouver -------------------------------
console.log("\n=== 5. Ce qui reste a constater de visu ===");
console.log("    « accepte_par_la_passerelle » signifie que WhatsApp a pris le message");
console.log("    en charge. La reception sur un telephone ne se constate que sur ce");
console.log("    telephone. A verifier sur les deux appareils :");
console.log("      - un message commencant par « [TEST TECHNIQUE — Lycee Guergne La Renaissance] »");
console.log("      - UN SEUL message, malgre les deux appels de cette recette");
console.log("      - aucun nom d'eleve, aucun chiffre scolaire dans son contenu");

console.log(`\n=== ${echecs === 0 ? "TOUTES LES BORNES TIENNENT" : `${echecs} CONTROLE(S) EN ECHEC`} ===`);
process.exitCode = echecs ? 1 : 0;
