/**
 * Résolution des entités scolaires à partir d'un texte approximatif.
 *
 * POURQUOI CE MODULE EST INDISPENSABLE
 * -------------------------------------
 * Les tests de transcription l'ont montré sur un vocal français pourtant net :
 * « Enregistre l'absence de Mahamat Adam en 3e A » devient
 * « Enregistre l'absence de **Mahama** Adam en troisième **à** ».
 * Le nom de l'élève ET la désignation de classe sont abîmés.
 *
 * L'agent ne doit donc JAMAIS écrire à partir du texte brut. Il résout le nom
 * contre la liste réelle de l'établissement, et quand le doute subsiste il
 * demande — il ne devine pas. Une absence posée sur le mauvais élève est une
 * erreur qui remonte au bulletin et déclenche une convocation.
 */

/** Minuscules, sans accents, ponctuation réduite, espaces normalisés. */
export function normaliser(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Distance de Levenshtein (itérative, deux lignes). */
export function distance(a, b) {
  a = normaliser(a);
  b = normaliser(b);
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prec = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cour = [i];
    for (let j = 1; j <= b.length; j++) {
      cour[j] = Math.min(
        prec[j] + 1,
        cour[j - 1] + 1,
        prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prec = cour;
  }
  return prec[b.length];
}

/** Score de proximité dans [0,1]. 1 = identique. */
export function proximite(a, b) {
  const n = Math.max(normaliser(a).length, normaliser(b).length);
  return n === 0 ? 1 : 1 - distance(a, b) / n;
}

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

/** Niveaux écrits en toutes lettres → forme courte, telle que le STT les rend. */
const NIVEAUX = [
  [/\bsixieme\b|\b6\s*eme\b|\b6e\b/, "6"],
  [/\bcinquieme\b|\b5\s*eme\b|\b5e\b/, "5"],
  [/\bquatrieme\b|\b4\s*eme\b|\b4e\b/, "4"],
  [/\btroisieme\b|\b3\s*eme\b|\b3e\b/, "3"],
  [/\bseconde\b|\b2\s*nde\b|\b2de\b/, "2"],
  [/\bpremiere\b|\b1\s*ere\b|\b1re\b/, "1"],
  [/\bterminale\b|\btle\b|\bterm\b/, "T"],
];

/**
 * Forme canonique d'une désignation de classe : « troisième à » → « 3 a »,
 * « 3ème A » → « 3 a », « 6E » → « 6 ».
 *
 * Le « à » accentué vient directement d'une erreur de transcription observée
 * sur la lettre « A » : on le ramène donc à « a ».
 */
export function canoniserClasse(libelle) {
  let s = normaliser(libelle);
  for (const [motif, code] of NIVEAUX) {
    if (motif.test(s)) {
      s = s.replace(motif, code);
      break;
    }
  }
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Résout une classe parmi celles de l'établissement.
 * @returns {{statut:"unique"|"ambigu"|"aucun", classe?:object, candidats?:object[]}}
 */
export function resoudreClasse(classes, demande) {
  const cible = canoniserClasse(demande);
  if (!cible) return { statut: "aucun", candidats: [] };

  const notes = classes
    .map((c) => ({ classe: c, score: proximite(cible, canoniserClasse(c.libelle ?? c.nom ?? "")) }))
    .sort((a, b) => b.score - a.score);

  const exacts = notes.filter((n) => n.score === 1);
  if (exacts.length === 1) return { statut: "unique", classe: exacts[0].classe };
  if (exacts.length > 1) return { statut: "ambigu", candidats: exacts.map((n) => n.classe) };

  const proches = notes.filter((n) => n.score >= 0.75);
  if (proches.length === 1) return { statut: "unique", classe: proches[0].classe };
  if (proches.length > 1) return { statut: "ambigu", candidats: proches.slice(0, 5).map((n) => n.classe) };
  return { statut: "aucun", candidats: [] };
}

// ---------------------------------------------------------------------------
// Élèves
// ---------------------------------------------------------------------------

const libelleEleve = (e) => `${e.prenom ?? ""} ${e.nom ?? ""}`.trim();

/**
 * Résout un élève parmi une liste (typiquement celle d'une classe).
 *
 * La comparaison se fait sur le nom complet ET sur chaque partie : une
 * transcription ne rend souvent qu'un prénom, ou un nom tronqué
 * (« Mahamat » → « Mahama »).
 *
 * `seuil` à 0.75 tolère une lettre perdue sur un nom court sans ouvrir la porte
 * aux confusions : en dessous, on préfère déclarer l'ambiguïté.
 *
 * @returns {{statut:"unique"|"ambigu"|"aucun", eleve?:object, candidats?:object[]}}
 */
export function resoudreEleve(eleves, demande, { seuil = 0.75 } = {}) {
  const cible = normaliser(demande);
  if (!cible) return { statut: "aucun", candidats: [] };

  const notes = eleves
    .map((e) => {
      const complet = proximite(cible, libelleEleve(e));
      const parties = Math.max(proximite(cible, e.nom ?? ""), proximite(cible, e.prenom ?? ""));
      // Un matricule cité explicitement lève toute ambiguïté.
      const matricule = e.matricule && normaliser(e.matricule) === cible ? 1 : 0;
      return { eleve: e, score: Math.max(complet, parties, matricule) };
    })
    .sort((a, b) => b.score - a.score);

  if (notes.length === 0) return { statut: "aucun", candidats: [] };

  const retenus = notes.filter((n) => n.score >= seuil);
  if (retenus.length === 0) return { statut: "aucun", candidats: [] };
  if (retenus.length === 1) return { statut: "unique", eleve: retenus[0].eleve };

  // Plusieurs candidats : on ne tranche que si le meilleur se détache nettement.
  const [a, b] = retenus;
  if (a.score === 1 && b.score < 1) return { statut: "unique", eleve: a.eleve };
  if (a.score - b.score >= 0.15) return { statut: "unique", eleve: a.eleve };
  return { statut: "ambigu", candidats: retenus.slice(0, 5).map((n) => n.eleve) };
}

/** Question de désambiguïsation, en menu numéroté (fallback sûr sur WhatsApp). */
export function questionAmbiguite(candidats, quoi = "élève") {
  const lignes = candidats.map((c, i) => {
    const nom = c.libelle ?? libelleEleve(c);
    const extra = c.matricule ? ` (${c.matricule})` : c.classe ? ` — ${c.classe}` : "";
    return `${i + 1}. ${nom}${extra}`;
  });
  return `Plusieurs correspondances pour cet ${quoi}. Répondez par le numéro :\n${lignes.join("\n")}`;
}
