import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import SftpClient from "ssh2-sftp-client";
const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const t = readFileSync(resolve(racine,"altare.env"),"utf8").replace(/^\uFEFF/,"");
const d={}; for(const l of t.split(/\r?\n/)){const s=l.trim(); if(!s||s.startsWith("#")||!s.includes("="))continue; const[k,...r]=s.split("="); d[k.trim()]=r.join("=").trim();}
const c=new SftpClient();
await c.connect({host:String(d.ALTARE_SFTP_HOST).replace(/^sftp:\/\//,"").split(":")[0],port:Number(d.ALTARE_SFTP_PORT),username:d.ALTARE_SFTP_USER,password:d.ALTARE_SFTP_PASSWORD,readyTimeout:20000});
try{
  console.log("PAIRING_TOKEN.txt  :", (await c.exists("./donnees/PAIRING_TOKEN.txt")) ? "ENCORE PRESENT" : "supprime (jeton brule)");
  const sess = await c.exists("./donnees/wwebjs_auth");
  console.log("donnees/wwebjs_auth:", sess ? "PRESENTE" : "absente");
  if(sess){
    const l = await c.list("./donnees/wwebjs_auth");
    console.log("  contenu :", l.map(e=>e.name).join(", ") || "(vide)");
    for(const e of l.filter(x=>x.type==="d")){
      const sous = await c.list(`./donnees/wwebjs_auth/${e.name}`);
      console.log(`  ${e.name}/ : ${sous.length} entree(s)`);
    }
  }
  console.log("deduplication      :", (await c.exists("./donnees/dedup.json")) ? "presente" : "absente");
  console.log("verrou d'instance  :", (await c.exists("./donnees/instance.lock")) ? "present (une seule instance)" : "absent");
} finally { await c.end(); }
