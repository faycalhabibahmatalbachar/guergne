import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { parametresUuid } from "./sql-uuid.ts";

describe("Paramètres UUID pour Neon/PostgreSQL", () => {
  const dialecte = new PgDialect();
  const a = "921ddd13-5f77-4b3d-ada5-c5c43d6c3777";
  const b = "a7b4f08e-910a-4f51-9793-bf8601129ba2";
  it("lie un seul UUID sous forme de paramètre scalaire, pas de tableau", () => {
    const requete = dialecte.sqlToQuery(sql`SELECT id FROM inscriptions WHERE eleve_id IN (${parametresUuid([a])})`);
    assert.deepEqual(requete.params, [a]);
    assert.match(requete.sql, /IN \(\$1::uuid\)/);
  });
  it("lie chaque UUID à un paramètre distinct (sélection multiple)", () => {
    const requete = dialecte.sqlToQuery(sql`SELECT id FROM inscriptions WHERE eleve_id IN (${parametresUuid([a, b])}) AND active`);
    assert.deepEqual(requete.params, [a, b]);
    assert.match(requete.sql, /IN \(\$1::uuid, \$2::uuid\)/);
  });
});
