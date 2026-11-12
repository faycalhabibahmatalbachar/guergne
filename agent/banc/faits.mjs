/**
 * L'ORACLE : ce que la base de test dit, lu en SQL, SANS passer par l'agent ni
 * par le backend.
 *
 * Un scénario ne compare jamais la réponse de l'agent à ce que l'agent a lu :
 * il la compare à ces faits. C'est ce qui distingue « l'outil a répondu » de
 * « la réponse est juste ».
 */

const sansAccent = (s) => String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "");

export async function chargerFaits(q) {
  const f = {};

  const [annee] = await q("SELECT id::text, libelle, date_debut::text, date_fin::text FROM annees_scolaires WHERE est_courante");
  f.annee = annee;

  // Classes de l'année, effectif = inscriptions actives.
  const classes = await q(
    `SELECT c.id::text, c.libelle, c.code,
            (SELECT count(*)::int FROM inscriptions i WHERE i.classe_id = c.id AND i.active) AS effectif
       FROM classes c WHERE c.annee_id = $1 AND c.active ORDER BY c.libelle`,
    [annee.id],
  );
  f.classes = Object.fromEntries(classes.map((c) => [c.code, c]));
  f.listeClasses = classes;

  const periodes = await q("SELECT id::text, numero, libelle, date_debut::text, date_fin::text FROM periodes WHERE annee_id = $1 ORDER BY numero", [annee.id]);
  f.periodes = Object.fromEntries(periodes.map((p) => [p.numero, p]));

  // Assiduité par classe (toutes dates).
  const abs = await q(
    `SELECT c.code, count(*)::int total, count(*) FILTER (WHERE a.statut = 'NON_JUSTIFIEE')::int nonj
       FROM absences a JOIN inscriptions i ON i.id = a.inscription_id JOIN classes c ON c.id = i.classe_id
      WHERE c.annee_id = $1 GROUP BY c.code`,
    [annee.id],
  );
  f.absences = Object.fromEntries(abs.map((a) => [a.code, a]));
  const ret = await q(
    `SELECT c.code, count(*)::int total FROM retards r JOIN inscriptions i ON i.id = r.inscription_id JOIN classes c ON c.id = i.classe_id
      WHERE c.annee_id = $1 GROUP BY c.code`,
    [annee.id],
  );
  f.retards = Object.fromEntries(ret.map((a) => [a.code, a.total]));
  const inc = await q(
    `SELECT c.code, count(*)::int total FROM incidents r JOIN inscriptions i ON i.id = r.inscription_id JOIN classes c ON c.id = i.classe_id
      WHERE c.annee_id = $1 GROUP BY c.code`,
    [annee.id],
  );
  f.incidents = Object.fromEntries(inc.map((a) => [a.code, a.total]));

  /** Absences d'une classe sur un intervalle, éventuellement par statut. */
  f.compterAbsences = async ({ code, depuis = null, jusqua = null, statut = null, periode = null }) => {
    const [r] = await q(
      `SELECT count(*)::int n FROM absences a JOIN inscriptions i ON i.id = a.inscription_id JOIN classes c ON c.id = i.classe_id
        WHERE c.annee_id = $1 AND ($2::text IS NULL OR c.code = $2)
          AND ($3::date IS NULL OR a.date_absence >= $3::date) AND ($4::date IS NULL OR a.date_absence <= $4::date)
          AND ($5::text IS NULL OR a.statut::text = $5) AND ($6::uuid IS NULL OR a.periode_id = $6::uuid)`,
      [annee.id, code, depuis, jusqua, statut, periode],
    );
    return r.n;
  };

  // Un élève SANS homonyme (ni nom complet, ni prénom seul trop répandu), avec
  // un père, des notes, des absences et un reste à payer : le sujet des
  // scénarios « un élève précis ».
  const [u] = await q(
    `SELECT e.id::text, e.nom, e.prenom, e.matricule, e.sexe, c.libelle AS classe, c.code AS code_classe, i.id::text AS inscription_id
       FROM eleves e JOIN inscriptions i ON i.eleve_id = e.id AND i.active JOIN classes c ON c.id = i.classe_id
      WHERE e.statut = 'INSCRIT' AND c.annee_id = $1
        AND (SELECT count(*) FROM eleves x WHERE x.nom = e.nom AND x.prenom = e.prenom) = 1
        AND EXISTS (SELECT 1 FROM eleve_tuteur et WHERE et.eleve_id = e.id AND et.lien = 'PERE')
        AND EXISTS (SELECT 1 FROM absences a WHERE a.inscription_id = i.id)
        AND EXISTS (SELECT 1 FROM echeances ec WHERE ec.inscription_id = i.id AND ec.montant_du_fcfa > ec.montant_paye_fcfa + ec.montant_exonere_fcfa)
      ORDER BY (SELECT count(*) FROM eleves x WHERE x.nom = e.nom), (SELECT count(*) FROM eleves x WHERE x.prenom = e.prenom), e.matricule LIMIT 1`,
    [annee.id],
  );
  if (!u) throw new Error("oracle : aucun élève sans homonyme répondant aux critères");
  u.tuteurs = await q(
    `SELECT t.id::text, t.nom, t.prenom, t.telephone, et.lien, et.est_principal, t.app_activee
       FROM eleve_tuteur et JOIN tuteurs t ON t.id = et.tuteur_id WHERE et.eleve_id = $1 ORDER BY et.est_principal DESC, t.nom`,
    [u.id],
  );
  const [fin] = await q(
    `SELECT coalesce(sum(montant_du_fcfa),0)::int du, coalesce(sum(montant_paye_fcfa),0)::int paye, coalesce(sum(montant_exonere_fcfa),0)::int exonere
       FROM echeances WHERE inscription_id = $1`,
    [u.inscription_id],
  );
  u.finances = { ...fin, reste: fin.du - fin.paye - fin.exonere };
  const [ass] = await q(
    `SELECT (SELECT count(*)::int FROM absences WHERE inscription_id = $1) absences,
            (SELECT count(*)::int FROM retards WHERE inscription_id = $1) retards`,
    [u.inscription_id],
  );
  u.assiduite = ass;
  f.unique = u;

  // Une paire d'HOMONYMES parfaits (même nom, même prénom).
  const [h] = await q("SELECT nom, prenom FROM eleves GROUP BY 1, 2 HAVING count(*) = 2 ORDER BY 1, 2 LIMIT 1");
  f.homonymes = {
    nom: h.nom,
    prenom: h.prenom,
    eleves: await q(
      `SELECT e.id::text, e.matricule, c.libelle AS classe FROM eleves e
         LEFT JOIN inscriptions i ON i.eleve_id = e.id AND i.active LEFT JOIN classes c ON c.id = i.classe_id
        WHERE e.nom = $1 AND e.prenom = $2 ORDER BY e.matricule`,
      [h.nom, h.prenom],
    ),
  };

  // Un enseignant au nom unique.
  const [ens] = await q(
    "SELECT id::text, nom, prenom, specialite FROM enseignants e WHERE actif AND (SELECT count(*) FROM enseignants x WHERE x.nom = e.nom) = 1 ORDER BY nom LIMIT 1",
  );
  f.enseignant = ens ?? null;

  const [tot] = await q(
    `SELECT (SELECT count(*)::int FROM inscriptions i JOIN classes c ON c.id = i.classe_id WHERE c.annee_id = $1 AND i.active) inscrits,
            (SELECT count(*)::int FROM enseignants WHERE actif) enseignants,
            (SELECT count(*)::int FROM sanctions) sanctions,
            (SELECT count(*)::int FROM tuteurs WHERE utilisateur_id IS NULL) parents_sans_compte,
            (SELECT count(*)::int FROM tuteurs) parents`,
    [annee.id],
  );
  f.totaux = tot;

  f.sansAccent = sansAccent;
  /** Un nombre tel que l'agent l'écrit : « 26 757 500 », espaces fines ou non. */
  f.nombre = (n) => new RegExp("(?<![\\d])" + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "[\\s\\u202f\\u00a0.]?") + "(?![\\d])");
  return f;
}
