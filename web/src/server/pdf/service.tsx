import "server-only";

import { randomBytes } from "node:crypto";

import { renderToBuffer } from "@react-pdf/renderer";
import { and, desc, eq, sql } from "drizzle-orm";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import {
  classes,
  documentsEmis,
  eleveTuteur,
  eleves,
  etablissement,
  inscriptions,
  niveaux,
  paiements,
  series,
  tuteurs,
} from "@/server/db/schema";
import type { Principal } from "@/server/guard";

import {
  CertificatScolarite,
  CertificatTransfert,
  type DonneesEleve,
  type DonneesScolarite,
  type DonneesTuteur,
  FicheInscription,
  RecuPaiement,
} from "./documents";
import { deciderEmission, type DonneesFigeesEleve } from "./emission";
import type { Etablissement } from "./gabarit";

/**
 * Production des documents officiels.
 *
 * Chaque édition est enregistrée dans `documents_emis` avec son numéro, son
 * code de vérification et une COPIE FIGÉE des données. Rééditer un certificat
 * trois ans plus tard doit produire exactement le même document, même si
 * l'élève a changé de classe ou de nom entre-temps — sans quoi le premier
 * exemplaire remis à la famille et celui conservé par l'école divergeraient.
 *
 * Cette promesse n'était pas tenue : la copie figée était écrite et jamais
 * relue, et chaque appel tirait un numéro neuf de la séquence. Rouvrir un
 * aperçu suffisait donc à créer un second document officiel. Désormais on
 * RELIT le registre avant d'émettre (voir `./emission`) : si l'élève détient
 * déjà ce document pour cette année, on rend l'exemplaire d'origine, reconstruit
 * depuis `donnees_figees`, avec son numéro et son code. La séquence n'est
 * touchée que pour une émission réellement nouvelle.
 */

export type TypeDocument =
  | "CERTIFICAT_SCOLARITE"
  | "CERTIFICAT_TRANSFERT"
  | "FICHE_INSCRIPTION"
  | "RECU_PAIEMENT";

/** Préfixe de numérotation par type, tel qu'attendu par l'administration. */
const SEQUENCES: Record<TypeDocument, string> = {
  CERTIFICAT_SCOLARITE: "CERTIFICAT_SCOLARITE",
  CERTIFICAT_TRANSFERT: "CERTIFICAT_TRANSFERT",
  FICHE_INSCRIPTION: "CERTIFICAT_SCOLARITE",
  RECU_PAIEMENT: "RECU",
};

/** Intitulé porté par la ligne de registre, et par le nom du fichier produit. */
const LIBELLES: Record<Exclude<TypeDocument, "RECU_PAIEMENT">, string> = {
  CERTIFICAT_SCOLARITE: "Certificat de scolarité",
  CERTIFICAT_TRANSFERT: "Certificat de transfert",
  FICHE_INSCRIPTION: "Fiche d'inscription",
};

/**
 * Refus d'émission : il existe un numéro, mais rien de servable ni de justifié.
 *
 * Une classe d'erreur plutôt qu'un `null` : la route doit répondre 409 avec le
 * motif, là où `null` signifie « dossier introuvable » (404).
 */
export class EmissionRefusee extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmissionRefusee";
  }
}

/** Réémission explicite, telle que la route la reçoit de la requête. */
export interface Reemission {
  demandee: boolean;
  raison?: string | null;
}

async function chargerEtablissement(): Promise<Etablissement> {
  const [e] = await db.select().from(etablissement).limit(1);
  return {
    nom: e?.nom ?? "Lycée Guergné La Renaissance",
    sigle: e?.sigle ?? "LGR",
    adresse: e?.adresse ?? null,
    ville: e?.ville ?? "N'Djamena",
    pays: e?.pays ?? "Tchad",
    telephone: e?.telephone ?? null,
    email: e?.email ?? null,
    ministereTutelle: e?.ministereTutelle ?? null,
    autorisationNumero: e?.autorisationNumero ?? null,
    nomProviseur: e?.nomProviseur ?? null,
    nomCenseur: e?.nomCenseur ?? null,
  };
}

interface Dossier {
  eleve: DonneesEleve;
  scolarite: DonneesScolarite;
  tuteurs: DonneesTuteur[];
  inscriptionId: string;
  classeId: string;
  anneeId: string;
  dateSortie: string | null;
  motifSortie: string | null;
  etablissementDestination: string | null;
}

async function chargerDossier(eleveId: string): Promise<Dossier | null> {
  const [ligne] = await db
    .select({
      matricule: eleves.matricule,
      nom: eleves.nom,
      prenom: eleves.prenom,
      sexe: eleves.sexe,
      dateNaissance: eleves.dateNaissance,
      lieuNaissance: eleves.lieuNaissance,
      nationalite: eleves.nationalite,
      adresse: eleves.adresse,
      quartier: eleves.quartier,
      telephone: eleves.telephone,
      acteNaissanceNumero: eleves.acteNaissanceNumero,
      ecoleOrigine: eleves.ecoleOrigine,
      groupeSanguin: eleves.groupeSanguin,
      allergies: eleves.allergies,

      inscriptionId: inscriptions.id,
      // Classe et année de l'inscription : disponibles depuis toujours, mais
      // jamais reportées dans `documents_emis`, dont les colonnes `classe_id`
      // et `annee_id` sont restées vides sur toutes les lignes de production.
      classeId: inscriptions.classeId,
      anneeId: inscriptions.anneeId,
      anneeLibelle: sql<string>`(SELECT libelle FROM annees_scolaires a WHERE a.id = inscriptions.annee_id)`,
      classeLibelle: classes.libelle,
      niveauLibelle: niveaux.libelle,
      serieCode: series.code,
      numeroInscription: inscriptions.numeroInscription,
      dateInscription: inscriptions.dateInscription,
      estRedoublant: inscriptions.estRedoublant,
      dateSortie: inscriptions.dateSortie,
      motifSortie: inscriptions.motifSortie,
      etablissementDestination: inscriptions.etablissementDestination,
    })
    .from(eleves)
    .innerJoin(inscriptions, eq(inscriptions.eleveId, eleves.id))
    .innerJoin(classes, eq(classes.id, inscriptions.classeId))
    .innerJoin(niveaux, eq(niveaux.id, classes.niveauId))
    .leftJoin(series, eq(series.id, classes.serieId))
    .where(eq(eleves.id, eleveId))
    .orderBy(desc(inscriptions.dateInscription))
    .limit(1);

  if (!ligne) return null;

  // Les tuteurs sont chargés dans tous les cas : ils ne servent qu'à la fiche
  // d'inscription à l'impression, mais ils entrent dans la copie figée de tout
  // document, pour qu'un rejeu n'ait plus rien à aller rechercher en base.
  const tuteursEleve = await chargerTuteurs(eleveId);

  return {
    tuteurs: tuteursEleve,
    eleve: {
      matricule: ligne.matricule,
      nom: ligne.nom,
      prenom: ligne.prenom,
      sexe: ligne.sexe as "M" | "F",
      dateNaissance: ligne.dateNaissance,
      lieuNaissance: ligne.lieuNaissance,
      nationalite: ligne.nationalite,
      adresse: ligne.adresse,
      quartier: ligne.quartier,
      telephone: ligne.telephone,
      acteNaissanceNumero: ligne.acteNaissanceNumero,
      ecoleOrigine: ligne.ecoleOrigine,
      groupeSanguin: ligne.groupeSanguin,
      allergies: ligne.allergies,
    },
    scolarite: {
      anneeLibelle: ligne.anneeLibelle,
      classeLibelle: ligne.classeLibelle,
      niveauLibelle: ligne.niveauLibelle,
      serieCode: ligne.serieCode,
      numeroInscription: ligne.numeroInscription,
      dateInscription: ligne.dateInscription,
      estRedoublant: ligne.estRedoublant,
    },
    inscriptionId: ligne.inscriptionId,
    classeId: ligne.classeId,
    anneeId: ligne.anneeId,
    dateSortie: ligne.dateSortie,
    motifSortie: ligne.motifSortie,
    etablissementDestination: ligne.etablissementDestination,
  };
}

async function chargerTuteurs(eleveId: string): Promise<DonneesTuteur[]> {
  return db
    .select({
      nom: tuteurs.nom,
      prenom: tuteurs.prenom,
      lien: eleveTuteur.lien,
      telephone: tuteurs.telephone,
      profession: tuteurs.profession,
      estPrincipal: eleveTuteur.estPrincipal,
    })
    .from(eleveTuteur)
    .innerJoin(tuteurs, eq(tuteurs.id, eleveTuteur.tuteurId))
    .where(eq(eleveTuteur.eleveId, eleveId))
    .orderBy(desc(eleveTuteur.estPrincipal));
}

/**
 * Attribue un numéro et un code de vérification, et enregistre l'émission.
 *
 * Le code est court et lisible à voix haute : il figure au pied du document et
 * permettra à un tiers de vérifier son authenticité. Un UUID complet serait
 * illisible et personne ne le saisirait.
 */
async function enregistrerEmission(
  type: TypeDocument,
  numero: string,
  acteur: Principal,
  contexte: {
    eleveId?: string;
    classeId?: string;
    anneeId?: string;
    libelle: string;
    donnees: unknown;
  },
): Promise<string> {
  const code = randomBytes(4).toString("hex").toUpperCase();

  await db.insert(documentsEmis).values({
    type: type === "FICHE_INSCRIPTION" ? "CERTIFICAT_SCOLARITE" : type,
    numero,
    eleveId: contexte.eleveId ?? null,
    classeId: contexte.classeId ?? null,
    anneeId: contexte.anneeId ?? null,
    libelle: contexte.libelle,
    donneesFigees: contexte.donnees as never,
    emisPar: acteur.id,
    codeVerification: code,
  });

  return code;
}

/**
 * Retrouve la dernière émission du même document pour le même élève.
 *
 * Le filtre porte sur le préfixe du libellé et pas seulement sur la colonne
 * `type` : le type stocké replie `FICHE_INSCRIPTION` sur `CERTIFICAT_SCOLARITE`
 * (ils partagent la séquence), si bien qu'en base une fiche d'inscription et un
 * certificat de scolarité sont indiscernables. Le libellé, lui, les distingue.
 * On ne compare que le préfixe car la suite porte le nom de l'élève, qui peut
 * avoir été corrigé depuis.
 */
async function chercherDocumentAnterieur(
  type: Exclude<TypeDocument, "RECU_PAIEMENT">,
  eleveId: string,
): Promise<{ numero: string; codeVerification: string | null; donneesFigees: unknown } | null> {
  const [ligne] = await db
    .select({
      numero: documentsEmis.numero,
      codeVerification: documentsEmis.codeVerification,
      donneesFigees: documentsEmis.donneesFigees,
    })
    .from(documentsEmis)
    .where(
      and(
        eq(documentsEmis.eleveId, eleveId),
        eq(documentsEmis.type, type === "FICHE_INSCRIPTION" ? "CERTIFICAT_SCOLARITE" : type),
        sql`${documentsEmis.libelle} LIKE ${`${LIBELLES[type]} —%`}`,
      ),
    )
    .orderBy(desc(documentsEmis.emisLe))
    .limit(1);

  return ligne ?? null;
}

async function prochainNumero(type: TypeDocument): Promise<string> {
  const annee = new Date().getFullYear();
  const r = await db.execute<{ n: string }>(
    sql`SELECT prochain_numero(${SEQUENCES[type]}, ${annee}::smallint) AS n`,
  );
  return r.rows[0].n;
}

export interface DocumentProduit {
  contenu: Buffer;
  nomFichier: string;
  numero: string;
}

/** Tout ce qu'il faut imprimer, qu'il vienne du dossier vivant ou du figé. */
interface ContenuDocument {
  eleve: DonneesEleve;
  scolarite: DonneesScolarite;
  tuteurs: DonneesTuteur[];
  motifSortie: string | null;
  etablissementDestination: string | null;
  dateSortie: string | null;
}

/**
 * Rend le PDF. Un seul chemin de rendu pour l'émission et pour le rejeu, sinon
 * les deux finiraient par produire des documents subtilement différents.
 */
function rendreDocumentEleve(
  type: Exclude<TypeDocument, "RECU_PAIEMENT">,
  etab: Etablissement,
  contenu: ContenuDocument,
  numero: string,
  code: string,
): Promise<Buffer> {
  return renderToBuffer(
    type === "CERTIFICAT_SCOLARITE" ? (
      <CertificatScolarite
        etablissement={etab}
        eleve={contenu.eleve}
        scolarite={contenu.scolarite}
        numero={numero}
        codeVerification={code}
      />
    ) : type === "CERTIFICAT_TRANSFERT" ? (
      <CertificatTransfert
        etablissement={etab}
        eleve={contenu.eleve}
        scolarite={contenu.scolarite}
        motif={contenu.motifSortie}
        etablissementDestination={contenu.etablissementDestination}
        dateSortie={contenu.dateSortie}
        numero={numero}
        codeVerification={code}
      />
    ) : (
      <FicheInscription
        etablissement={etab}
        eleve={contenu.eleve}
        scolarite={contenu.scolarite}
        tuteurs={contenu.tuteurs}
        numero={numero}
        codeVerification={code}
      />
    ),
  );
}

/**
 * Reconstitue le contenu imprimable depuis la copie figée.
 *
 * Les lignes émises avant la présente correction ne figeaient que `eleve` et
 * `scolarite` : pour un certificat de transfert ou une fiche d'inscription, le
 * motif de sortie et les tuteurs manquent. Plutôt que de refuser de rejouer ces
 * documents, on complète avec le dossier vivant et on l'assume : le numéro et
 * l'identité, qui font foi, viennent bien du figé.
 */
function contenuDepuisFigees(figees: DonneesFigeesEleve, dossier: Dossier): ContenuDocument {
  const sortie = (figees.sortie ?? {}) as Record<string, unknown>;
  return {
    // La copie figée n'est pas typée en base : on lui fait confiance après le
    // contrôle de forme opéré par `lireDonneesFigees`.
    eleve: figees.eleve as unknown as DonneesEleve,
    scolarite: figees.scolarite as unknown as DonneesScolarite,
    tuteurs: Array.isArray(figees.tuteurs) ? (figees.tuteurs as DonneesTuteur[]) : dossier.tuteurs,
    motifSortie: typeof sortie.motif === "string" ? sortie.motif : dossier.motifSortie,
    etablissementDestination:
      typeof sortie.etablissementDestination === "string"
        ? sortie.etablissementDestination
        : dossier.etablissementDestination,
    dateSortie: typeof sortie.dateSortie === "string" ? sortie.dateSortie : dossier.dateSortie,
  };
}

export async function produireDocumentEleve(
  type: Exclude<TypeDocument, "RECU_PAIEMENT">,
  eleveId: string,
  acteur: Principal,
  reemission?: Reemission,
): Promise<DocumentProduit | null> {
  const dossier = await chargerDossier(eleveId);
  if (!dossier) return null;

  const anterieur = await chercherDocumentAnterieur(type, eleveId);
  const decision = deciderEmission({
    dejaEmis: anterieur
      ? { numero: anterieur.numero, codeVerification: anterieur.codeVerification }
      : null,
    donneesFigees: anterieur?.donneesFigees,
    anneeAttendue: dossier.scolarite.anneeLibelle,
    reemissionDemandee: reemission?.demandee,
    raison: reemission?.raison,
  });

  if (decision.action === "refuser") throw new EmissionRefusee(decision.raison);

  const etab = await chargerEtablissement();
  const nomFichier = (nom: string, prenom: string) =>
    `${LIBELLES[type].replace(/\s/g, "_")}_${`${nom}_${prenom}`.replace(/[^\w-]/g, "_")}.pdf`;

  if (decision.action === "rejouer") {
    const contenu = contenuDepuisFigees(decision.donneesFigees, dossier);
    return {
      // Aucun appel à `prochain_numero` ici : c'est tout l'objet du rejeu.
      contenu: await rendreDocumentEleve(
        type,
        etab,
        contenu,
        decision.numero,
        // Les lignes les plus anciennes peuvent n'avoir aucun code : on ne lui
        // en invente pas un, qui ne vérifierait rien.
        decision.codeVerification ?? "—",
      ),
      nomFichier: nomFichier(contenu.eleve.nom, contenu.eleve.prenom),
      numero: decision.numero,
    };
  }

  const contenu: ContenuDocument = {
    eleve: dossier.eleve,
    scolarite: dossier.scolarite,
    tuteurs: dossier.tuteurs,
    motifSortie: dossier.motifSortie,
    etablissementDestination: dossier.etablissementDestination,
    dateSortie: dossier.dateSortie,
  };

  const numero = await prochainNumero(type);
  const code = await enregistrerEmission(type, numero, acteur, {
    eleveId,
    classeId: dossier.classeId,
    anneeId: dossier.anneeId,
    libelle: `${LIBELLES[type]} — ${dossier.eleve.prenom} ${dossier.eleve.nom}`,
    // On fige désormais TOUT ce que le document imprime, tuteurs et sortie
    // compris : sans eux, un rejeu irait rechercher en base des valeurs qui
    // auront peut-être changé, et le document ne serait plus le même.
    donnees: {
      eleve: dossier.eleve,
      scolarite: dossier.scolarite,
      tuteurs: dossier.tuteurs,
      sortie: {
        motif: dossier.motifSortie,
        etablissementDestination: dossier.etablissementDestination,
        dateSortie: dossier.dateSortie,
      },
    },
  });

  if (decision.raison) {
    // Une réémission efface de fait l'exemplaire précédent aux yeux de la
    // famille : elle doit rester traçable, acteur et motif compris.
    await journaliser(acteur, {
      action: "DOCUMENT_REEMIS",
      entite: "documents_emis",
      eleveId,
      avant: anterieur ? { numero: anterieur.numero } : null,
      apres: { numero, type },
      motif: decision.raison,
    });
  }

  return {
    contenu: await rendreDocumentEleve(type, etab, contenu, numero, code),
    nomFichier: nomFichier(dossier.eleve.nom, dossier.eleve.prenom),
    numero,
  };
}

export async function produireRecu(
  paiementId: string,
  acteur: Principal,
): Promise<DocumentProduit | null> {
  const [p] = await db
    .select({
      numeroRecu: paiements.numeroRecu,
      montantFcfa: paiements.montantFcfa,
      mode: paiements.mode,
      referenceExterne: paiements.referenceExterne,
      datePaiement: paiements.datePaiement,
      nomPayeur: paiements.nomPayeur,
      inscriptionId: paiements.inscriptionId,
      eleveId: inscriptions.eleveId,
      libelleEcheance: sql<string | null>`(
        SELECT libelle FROM echeances e WHERE e.id = paiements.echeance_id)`,
    })
    .from(paiements)
    .innerJoin(inscriptions, eq(inscriptions.id, paiements.inscriptionId))
    .where(eq(paiements.id, paiementId))
    .limit(1);

  if (!p) return null;

  const dossier = await chargerDossier(p.eleveId);
  if (!dossier) return null;

  const situation = await db.execute<{ du: number; paye: number; reste: number }>(sql`
    SELECT COALESCE(SUM(montant_du_fcfa),0)::int AS du,
           COALESCE(SUM(montant_paye_fcfa),0)::int AS paye,
           COALESCE(SUM(montant_du_fcfa - montant_paye_fcfa - montant_exonere_fcfa),0)::int AS reste
      FROM echeances WHERE inscription_id = ${p.inscriptionId}::uuid
  `);
  const s = situation.rows[0] ?? { du: 0, paye: 0, reste: 0 };

  const etab = await chargerEtablissement();

  // Le reçu conserve SON numéro d'origine : il en a déjà un, attribué à
  // l'encaissement. En rééditer un nouveau créerait deux reçus pour un seul
  // versement, ce qui fausserait tout rapprochement de caisse.
  const numeroDuplicata = `${p.numeroRecu}-D`;

  // Le reçu ne passe pas par `deciderEmission` : son numéro ne vient pas de la
  // séquence annuelle, le réimprimer ne consomme donc rien. Le seul risque
  // était l'INSERT répété, que la contrainte d'unicité sur `numero` faisait
  // échouer dès la deuxième impression. On relit donc la ligne et on réutilise
  // son code de vérification, pour que le duplicata reste vérifiable.
  const [emisAnterieurement] = await db
    .select({ codeVerification: documentsEmis.codeVerification })
    .from(documentsEmis)
    .where(eq(documentsEmis.numero, numeroDuplicata))
    .limit(1);

  const code = emisAnterieurement
    ? // Une ligne existe déjà : on n'en crée pas une seconde pour un seul
      // versement. Un duplicata sans code reste imprimable, simplement non
      // vérifiable — on ne lui fabrique pas un code qui ne prouverait rien.
      (emisAnterieurement.codeVerification ?? "—")
    : await enregistrerEmission("RECU_PAIEMENT", numeroDuplicata, acteur, {
        eleveId: p.eleveId,
        classeId: dossier.classeId,
        anneeId: dossier.anneeId,
        libelle: `Reçu ${p.numeroRecu} — ${dossier.eleve.prenom} ${dossier.eleve.nom}`,
        donnees: { eleve: dossier.eleve, scolarite: dossier.scolarite, paiement: p, situation: s },
      });

  const contenu = await renderToBuffer(
    <RecuPaiement
      etablissement={etab}
      eleve={dossier.eleve}
      scolarite={dossier.scolarite}
      paiement={{
        numeroRecu: p.numeroRecu,
        montantFcfa: Number(p.montantFcfa),
        mode: p.mode,
        referenceExterne: p.referenceExterne,
        datePaiement: p.datePaiement,
        nomPayeur: p.nomPayeur,
        libelleEcheance: p.libelleEcheance,
      }}
      situation={{
        totalDu: Number(s.du),
        totalPaye: Number(s.paye),
        resteDu: Number(s.reste),
      }}
      codeVerification={code}
    />,
  );

  return { contenu, nomFichier: `Recu_${p.numeroRecu}.pdf`, numero: p.numeroRecu };
}
