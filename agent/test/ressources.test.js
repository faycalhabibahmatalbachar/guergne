/**
 * Recette du relevé de ressources.
 *
 * Ce module existe parce qu'un chiffre manquait au diagnostic du 2 novembre
 * 2026 : le plafond mémoire du conteneur. Ces tests vérifient qu'il le trouve
 * sous les deux versions de cgroup, et qu'il ne mente pas quand il ne sait pas.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { releverRessources, resumerRessources } from "../src/ressources.js";

const Mio = 1048576;

/** Faux système de fichiers : seuls les chemins fournis existent. */
function fauxLire(fichiers) {
  return (chemin) => {
    if (!(chemin in fichiers)) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    return fichiers[chemin];
  };
}

const MEMINFO = (totalMo, dispoMo) =>
  `MemTotal:       ${totalMo * 1024} kB\nMemFree:        1000 kB\nMemAvailable:   ${dispoMo * 1024} kB\n`;

const statFsFactice = (libreMo, totalMo) => () => ({
  bsize: 4096,
  blocks: (totalMo * Mio) / 4096,
  bavail: (libreMo * Mio) / 4096,
});

// --- cgroup v2 et v1 ------------------------------------------------------

test("lit le plafond sous cgroup v2", () => {
  const r = releverRessources({
    lire: fauxLire({
      "/sys/fs/cgroup/memory.max": String(512 * Mio),
      "/sys/fs/cgroup/memory.current": String(300 * Mio),
      "/proc/meminfo": MEMINFO(16384, 8000),
    }),
    statFs: statFsFactice(500, 2048),
  });
  assert.equal(r.memoirePlafondMo, 512);
  assert.equal(r.memoireUtiliseeMo, 300);
});

test("retombe sur cgroup v1 quand v2 est absent", () => {
  // Les deux coexistent selon l'hote : supposer l'un rend le releve muet sur
  // l'autre, et un releve muet est pire que pas de releve.
  const r = releverRessources({
    lire: fauxLire({
      "/sys/fs/cgroup/memory/memory.limit_in_bytes": String(1024 * Mio),
      "/sys/fs/cgroup/memory/memory.usage_in_bytes": String(700 * Mio),
      "/proc/meminfo": MEMINFO(16384, 8000),
    }),
    statFs: statFsFactice(500, 2048),
  });
  assert.equal(r.memoirePlafondMo, 1024);
  assert.equal(r.memoireUtiliseeMo, 700);
});

test("« max » signifie aucune limite, pas une limite nommee max", () => {
  const r = releverRessources({
    lire: fauxLire({ "/sys/fs/cgroup/memory.max": "max", "/proc/meminfo": MEMINFO(16384, 8000) }),
    statFs: statFsFactice(500, 2048),
  });
  assert.equal(r.memoirePlafondMo, null);
});

test("un plafond cgroup v1 absurde n'est pas une limite", () => {
  // v1 rend souvent 2^63 arrondi quand rien n'est pose : l'annoncer comme un
  // plafond ferait croire a une limite de plusieurs petaoctets.
  const r = releverRessources({
    lire: fauxLire({
      "/sys/fs/cgroup/memory/memory.limit_in_bytes": String(9223372036854771712),
      "/proc/meminfo": MEMINFO(16384, 8000),
    }),
    statFs: statFsFactice(500, 2048),
  });
  assert.equal(r.memoirePlafondMo, null, "au-dela de la machine, ce n'est pas une limite");
});

// --- Le cas du 2 novembre -------------------------------------------------

test("un plafond trop bas pour Chromium est SIGNALE", () => {
  // Chromium a besoin de plusieurs centaines de Mio pour charger WhatsApp Web.
  const r = releverRessources({
    lire: fauxLire({ "/sys/fs/cgroup/memory.max": String(384 * Mio), "/proc/meminfo": MEMINFO(16384, 8000) }),
    statFs: statFsFactice(500, 2048),
  });
  assert.equal(r.memoireSuspecte, true);
  assert.match(resumerRessources(r), /ATTENTION/);
});

test("un plafond confortable n'est pas signale", () => {
  const r = releverRessources({
    lire: fauxLire({ "/sys/fs/cgroup/memory.max": String(2048 * Mio), "/proc/meminfo": MEMINFO(16384, 8000) }),
    statFs: statFsFactice(500, 2048),
  });
  assert.equal(r.memoireSuspecte, false);
  assert.ok(!/ATTENTION/.test(resumerRessources(r)));
});

test("un plafond inconnu ne declenche PAS d'alerte", () => {
  // Ne rien savoir n'est pas savoir que tout va mal : une fausse alerte use
  // l'attention qu'on voudra avoir le jour ou elle compte.
  const r = releverRessources({ lire: fauxLire({}), statFs: statFsFactice(500, 2048) });
  assert.equal(r.memoirePlafondMo, null);
  assert.equal(r.memoireSuspecte, false);
});

// --- Disque ---------------------------------------------------------------

test("l'espace disque est nomme comme celui de l'HOTE, et non du conteneur", () => {
  // Defaut corrige : ce chiffre avait servi a conclure, a tort, que le disque
  // n'etait pas sature — alors que le quota Altare refusait toute ecriture. Le
  // quota est applique par le daemon, hors systeme de fichiers : `statfs` ne
  // peut pas le voir.
  const r = releverRessources({ lire: fauxLire({}), statFs: statFsFactice(1500, 4096) });
  assert.equal(r.disque.hoteLibreMo, 1500);
  assert.equal(r.disque.hoteTotalMo, 4096);
  assert.equal(r.disque.quotaConteneurMo, null, "le quota du conteneur n'est pas observable");
  assert.match(r.disque.avertissement, /quota du conteneur/);
  assert.match(resumerRessources(r), /HOTE/);
});

test("un disque illisible rend null, il ne leve pas", () => {
  const r = releverRessources({
    lire: fauxLire({}),
    statFs: () => {
      throw new Error("ENOSYS");
    },
  });
  assert.equal(r.disque, null);
  assert.doesNotThrow(() => resumerRessources(r));
});

// --- Robustesse -----------------------------------------------------------

test("un releve totalement aveugle reste lisible", () => {
  const r = releverRessources({
    lire: () => {
      throw new Error("ENOENT");
    },
    statFs: () => {
      throw new Error("ENOSYS");
    },
  });
  const texte = resumerRessources(r);
  assert.match(texte, /plafond=inconnu/);
  assert.match(texte, /disque inconnu/);
  assert.ok(!/undefined|NaN|null/.test(texte), `artefact technique dans « ${texte} »`);
});

test("le resume ne porte aucun secret ni chemin interne", () => {
  const r = releverRessources({
    lire: fauxLire({ "/sys/fs/cgroup/memory.max": String(512 * Mio), "/proc/meminfo": MEMINFO(2048, 900) }),
    statFs: statFsFactice(500, 2048),
  });
  const texte = resumerRessources(r);
  assert.ok(!/\/sys|\/proc|home\/container/.test(texte));
  assert.match(texte, /memoire plafond=512 Mo/);
});
