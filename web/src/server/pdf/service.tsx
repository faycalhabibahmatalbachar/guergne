import "server-only";

import { randomBytes } from "node:crypto";

import { renderToBuffer } from "@react-pdf/renderer";
import { and, desc, eq, sql } from "drizzle-orm";

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
import type { Etablissement } from "./gabarit";

/**
 * Production des documents officiels.
 *
 * Chaque édition est enregistrée dans `documents_emis` avec son numéro, son
 * code de vérification et une COPIE FIGÉE des données. Rééditer un certificat
 * trois ans plus tard doit produire exactement le même document, même si
 * l'élève a changé de classe ou de nom entre-temps — sans quoi le premier
 * exemplaire remis à la famille et celui conservé par l'école divergeraient.
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
  inscriptionId: string;
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

  return {
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
  contexte: { eleveId?: string; anneeId?: string; libelle: string; donnees: unknown },
): Promise<string> {
  const code = randomBytes(4).toString("hex").toUpperCase();

  await db.insert(documentsEmis).values({
    type: type === "FICHE_INSCRIPTION" ? "CERTIFICAT_SCOLARITE" : type,
    numero,
    eleveId: contexte.eleveId ?? null,
    anneeId: contexte.anneeId ?? null,
    libelle: contexte.libelle,
    donneesFigees: contexte.donnees as never,
    emisPar: acteur.id,
    codeVerification: code,
  });

  return code;
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

export async function produireDocumentEleve(
  type: Exclude<TypeDocument, "RECU_PAIEMENT">,
  eleveId: string,
  acteur: Principal,
): Promise<DocumentProduit | null> {
  const dossier = await chargerDossier(eleveId);
  if (!dossier) return null;

  const [etab, numero] = await Promise.all([chargerEtablissement(), prochainNumero(type)]);

  const libelles: Record<string, string> = {
    CERTIFICAT_SCOLARITE: "Certificat de scolarité",
    CERTIFICAT_TRANSFERT: "Certificat de transfert",
    FICHE_INSCRIPTION: "Fiche d'inscription",
  };

  const code = await enregistrerEmission(type, numero, acteur, {
    eleveId,
    libelle: `${libelles[type]} — ${dossier.eleve.prenom} ${dossier.eleve.nom}`,
    donnees: { eleve: dossier.eleve, scolarite: dossier.scolarite },
  });

  const contenu = await renderToBuffer(
    type === "CERTIFICAT_SCOLARITE" ? (
      <CertificatScolarite
        etablissement={etab}
        eleve={dossier.eleve}
        scolarite={dossier.scolarite}
        numero={numero}
        codeVerification={code}
      />
    ) : type === "CERTIFICAT_TRANSFERT" ? (
      <CertificatTransfert
        etablissement={etab}
        eleve={dossier.eleve}
        scolarite={dossier.scolarite}
        motif={dossier.motifSortie}
        etablissementDestination={dossier.etablissementDestination}
        dateSortie={dossier.dateSortie}
        numero={numero}
        codeVerification={code}
      />
    ) : (
      <FicheInscription
        etablissement={etab}
        eleve={dossier.eleve}
        scolarite={dossier.scolarite}
        tuteurs={await chargerTuteurs(eleveId)}
        numero={numero}
        codeVerification={code}
      />
    ),
  );
  const nomSecurise = `${dossier.eleve.nom}_${dossier.eleve.prenom}`.replace(/[^\w-]/g, "_");

  return {
    contenu,
    nomFichier: `${libelles[type].replace(/\s/g, "_")}_${nomSecurise}.pdf`,
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
  const code = await enregistrerEmission("RECU_PAIEMENT", `${p.numeroRecu}-D`, acteur, {
    eleveId: p.eleveId,
    libelle: `Reçu ${p.numeroRecu} — ${dossier.eleve.prenom} ${dossier.eleve.nom}`,
    donnees: { paiement: p, situation: s },
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
