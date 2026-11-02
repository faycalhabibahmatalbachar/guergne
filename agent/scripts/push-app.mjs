/** Transfert de app.js SEUL, verifie par SHA-256 brut ET normalise. */
import { createHash } from "node:crypto";
import { readFileSync, unlinkSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import SftpClient from "ssh2-sftp-client";
const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const t = readFileSync(resolve(racine,"altare.env"),"utf8").replace(/^\uFEFF/,"");
const d={}; for(const l of t.split(/\r?\n/)){const s=l.trim(); if(!s||s.startsWith("#")||!s.includes("="))continue; const[k,...r]=s.split("="); d[k.trim()]=r.join("=").trim();}
const sha=(b)=>createHash("sha256").update(b).digest("hex");
const norm=(b)=>Buffer.from(b.toString("utf8").replace(/\r\n/g,"\n"),"utf8");
async function main(){
  const c=new SftpClient();
  await c.connect({host:String(d.ALTARE_SFTP_HOST).replace(/^sftp:\/\//,"").split(":")[0],port:Number(d.ALTARE_SFTP_PORT),username:d.ALTARE_SFTP_USER,password:d.ALTARE_SFTP_PASSWORD,readyTimeout:20000});
  try{
    for(const p of ["./index.js","./package-lock.json","./node_modules","./.cache/puppeteer","./donnees"])
      console.log(`  intact ${p} : ${(await c.exists(p)) ? "present" : "absent"}`);
    const local=readFileSync(resolve(racine,"agent","app.js"));
    await c.put(resolve(racine,"agent","app.js"), "./app.js");
    const tmp=join(tmpdir(), `app-${Date.now()}.js`);
    await c.get("./app.js", tmp);
    const distant=readFileSync(tmp); unlinkSync(tmp);
    const brut = sha(distant)===sha(local);
    const normalise = sha(norm(distant))===sha(norm(local));
    console.log(`\n  taille locale ${local.length} o | distante ${distant.length} o`);
    console.log(`  SHA-256 brut       : ${brut ? "IDENTIQUE" : "different (fins de ligne)"}`);
    console.log(`  SHA-256 normalise  : ${normalise ? "IDENTIQUE" : "DIVERGENT"}`);
    console.log(`  import node:path present dans le fichier DISTANT : ${/from "node:path"/.test(distant.toString("utf8")) ? "OUI" : "NON"}`);
    process.exitCode = normalise ? 0 : 1;
  } finally { await c.end(); }
}
await main();
