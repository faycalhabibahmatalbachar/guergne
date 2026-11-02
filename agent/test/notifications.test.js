/**
 * Recette de la file de notifications.
 *
 * Trois propriétés sont verrouillées ici, et chacune corrige un défaut réel de
 * l'envoi direct : un échec n'est plus définitif, un redémarrage ne perd plus
 * les avis en vol, et un doublon ne part jamais deux fois.
 *
 * La troisième est la plus importante : un directeur qui reçoit trois fois la
 * même alerte cesse de les lire.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ETAT, FileNotifications, cleNotification } from "../src/notifications.js";

const bac = () => mkdtempSync(join(tmpdir(), "notif-"));
const JID_A = "23560000001@c.us";
const JID_B = "23560000002@c.us";

/** Transport factice : on décide qui échoue, et on compte. */
function transport({ echouerPour = [], echecsAvantSucces = 0 } = {}) {
  const envois = [];
  let restants = echecsAvantSucces;
  return {
    envois,
    envoyer: async (jid, texte) => {
      if (echouerPour.includes(jid)) throw new Error("conversation introuvable");
      if (restants > 0) {
        restants -= 1;
        throw new Error("ECONNRESET");
      }
      envois.push({ jid, texte });
    },
  };
}

const file = (t, extra = {}) =>
  new FileNotifications({ envoyer: t.envoyer, horloge: extra.horloge, chemin: extra.chemin, journal: extra.journal });

// --- Déduplication ---------------------------------------------------------

test("la meme notification ne part jamais deux fois", async () => {
  const t = transport();
  const f = file(t);
  const n = { jid: JID_A, texte: "Alerte seuil", cle: "run-1:alerte:0001", run: "run-1" };
  assert.equal((await f.envoyerMaintenant(n)).envoyee, true);
  const second = await f.envoyerMaintenant(n);
  assert.equal(second.ajoutee, false);
  assert.equal(second.raison, "doublon");
  assert.equal(t.envois.length, 1, "un directeur qui recoit deux fois la meme alerte cesse de les lire");
});

test("la cle porte le sujet, pas l'instant", () => {
  // Deux tentatives du meme avis doivent partager la meme cle, sinon la
  // deduplication ne sert a rien.
  const a = cleNotification({ run: "run-1", sujet: "rapport", jid: JID_A });
  const b = cleNotification({ run: "run-1", sujet: "rapport", jid: JID_A });
  assert.equal(a, b);
  // Mais deux destinataires, ou deux sujets, restent distincts.
  assert.notEqual(a, cleNotification({ run: "run-1", sujet: "rapport", jid: JID_B }));
  assert.notEqual(a, cleNotification({ run: "run-1", sujet: "operation", jid: JID_A }));
  assert.notEqual(a, cleNotification({ run: "run-2", sujet: "rapport", jid: JID_A }));
});

test("la cle ne porte pas le numero complet", () => {
  // Elle finit dans un fichier et dans les journaux.
  const c = cleNotification({ run: "r", sujet: "s", jid: JID_A });
  assert.ok(!c.includes("23560000001"));
  assert.match(c, /0001$/);
});

// --- Indépendance des destinataires ----------------------------------------

test("l'echec d'un destinataire n'empeche pas l'autre", async () => {
  // Grouper les deux ferait d'un probleme sur l'un un silence pour les deux.
  const t = transport({ echouerPour: [JID_A] });
  const f = file(t);
  await f.envoyerMaintenant({ jid: JID_A, texte: "x", cle: "r:s:0001" });
  await f.envoyerMaintenant({ jid: JID_B, texte: "x", cle: "r:s:0002" });
  assert.deepEqual(t.envois.map((e) => e.jid), [JID_B]);
  assert.equal(f.etat[ETAT.EN_ATTENTE], 1, "celui qui a echoue reste en file");
  assert.equal(f.etat[ETAT.ENVOYEE], 1);
});

// --- Reprise ----------------------------------------------------------------

test("un echec passager est repris, avec un recul croissant", async () => {
  let t0 = 1000;
  const t = transport({ echecsAvantSucces: 2 });
  const f = file(t, { horloge: () => t0 });

  await f.envoyerMaintenant({ jid: JID_A, texte: "x", cle: "r:s:0001" });
  assert.equal(t.envois.length, 0, "premier essai en echec");

  // Trop tot : rien ne part.
  t0 += 1000;
  assert.deepEqual(await f.traiter(), { envoyees: 0, echouees: 0, abandonnees: 0 });

  // Apres le recul : second essai, encore en echec.
  t0 += 10_000;
  await f.traiter();
  assert.equal(t.envois.length, 0);

  // Troisieme essai : il passe.
  t0 += 60_000;
  await f.traiter();
  assert.equal(t.envois.length, 1);
  assert.equal(f.etat[ETAT.ENVOYEE], 1);
});

test("au-dela de quatre tentatives, on abandonne plutot que d'encombrer la file", async () => {
  let t0 = 1000;
  const t = transport({ echouerPour: [JID_A] });
  const f = file(t, { horloge: () => t0 });
  await f.envoyerMaintenant({ jid: JID_A, texte: "x", cle: "r:s:0001" });
  for (let i = 0; i < 5; i += 1) {
    t0 += 200_000;
    await f.traiter();
  }
  assert.equal(f.etat[ETAT.ABANDONNEE], 1);
  assert.equal(f.etat[ETAT.EN_ATTENTE], 0);
  // Et on cesse d'essayer : insister n'aboutira pas.
  const avant = f.historique(1)[0].tentatives;
  t0 += 200_000;
  await f.traiter();
  assert.equal(f.historique(1)[0].tentatives, avant);
});

// --- Persistance ------------------------------------------------------------

test("un avis en attente survit au redemarrage", async () => {
  const d = bac();
  try {
    const chemin = join(d, "notifications.json");
    let t0 = 1000;
    const t1 = transport({ echouerPour: [JID_A] });
    const f1 = file(t1, { chemin, horloge: () => t0 });
    await f1.envoyerMaintenant({ jid: JID_A, texte: "Alerte", cle: "r:s:0001", run: "r" });
    assert.equal(f1.etat[ETAT.EN_ATTENTE], 1);

    // Redemarrage : nouveau processus, meme fichier, transport retabli.
    t0 += 100_000;
    const t2 = transport();
    const f2 = file(t2, { chemin, horloge: () => t0 });
    assert.equal(f2.etat[ETAT.EN_ATTENTE], 1, "l'avis en vol ne doit pas disparaitre avec le processus");
    await f2.traiter();
    assert.equal(t2.envois.length, 1);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("un avis deja envoye n'est pas renvoye apres redemarrage", async () => {
  // C'est ce qui rend une reprise apres incident sure.
  const d = bac();
  try {
    const chemin = join(d, "notifications.json");
    const t1 = transport();
    const f1 = file(t1, { chemin });
    await f1.envoyerMaintenant({ jid: JID_A, texte: "x", cle: "r:s:0001" });

    const t2 = transport();
    const f2 = file(t2, { chemin });
    const r = await f2.envoyerMaintenant({ jid: JID_A, texte: "x", cle: "r:s:0001" });
    assert.equal(r.raison, "doublon");
    assert.equal(t2.envois.length, 0);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("un fichier illisible ne bloque pas la file", async () => {
  const d = bac();
  try {
    const chemin = join(d, "notifications.json");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(chemin, "{tronque", "utf8");
    const t = transport();
    const f = file(t, { chemin });
    // Le pire cas est une notification renvoyee, jamais une donnee perdue —
    // et c'est preferable au silence.
    assert.equal((await f.envoyerMaintenant({ jid: JID_A, texte: "x", cle: "r:s:0001" })).envoyee, true);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

// --- Pièce jointe -----------------------------------------------------------

test("une piece jointe qui echoue ne fait pas renvoyer le texte", async () => {
  // Le destinataire a deja l'essentiel.
  const envois = [];
  const f = new FileNotifications({
    envoyer: async (jid, texte) => envois.push({ jid, texte }),
    envoyerMedia: async () => {
      throw new Error("media refuse");
    },
  });
  const r = await f.envoyerMaintenant({ jid: JID_A, texte: "Bilan", cle: "r:s:0001", media: { data: Buffer.from("x") } });
  assert.equal(r.envoyee, true);
  assert.equal(envois.length, 1);
  assert.equal(f.etat[ETAT.ENVOYEE], 1);
});

// --- Observabilité ----------------------------------------------------------

test("l'historique ne divulgue ni numero complet ni contenu du message", async () => {
  const t = transport();
  const f = file(t);
  await f.envoyerMaintenant({ jid: JID_A, texte: "Absences de Fatimé ABAKAR", cle: "r:s:0001", run: "r" });
  const h = JSON.stringify(f.historique());
  assert.ok(!h.includes("23560000001"), "aucun numero complet");
  assert.ok(!h.includes("ABAKAR"), "aucun contenu de message");
  assert.match(h, /"etat":"envoyee"/);
});

test("l'etat de la file se lit d'un coup d'oeil", async () => {
  const t = transport({ echouerPour: [JID_B] });
  const f = file(t);
  await f.envoyerMaintenant({ jid: JID_A, texte: "x", cle: "r:s:0001" });
  await f.envoyerMaintenant({ jid: JID_B, texte: "x", cle: "r:s:0002" });
  assert.deepEqual(f.etat, { total: 2, envoyee: 1, en_attente: 1, abandonnee: 0 });
});

test("une entree incomplete est refusee", async () => {
  const f = file(transport());
  for (const mauvaise of [{ texte: "x", cle: "c" }, { jid: JID_A, cle: "c" }, { jid: JID_A, texte: "x" }]) {
    assert.equal(f.ajouter(mauvaise).ajoutee, false, JSON.stringify(mauvaise));
  }
});

test("la file refuse d'etre construite sans transport", () => {
  assert.throws(() => new FileNotifications({}), /envoyer. requis/);
});
