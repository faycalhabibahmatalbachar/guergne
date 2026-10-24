import assert from "node:assert/strict";
import test from "node:test";
import {valeursAuditSures} from "./audit-preuve-v2.ts";
test("refuse secrets et données personnelles avant stockage",()=>{
  assert.deepEqual(valeursAuditSures({montantFcfa:15000,numeroRecu:"RECU-012",statut:"INSCRIT",motDePasse:"secret",token:"x",telephone:"+23566667777",referenceExterne:"secret",appreciation:"sensible",details:{secret:"x"}}),{montantFcfa:15000,numeroRecu:"RECU-012",statut:"INSCRIT"});
});
test("données atomiques uniquement",()=>{
  assert.equal(valeursAuditSures(null),null);
  assert.throws(()=>valeursAuditSures(["a"]));
  assert.deepEqual(valeursAuditSures({valeur:NaN,note:17.5,manque:null}),{note:17.5,manque:null});
});
