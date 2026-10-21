import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * `@react-pdf/renderer` n'exporte pas son type `Style`. On le retrouve depuis
 * `StyleSheet.create`, qui le renvoie : plus sûr que de le redéclarer à la
 * main, où la moindre divergence passerait inaperçue.
 */
type Style = ReturnType<typeof StyleSheet.create>[string];

import type { Etablissement } from "./gabarit";

/**
 * Bulletin de notes trimestriel.
 *
 * REPRODUIT LE DOCUMENT RÉEL DE L'ÉTABLISSEMENT
 * ----------------------------------------------
 * Ce n'est pas un bulletin générique : c'est celui que le Lycée Guergné La
 * Renaissance imprime déjà, dont un exemplaire papier a servi de modèle. Les
 * écarts avec un bulletin « standard » sont donc voulus, et chacun a une
 * raison :
 *
 *   - **Deux colonnes de notes**, « Moyennes Devoirs » et « Notes
 *     Compositions », avant la moyenne générale. C'est la convention tchadienne
 *     du secondaire, et les familles lisent d'abord ces deux colonnes.
 *
 *   - **Trois blocs de matières** — littéraires, scientifiques,
 *     complémentaires — chacun suivi de SA moyenne. C'est sur ces moyennes que
 *     le conseil fonde une orientation en série A ou D ; les fondre en une
 *     seule moyenne générale rendrait le bulletin inutilisable pour cela.
 *
 *   - **Un historique des trois trimestres** en bas, avec moyenne ET rang. Un
 *     parent regarde d'abord si son enfant progresse ou décroche.
 *
 *   - **La mention « Toute surcharge ou rature annule la validité »**, qui fait
 *     du document une pièce officielle.
 *
 * MISE EN PAGE
 * ------------
 * Tout doit tenir sur UNE page. Un bulletin sur deux feuilles se sépare, et la
 * seconde se perd. D'où une police à 8 points dans le tableau et des marges
 * resserrées : ce n'est pas de l'avarice typographique, c'est la contrainte
 * qui commande.
 */

const s = StyleSheet.create({
  page: {
    paddingTop: 24,
    paddingBottom: 30,
    paddingHorizontal: 28,
    fontSize: 8,
    fontFamily: "Times-Roman",
    color: "#0f172a",
  },

  titre: {
    fontSize: 13,
    fontFamily: "Times-Bold",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 6,
    marginBottom: 16,
  },

  // --- Bandeau d'identité ---------------------------------------------------
  identite: {
    borderWidth: 0.7,
    borderColor: "#0f172a",
    marginBottom: 10,
  },
  identiteRangee: {
    flexDirection: "row",
    borderBottomWidth: 0.7,
    borderBottomColor: "#0f172a",
  },
  identiteCase: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRightWidth: 0.7,
    borderRightColor: "#0f172a",
    justifyContent: "center",
    alignItems: "stretch",
  },
  identiteCentre: { textAlign: "center" },
  identiteCaseFin: { borderRightWidth: 0 },
  identiteLibelle: { fontSize: 8, color: "#0f172a" },
  identiteValeur: { fontSize: 9, fontFamily: "Times-Bold" },

  // --- Tableau des notes ----------------------------------------------------
  table: { borderWidth: 0.7, borderColor: "#0f172a" },
  ligne: { flexDirection: "row", borderBottomWidth: 0.4, borderBottomColor: "#94a3b8" },
  ligneEntete: {
    flexDirection: "row",
    backgroundColor: "#d9d9d9",
    borderBottomWidth: 0.7,
    borderBottomColor: "#0f172a",
  },
  ligneGroupe: {
    flexDirection: "row",
    backgroundColor: "#d9d9d9",
    borderTopWidth: 0.7,
    borderTopColor: "#0f172a",
    borderBottomWidth: 0.7,
    borderBottomColor: "#0f172a",
  },
  ligneTotal: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderTopWidth: 0.9,
    borderTopColor: "#0f172a",
  },

  cel: {
    paddingVertical: 3.5,
    paddingHorizontal: 4,
    borderRightWidth: 0.4,
    borderRightColor: "#94a3b8",
  },
  celFin: { borderRightWidth: 0 },
  gras: { fontFamily: "Times-Bold" },
  centre: { textAlign: "center" },
  droite: { textAlign: "right" },

  // Largeurs calquées sur les colonnes A:G du modèle Excel.
  // La ligne des blocs fusionne Disciplines à Moyenne générale (63 %).
  cTitreBloc: { width: "63%" },
  cDiscipline: { width: "24%" },
  cDevoirs: { width: "12%" },
  cCompos: { width: "15%" },
  cMoyenne: { width: "12%" },
  cCoeff: { width: "8%" },
  cPoints: { width: "13%" },
  cAppreciation: { width: "16%" },

  // --- Bas de page ----------------------------------------------------------
  bas: { flexDirection: "row", marginTop: 10, gap: 10 },
  conseil: { flex: 1, borderWidth: 0.7, borderColor: "#0f172a" },
  conseilTitre: {
    backgroundColor: "#e2efda",
    paddingVertical: 3,
    paddingHorizontal: 5,
    fontFamily: "Times-Bold",
    borderBottomWidth: 0.7,
    borderBottomColor: "#0f172a",
  },
  conseilLigne: {
    flexDirection: "row",
    borderBottomWidth: 0.4,
    borderBottomColor: "#94a3b8",
    paddingVertical: 3.5,
    paddingHorizontal: 5,
  },
  conseilLibelle: { width: "42%", color: "#475569" },
  conseilValeur: { width: "58%", fontFamily: "Times-Bold" },

  historique: { width: "49%", borderWidth: 0.7, borderColor: "#0f172a" },

  decision: {
    marginTop: 8,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderWidth: 0.7,
    borderColor: "#0f172a",
    backgroundColor: "#f8fafc",
  },

  signature: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 14,
    paddingHorizontal: 8,
  },
  mentionLegale: {
    marginTop: 14,
    fontSize: 6.5,
    fontStyle: "italic",
    color: "#475569",
    textAlign: "center",
  },
});

export interface LigneMatiere {
  libelle: string;
  moyenneDevoirs: number | null;
  noteComposition: number | null;
  moyenne: number | null;
  coefficient: number;
  points: number | null;
  appreciation: string;
}

export interface BlocMatieres {
  titre: string;
  matieres: LigneMatiere[];
  totalCoefficients: number;
  moyenne: number | null;
}

export interface PeriodeHistorique {
  libelle: string;
  moyenne: number | null;
  rang: number | null;
}

export interface DonneesBulletin {
  etablissement: Etablissement;
  anneeScolaire: string;
  periodeLibelle: string;

  eleve: {
    nomComplet: string;
    matricule: string;
    statut: string;
    classe: string;
    effectifClasse: number;
    retards: number;
    heuresManquees: number;
    joursManques: number;
  };

  blocs: BlocMatieres[];
  totalCoefficients: number;
  totalPoints: number;
  moyenneGenerale: number | null;
  rang: number | null;

  historique: PeriodeHistorique[];
  moyenneAnnuelle: number | null;
  rangAnnuel: number | null;

  appreciationTravail: string | null;
  appreciationDiscipline: string | null;
  decisionConseil: string | null;
  /** « Admis(e) en Première L », par exemple. Vide hors conseil de fin d'année. */
  orientation: string | null;

  ville: string;
  dateEdition: string;
}

/** Deux décimales, virgule française — comme sur le document papier. */
function n2(valeur: number | null | undefined): string {
  if (valeur === null || valeur === undefined) return "—";
  return valeur.toFixed(2).replace(".", ",");
}

function Cellule({
  children,
  largeur,
  style,
  fin,
}: {
  children: React.ReactNode;
  largeur: Style;
  style?: Style | Style[];
  fin?: boolean;
}) {
  return (
    <View style={[s.cel, largeur, ...(fin ? [s.celFin] : []), ...(style ? [style] : [])]}>
      <Text>{children}</Text>
    </View>
  );
}

export function Bulletin({ d }: { d: DonneesBulletin }) {
  const identite = {
    nomComplet: d.eleve.nomComplet,
    classe: d.eleve.classe,
    matricule: d.eleve.matricule,
    statut: d.eleve.statut,
    effectif: String(d.eleve.effectifClasse),
    retards: String(d.eleve.retards).padStart(2, "0"),
    heuresManquees: `${d.eleve.heuresManquees}h`,
    joursManques: String(d.eleve.joursManques).padStart(2, "0"),
  };

  return (
    <Document
      title={`Bulletin ${d.periodeLibelle} — ${d.eleve.nomComplet}`}
      author={d.etablissement.nom}
    >
      <Page size="A4" style={s.page}>
        <Text style={s.titre}>Bulletin de notes du {d.periodeLibelle}</Text>

        {/* Grille d'identification alignée sur les fusions de cellules Excel. */}
        <View style={s.identite}>
          <View style={s.identiteRangee}>
            <View style={[s.identiteCase, { width: "24%" }]}>
              <Text style={[s.identiteLibelle, s.identiteCentre]}>Nom & Prénom :</Text>
            </View>
            <View style={[s.identiteCase, { width: "44%" }]}>
              <Text style={[s.identiteValeur, s.identiteCentre]}>{identite.nomComplet}</Text>
            </View>
            <View style={[s.identiteCase, s.identiteCaseFin, { width: "32%" }]}>
              <Text style={s.identiteCentre}><Text style={s.identiteLibelle}>Classe : </Text><Text style={s.identiteValeur}>{identite.classe}</Text></Text>
            </View>
          </View>
          <View style={s.identiteRangee}>
            <View style={[s.identiteCase, { width: "24%" }]}>
              <Text style={[s.identiteLibelle, s.identiteCentre]}>Matricule :</Text>
            </View>
            <View style={[s.identiteCase, { width: "12%" }]}>
              <Text style={[s.identiteValeur, s.identiteCentre]}>{identite.matricule}</Text>
            </View>
            <View style={[s.identiteCase, { width: "35%" }]}>
              <Text style={s.identiteCentre}><Text style={s.identiteLibelle}>Statut : </Text><Text style={s.identiteValeur}>{identite.statut}</Text></Text>
            </View>
            <View style={[s.identiteCase, s.identiteCaseFin, { width: "29%" }]}>
              <Text style={s.identiteCentre}><Text style={s.identiteLibelle}>Effectif : </Text><Text style={s.identiteValeur}>{identite.effectif}</Text></Text>
            </View>
          </View>
          <View style={[s.identiteRangee, { borderBottomWidth: 0 }]}>
            <View style={[s.identiteCase, { width: "36%" }]}>
              <Text style={s.identiteCentre}><Text style={s.identiteLibelle}>Retards : </Text><Text style={s.identiteValeur}>{identite.retards}</Text></Text>
            </View>
            <View style={[s.identiteCase, { width: "35%" }]}>
              <Text style={s.identiteCentre}><Text style={s.identiteLibelle}>Classes manquées : </Text><Text style={s.identiteValeur}>{identite.heuresManquees}</Text></Text>
            </View>
            <View style={[s.identiteCase, s.identiteCaseFin, { width: "29%" }]}>
              <Text style={s.identiteCentre}><Text style={s.identiteLibelle}>Jours manqués : </Text><Text style={s.identiteValeur}>{identite.joursManques}</Text></Text>
            </View>
          </View>
        </View>

        {/* --- Tableau des notes ---------------------------------------- */}
        <View style={[s.table, { marginTop: 10 }]}>
          <View style={s.ligneEntete}>
            <Cellule largeur={s.cDiscipline} style={s.gras}>Disciplines</Cellule>
            <Cellule largeur={s.cDevoirs} style={[s.gras, s.centre]}>Moyennes Devoirs</Cellule>
            <Cellule largeur={s.cCompos} style={[s.gras, s.centre]}>Notes Compositions</Cellule>
            <Cellule largeur={s.cMoyenne} style={[s.gras, s.centre]}>Moyenne Générale</Cellule>
            <Cellule largeur={s.cCoeff} style={[s.gras, s.centre]}>Coeff.</Cellule>
            <Cellule largeur={s.cPoints} style={[s.gras, s.centre]}>Moyenne Coefficient</Cellule>
            <Cellule largeur={s.cAppreciation} style={s.gras} fin>Appréciations</Cellule>
          </View>

          {d.blocs.map((bloc) => (
            <View key={bloc.titre}>
              {bloc.matieres.map((m) => (
                <View key={m.libelle} style={s.ligne}>
                  <Cellule largeur={s.cDiscipline}>{m.libelle}</Cellule>
                  <Cellule largeur={s.cDevoirs} style={s.centre}>{n2(m.moyenneDevoirs)}</Cellule>
                  <Cellule largeur={s.cCompos} style={s.centre}>{n2(m.noteComposition)}</Cellule>
                  <Cellule largeur={s.cMoyenne} style={[s.centre, s.gras]}>{n2(m.moyenne)}</Cellule>
                  <Cellule largeur={s.cCoeff} style={s.centre}>{m.coefficient}</Cellule>
                  <Cellule largeur={s.cPoints} style={s.centre}>{n2(m.points)}</Cellule>
                  <Cellule largeur={s.cAppreciation} fin>{m.appreciation}</Cellule>
                </View>
              ))}

              {/*
                Ligne de bloc. La moyenne est placée dans la DERNIÈRE colonne,
                comme sur le document papier — et non sous « Moyenne
                Coefficient », qui contient des points et non une note sur 20.
                Mettre une moyenne dans une colonne de points inviterait à les
                additionner.
              */}
              <View style={s.ligneGroupe}>
                <Cellule largeur={s.cTitreBloc} style={s.gras}>{bloc.titre}</Cellule>
                <Cellule largeur={s.cCoeff} style={[s.centre, s.gras]}>{bloc.totalCoefficients}</Cellule>
                <Cellule largeur={s.cPoints} style={[s.centre, s.gras]}>{n2(bloc.moyenne)}</Cellule>
                <Cellule largeur={s.cAppreciation} fin>{" "}</Cellule>
              </View>
            </View>
          ))}

          <View style={s.ligneTotal}>
            <Cellule largeur={s.cTitreBloc} style={s.gras}>Total</Cellule>
            <Cellule largeur={s.cCoeff} style={[s.centre, s.gras]}>{d.totalCoefficients}</Cellule>
            <Cellule largeur={s.cPoints} style={[s.centre, s.gras]}>{n2(d.totalPoints)}</Cellule>
            <Cellule largeur={s.cAppreciation} fin>{" "}</Cellule>
          </View>
        </View>

        {/* --- Conseil de classe et historique --------------------------- */}
        <View style={s.bas}>
          <View style={s.conseil}>
            <Text style={s.conseilTitre}>Appréciation du conseil de classe</Text>
            {[
              { libelle: "Travail", valeur: d.appreciationTravail },
              { libelle: "Discipline", valeur: d.appreciationDiscipline },
              { libelle: "Décision du conseil", valeur: d.decisionConseil },
            ].map((l) => (
              <View key={l.libelle} style={s.conseilLigne}>
                <Text style={s.conseilLibelle}>{l.libelle}</Text>
                <Text style={s.conseilValeur}>{l.valeur ?? "—"}</Text>
              </View>
            ))}
          </View>

          <View style={s.historique}>
            <View style={[s.conseilLigne, { backgroundColor: "#e2efda", paddingVertical: 5 }]}>
              <Text style={[s.conseilLibelle, { width: "50%", color: "#0f172a" }]}>Période</Text>
              <Text style={[{ width: "28%" }, s.centre, s.gras]}>Moyenne</Text>
              <Text style={[{ width: "22%" }, s.centre, s.gras]}>Rang</Text>
            </View>
            {d.historique.map((p) => (
              <View key={p.libelle} style={s.conseilLigne}>
                <Text style={[s.conseilLibelle, { width: "50%" }]}>{p.libelle}</Text>
                <Text style={[{ width: "28%" }, s.centre]}>{n2(p.moyenne)}</Text>
                <Text style={[{ width: "22%" }, s.centre]}>{p.rang ?? "—"}</Text>
              </View>
            ))}
            <View style={[s.conseilLigne, { backgroundColor: "#ffffff", borderBottomWidth: 0 }]}>
              <Text style={[s.conseilLibelle, { width: "50%" }, s.gras]}>Annuelle</Text>
              <Text style={[{ width: "28%" }, s.centre, s.gras]}>{n2(d.moyenneAnnuelle)}</Text>
              <Text style={[{ width: "22%" }, s.centre, s.gras]}>{d.rangAnnuel ?? "—"}</Text>
            </View>
          </View>
        </View>

        {d.orientation ? (
          <View style={s.decision}>
            <Text style={s.gras}>{d.orientation}</Text>
          </View>
        ) : null}

        <View style={s.signature}>
          <Text style={{ color: "#0f172a" }}>
            {d.ville}, le {d.dateEdition}
          </Text>
          <Text style={[s.gras, { minWidth: 130, textAlign: "center" }]}>Le Proviseur</Text>
        </View>
      </Page>
    </Document>
  );
}
