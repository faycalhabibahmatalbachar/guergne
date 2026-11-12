/**
 * Épreuve RÉELLE de la mémoire durable : le fil survit-il à un redémarrage ?
 *
 *   node banc/memoire-durable.mjs
 *
 * Réel : le moteur, le modèle, le backend de test, et la mémoire Neon — les
 * vraies tables `wa_*` de la base de TEST, avec des clés de chiffrement tirées
 * au hasard pour cette épreuve. Chaque « redémarrage » construit un moteur
 * neuf, un étage vif vide et une nouvelle connexion : rien ne passe d'un moteur
 * à l'autre, sinon par la base.
 *
 * Constats, chacun relu indépendamment (appels backend observés, SQL) :
 *   1. « et les retards ? » après redémarrage vise la classe du tour précédent ;
 *   2. « et ses notes ? » après redémarrage vise l'élève du tour précédent ;
 *   3. un « oui » après redémarrage confirme l'opération préparée avant — la
 *      bonne, une seule fois ;
 *   4. un autre numéro du même acteur ne voit rien de ce fil ;
 *   5. la base ne contient aucun texte en clair, ni message d'utilisateur.
 *
 * Les conversations créées sont supprimées par identifiant ; la classe de
 * synthèse (code BH8) aussi.
 */
import { randomBytes } from "node:crypto";

import "./extensions.mjs";
import { ouvrirConversation, ouvrirIA, ouvrirOracle, urlBaseDeTest } from "./moteur.mjs";
import { chargerFaits } from "./faits.mjs";
import { NeonConversationMemory } from "../src/memory.js";
import { MemoireVive } from "../src/memoire-vive.js";
import { MemoireComposee } from "../src/memoire-composee.js";

const vert = (s) => console.log("\x1b[1;32m  OK     \x1b[0m" + s);
const rouge = (s) => console.log("\x1b[1;31m  ECHEC  \x1b[0m" + s);
const resultats = [];
const constater = (nom, ok, detail = "") => {
  resultats.push(ok);
  (ok ? vert : rouge)(nom + (detail ? " — " + detail : ""));
};

const oracle = await ouvrirOracle();
const { q } = oracle;
const f = await chargerFaits(q);
const [acteur] = await q("SELECT id::text, role FROM utilisateurs WHERE NOT donnees_semees AND role = 'SUPER_ADMIN' AND actif ORDER BY cree_le LIMIT 1");
const cles = { encryptionKey: randomBytes(32).toString("hex"), hmacKey: randomBytes(32).toString("hex") };
const evenementsIA = [];
const ia = ouvrirIA((e) => evenementsIA.push(e));
const jid = "2356601" + String(Math.floor(Math.random() * 9000) + 1000) + "@c.us";
const autreJid = "2356602" + String(Math.floor(Math.random() * 9000) + 1000) + "@c.us";
const conversations = new Set();
const durables = [];

/** Un moteur NEUF : nouvelle connexion, étage vif vide. Seule la base est commune. */
function redemarrer(numero = jid) {
  const durable = new NeonConversationMemory({ connectionString: urlBaseDeTest(), ...cles });
  durables.push(durable);
  const prepare = durable.prepare.bind(durable);
  durable.prepare = async (a) => {
    const s = await prepare(a);
    conversations.add(s.conversationId);
    return s;
  };
  return ouvrirConversation({ ia, acteur, evenementsIA, jid: numero, memoire: new MemoireComposee({ vive: new MemoireVive(), durable }) });
}
const appel = (t, action) => t.appels.filter((a) => a.action === action).at(-1);

console.log("Mémoire durable — base " + oracle.branche + ", clés éphémères, numéro de synthèse");
try {
  await q("DELETE FROM classes c WHERE c.code = 'BH8' AND NOT EXISTS (SELECT 1 FROM inscriptions i WHERE i.classe_id = c.id)");

  // 1. La classe survit au redémarrage.
  let m = redemarrer();
  let t = await m.dire("les absences de la 6e A");
  constater("tour 1 : absences de la 6e A", appel(t, "listerAbsences")?.params?.classeId === f.classes["6A"].id);
  m = redemarrer();
  t = await m.dire("et les retards ?");
  constater("REDÉMARRAGE → « et les retards ? » vise la 6e A", appel(t, "listerRetards")?.params?.classeId === f.classes["6A"].id, JSON.stringify(appel(t, "listerRetards")?.params ?? null));

  // 2. L'élève survit au redémarrage.
  t = await m.dire("la fiche de " + f.unique.prenom + " " + f.unique.nom);
  constater("fiche de l'élève de référence", appel(t, "ficheEleve")?.params?.eleveId === f.unique.id);
  m = redemarrer();
  t = await m.dire("et ses notes ?");
  constater("REDÉMARRAGE → « et ses notes ? » vise le même élève", appel(t, "releveEleve")?.params?.eleveId === f.unique.id, t.reponse.slice(0, 80).replace(/\n/g, " "));

  // 3. La confirmation survit, et ne s'exécute qu'une fois.
  t = await m.dire("Crée une classe Banc Eta, code BH8, niveau 6ème, 30 places");
  constater("préparation d'une création de classe", t.statut === "WAITING_APPROVAL", t.reponse.slice(0, 90).replace(/\n/g, " "));
  const [{ n: avant }] = await q("SELECT count(*)::int n FROM classes WHERE code = 'BH8'");
  constater("rien n'est écrit avant le oui", avant === 0);
  m = redemarrer();
  t = await m.dire("oui");
  const [{ n: apres }] = await q("SELECT count(*)::int n FROM classes WHERE code = 'BH8' AND libelle = 'Banc Eta'");
  constater("REDÉMARRAGE → « oui » crée la classe préparée avant", apres === 1 && t.statut === "COMPLETED", "statut " + t.statut);
  m = redemarrer();
  t = await m.dire("oui");
  const [{ n: encore }] = await q("SELECT count(*)::int n FROM classes WHERE code = 'BH8'");
  constater("un second « oui » après redémarrage ne rejoue rien", encore === 1 && !t.appels.some((a) => a.action === "creerClasse"));

  // 4. Un autre numéro du même acteur ne voit rien.
  const autre = redemarrer(autreJid);
  t = await autre.dire("et les retards ?");
  const pr = appel(t, "listerRetards")?.params ?? null;
  constater("un autre numéro n'hérite d'aucun contexte", !pr?.classeId && !pr?.eleveId, JSON.stringify(pr));

  // 5. Ce que la base contient réellement.
  const ids = [...conversations];
  const [{ n: textes }] = await q("SELECT count(*)::int n FROM wa_messages WHERE conversation_id = ANY($1::uuid[]) AND contenu_chiffre IS NOT NULL", [ids]);
  constater("aucun message scolaire n'est conservé, même chiffré", textes === 0, textes + " contenu(s)");
  const ctx = await q("SELECT outil, encode(parametres_chiffres, 'escape') AS brut FROM wa_conversation_context WHERE conversation_id = ANY($1::uuid[])", [ids]);
  const fuite = ctx.some((c) => c.brut.includes(f.classes["6A"].id) || c.brut.includes(f.unique.id) || c.brut.includes(f.unique.nom));
  constater("le contexte de suivi est illisible sans la clé", ctx.length > 0 && !fuite, ctx.length + " ligne(s) chiffrée(s)");
  const [{ n: croisees }] = await q("SELECT count(DISTINCT acteur_id)::int n FROM wa_conversations WHERE id = ANY($1::uuid[])", [ids]);
  constater("chaque conversation appartient à un seul acteur", croisees === 1 && ids.length === 2, ids.length + " conversation(s)");
} finally {
  const ids = [...conversations];
  const r1 = ids.length ? await q("DELETE FROM wa_conversations WHERE id = ANY($1::uuid[]) RETURNING 1", [ids]) : [];
  const r2 = await q("DELETE FROM classes c WHERE c.code = 'BH8' AND NOT EXISTS (SELECT 1 FROM inscriptions i WHERE i.classe_id = c.id) RETURNING 1");
  console.log("  nettoyage : " + r1.length + " conversation(s), " + r2.length + " classe(s) de synthèse");
  for (const d of durables) await d.close?.().catch(() => {});
  await oracle.fermer();
}
const echecs = resultats.filter((x) => !x).length;
console.log("\n== " + (resultats.length - echecs) + "/" + resultats.length + " constats ==");
if (echecs) process.exitCode = 1;
