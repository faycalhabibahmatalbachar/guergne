import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import SftpClient from "ssh2-sftp-client";
const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const t = readFileSync(resolve(racine,"altare.env"),"utf8").replace(/^\uFEFF/,"");
const d={}; for(const l of t.split(/\r?\n/)){const s=l.trim(); if(!s||s.startsWith("#")||!s.includes("="))continue; const[k,...r]=s.split("="); d[k.trim()]=r.join("=").trim();}
async function main(){
  const c=new SftpClient();
  await c.connect({host:String(d.ALTARE_SFTP_HOST).replace(/^sftp:\/\//,"").split(":")[0],port:Number(d.ALTARE_SFTP_PORT),username:d.ALTARE_SFTP_USER,password:d.ALTARE_SFTP_PASSWORD,readyTimeout:20000});
  try{
    for(const f of ["index.js","app.js","package.json","package-lock.json"]){
      const p=resolve(racine,"agent",f); const taille=statSync(p).size;
      await c.put(p, `./${f}`);
      const st=await c.stat(`./${f}`);
      console.log(`  ${st.size===taille?"ok":"DIVERGENT"} ${f} (${taille} o)`);
    }
    console.log("\nqrcode installe :", (await c.exists("./node_modules/qrcode")) ? "oui" : "non (l'amorcage l'installera)");
  } finally { await c.end(); }
}
await main();
