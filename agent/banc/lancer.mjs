/**
 * Campagne du banc d'essai conversationnel.
 *
 *   node banc/lancer.mjs --etiquette reference
 *   node banc/lancer.mjs --etiquette v2 --filtre assiduite,mt-
 *   node banc/lancer.mjs --etiquette v2 --rejouer banc/rapports/v1.json   (les seuls non réussis)
 *   BANC_MEMOIRE=non …   mesure SANS mémoire de session
 *   BANC_SANS_EXTENSIONS=oui …   mesure du moteur de référence
 *
 * Prérequis : backend local sur la base de TEST, écritures allumées, SMS et
 * push neutralisés (voir docs/AI_EVALUATION_FRAMEWORK.md).
 *
 * Écrit banc/rapports/<etiquette>.json (tout) et .md (lisible).
 */
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { GuergneHttpClient } from "../src/guergne-client.js";
import { BACKEND, lireEnv, ouvrirConversation, ouvrirIA, ouvrirOracle, racineAgent } from "./moteur.mjs";
import { chargerFaits } from "./faits.mjs";
import { classer, jugerTour } from "./verdict.mjs";
import { poserSynthese, retirerSynthese } from "./synthese.mjs";

if (process.env.BANC_SANS_EXTENSIONS !== "oui") await import("./extensions.mjs");

const arg = (nom, defaut = null) => {
  const i = process.argv.indexOf("--" + nom);
  return i > 0 ? process.argv[i + 1] : defaut;
};
const etiquette = arg("etiquette", "campagne");
const filtres = (arg("filtre", "") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const rejouer = arg("rejouer");
const pauseMs = Number(arg("pause", "0"));
const reprendre = process.argv.includes("--reprendre");

const dossier = join(racineAgent, "banc", "scenarios");
let scenarios = [];
for (const fichier of readdirSync(dossier).filter((x) => x.endsWith(".mjs")).sort()) {
  const m = await import(pathToFileURL(join(dossier, fichier)).href);
  scenarios.push(...m.default.map((s) => ({ ...s, fichier })));
}
const doublons = scenarios.map((s) => s.id).filter((id, i, t) => t.indexOf(id) !== i);
if (doublons.length) throw new Error("identifiants de scénario en double : " + doublons.join(", "));
const totalCatalogue = scenarios.length;
if (rejouer) {
  const ancien = JSON.parse(readFileSync(rejouer, "utf8"));
  const aRejouer = new Set(ancien.scenarios.filter((s) => s.verdict !== "reussi").map((s) => s.id));
  scenarios = scenarios.filter((s) => aRejouer.has(s.id));
}
if (filtres.length) scenarios = scenarios.filter((s) => filtres.some((x) => s.id.startsWith(x) || s.domaine === x || (s.etiquettes ?? []).includes(x)));

const oracle = await ouvrirOracle();
const { q } = oracle;
let f = null;
const acteurs = {};
for (const role of ["SUPER_ADMIN", "DIRECTION", "SURVEILLANT"]) {
  const [a] = await q("SELECT id::text, role FROM utilisateurs WHERE NOT donnees_semees AND role = $1 AND actif ORDER BY cree_le LIMIT 1", [role]);
  if (a) acteurs[role] = a;
}
const evenementsIA = [];
const ia = ouvrirIA((e) => evenementsIA.push(e));
const guergneDirect = new GuergneHttpClient({ baseUrl: BACKEND, serviceToken: lireEnv(join(racineAgent, ".env"), "AGENT_SERVICE_TOKEN") });
const ctxAdmin = { actorId: acteurs.SUPER_ADMIN.id };

const besoinSynthese = scenarios.some((s) => s.synthese);
let synthese = null;
const resultats = [];
let arret = null;
// REPRISE : une campagne interrompue ne recommence pas ce qu'elle a déjà
// mesuré. Les scénarios jugés sont relus du fichier partiel ; seuls les autres
// sont joués. (Même étiquette = même code : ne pas reprendre après une modification.)
const cheminPartiel = join(racineAgent, "banc", "rapports", etiquette + ".partiel.json");
if (reprendre) {
  try {
    // Un scénario que le modèle saturé n'a pas pu lire n'a PAS été mesuré :
    // il est rejoué. Seuls les scénarios réellement jugés sont conservés.
    const nonJuge = (s) => s.tours?.some((x) => x.controles?.some((c) => c.categorie === "infrastructure"));
    const deja = JSON.parse(readFileSync(cheminPartiel, "utf8")).scenarios.filter((s) => s.verdict && !nonJuge(s));
    resultats.push(...deja);
    const faits = new Set(deja.map((s) => s.id));
    scenarios = scenarios.filter((s) => !faits.has(s.id));
    console.log("Reprise : " + deja.length + " scénario(s) déjà mesuré(s), " + scenarios.length + " à jouer");
  } catch {
    console.log("Reprise : aucun résultat partiel pour « " + etiquette + " », campagne complète");
  }
}
const debutCampagne = Date.now();
console.log("Banc : " + scenarios.length + " scénario(s) sur " + totalCatalogue + " — base " + oracle.branche + " — étiquette « " + etiquette + " »");

try {
  if (besoinSynthese) {
    synthese = await poserSynthese({ q, guergne: guergneDirect, ctx: ctxAdmin });
    console.log("  synthèse posée : " + Object.keys(synthese.eleves).length + " élèves, " + Object.keys(synthese.classes).length + " classes");
  }

  // L'oracle se lit APRÈS la pose de la synthèse : ses élèves comptent dans
  // les effectifs que l'agent va lire.
  f = await chargerFaits(q);
  f.s = synthese;
  if (synthese?.surveillant) acteurs.SURVEILLANT = synthese.surveillant;

  for (const [i, sc] of scenarios.entries()) {
    // Tous les fournisseurs du modèle écartés pour longtemps (quota du jour,
    // crédit épuisé) : continuer ne mesurerait que leur indisponibilité. On
    // s'arrête proprement ; `--reprendre` reprendra au scénario suivant.
    const etats = Object.values(ia.etatFournisseurs).filter((e) => e.statut !== "non_configure" && e.statut !== "desactive");
    if (etats.length && etats.every((e) => e.statut === "ecarte" || (e.statut === "limite" && e.cooldownRestantMs > 5 * 60_000))) {
      console.log("\n  ARRÊT : aucun fournisseur du modèle disponible avant longtemps (quota ou crédit). Reprendre avec --reprendre.");
      arret = "modele_indisponible";
      break;
    }
    const role = sc.role ?? "SUPER_ADMIN";
    const acteur = acteurs[role];
    const sortie = { id: sc.id, domaine: sc.domaine, capacites: sc.capacites ?? [], etiquettes: sc.etiquettes ?? [], role, fichier: sc.fichier, tours: [] };
    if (!acteur) {
      sortie.verdict = "non_execute";
      sortie.cause = "aucun acteur " + role + " actif dans la base de test";
      resultats.push(sortie);
      continue;
    }
    let horloge = Date.now();
    const sabotage = typeof sc.sabotage === "function" ? sc.sabotage(f) : sc.sabotage ?? null;
    const conv = ouvrirConversation({
      ia, acteur, evenementsIA, sabotage,
      memoire: process.env.BANC_MEMOIRE !== "non",
      horloge: () => horloge,
    });
    try {
      for (const tour of sc.tours) {
        if (tour.attendreMs) {
          horloge += tour.attendreMs;
          continue;
        }
        horloge += 4_000;
        const dit = typeof tour.dit === "function" ? tour.dit(f) : tour.dit;
        let obs;
        let attentesIA = 0;
        try {
          obs = await conv.dire(dit);
          // Tous les fournisseurs du modèle en quota : la demande n'a pas été
          // lue, rien n'a été fait. Juger la compréhension là-dessus mesurerait
          // le quota, pas l'agent. On attend la fin du refroidissement et on
          // renvoie le MÊME message — au plus trois fois — et on le compte.
          while (/Aucun fournisseur IA disponible/.test(String(obs?.resultat?.error ?? "")) && attentesIA < 3) {
            attentesIA += 1;
            console.log("\x1b[0;90m         modèle saturé : attente de 65 s (" + attentesIA + "/3)\x1b[0m");
            await new Promise((r) => setTimeout(r, 65_000));
            horloge += 65_000;
            obs = await conv.dire(dit);
          }
        } catch (e) {
          obs = { texte: dit, statut: "EXCEPTION", reponse: "", reponses: [], appels: [], evenements: [], llm: { appels: 0, tokens: 0, ms: 0, fournisseurs: [], echecs: 0 }, dureeMs: 0, intention: null, outil: null, erreur: String(e?.stack ?? e).slice(0, 400) };
        }
        const controles = /Aucun fournisseur IA disponible/.test(String(obs?.resultat?.error ?? ""))
          ? [{ categorie: "infrastructure", ok: false, detail: "modèle indisponible (quota de tous les fournisseurs) — demande non lue" }]
          : await jugerTour(tour, obs, f, q);
        if (obs.erreur) controles.push({ categorie: "execution", ok: false, detail: obs.erreur });
        sortie.tours.push({
          dit,
          statut: obs.statut,
          intention: obs.intention,
          outil: obs.outil,
          rejet: obs.rejet ?? null,
          reponse: obs.reponse,
          appels: obs.appels.map((a) => ({ action: a.action, params: a.params, ok: a.ok, message: a.message, ms: a.ms })),
          // La trace du moteur, sans le journal du modèle : de quoi savoir
          // POURQUOI un tour a pris le chemin qu'il a pris.
          trace: obs.evenements
            .filter((e) => ["intent_detected", "entites_resolues", "choix_evalue", "enchainement", "outil_reoriente", "mission_refusee", "mission_etape", "valeur_non_dite_retiree", "ecriture_verifiee", "confirmation_evaluee", "politique_evaluee", "invite_assemblee"].includes(e.event ?? e.type))
            .map(({ ts, run, ...e }) => e),
          llm: obs.llm,
          attentesIA,
          dureeMs: obs.dureeMs,
          controles,
        });
        if (pauseMs) await new Promise((r) => setTimeout(r, pauseMs));
      }
      sortie.verdict = classer(sortie.tours);
    } catch (e) {
      sortie.verdict = "echoue";
      sortie.cause = "exception du banc : " + String(e?.message ?? e);
    }
    resultats.push(sortie);
    // Une campagne interrompue ne perd pas ce qu'elle a déjà mesuré.
    // Sous Windows, l'antivirus ou l'indexeur tient parfois le fichier une
    // fraction de seconde : la deuxième campagne en est morte au 62e scénario.
    // Le fichier partiel est un confort, jamais une raison d'arrêter.
    try {
      writeFileSync(cheminPartiel + ".tmp", JSON.stringify({ etiquette, scenarios: resultats }));
      renameSync(cheminPartiel + ".tmp", cheminPartiel);
    } catch {
      /* la prochaine écriture rattrapera */
    }
    const signe = { reussi: "\x1b[1;32mOK     \x1b[0m", partiel: "\x1b[1;33mPARTIEL\x1b[0m", echoue: "\x1b[1;31mECHEC  \x1b[0m" }[sortie.verdict] ?? sortie.verdict;
    console.log("  " + String(i + 1).padStart(3) + ". " + signe + " " + sc.id.padEnd(8) + " " + (typeof sc.tours[0].dit === "function" ? sc.tours[0].dit(f) : sc.tours[0].dit ?? "").slice(0, 70));
    for (const t of sortie.tours) {
      for (const c of t.controles.filter((x) => !x.ok)) console.log("\x1b[0;90m         [" + c.categorie + "] " + c.detail.slice(0, 220) + "\x1b[0m");
    }
  }
} finally {
  if (besoinSynthese) {
    try {
      const r = await retirerSynthese({ q });
      console.log("  synthèse retirée : " + r.supprimees + " ligne(s), reste " + r.reste);
      if (r.reste) process.exitCode = 1;
    } catch (e) {
      console.error("  NETTOYAGE EN ÉCHEC : " + e.message);
      process.exitCode = 1;
    }
  }
  await oracle.fermer();
}

// --- Mesures ----------------------------------------------------------------
const tours = resultats.flatMap((s) => s.tours.map((t) => ({ ...t, scenario: s.id })));
const controles = tours.flatMap((t) => t.controles.map((c) => ({ ...c, scenario: t.scenario })));
const taux = (cat) => {
  const l = controles.filter((c) => c.categorie === cat);
  return { reussis: l.filter((c) => c.ok).length, total: l.length, taux: l.length ? Number((l.filter((c) => c.ok).length / l.length).toFixed(4)) : null };
};
const appels = tours.flatMap((t) => t.appels);
const durees = tours.map((t) => t.dureeMs).sort((a, b) => a - b);
const centile = (p) => (durees.length ? durees[Math.min(durees.length - 1, Math.floor((p / 100) * durees.length))] : null);
const multi = resultats.filter((s) => s.etiquettes.includes("multi-outils"));
const toursAttendantReponse = tours.filter((t) => t.controles.some((c) => c.categorie === "clarification"));
const mesures = {
  scenarios: resultats.length,
  reussis: resultats.filter((s) => s.verdict === "reussi").length,
  partiels: resultats.filter((s) => s.verdict === "partiel").length,
  echoues: resultats.filter((s) => s.verdict === "echoue").length,
  nonExecutes: resultats.filter((s) => s.verdict === "non_execute").length,
  tours: tours.length,
  comprehension: taux("comprehension"),
  resolutionEntites: taux("resolution"),
  appelsReussis: { reussis: appels.filter((a) => a.ok).length, total: appels.length, taux: appels.length ? Number((appels.filter((a) => a.ok).length / appels.length).toFixed(4)) : null },
  reponsesExactes: taux("reponse"),
  verite: taux("verite"),
  workflowsMultiOutils: { reussis: multi.filter((s) => s.verdict === "reussi").length, total: multi.length },
  clarificationsInutiles: {
    nombre: toursAttendantReponse.filter((t) => t.controles.some((c) => c.categorie === "clarification" && !c.ok)).length,
    total: toursAttendantReponse.length,
  },
  parametresTechniquesExposes: {
    nombre: tours.filter((t) => t.controles.some((c) => c.categorie === "hygiene" && !c.ok && /technique/.test(c.detail))).length,
    total: tours.length,
  },
  faussesReussites: { nombre: controles.filter((c) => c.categorie === "fausse_reussite").length, total: tours.length },
  modeleIndisponible: { tours: controles.filter((c) => c.categorie === "infrastructure").length, attentes: tours.reduce((s, t) => s + (t.attentesIA ?? 0), 0) },
  latenceMs: { moyenne: durees.length ? Math.round(durees.reduce((a, b) => a + b, 0) / durees.length) : null, p50: centile(50), p95: centile(95), max: durees.at(-1) ?? null },
  llm: {
    appels: tours.reduce((s, t) => s + t.llm.appels, 0),
    echecs: tours.reduce((s, t) => s + (t.llm.echecs ?? 0), 0),
    jetons: tours.reduce((s, t) => s + t.llm.tokens, 0),
    jetonsParConversation: resultats.length ? Math.round(tours.reduce((s, t) => s + t.llm.tokens, 0) / resultats.length) : null,
    fournisseurs: Object.fromEntries(Object.entries(ia.etatFournisseurs).filter(([, e]) => e.appels).map(([n, e]) => [n, { appels: e.appels, succes: e.succes, echecs: e.echecs, jetons: e.tokens, latenceMoyenneMs: e.latenceMoyenneMs }])),
  },
  dureeCampagneS: Math.round((Date.now() - debutCampagne) / 1000),
  arret,
};
const parDomaine = {};
for (const s of resultats) {
  const d = (parDomaine[s.domaine] ??= { reussis: 0, partiels: 0, echoues: 0, total: 0 });
  d.total += 1;
  d[{ reussi: "reussis", partiel: "partiels", echoue: "echoues" }[s.verdict] ?? "echoues"] += 1;
}
const capacites = new Set(resultats.flatMap((s) => s.capacites));

mkdirSync(join(racineAgent, "banc", "rapports"), { recursive: true });
const base = join(racineAgent, "banc", "rapports", etiquette);
writeFileSync(base + ".json", JSON.stringify({ etiquette, date: new Date().toISOString(), base: oracle.branche, memoire: process.env.BANC_MEMOIRE !== "non", extensions: process.env.BANC_SANS_EXTENSIONS !== "oui", catalogue: totalCatalogue, mesures, parDomaine, capacitesCouvertes: [...capacites].sort(), scenarios: resultats }, null, 1));

const pc = (t) => (t.taux == null ? "—" : (t.taux * 100).toFixed(1) + " % (" + t.reussis + "/" + t.total + ")");
const md = [
  "# Campagne « " + etiquette + " » — " + new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
  "",
  ...(arret ? ["**Campagne arrêtée avant la fin : " + arret + ".** Les scénarios non joués ne sont pas comptés.", ""] : []),
  "Base : `" + oracle.branche + "` (test). Mémoire de session : " + (process.env.BANC_MEMOIRE !== "non" ? "oui" : "non") + ". Scénarios joués : " + resultats.length + " sur " + totalCatalogue + " au catalogue.",
  "",
  "| Mesure | Valeur |",
  "|---|---|",
  "| Scénarios réussis | " + mesures.reussis + " / " + mesures.scenarios + " |",
  "| Partiellement réussis | " + mesures.partiels + " |",
  "| Échoués | " + mesures.echoues + " |",
  "| Non exécutés | " + mesures.nonExecutes + " |",
  "| Tours de conversation | " + mesures.tours + " |",
  "| Compréhension (intention + outil) | " + pc(mesures.comprehension) + " |",
  "| Résolution des entités | " + pc(mesures.resolutionEntites) + " |",
  "| Appels backend aboutis | " + pc(mesures.appelsReussis) + " |",
  "| Réponses exactes (contre l'oracle SQL) | " + pc(mesures.reponsesExactes) + " |",
  "| État réel conforme (relecture SQL) | " + pc(mesures.verite) + " |",
  "| Workflows multi-outils réussis | " + mesures.workflowsMultiOutils.reussis + " / " + mesures.workflowsMultiOutils.total + " |",
  "| Clarifications inutiles | " + mesures.clarificationsInutiles.nombre + " / " + mesures.clarificationsInutiles.total + " tours |",
  "| Paramètres techniques exposés | " + mesures.parametresTechniquesExposes.nombre + " / " + mesures.parametresTechniquesExposes.total + " tours |",
  "| Fausses annonces de réussite | " + mesures.faussesReussites.nombre + " |",
  "| Tours perdus, modèle saturé (non jugés) | " + mesures.modeleIndisponible.tours + " (" + mesures.modeleIndisponible.attentes + " attente(s) de refroidissement) |",
  "| Latence par tour | moyenne " + mesures.latenceMs.moyenne + " ms · p50 " + mesures.latenceMs.p50 + " ms · p95 " + mesures.latenceMs.p95 + " ms |",
  "| Jetons par conversation | " + mesures.llm.jetonsParConversation + " (" + mesures.llm.appels + " appels au modèle, " + mesures.llm.echecs + " échecs de fournisseur) |",
  "",
  "## Par domaine",
  "",
  "| Domaine | Réussis | Partiels | Échoués | Total |",
  "|---|---|---|---|---|",
  ...Object.entries(parDomaine).sort().map(([d, v]) => "| " + d + " | " + v.reussis + " | " + v.partiels + " | " + v.echoues + " | " + v.total + " |"),
  "",
  "## Scénarios non réussis",
  "",
  ...resultats.filter((s) => s.verdict !== "reussi").flatMap((s) => [
    "### " + s.id + " — " + s.verdict + (s.cause ? " (" + s.cause + ")" : ""),
    ...s.tours.flatMap((t) => [
      "- « " + t.dit + " » → " + (t.outil ?? t.intention ?? "?") + ", " + t.statut,
      ...t.controles.filter((c) => !c.ok).map((c) => "  - **" + c.categorie + "** : " + c.detail),
    ]),
    "",
  ]),
];
writeFileSync(base + ".md", md.join("\n"));
console.log("\n" + md.slice(4, 22).join("\n"));
console.log("\nRapports : " + base + ".json / .md");
