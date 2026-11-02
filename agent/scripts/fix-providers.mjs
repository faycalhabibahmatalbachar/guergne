import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import SftpClient from "ssh2-sftp-client";
const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const t = readFileSync(resolve(racine,"altare.env"),"utf8").replace(/^\uFEFF/,"");
const d={}; for(const l of t.split(/\r?\n/)){const s=l.trim(); if(!s||s.startsWith("#")||!s.includes("="))continue; const[k,...r]=s.split("="); d[k.trim()]=r.join("=").trim();}
const c=new SftpClient();
process.stdout.write("connexion...\n");
await c.connect({host:String(d.ALTARE_SFTP_HOST).replace(/^sftp:\/\//,"").split(":")[0],port:Number(d.ALTARE_SFTP_PORT),username:d.ALTARE_SFTP_USER,password:d.ALTARE_SFTP_PASSWORD,readyTimeout:20000});
try{
  // mkdir NON recursif : la variante recursive gele sur ce serveur.
  if(!(await c.exists("./src/providers"))){ await c.mkdir("./src/providers"); process.stdout.write("dossier src/providers cree\n"); }
  else process.stdout.write("dossier src/providers deja present\n");
  for(const f of ["src/providers/wwebjs.js","src/tools.js","src/resolveur.js","package.json","package-lock.json"]){
    const p=resolve(racine,"agent",f); const taille=statSync(p).size;
    await c.put(p, `./${f}`);
    const st=await c.stat(`./${f}`);
    process.stdout.write(`  ${st.size===taille?"OK":"DIVERGENT"}  ${f}  local=${taille} distant=${st.size}\n`);
  }
} finally { await c.end(); process.stdout.write("deconnecte\n"); }
