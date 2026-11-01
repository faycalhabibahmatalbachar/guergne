import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FreinRedemarrage, VerrouInstance, evaluerVerrou, sonderProcessus } from "../src/verrou.js";

const bac = () => mkdtempSync(join(tmpdir(), "agent-verrou-"));
const muet = { log() {} };

/**
 * Sonde de processus factice.
 *
 * Les tests NE DOIVENT PAS dépendre des processus réels de la machine : un PID
 * inventé peut très bien exister sur la machine d'intégration, et le test
 * passerait ou échouerait selon l'hôte. On décrit donc explicitement le monde.
 */
const sondeFactice = (monde) => (pid) =>
  monde[pid] ?? { vivant: false, identite: null, commande: null, raison: "absent" };

const VIVANT = (identite = "900", commande = "node /home/container/index.js") => ({
  vivant: true,
  identite,
  commande,
  raison: "etat=S",
});

/** Fabrique un verrou prêt à l'emploi, avec horloge et sonde maîtrisées. */
function verrou(chemin, { pid, monde = {}, t = () => 1000, ttlMs = 60_000, instanceId }) {
  return new VerrouInstance({
    chemin,
    pid,
    ttlMs,
    horloge: t,
    sonde: sondeFactice(monde),
    journal: muet,
    ...(instanceId ? { instanceId } : {}),
  });
}

// --- Cas exigés par la recette ---------------------------------------------

test("propriétaire actif : la seconde instance s'arrête", () => {
  const d = bac();
  try {
    const f = join(d, "instance.lock");
    const monde = { 15: VIVANT("900"), 16: VIVANT("901") };
    assert.equal(verrou(f, { pid: 15, monde }).acquerir().ok, true);

    const r = verrou(f, { pid: 16, monde }).acquerir();
    assert.equal(r.ok, false, "deux instances sur la même session feraient bannir le numéro");
    assert.equal(r.detenuPar, 15);
    assert.equal(r.decision, "detenu");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("propriétaire arrêté : le verrou est repris immédiatement, sans attendre le TTL", () => {
  // C'est le cœur de la correction. L'ancienne version attendait 60 s d'horloge
  // alors que le processus était déjà mort — et n'y arrivait jamais si
  // l'horodatage était incohérent.
  const d = bac();
  try {
    const f = join(d, "instance.lock");
    verrou(f, { pid: 15, monde: { 15: VIVANT("900") } }).acquerir();

    // Même instant : seul l'état du processus a changé.
    const r = verrou(f, { pid: 16, monde: { 16: VIVANT("901") } }).acquerir();
    assert.equal(r.ok, true);
    assert.equal(r.decision, "perime-mort");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("PID réutilisé : un autre processus portant le même numéro n'est PAS le propriétaire", () => {
  // Dans un conteneur les PID repartent de zéro : le numéro 15 est reconstitué
  // à chaque démarrage. Sans l'identité, ce cas verrouille le service à vie.
  const d = bac();
  try {
    const f = join(d, "instance.lock");
    verrou(f, { pid: 15, monde: { 15: VIVANT("900") } }).acquerir();

    // Le PID 15 existe toujours, mais c'est un AUTRE processus (démarré plus tard).
    const r = verrou(f, { pid: 16, monde: { 15: VIVANT("4242"), 16: VIVANT("4243") } }).acquerir();
    assert.equal(r.ok, true);
    assert.equal(r.decision, "perime-reutilise");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("PID réutilisé par un programme qui n'est pas le nôtre (verrou d'ancienne génération)", () => {
  // Le verrou resté sur la production ne porte que `{pid, vuLe}` : aucune
  // identité à comparer. Le dernier indice est la commande du processus.
  const d = bac();
  try {
    const f = join(d, "instance.lock");
    writeFileSync(f, JSON.stringify({ pid: 15, vuLe: 1000 }), "utf8");
    const r = verrou(f, {
      pid: 16,
      monde: { 15: VIVANT(null, "/usr/sbin/sshd -D"), 16: VIVANT("901") },
      t: () => 1000,
    }).acquerir();
    assert.equal(r.ok, true);
    assert.equal(r.decision, "perime-reutilise");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("verrou périmé par TTL quand la liveness est indéterminable", () => {
  const d = bac();
  try {
    const f = join(d, "instance.lock");
    let t = 1000;
    const indetermine = { vivant: null, identite: null, commande: null, raison: "inconnu" };
    verrou(f, { pid: 15, monde: { 15: VIVANT("900") }, t: () => t, ttlMs: 5000 }).acquerir();

    t += 4000;
    assert.equal(
      verrou(f, { pid: 16, monde: { 15: indetermine }, t: () => t, ttlMs: 5000 }).acquerir().ok,
      false,
      "avant le TTL et sans preuve de mort, on refuse de démarrer",
    );

    t += 2000;
    const r = verrou(f, { pid: 16, monde: { 15: indetermine }, t: () => t, ttlMs: 5000 }).acquerir();
    assert.equal(r.ok, true);
    assert.equal(r.decision, "perime-ttl");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("horodatage dans l'avenir : le verrou ne se bloque pas à vie", () => {
  // Une horloge qui se recale au démarrage du conteneur rendait l'âge négatif,
  // donc toujours inférieur au TTL : plus aucun démarrage ne réussissait.
  const d = bac();
  try {
    const f = join(d, "instance.lock");
    writeFileSync(f, JSON.stringify({ pid: 15, vuLe: 10_000_000 }), "utf8");
    const r = verrou(f, {
      pid: 16,
      monde: { 15: { vivant: null, identite: null, commande: null, raison: "inconnu" } },
      t: () => 1000,
      ttlMs: 5000,
    }).acquerir();
    assert.equal(r.ok, true);
    assert.equal(r.decision, "perime-horloge");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("verrou corrompu : il n'identifie personne, il ne doit pas bloquer le service", () => {
  const d = bac();
  try {
    const f = join(d, "instance.lock");
    writeFileSync(f, "{ceci n'est pas du json", "utf8");
    const r = verrou(f, { pid: 16, monde: { 16: VIVANT("901") } }).acquerir();
    assert.equal(r.ok, true);
    assert.equal(r.decision, "perime-corrompu");
    assert.equal(JSON.parse(readFileSync(f, "utf8")).pid, 16);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("deux démarrages simultanés : un seul obtient le verrou", () => {
  const d = bac();
  try {
    const f = join(d, "instance.lock");
    const monde = { 15: VIVANT("900"), 16: VIVANT("901") };
    const a = verrou(f, { pid: 15, monde });
    const b = verrou(f, { pid: 16, monde });

    // Les deux évaluent un répertoire vide, puis tentent la création.
    const ra = a.acquerir();
    const rb = b.acquerir();
    assert.equal([ra.ok, rb.ok].filter(Boolean).length, 1, "exactement un gagnant");
    const gagnant = ra.ok ? a : b;
    assert.equal(gagnant.detientToujours(), true);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("arrêt propre : le verrou est libéré et la place est rendue", () => {
  const d = bac();
  try {
    const f = join(d, "instance.lock");
    const monde = { 15: VIVANT("900"), 16: VIVANT("901") };
    const a = verrou(f, { pid: 15, monde });
    a.acquerir();
    assert.equal(a.liberer(), true);
    assert.equal(existsSync(f), false);
    assert.equal(verrou(f, { pid: 16, monde }).acquerir().ok, true);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("arrêt brutal puis redémarrage : le verrou orphelin est repris", () => {
  // SIGKILL : aucun code de libération ne tourne. Le fichier reste, le
  // processus est mort. Le redémarrage doit aboutir sans intervention humaine.
  const d = bac();
  try {
    const f = join(d, "instance.lock");
    verrou(f, { pid: 15, monde: { 15: VIVANT("900") } }).acquerir();
    assert.equal(existsSync(f), true, "un arrêt brutal laisse le fichier derrière lui");

    const relance = verrou(f, { pid: 15, monde: { 15: VIVANT("5555") } });
    const r = relance.acquerir();
    assert.equal(r.ok, true, "le service doit redémarrer seul après un arrêt brutal");
    assert.equal(relance.detientToujours(), true);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

// --- Battement et propriété ------------------------------------------------

test("le battement n'actualise que NOTRE verrou", () => {
  const d = bac();
  try {
    const f = join(d, "instance.lock");
    let t = 1000;
    const monde = { 15: VIVANT("900"), 16: VIVANT("901") };
    const a = verrou(f, { pid: 15, monde, t: () => t });
    a.acquerir();

    t += 1000;
    assert.equal(a.rafraichir(), true);
    assert.equal(JSON.parse(readFileSync(f, "utf8")).vuLe, 2000);

    // Une autre instance s'approprie le fichier (reprise après panne réseau).
    const b = verrou(f, { pid: 16, monde, instanceId: "autre-instance" });
    writeFileSync(f, JSON.stringify({ version: 2, instanceId: "autre-instance", pid: 16, vuLe: t }), "utf8");

    assert.equal(a.rafraichir(), false, "l'instance évincée doit l'apprendre et s'arrêter");
    assert.equal(JSON.parse(readFileSync(f, "utf8")).instanceId, "autre-instance", "le verrou d'autrui est intact");
    assert.equal(b.detientToujours(), true);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("libérer ne retire jamais le verrou d'une autre instance", () => {
  const d = bac();
  try {
    const f = join(d, "instance.lock");
    const a = verrou(f, { pid: 15, monde: { 15: VIVANT("900") } });
    a.acquerir();
    writeFileSync(f, JSON.stringify({ version: 2, instanceId: "autre", pid: 99, vuLe: 1000 }), "utf8");
    assert.equal(a.liberer(), false);
    assert.equal(existsSync(f), true, "le verrou d'autrui doit survivre à notre arrêt");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("réacquérir dans le même processus est sans effet de bord", () => {
  const d = bac();
  try {
    const f = join(d, "instance.lock");
    const a = verrou(f, { pid: 15, monde: { 15: VIVANT("900") } });
    assert.equal(a.acquerir().decision, "libre");
    assert.equal(a.acquerir().decision, "a-nous");
    assert.equal(a.detientToujours(), true);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("le verrou écrit porte de quoi identifier son propriétaire", () => {
  const d = bac();
  try {
    const f = join(d, "instance.lock");
    verrou(f, { pid: 15, monde: { 15: VIVANT("900") }, t: () => 4242 }).acquerir();
    const v = JSON.parse(readFileSync(f, "utf8"));
    assert.equal(v.pid, 15);
    assert.equal(v.identiteProcessus, "900");
    assert.equal(v.demarreLe, 4242);
    assert.equal(v.vuLe, 4242);
    assert.match(v.instanceId, /\S/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

// --- Décision pure ---------------------------------------------------------

test("un PID vivant sans identité connue reste présumé propriétaire (doute → refus)", () => {
  // Se tromper dans l'autre sens lancerait une seconde instance WhatsApp.
  const r = evaluerVerrou({
    actuel: { pid: 15, vuLe: 1000 },
    moiInstanceId: "moi",
    maintenant: 1500,
    ttlMs: 60_000,
    sondage: VIVANT(null, "node index.js"),
  });
  assert.equal(r.decision, "detenu");
});

test("l'absence de verrou est un verrou libre", () => {
  assert.equal(evaluerVerrou({ actuel: null, moiInstanceId: "moi", maintenant: 0, ttlMs: 1, sondage: {} }).decision, "libre");
});

// --- Sonde réelle ----------------------------------------------------------

test("la sonde reconnaît le processus courant et rejette un PID absurde", () => {
  const moi = sonderProcessus(process.pid);
  assert.equal(moi.vivant, true);
  assert.equal(sonderProcessus(0).vivant, false);
  assert.equal(sonderProcessus(-1).vivant, false);
  assert.equal(sonderProcessus(2 ** 31).vivant, false, "un PID hors plage n'existe pas");
});

test("sous Linux, la sonde relève l'instant de démarrage — l'identité du processus", () => {
  const moi = sonderProcessus(process.pid);
  if (!existsSync("/proc/self/stat")) {
    assert.equal(moi.identite, null, "hors Linux, l'identité reste inconnue et le TTL tranche");
    return;
  }
  assert.match(String(moi.identite), /^\d+$/);
  assert.match(String(moi.commande), /node/);
});

// --- Frein de redémarrage --------------------------------------------------

test("le frein n'entrave pas un démarrage normal", () => {
  const d = bac();
  try {
    const fr = new FreinRedemarrage({ chemin: join(d, "r.json"), seuil: 3, horloge: () => 1000, journal: muet });
    assert.equal(fr.enregistrer().pauseMs, 0);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("au-delà du seuil, les redémarrages en rafale sont espacés", () => {
  const d = bac();
  try {
    const f = join(d, "r.json");
    let t = 1000;
    const neuf = () =>
      new FreinRedemarrage({ chemin: f, seuil: 3, fenetreMs: 120_000, pauseMs: 30_000, horloge: () => t, journal: muet });
    for (let i = 0; i < 3; i += 1) {
      assert.equal(neuf().enregistrer().pauseMs, 0);
      t += 1000;
    }
    const r = neuf().enregistrer();
    assert.equal(r.recents, 4);
    assert.equal(r.pauseMs, 30_000, "une boucle de redémarrages doit être ralentie, pas masquée");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("les démarrages anciens sortent de la fenêtre", () => {
  const d = bac();
  try {
    const f = join(d, "r.json");
    let t = 1000;
    const neuf = () => new FreinRedemarrage({ chemin: f, seuil: 2, fenetreMs: 10_000, horloge: () => t, journal: muet });
    neuf().enregistrer();
    neuf().enregistrer();
    t += 50_000;
    assert.equal(neuf().enregistrer().recents, 1, "un service stable ne garde pas d'ardoise");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
