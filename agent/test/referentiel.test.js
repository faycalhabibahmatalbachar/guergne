import test from "node:test";
import assert from "node:assert/strict";

import { Referentiel } from "../src/referentiel.js";
import { resoudreNomsEleves, separerNoms } from "../src/resolution-eleves.js";

const CLASSES = [
  { id: "11111111-1111-1111-1111-111111111111", libelle: "6ème B", effectif: 45 },
  { id: "22222222-2222-2222-2222-222222222222", libelle: "3ème A", effectif: 38 },
];
const PERIODES = [{ id: "33333333-3333-3333-3333-333333333333", libelle: "2ème Trimestre", numero: 2 }];

/** Client minimal qui compte ses appels et retient le périmètre demandé. */
function clientFactice({ classes = CLASSES, periodes = PERIODES, ok = true } = {}) {
  const appels = { classes: 0, periodes: 0, acteurs: [] };
  return {
    appels,
    async listerClasses(_p, ctx) {
      appels.classes += 1;
      appels.acteurs.push(ctx?.actorId);
      return ok ? { ok: true, data: classes } : { ok: false, message: "Droits insuffisants." };
    },
    async listerPeriodes(_p, ctx) {
      appels.periodes += 1;
      return ok ? { ok: true, data: periodes } : { ok: false, message: "Droits insuffisants." };
    },
  };
}

test("les listes sont lues une fois puis servies depuis le cache", async () => {
  const c = clientFactice();
  const r = new Referentiel({ guergne: c });
  const a = await r.pour("acteur-1");
  const b = await r.pour("acteur-1");
  assert.deepEqual(a.classes, CLASSES);
  assert.deepEqual(b.periodes, PERIODES);
  assert.equal(c.appels.classes, 1, "la seconde demande doit venir du cache");
  assert.equal(c.appels.periodes, 1);
});

test("le cache est cloisonné par acteur — sinon le RBAC serait contourné", async () => {
  // Un acteur ne doit jamais hériter des listes d'un autre : le garde de
  // guergné filtre par périmètre, et mutualiser le cache annulerait ce filtre
  // sans qu'aucune requête ne paraisse fautive.
  const c = clientFactice();
  const r = new Referentiel({ guergne: c });
  await r.pour("acteur-1");
  await r.pour("acteur-2");
  assert.equal(c.appels.classes, 2, "chaque acteur doit déclencher sa propre lecture");
  assert.deepEqual(c.appels.acteurs, ["acteur-1", "acteur-2"]);
});

test("le périmètre de l'acteur est transmis à la plateforme", async () => {
  const c = clientFactice();
  await new Referentiel({ guergne: c }).pour("acteur-42");
  assert.deepEqual(c.appels.acteurs, ["acteur-42"]);
});

test("le cache expire", async () => {
  const c = clientFactice();
  let t = 1000;
  const r = new Referentiel({ guergne: c, ttlMs: 500, maintenant: () => t });
  await r.pour("a");
  t += 400;
  await r.pour("a");
  assert.equal(c.appels.classes, 1, "avant péremption : cache");
  t += 200;
  await r.pour("a");
  assert.equal(c.appels.classes, 2, "après péremption : relecture");
});

test("un échec de lecture ne casse pas l'agent et n'est PAS mis en cache", async () => {
  // L'agent doit rester capable de répondre, quitte à ne pas nommer les classes.
  // Et le message suivant doit réessayer : graver l'échec condamnerait la
  // conversation entière pour une panne d'une seconde.
  const c = clientFactice({ ok: false });
  const r = new Referentiel({ guergne: c });
  const a = await r.pour("a");
  assert.deepEqual(a.classes, []);
  assert.deepEqual(a.periodes, []);
  await r.pour("a");
  assert.equal(c.appels.classes, 2, "un échec doit être réessayé");
});

test("un client qui lève une exception est traité comme un échec", async () => {
  const r = new Referentiel({
    guergne: {
      listerClasses: async () => {
        throw new Error("réseau coupé");
      },
      listerPeriodes: async () => ({ ok: true, data: PERIODES }),
    },
  });
  const a = await r.pour("a");
  assert.deepEqual(a.classes, []);
  // La moitié qui a répondu est quand même servie.
  assert.deepEqual(a.periodes, PERIODES);
});

test("oublier() force la relecture", async () => {
  const c = clientFactice();
  const r = new Referentiel({ guergne: c });
  await r.pour("a");
  r.oublier();
  await r.pour("a");
  assert.equal(c.appels.classes, 2);
});

test("le texte de l'invite porte les identifiants ENTIERS", () => {
  // Tronquer un UUID obligerait le modèle à le compléter, c'est-à-dire à
  // inventer — exactement ce que ce module existe pour empêcher.
  const texte = Referentiel.enTexte({ classes: CLASSES, periodes: PERIODES });
  assert.match(texte, /6ème B = 11111111-1111-1111-1111-111111111111/);
  assert.match(texte, /2ème Trimestre \(n°2\) = 33333333-3333-3333-3333-333333333333/);
  assert.ok(!texte.includes("…"), "aucun identifiant ne doit être abrégé");
  assert.match(texte, /demande une precision au lieu d'en inventer une/);
});

test("référentiel vide : le dire, plutôt que laisser croire à un établissement sans classes", () => {
  const texte = Referentiel.enTexte({ classes: [], periodes: [] });
  assert.match(texte, /Referentiel indisponible/);
  assert.match(texte, /ne cite aucune classe ni periode/);
});

test("au-delà du plafond, le reste est annoncé et non passé sous silence", () => {
  const beaucoup = Array.from({ length: 75 }, (_, i) => ({ id: `id-${i}`, libelle: `Classe ${i}` }));
  const texte = Referentiel.enTexte({ classes: beaucoup, periodes: [] });
  assert.match(texte, /15 autres classes non listees/);
});

test("un client absent est refusé à la construction", () => {
  assert.throws(() => new Referentiel({}), /client guergne requis/);
});

// --- Résolution des noms d'élèves ------------------------------------------
// Une absence posée sur le mauvais élève remonte au bulletin et déclenche une
// convocation. Ces tests verrouillent la règle : au moindre doute, demander.

const EFFECTIF = [
  { inscriptionId: "aaaa1111-0000-0000-0000-000000000001", eleveId: "e1", nom: "ABAKAR", prenom: "Fatimé" },
  { inscriptionId: "aaaa1111-0000-0000-0000-000000000002", eleveId: "e2", nom: "ADAM", prenom: "Mahamat" },
  { inscriptionId: "aaaa1111-0000-0000-0000-000000000003", eleveId: "e3", nom: "ADAM", prenom: "Mahamadou" },
];

const clientEffectif = (effectif = EFFECTIF, ok = true) => ({
  async listerElevesClasse() {
    return ok ? { ok: true, data: effectif } : { ok: false, message: "Droits insuffisants." };
  },
});

const OUTIL_APPEL = {
  nommes: { eleves: { vers: "absents", liste: true, role: "noms" } },
};

test("separerNoms decoupe les formulations naturelles", () => {
  assert.deepEqual(separerNoms("Mahamat, Zara et Issa"), ["Mahamat", "Zara", "Issa"]);
  assert.deepEqual(separerNoms(["Déjà", "une", "liste"]), ["Déjà", "une", "liste"]);
  assert.deepEqual(separerNoms(""), []);
});

test("un nom abîmé par la transcription est résolu", async () => {
  // Cas réel documenté : « Fatimé » ressort « Fatim ».
  const r = await resoudreNomsEleves({
    outil: OUTIL_APPEL,
    params: { classeId: "c1", eleves: "Fatim ABAKAR" },
    guergne: clientEffectif(),
    acteurId: "a1",
  });
  assert.equal(r.statut, "ok");
  assert.deepEqual(r.params.absents, ["aaaa1111-0000-0000-0000-000000000001"]);
  // Le champ nommé disparaît : l'API ne doit jamais recevoir un nom.
  assert.equal(r.params.eleves, undefined);
});

test("un homonyme n'est JAMAIS tranché au hasard", async () => {
  const r = await resoudreNomsEleves({
    outil: OUTIL_APPEL,
    params: { classeId: "c1", eleves: "Adam" },
    guergne: clientEffectif(),
    acteurId: "a1",
  });
  assert.equal(r.statut, "clarifier");
  assert.match(r.question, /plusieurs eleves/);
  assert.match(r.question, /Mahamat ADAM/);
  assert.match(r.question, /Mahamadou ADAM/);
});

test("un nom introuvable fait demander, pas inventer", async () => {
  const r = await resoudreNomsEleves({
    outil: OUTIL_APPEL,
    params: { classeId: "c1", eleves: "Jean DUPONT" },
    guergne: clientEffectif(),
    acteurId: "a1",
  });
  assert.equal(r.statut, "clarifier");
  assert.match(r.question, /aucun eleve nomme/);
});

test("sans classe, on refuse de chercher dans tout l'établissement", async () => {
  const r = await resoudreNomsEleves({
    outil: OUTIL_APPEL,
    params: { eleves: "Mahamat Adam" },
    guergne: clientEffectif(),
    acteurId: "a1",
  });
  assert.equal(r.statut, "clarifier");
  assert.match(r.question, /De quelle classe/);
});

test("effectif illisible : on abandonne au lieu de deviner un identifiant", async () => {
  const r = await resoudreNomsEleves({
    outil: OUTIL_APPEL,
    params: { classeId: "c1", eleves: "Fatim ABAKAR" },
    guergne: clientEffectif(EFFECTIF, false),
    acteurId: "a1",
  });
  assert.equal(r.statut, "clarifier");
  assert.match(r.question, /Operation abandonnee/);
});

test("plusieurs noms donnent plusieurs identifiants, dans l'ordre", async () => {
  const r = await resoudreNomsEleves({
    outil: OUTIL_APPEL,
    params: { classeId: "c1", eleves: "Fatim ABAKAR, Mahamat ADAM" },
    guergne: clientEffectif(),
    acteurId: "a1",
  });
  assert.equal(r.statut, "ok");
  assert.deepEqual(r.params.absents, [
    "aaaa1111-0000-0000-0000-000000000001",
    "aaaa1111-0000-0000-0000-000000000002",
  ]);
});

test("un outil sans paramètre nommé passe sans rien toucher", async () => {
  const params = { classeId: "c1", limite: 3 };
  const r = await resoudreNomsEleves({ outil: {}, params, guergne: clientEffectif(), acteurId: "a1" });
  assert.equal(r.statut, "ok");
  assert.deepEqual(r.params, params);
});

test("un champ non-liste reçoit un identifiant simple, pas un tableau", async () => {
  const r = await resoudreNomsEleves({
    outil: { nommes: { eleve: { vers: "inscriptionId", liste: false, role: "nom" } } },
    params: { classeId: "c1", eleve: "Fatim ABAKAR" },
    guergne: clientEffectif(),
    acteurId: "a1",
  });
  assert.equal(r.statut, "ok");
  assert.equal(r.params.inscriptionId, "aaaa1111-0000-0000-0000-000000000001");
});
