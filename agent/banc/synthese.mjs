/**
 * Données de SYNTHÈSE pour les scénarios d'écriture.
 *
 * Aucune écriture du banc ne touche un élève, un parent ou une classe de la
 * base : tout porte sur ces fiches, marquées « BANCIA », créées PAR LE BACKEND
 * (donc par les parcours réels) et retirées à la fin PAR IDENTIFIANT ou par
 * marque. Les téléphones sont dans la plage réservée à la fiction
 * (+33 1 99 00 xx xx) et vérifiés libres avant usage. Le journal d'audit est
 * conservé.
 */
export const MARQUE = "BANCIA";
export const TELEPHONES = { pere: "+33199001250", mere: "+33199001251", oncle: "+33199001252", nouveau: "+33199001253" };
const chiffres = (t) => t.replace(/\D/g, "");
const TOUS = Object.values(TELEPHONES).map(chiffres);
export const CLASSES = { zeta: { libelle: "Banc Zeta", code: "BZ1" }, omega: { libelle: "Banc Omega", code: "BZ2" } };
/** Codes des classes que les scénarios créent eux-mêmes. */
export const CODES_SCENARIOS = ["BG9"];
/** Le surveillant du banc : la base de test n'en a aucun d'actif. Domaine réservé `.invalid`. */
const EMAIL_SURVEILLANT = "surveillant.banc@lycee.invalid";

async function purger(q) {
  const codes = [...Object.values(CLASSES).map((c) => c.code), ...CODES_SCENARIOS];
  let n = 0;
  const run = async (s, p) => {
    const r = await q(s + " RETURNING 1", p);
    n += r.length;
  };
  await run("DELETE FROM notifications WHERE regexp_replace(telephone,'[^0-9]','','g') = ANY($1)", [TOUS]);
  await run("DELETE FROM notifications WHERE eleve_id IN (SELECT id FROM eleves WHERE nom = $1)", [MARQUE]);
  await run("DELETE FROM eleves WHERE nom = $1", [MARQUE]);
  await run(
    "DELETE FROM tuteurs t WHERE regexp_replace(t.telephone,'[^0-9]','','g') = ANY($1) AND NOT EXISTS (SELECT 1 FROM eleve_tuteur et WHERE et.tuteur_id = t.id)",
    [TOUS],
  );
  await run("DELETE FROM classes c WHERE c.code = ANY($1) AND NOT EXISTS (SELECT 1 FROM inscriptions i WHERE i.classe_id = c.id)", [codes]);
  await run("DELETE FROM utilisateurs WHERE email = $1 AND nom = $2", [EMAIL_SURVEILLANT, MARQUE]);
  return n;
}

/**
 * Pose le décor. Rend les identifiants créés.
 * @param {object} o { q, guergne, ctx }
 */
export async function poserSynthese({ q, guergne, ctx }) {
  // Reliquat d'une campagne interrompue : uniquement des lignes marquées.
  await purger(q);
  const [{ pris }] = await q("SELECT count(*)::int pris FROM tuteurs WHERE regexp_replace(telephone,'[^0-9]','','g') = ANY($1)", [TOUS]);
  if (pris > 0) throw new Error("VERROU : un téléphone de la plage fictive existe déjà hors synthèse (" + pris + ")");

  const [niveau] = await q("SELECT id::text FROM niveaux ORDER BY ordre LIMIT 1");
  const s = { classes: {}, eleves: {}, absences: {} };
  for (const [cle, c] of Object.entries(CLASSES)) {
    const r = await guergne.creerClasse({ libelle: c.libelle, code: c.code, niveauId: niveau.id, capaciteMax: 30 }, ctx);
    const [ligne] = await q("SELECT id::text FROM classes WHERE code = $1", [c.code]);
    if (!ligne) throw new Error("création de la classe de synthèse impossible : " + r?.message);
    s.classes[cle] = { ...c, id: ligne.id };
  }

  const pere = { nom: MARQUE, prenom: "Omar", telephone: TELEPHONES.pere, lien: "PERE", estPrincipal: true, estTuteurLegal: true };
  const inscrire = async (prenom, classe, sexe = "M") => {
    const r = await guergne.inscrireEleve({ nom: MARQUE, prenom, sexe, dateNaissance: "2013-04-15", classeId: s.classes[classe].id, tuteurs: [pere] }, ctx);
    const [e] = await q(
      "SELECT e.id::text, e.matricule, i.id::text AS inscription_id FROM eleves e JOIN inscriptions i ON i.eleve_id = e.id AND i.active WHERE e.nom = $1 AND e.prenom = $2",
      [MARQUE, prenom],
    );
    if (!e) throw new Error("création de l'élève de synthèse " + prenom + " impossible : " + r?.message);
    s.eleves[prenom.toLowerCase()] = { ...e, prenom, classe };
    return e;
  };
  await inscrire("Yara", "zeta", "F");
  await inscrire("Xavier", "zeta");
  await inscrire("Wassim", "omega");
  await inscrire("Victor", "omega");

  // Xavier a un second responsable (pour le détachement) et deux absences
  // (l'une à justifier, l'autre à supprimer), au 2e trimestre.
  const r1 = await guergne.rattacherTuteur(
    { eleveId: s.eleves.xavier.id, nom: MARQUE, prenom: "Ousmane", telephone: TELEPHONES.oncle, lien: "ONCLE" },
    ctx,
  );
  if (r1?.ok === false) throw new Error("rattachement de synthèse impossible : " + r1.message);
  const [periode] = await q("SELECT id::text FROM periodes WHERE numero = 2 AND annee_id = (SELECT id FROM annees_scolaires WHERE est_courante)");
  for (const date of ["2026-03-10", "2026-03-12"]) {
    const r = await guergne.enregistrerAppel(
      { classeId: s.classes.zeta.id, periodeId: periode.id, dateAbsence: date, nbHeures: 2, absents: [s.eleves.xavier.inscription_id] },
      ctx,
    );
    if (r?.ok === false) throw new Error("absence de synthèse impossible : " + r.message);
  }
  const abs = await q("SELECT id::text, date_absence::text FROM absences WHERE inscription_id = $1 ORDER BY date_absence", [s.eleves.xavier.inscription_id]);
  if (abs.length !== 2) throw new Error("absences de synthèse : " + abs.length + " au lieu de 2");
  s.absences = { aJustifier: abs[0], aSupprimer: abs[1] };
  s.periode2 = periode.id;

  // Le père de synthèse accepte les SMS : sans canal, aucun devis de
  // notification ne serait possible. Le backend de recette n'a AUCUN
  // transporteur SMS : le message reste en file.
  await q("UPDATE tuteurs SET accepte_sms = true WHERE nom = $1 AND regexp_replace(telephone,'[^0-9]','','g') = $2", [MARQUE, TELEPHONES.pere.replace(/\D/g, "")]);

  // Un SURVEILLANT actif, pour les scénarios de droits. Sans mot de passe
  // utilisable : il n'existe que pour porter un rôle derrière le jeton de service.
  const [sv] = await q(
    `INSERT INTO utilisateurs (email, mot_de_passe_hash, role, nom, prenom, actif, doit_changer_mdp)
     VALUES ($1, 'banc-sans-connexion', 'SURVEILLANT', $2, 'Surveillant', true, false) RETURNING id::text, role::text`,
    [EMAIL_SURVEILLANT, MARQUE],
  );
  s.surveillant = sv;
  return s;
}

export async function retirerSynthese({ q }) {
  const n = await purger(q);
  const [{ reste }] = await q(
    `SELECT ((SELECT count(*) FROM eleves WHERE nom = $1)
           + (SELECT count(*) FROM tuteurs WHERE regexp_replace(telephone,'[^0-9]','','g') = ANY($2))
           + (SELECT count(*) FROM classes WHERE code = ANY($3)))::int AS reste`,
    [MARQUE, TOUS, [...Object.values(CLASSES).map((c) => c.code), ...CODES_SCENARIOS]],
  );
  return { supprimees: n, reste };
}
