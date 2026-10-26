import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
const { PGlite } = await import(process.env.COMMUNICATION_TEST_PGLITE || '@electric-sql/pglite');
const pg = new PGlite();
const root = new URL('../../../', import.meta.url);
await pg.exec(`CREATE TYPE canal_notification AS ENUM ('SMS','PUSH','IN_APP');
CREATE TYPE statut_envoi AS ENUM ('EN_ATTENTE','ENVOYE','ECHOUE','LU');
CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), canal canal_notification,
 statut statut_envoi DEFAULT 'EN_ATTENTE',envoye_le timestamptz);
INSERT INTO notifications(canal) VALUES ('IN_APP'),('SMS');`);
const snapshot = (await pg.query('select * from notifications order by canal')).rows;
const up = await readFile(new URL('db/communication-v2/up.sql',root),'utf8');
const down = await readFile(new URL('db/communication-v2/down.sql',root),'utf8');
await pg.exec(up);
assert.deepEqual((await pg.query('select * from notifications order by canal')).rows,snapshot);
console.log('PASS up preserves historical notification rows');
const immediate = await pg.query(`INSERT INTO notifications(canal) VALUES('IN_APP') RETURNING statut,envoye_le`);
assert.equal(immediate.rows[0].statut,'ENVOYE');assert.ok(immediate.rows[0].envoye_le);
await pg.exec(`INSERT INTO communication_outbox(idempotency_key,channel,state) VALUES ('one','SMS','QUEUED');`);
assert.equal((await pg.query('select * from communication_claim(200,true)')).rows.length,0);
await pg.exec('UPDATE communication_control SET paused=false');
const [row] = (await pg.query('select * from communication_claim(200,true)')).rows;
assert.equal(row.attempts,1);
assert.equal((await pg.query('select * from communication_claim(200,true)')).rows.length,0);
await assert.rejects(pg.query(`INSERT INTO communication_outbox(idempotency_key,channel,state) VALUES ('one','SMS','QUEUED')`));
const finish = async (lease,state='ACCEPTED') => (await pg.query('select communication_finish($1,$2,$3,NULL,NULL,0,0) as ok',[row.id,lease,state])).rows[0].ok;
assert.equal(await finish('00000000-0000-0000-0000-000000000000'),false);
assert.equal(await finish(row.lease_token),true);
assert.equal(await finish(row.lease_token),false);
console.log('PASS reservation, duplicate key, stale token, completion replay');
await pg.exec(`INSERT INTO communication_outbox(idempotency_key,channel,state,lease_token,lease_until) VALUES
 ('crash','PUSH','PROCESSING',gen_random_uuid(),now()-interval '3 minutes'),
 ('expired','SMS','QUEUED',NULL,NULL); UPDATE communication_outbox SET expires_at=now()-interval '1 day' WHERE idempotency_key='expired';`);
const recovered=(await pg.query('select * from communication_claim(200,true)')).rows;
assert.equal(recovered.length,1);assert.equal(recovered[0].idempotency_key,'crash');
assert.equal((await pg.query("select state from communication_outbox where idempotency_key='expired'")).rows[0].state,'EXPIRED');
console.log('PASS injected worker crash, lease recovery, expiration');
await pg.exec(`INSERT INTO communication_outbox(idempotency_key,channel,state,simulated) VALUES ('receipt','SMS','ACCEPTED',false);`);
const rid=(await pg.query("select id from communication_outbox where idempotency_key='receipt'")).rows[0].id;
const receipt=async (event,state)=>(await pg.query('select communication_receipt($1,$2,$3,$4,now()) as ok',['mock',event,rid,state])).rows[0].ok;
assert.equal(await receipt('d1','DELIVERED'),true);
assert.equal(await receipt('d1','DELIVERED'),false);
assert.equal(await receipt('a1','ACCEPTED'),false);
assert.equal(await receipt('f1','FAILED'),false);
assert.equal(await receipt('r1','READ'),true);
assert.equal(await receipt('d2','DELIVERED'),false);
console.log('PASS duplicate and out-of-order receipts cannot downgrade delivery or read');
const before=performance.now(), memory=process.memoryUsage().rss;
await pg.exec(`INSERT INTO communication_outbox(idempotency_key,channel,state)
SELECT 'load-'||i,'SMS','QUEUED' FROM generate_series(1,5000) i;`);
let processed=0;
for (;;) {
 const batch=(await pg.query('select * from communication_claim(200,true)')).rows;
 if (!batch.length) break;
 await pg.query(`UPDATE communication_outbox SET state='ACCEPTED',actual_cost=50,lease_token=NULL,lease_until=NULL
  WHERE id=ANY($1::uuid[]) AND state='PROCESSING'`,[batch.map(r=>r.id)]);
 processed+=batch.length;
}
assert.equal(processed,5000);
const counts=(await pg.query('select state,count(*)::int n from communication_outbox group by state')).rows;
const total=(await pg.query('select count(*)::int n from communication_outbox')).rows[0].n;
assert.equal(counts.reduce((sum,r)=>sum+r.n,0),total);
console.log(JSON.stringify({test:'5000 database simulated rows (no provider calls)',processed,duration_ms:Math.round(performance.now()-before),rss_delta_bytes:process.memoryUsage().rss-memory,simulated_cost_XAF:250000,counts}));
const legacyBeforeDown=(await pg.query('select * from notifications order by canal')).rows;
await pg.exec(down);
assert.deepEqual((await pg.query('select * from notifications order by canal')).rows,legacyBeforeDown);
await pg.exec(up);await pg.exec(down);
console.log('PASS down preserves legacy rows; up/down/up/down repeatable');
await pg.close();
