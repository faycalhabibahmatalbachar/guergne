#!/usr/bin/env node
/**
 * Pose sur Vercel les variables d'environnement du portail.
 *
 * POURQUOI PAS `vercel env add`
 * -----------------------------
 * La commande du CLI lit une valeur sur l'entrée standard, une par appel, et
 * échoue si la variable existe déjà. Poser quinze variables demande donc
 * quinze invocations et autant de décisions « existe / n'existe pas ». Ici,
 * un seul passage : on lit ce qui est en place, on met à jour ce qui diffère,
 * on crée ce qui manque, on laisse le reste tranquille.
 *
 * Surtout, on ne REMPLACE JAMAIS le jeu complet. C'est le piège documenté dans
 * `docs/04-ROADMAP-DEPLOIEMENT.md` §5.2 : un `PUT` sur l'ensemble des
 * variables efface silencieusement celles qui ne figurent pas dans la requête.
 * Ce script n'écrit que variable par variable.
 *
 * AUTHENTIFICATION
 * ----------------
 * Un jeton personnel Vercel, à créer sur
 * <https://vercel.com/account/settings/tokens> (portée : l'équipe qui héberge
 * le projet), puis :
 *
 *     VERCEL_TOKEN=xxxxx npm run vercel:env
 *
 * Le jeton n'est ni écrit sur disque ni journalisé. Il peut être révoqué juste
 * après.
 *
 * Options :
 *   --liste   n'affiche que l'état actuel, n'écrit rien
 *   --tout    inclut aussi les variables SMS (par défaut : seulement celles
 *             qui sont renseignées localement)
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Ce qui doit vivre sur Vercel
//
// La liste est ici, pas dans une note : c'est le seul endroit où l'on peut
// vérifier d'un coup d'œil qu'aucune variable n'a été oubliée lors d'un
// redéploiement ou d'une recréation de projet.
//
// N'y figurent QUE les variables que ce script gère. `DATABASE_URL` et ses
// variantes viennent de l'intégration Neon, `AUTH_SECRET` a été posée à la
// création du projet — les toucher ici ferait plus de mal que de bien.
//
// `CRON_SECRET` manquait, et son absence est silencieuse d'une façon
// particulièrement traître : la route de traitement de la file répond 503 en
// expliquant qu'elle reste fermée, mais personne ne l'appelle jamais puisque
// aucune tâche planifiée n'existe. La file ne se vide donc que par le bouton
// de la page Communication, ce qui interdit toute automatisation.
// ---------------------------------------------------------------------------
const VARIABLES = [
  { nom: "FCM_PROJECT_ID", secret: false, role: "Projet Firebase destinataire des notifications" },
  { nom: "FCM_CLIENT_EMAIL", secret: false, role: "Compte de service Firebase" },
  { nom: "FCM_PRIVATE_KEY", secret: true, role: "Clé RSA du compte de service" },
  { nom: "SMS_FOURNISSEUR", secret: false, role: "Adaptateur SMS actif (generique | journal)" },
  { nom: "SMS_API_URL", secret: false, role: "Point d'entrée de la passerelle 235SMS" },
  { nom: "SMS_API_KEY", secret: true, role: "Clé d'organisation 235SMS" },
  { nom: "SMS_SENDER_ID", secret: false, role: "Expéditeur affiché sur le téléphone du parent" },
  {
    nom: "CRON_SECRET",
    secret: true,
    role: "Ouvre /api/notifications/traiter à une tâche planifiée",
  },
];

/** Vercel distingue trois environnements ; le portail n'en sert qu'un vraiment. */
const CIBLES = ["production", "preview", "development"];

const PROJET = JSON.parse(readFileSync(path.resolve(ICI, "../.vercel/project.json"), "utf8"));
const JETON = process.env.VERCEL_TOKEN;

if (!JETON) {
  console.error("VERCEL_TOKEN manquant.");
  console.error("Créez-en un sur https://vercel.com/account/settings/tokens puis :");
  console.error("  VERCEL_TOKEN=xxxxx npm run vercel:env");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Valeurs locales
// ---------------------------------------------------------------------------
const local = {};
const envLocal = path.resolve(ICI, "../.env.local");
if (existsSync(envLocal)) {
  for (const ligne of readFileSync(envLocal, "utf8").split("\n")) {
    const m = ligne.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) local[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
const BASE = "https://api.vercel.com";
const equipe = `teamId=${PROJET.orgId}`;

async function api(chemin, options = {}) {
  const reponse = await fetch(`${BASE}${chemin}${chemin.includes("?") ? "&" : "?"}${equipe}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${JETON}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const texte = await reponse.text();
  if (!reponse.ok) throw new Error(`${options.method ?? "GET"} ${chemin} → ${reponse.status}\n${texte}`);
  return texte ? JSON.parse(texte) : {};
}

const listeSeulement = process.argv.includes("--liste");

const { envs } = await api(`/v9/projects/${PROJET.projectId}/env?decrypt=true`);
const existantes = new Map(envs.map((e) => [e.key, e]));

console.log(`Projet Vercel : ${PROJET.projectId}\n`);

let posees = 0;
let inchangees = 0;
let ignorees = 0;

for (const { nom, secret, role } of VARIABLES) {
  const valeur = local[nom];
  const distante = existantes.get(nom);

  if (!valeur) {
    // Une variable vide localement n'est pas une raison d'effacer celle qui
    // est en ligne : le poste de développement n'est pas la référence.
    console.log(`·  ${nom.padEnd(18)} non renseignée localement — ${distante ? "laissée en l'état" : "absente des deux côtés"}`);
    ignorees += 1;
    continue;
  }

  // Une variable `encrypted` ne se relit pas : `decrypt=true` renvoie le
  // chiffré, pas le clair — 1 052 caractères pour un identifiant de projet de
  // 25. Impossible donc de savoir si elle est déjà à jour ; on la réécrit, ce
  // qui est sans effet de bord. Ne pas confondre cette réécriture avec une
  // divergence réelle.
  const comparable = distante && distante.type !== "encrypted";

  if (comparable && distante.value === valeur) {
    console.log(`=  ${nom.padEnd(18)} déjà à jour`);
    inchangees += 1;
    continue;
  }

  const apercu = secret ? `${valeur.length} caractères` : valeur.length > 48 ? `${valeur.slice(0, 45)}…` : valeur;

  if (listeSeulement) {
    const etat = !distante
      ? "à créer"
      : comparable
        ? "à mettre à jour"
        : "à réécrire (chiffrée, non relisible)";
    console.log(`~  ${nom.padEnd(18)} ${etat} (${apercu})`);
    continue;
  }

  const corps = {
    key: nom,
    value: valeur,
    type: secret ? "encrypted" : "plain",
    target: CIBLES,
    comment: role,
  };

  if (distante) {
    await api(`/v9/projects/${PROJET.projectId}/env/${distante.id}`, {
      method: "PATCH",
      body: JSON.stringify({ value: valeur, target: CIBLES, comment: role }),
    });
    console.log(`↻  ${nom.padEnd(18)} mise à jour (${apercu})`);
  } else {
    await api(`/v10/projects/${PROJET.projectId}/env`, { method: "POST", body: JSON.stringify(corps) });
    console.log(`+  ${nom.padEnd(18)} créée (${apercu})`);
  }
  posees += 1;
}

console.log(`\n${posees} posée(s), ${inchangees} inchangée(s), ${ignorees} ignorée(s).`);

if (posees > 0) {
  console.log("\nLes variables ne prennent effet qu'au déploiement suivant :");
  console.log("  npx vercel deploy --prod");
}
