import { sql } from "drizzle-orm";

import { db } from "@/server/db";
import { ErreurAutorisation, requirePermission } from "@/server/guard";
import {
  construireClasseur,
  enTetesClasseur,
  nomFichier,
  type Colonne,
} from "@/server/export/classeur";

/**
 * Export Excel des listes du portail.
 *
 * UNE ROUTE, PAS QUATRE
 * ----------------------
 * Élèves, parents, personnel, paiements : quatre listes, un seul chemin. Chaque
 * export déclare sa requête, ses colonnes et sa permission ; le reste — mise en
 * forme, figeage, filtre automatique, format des cellules — vient du module
 * commun. Écrits séparément, ces exports auraient divergé dès le deuxième.
 *
 * LES FILTRES SONT REPRIS DE L'ÉCRAN
 * -----------------------------------
 * On exporte ce qu'on voit. Un export qui rendrait toujours la liste complète
 * obligerait à refiltrer dans Excel, et l'utilisateur se demanderait lequel des
 * deux jeux de données est le bon.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

interface Definition {
  permission: string;
  feuille: string;
  titre: string;
  charger: (params: URLSearchParams) => Promise<Record<string, unknown>[]>;
  colonnes: Colonne<Record<string, unknown>>[];
}

const texte = (c: string) => (l: Record<string, unknown>) => (l[c] ?? null) as string | null;
const nombre = (c: string) => (l: Record<string, unknown>) =>
  l[c] === null || l[c] === undefined ? null : Number(l[c]);
/** Une colonne PostgreSQL booléenne remonte en `unknown` : on la nomme. */
const booleen = (c: string) => (l: Record<string, unknown>) => (l[c] ?? null) as boolean | null;

const DEFINITIONS: Record<string, Definition> = {
  // -------------------------------------------------------------------------
  eleves: {
    permission: "eleve:lire",
    feuille: "Élèves",
    titre: "Liste des élèves",
    charger: async (p) => {
      const classe = p.get("classe");
      const statut = p.get("statut");
      const recherche = p.get("recherche");

      const r = await db.execute<Record<string, unknown>>(sql`
        SELECT e.matricule, e.nom, e.prenom, e.sexe::text AS sexe,
               e.date_naissance::text AS date_naissance, e.lieu_naissance,
               e.nationalite, c.libelle AS classe, e.statut::text AS statut,
               i.est_redoublant, i.est_boursier,
               e.telephone, e.quartier, e.adresse,
               t.nom AS tuteur_nom, t.prenom AS tuteur_prenom, t.telephone AS tuteur_telephone
          FROM eleves e
          LEFT JOIN inscriptions i ON i.eleve_id = e.id AND i.active
          LEFT JOIN classes c      ON c.id = i.classe_id
          LEFT JOIN eleve_tuteur et ON et.eleve_id = e.id AND et.est_principal
          LEFT JOIN tuteurs t       ON t.id = et.tuteur_id
         WHERE (${classe}::uuid IS NULL OR i.classe_id = ${classe}::uuid)
           AND (${statut}::text IS NULL OR e.statut::text = ${statut})
           AND (${recherche}::text IS NULL
                OR e.nom ILIKE '%' || ${recherche} || '%'
                OR e.prenom ILIKE '%' || ${recherche} || '%'
                OR e.matricule ILIKE '%' || ${recherche} || '%')
         ORDER BY c.libelle NULLS LAST, e.nom, e.prenom
      `);
      return r.rows;
    },
    colonnes: [
      { entete: "Matricule", type: "texte", largeur: 16, valeur: texte("matricule") },
      { entete: "Nom", largeur: 20, valeur: texte("nom") },
      { entete: "Prénom", largeur: 20, valeur: texte("prenom") },
      { entete: "Sexe", type: "texte", largeur: 8, valeur: texte("sexe") },
      { entete: "Date de naissance", type: "date", largeur: 18, valeur: texte("date_naissance") },
      { entete: "Lieu de naissance", largeur: 20, valeur: texte("lieu_naissance") },
      { entete: "Nationalité", largeur: 16, valeur: texte("nationalite") },
      { entete: "Classe", largeur: 14, valeur: texte("classe") },
      { entete: "Statut", largeur: 16, valeur: texte("statut") },
      { entete: "Redoublant", type: "booleen", largeur: 12, valeur: booleen("est_redoublant") },
      { entete: "Boursier", type: "booleen", largeur: 12, valeur: booleen("est_boursier") },
      { entete: "Quartier", largeur: 18, valeur: texte("quartier") },
      { entete: "Adresse", largeur: 26, valeur: texte("adresse") },
      { entete: "Tuteur — nom", largeur: 20, valeur: texte("tuteur_nom") },
      { entete: "Tuteur — prénom", largeur: 20, valeur: texte("tuteur_prenom") },
      { entete: "Tuteur — téléphone", type: "texte", largeur: 20, valeur: texte("tuteur_telephone") },
    ],
  },

  // -------------------------------------------------------------------------
  parents: {
    permission: "tuteur:gerer",
    feuille: "Comptes parents",
    titre: "Comptes parents",
    charger: async () => {
      const r = await db.execute<Record<string, unknown>>(sql`
        SELECT t.nom, t.prenom, t.telephone, t.telephone_secondaire, t.email,
               t.profession, t.quartier, t.accepte_sms,
               fn_canal_tuteur(t.id)::text AS canal,
               (SELECT count(*) FROM eleve_tuteur et WHERE et.tuteur_id = t.id) AS nb_enfants,
               CASE WHEN t.utilisateur_id IS NULL THEN 'Sans compte'
                    WHEN u.actif IS FALSE          THEN 'Révoqué'
                    WHEN u.derniere_connexion IS NULL THEN 'Invité'
                    ELSE 'Actif' END AS etat,
               u.derniere_connexion::text AS derniere_connexion
          FROM tuteurs t
          LEFT JOIN utilisateurs u ON u.id = t.utilisateur_id
         ORDER BY t.nom, t.prenom
      `);
      return r.rows;
    },
    colonnes: [
      { entete: "Nom", largeur: 20, valeur: texte("nom") },
      { entete: "Prénom", largeur: 20, valeur: texte("prenom") },
      { entete: "Téléphone", type: "texte", largeur: 18, valeur: texte("telephone") },
      { entete: "Second numéro", type: "texte", largeur: 18, valeur: texte("telephone_secondaire") },
      { entete: "Adresse électronique", largeur: 28, valeur: texte("email") },
      { entete: "Profession", largeur: 20, valeur: texte("profession") },
      { entete: "Quartier", largeur: 18, valeur: texte("quartier") },
      { entete: "Enfants", type: "nombre", largeur: 10, valeur: nombre("nb_enfants") },
      { entete: "État du compte", largeur: 16, valeur: texte("etat") },
      { entete: "Canal joignable", largeur: 16, valeur: texte("canal") },
      { entete: "Accepte les SMS", type: "booleen", largeur: 16, valeur: booleen("accepte_sms") },
      { entete: "Dernière connexion", type: "date", largeur: 20, valeur: texte("derniere_connexion") },
    ],
  },

  // -------------------------------------------------------------------------
  personnel: {
    permission: "utilisateur:creer",
    feuille: "Personnel",
    titre: "Personnel enseignant",
    charger: async () => {
      const r = await db.execute<Record<string, unknown>>(sql`
        SELECT e.matricule, e.nom, e.prenom, e.sexe::text AS sexe,
               e.telephone, e.email, e.diplome, e.specialite,
               e.statut::text AS statut, e.date_embauche::text AS date_embauche,
               e.heures_contractuelles, e.numero_cnps, e.actif,
               (SELECT string_agg(m.libelle, ', ' ORDER BY m.libelle)
                  FROM enseignant_matieres em
                  JOIN matieres m ON m.id = em.matiere_id
                 WHERE em.enseignant_id = e.id) AS matieres
          FROM enseignants e
         ORDER BY e.nom, e.prenom
      `);
      return r.rows;
    },
    colonnes: [
      { entete: "Matricule", type: "texte", largeur: 16, valeur: texte("matricule") },
      { entete: "Nom", largeur: 20, valeur: texte("nom") },
      { entete: "Prénom", largeur: 20, valeur: texte("prenom") },
      { entete: "Sexe", type: "texte", largeur: 8, valeur: texte("sexe") },
      { entete: "Téléphone", type: "texte", largeur: 18, valeur: texte("telephone") },
      { entete: "Adresse électronique", largeur: 28, valeur: texte("email") },
      { entete: "Statut", largeur: 16, valeur: texte("statut") },
      { entete: "Matières", largeur: 32, valeur: texte("matieres") },
      { entete: "Diplôme", largeur: 24, valeur: texte("diplome") },
      { entete: "Spécialité", largeur: 20, valeur: texte("specialite") },
      { entete: "Heures / semaine", type: "decimal", largeur: 16, valeur: nombre("heures_contractuelles") },
      { entete: "Embauché le", type: "date", largeur: 16, valeur: texte("date_embauche") },
      { entete: "N° CNPS", type: "texte", largeur: 16, valeur: texte("numero_cnps") },
      { entete: "En activité", type: "booleen", largeur: 12, valeur: booleen("actif") },
    ],
  },

  // -------------------------------------------------------------------------
  paiements: {
    permission: "finance:exporter",
    feuille: "Encaissements",
    titre: "Journal des encaissements",
    charger: async (p) => {
      const du = p.get("du");
      const au = p.get("au");
      const r = await db.execute<Record<string, unknown>>(sql`
        SELECT p.numero_recu, p.date_paiement::text AS date_paiement,
               e.matricule, e.nom, e.prenom, c.libelle AS classe,
               p.montant_fcfa, p.mode::text AS mode, p.nom_payeur,
               p.reference_externe, p.annule, ec.libelle AS echeance
          FROM paiements p
          JOIN inscriptions i ON i.id = p.inscription_id
          JOIN eleves e       ON e.id = i.eleve_id
          LEFT JOIN classes c ON c.id = i.classe_id
          LEFT JOIN echeances ec ON ec.id = p.echeance_id
         WHERE (${du}::date IS NULL OR p.date_paiement >= ${du}::date)
           AND (${au}::date IS NULL OR p.date_paiement <= ${au}::date)
         ORDER BY p.date_paiement DESC, p.numero_recu DESC
      `);
      return r.rows;
    },
    colonnes: [
      { entete: "N° reçu", type: "texte", largeur: 16, valeur: texte("numero_recu") },
      { entete: "Date", type: "date", largeur: 14, valeur: texte("date_paiement") },
      { entete: "Matricule", type: "texte", largeur: 16, valeur: texte("matricule") },
      { entete: "Nom", largeur: 20, valeur: texte("nom") },
      { entete: "Prénom", largeur: 20, valeur: texte("prenom") },
      { entete: "Classe", largeur: 14, valeur: texte("classe") },
      { entete: "Échéance", largeur: 24, valeur: texte("echeance") },
      { entete: "Montant", type: "monnaie", largeur: 16, valeur: nombre("montant_fcfa") },
      { entete: "Mode", largeur: 16, valeur: texte("mode") },
      { entete: "Payeur", largeur: 24, valeur: texte("nom_payeur") },
      { entete: "Référence", type: "texte", largeur: 20, valeur: texte("reference_externe") },
      { entete: "Annulé", type: "booleen", largeur: 10, valeur: booleen("annule") },
    ],
  },
};

export async function GET(
  requete: Request,
  { params }: { params: Promise<{ liste: string }> },
) {
  const { liste } = await params;
  const def = DEFINITIONS[liste];
  if (!def) return new Response("Liste inconnue", { status: 404 });

  try {
    await requirePermission(def.permission as Parameters<typeof requirePermission>[0]);
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return Response.json({ erreur: "Non autorisé." }, { status: 403 });
    }
    throw erreur;
  }

  const url = new URL(requete.url);
  const lignes = await def.charger(url.searchParams);

  const filtresLisibles = [...url.searchParams.entries()]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k} : ${v}`);

  const classeur = await construireClasseur(lignes, def.colonnes, {
    feuille: def.feuille,
    titre: def.titre,
    contexte: [
      `Édité le ${new Date().toLocaleDateString("fr-FR")} — ${lignes.length} ligne(s)`,
      ...(filtresLisibles.length > 0 ? [`Filtres appliqués — ${filtresLisibles.join(" · ")}`] : []),
    ],
  });

  return new Response(classeur as unknown as BodyInit, {
    headers: enTetesClasseur(nomFichier(def.titre)),
  });
}
