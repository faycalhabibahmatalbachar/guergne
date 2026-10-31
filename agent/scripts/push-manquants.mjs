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
    const fichiers=["src/tools.js","src/resolveur.js","src/providers/wwebjs.js","package.json","package-lock.json"];
    if(!(await c.exists("./src/providers"))){ await c.mkdir("./src/providers",true); console.log("cree ./src/providers"); }
    let ok=0; const ko=[];
    for(const f of fichiers){
      const chemin=resolve(racine,"agent",f);
      const tailleLocale=statSync(chemin).size;
      await c.put(chemin, `./${f}`);
      // Verification par relecture des metadonnees distantes (stat), pas par get()
      // qui se bloque sur cette version du client.
      const st=await c.stat(`./${f}`);
      if(st.size===tailleLocale){ ok++; console.log(`  ok ${f} (${tailleLocale} o)`); }
      else { ko.push(f); console.error(`  DIVERGENCE ${f}: local ${tailleLocale} distant ${st.size}`); }
    }
    console.log(`\ntransferes ${fichiers.length} | verifies ${ok} | divergents ${ko.length}`);
    console.log("src/providers/wwebjs.js :", (await c.exists("./src/providers/wwebjs.js")) ? "PRESENT" : "ABSENT");
    console.log("donnees/wwebjs_auth :", (await c.exists("./donnees/wwebjs_auth")) ? "presente (intacte)" : "absente (pas encore de scan)");
    process.exitCode = ko.length?1:0;
  } finally { await c.end(); }
}
await main();
