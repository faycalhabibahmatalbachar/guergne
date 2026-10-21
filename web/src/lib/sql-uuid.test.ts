import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { parametresUuid } from "./sql-uuid.ts";

describe("Paramètres UUID pour Neon/PostgreSQL", () => {
  const dialecte = new PgDialect();
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";
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
