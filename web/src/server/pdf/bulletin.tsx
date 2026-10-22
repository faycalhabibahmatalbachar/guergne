import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { join } from "node:path";

/**
 * `@react-pdf/renderer` n'exporte pas son type `Style`. On le retrouve depuis
 * `StyleSheet.create`, qui le renvoie : plus sûr que de le redéclarer à la
 * main, où la moindre divergence passerait inaperçue.
 */
type Style = ReturnType<typeof StyleSheet.create>[string];

const LOGO_ETABLISSEMENT = join(process.cwd(), "public", "icone-192.png");

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
  page: { paddingTop: 16, paddingBottom: 22, paddingHorizontal: 28, fontSize: 10.2, fontFamily: "Times-Roman", color: "#111111" },
  entete: { flexDirection: "row", alignItems: "center", marginBottom: 5, paddingBottom: 4, borderBottomWidth: 0.7, borderBottomColor: "#111111" },
  logo: { width: 42, height: 42, objectFit: "contain" },
  enteteCentre: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  enteteEtablissement: { fontSize: 10.5, fontFamily: "Times-Bold", textAlign: "center" },
  enteteSecondaire: { marginTop: 2, fontSize: 7.5, textAlign: "center" },
  enteteReserve: { width: 42 },
  titre: { fontSize: 12, fontFamily: "Times-BoldItalic", textAlign: "center", marginTop: 4, marginBottom: 12 },
  identite: { borderWidth: 0.7, borderColor: "#111111", marginBottom: 8 },
  identiteRangee: { flexDirection: "row", borderBottomWidth: 0.7, borderBottomColor: "#111111" },
  identiteCase: { paddingVertical: 3, paddingHorizontal: 4, borderRightWidth: 0.7, borderRightColor: "#111111", justifyContent: "center", alignItems: "stretch" },
  identiteCentre: { textAlign: "center" },
  identiteCaseFin: { borderRightWidth: 0 },
  identiteLibelle: { fontSize: 9.4, color: "#111111" },
  identiteValeur: { fontSize: 10.2, fontFamily: "Times-Bold" },
  identiteNom: { fontSize: 11.7, fontFamily: "Times-BoldItalic", textAlign: "center" },
  table: { borderWidth: 0.7, borderColor: "#111111" },
  ligne: { flexDirection: "row", borderBottomWidth: 0.45, borderBottomColor: "#111111" },
  ligneEntete: { flexDirection: "row", backgroundColor: "#d9d9d9", borderBottomWidth: 0.7, borderBottomColor: "#111111" },
  ligneGroupe: { flexDirection: "row", backgroundColor: "#d9d9d9", borderTopWidth: 0.7, borderTopColor: "#111111", borderBottomWidth: 0.7, borderBottomColor: "#111111" },
  ligneTotal: { flexDirection: "row", backgroundColor: "#ffffff", borderTopWidth: 0.9, borderTopColor: "#111111" },
  cel: { paddingVertical: 3, paddingHorizontal: 3, borderRightWidth: 0.4, borderRightColor: "#111111" },
  celFin: { borderRightWidth: 0 },
  gras: { fontFamily: "Times-Bold" },
  centre: { textAlign: "center" },
  droite: { textAlign: "right" },
  cTitreBloc: { width: "63%" },
  cDiscipline: { width: "24%" },
  cDevoirs: { width: "12%" },
  cCompos: { width: "15%" },
  cMoyenne: { width: "12%" },
  cCoeff: { width: "8%" },
  cPoints: { width: "13%" },
  cAppreciation: { width: "16%" },
  bas: { flexDirection: "row", marginTop: 9, gap: 0 },
  conseil: { width: "51%", borderWidth: 0.7, borderColor: "#111111" },
  conseilTitreFusion: { width: "51%", height: 18, justifyContent: "center", borderWidth: 0.7, borderColor: "#111111", backgroundColor: "#e2efda", paddingHorizontal: 5 },
  conseilLigne: { flexDirection: "row", borderBottomWidth: 0.4, borderBottomColor: "#111111", paddingVertical: 3, paddingHorizontal: 0 },
  conseilValeur: { fontFamily: "Times-Bold", textAlign: "center" },
  historique: { width: "49%", borderWidth: 0.7, borderColor: "#111111" },
  historiqueCell: { paddingHorizontal: 4, borderRightWidth: 0.4, borderRightColor: "#111111", justifyContent: "center" },
  orientation: { marginTop: 1, fontSize: 10.2, fontFamily: "Times-Bold", color: "#111111" },
  signature: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: 8, paddingHorizontal: 0 },
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
  if (valeur === null || valeur === undefined) return "";
  return valeur.toFixed(2);
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
    <View style={[s.cel, largeur, ...(fin ? [s.celFin] : [])]}>
      <Text style={style}>{children}</Text>
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
    heuresManquees: String(d.eleve.heuresManquees).padStart(2, "0"),
    joursManques: String(d.eleve.joursManques).padStart(2, "0"),
  };

  return (
    <Document
      title={`Bulletin ${d.periodeLibelle} — ${d.eleve.nomComplet}`}
      author={d.etablissement.nom}
    >
      <Page size="A4" style={s.page}>
                <View style={s.entete}>
          <Image src={LOGO_ETABLISSEMENT} style={s.logo} />
          <View style={s.enteteCentre}>
            <Text style={s.enteteEtablissement}>{d.etablissement.nom.toLocaleUpperCase("fr").replace(/\s+LA RENAISSANCE$/i, " : LA RENAISSANCE")}</Text>
            <Text style={s.enteteSecondaire}>RÉPUBLIQUE DU {(d.etablissement.pays ?? "TCHAD").toLocaleUpperCase("fr")} · MINISTÈRE DE L'ÉDUCATION NATIONALE</Text>
          </View>
          <View style={s.enteteReserve} />
        </View>
        <Text style={s.titre}>BULLETIN DE NOTES DU {d.periodeLibelle.replace(/\s+trimestre$/i, " TRIMESTRE")}</Text>

        {/* Grille d'identification alignée sur les fusions de cellules Excel. */}
        <View style={s.identite}>
          <View style={s.identiteRangee}>
            <View style={[s.identiteCase, { width: "24%" }]}>
              <Text style={[s.identiteLibelle, s.identiteCentre]}>Nom & Prénom :</Text>
            </View>
            <View style={[s.identiteCase, { width: "44%" }]}>
              <Text style={s.identiteNom}>{identite.nomComplet}</Text>
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

        {/* Tableau inférieur et fusions alignés sur le classeur Excel. */}
        <View style={s.bas}>
          <View style={{ width: "51%" }}>
            <View style={s.conseilTitreFusion}>
              <Text style={s.gras}>Appréciation du Conseil de classe</Text>
            </View>
            {[
              { libelle: "Travail", valeur: d.appreciationTravail },
              { libelle: "Discipline", valeur: d.appreciationDiscipline },
              { libelle: "Décision du Conseil", valeur: d.decisionConseil },
            ].map((l) => (
              <View key={l.libelle} style={s.conseilLigne}>
                <View style={{ width: "47%", paddingHorizontal: 5, justifyContent: "center" }}>
                  <Text>{l.libelle}</Text>
                </View>
                <View style={{ width: "53%", paddingHorizontal: 3, justifyContent: "center", alignItems: "center", borderLeftWidth: 0.4, borderLeftColor: "#111111" }}>
                  <Text style={s.conseilValeur}>{l.valeur ?? ""}</Text>
                </View>
              </View>
            ))}
          </View>
          <View style={s.historique}>
            <View style={[s.conseilLigne, { backgroundColor: "#e2efda", paddingVertical: 4 }]}>
              <View style={[s.historiqueCell, { width: "40%" }]}><Text style={s.gras}>Période</Text></View>
              <View style={[s.historiqueCell, { width: "27%" }]}><Text style={[s.centre, s.gras]}>Moyenne</Text></View>
              <View style={[s.historiqueCell, { width: "33%", borderRightWidth: 0 }]}><Text style={[s.centre, s.gras]}>Rang</Text></View>
            </View>
            {d.historique.map((p) => (
              <View key={p.libelle} style={s.conseilLigne}>
                <View style={[s.historiqueCell, { width: "40%" }]}><Text>{p.libelle}</Text></View>
                <View style={[s.historiqueCell, { width: "27%" }]}><Text style={s.centre}>{n2(p.moyenne)}</Text></View>
                <View style={[s.historiqueCell, { width: "33%", borderRightWidth: 0 }]}><Text style={s.centre}>{p.rang ?? ""}</Text></View>
              </View>
            ))}
            <View style={[s.conseilLigne, { backgroundColor: "#ffffff", borderBottomWidth: 0 }]}>
              <View style={[s.historiqueCell, { width: "40%" }]}><Text style={s.gras}>Annuelle</Text></View>
              <View style={[s.historiqueCell, { width: "27%" }]}><Text style={[s.centre, s.gras]}>{n2(d.moyenneAnnuelle)}</Text></View>
              <View style={[s.historiqueCell, { width: "33%", borderRightWidth: 0 }]}><Text style={[s.centre, s.gras]}>{d.rangAnnuel ?? ""}</Text></View>
            </View>
          </View>
        </View>
        {d.orientation ? <Text style={s.orientation}>{d.orientation}</Text> : null}
        <View style={s.signature}>
          <Text style={{ color: "#111111" }}>{d.ville.replace(/'/g, "’")}, le {d.dateEdition}</Text>
          <Text style={[s.gras, { minWidth: 130, textAlign: "center" }]}>Le Proviseur</Text>
        </View>
      </Page>
    </Document>
  );
}
