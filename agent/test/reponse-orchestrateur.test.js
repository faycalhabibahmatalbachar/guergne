/**
 * Recette de l'orchestrateur de réponse.
 *
 * LE DÉFAUT QUE CES TESTS EMPÊCHENT DE REVENIR
 * ---------------------------------------------
 * L'assistant répondait deux fois : une réponse écrite, puis une note vocale
 * redisant la même chose. Le défaut n'était pas dans un module mais dans
 * l'absence de décision centrale, et un réglage par défaut — `texte_et_voix`.
 *
 * Ces tests portent donc d'abord sur le NOMBRE d'envois pour une réponse
 * logique, puis sur chaque chemin qui pourrait en produire un de trop.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  DECISIONS,
  ETATS,
  OrchestrateurReponse,
  avecOrchestrateur,
} from "../src/reponse/orchestrateur.js";
import { MODES, deciderSortie, demandeExplicite, normaliserMode, preferencePosee } from "../src/reponse/politique-sortie.js";
import { ControleurPresence, ETATS as ETATS_PRESENCE } from "../src/reponse/presence.js";

/** Un transport qui ne parle à personne, mais retient tout. */
function transport() {
  const textes = [];
  const audios = [];
  return {
    textes,
    audios,
    async sendText(jid, texte) {
      textes.push({ jid, texte });
      return { ok: true, idPartie: `T${textes.length}` };
    },
    async sendAudio(jid, media) {
      audios.push({ jid, octets: media?.data?.length ?? 0 });
      return { ok: true, idPartie: `A${audios.length}` };
    },
  };
}

/** Une production vocale qui réussit sans rien synthétiser. */
function voixQuiMarche() {
  const appels = [];
  return {
    appels,
    langues: new Map(),
    metriques: { envoyes: 0 },
    async parler(jid, texte) {
      appels.push({ jid, texte });
      return { ok: true, dureeS: 3.2, idPartie: `A${appels.length}` };
    },
  };
}

const SUPER = { role: "SUPER_ADMIN" };

// --- La politique de sortie ------------------------------------------------

test("le mode par defaut est le texte seul, meme pour une note vocale entrante", () => {
  // LE CŒUR DU DEFAUT. Parler ne veut pas dire vouloir etre ecoute.
  assert.equal(deciderSortie({ texteUtilisateur: "Bonjour, comment vas-tu ?" }).mode, MODES.TEXTE);
  assert.equal(deciderSortie({ texteUtilisateur: "" }).mode, MODES.TEXTE);
  // Une demande transcrite depuis un vocal reste du texte en sortie.
  assert.equal(deciderSortie({ texteUtilisateur: "Combien d'eleves en sixieme A ?" }).mode, MODES.TEXTE);
});

test("une demande vocale EXPLICITE est entendue, en francais et en arabe", () => {
  for (const phrase of [
    "Reponds-moi par une note vocale",
    "Réponds-moi en vocal s'il te plait",
    "Envoie-moi un message vocal",
    "Dis-le moi à l'oral",
    "Parle-moi",
    "أجب بالصوت",
    "أرسل لي رسالة صوتية",
  ]) {
    assert.equal(deciderSortie({ texteUtilisateur: phrase }).mode, MODES.VOIX, phrase);
  }
});

test("une demande ECRITE explicite est entendue aussi", () => {
  for (const phrase of ["Réponds-moi par écrit", "Pas de vocal s'il te plait", "Écris-moi", "اكتب لي"]) {
    assert.equal(deciderSortie({ texteUtilisateur: phrase }).mode, MODES.TEXTE, phrase);
  }
});

test("les deux formats seulement quand les deux sont demandes", () => {
  assert.equal(deciderSortie({ texteUtilisateur: "Réponds en texte et en vocal" }).mode, MODES.TEXTE_ET_VOIX);
  assert.equal(deciderSortie({ texteUtilisateur: "Envoie les deux" }).mode, MODES.TEXTE_ET_VOIX);
  // Et l'ordre des mots ne decide pas a la place de l'utilisateur.
  assert.equal(deciderSortie({ texteUtilisateur: "Réponds en vocal et par écrit" }).mode, MODES.TEXTE_ET_VOIX);
});

test("un mot isole ne declenche pas une note vocale", () => {
  // Le piege a eviter : un motif large enverrait de la voix a quelqu'un qui
  // parle d'autre chose.
  for (const phrase of [
    "J'ai un probleme de voix depuis hier",
    "Le cours d'audiovisuel de la 6e A",
    "Les absences en audio-visuel",
    "La voix de Madame Ngarta",
  ]) {
    assert.equal(deciderSortie({ texteUtilisateur: phrase }).mode, MODES.TEXTE, phrase);
  }
});

test("une preference n'est retenue que si elle est posee pour durer", () => {
  assert.equal(preferencePosee("Réponds-moi par une note vocale"), null);
  assert.equal(preferencePosee("Réponds-moi toujours par une note vocale").mode, MODES.VOIX);
  assert.equal(preferencePosee("Désormais, réponds par écrit").mode, MODES.TEXTE);
});

test("une voix indisponible devient du texte, et le dit", () => {
  const d = deciderSortie({ texteUtilisateur: "Réponds par une note vocale", voixDisponible: false });
  assert.equal(d.mode, MODES.TEXTE);
  assert.equal(d.raison, "repli_voix_indisponible");
  assert.equal(d.replis, MODES.VOIX);
});

test("les anciens noms de mode restent acceptes", () => {
  assert.equal(normaliserMode("texte_et_voix"), MODES.TEXTE_ET_VOIX);
  assert.equal(normaliserMode("TEXT_ONLY"), MODES.TEXTE);
  assert.equal(normaliserMode("voix"), MODES.VOIX);
  assert.equal(normaliserMode("n'importe quoi"), null);
});

// --- Un seul envoi par reponse logique -------------------------------------

test("une reponse logique donne UN SEUL message, et c'est du texte", async () => {
  const t = transport();
  const voix = voixQuiMarche();
  const o = new OrchestrateurReponse({ provider: t, voix });
  o.contexte("235@c.us", SUPER);

  const r = await o.repondre({ jid: "235@c.us", texte: "Il y a 28 eleves en 6e A.", idMessage: "M1" });

  assert.equal(r.envoye, true);
  assert.equal(r.mode, MODES.TEXTE);
  assert.equal(t.textes.length, 1);
  assert.equal(voix.appels.length, 0, "aucune synthese ne doit etre lancee en mode texte");
});

test("aucune synthese n'est LANCEE quand le mode ne la demande pas", async () => {
  // Ce n'est pas qu'on n'envoie pas l'audio : on ne le FABRIQUE pas. Jeter
  // 600 ms de calcul pour un fichier qu'on n'enverra pas serait absurde.
  const t = transport();
  const voix = voixQuiMarche();
  const o = new OrchestrateurReponse({ provider: t, voix });
  o.contexte("235@c.us", SUPER);
  await o.repondre({ jid: "235@c.us", texte: "Bonjour.", idMessage: "M1", demande: "Bonjour" });
  assert.equal(voix.appels.length, 0);
});

test("une demande vocale explicite donne UNE note vocale, et pas de texte", async () => {
  const t = transport();
  const voix = voixQuiMarche();
  const o = new OrchestrateurReponse({ provider: t, voix });
  o.contexte("235@c.us", SUPER);

  const r = await o.repondre({
    jid: "235@c.us",
    texte: "Il y a 28 eleves en 6e A.",
    idMessage: "M1",
    demande: "Réponds-moi par une note vocale",
  });

  assert.equal(r.mode, MODES.VOIX);
  assert.equal(voix.appels.length, 1);
  assert.equal(t.textes.length, 0, "le mode vocal seul ne doit pas doubler en texte");
});

test("les deux formats demandes donnent exactement un de chaque", async () => {
  const t = transport();
  const voix = voixQuiMarche();
  const o = new OrchestrateurReponse({ provider: t, voix });
  o.contexte("235@c.us", SUPER);

  await o.repondre({
    jid: "235@c.us",
    texte: "Il y a 28 eleves en 6e A.",
    idMessage: "M1",
    demande: "Envoie les deux",
  });

  assert.equal(t.textes.length, 1);
  assert.equal(voix.appels.length, 1);
});

test("un vocal qui echoue retombe sur le texte, jamais sur le silence", async () => {
  const t = transport();
  const voix = { langues: new Map(), async parler() { return { ok: false, raison: "moteur_indisponible" }; } };
  const o = new OrchestrateurReponse({ provider: t, voix });
  o.contexte("235@c.us", SUPER);

  const r = await o.repondre({
    jid: "235@c.us",
    texte: "Il y a 28 eleves en 6e A.",
    idMessage: "M1",
    demande: "Réponds par une note vocale",
  });

  assert.equal(r.envoye, true);
  assert.equal(r.repli, "texte_apres_echec_vocal");
  assert.equal(t.textes.length, 1);
});

test("la voix ne part pas vers un destinataire hors perimetre", async () => {
  const t = transport();
  const voix = voixQuiMarche();
  const o = new OrchestrateurReponse({ provider: t, voix });
  // Aucun role connu : dans le doute, c'est un parent ou un numero non lie.
  const r = await o.repondre({
    jid: "999@c.us",
    texte: "Votre enfant etait absent lundi.",
    idMessage: "M1",
    demande: "Réponds par une note vocale",
  });
  assert.equal(r.mode, MODES.TEXTE);
  assert.equal(r.raison, "repli_hors_perimetre_voix");
  assert.equal(voix.appels.length, 0);
});

// --- Doublons et obsolescence ----------------------------------------------

test("le meme message entrant ne recoit pas deux fois la meme reponse", async () => {
  const t = transport();
  const o = new OrchestrateurReponse({ provider: t });
  o.contexte("235@c.us", SUPER);

  const a = await o.repondre({ jid: "235@c.us", texte: "Bonjour.", idMessage: "M1" });
  const b = await o.repondre({ jid: "235@c.us", texte: "Bonjour.", idMessage: "M1" });

  assert.equal(a.envoye, true);
  assert.equal(b.envoye, false);
  assert.equal(b.decision, DECISIONS.DOUBLON);
  assert.equal(t.textes.length, 1, "un seul envoi pour deux tentatives identiques");
});

test("une reponse a une demande depassee n'est pas envoyee", async () => {
  const t = transport();
  const o = new OrchestrateurReponse({ provider: t });
  o.contexte("235@c.us", { ...SUPER, dernierEntrant: "M2" });

  const r = await o.repondre({ jid: "235@c.us", texte: "Quelle classe ?", idMessage: "M1" });
  assert.equal(r.envoye, false);
  assert.equal(r.decision, DECISIONS.OBSOLETE);
  assert.equal(t.textes.length, 0);
});

test("une reponse vide est refusee, pas envoyee a blanc", async () => {
  const t = transport();
  const o = new OrchestrateurReponse({ provider: t });
  for (const vide of ["", "   ", null, undefined]) {
    const r = await o.repondre({ jid: "235@c.us", texte: vide, idMessage: `M${Math.random()}` });
    assert.equal(r.decision, DECISIONS.VIDE);
  }
  assert.equal(t.textes.length, 0);
});

test("un envoi ambigu n'est pas rejoue a l'aveugle", async () => {
  // Le transport leve : l'envoi est INCERTAIN, pas rate. Une reprise ne doit
  // pas le repousser — une operation sensible pourrait avoir abouti.
  let appels = 0;
  const t = {
    async sendText() {
      appels += 1;
      throw new Error("reseau interrompu");
    },
  };
  const o = new OrchestrateurReponse({ provider: t });
  o.contexte("235@c.us", SUPER);

  const a = await o.repondre({ jid: "235@c.us", texte: "Operation effectuee.", idMessage: "M1" });
  assert.equal(a.envoye, false);
  assert.equal(a.decision, DECISIONS.TRANSPORT_INDISPONIBLE);

  const b = await o.repondre({ jid: "235@c.us", texte: "Operation effectuee.", idMessage: "M1" });
  assert.equal(b.decision, DECISIONS.DOUBLON, "la clef d'idempotence est posee avant l'envoi, volontairement");
  assert.equal(appels, 1);
});

// --- File par conversation -------------------------------------------------

test("les reponses d'une conversation sont serialisees, les conversations isolees", async () => {
  const ordre = [];
  const t = {
    async sendText(jid, texte) {
      ordre.push(`debut:${texte}`);
      await new Promise((r) => setTimeout(r, texte === "un" ? 30 : 1));
      ordre.push(`fin:${texte}`);
      return { ok: true };
    },
  };
  const o = new OrchestrateurReponse({ provider: t });
  o.contexte("A@c.us", SUPER);
  o.contexte("B@c.us", SUPER);

  await Promise.all([
    o.repondre({ jid: "A@c.us", texte: "un", idMessage: "M1" }),
    o.repondre({ jid: "A@c.us", texte: "deux", idMessage: "M2" }),
    o.repondre({ jid: "B@c.us", texte: "trois", idMessage: "M3" }),
  ]);

  // Dans la meme conversation, « un » se termine avant que « deux » commence.
  assert.ok(ordre.indexOf("fin:un") < ordre.indexOf("debut:deux"), ordre.join(" | "));
  // L'autre conversation n'a pas attendu la premiere.
  assert.ok(ordre.indexOf("debut:trois") < ordre.indexOf("fin:un"), ordre.join(" | "));
});

test("une file ne se rompt pas sur un echec", async () => {
  let premier = true;
  const t = {
    async sendText() {
      if (premier) {
        premier = false;
        throw new Error("boum");
      }
      return { ok: true };
    },
  };
  const o = new OrchestrateurReponse({ provider: t });
  o.contexte("A@c.us", SUPER);
  await o.repondre({ jid: "A@c.us", texte: "premier", idMessage: "M1" });
  const suite = await o.repondre({ jid: "A@c.us", texte: "second", idMessage: "M2" });
  assert.equal(suite.envoye, true, "la conversation ne doit pas rester bloquee");
});

// --- Indicateurs d'activite ------------------------------------------------

test("l'indicateur de frappe s'arrete avant l'envoi, et sur tous les chemins", async () => {
  const etats = [];
  const presence = new ControleurPresence({
    envoyer: async (etat) => etats.push(etat),
    rafraichirMs: 10_000,
  });
  const t = transport();
  const o = new OrchestrateurReponse({ provider: t, presence });
  o.contexte("235@c.us", SUPER);

  await o.commencerTraitement("235@c.us");
  assert.equal(presence.etatActif("235@c.us"), ETATS_PRESENCE.FRAPPE);
  await o.repondre({ jid: "235@c.us", texte: "Il y a 28 eleves.", idMessage: "M1" });

  assert.deepEqual(etats, [ETATS_PRESENCE.FRAPPE, ETATS_PRESENCE.ARRET]);
  assert.equal(presence.etatActif("235@c.us"), null, "rien ne doit rester actif apres l'envoi");
});

test("un refus nettoie aussi l'indicateur : pas de conversation bloquee", async () => {
  const etats = [];
  const presence = new ControleurPresence({ envoyer: async (e) => etats.push(e), rafraichirMs: 10_000 });
  const o = new OrchestrateurReponse({ provider: transport(), presence });
  o.contexte("235@c.us", { ...SUPER, dernierEntrant: "M2" });

  await o.commencerTraitement("235@c.us");
  const r = await o.repondre({ jid: "235@c.us", texte: "obsolete", idMessage: "M1" });

  assert.equal(r.decision, DECISIONS.OBSOLETE);
  assert.equal(presence.etatActif("235@c.us"), null);
  assert.ok(etats.includes(ETATS_PRESENCE.ARRET));
});

test("un echec de transport n'oublie pas d'arreter l'indicateur", async () => {
  const etats = [];
  const presence = new ControleurPresence({ envoyer: async (e) => etats.push(e), rafraichirMs: 10_000 });
  const o = new OrchestrateurReponse({
    provider: { async sendText() { throw new Error("boum"); } },
    presence,
  });
  o.contexte("235@c.us", SUPER);
  await o.commencerTraitement("235@c.us");
  await o.repondre({ jid: "235@c.us", texte: "une reponse", idMessage: "M1" });
  assert.equal(presence.etatActif("235@c.us"), null);
});

test("l'enregistrement audio n'est pose que pendant une vraie synthese", async () => {
  const etats = [];
  const presence = new ControleurPresence({ envoyer: async (e) => etats.push(e), rafraichirMs: 10_000 });
  const voix = voixQuiMarche();
  const o = new OrchestrateurReponse({ provider: transport(), presence, voix });
  o.contexte("235@c.us", SUPER);

  // Mode texte : aucun etat d'enregistrement, car rien n'est enregistre.
  await o.repondre({ jid: "235@c.us", texte: "Bonjour a vous.", idMessage: "M1" });
  assert.equal(etats.includes(ETATS_PRESENCE.ENREGISTREMENT), false);

  // Mode vocal : l'etat apparait, puis s'arrete.
  await o.repondre({
    jid: "235@c.us",
    texte: "Il y a 28 eleves en 6e A.",
    idMessage: "M2",
    demande: "Réponds par une note vocale",
  });
  assert.ok(etats.includes(ETATS_PRESENCE.ENREGISTREMENT));
  assert.equal(presence.etatActif("235@c.us"), null);
});

test("deux etats de presence ne sont jamais actifs ensemble", async () => {
  const presence = new ControleurPresence({ envoyer: async () => {}, rafraichirMs: 10_000 });
  await presence.frappe("235@c.us");
  await presence.enregistrement("235@c.us");
  assert.equal(presence.etatActif("235@c.us"), ETATS_PRESENCE.ENREGISTREMENT);
  await presence.toutArreter();
  assert.equal(presence.etatActif("235@c.us"), null);
});

test("un indicateur qui echoue n'empeche pas la reponse de partir", async () => {
  const presence = new ControleurPresence({
    envoyer: async () => {
      throw new Error("page occupee");
    },
    rafraichirMs: 10_000,
  });
  const t = transport();
  const o = new OrchestrateurReponse({ provider: t, presence });
  o.contexte("235@c.us", SUPER);
  await o.commencerTraitement("235@c.us");
  const r = await o.repondre({ jid: "235@c.us", texte: "Il y a 28 eleves.", idMessage: "M1" });
  assert.equal(r.envoye, true);
  assert.equal(t.textes.length, 1);
});

// --- Le point de passage obligatoire ---------------------------------------

test("le transport enveloppe fait passer sendText par l'orchestrateur", async () => {
  const t = transport();
  const enveloppe = avecOrchestrateur(t, { voix: voixQuiMarche() });
  enveloppe.contexteReponse("235@c.us", SUPER);

  // Le moteur appelle `sendText` comme avant : rien a changer chez lui.
  const r = await enveloppe.sendText("235@c.us", "Il y a 28 eleves en 6e A.");
  assert.equal(r.envoye, true);
  assert.equal(r.mode, MODES.TEXTE);
  assert.equal(t.textes.length, 1);

  // Et le doublon est arrete au meme endroit.
  assert.equal(enveloppe.metriquesReponse().demandes, 1);
});

test("le transport enveloppe laisse passer ce qui n'est pas une reponse", async () => {
  const t = transport();
  t.getConnectionStatus = () => ({ state: "ready" });
  const enveloppe = avecOrchestrateur(t, {});
  assert.equal(enveloppe.getConnectionStatus().state, "ready");
  // `sendAudio` reste accessible : la production vocale en a besoin.
  assert.equal(typeof enveloppe.sendAudio, "function");
});

test("le rapport distingue accepte de livre", async () => {
  const t = transport();
  const o = new OrchestrateurReponse({ provider: t });
  o.contexte("235@c.us", SUPER);
  const r = await o.repondre({ jid: "235@c.us", texte: "Il y a 28 eleves.", idMessage: "M1" });
  // Les etats s'arretent a « accepte ». Aucune livraison n'est affirmee : seul
  // un acquittement WhatsApp pourrait le dire.
  assert.deepEqual(r.etats, [ETATS.AUTORISEE, ETATS.ACCEPTEE]);
  assert.equal(r.etats.includes("livre"), false);
});

test("le rapport mesure la file, les doublons et les modes", async () => {
  const t = transport();
  const o = new OrchestrateurReponse({ provider: t });
  o.contexte("235@c.us", SUPER);
  await o.repondre({ jid: "235@c.us", texte: "une reponse", idMessage: "M1" });
  await o.repondre({ jid: "235@c.us", texte: "une reponse", idMessage: "M1" });
  const rapport = o.rapport();
  assert.equal(rapport.demandes, 2);
  assert.equal(rapport.envoyees, 1);
  assert.equal(rapport.doublons, 1);
  assert.equal(rapport.tauxDoublons, 0.5);
  assert.equal(rapport.modeDefaut, MODES.TEXTE);
  assert.equal(rapport.parMode[MODES.TEXTE], 1);
});

// --- Aucun chemin d'envoi parallele ----------------------------------------

test("le moteur n'envoie du texte que par sendText, jamais par un autre chemin", async () => {
  // CE TEST GARDE L'INVARIANT DE L'ARCHITECTURE.
  //
  // L'orchestrateur n'intercepte `sendText`. Si un jour le moteur se mettait a
  // appeler `sendMessage` ou `sendMedia` pour repondre du texte, la decision
  // centrale serait contournee sans que rien n'echoue — et le double envoi
  // pourrait revenir par la.
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../src/engine.js", import.meta.url), "utf8");
  const appels = [...source.matchAll(/this\.provider\.(\w+)\(/g)].map((m) => m[1]);
  const envoisInconnus = [...new Set(appels)].filter(
    (n) => /^send/.test(n) && !["sendText", "sendMedia", "sendAudio"].includes(n),
  );
  assert.deepEqual(envoisInconnus, [], `chemin d'envoi non orchestre : ${envoisInconnus.join(", ")}`);
});
