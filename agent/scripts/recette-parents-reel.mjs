/**
 * Recette RÉELLE des écritures sur les responsables d'un élève.
 *
 * Contre la base de TEST et un backend local écritures ALLUMÉES :
 *
 *   cd web && AGENT_ECRITURES_ACTIVES=true SMS_API_URL= SMS_API_KEY= \
 *     FCM_PROJECT_ID= FCM_CLIENT_EMAIL= FCM_PRIVATE_KEY= npx next dev -p 3100
 *   node scripts/recette-parents-reel.mjs
 *
 * Chaque outil passe par son chemin complet (preparer -> API -> action web ->
 * Neon -> verifier), puis une requête SQL indépendante constate l'état.
 *
 * DONNÉES : uniquement des données de synthèse marquées « RECETTE-PARENTS »,
 * dans une classe de synthèse, avec deux téléphones de la plage réservée à la
 * fiction (+33 1 99 00 xx xx), vérifiés inexistants avant usage. Aucun élève ni
 * parent authentique n'est touché. Tout est supprimé à la fin, PAR IDENTIFIANT ;
 * le journal d'audit est conservé.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { GuergneHttpClient } from "../src/guergne-client.js";
import { PARENTS_TOOLS } from "../src/tools-parents.js";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const depot = resolve(racine, "..");
const BACKEND = process.env.RECETTE_BACKEND ?? "http://localhost:3100";
const BRANCHE_PRODUCTION = "br-red-waterfall-b1ajf6iu";
const MARQUE = "RECETTE-PARENTS";
const TEL_A = "+33199001240";
const TEL_B = "+33199001241";

const bleu = (s) => console.log(`\x1b[1;34m${s}\x1b[0m`);
const vert = (s) => console.log(`\x1b[1;32m${s}\x1b[0m`);
const rouge = (s) => console.error(`\x1b[1;31m${s}\x1b[0m`);
const gris = (s) => console.log(`\x1b[0;90m${s}\x1b[0m`);

function lire(f, nom) {
  for (const l of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = l.match(/^([A-Z_0-9]+)\s*=\s*(.*)$/);
    if (m && m[1] === nom) return m[2].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

const resultats = [];
const constater = (nom, ok, detail = "") => {
  resultats.push(ok);
  (ok ? vert : rouge)(`  ${ok ? "OK   " : "ECHEC"}  ${nom}${detail ? ` — ${detail}` : ""}`);
  return ok;
};
const outil = (n) => PARENTS_TOOLS.find((o) => o.name === n);

/** Le chemin de l'agent, sans le modèle : preparer, appeler, verifier. */
async function parAgent(nom, dit, outils) {
  const o = outil(nom);
  const prep = await o.preparer(dit, outils);
  if (!prep.ok) return { prep, r: null, v: null };
  const r = await outils.guergne[o.action](prep.params, outils.ctx);
  const v = r?.ok === false ? null : await o.verifier({ result: r, params: prep.params, guergne: outils.guergne, ctx: outils.ctx });
  return { prep, r, v };
}

async function principal() {
  if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(BACKEND)) throw new Error("VERROU : backend non local");
  const fichier = join(depot, "web", ".env.development.local");
  const db = new pg.Client({ connectionString: lire(fichier, "DATABASE_URL_DIRECT") ?? lire(fichier, "DATABASE_URL"), ssl: { rejectUnauthorized: false } });
  await db.connect();
  const q = async (s, p) => (await db.query(s, p)).rows;
  const [{ branche }] = await q("SELECT current_setting('neon.branch_id', true) AS branche");
  if (!branche || branche === BRANCHE_PRODUCTION) throw new Error(`VERROU : base ${branche} — refus`);

  const guergne = new GuergneHttpClient({ baseUrl: BACKEND, serviceToken: lire(join(racine, ".env"), "AGENT_SERVICE_TOKEN") });
  const [admin] = await q("SELECT id::text FROM utilisateurs WHERE NOT donnees_semees AND role = 'SUPER_ADMIN' AND actif ORDER BY cree_le LIMIT 1");
  const ctx = { actorId: admin.id };
  const outils = { guergne, ctx };
  const ids = { classe: null, eleves: [], tuteurs: [] };

  try {
    // VERROUS
    const [{ courante }] = await q("SELECT libelle AS courante FROM annees_scolaires WHERE est_courante");
    const ra = await guergne.anneeCourante({}, ctx);
    if (ra?.data?.libelle !== courante) throw new Error(`VERROU : backend « ${ra?.data?.libelle} », base « ${courante} »`);
    // Reliquat d'une execution interrompue : une fiche MARQUEE, sur un numero
    // fictif, rattachee a personne. Elle est retiree avant le verrou.
    await db.query(
      "DELETE FROM tuteurs t WHERE t.nom = $1 AND regexp_replace(t.telephone,'[^0-9]','','g') IN ($2, $3) AND NOT EXISTS (SELECT 1 FROM eleve_tuteur et WHERE et.tuteur_id = t.id)",
      [MARQUE, TEL_A.replace(/\D/g, ""), TEL_B.replace(/\D/g, "")],
    );
    const [{ pris }] = await q(
      "SELECT count(*)::int pris FROM tuteurs WHERE regexp_replace(telephone,'[^0-9]','','g') IN ($1, $2)",
      [TEL_A.replace(/\D/g, ""), TEL_B.replace(/\D/g, "")],
    );
    if (pris > 0) throw new Error(`VERROU : un telephone fictif existe deja (${pris})`);
    vert(`  verrous : base ${branche}, annee ${courante}, telephones fictifs libres`);

    // Synthèse : une classe, deux élèves (le premier avec le parent A).
    const suffixe = String(Date.now()).slice(-4);
    const [niveau] = await q("SELECT id::text FROM niveaux ORDER BY ordre LIMIT 1");
    await guergne.creerClasse({ libelle: `${MARQUE} ${suffixe}`, code: `RP${suffixe}`, niveauId: niveau.id, capaciteMax: 30 }, ctx);
    [{ id: ids.classe }] = await q("SELECT id::text FROM classes WHERE code = $1", [`RP${suffixe}`]);
    for (const prenom of [`Un${suffixe}`, `Deux${suffixe}`]) {
      // L'application exige un responsable par eleve : le pere fictif A pour les deux.
      const tuteurs = [{ nom: MARQUE, prenom: "Pere", telephone: TEL_A, lien: "PERE", estPrincipal: true, estTuteurLegal: true }];
      const r = await guergne.inscrireEleve({ nom: MARQUE, prenom, sexe: "M", dateNaissance: "2013-04-15", classeId: ids.classe, tuteurs }, ctx);
      const [e] = await q("SELECT id::text FROM eleves WHERE nom = $1 AND prenom = $2", [MARQUE, prenom]);
      if (!e) throw new Error(`creation de l'eleve de synthese impossible : ${r?.message}`);
      ids.eleves.push(e.id);
    }
    const [e1, e2] = ids.eleves;
    const dit1 = { eleveId: e1 };
    const dit2 = { eleveId: e2 };

    bleu("\n== 1. Rattacher un NOUVEAU parent (la mere) ==");
    {
      const { prep, r, v } = await parAgent("parents.rattacher", { ...dit1, telephone: TEL_B, lien: "la mère", nom: MARQUE, prenom: "Mere", autoriseRetrait: true }, outils);
      constater("preparer annonce une NOUVELLE fiche", prep.ok && /NOUVELLE fiche/.test(prep.texte), prep.message ?? "");
      constater("API", r?.ok === true, r?.message ?? "");
      constater("relecture (verifier)", v?.ok === true, v?.raison ?? v?.texte ?? "");
      const [{ n }] = await q("SELECT count(*)::int n FROM eleve_tuteur WHERE eleve_id = $1", [e1]);
      constater("deux responsables en base", n === 2, `${n}`);
    }
    const [{ id: tA }] = await q("SELECT id::text FROM tuteurs WHERE telephone = $1", [TEL_A]);
    const [{ id: tB }] = await q("SELECT id::text FROM tuteurs WHERE telephone = $1", [TEL_B]);
    ids.tuteurs.push(tA, tB);

    bleu("\n== 2. Le meme parent, une seconde fois : refuse ==");
    {
      const r = await guergne.rattacherTuteur({ eleveId: e1, existantId: tB, nom: MARQUE, prenom: "Mere", telephone: TEL_B, lien: "MERE" }, ctx);
      constater("double rattachement refuse, pour cette raison", r?.ok === false && /déjà rattaché/.test(r?.message ?? ""), r?.message ?? "");
    }

    bleu("\n== 3. Meme parent, numero ecrit autrement, autre enfant : fiche REUTILISEE ==");
    {
      const autrement = "+33 1 99 00 12 41";
      const { prep, r, v } = await parAgent("parents.rattacher", { ...dit2, telephone: autrement, lien: "mère", nom: "Ignore", prenom: "Ignore", estPrincipal: true }, outils);
      constater("preparer reconnait la fiche existante", prep.ok && prep.params.existantId === tB && /EXISTANTE/.test(prep.texte), prep.message ?? prep.params?.existantId);
      constater("API", r?.ok === true, r?.message ?? "");
      constater("relecture (verifier)", v?.ok === true, v?.raison ?? "");
      const [{ fiches }] = await q("SELECT count(*)::int fiches FROM tuteurs WHERE regexp_replace(telephone,'[^0-9]','','g') = $1", [TEL_B.replace(/\D/g, "")]);
      const [{ enfants }] = await q("SELECT count(*)::int enfants FROM eleve_tuteur WHERE tuteur_id = $1", [tB]);
      constater("toujours UNE seule fiche pour ce numero", fiches === 1, `${fiches}`);
      constater("cette fiche est responsable de deux enfants", enfants === 2, `${enfants}`);
    }

    bleu("\n== 4. Transfert du responsable principal ==");
    {
      const { prep, r, v } = await parAgent("parents.responsabilites", { ...dit1, tuteur: "la mère", estPrincipal: true, estResponsableFinancier: true }, outils);
      constater("preparer annonce que le pere cesse d'etre principal", prep.ok && /cesse d'être responsable principal/.test(prep.texte), prep.message ?? "");
      constater("API", r?.ok === true, r?.message ?? "");
      constater("relecture (verifier)", v?.ok === true, v?.raison ?? "");
      const lignes = await q("SELECT tuteur_id::text t, est_principal p, est_responsable_financier f FROM eleve_tuteur WHERE eleve_id = $1", [e1]);
      const principaux = lignes.filter((l) => l.p);
      constater("un seul principal, et c'est la mere", principaux.length === 1 && principaux[0].t === tB, JSON.stringify(principaux.map((l) => l.t === tB ? "mere" : "pere")));
      constater("la mere est responsable financiere", lignes.find((l) => l.t === tB)?.f === true);
      const [{ n }] = await q("SELECT count(*)::int n FROM journal_audit WHERE action = 'tuteur.responsabilites_modifiees' AND eleve_id = $1 AND utilisateur_id = $2", [e1, admin.id]);
      constater("audit au nom de l'acteur, avec avant/apres", n === 1, `${n}`);
    }

    bleu("\n== 5. Retirer le titre de principal sans successeur : refuse ==");
    {
      const r = await guergne.modifierResponsabilitesTuteur({ eleveId: e1, tuteurId: tB, responsabilites: { estPrincipal: false } }, ctx);
      constater("refus du backend, pour cette raison", r?.ok === false && /se transfère/.test(r?.message ?? ""), r?.message ?? "");
      const [{ n }] = await q("SELECT count(*)::int n FROM eleve_tuteur WHERE eleve_id = $1 AND est_principal", [e1]);
      constater("toujours un principal", n === 1);
    }

    bleu("\n== 6. Detacher ==");
    {
      const { prep, r, v } = await parAgent("parents.detacher", { ...dit1, tuteur: "le père" }, outils);
      constater("API", prep.ok && r?.ok === true, prep.message ?? r?.message ?? "");
      constater("relecture (verifier)", v?.ok === true, v?.raison ?? "");
      const [{ fiche }] = await q("SELECT count(*)::int fiche FROM tuteurs WHERE id = $1", [tA]);
      constater("la fiche du pere est conservee", fiche === 1);
      const dernier = await parAgent("parents.detacher", { ...dit1, tuteur: "la mère" }, outils);
      constater("le dernier responsable ne se retire pas", dernier.prep.ok === false, dernier.prep.message ?? "");
      const direct = await guergne.detacherTuteur({ eleveId: e1, tuteurId: tB }, ctx);
      constater("... ni par l'API directement", direct?.ok === false, direct?.message ?? "");
    }

    bleu("\n== 7. Notifier « uniquement le pere » de l'eleve 2 ==");
    {
      const { NOTIFICATIONS_TOOLS } = await import("../src/tools-notifications.js");
      const notif = NOTIFICATIONS_TOOLS[0];
      const dit = { ...dit2, responsable: "le père", titre: "Recette", message: "Message de recette, ne pas tenir compte.", canal: "SMS" };
      const parTel = async () =>
        (await q("SELECT count(*)::int n FROM notifications WHERE regexp_replace(telephone,'[^0-9]','','g') = $1", [TEL_A.replace(/\D/g, "")]))[0].n;

      // a) Sans consentement SMS, un parent sans compte n'est pas joignable.
      await db.query("UPDATE tuteurs SET accepte_sms = false WHERE id = $1 AND nom = $2", [tA, MARQUE]);
      const sans = await notif.preparer(dit, outils);
      constater("sans consentement SMS : rien a envoyer", sans.ok === false && /Aucun parent joignable/.test(sans.message ?? ""), sans.message ?? "PROPOSE — anomalie");

      // b) Consentement pose sur la fiche de SYNTHESE : un SMS, chiffre.
      await db.query("UPDATE tuteurs SET accepte_sms = true WHERE id = $1 AND nom = $2", [tA, MARQUE]);
      const prep = await notif.preparer(dit, outils);
      constater("avec consentement : devis d'UN SMS, au seul pere", prep.ok && prep.params.selection.ids.length === 1 && prep.params.selection.ids[0] === tA && prep.params.plafondNotifications === 1, prep.message ?? prep.texte?.split("\n")[3]);
      constater("le devis chiffre le cout", prep.ok && prep.params.plafondCoutFcfa > 0, `${prep.params?.plafondCoutFcfa} FCFA`);
      const avant = await parTel();
      const r = await guergne.envoyerNotificationParents(prep.params, ctx);
      const v = await notif.verifier({ result: r, params: prep.params });
      const apres = await parTel();
      constater("envoi accepte et dit « en file »", v.ok === true && /mise en file/.test(v.texte ?? ""), v.raison ?? r?.data?.message ?? r?.message);
      constater("exactement UN message en file pour ce numero", apres - avant === 1, `${avant} -> ${apres}`);

      // c) Meme cle d'envoi : aucun doublon.
      await guergne.envoyerNotificationParents(prep.params, ctx);
      constater("un second envoi avec la meme cle ne cree rien", (await parTel()) === apres, `${await parTel()}`);
    }

    bleu("\n== 7 bis. Situation scolaire : transfert, puis exclusion definitive ==");
    {
      const { STATUT_TOOLS } = await import("../src/tools-statut.js");
      const st = STATUT_TOOLS[0];
      const etat = async (id) =>
        (await q(
          `SELECT e.statut::text statut,
                  (SELECT count(*)::int FROM inscriptions i WHERE i.eleve_id = e.id AND i.active) actives,
                  (SELECT count(*)::int FROM historique_statuts h WHERE h.eleve_id = e.id) histo,
                  (SELECT etablissement_destination FROM inscriptions i WHERE i.eleve_id = e.id ORDER BY date_inscription DESC LIMIT 1) dest
             FROM eleves e WHERE e.id = $1`,
          [id],
        ))[0];

      const dit = { ...dit1, statut: "transfert", motif: "Déménagement de la famille (recette)", etablissement: "Lycée de recette, Moundou" };
      constater("validate : transfert complet accepte", Object.keys(st.validate({ ...dit, eleve: "x" })).length === 0);
      const prep = await st.preparer(dit, outils);
      constater("preparer annonce la cloture de l'inscription", prep.ok && /sera close/.test(prep.texte), prep.message ?? "");
      const r = await guergne.changerStatutEleve(prep.params, ctx);
      const v = await st.verifier({ params: prep.params, guergne, ctx });
      const e = await etat(e1);
      constater("API", r?.ok === true, r?.message ?? "");
      constater("relecture (verifier)", v.ok === true, v.raison ?? "");
      constater("en base : TRANSFERE, inscription close, destination, historique", e.statut === "TRANSFERE" && e.actives === 0 && e.dest === dit.etablissement && e.histo >= 1, JSON.stringify(e));
      const [{ n }] = await q("SELECT count(*)::int n FROM journal_audit WHERE action = 'eleve.transfere' AND eleve_id = $1 AND utilisateur_id = $2", [e1, admin.id]);
      constater("audit au nom de l'acteur", n === 1, `${n}`);
      const apres = await st.preparer({ ...dit1, statut: "abandon", motif: "plus de nouvelles (recette)" }, outils);
      constater("un eleve parti : plus aucune decision", apres.ok === false && /déjà quitté/.test(apres.message ?? ""), apres.message ?? "");
      const direct = await guergne.changerStatutEleve({ eleveId: e1, statut: "ABANDON", motif: "contournement (recette)" }, ctx);
      constater("... ni par l'API directement", direct?.ok === false, direct?.message ?? "");

      const excl = await st.preparer({ ...dit2, statut: "exclusion définitive", motif: "Faits graves (recette)", decision: "conseil de discipline de recette du 12/11/2026" }, outils);
      const re = await guergne.changerStatutEleve(excl.params, ctx);
      const ve = await st.verifier({ params: excl.params, guergne, ctx });
      const [h] = await q("SELECT motif FROM historique_statuts WHERE eleve_id = $1 ORDER BY cree_le DESC LIMIT 1", [e2]);
      constater("exclusion : enregistree et relue", re?.ok === true && ve.ok === true, re?.message ?? ve.raison ?? "");
      constater("la reference de la decision est dans l'historique", /conseil de discipline de recette/.test(h?.motif ?? ""), h?.motif);
      const statutInconnu = await guergne.changerStatutEleve({ eleveId: e2, statut: "DIPLOME", motif: "contournement (recette)" }, ctx);
      constater("un statut hors liste est refuse par la route", statutInconnu?.ok === false, statutInconnu?.message ?? "");
    }

    bleu("\n== 8. Ecritures eteintes = refusees ==");
    gris("  (couvert par la recette CRUD : ECRITURES_DESACTIVEES quand la variable est absente)");
  } finally {
    bleu("\n== Nettoyage, par identifiants ==");
    try {
      await db.query("BEGIN");
      let n = 0;
      // Les notifications de recette, par les numeros fictifs (verifies libres au depart).
      n += (await db.query(
        "DELETE FROM notifications WHERE regexp_replace(telephone,'[^0-9]','','g') IN ($1, $2)",
        [TEL_A.replace(/\D/g, ""), TEL_B.replace(/\D/g, "")],
      )).rowCount;
      for (const id of ids.eleves) {
        n += (await db.query("DELETE FROM notifications WHERE eleve_id = $1", [id])).rowCount;
        n += (await db.query("DELETE FROM eleves WHERE id = $1 AND nom = $2", [id, MARQUE])).rowCount;
      }
      // Les numeros fictifs ont ete verifies LIBRES avant la recette : toute
      // fiche qui les porte vient d'elle. Seulement si plus rien n'y est rattache.
      n += (await db.query(
        "DELETE FROM tuteurs t WHERE regexp_replace(t.telephone,'[^0-9]','','g') IN ($1, $2) AND NOT EXISTS (SELECT 1 FROM eleve_tuteur et WHERE et.tuteur_id = t.id)",
        [TEL_A.replace(/\D/g, ""), TEL_B.replace(/\D/g, "")],
      )).rowCount;
      if (ids.classe) n += (await db.query("DELETE FROM classes WHERE id = $1 AND libelle LIKE $2", [ids.classe, `${MARQUE}%`])).rowCount;
      await db.query("COMMIT");
      const [{ reste }] = await q(
        "SELECT (SELECT count(*) FROM eleves WHERE nom = $1) + (SELECT count(*) FROM tuteurs WHERE regexp_replace(telephone,'[^0-9]','','g') IN ($2,$3)) + (SELECT count(*) FROM classes WHERE libelle LIKE $4) AS reste",
        [MARQUE, TEL_A.replace(/\D/g, ""), TEL_B.replace(/\D/g, ""), `${MARQUE}%`],
      );
      constater("nettoyage complet (audit conserve)", Number(reste) === 0, `${n} ligne(s) supprimee(s), reste ${reste}`);
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      rouge(`  nettoyage en echec : ${e.message} — identifiants : ${JSON.stringify(ids)}`);
    }
    await db.end();
  }
  const echecs = resultats.filter((x) => !x).length;
  bleu(`\n== ${resultats.length - echecs}/${resultats.length} verifications reussies ==`);
  if (echecs) process.exitCode = 1;
}

principal().catch((e) => {
  rouge(`Echec : ${String(e?.message ?? e).slice(0, 300)}`);
  process.exit(1);
});
