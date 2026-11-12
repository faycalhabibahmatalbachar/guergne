// Sonde : forme des réponses du backend (lecture seule). node banc/sonde.mjs action '{"json":1}'
import { join } from "node:path";
import { GuergneHttpClient } from "../src/guergne-client.js";
import { BACKEND, lireEnv, ouvrirOracle, racineAgent } from "./moteur.mjs";
const o = await ouvrirOracle();
const [a] = await o.q("SELECT id::text FROM utilisateurs WHERE NOT donnees_semees AND role='SUPER_ADMIN' AND actif ORDER BY cree_le LIMIT 1");
await o.fermer();
const g = new GuergneHttpClient({ baseUrl: BACKEND, serviceToken: lireEnv(join(racineAgent, ".env"), "AGENT_SERVICE_TOKEN") });
const r = await g[process.argv[2]](JSON.parse(process.argv[3] ?? "{}"), { actorId: a.id });
const court = (v, p = 0) => Array.isArray(v) ? [v.length + " lignes", court(v[0], p + 1)] : v && typeof v === "object" && p < 3 ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, court(x, p + 1)])) : v;
console.log(JSON.stringify(court(r), null, 1));
