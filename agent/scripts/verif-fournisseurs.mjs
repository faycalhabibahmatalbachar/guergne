/**
 * Recette RÉELLE des fournisseurs IA — une requête synthétique par fournisseur.
 *
 * Ce script distingue ce que les tests unitaires ne peuvent pas prouver :
 * qu'une clé est acceptée, qu'un identifiant de modèle existe pour ce compte,
 * et combien de temps le fournisseur met à répondre.
 *
 * GARDE-FOUS
 * ----------
 *   - Aucune donnée scolaire : la requête est « Réponds uniquement PONG. ».
 *   - Les jetons générés sont plafonnés, et chaque fournisseur n'est appelé
 *     qu'une fois par épreuve. Pas de boucle, pas de campagne.
 *   - Aucune clé, ni aucun fragment de clé, n'est affiché.
 *
 *   node agent/scripts/verif-fournisseurs.mjs            # PONG + JSON + modeles
 *   node agent/scripts/verif-fournisseurs.mjs --repli    # + preuve de bascule reelle
 *   node agent/scripts/verif-fournisseurs.mjs --stt      # + point de transcription
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FOURNISSEURS, MoteurIA } from "../src/ia.js";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Clés locales. Le fichier d'un poste de développement nomme la clé Groq
 * `grok_api`, ce qui est précisément le piège que `ia.js` documente : ce n'est
 * PAS une clé xAI. On ne la range donc jamais dans la case `xai`.
 */
function clesLocales() {
  const f = resolve(racine, "ai_apikey.env");
  const t = existsSync(f) ? readFileSync(f, "utf8") : "";
  const v = (k) => (t.match(new RegExp("^" + k + "\\s*=\\s*(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
  return {
    groq: process.env.GROQ_API_KEY || v("grok_api"),
    mistral: process.env.MISTRAL_API_KEY || v("mistral_ai"),
    openrouter: process.env.OPENROUTER_API_KEY || v("openrouterai_api"),
    xai: process.env.XAI_API_KEY || v("xai_api"),
  };
}

const cles = Object.fromEntries(Object.entries(clesLocales()).filter(([, v]) => v));
const PONG = [{ role: "user", content: "Réponds uniquement PONG." }];
const ms = (n) => `${String(n).padStart(5)} ms`;

console.log(`fournisseurs avec une cle : ${Object.keys(cles).join(", ") || "aucun"}`);
console.log(`fournisseurs sans cle     : ${Object.keys(FOURNISSEURS).filter((n) => !cles[n]).join(", ") || "aucun"}`);

// --- 1. Modèles réellement accessibles avec chaque compte ------------------
console.log("\n=== 1. GET /models — le modele par defaut existe-t-il pour ce compte ? ===");
for (const [nom, def] of Object.entries(FOURNISSEURS)) {
  if (!cles[nom]) {
    console.log(`  ${nom.padEnd(11)} NON CONFIGURE — modele par defaut prevu : ${def.modele}`);
    continue;
  }
  try {
    const r = await fetch(`${def.base}/models`, { headers: { authorization: `Bearer ${cles[nom]}` } });
    if (!r.ok) {
      console.log(`  ${nom.padEnd(11)} HTTP ${r.status} — modeles non listables`);
      continue;
    }
    const ids = ((await r.json()).data ?? []).map((m) => m.id);
    const present = ids.includes(def.modele);
    console.log(
      `  ${nom.padEnd(11)} HTTP 200  ${String(ids.length).padStart(3)} modele(s)  ` +
        `${def.modele} : ${present ? "PRESENT" : "ABSENT — a corriger"}` +
        (def.transcription ? `  |  ${def.transcription} : ${ids.includes(def.transcription) ? "PRESENT" : "ABSENT"}` : ""),
    );
  } catch (e) {
    console.log(`  ${nom.padEnd(11)} ECHEC RESEAU — ${e.message}`);
  }
}

// --- 2. Appel réel minimal, fournisseur par fournisseur -------------------
console.log("\n=== 2. Appel reel minimal (une requete par fournisseur) ===");
const resume = [];
for (const nom of Object.keys(FOURNISSEURS)) {
  if (!cles[nom]) {
    resume.push({ nom, statut: "non configure", modele: FOURNISSEURS[nom].modele, latence: null, authentifie: null });
    console.log(`  ${nom.padEnd(11)} non configure (aucune cle) — ni authentifie, ni verifie`);
    continue;
  }
  // Un moteur par fournisseur : sans cela, le repli masquerait l'echec de
  // celui qu'on veut precisement eprouver.
  const m = new MoteurIA({ cles: { [nom]: cles[nom] }, ordre: [nom] });
  const debut = Date.now();
  try {
    const r = await m.completer(PONG, { maxTokens: 256 });
    const latence = Date.now() - debut;
    console.log(
      `  ${nom.padEnd(11)} OK   ${ms(latence)}  modele=${r.modele}  tokens=${r.tokens ?? "?"}  ` +
        `reponse=${JSON.stringify(r.texte.trim().slice(0, 40))}`,
    );
    resume.push({ nom, statut: "disponible", modele: r.modele, latence, authentifie: true });
  } catch (e) {
    const etat = m.etatFournisseurs[nom];
    const latence = Date.now() - debut;
    console.log(`  ${nom.padEnd(11)} ECHEC ${ms(latence)}  statut=${etat.statut}  code=${etat.dernierCode ?? "-"}  ${e.message.slice(0, 120)}`);
    resume.push({ nom, statut: etat.statut, modele: etat.modele, latence, authentifie: etat.authentifie });
  }
}

// --- 3. Réponse JSON -------------------------------------------------------
console.log("\n=== 3. Reponse JSON (mode natif ou consigne d'invite selon le fournisseur) ===");
for (const nom of Object.keys(FOURNISSEURS)) {
  if (!cles[nom]) {
    console.log(`  ${nom.padEnd(11)} non configure`);
    continue;
  }
  const m = new MoteurIA({ cles: { [nom]: cles[nom] }, ordre: [nom] });
  try {
    const r = await m.completerJson(
      [{ role: "user", content: 'Renvoie cet objet et rien d\'autre : {"etat":"ok"}' }],
      { maxTokens: 256 },
    );
    const bon = r.objet && r.objet.etat === "ok";
    console.log(
      `  ${nom.padEnd(11)} ${bon ? "OK  " : "A VERIFIER"}  jsonNatif=${FOURNISSEURS[nom].jsonNatif}  objet=${JSON.stringify(r.objet)}`,
    );
  } catch (e) {
    console.log(`  ${nom.padEnd(11)} ECHEC  ${e.message.slice(0, 120)}`);
  }
}

// --- 4. Repli réel ---------------------------------------------------------
if (process.argv.includes("--repli")) {
  console.log("\n=== 4. Repli reel : une cle invalide en tete de file ===");
  // Le secours ne peut pas être le fournisseur qu'on sabote : lui donner les
  // deux rôles ferait que la clé valide écrase la clé invalide, et la bascule
  // serait « prouvée » sans avoir eu lieu.
  // Et il doit être réellement disponible : un fournisseur en quota ferait
  // échouer l'épreuve pour une raison qui n'a rien à voir avec la bascule.
  const valides = Object.keys(cles).filter((n) => n !== "groq" && resume.find((r) => r.nom === n)?.statut === "disponible");
  if (valides.length === 0) {
    console.log("  impossible : aucun fournisseur authentifie (hors groq) pour servir de repli");
  } else {
    const secours = valides[0];
    // La cle bidon doit produire un 401 reel : c'est le chemin de code qu'on
    // veut prouver, pas une simulation.
    const m = new MoteurIA({
      cles: { groq: "cle-volontairement-invalide-pour-la-recette", [secours]: cles[secours] },
      ordre: ["groq", secours],
      journal: (e) => {
        if (e.type === "llm_echec" || e.type === "fournisseur_ecarte") console.log(`    [trace] ${JSON.stringify(e)}`);
      },
    });
    try {
      const r = await m.completer(PONG, { maxTokens: 256 });
      console.log(`  bascule OK : ${r.fournisseur} a repondu apres l'echec de groq`);
      console.log(`  etat groq  : ${JSON.stringify(m.etatFournisseurs.groq)}`);
    } catch (e) {
      console.log(`  ECHEC du repli : ${e.message.slice(0, 160)}`);
    }
  }
}

// --- 5. Point de transcription --------------------------------------------
if (process.argv.includes("--stt")) {
  console.log("\n=== 5. Transcription ===");
  const transcripteurs = Object.keys(FOURNISSEURS).filter((n) => FOURNISSEURS[n].transcription);
  console.log(`  fournisseurs declarant un point compatible OpenAI : ${transcripteurs.join(", ") || "aucun"}`);
  console.log("  xai : reconnaissance vocale sur POST /v1/stt, de forme differente — non branchee, donc non annoncee.");
  console.log("  openrouter, mistral : aucun point de transcription documente.");

  for (const nom of transcripteurs) {
    if (!cles[nom]) {
      console.log(`  ${nom} : non configure`);
      continue;
    }
    // Échantillon WAV minimal, 8 kHz mono, 0,5 s de silence. Il ne prouve pas
    // la QUALITE de la transcription — seulement que le point est joignable,
    // que la clé est acceptée et que l'identifiant de modèle est reconnu.
    const echantillons = 4000;
    const entete = Buffer.alloc(44);
    entete.write("RIFF", 0);
    entete.writeUInt32LE(36 + echantillons * 2, 4);
    entete.write("WAVEfmt ", 8);
    entete.writeUInt32LE(16, 16);
    entete.writeUInt16LE(1, 20);
    entete.writeUInt16LE(1, 22);
    entete.writeUInt32LE(8000, 24);
    entete.writeUInt32LE(16000, 28);
    entete.writeUInt16LE(2, 32);
    entete.writeUInt16LE(16, 34);
    entete.write("data", 36);
    entete.writeUInt32LE(echantillons * 2, 40);
    const wav = Buffer.concat([entete, Buffer.alloc(echantillons * 2)]);

    const form = new FormData();
    form.append("file", new Blob([wav], { type: "audio/wav" }), "silence.wav");
    form.append("model", FOURNISSEURS[nom].transcription);
    form.append("language", "fr");
    form.append("response_format", "json");
    const debut = Date.now();
    try {
      const r = await fetch(`${FOURNISSEURS[nom].base}/audio/transcriptions`, {
        method: "POST",
        headers: { authorization: `Bearer ${cles[nom]}` },
        body: form,
      });
      const corps = await r.text();
      console.log(
        `  ${nom} : HTTP ${r.status} en ${Date.now() - debut} ms  modele=${FOURNISSEURS[nom].transcription}\n` +
          `    corps : ${corps.slice(0, 160)}`,
      );
      console.log(
        "    lecture : un 200 prouve la cle, le modele et le point d'entree. Il ne prouve PAS la qualite\n" +
          "    de transcription d'un vrai message vocal — l'echantillon est silencieux.",
      );
    } catch (e) {
      console.log(`  ${nom} : ECHEC RESEAU — ${e.message}`);
    }
  }
}

// --- Synthèse --------------------------------------------------------------
console.log("\n=== SYNTHESE ===");
for (const r of resume) {
  console.log(
    `  ${r.nom.padEnd(11)} statut=${String(r.statut).padEnd(14)} authentifie=${String(r.authentifie).padEnd(5)} ` +
      `modele=${String(r.modele).padEnd(22)} latence=${r.latence != null ? `${r.latence} ms` : "-"}`,
  );
}
const utilisables = resume.filter((r) => r.authentifie === true).length;
console.log(`\n  ${utilisables} fournisseur(s) authentifie(s) sur ${Object.keys(FOURNISSEURS).length} connus.`);
if (utilisables === 0) process.exitCode = 1;
