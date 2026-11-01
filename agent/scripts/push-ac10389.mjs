/** Transfert des deux fichiers du commit cible, avec verification SHA-256 par relecture vers fichier. */
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
async function main(){
  const c=new SftpClient();
  await c.connect({host:String(d.ALTARE_SFTP_HOST).replace(/^sftp:\/\//,"").split(":")[0],port:Number(d.ALTARE_SFTP_PORT),username:d.ALTARE_SFTP_USER,password:d.ALTARE_SFTP_PASSWORD,readyTimeout:20000});
  try{
    // Controle prealable : rien de persistant ne doit etre touche.
    for(const p of ["./donnees","./node_modules",".cache/puppeteer","./package-lock.json"])
      console.log(`  preserve ${p} : ${(await c.exists(p)) ? "present" : "absent"}`);
    console.log("");
    let ok=0; const ko=[];
    for(const f of ["index.js","app.js"]){
      const local=readFileSync(resolve(racine,"agent",f));
      await c.put(resolve(racine,"agent",f), `./${f}`);
      // Relecture VERS UN FICHIER (get sans destination se bloque sur ce client).
      const tmp=join(tmpdir(), `alt-${f}-${Date.now()}`);
      await c.get(`./${f}`, tmp);
      const distant=readFileSync(tmp); unlinkSync(tmp);
      const egal = sha(distant)===sha(local);
      if(egal){ ok++; console.log(`  SHA-256 OK  ${f}  ${local.length} o  ${sha(local).slice(0,16)}`); }
      else { ko.push(f); console.error(`  DIVERGENCE  ${f}  local=${sha(local).slice(0,16)} distant=${sha(distant).slice(0,16)}`); }
    }
    console.log(`\ntransferes 2 | verifies SHA-256 ${ok} | divergents ${ko.length}`);
    console.log("donnees/wwebjs_auth :", (await c.exists("./donnees/wwebjs_auth")) ? "PRESENTE (intacte)" : "absente");
    console.log("PAIRING_TOKEN.txt   :", (await c.exists("./donnees/PAIRING_TOKEN.txt")) ? "present" : "absent (genere au demarrage)");
    process.exitCode = ko.length?1:0;
  } finally { await c.end(); }
}
await main();
