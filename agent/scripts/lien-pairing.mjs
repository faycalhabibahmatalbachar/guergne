/** Lit le jeton par SFTP, teste les routes, construit le lien. Le jeton n'est
 *  affiche QUE dans le lien final, jamais seul ni dans une trace. */
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import SftpClient from "ssh2-sftp-client";
const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const t = readFileSync(resolve(racine,"altare.env"),"utf8").replace(/^\uFEFF/,"");
const d={}; for(const l of t.split(/\r?\n/)){const s=l.trim(); if(!s||s.startsWith("#")||!s.includes("="))continue; const[k,...r]=s.split("="); d[k.trim()]=r.join("=").trim();}
const BASE = "http://se-kna02.altare.global:25278";
const c=new SftpClient();
await c.connect({host:String(d.ALTARE_SFTP_HOST).replace(/^sftp:\/\//,"").split(":")[0],port:Number(d.ALTARE_SFTP_PORT),username:d.ALTARE_SFTP_USER,password:d.ALTARE_SFTP_PASSWORD,readyTimeout:20000});
let jeton=null;
try{
  const chemin="./donnees/PAIRING_TOKEN.txt";
  if(!(await c.exists(chemin))){ console.log("FICHIER JETON ABSENT"); process.exit(1); }
  const tmp=join(tmpdir(),`pt-${Date.now()}.txt`);
  await c.get(chemin, tmp);
  jeton=readFileSync(tmp,"utf8").trim(); unlinkSync(tmp);
  console.log(`fichier jeton : present, ${jeton.length} caracteres, non vide : ${jeton.length>0}`);
} finally { await c.end(); }

const h={ "x-pairing-token": jeton };
const etat = await fetch(`${BASE}/pairing/etat`,{headers:h});
const corpsEtat = await etat.json();
console.log(`GET /pairing/etat -> HTTP ${etat.status} :`, JSON.stringify(corpsEtat));

const page = await fetch(`${BASE}/pairing`);
console.log(`GET /pairing      -> HTTP ${page.status} ${page.headers.get("content-type")}`);

const qr = await fetch(`${BASE}/pairing/qr`,{headers:h});
console.log(`GET /pairing/qr   -> HTTP ${qr.status} ${qr.headers.get("content-type")}`);
if(qr.ok){
  const buf=Buffer.from(await qr.arrayBuffer());
  const sig=[...buf.subarray(0,8)].map(b=>b.toString(16).padStart(2,"0")).join(" ");
  console.log(`  taille ${buf.length} o | signature ${sig}`);
  console.log(`  PNG valide : ${buf[0]===0x89&&buf[1]===0x50&&buf[2]===0x4e&&buf[3]===0x47}`);
  // Decodage reel : on verifie les dimensions depuis l'entete IHDR.
  const w=buf.readUInt32BE(16), hh=buf.readUInt32BE(20);
  console.log(`  dimensions ${w}x${hh} px`);
  writeFileSync(resolve(racine,"qr-apercu.png"), buf);
  console.log("  apercu ecrit dans qr-apercu.png");
}
// Sans jeton : doit etre refuse.
const refus = await fetch(`${BASE}/pairing/qr`);
console.log(`GET /pairing/qr sans jeton -> HTTP ${refus.status} (doit etre 401)`);
console.log("\n=== LIEN ===");
console.log(`${BASE}/pairing#t=${jeton}`);
