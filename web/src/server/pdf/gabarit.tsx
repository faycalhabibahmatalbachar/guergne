import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * Gabarit commun des documents officiels.
 *
 * Tous les documents de l'établissement partagent le même en-tête, le même
 * pied et les mêmes règles typographiques : c'est ce qui les rend
 * reconnaissables et crédibles auprès d'une administration.
 *
 * On n'enregistre PAS de police externe. `Helvetica` est intégrée au format
 * PDF : elle s'affiche partout, sans téléchargement, et le document reste
 * léger — décisif quand un parent l'ouvre sur une connexion 2G.
 */

export const styles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1e293b",
  },

  // --- En-tête officiel ---
  entete: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1.5,
    borderBottomColor: "#1e429f",
    paddingBottom: 10,
    marginBottom: 18,
  },
  enteteBloc: { width: "48%" },
  enteteCentre: { alignItems: "center", justifyContent: "center" },
  ministere: { fontSize: 8, textAlign: "center", lineHeight: 1.4 },
  devise: { fontSize: 7, fontStyle: "italic", textAlign: "center", marginTop: 2 },
  etablissement: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#1e429f" },
  coordonnees: { fontSize: 7.5, color: "#64748b", marginTop: 2, lineHeight: 1.4 },

  // --- Titre ---
  titre: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginTop: 8,
    marginBottom: 4,
  },
  sousTitre: { fontSize: 9, textAlign: "center", color: "#64748b", marginBottom: 20 },

  // --- Corps ---
  paragraphe: { marginBottom: 10, lineHeight: 1.6, textAlign: "justify" },
  gras: { fontFamily: "Helvetica-Bold" },

  section: { marginBottom: 14 },
  sectionTitre: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#1e429f",
    borderBottomWidth: 0.5,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 3,
    marginBottom: 7,
  },

  ligne: { flexDirection: "row", marginBottom: 4 },
  libelle: { width: "38%", color: "#64748b" },
  valeur: { width: "62%", fontFamily: "Helvetica-Bold" },

  // --- Tableaux ---
  tableEntete: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 0.5,
    borderBottomColor: "#94a3b8",
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
  },
  tableLigne: {
    flexDirection: "row",
    borderBottomWidth: 0.4,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontSize: 9,
  },
  tableLignePaire: { backgroundColor: "#fafafa" },

  // --- Signatures ---
  signatures: { flexDirection: "row", justifyContent: "space-between", marginTop: 34 },
  signature: { width: "45%", alignItems: "center" },
  signatureLibelle: { fontSize: 8.5, color: "#64748b", marginBottom: 34 },
  signatureTrait: { borderTopWidth: 0.5, borderTopColor: "#94a3b8", width: "100%", paddingTop: 3 },

  // --- Pied ---
  pied: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: "#cbd5e1",
    paddingTop: 6,
    fontSize: 7,
    color: "#94a3b8",
  },
});

export interface Etablissement {
  nom: string;
  sigle: string;
  adresse: string | null;
  ville: string | null;
  pays: string | null;
  telephone: string | null;
  email: string | null;
  ministereTutelle: string | null;
  autorisationNumero: string | null;
  nomProviseur: string | null;
  nomCenseur: string | null;
}

export function EnTete({ etablissement }: { etablissement: Etablissement }) {
  return (
    <View style={styles.entete} fixed>
      <View style={styles.enteteBloc}>
        <Text style={styles.ministere}>
          RÉPUBLIQUE DU {(etablissement.pays ?? "TCHAD").toUpperCase()}
        </Text>
        <Text style={styles.devise}>Unité — Travail — Progrès</Text>
        <Text style={[styles.ministere, { marginTop: 4 }]}>
          {etablissement.ministereTutelle ?? "Ministère de l'Éducation Nationale"}
        </Text>
      </View>

      <View style={[styles.enteteBloc, { alignItems: "flex-end" }]}>
        <Text style={styles.etablissement}>{etablissement.nom}</Text>
        <Text style={styles.coordonnees}>
          {[etablissement.adresse, etablissement.ville].filter(Boolean).join(", ")}
        </Text>
        <Text style={styles.coordonnees}>
          {[etablissement.telephone, etablissement.email].filter(Boolean).join(" · ")}
        </Text>
        {etablissement.autorisationNumero ? (
          <Text style={styles.coordonnees}>Autorisation n° {etablissement.autorisationNumero}</Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Pied de page avec numéro de document et code de vérification.
 *
 * Le code permet de distinguer un document authentique d'une photocopie
 * retouchée : il est enregistré dans `documents_emis` au moment de l'édition.
 * Sans lui, rien n'empêche de modifier un certificat sous un traitement de
 * texte — pratique courante et difficile à détecter à l'œil.
 */
export function Pied({
  numero,
  codeVerification,
  ville,
}: {
  numero: string;
  codeVerification?: string | null;
  ville: string | null;
}) {
  const date = new Date().toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <View style={styles.pied} fixed>
      <Text>
        {numero}
        {codeVerification ? ` · Vérification : ${codeVerification}` : ""}
      </Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          `${ville ?? "N'Djamena"}, le ${date} — page ${pageNumber}/${totalPages}`
        }
      />
    </View>
  );
}

export function Signature({ role, nom }: { role: string; nom?: string | null }) {
  return (
    <View style={styles.signature}>
      <Text style={styles.signatureLibelle}>{role}</Text>
      <View style={styles.signatureTrait}>
        <Text style={{ fontSize: 8.5, textAlign: "center" }}>{nom ?? ""}</Text>
      </View>
    </View>
  );
}

/** Enveloppe complète : en-tête, titre, corps, pied. */
export function DocumentOfficiel({
  etablissement,
  titre,
  sousTitre,
  numero,
  codeVerification,
  orientation = "portrait",
  children,
}: {
  etablissement: Etablissement;
  titre: string;
  sousTitre?: string;
  numero: string;
  codeVerification?: string | null;
  orientation?: "portrait" | "landscape";
  children: React.ReactNode;
}) {
  return (
    <Document
      title={`${titre} — ${etablissement.nom}`}
      author={etablissement.nom}
      creator="Système de gestion scolaire"
    >
      <Page size="A4" orientation={orientation} style={styles.page}>
        <EnTete etablissement={etablissement} />
        <Text style={styles.titre}>{titre}</Text>
        {sousTitre ? <Text style={styles.sousTitre}>{sousTitre}</Text> : null}
        {children}
        <Pied numero={numero} codeVerification={codeVerification} ville={etablissement.ville} />
      </Page>
    </Document>
  );
}

export function Champ({ libelle, valeur }: { libelle: string; valeur: string | null | undefined }) {
  return (
    <View style={styles.ligne}>
      <Text style={styles.libelle}>{libelle}</Text>
      <Text style={styles.valeur}>{valeur || "—"}</Text>
    </View>
  );
}

export const dateFr = (v: string | Date | null | undefined): string =>
  v
    ? new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
    : "—";

export const fcfa = (montant: number | string | null | undefined): string =>
  `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(montant ?? 0))} F CFA`;
