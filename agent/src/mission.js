/**
 * Missions — plusieurs étapes pour une seule demande.
 *
 * « Prépare le bilan d'assiduité du mois et informe les responsables » n'est
 * pas un appel d'outil : c'est une suite d'étapes, des chiffres à calculer, une
 * synthèse à rédiger. L'agent savait faire un geste à la fois ; il ne savait
 * pas conduire un travail.
 *
 * LA RÈGLE QUI GOUVERNE TOUT CE MODULE
 * -------------------------------------
 * **Les chiffres sont calculés ici, en code, à partir des lignes rendues par le
 * backend. Le modèle ne les produit jamais.**
 *
 * C'est la seule façon d'avoir un bilan vrai. Un modèle à qui l'on demande une
 * synthèse chiffrée arrondit, invente une tendance, ajoute un total qui
 * paraît juste — et le directeur qui le lit n'a aucun moyen de le savoir. Le
 * modèle décide donc QUELLES données consulter ; `agreger()` dit ce qu'elles
 * contiennent.
 *
 * CE QU'UNE MISSION NE CHANGE PAS
 * --------------------------------
 * Chaque étape repasse par la chaîne complète : RBAC, politique, garde du
 * backend. Une mission n'est pas un laissez-passer : c'est une suite d'appels
 * dont chacun est contrôlé comme s'il était seul.
 */

/** Nombre d'étapes acceptées. Au-delà, c'est une boucle, pas une mission. */
export const MAX_ETAPES = 8;

/** Statut d'une étape, pour le compte rendu. */
export const ETAPE = {
  REUSSIE: "reussie",
  ECHOUEE: "echouee",
  REFUSEE: "refusee",
  IGNOREE: "ignoree",
};

/**
 * Valide un plan de mission rendu par le modèle.
 *
 * @returns {{ok:true, but:string, etapes:object[]} | {ok:false, raison:string}}
 */
export function validerMission(brut, registre) {
  const etapes = Array.isArray(brut?.etapes) ? brut.etapes : null;
  if (!etapes || etapes.length === 0) return { ok: false, raison: "mission sans etape" };
  if (etapes.length > MAX_ETAPES) return { ok: false, raison: `${etapes.length} etapes, maximum ${MAX_ETAPES}` };

  const validees = [];
  for (const [i, e] of etapes.entries()) {
    const nom = typeof e?.outil === "string" ? e.outil.trim() : typeof e?.tool === "string" ? e.tool.trim() : null;
    if (!nom) return { ok: false, raison: `etape ${i + 1} sans outil` };
    const tool = registre?.get?.(nom);
    if (!tool) return { ok: false, raison: `etape ${i + 1} : outil inconnu « ${nom} »` };
    // Une mission consulte et calcule. Y glisser une écriture ferait exécuter
    // en chaîne, sans confirmation ni regard, ce qui modifie des dossiers.
    if (tool.sensitivity !== "read") {
      return { ok: false, raison: `etape ${i + 1} : « ${nom} » n'est pas une consultation` };
    }
    validees.push({ tool, nomOutil: nom, params: e.params ?? {}, libelle: typeof e.libelle === "string" ? e.libelle : nom });
  }
  return { ok: true, but: typeof brut.but === "string" ? brut.but : "Mission", etapes: validees };
}

const STATUT_LISIBLE = { JUSTIFIEE: "justifiée", NON_JUSTIFIEE: "non justifiée" };

/**
 * Agrégation déterministe des lignes rendues par le backend.
 *
 * Chaque nombre de la synthèse vient d'ici, et d'ici seulement. La fonction est
 * pure : on peut la relire, la tester, et refaire le calcul à la main.
 */
export function agreger(lignes) {
  if (!Array.isArray(lignes)) return { total: 0, parClasse: [], parStatut: {}, heures: 0 };

  const parClasse = new Map();
  const parStatut = {};
  let heures = 0;

  for (const l of lignes) {
    const classe = l.classe ?? "classe inconnue";
    parClasse.set(classe, (parClasse.get(classe) ?? 0) + 1);
    const statut = l.statut ?? null;
    if (statut) parStatut[statut] = (parStatut[statut] ?? 0) + 1;
    const h = Number(l.nbHeures);
    if (Number.isFinite(h)) heures += h;
  }

  return {
    total: lignes.length,
    // Tri décroissant, puis alphabétique : deux classes à égalité doivent
    // sortir dans un ordre stable, sinon deux bilans du même jour diffèrent.
    parClasse: [...parClasse.entries()]
      .map(([classe, n]) => ({ classe, n }))
      .sort((a, b) => b.n - a.n || a.classe.localeCompare(b.classe)),
    parStatut,
    heures: Number(heures.toFixed(2)),
  };
}

/** Rendu d'un bilan, à partir des seuls agrégats. */
export function rendreBilan({ but, resultats }) {
  const lignes = [`${but} :`];

  for (const r of resultats) {
    if (r.statut !== ETAPE.REUSSIE) {
      // Une étape manquée se dit. Un bilan muet sur ce qu'il n'a pas pu lire
      // laisse croire que le reste est complet.
      lignes.push(`• ${r.libelle} : non disponible (${r.detail ?? r.statut})`);
      continue;
    }
    const a = r.agregat;
    const detail = [`${a.total} resultat${a.total > 1 ? "s" : ""}`];
    if (a.heures > 0) detail.push(`${a.heures} h`);
    for (const [s, n] of Object.entries(a.parStatut)) detail.push(`${n} ${STATUT_LISIBLE[s] ?? s}`);
    lignes.push(`• ${r.libelle} : ${detail.join(", ")}`);

    const tete = a.parClasse.slice(0, 3);
    if (tete.length > 1) {
      lignes.push(`  classes les plus concernees : ${tete.map((c) => `${c.classe} (${c.n})`).join(", ")}`);
    }
  }

  const manquees = resultats.filter((r) => r.statut !== ETAPE.REUSSIE).length;
  lignes.push(
    manquees === 0
      ? `${resultats.length} consultation${resultats.length > 1 ? "s" : ""}, chiffres issus de la base.`
      : `${resultats.length - manquees}/${resultats.length} consultations abouties — bilan partiel.`,
  );
  return lignes.join("\n");
}

/**
 * Faut-il réessayer cet échec ?
 *
 * Une panne passagère mérite une seconde tentative ; un refus de permission
 * n'en mérite aucune — réessayer serait au mieux inutile, au pire une
 * insistance contre une décision de sécurité.
 */
export function estTransitoire(message) {
  const m = String(message ?? "").toLowerCase();
  if (/droit|permission|interdit|non autoris|insuffisant/.test(m)) return false;
  return /r[ée]seau|timeout|d[ée]lai|econn|socket|fetch|502|503|504|temporair/.test(m);
}
