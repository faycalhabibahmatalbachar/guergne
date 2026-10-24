import assert from "node:assert/strict";
import test from "node:test";
import { rendreChangements, valeurLisible, appareilLisible, libelleAction } from "./audit-presentation.ts";

test("masque systématiquement les secrets et identifiants sensibles", () => {
  const r = rendreChangements({ token: "secret", telephone: "+23566223344" }, { token: "autre-secret", telephone: "+23566334455", compte: { apiKey:"secret" } });
  assert.ok(!JSON.stringify(r).includes("autre-secret"));
  assert.ok(!JSON.stringify(r).includes("66223344"));
  assert.ok(!JSON.stringify(r).includes("66334455"));
  assert.ok(r.changements.some(x=>x.champ==="Téléphone"));
  assert.equal(valeurLisible("apiKey","un-secret"),"Information protégée");
});

test("n'invente aucune valeur d'avant lorsque la preuve est absente", () => {
  const r=rendreChangements(null,{ smsEnvoye:true,coutSmsFcfa:250 });
  assert.equal(r.typePreuve,"resultat");
  assert.equal(r.changements[0].avant,"Non enregistré");
});

test("présente les actions et appareils sans JSON brut", () => {
  assert.equal(libelleAction("connexion.succes"), "Connexion réussie");
  assert.match(appareilLisible("Mozilla/5.0 (Windows NT 10.0) Chrome/120"), /Google Chrome · Windows/);
});
