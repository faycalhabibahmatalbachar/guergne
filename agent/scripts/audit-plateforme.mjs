/**
 * Extraction de l'inventaire RÉEL de la plateforme guergne.
 *
 * Ce script ne devine rien : il lit le code source et en extrait les actions
 * serveur, les routes d'API, les services de domaine et les permissions
 * effectivement exigées (`requirePermission("…")` / `exigerPermissionPour`).
 * Il écrit ensuite les documents d'inventaire.
 *
 *   node agent/scripts/audit-plateforme.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const web = resolve(racine, "web/src");

/** Parcours récursif des fichiers .ts/.tsx. */
function fichiers(dir, acc = []) {
  for (const nom of readdirSync(dir)) {
    const p = resolve(dir, nom);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (nom === "node_modules" || nom === "generated" || nom.startsWith(".")) continue;
      fichiers(p, acc);
    } else if (/\.tsx?$/.test(nom)) {
      acc.push(p);
    }
  }
  return acc;
}

const tous = fichiers(web);
const rel = (p) => relative(racine, p).split(sep).join("/");

/** Permissions exigées dans un fichier. */
const permsDe = (src) => [
  ...new Set([...src.matchAll(/requirePermission\(\s*"([^"]+)"/g)].map((m) => m[1])),
  ...new Set([...src.matchAll(/exigerPermissionPour\([^,]+,\s*"([^"]+)"/g)].map((m) => m[1])),
  ...new Set([...src.matchAll(/exigerPage\(\s*"([^"]+)"/g)].map((m) => m[1])),
];

// ---------------------------------------------------------------------------
// 1. Actions serveur
// ---------------------------------------------------------------------------
const actions = [];
for (const f of tous) {
  const src = readFileSync(f, "utf8");
  if (!/^\s*["']use server["']/m.test(src)) continue;
  const exports_ = [...src.matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => m[1]);
  if (exports_.length === 0) continue;
  // Permission associée : celle citée dans le corps de la fonction.
  const parFonction = {};
  for (const nom of exports_) {
    const i = src.indexOf(`export async function ${nom}`);
    const fin = src.indexOf("\nexport ", i + 1);
    const corps = src.slice(i, fin === -1 ? undefined : fin);
    parFonction[nom] = permsDe(corps);
  }
  actions.push({ fichier: rel(f), fonctions: parFonction });
}

// ---------------------------------------------------------------------------
// 2. Routes d'API
// ---------------------------------------------------------------------------
const routes = [];
for (const f of tous) {
  if (!/[\\/]api[\\/].*route\.tsx?$/.test(f)) continue;
  const src = readFileSync(f, "utf8");
  const methodes = [...src.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/g)].map((m) => m[1]);
  const chemin = rel(f).replace(/^web\/src\/app/, "").replace(/\/route\.tsx?$/, "");
  routes.push({ chemin, methodes, permissions: permsDe(src), fichier: rel(f) });
}

// ---------------------------------------------------------------------------
// 3. Services de domaine
// ---------------------------------------------------------------------------
const domaines = [];
for (const f of tous) {
  if (!/[\\/]server[\\/]domain[\\/]/.test(f) || /\.test\.tsx?$/.test(f)) continue;
  const src = readFileSync(f, "utf8");
  const fns = [...src.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1]);
  if (fns.length) domaines.push({ fichier: rel(f), fonctions: fns });
}

// ---------------------------------------------------------------------------
// 4. Vocabulaire des permissions et matrice
// ---------------------------------------------------------------------------
const permsSrc = readFileSync(resolve(web, "server/guard/permissions.ts"), "utf8");
const toutesPermissions = [...permsSrc.matchAll(/"([a-z_]+:[a-z_]+)"/g)].map((m) => m[1]);
const rolesListe = [...permsSrc.matchAll(/\|\s*"([A-Z_]+)"/g)].map((m) => m[1]);

const seed = readFileSync(resolve(racine, "db/migrations/0009_seed_referentiel.sql"), "utf8");
const matrice = {};
for (const m of seed.matchAll(/SELECT\s+'([A-Z_]+)',\s*a,\s*'([A-Z_]+)'\s*FROM unnest\(ARRAY\[([\s\S]*?)\]\)/g)) {
  const [, role, portee, bloc] = m;
  matrice[role] = { portee, actions: [...bloc.matchAll(/'([a-z_]+:[a-z_]+)'/g)].map((x) => x[1]) };
}

// ---------------------------------------------------------------------------
// Rapports
// ---------------------------------------------------------------------------
const nbActions = actions.reduce((n, a) => n + Object.keys(a.fonctions).length, 0);
const nbRoutes = routes.length;
const nbDomaine = domaines.reduce((n, d) => n + d.fonctions.length, 0);
const couvertes = new Set();
for (const a of actions) for (const p of Object.values(a.fonctions)) for (const x of p) couvertes.add(x);
for (const r of routes) for (const x of r.permissions) couvertes.add(x);

console.log(`actions serveur : ${nbActions} dans ${actions.length} fichiers`);
console.log(`routes d'API    : ${nbRoutes}`);
console.log(`fonctions domaine : ${nbDomaine} dans ${domaines.length} fichiers`);
console.log(`permissions déclarées : ${toutesPermissions.length} | utilisées dans le code : ${couvertes.size}`);
console.log(`rôles : ${rolesListe.length} | matrice seed : ${Object.keys(matrice).join(", ")}`);

// --- FEATURES_INVENTORY.md -------------------------------------------------
const inv = [
  "# Inventaire des fonctionnalités réelles",
  "",
  "Extrait **du code source** par `agent/scripts/audit-plateforme.mjs` — aucune",
  "fonctionnalité déduite d'un menu ou supposée.",
  "",
  `- **${nbActions} actions serveur** réparties dans ${actions.length} fichiers`,
  `- **${nbRoutes} routes d'API**`,
  `- **${nbDomaine} fonctions de service** dans ${domaines.length} modules de domaine`,
  `- **${toutesPermissions.length} permissions** déclarées, dont **${couvertes.size}** effectivement exigées dans le code`,
  "",
  "## Actions serveur, par module",
  "",
  "| Fichier | Fonction | Permission exigée |",
  "|---|---|---|",
  ...actions.flatMap((a) =>
    Object.entries(a.fonctions).map(
      ([fn, perms]) => `| \`${a.fichier.replace("web/src/app/(main)/dashboard/", "")}\` | \`${fn}\` | ${perms.length ? perms.map((p) => "`" + p + "`").join(", ") : "—"} |`,
    ),
  ),
  "",
  "## Services de domaine",
  "",
  ...domaines.map((d) => `- \`${d.fichier.replace("web/src/server/domain/", "")}\` : ${d.fonctions.map((f) => "`" + f + "`").join(", ")}`),
  "",
].join("\n");
writeFileSync(resolve(racine, "docs/AI_SCHOOL_AGENT/FEATURES_INVENTORY.md"), inv, "utf8");

// --- PLATFORM_API_MAPPING.md ----------------------------------------------
const map = [
  "# Cartographie des routes d'API",
  "",
  `**${nbRoutes} routes** relevées sous \`web/src/app/api\`, avec les méthodes HTTP`,
  "réellement exportées et les permissions exigées.",
  "",
  "| Route | Méthodes | Permissions |",
  "|---|---|---|",
  ...routes
    .sort((a, b) => a.chemin.localeCompare(b.chemin))
    .map((r) => `| \`${r.chemin}\` | ${r.methodes.join(", ") || "—"} | ${r.permissions.length ? r.permissions.map((p) => "`" + p + "`").join(", ") : "—"} |`),
  "",
  "> Une route sans permission affichée applique soit un contrôle d'un autre type",
  "> (jeton de service, secret de cron, session mobile), soit aucun — à vérifier au cas par cas.",
  "",
].join("\n");
writeFileSync(resolve(racine, "docs/AI_SCHOOL_AGENT/PLATFORM_API_MAPPING.md"), map, "utf8");

// --- ROLE_ACTION_MATRIX.md -------------------------------------------------
const roles = Object.keys(matrice);
const lignes = toutesPermissions.map((p) => {
  const cells = roles.map((r) => {
    const m = matrice[r];
    if (!m.actions.includes(p)) return "—";
    return m.portee === "AUCUNE" ? "✅" : `✅ *${m.portee === "PROPRES_CLASSES" ? "ses classes" : "ses enfants"}*`;
  });
  return `| \`${p}\` | ${cells.join(" | ")} |`;
});
const mat = [
  "# Matrice rôle × action (extraite du seed)",
  "",
  "Source : `db/migrations/0009_seed_referentiel.sql`. **C'est la seule autorité.**",
  "L'agent reflète cette matrice, il ne la définit pas.",
  "",
  `${toutesPermissions.length} actions × ${roles.length} rôles. SUPER_ADMIN détient tout (migration 0012).`,
  "",
  `| Action | ${roles.join(" | ")} |`,
  `|---|${roles.map(() => "---").join("|")}|`,
  ...lignes,
  "",
  "**Légende** : ✅ autorisé · *ses classes* / *ses enfants* = portée restreinte, vérifiée",
  "côté `guergne` uniquement · — non autorisé.",
  "",
].join("\n");
writeFileSync(resolve(racine, "docs/AI_SCHOOL_AGENT/ROLE_ACTION_MATRIX.md"), mat, "utf8");

console.log("\nÉcrits : FEATURES_INVENTORY.md, PLATFORM_API_MAPPING.md, ROLE_ACTION_MATRIX.md");
