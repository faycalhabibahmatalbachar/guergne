import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { join } from "node:path";

/**
 * `@react-pdf/renderer` n'exporte pas son type `Style`. On le retrouve depuis
 * `StyleSheet.create`, qui le renvoie : plus sûr que de le redéclarer à la
 * main, où la moindre divergence passerait inaperçue.
 */
type Style = ReturnType<typeof StyleSheet.create>[string];

const LOGO_ETABLISSEMENT = join(process.cwd(), "public", "logo-officiel.png");

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
  page: { paddingTop: 25, paddingBottom: 54, paddingHorizontal: 36.8, fontSize: 9.1, fontFamily: "Times-Roman", color: "#111111" },
  entete: { flexDirection: "row", height: 70.5, alignItems: "center", justifyContent: "flex-start", marginBottom: 0 },
  enteteInstitution: { width: "43%", justifyContent: "center", alignItems: "flex-start" },
  enteteLigne: { fontSize: 7.5, lineHeight: 1.18, color: "#111111" },
  enteteLigneGrasse: { fontSize: 7.5, fontFamily: "Times-Bold", lineHeight: 1.18, color: "#111111" },
  enteteLogoZone: { width: "14%", alignItems: "center", justifyContent: "center" },
  logo: { width: 43, height: 43, objectFit: "contain" },
  enteteDevise: { fontSize: 8.1, fontFamily: "Times-Bold", textAlign: "center", marginBottom: 4 },
  enteteAnneeValeur: { fontSize: 10.2, fontFamily: "Times-Bold", textAlign: "center", lineHeight: 1.25, marginBottom: 1 },
  enteteAnnee: { fontSize: 7.8, textAlign: "center", lineHeight: 1.35 },
  enteteMotto: { fontSize: 5.8, fontFamily: "Times-Bold", textAlign: "center", color: "#1b5e20", marginTop: 1 },
  enteteDroite: { width: "43%", alignItems: "center", justifyContent: "center" },
  titreConteneur: { height: 42, justifyContent: "center", alignItems: "stretch" },
  titre: { fontSize: 11.1, fontFamily: "Times-Bold", textAlign: "center" },
  identite: { borderWidth: 0.7, borderColor: "#111111", marginBottom: 18 },
  identiteRangee: { flexDirection: "row", borderBottomWidth: 0.7, borderBottomColor: "#111111" },
  identiteCase: { paddingVertical: 8.5, paddingHorizontal: 3, borderRightWidth: 0.7, borderRightColor: "#111111", justifyContent: "center", alignItems: "stretch" },
  identiteCentre: { textAlign: "center" },
  identiteCaseFin: { borderRightWidth: 0 },
  identiteLibelle: { fontSize: 10, color: "#111111" },
  identiteValeur: { fontSize: 10.5, fontFamily: "Times-Bold" },
  identiteNom: { fontSize: 12.7, fontFamily: "Times-BoldItalic", textAlign: "center" },
  table: { borderWidth: 0.7, borderColor: "#111111" },
  ligne: { flexDirection: "row", borderBottomWidth: 0.4, borderBottomColor: "#111111" },
  ligneEntete: { flexDirection: "row", backgroundColor: "#d9d9d9", borderBottomWidth: 0.7, borderBottomColor: "#111111" },
  cel: { paddingVertical: 3.4, paddingHorizontal: 2, borderRightWidth: 0.4, borderRightColor: "#111111" },
  celEntete: { paddingVertical: 5.0, paddingHorizontal: 2 },
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
  ligneGroupe: { flexDirection: "row", backgroundColor: "#d9d9d9", borderTopWidth: 0.7, borderTopColor: "#111111", borderBottomWidth: 0.7, borderBottomColor: "#111111", paddingVertical: 6.2 },
  ligneTotal: { flexDirection: "row", backgroundColor: "#ffffff", borderTopWidth: 0.9, borderTopColor: "#111111", paddingVertical: 6.2 },
  bas: { flexDirection: "row", marginTop: 18, gap: 0 },
  conseil: { width: "51%", borderWidth: 0.7, borderColor: "#111111" },
  conseilTitreFusion: { width: "100%", height: 48, justifyContent: "center", borderBottomWidth: 0.7, borderBottomColor: "#111111", backgroundColor: "#e2efda", paddingHorizontal: 4 },
  conseilTitreTexte: { fontSize: 9.0, fontFamily: "Times-Bold", color: "#111111" },
  conseilLigne: { flexDirection: "row", borderBottomWidth: 0.4, borderBottomColor: "#111111", paddingVertical: 6.5, paddingHorizontal: 0 },
  conseilLibelle: { width: "47%", color: "#111111", paddingHorizontal: 5, justifyContent: "center" },
  conseilValeurZone: { width: "53%", paddingHorizontal: 3, justifyContent: "center", alignItems: "center", borderLeftWidth: 0.4, borderLeftColor: "#111111" },
  conseilValeur: { fontFamily: "Times-Bold", textAlign: "center", fontSize: 8.7 },
  conseilCommentaire: { fontFamily: "Times-Italic", textAlign: "center", fontSize: 6.4, lineHeight: 1.12, marginTop: 1.5 },
  historique: { width: "49%", borderWidth: 0.7, borderColor: "#111111" },
  historiqueCell: { paddingHorizontal: 3, paddingVertical: 6.5, justifyContent: "center", borderRightWidth: 0.4, borderRightColor: "#111111" },
  historiqueEntete: { backgroundColor: "#e2efda" },
  historiqueLigne: { flexDirection: "row", borderBottomWidth: 0.4, borderBottomColor: "#111111" },
  orientationRow: { height: 17.25, justifyContent: "center" },
  orientation: { fontSize: 8.5, fontFamily: "Times-Bold", color: "#111111" },
  signature: { flexDirection: "row", height: 18, justifyContent: "space-between", alignItems: "center", marginTop: 0, paddingHorizontal: 0 },
  pied: { position: "absolute", bottom: 19, left: 36.8, right: 36.8, flexDirection: "row", justifyContent: "space-between", alignItems: "center", fontSize: 6.6, color: "#111111" },
});

export interface LigneMatiere {
  libelle: string;
  moyenneDevoirs: number | null;
  noteComposition: number | null;
  moyenne: number | null;
  coefficient: number | null;
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
  appreciationGenerale: string | null;
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
  cellStyle,
}: {
  children: React.ReactNode;
  largeur: Style;
  style?: Style | Style[];
  fin?: boolean;
  cellStyle?: Style;
}) {
  return (
    <View style={[s.cel, ...(cellStyle ? [cellStyle] : []), largeur, ...(fin ? [s.celFin] : [])]}>
      <Text style={style}>{children}</Text>
    </View>
  );
}export function Bulletin({ d }: { d: DonneesBulletin }) {
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
      <Page size="A4" style={s.page} wrap={false}>
                <View style={s.entete}>
          <View style={s.enteteInstitution}>
            <Text style={s.enteteLigneGrasse}>République du Tchad</Text>
            <Text style={s.enteteLigne}>Lycée Guergné : la Renaissance</Text>
            <Text style={s.enteteLigne}>N’Djari - N’Djamena - Tchad</Text>
            <Text style={s.enteteLigne}>Tél. : 66.42.74.32 &amp; 99.92.15.25</Text>
            <Text style={s.enteteLigne}>Email : guergne_renaissance@yahoo.fr</Text>
          </View>
          <View style={s.enteteLogoZone}>
            <Image src={LOGO_ETABLISSEMENT} style={s.logo} />
            <Text style={s.enteteMotto}>Discipline-Travail-Réussite</Text>
          </View>
          <View style={s.enteteDroite}>
            <Text style={s.enteteDevise}>Unité - Travail - Progrès</Text>
            <Text style={s.enteteAnnee}>Année scolaire : <Text style={s.enteteAnneeValeur}>{d.anneeScolaire.replace(/\s*-\s*/g, " - ")}</Text></Text>
          </View>
        </View>
        <View style={s.titreConteneur}>
          <Text style={s.titre}>BULLETIN DE NOTES DU  {d.periodeLibelle.replace(/\s+trimestre$/i, "  TRIMESTRE")}</Text>
        </View>
        

        {/* Grille d'identification alignée sur les fusions de cellules Excel. */}
        <View style={s.identite}>
          <View style={s.identiteRangee}>
            <View style={[s.identiteCase, { width: "24%", borderRightWidth: 0 }]}>
              <Text style={[s.identiteLibelle, s.identiteCentre]}>Nom & Prénom :</Text>
            </View>
            <View style={[s.identiteCase, { width: "47%" }]}>
              <Text style={s.identiteNom}>{identite.nomComplet}</Text>
            </View>
            <View style={[s.identiteCase, s.identiteCaseFin, { width: "29%" }]}>
              <Text style={s.identiteCentre}><Text style={s.identiteLibelle}>Classe : </Text><Text style={s.identiteValeur}>{identite.classe}</Text></Text>
            </View>
          </View>
          <View style={s.identiteRangee}>
            <View style={[s.identiteCase, { width: "24%", borderRightWidth: 0, paddingRight: 10 }]}>
              <Text style={[s.identiteLibelle, { textAlign: "right" }]}>Matricule :</Text>
            </View>
            <View style={[s.identiteCase, { width: "12%", paddingHorizontal: 0, alignItems: "stretch", justifyContent: "center", overflow: "hidden" }]}>
              <Text style={[s.identiteValeur, { textAlign: "center", fontSize: 9.2, width: "100%" }]}>{identite.matricule}</Text>
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
        <View style={[s.table, { marginTop: 0 }]}>
          <View style={s.ligneEntete}>
            <Cellule largeur={s.cDiscipline} cellStyle={s.celEntete} style={s.gras}>Disciplines</Cellule>
            <Cellule largeur={s.cDevoirs} cellStyle={s.celEntete} style={[s.gras, s.centre]}>Moyennes Devoirs</Cellule>
            <Cellule largeur={s.cCompos} cellStyle={s.celEntete} style={[s.gras, s.centre]}>Notes Compositions</Cellule>
            <Cellule largeur={s.cMoyenne} cellStyle={s.celEntete} style={[s.gras, s.centre]}>Moyenne Générale</Cellule>
            <Cellule largeur={s.cCoeff} cellStyle={s.celEntete} style={[s.gras, s.centre]}>Coeff.</Cellule>
            <Cellule largeur={s.cPoints} cellStyle={s.celEntete} style={[s.gras, s.centre]}>Moyenne Coefficient</Cellule>
            <Cellule largeur={s.cAppreciation} cellStyle={s.celEntete} style={s.gras} fin>Appréciations</Cellule>
          </View>

          {d.blocs.map((bloc) => (
            <View key={bloc.titre}>
              {bloc.matieres.map((m) => (
                <View key={m.libelle} style={s.ligne} wrap={false}>
                  <Cellule largeur={s.cDiscipline}>{m.libelle}</Cellule>
                  <Cellule largeur={s.cDevoirs} style={s.centre}>{n2(m.moyenneDevoirs)}</Cellule>
                  <Cellule largeur={s.cCompos} style={s.centre}>{n2(m.noteComposition)}</Cellule>
                  <Cellule largeur={s.cMoyenne} style={[s.centre, s.gras]}>{n2(m.moyenne)}</Cellule>
                  <Cellule largeur={s.cCoeff} style={s.centre}>{m.coefficient ?? ""}</Cellule>
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

        {/* Conseil : fusion A27:C28 à gauche, suivi des périodes en D:G à droite. */}
        <View style={s.bas}>
          <View style={s.conseil}>
            <View style={s.conseilTitreFusion}>
              <Text style={s.conseilTitreTexte}>Appréciation du Conseil de classe</Text>
            </View>
            {[
              { libelle: "Travail", valeur: d.appreciationTravail, detail: d.appreciationGenerale },
              { libelle: "Discipline", valeur: d.appreciationDiscipline, detail: null },
              { libelle: "Décision du Conseil", valeur: d.decisionConseil, detail: null },
            ].map((l) => (
              <View key={l.libelle} style={s.conseilLigne}>
                <View style={s.conseilLibelle}><Text>{l.libelle}</Text></View>
                <View style={s.conseilValeurZone}>
                  <View style={{ width: "100%", alignItems: "center" }}>
                    <Text style={s.conseilValeur}>{l.valeur ?? ""}</Text>
                    {l.detail ? <Text style={s.conseilCommentaire}>{l.detail}</Text> : null}
                  </View>
                </View>
              </View>
            ))}
          </View>
          <View style={s.historique}>
            <View style={[s.historiqueLigne, s.historiqueEntete]}>
              <View style={[s.historiqueCell, { width: "40%" }]}><Text style={s.gras}>Période</Text></View>
              <View style={[s.historiqueCell, { width: "27%" }]}><Text style={[s.centre, s.gras]}>Moyenne</Text></View>
              <View style={[s.historiqueCell, { width: "33%", borderRightWidth: 0 }]}><Text style={[s.centre, s.gras]}>Rang</Text></View>
            </View>
            {[
              { libelle: "1er trimestre", donnees: d.historique[0] },
              { libelle: "2ème trimestre", donnees: d.historique[1] },
              { libelle: "3ème trimestre", donnees: d.historique[2] },
            ].map((p) => (
              <View key={p.libelle} style={s.historiqueLigne}>
                <View style={[s.historiqueCell, { width: "40%" }]}><Text>{p.libelle}</Text></View>
                <View style={[s.historiqueCell, { width: "27%" }]}><Text style={s.centre}>{p.donnees ? n2(p.donnees.moyenne) : ""}</Text></View>
                <View style={[s.historiqueCell, { width: "33%", borderRightWidth: 0 }]}><Text style={s.centre}>{p.donnees?.rang ?? ""}</Text></View>
              </View>
            ))}
            <View style={[s.historiqueLigne, { borderBottomWidth: 0 }]}>
              <View style={[s.historiqueCell, { width: "40%" }]}><Text style={s.gras}>Annuelle</Text></View>
              <View style={[s.historiqueCell, { width: "27%" }]}><Text style={[s.centre, s.gras]}>{n2(d.moyenneAnnuelle)}</Text></View>
              <View style={[s.historiqueCell, { width: "33%", borderRightWidth: 0 }]}><Text style={[s.centre, s.gras]}>{d.rangAnnuel ?? ""}</Text></View>
            </View>
          </View>
        </View>
        <View style={s.orientationRow}>
          {d.orientation ? <Text style={s.orientation}>{d.orientation}</Text> : null}
        </View>
        <View style={{ height: 18 }} />
        <View style={s.signature}>
          <View style={{ width: "60%", flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={[s.gras, { fontSize: 9.0 }]}>N’Djamena, le</Text>
            <Text style={{ fontSize: 9.0 }}>{d.dateEdition}</Text>
          </View>
          <Text style={[s.gras, { minWidth: 130, textAlign: "center", fontSize: 9.0 }]}>Le Proviseur</Text>
        </View>
        <View style={s.pied} fixed>
          <Text>LGR</Text>
          <Text>NB : Toute surcharge ou rature annule la validité de ce bulletin de notes</Text>
          <Text>{new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</Text>
        </View>
      </Page>
    </Document>
  );
}
