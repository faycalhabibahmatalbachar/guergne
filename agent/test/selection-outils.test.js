/**
 * La sélection d'outils réduit l'invite sans cacher le bon outil.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { selectionnerOutils } from "../src/selection-outils.js";
import { ToolRegistry, ASSIDUITE_TOOLS } from "../src/tools.js";

const reg = new ToolRegistry(ASSIDUITE_TOOLS);
const sel = (texte, extra = {}) => selectionnerOutils({ texte, outils: reg.all(), ...extra });

test("le domaine évoqué détaille ses outils, et le socle est toujours là", () => {
  const s = sel("qui n'a pas payé ses frais ?");
  assert.ok(s.detailles.has("finances.situations"));
  assert.ok(s.detailles.has("eleves.fiche"));
  assert.ok(!s.detailles.has("assiduite.enregistrer_appel"));
});

test("sans mot évocateur ni conversation, tout est détaillé", () => {
  assert.equal(sel("Bonjour").detailles, null);
});

test("une relance courte garde les outils de la conversation en cours", () => {
  const s = sel("et après ?", { dernierOutil: "assiduite.consulter_retards" });
  assert.ok(s.detailles.has("assiduite.consulter_retards"));
  assert.ok(s.detailles.has("assiduite.consulter_absences"));
});

test("les autres outils restent NOMMÉS dans l'invite", () => {
  const s = sel("les absences de la 6e A");
  const invite = reg.invitePourNlu(s.detailles);
  assert.match(invite, /Autres outils[^\n]*finances\.situations/);
  assert.ok(invite.length < reg.invitePourNlu().length * 0.6, "l'invite doit être nettement plus courte");
});

test("sur tout le catalogue de scénarios du banc, l'outil attendu est toujours détaillé", () => {
  const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
  // Le script sort en code non nul au premier outil caché.
  const sortie = execFileSync(process.execPath, [join(racine, "banc", "couverture-selection.mjs")], { cwd: racine, encoding: "utf8" });
  assert.match(sortie, /outil détaillé : (\d+)/);
});
