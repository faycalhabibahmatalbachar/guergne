/**
 * Recette RÉELLE des huit outils branchés le 2026-11-11.
 *
 * Chaque outil est éprouvé par son chemin complet, exactement celui de
 * WhatsApp :
 *
 *     preparer (noms -> identifiants, relus au backend)
 *       -> GuergneHttpClient -> POST /api/agent/{action} -> guard -> Neon
 *       -> rendre (texte WhatsApp)
 *
 * puis comparé à une requête SQL INDÉPENDANTE, en lecture seule. Le script ne
 * produit jamais une réponse à partir de la base : il s'en sert pour vérifier.
 *
 * Il n'écrit RIEN. Aucune des huit opérations n'écrit, et la session SQL est
 * ouverte en `default_transaction_read_only`.
 *
 * BASE : celle que le backend lit. `next dev` charge `.env.development.local`
 * avant `.env.local` ; on reproduit cet ordre (voir recette-backend-reel.mjs).
 *
 *   node scripts/recette-scolarite-reel.mjs [--base http://localhost:3100]
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { GuergneHttpClient } from "../src/guergne-client.js";
import { SCOLARITE_TOOLS } from "../src/tools-scolarite.js";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const depot = resolve(racine, "..");

const bleu = (s) => console.log(`\x1b[1;34m${s}\x1b[0m`);
const vert = (s) => console.log(`\x1b[1;32m${s}\x1b[0m`);
const rouge = (s) => console.error(`\x1b[1;31m${s}\x1b[0m`);
const gris = (s) => console.log(`\x1b[0;90m${s}\x1b[0m`);

function lire(chemin, nom) {
  try {
    for (const ligne of readFileSync(chemin, "utf8").split(/\r?\n/)) {
      const m = ligne.match(/^([A-Z_0-9]+)\s*=\s*(.*)$/);
      if (m && m[1] === nom) return m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* fichier absent : on essaie le suivant */
  }
  return null;
}

const resultats = [];
const consigner = (nom, ok, detail) => {
  resultats.push({ nom, ok, detail });
  (ok ? vert : rouge)(`  ${ok ? "OK  " : "ECHEC"}  ${nom}${detail ? ` — ${detail}` : ""}`);
};
const apercu = (t, n = 6) => gris(String(t ?? "(rien)").split("\n").slice(0, n).map((l) => `    ${l}`).join("\n"));

const outil = (nom) => SCOLARITE_TOOLS.find((o) => o.name === nom);

/** Le chemin de l'agent : preparer, appeler, rendre. */
async function parAgent(nom, dit, outils) {
  const o = outil(nom);
  let params = dit;
  if (o.preparer) {
    const prep = await o.preparer(dit, outils);
    if (!prep.ok) return { prep, r: null, rendu: prep.message };
    params = prep.params;
  }
  const r = await outils.guergne[o.action](params, outils.ctx);
  return { params, r, rendu: r?.ok === false ? r.message : o.rendre(r?.data, params) };
}

async function principal() {
  const iBase = process.argv.indexOf("--base");
  const base = iBase > 0 ? process.argv[iBase + 1] : lire(join(racine, ".env"), "SCHOOL_API_BASE_URL");
  const jeton = lire(join(racine, ".env"), "AGENT_SERVICE_TOKEN");
  if (!base || !jeton) {
    rouge("SCHOOL_API_BASE_URL (ou --base) et AGENT_SERVICE_TOKEN requis");
    process.exit(2);
  }
  if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(base)) {
    rouge(`Refus : cette recette vise un backend LOCAL, pas ${new URL(base).host}.`);
    process.exit(2);
  }
  const guergne = new GuergneHttpClient({ baseUrl: base, serviceToken: jeton });

  const webDir = join(depot, "web");
  let urlVerif = null;
  let source = null;
  for (const f of [".env.development.local", ".env.local"]) {
    urlVerif = lire(join(webDir, f), "DATABASE_URL_DIRECT") ?? lire(join(webDir, f), "DATABASE_URL");
    if (urlVerif) {
      source = f;
      break;
    }
  }
  if (!urlVerif) throw new Error("aucune URL de base pour la verification");
  const db = new pg.Client({ connectionString: urlVerif, ssl: { rejectUnauthorized: false } });
  await db.connect();
  await db.query("SET default_transaction_read_only = on");
  const q = async (s, p) => (await db.query(s, p)).rows;
  const [{ branche }] = await q("SELECT current_setting('neon.branch_id', true) AS branche");
  gris(`  base de verification : ${source} -> branche ${branche ?? "inconnue"}`);
  if (branche === "br-red-waterfall-b1ajf6iu") {
    rouge("Refus : la base de verification est la production presumee.");
    process.exit(2);
  }

  try {
    const [admin] = await q("SELECT id::text FROM utilisateurs WHERE donnees_semees = false AND role = 'SUPER_ADMIN' AND actif ORDER BY cree_le LIMIT 1");
    const [parent] = await q("SELECT id::text FROM utilisateurs WHERE donnees_semees = false AND role = 'PARENT' AND actif ORDER BY cree_le LIMIT 1");
    if (!admin) throw new Error("aucun SUPER_ADMIN authentique");
    const outils = { guergne, ctx: { actorId: admin.id } };
    const [annee] = await q("SELECT id::text, libelle FROM annees_scolaires WHERE est_courante");
    gris(`  acteur : SUPER_ADMIN authentique ; annee courante ${annee.libelle}`);

    bleu("\n== 1. referentiel.series ==");
    {
      const { r, rendu } = await parAgent("referentiel.series", {}, outils);
      const [v] = await q("SELECT count(*)::int n FROM series WHERE active");
      consigner("series = Neon", r?.ok && r.data.length === v.n, `agent ${r?.data?.length}, Neon ${v.n}`);
      apercu(rendu, 4);
    }

    bleu("\n== 2. referentiel.periodes ==");
    {
      const { r, rendu } = await parAgent("referentiel.periodes", {}, outils);
      const [v] = await q("SELECT count(*)::int n FROM periodes WHERE annee_id = $1", [annee.id]);
      consigner("periodes = Neon", r?.ok && r.data.length === v.n, `agent ${r?.data?.length}, Neon ${v.n}`);
      apercu(rendu, 4);
    }

    bleu("\n== 3. referentiel.classes_matieres ==");
    {
      const { r, rendu } = await parAgent("referentiel.classes_matieres", {}, outils);
      const [v] = await q(
        "SELECT (SELECT count(*)::int FROM classes WHERE annee_id = $1 AND active) c, (SELECT count(*)::int FROM matieres WHERE active) m",
        [annee.id],
      );
      consigner("classes = Neon", r?.ok && r.data.classes.length === v.c, `agent ${r?.data?.classes?.length}, Neon ${v.c}`);
      consigner("matieres = Neon", r?.ok && r.data.matieres.length === v.m, `agent ${r?.data?.matieres?.length}, Neon ${v.m}`);
      apercu(rendu, 2);
    }

    bleu("\n== 4. parents.statistiques ==");
    {
      const { r, rendu } = await parAgent("parents.statistiques", {}, outils);
      const [v] = await q("SELECT count(*)::int total, count(*) FILTER (WHERE utilisateur_id IS NULL)::int sans FROM tuteurs");
      consigner("total parents = Neon", r?.data?.total === v.total, `agent ${r?.data?.total}, Neon ${v.total}`);
      consigner("sans compte = Neon", r?.data?.sansCompte === v.sans, `agent ${r?.data?.sansCompte}, Neon ${v.sans}`);
      apercu(rendu, 7);
    }

    bleu("\n== 5. parents.rechercher par etat et par classe ==");
    {
      const { r, params } = await parAgent("parents.rechercher", { etat: "jamais connecté" }, outils);
      const [v] = await q(
        `SELECT count(*)::int n FROM tuteurs t JOIN utilisateurs u ON u.id = t.utilisateur_id
          WHERE u.actif IS TRUE AND u.derniere_connexion IS NULL`,
      );
      consigner("« jamais connecte » -> etat invite", params?.etat === "invite", JSON.stringify(params));
      consigner("parents invites = Neon", r?.data?.total === v.n, `agent ${r?.data?.total}, Neon ${v.n}`);

      const [cl] = await q(
        `SELECT c.id::text, c.libelle FROM classes c WHERE c.annee_id = $1 AND c.active
          AND EXISTS (SELECT 1 FROM inscriptions i JOIN eleve_tuteur et ON et.eleve_id = i.eleve_id WHERE i.classe_id = c.id AND i.active)
          ORDER BY c.libelle LIMIT 1`,
        [annee.id],
      );
      if (cl) {
        const parClasse = await parAgent("parents.rechercher", { classe: cl.libelle }, outils);
        const [vc] = await q(
          `SELECT count(DISTINCT et.tuteur_id)::int n FROM eleve_tuteur et
             JOIN inscriptions i ON i.eleve_id = et.eleve_id AND i.active WHERE i.classe_id = $1`,
          [cl.id],
        );
        consigner(`parents de ${cl.libelle} = Neon`, parClasse.r?.data?.total === vc.n, `agent ${parClasse.r?.data?.total}, Neon ${vc.n}`);
        apercu(parClasse.rendu, 3);
      }
    }

    bleu("\n== 6. notes.releve, nom + « premier trimestre » ==");
    {
      const [cible] = await q(
        `SELECT e.matricule, e.prenom, e.nom, i.id::text inscription, p.id::text periode
           FROM notes n
           JOIN evaluations ev ON ev.id = n.evaluation_id
           JOIN periodes p     ON p.id = ev.periode_id AND p.numero = 1
           JOIN inscriptions i ON i.id = n.inscription_id AND i.annee_id = $1
           JOIN eleves e       ON e.id = i.eleve_id
          GROUP BY e.matricule, e.prenom, e.nom, i.id, p.id
          ORDER BY count(*) DESC LIMIT 1`,
        [annee.id],
      );
      if (!cible) {
        gris("  aucune note au premier trimestre de l'annee courante : etape sans objet");
      } else {
        const { r, params, rendu } = await parAgent("notes.releve", { eleve: cible.matricule, periode: "premier trimestre" }, outils);
        consigner("eleve resolu par matricule, periode 1", params?.periodeNumero === 1 && Boolean(params?.eleveId), JSON.stringify(params));
        const [v] = await q(
          `SELECT count(*)::int notes, count(DISTINCT ev.matiere_id)::int matieres
             FROM notes n JOIN evaluations ev ON ev.id = n.evaluation_id
            WHERE n.inscription_id = $1 AND ev.periode_id = $2`,
          [cible.inscription, cible.periode],
        );
        const d = r?.data;
        const nbNotes = (d?.matieres ?? []).reduce((s, m) => s + m.notes.length, 0);
        consigner("matieres du releve = Neon", d?.matieres?.length === v.matieres, `agent ${d?.matieres?.length}, Neon ${v.matieres}`);
        consigner("notes du releve = Neon", nbNotes === v.notes, `agent ${nbNotes}, Neon ${v.notes}`);
        const [bull] = await q(
          "SELECT moyenne_generale::float m FROM bulletins WHERE inscription_id = $1 AND periode_id = $2",
          [cible.inscription, cible.periode],
        );
        if (bull?.m !== undefined && bull?.m !== null) {
          // Même règle que le bulletin : sauf note modifiée depuis la
          // génération, les deux doivent coïncider.
          consigner(
            "moyenne generale = celle du bulletin genere",
            Math.abs(Number(d?.moyenneGenerale) - bull.m) < 0.011,
            `agent ${d?.moyenneGenerale}, bulletin ${bull.m}`,
          );
        } else {
          gris("  aucun bulletin genere pour cette periode : comparaison de moyenne sans objet");
        }
        apercu(rendu, 8);
      }
    }

    bleu("\n== 7. finances.situations, une classe, impayes ==");
    {
      const [cl] = await q(
        `SELECT c.id::text, c.libelle FROM classes c
           JOIN inscriptions i ON i.classe_id = c.id AND i.active
           LEFT JOIN v_situation_financiere s ON s.inscription_id = i.id
          WHERE c.annee_id = $1 AND COALESCE(s.reste_du_fcfa, 0) > 0
          GROUP BY c.id, c.libelle ORDER BY count(*) DESC LIMIT 1`,
        [annee.id],
      );
      if (!cl) {
        gris("  aucun impaye dans l'annee courante : etape sans objet");
      } else {
        const { r, params, rendu } = await parAgent("finances.situations", { classe: cl.libelle, seulementImpayes: true }, outils);
        const [v] = await q(
          `SELECT count(*)::int n, COALESCE(sum(s.reste_du_fcfa), 0)::bigint reste
             FROM inscriptions i LEFT JOIN v_situation_financiere s ON s.inscription_id = i.id
            WHERE i.classe_id = $1 AND i.active AND COALESCE(s.reste_du_fcfa, 0) > 0`,
          [cl.id],
        );
        const reste = (r?.data ?? []).reduce((s, x) => s + Number(x.resteDu), 0);
        consigner(`« ${cl.libelle} » resolue`, params?.classeId === cl.id, JSON.stringify(params));
        consigner("eleves en impaye = Neon", r?.data?.length === v.n, `agent ${r?.data?.length}, Neon ${v.n}`);
        consigner("reste du total = Neon", reste === Number(v.reste), `agent ${reste}, Neon ${v.reste}`);
        apercu(rendu, 4);
      }
    }

    bleu("\n== 8. pedagogie.calendrier_evaluations, « T1 » ==");
    {
      const { r, rendu } = await parAgent("pedagogie.calendrier_evaluations", { periode: "T1" }, outils);
      const [v] = await q(
        `SELECT count(*)::int n FROM evaluations ev JOIN periodes p ON p.id = ev.periode_id
          WHERE p.annee_id = $1 AND p.numero = 1 AND ev.statut <> 'ANNULEE'`,
        [annee.id],
      );
      consigner("evaluations du T1 = Neon", r?.ok && r.data.jours.length === v.n, `agent ${r?.data?.jours?.length}, Neon ${v.n}`);
      apercu(rendu, 4);
    }

    bleu("\n== 9 bis. eleves.fiche, la fiche complete ==");
    {
      const { FICHE_TOOLS } = await import("../src/fiche-eleve.js");
      const fiche = FICHE_TOOLS[0];
      const [cible] = await q(
        `SELECT e.id::text, e.matricule FROM eleves e
           JOIN inscriptions i ON i.eleve_id = e.id AND i.active AND i.annee_id = $1
          WHERE EXISTS (SELECT 1 FROM eleve_tuteur et WHERE et.eleve_id = e.id)
          ORDER BY (SELECT count(*) FROM absences a WHERE a.inscription_id = i.id) DESC LIMIT 1`,
        [annee.id],
      );
      const prep = await fiche.preparer({ eleve: cible.matricule }, outils);
      const r = await guergne.ficheEleve(prep.params, outils.ctx);
      const d = r?.data;
      const [v] = await q(
        `SELECT (SELECT count(*)::int FROM eleve_tuteur WHERE eleve_id = $1) tuteurs,
                (SELECT count(*)::int FROM pieces_dossier WHERE eleve_id = $1) pieces`,
        [cible.id],
      );
      consigner("fiche : responsables = Neon", d?.tuteurs?.length === v.tuteurs, `agent ${d?.tuteurs?.length}, Neon ${v.tuteurs}`);
      consigner("fiche : pieces = Neon", d?.pieces?.length === Math.min(v.pieces, 30), `agent ${d?.pieces?.length}, Neon ${v.pieces}`);
      consigner("fiche SUPER_ADMIN : rien de masque, sante presente", d?.masquees?.length === 0 && Boolean(d?.identite?.sante), JSON.stringify(d?.masquees));
      consigner("fiche : aucune URL de fichier exposee", !JSON.stringify(d?.pieces ?? []).includes("fichier_url") && !JSON.stringify(d?.pieces ?? []).includes("http"));
      apercu(fiche.rendre(d), 14);

      const [compta] = await q("SELECT id::text, role::text FROM utilisateurs WHERE role IN ('SECRETARIAT','COMPTABLE','ENSEIGNANT') AND actif ORDER BY donnees_semees, role, cree_le LIMIT 1");
      if (compta) {
        const rc = await guergne.ficheEleve(prep.params, { actorId: compta.id });
        const m = rc?.data?.masquees ?? [];
        consigner(
          `fiche ${compta.role} : sante et journal masques, et nommes`,
          rc?.ok !== false && !rc?.data?.identite?.sante && m.includes("santé") && m.includes("journal des modifications"),
          rc?.ok === false ? `refus : ${rc.message}` : `masquees : ${m.join(", ")}`,
        );
      } else {
        gris("  aucun SECRETARIAT, COMPTABLE ni ENSEIGNANT actif : filtrage par role non eprouve");
      }
    }

    bleu("\n== 9. Le guard s'applique aux nouveaux outils ==");
    if (parent) {
      const r = await guergne.statistiquesParents({}, { actorId: parent.id });
      consigner("un PARENT n'obtient pas la synthese des comptes parents", r?.ok !== true, r?.ok ? "ACCORDE — anomalie" : String(r?.message ?? "").slice(0, 80));
      const f = await guergne.listerSituationsFinancieres({}, { actorId: parent.id });
      consigner("un PARENT ne liste pas toutes les situations financieres", f?.ok !== true, f?.ok ? "ACCORDE — anomalie" : String(f?.message ?? "").slice(0, 80));
    } else {
      gris("  aucun parent authentique actif : refus non eprouve");
    }
  } finally {
    await db.end();
  }

  const echecs = resultats.filter((x) => !x.ok);
  bleu(`\n== ${resultats.length - echecs.length}/${resultats.length} verifications reussies ==`);
  if (echecs.length) process.exitCode = 1;
}

principal().catch((e) => {
  rouge(`Echec : ${String(e?.message ?? e).slice(0, 300)}`);
  process.exit(1);
});
