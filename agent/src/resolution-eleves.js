/**
 * Conversion des NOMS d'élèves en identifiants d'inscription.
 *
 * POURQUOI CETTE ÉTAPE EST OBLIGATOIRE AVANT TOUTE ÉCRITURE
 * ----------------------------------------------------------
 * Les écritures d'assiduité exigent des `inscriptionId`. L'utilisateur, lui,
 * dicte « Mahamat Adam ». Et quand il le dicte à la voix, la transcription
 * abîme le nom : `resolveur.js` documente le cas réel
 * « Mahamat Adam » → « Mahama Adam ».
 *
 * Contrairement aux classes et aux périodes, on ne peut PAS se contenter de
 * montrer la liste au modèle : 549 élèves ne tiennent pas dans une invite, et
 * surtout le choix ne doit pas être probabiliste. Une absence posée sur le
 * mauvais élève remonte au bulletin et déclenche une convocation. La
 * correspondance est donc faite ici, de façon déterministe, par
 * `resoudreEleve()` — et au moindre doute on DEMANDE au lieu de deviner.
 *
 * LE PÉRIMÈTRE DE RECHERCHE EST LA CLASSE
 * ----------------------------------------
 * On ne cherche jamais dans tout l'établissement. D'abord parce qu'un nom est
 * bien plus souvent unique dans une classe que parmi 549 élèves. Ensuite parce
 * que l'effectif est lu via l'API agent avec `x-acteur-id` : le garde de
 * guergné filtre selon le périmètre de l'acteur, et un professeur ne découvre
 * donc pas les élèves qui ne sont pas les siens.
 */
import { resoudreEleve } from "./resolveur.js";

/** « Mahamat, Zara et Issa » → ["Mahamat", "Zara", "Issa"] */
export function separerNoms(valeur) {
  if (Array.isArray(valeur)) return valeur.map((v) => String(v).trim()).filter(Boolean);
  return String(valeur ?? "")
    .split(/,| et |;|\n/i)
    .map((v) => v.trim())
    .filter(Boolean);
}

const libelle = (e) => `${e.prenom ?? ""} ${e.nom ?? ""}`.trim();

/**
 * Remplace les paramètres nommés d'un outil par les identifiants correspondants.
 *
 * @returns {Promise<{statut:"ok", params:object} | {statut:"clarifier", question:string}>}
 *   `clarifier` n'est pas un échec : c'est le comportement attendu dès qu'un nom
 *   ne désigne pas une personne unique.
 */
export async function resoudreNomsEleves({ outil, params, guergne, acteurId }) {
  const nommes = outil?.nommes;
  if (!nommes) return { statut: "ok", params };

  // Rien à convertir : l'appelant a peut-être déjà fourni les identifiants.
  const aConvertir = Object.keys(nommes).filter((champ) => params?.[champ] != null && params[champ] !== "");
  if (aConvertir.length === 0) return { statut: "ok", params };

  const classeId = params.classeId;
  if (!classeId) {
    return {
      statut: "clarifier",
      question: "De quelle classe s'agit-il ? J'ai besoin de la classe pour identifier l'eleve avec certitude.",
    };
  }

  const reponse = await guergne
    .listerElevesClasse({ classeId }, { actorId: acteurId })
    .catch((e) => ({ ok: false, message: e?.message }));

  if (!reponse?.ok || !Array.isArray(reponse.data)) {
    // On ne devine jamais un identifiant quand la liste de référence manque.
    return {
      statut: "clarifier",
      question: `Je n'ai pas pu lire l'effectif de la classe (${reponse?.message ?? "raison inconnue"}). Operation abandonnee.`,
    };
  }

  const effectif = reponse.data;
  if (effectif.length === 0) {
    return { statut: "clarifier", question: "Cette classe n'a aucun eleve inscrit actif." };
  }

  const resultat = { ...params };

  for (const champ of aConvertir) {
    const { vers, liste } = nommes[champ];
    const demandes = separerNoms(params[champ]);
    if (demandes.length === 0) {
      return { statut: "clarifier", question: `Quel eleve ? Le champ « ${champ} » est vide.` };
    }

    const ids = [];
    for (const demande of demandes) {
      const r = resoudreEleve(effectif, demande);

      if (r.statut === "unique") {
        ids.push(r.eleve.inscriptionId);
        continue;
      }

      if (r.statut === "ambigu") {
        const candidats = (r.candidats ?? []).map(libelle).join(", ");
        return {
          statut: "clarifier",
          question: `« ${demande} » peut designer plusieurs eleves : ${candidats}. Lequel exactement ?`,
        };
      }

      return {
        statut: "clarifier",
        question: `Je ne trouve aucun eleve nomme « ${demande} » dans cette classe. Pouvez-vous repeter le nom ?`,
      };
    }

    delete resultat[champ];
    resultat[vers] = liste ? ids : ids[0];
  }

  return { statut: "ok", params: resultat };
}
