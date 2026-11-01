import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { IdentityStorePersistant, masquer, normaliserNumero, numeroDeJid } from "../src/identity-store.js";

const bac = () => mkdtempSync(join(tmpdir(), "ident-"));
const ADMIN = "staff-admin-1";
// Numéros fictifs : aucun numéro réel ne figure dans le dépôt.
const NUM = "23500000001";
const JID = `${NUM}@c.us`;

test("un numéro inconnu n'est jamais reconnu", () => {
  const d = bac();
  try {
    const s = new IdentityStorePersistant({ chemin: join(d, "ident.json") });
    assert.equal(s.resolve("23599999999@c.us"), null);
    assert.deepEqual(s.etatDe("23599999999@c.us"), { statut: "inconnu" });
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("une liaison explicite rend le responsable reconnaissable", () => {
  const d = bac();
  try {
    const s = new IdentityStorePersistant({ chemin: join(d, "ident.json") });
    assert.deepEqual(s.lier({ numero: NUM, utilisateurId: "u1", nom: "Awa", role: "SURVEILLANT", parQui: ADMIN }), { ok: true });
    const r = s.resolve(JID);
    assert.equal(r.id, "u1");
    assert.equal(r.role, "SURVEILLANT");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("une liaison sans auteur est refusée : elle ne serait pas auditable", () => {
  const d = bac();
  try {
    const s = new IdentityStorePersistant({ chemin: join(d, "ident.json") });
    assert.deepEqual(s.lier({ numero: NUM, utilisateurId: "u1", role: "SURVEILLANT" }), { ok: false, raison: "auteur_requis" });
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("un numéro déjà lié ne peut pas être détourné vers un autre compte", () => {
  const d = bac();
  try {
    const s = new IdentityStorePersistant({ chemin: join(d, "ident.json") });
    s.lier({ numero: NUM, utilisateurId: "u1", role: "SURVEILLANT", parQui: ADMIN });
    const r = s.lier({ numero: NUM, utilisateurId: "u2", role: "DIRECTION", parQui: ADMIN });
    assert.equal(r.ok, false);
    assert.equal(r.raison, "deja_lie");
    assert.equal(s.resolve(JID).id, "u1", "l'association d'origine doit tenir");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("les liaisons survivent à un redémarrage", () => {
  const d = bac();
  try {
    const f = join(d, "ident.json");
    new IdentityStorePersistant({ chemin: f }).lier({ numero: NUM, utilisateurId: "u1", role: "SURVEILLANT", parQui: ADMIN });
    // Nouvelle instance = redémarrage du processus.
    const apres = new IdentityStorePersistant({ chemin: f });
    assert.equal(apres.resolve(JID).id, "u1", "sans persistance, plus personne ne serait reconnu");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("la révocation est immédiate", () => {
  const d = bac();
  try {
    const s = new IdentityStorePersistant({ chemin: join(d, "ident.json") });
    s.lier({ numero: NUM, utilisateurId: "u1", role: "SURVEILLANT", parQui: ADMIN });
    assert.deepEqual(s.revoquer({ numero: NUM, parQui: ADMIN }), { ok: true });
    assert.equal(s.resolve(JID), null);
    assert.equal(s.etatDe(JID).statut, "revoque");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("un compte suspendu ne peut plus agir, mais garde son historique", () => {
  const d = bac();
  try {
    const s = new IdentityStorePersistant({ chemin: join(d, "ident.json") });
    s.lier({ numero: NUM, utilisateurId: "u1", role: "SURVEILLANT", parQui: ADMIN });
    s.suspendre({ numero: NUM, parQui: ADMIN });
    assert.equal(s.resolve(JID), null);
    assert.equal(s.etatDe(JID).statut, "suspendu");
    s.suspendre({ numero: NUM, suspendu: false, parQui: ADMIN });
    assert.equal(s.resolve(JID).id, "u1", "la reactivation doit rendre l'acces");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("un changement de téléphone révoque l'ancien numéro", () => {
  const d = bac();
  try {
    const s = new IdentityStorePersistant({ chemin: join(d, "ident.json") });
    const NOUVEAU = "23500000002";
    s.lier({ numero: NUM, utilisateurId: "u1", nom: "Awa", role: "SURVEILLANT", parQui: ADMIN });
    assert.deepEqual(s.remplacerNumero({ ancien: NUM, nouveau: NOUVEAU, parQui: ADMIN }), { ok: true });
    assert.equal(s.resolve(JID), null, "l'ancien telephone ne doit plus rien pouvoir faire");
    assert.equal(s.resolve(`${NOUVEAU}@c.us`).id, "u1");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("chaque liaison et révocation est journalisée, numéro masqué", () => {
  const d = bac();
  try {
    const evts = [];
    const s = new IdentityStorePersistant({ chemin: join(d, "ident.json"), journal: (e) => evts.push(e) });
    s.lier({ numero: NUM, utilisateurId: "u1", role: "SURVEILLANT", parQui: ADMIN });
    s.revoquer({ numero: NUM, parQui: ADMIN });
    assert.deepEqual(evts.map((e) => e.evenement), ["liaison", "revocation"]);
    assert.equal(evts[0].parQui, ADMIN);
    assert.equal(JSON.stringify(evts).includes(NUM), false, "le numero complet ne doit jamais etre journalise");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("un fichier corrompu ne fait reconnaître personne", () => {
  const d = bac();
  try {
    const f = join(d, "ident.json");
    writeFileSync(f, "{pas du json", "utf8");
    const s = new IdentityStorePersistant({ chemin: f });
    assert.equal(s.resolve(JID), null, "le defaut sur doit etre de ne reconnaitre personne");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("la liste des actives masque les numéros", () => {
  const d = bac();
  try {
    const s = new IdentityStorePersistant({ chemin: join(d, "ident.json") });
    s.lier({ numero: NUM, utilisateurId: "u1", nom: "Awa", role: "SURVEILLANT", parQui: ADMIN });
    const l = s.listerActives();
    assert.equal(l.length, 1);
    assert.equal(l[0].numeroMasque.includes("•"), true);
    assert.equal(JSON.stringify(l).includes(NUM), false);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("normalisation des numéros et des JID", () => {
  assert.equal(normaliserNumero("+235 686-637 37"), "23568663737");
  assert.equal(numeroDeJid("23568663737@c.us"), "23568663737");
  assert.match(masquer("23500000001"), /^235•+001$/);
});

// --- Rechargement a chaud ---------------------------------------------------
// Sans lui, provisionner un responsable exigeait de redemarrer le service :
// couper WhatsApp, reprendre le verrou, et faire appuyer un humain sur un
// bouton — pour une ligne ajoutee dans un fichier.

test("une association ajoutee par un autre processus est vue sans redemarrage", () => {
  const d = bac();
  try {
    const f = join(d, "identites.json");
    const lecteur = new IdentityStorePersistant({ chemin: f });
    assert.equal(lecteur.resolve(`${NUM}@c.us`), null);

    // Un autre processus provisionne (c'est ce que fait le script de dépôt).
    const ecrivain = new IdentityStorePersistant({ chemin: f });
    ecrivain.lier({ numero: NUM, utilisateurId: "u-1", nom: "Awa", role: "DIRECTION", parQui: "admin-1" });

    assert.equal(lecteur.resolve(`${NUM}@c.us`)?.id, "u-1", "le lecteur doit voir la nouvelle association");
    assert.equal(lecteur.nombreActives, 1);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("une revocation faite dans le fichier prend effet immediatement", () => {
  const d = bac();
  try {
    const f = join(d, "identites.json");
    const ecrivain = new IdentityStorePersistant({ chemin: f });
    ecrivain.lier({ numero: NUM, utilisateurId: "u-1", nom: "Awa", role: "DIRECTION", parQui: "admin-1" });
    const lecteur = new IdentityStorePersistant({ chemin: f });
    assert.ok(lecteur.resolve(`${NUM}@c.us`));

    ecrivain.revoquer({ numero: NUM, parQui: "admin-1" });
    assert.equal(lecteur.resolve(`${NUM}@c.us`), null, "retirer un acces ne doit pas attendre un redemarrage");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("un fichier devenu illisible ne fait perdre aucune association", () => {
  // Ecraser l'etat connu parce qu'une ecriture s'est mal passee priverait
  // l'etablissement de son acces.
  const d = bac();
  try {
    const f = join(d, "identites.json");
    const m = new IdentityStorePersistant({ chemin: f });
    m.lier({ numero: NUM, utilisateurId: "u-1", nom: "Awa", role: "DIRECTION", parQui: "admin-1" });
    writeFileSync(f, "{tronque", "utf8");
    assert.equal(m.resolve(`${NUM}@c.us`)?.id, "u-1", "l'etat connu doit survivre a un fichier corrompu");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("un fichier inchange n'est pas relu a chaque message", () => {
  const d = bac();
  try {
    const f = join(d, "identites.json");
    const m = new IdentityStorePersistant({ chemin: f });
    m.lier({ numero: NUM, utilisateurId: "u-1", nom: "Awa", role: "DIRECTION", parQui: "admin-1" });
    m.resolve(`${NUM}@c.us`);
    assert.equal(m.rafraichir(), false, "aucun rechargement inutile");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
