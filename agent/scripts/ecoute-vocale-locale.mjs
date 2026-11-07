/**
 * Écoute des notes vocales entrantes, avec le VRAI pipeline de l'agent.
 *
 * POURQUOI CE SCRIPT EXISTE
 * --------------------------
 * La sortie vocale est démontrée : une note bilingue de 23 s a été livrée,
 * acquittement 2. L'entrée, elle, n'a jamais traversé la chaîne complète en
 * conditions réelles — la seule tentative, le 5 novembre, échouait sur
 * `handler_failed: "r"` avant d'atteindre le modèle.
 *
 * Ce script monte l'agent avec ses vrais modules : le transport
 * `WwebjsProvider`, le moteur `Agent`, le registre d'outils, la matrice de
 * permissions, le moteur de politiques, `MoteurIA` pour la transcription et la
 * compréhension, `FournisseurPiper` pour la voix, et le porte-voix qui relie
 * les réponses à la synthèse. Rien n'est doublé : c'est le chemin de
 * production, exécuté localement.
 *
 * CE QUI EST SIMULÉ, ET POURQUOI C'EST LE SEUL CHOIX HONNÊTE
 * ----------------------------------------------------------
 * Le client scolaire — celui qui lit et écrit les élèves, les absences, les
 * notes — est remplacé par un simulateur en mémoire. Deux raisons :
 *
 *   1. La consigne est explicite : aucune donnée réelle de l'établissement ne
 *      doit être touchée pendant la recette.
 *   2. Le dos scolaire de production vit derrière Vercel et Neon, avec des
 *      jetons que ce laboratoire n'a pas — et n'a pas à avoir.
 *
 * Ce qui est éprouvé reste donc entier : réception, téléchargement,
 * transcription, langue, compréhension, identité, permissions, politiques,
 * synthèse, conversion, envoi, acquittement. Seule la lecture des dossiers
 * d'élèves rend une réponse simulée, et chaque appel au simulateur est annoncé
 * dans la trace pour qu'aucun résultat ne passe pour réel.
 *
 *   node scripts/ecoute-vocale-locale.mjs --numero 23568663737 --role SUPER_ADMIN
 *
 * Le numéro est passé en argument et jamais écrit dans le dépôt.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Agent } from "../src/engine.js";
import { AuditLog } from "../src/audit.js";
import { IdentityStore } from "../src/identity.js";
import { IdempotencyStore } from "../src/idempotency.js";
import { MatricePermissions } from "../src/permissions-matrix.js";
import { MoteurPolitiques, POLITIQUES_DEFAUT } from "../src/politiques.js";
import { ASSIDUITE_TOOLS, ToolRegistry } from "../src/tools.js";
import { MoteurIA, configurerDepuisEnv } from "../src/ia.js";
import { WwebjsProvider } from "../src/providers/wwebjs.js";
import { jidUtilisateur } from "../src/jid.js";
import { FournisseurPiper } from "../src/voix/piper.js";
import { preparerNoteVocale } from "../src/voix/audio.js";
import { avecVoix } from "../src/voix/porte-voix.js";
import { decrireErreur, resumerErreur } from "../src/erreurs.js";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SESSION = process.env.SESSION_LOCALE ?? join(racine, "donnees-locales", "wwebjs_auth_local");
const TRAVAIL = process.env.TMPDIR ?? join(racine, "donnees-locales", "tmp");
const VOIX = process.env.VOIX_DOSSIER ?? join(racine, "donnees", "voix", "voix");

const argv = process.argv.slice(2);
const option = (n, d = null) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : d;
};
const numero = String(option("--numero", "")).replace(/\D/g, "");
const role = option("--role", "SUPER_ADMIN");
if (!numero) {
  console.error("usage : node ecoute-vocale-locale.mjs --numero <chiffres> [--role SUPER_ADMIN]");
  process.exit(2);
}

const bleu = (s) => console.log(`\x1b[1;34m${s}\x1b[0m`);
const vert = (s) => console.log(`\x1b[1;32m${s}\x1b[0m`);
const rouge = (s) => console.error(`\x1b[1;31m${s}\x1b[0m`);
const gris = (s) => console.log(`\x1b[0;90m${s}\x1b[0m`);
const masque = (n) => `${n.slice(0, 3)}${"•".repeat(Math.max(0, n.length - 7))}${n.slice(-4)}`;

/**
 * Trace structurée, corrélée par `run`. Jamais un numéro, jamais une clé.
 *
 * Elle accepte une CHAÎNE autant qu'un objet, et ce n'est pas une
 * complaisance : le transport journalise déjà du JSON tout prêt
 * (`_tracer` fait lui-même `JSON.stringify`). L'étaler comme un objet
 * produisait une ligne indexée caractère par caractère — illisible, et une
 * trace illisible ne vaut pas mieux que pas de trace.
 */
const tracer = (e) => {
  if (typeof e === "string") {
    console.log(e);
    return;
  }
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...e }));
};

/**
 * Simulateur du dos scolaire.
 *
 * Chaque appel est ANNONCÉ. Un résultat simulé qui ne se distingue pas d'un
 * résultat réel est la pire sorte de faux vert : on croirait avoir consulté
 * les dossiers de l'établissement.
 */
class DosScolaireSimule {
  constructor() {
    this.appels = [];
  }
  _simuler(action, params) {
    this.appels.push({ action, params, le: Date.now() });
    rouge(`  [SIMULE] ${action} — aucune donnee reelle n'a ete lue ni ecrite`);
    tracer({ type: "school.backend.simule", action });
    return {
      ok: true,
      message:
        `Resultat SIMULE pour « ${action} ». Ce laboratoire ne lit pas les dossiers ` +
        "reels de l'etablissement.",
      simule: true,
    };
  }
  listerAbsences(p) { return this._simuler("listerAbsences", p); }
  listerAlertes(p) { return this._simuler("listerAlertes", p); }
  controleSaisies(p) { return this._simuler("controleSaisies", p); }
  enregistrerAppel(p) { return this._simuler("enregistrerAppel", p); }
  enregistrerRetard(p) { return this._simuler("enregistrerRetard", p); }
  justifierEnLot(p) { return this._simuler("justifierEnLot", p); }
  supprimerAbsence(p) { return this._simuler("supprimerAbsence", p); }
  snapshot(outil, params) { return { tool: outil?.name ?? null, params, simule: true }; }
}

/**
 * Verrou d'instance unique.
 *
 * POURQUOI IL EXISTE
 * -------------------
 * L'appairage precedent a ete perdu parce que deux clients ont touche le meme
 * profil LocalAuth. Un controle prealable constate l'etat AVANT le lancement ;
 * ce verrou empeche le lancement lui-meme de se dedoubler, y compris si
 * quelqu'un relance la commande sans regarder.
 *
 * Il porte le PID et il est VERIFIE, non cru : un verrou dont le processus est
 * mort est repris, sinon un plantage interdirait tout redemarrage.
 */
function prendreVerrou(chemin) {
  try {
    const ancien = readFileSync(chemin, "utf8").trim();
    if (ancien && existsSync(`/proc/${ancien}`)) {
      return { pris: false, parPid: ancien };
    }
    gris(`  verrou perime (pid ${ancien || "inconnu"}) : repris`);
  } catch {
    /* pas de verrou : premier demarrage */
  }
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, `${process.pid}
`);
  return { pris: true, parPid: String(process.pid) };
}

async function principal() {
  mkdirSync(TRAVAIL, { recursive: true });

  const cheminVerrou = join(racine, "donnees-locales", "ecoute.pid");
  const verrou = prendreVerrou(cheminVerrou);
  if (!verrou.pris) {
    rouge(`Une ecoute tourne deja : pid ${verrou.parPid}.`);
    gris("  Deux clients sur le meme profil font invalider l'appareil lie.");
    gris("  Arretez-la d'abord : bash infra/local/preparer-appairage.sh --arreter");
    process.exit(4);
  }
  gris(`  verrou d'instance pris (pid ${process.pid})`);

  // --- 1. Les fournisseurs IA, sans jamais afficher de cle ---------------
  bleu("== 1. Fournisseurs IA ==");
  const conf = configurerDepuisEnv(process.env);
  for (const a of conf.avertissements) gris(`  avertissement : ${a}`);
  gris(`  presents : ${conf.presents.join(", ") || "aucun"}`);
  if (conf.presents.length === 0) {
    rouge("  Aucun fournisseur. Chargez les cles : . infra/local/profil-ia.sh");
    process.exit(1);
  }
  const ia = new MoteurIA({
    cles: conf.cles,
    modeles: conf.modeles,
    ordre: conf.ordre,
    desactives: conf.desactives,
    journal: tracer,
  });
  gris(`  transcription possible via : ${ia.transcripteurs.join(", ") || "aucun"}`);
  if (ia.transcripteurs.length === 0) {
    rouge("  Aucun moteur de transcription : la reception vocale ne peut pas etre eprouvee.");
    process.exit(1);
  }
  // Un appel reel, maintenant : une cle presente ne prouve pas qu'elle marche,
  // et le decouvrir au moment ou une note vocale arrive serait trop tard.
  try {
    const r = await ia.completerJson([
      { role: "system", content: 'Reponds exactement {"ok":true}.' },
      { role: "user", content: "ping" },
    ]);
    vert(`  Groq repond : ${r.fournisseur}/${r.modele} en ${r.dureeMs} ms`);
  } catch (e) {
    rouge(`  L'appel reel echoue : ${resumerErreur(e)}`);
    process.exit(1);
  }

  // --- 2. Le moteur vocal -------------------------------------------------
  bleu("\n== 2. Moteur vocal ==");
  const voix = new FournisseurPiper({
    python: process.env.PYTHON_BIN ?? "python3",
    modeles: { fr: join(VOIX, "fr_FR-siwis-medium.onnx"), ar: join(VOIX, "ar_JO-kareem-medium.onnx") },
    dossierTemporaire: TRAVAIL,
    journal: tracer,
  });
  const amorce = await voix.initialize();
  if (!amorce?.pret) {
    rouge(`  Moteur vocal indisponible : ${amorce?.raison ?? "raison inconnue"}`);
    process.exit(1);
  }
  vert(`  pret (${(amorce.langues ?? []).join(", ")})`);

  // --- 3. L'identite, en memoire et passee en argument -------------------
  bleu("\n== 3. Identite ==");
  // Le magasin PERSISTANT de production vit sur le serveur et porte les vraies
  // associations. Ici, une seule identite, fournie en argument : le depot ne
  // contient aucun numero.
  const jidAttendu = jidUtilisateur(numero);
  const identites = new IdentityStore([
    { jid: jidAttendu, id: "local-superadmin", nom: "SUPER_ADMIN (laboratoire)", role },
  ]);
  vert(`  ${masque(numero)} -> role ${role}`);

  // --- 4. Le transport ----------------------------------------------------
  bleu("\n== 4. Transport WhatsApp ==");
  if (!process.env.PUPPETEER_EXECUTABLE_PATH) {
    try {
      process.env.PUPPETEER_EXECUTABLE_PATH = readFileSync(
        join(process.env.GUERGNE_LOCAL ?? "", "chemin-chromium.txt"),
        "utf8",
      ).trim();
    } catch {
      /* Puppeteer cherchera lui-meme */
    }
  }
  const provider = new WwebjsProvider({
    dossierSession: SESSION,
    clientId: "guergne-local",
    journal: { info: (...m) => gris(`  ${m.join(" ")}`), warn: (...m) => gris(`  ${m.join(" ")}`), error: (...m) => rouge(`  ${m.join(" ")}`), log: tracer },
  });

  // Le porte-voix, exactement comme en production : le texte part toujours
  // d'abord, et la voix ne peut jamais transformer une reponse en silence.
  const transportParlant = avecVoix(provider, {
    moteur: () => voix,
    audio: { preparerNoteVocale },
    dossierTemporaire: TRAVAIL,
    mode: process.env.AGENT_REPONSE_VOCALE ?? "texte_et_voix",
    roles: [role],
    journal: tracer,
  });

  const dos = new DosScolaireSimule();
  const outils = new ToolRegistry(ASSIDUITE_TOOLS);
  const politiques = new MoteurPolitiques({ politiques: POLITIQUES_DEFAUT, journal: tracer });

  const agent = new Agent({
    provider: transportParlant,
    identity: identites,
    idempotency: new IdempotencyStore(),
    // L'audit est TRACE, et non seulement garde en memoire : c'est la seule
    // piste qui dit ce que l'agent a reellement decide pour chaque message.
    audit: new AuditLog((e) => tracer({ type: "school.audit", ...e })),
    tools: outils,
    permissions: new MatricePermissions(),
    guergne: dos,
    politiques,
    journalIdentite: tracer,
    journalEtape: (e) => tracer({ type: "agent", ...e }),
    diagnostic: async () => ({ ia: "disponible (laboratoire)", backend: "SIMULE" }),
    // La comprehension passe par le MEME registre d'outils que la production.
    // Le referentiel scolaire, lui, est absent : le modele ne recevra donc
    // aucune liste de classes reelles, et c'est voulu.
    interpret: async (texte, ctx = {}) => {
      const r = await ia.completerJson([
        { role: "system", content: outils.invitePourNlu() },
        {
          role: "system",
          content:
            "Laboratoire de recette : aucun referentiel scolaire n'est charge. " +
            "Si une demande exige un identifiant de classe ou de periode que tu ne connais pas, " +
            "demande une clarification plutot que d'inventer.",
        },
        { role: "user", content: texte },
      ]);
      const plan = r.objet;
      if (!plan) return { clarify: "Je n'ai pas compris la demande." };
      return plan;
    },
    transcribe: async (media) => {
      if (!media) return { texte: "", langue: null };
      const r = await ia.transcrire(media.data ?? media, { nomFichier: media.filename ?? "vocal.ogg" });
      // Le texte entendu est annonce ICI, en clair, parce que c'est l'objet
      // meme de la recette. En production il ne serait pas journalise.
      vert(`  [STT] « ${String(r.texte).slice(0, 160)} »  (${r.langue ?? "?"}, ${r.dureeMs} ms)`);
      return { texte: r.texte, langue: r.langue, dureeAudioS: r.dureeAudioS ?? null };
    },
  });

  // --- 5. L'ecoute --------------------------------------------------------
  let traites = 0;
  provider.onMessage(async (msg) => {
    traites += 1;
    bleu(`\n--- message ${traites} recu ---`);
    gris(`  type ${msg.kind}  run ${msg.runId}`);
    const t0 = Date.now();
    try {
      const r = await agent.handle(msg);
      vert(`  statut ${r.status}${r.etape ? ` (${r.etape})` : ""} en ${Date.now() - t0} ms`);
    } catch (e) {
      rouge(`  le gestionnaire a leve : ${resumerErreur(e)}`);
      console.error(JSON.stringify(decrireErreur(e), null, 2));
    }
  });

  await provider.connect();
  const debut = Date.now();
  while (provider.getConnectionStatus().state !== "ready") {
    if (Date.now() - debut > 10 * 60 * 1000) throw new Error("session non prete");
    await new Promise((r) => setTimeout(r, 2000));
  }

  // --- 5 bis. QUEL COMPTE TIENT CETTE SESSION, ET LES QUATRE SOUS-SYSTEMES
  //
  // La question du compte est decisive, et elle a probablement explique le
  // silence de la veille. Si la session est liee au telephone du SUPER_ADMIN
  // lui-meme, ses messages sont « fromMe » : whatsapp-web.js n'emet alors
  // AUCUN evenement `message` pour eux, et l'ecoute ne verra jamais rien,
  // quoi qu'il envoie. Il faut le dire avant d'attendre pour rien.
  bleu("\n== 5. Le compte lie, et les sous-systemes ==");
  const identiteSession = await provider._client.pupPage
    .evaluate(() => {
      try {
        const { getMaybeMeLidUser, getMaybeMePnUser } = window.require("WAWebUserPrefsMeUser");
        // Quatre chiffres : de quoi trancher sans exposer le numero.
        const fin = (w) => {
          const u = String(w?.user ?? "");
          return u ? u.slice(-4) : null;
        };
        return { telephonique: fin(getMaybeMePnUser()), lid: fin(getMaybeMeLidUser()) };
      } catch (e) {
        return { erreur: String(e?.message ?? e).slice(0, 160) };
      }
    })
    .catch((e) => ({ erreur: resumerErreur(e) }));

  const finSession = identiteSession.telephonique ?? null;
  const finAttendue = numero.slice(-4);
  gris(`  compte lie : •••${finSession ?? "????"}   expediteur attendu : •••${finAttendue}`);
  let receptionPossible = true;
  if (!finSession) {
    rouge("  Le compte lie n'a pas pu etre lu : la reception reste incertaine.");
  } else if (finSession === finAttendue) {
    receptionPossible = false;
    rouge("  LA SESSION EST LIEE AU COMPTE DU SUPER_ADMIN LUI-MEME.");
    rouge("  Ses messages seront « fromMe » : AUCUN evenement de reception ne");
    rouge("  sera emis, et cette ecoute ne verra jamais rien de lui.");
    gris("  Pour eprouver l'entree, il faut appairer le telephone de");
    gris("  l'ETABLISSEMENT — celui qui RECOIT les messages du SUPER_ADMIN.");
  } else {
    vert("  comptes distincts : les messages du SUPER_ADMIN arriveront bien comme entrants");
  }

  // Les quatre sous-systemes, verifies et non supposes.
  const sous = {
    chromium: provider._client.pupBrowser?.isConnected?.() === true,
    page: provider._client.pupPage?.isClosed?.() === false,
    downloadMedia: typeof provider.getMedia === "function",
    stt: ia.transcripteurs.length > 0,
    piper: (amorce.langues ?? []).length === 2,
  };
  for (const [nom, ok] of Object.entries(sous)) {
    (ok ? vert : rouge)(`  ${ok ? "OK   " : "ECHEC"} ${nom}`);
  }
  if (Object.values(sous).some((x) => !x)) {
    rouge("\n  Un sous-systeme manque : l'environnement n'est PAS pret.");
    process.exit(5);
  }

  console.log();
  if (receptionPossible) {
    vert("ENVIRONNEMENT PRÊT — RÉCEPTION VOCALE ACTIVÉE — EN ATTENTE DU SUPER_ADMIN.");
  } else {
    rouge("ENVIRONNEMENT PRET MAIS RECEPTION IMPOSSIBLE : mauvais compte appaire.");
  }
  console.log();
  gris(`  Envoyez une note vocale depuis ${masque(numero)} vers le numero de cette session.`);
  gris("  Une phrase ordinaire suffit : aucune demande scolaire n'est necessaire.");
  gris("  Le dos scolaire est SIMULE : aucune donnee reelle ne sera lue ni ecrite.");
  gris("  Ctrl-C pour arreter.");

  // Un battement visible : un terminal muet ne distingue pas l'attente de la
  // panne, et cette session peut rester ouverte longtemps.
  const battement = setInterval(() => {
    const etat = provider.getConnectionStatus();
    tracer({
      type: "school.whatsapp.battement",
      etat: etat.state,
      messagesTraites: traites,
      marcheS: Math.round((Date.now() - debut) / 1000),
      memoireMo: Math.round(process.memoryUsage().rss / 1048576),
    });
  }, 60_000);
  battement.unref?.();

  // Arrêt propre : Chromium laissé ouvert garde un appareil lié connecté pour
  // rien, et le démon Piper garde 120 Mo de modèles en mémoire.
  const arreter = async (signal) => {
    console.log();
    bleu(`== ${signal} : fermeture ==`);
    clearInterval(battement);
    await provider.disconnect().catch((e) => gris(`  ${resumerErreur(e)}`));
    await voix.shutdown().catch(() => {});
    try {
      unlinkSync(cheminVerrou);
    } catch {
      /* deja parti */
    }
    gris(`  ${traites} message(s) traite(s), ${dos.appels.length} appel(s) simule(s)`);
    vert("  ferme");
    process.exit(0);
  };
  process.on("SIGINT", () => arreter("SIGINT"));
  process.on("SIGTERM", () => arreter("SIGTERM"));

  // On ne rend pas la main : l'écoute est le but.
  await new Promise(() => {});
}

principal().catch((e) => {
  rouge(`Interrompu : ${resumerErreur(e, { max: 300 })}`);
  console.error(JSON.stringify(decrireErreur(e), null, 2));
  process.exit(1);
});
