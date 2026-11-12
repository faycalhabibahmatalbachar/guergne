/**
 * Dire ce qui manque — avec des mots.
 *
 * « Précisez : Information requise. Information requise. Information requise. »
 * : c'est ce que répondait l'agent à une inscription incomplète. Trois fois la
 * même phrase, sans dire de quoi. On nomme désormais chaque information, dans
 * les mots de l'établissement, et jamais par le nom technique du paramètre.
 */
const LIBELLES = {
  nom: "le nom de famille",
  prenom: "le prénom",
  sexe: "le sexe (garçon ou fille)",
  dateNaissance: "la date de naissance",
  classe: "la classe",
  classeId: "la classe",
  periodeId: "la période (trimestre)",
  eleve: "l'élève (nom ou matricule)",
  eleveId: "l'élève (nom ou matricule)",
  inscriptionId: "l'élève (nom ou matricule)",
  eleves: "les élèves concernés",
  absents: "les élèves absents",
  tuteurNom: "le nom du responsable légal",
  tuteurPrenom: "le prénom du responsable légal",
  tuteurTelephone: "le téléphone du responsable légal",
  tuteurLien: "son lien avec l'élève (père, mère, tuteur…)",
  tuteur: "le responsable concerné",
  telephone: "le téléphone",
  lien: "le lien avec l'élève (père, mère, tuteur…)",
  motif: "le motif",
  dateAbsence: "la date de l'absence",
  dateRetard: "la date du retard",
  date: "la date",
  absenceIds: "l'absence concernée (élève et date)",
  absenceId: "l'absence concernée (élève et date)",
  statut: "le statut",
  etablissement: "l'établissement d'accueil",
  decision: "la référence de la décision (instance et date)",
  message: "le texte du message",
  titre: "le titre du message",
  libelle: "le nom de la classe",
  code: "le code de la classe",
  niveau: "le niveau (6ème, 5ème…)",
  capaciteMax: "le nombre de places",
  modifications: "ce qu'il faut modifier",
  enseignantId: "l'enseignant",
};

/** Messages qui apportent une précision au-delà de « requis ». */
const BANAL = /^(information requise|requis|requise|.{0,20} requis(e)?)\.?$/i;

export function direManques(outil, erreurs) {
  const entrees = Object.entries(erreurs ?? {});
  if (!entrees.length) return "Précisez votre demande.";
  const manques = [];
  const precisions = [];
  for (const [champ, message] of entrees) {
    const libelle = LIBELLES[champ] ?? null;
    const texte = String(message ?? "").trim();
    if (BANAL.test(texte)) {
      if (libelle && !manques.includes(libelle)) manques.push(libelle);
    } else if (texte) {
      precisions.push(texte);
    }
  }
  const lignes = [];
  if (manques.length === 1) lignes.push(`Il me manque ${manques[0]}.`);
  else if (manques.length > 1) lignes.push(`Il me manque :\n${manques.map((m) => `• ${m}`).join("\n")}`);
  if (precisions.length) lignes.push("Précisez : " + precisions.join(" "));
  return lignes.length ? lignes.join("\n") : "Précisez votre demande.";
}
