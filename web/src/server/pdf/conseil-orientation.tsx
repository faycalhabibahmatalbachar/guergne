import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { EnTete, type Etablissement } from "./gabarit";

type Style = ReturnType<typeof StyleSheet.create>[string];

export interface LigneConseilOrientation {
  numero: number;
  matricule: string;
  nomComplet: string;
  moyenneT1: number | null;
  moyenneT2: number | null;
  moyenneT3: number | null;
  moyenneAnnuelle: number | null;
  conduite: number | null;
  observation: string;
}
export interface DonneesConseilOrientation {
  etablissement: Etablissement;
  anneeScolaire: string;
  classe: string;
  lignes: LigneConseilOrientation[];
}

const s = StyleSheet.create({
  page: { paddingTop: 22, paddingBottom: 30, paddingHorizontal: 24, fontSize: 8, fontFamily: "Times-Roman", color: "#111827" },
  titre: { marginTop: 8, fontSize: 12, fontFamily: "Times-Bold", textAlign: "center" },
  sousTitre: { marginTop: 4, marginBottom: 12, fontSize: 10, fontFamily: "Times-Bold", textAlign: "center" },
  tableau: { borderWidth: 0.7, borderColor: "#111827" },
  entete: { flexDirection: "row", backgroundColor: "#d9d9d9", borderBottomWidth: 0.8, borderBottomColor: "#111827" },
  ligne: { flexDirection: "row", borderBottomWidth: 0.45, borderBottomColor: "#6b7280" },
  cellule: { paddingVertical: 5, paddingHorizontal: 3, borderRightWidth: 0.45, borderRightColor: "#6b7280", justifyContent: "center" },
  fin: { borderRightWidth: 0 },
  centre: { textAlign: "center" },
  gras: { fontFamily: "Times-Bold" },
  n: { width: "4%" }, matricule: { width: "7%" }, nom: { width: "25%" }, trimestre: { width: "8%" },
  annuelle: { width: "9%" }, conduite: { width: "8%" }, observation: { width: "23%" },
  pied: { position: "absolute", bottom: 12, left: 24, right: 24, textAlign: "right", fontSize: 7, color: "#6b7280" },
});
const moyenne = (v: number | null) => v === null || !Number.isFinite(v) ? "—" : v.toFixed(2);

function Cellule({ children, largeur, centre = false, gras = false, fin = false }: {
  children: React.ReactNode; largeur: Style; centre?: boolean; gras?: boolean; fin?: boolean;
}) {
  return <View style={[s.cellule, largeur, ...(centre ? [s.centre] : []), ...(fin ? [s.fin] : [])]}>
    <Text style={gras ? s.gras : undefined}>{children}</Text>
  </View>;
}

export function ConseilOrientationPDF({ d }: { d: DonneesConseilOrientation }) {
  return <Document title={`Conseil d’orientation — ${d.classe} — ${d.anneeScolaire}`} author={d.etablissement.nom}>
    <Page size="A4" orientation="landscape" style={s.page} wrap>
      <EnTete etablissement={d.etablissement} />
      <Text style={s.titre}>CONSEIL D’ORIENTATION</Text>
      <Text style={s.sousTitre}>Année scolaire : {d.anneeScolaire} · CLASSE DE {d.classe}</Text>
      <View style={s.tableau}>
        <View style={s.entete} fixed>
          <Cellule largeur={s.n} centre gras>N°</Cellule>
          <Cellule largeur={s.matricule} centre gras>Mat.</Cellule>
          <Cellule largeur={s.nom} gras>Noms & Prénoms</Cellule>
          <Cellule largeur={s.trimestre} centre gras>Moyenne T1</Cellule>
          <Cellule largeur={s.trimestre} centre gras>Moyenne T2</Cellule>
          <Cellule largeur={s.trimestre} centre gras>Moyenne T3</Cellule>
          <Cellule largeur={s.annuelle} centre gras>Moy. annuelle</Cellule>
          <Cellule largeur={s.conduite} centre gras>Conduite</Cellule>
          <Cellule largeur={s.observation} centre gras fin>Observation</Cellule>
        </View>
        {d.lignes.map((l) => <View key={l.numero + l.matricule} style={s.ligne} wrap={false}>
          <Cellule largeur={s.n} centre>{l.numero}</Cellule>
          <Cellule largeur={s.matricule} centre>{l.matricule}</Cellule>
          <Cellule largeur={s.nom}>{l.nomComplet}</Cellule>
          <Cellule largeur={s.trimestre} centre>{moyenne(l.moyenneT1)}</Cellule>
          <Cellule largeur={s.trimestre} centre>{moyenne(l.moyenneT2)}</Cellule>
          <Cellule largeur={s.trimestre} centre>{moyenne(l.moyenneT3)}</Cellule>
          <Cellule largeur={s.annuelle} centre gras>{moyenne(l.moyenneAnnuelle)}</Cellule>
          <Cellule largeur={s.conduite} centre>{moyenne(l.conduite)}</Cellule>
          <Cellule largeur={s.observation} fin>{l.observation}</Cellule>
        </View>)}
      </View>
      <Text style={s.pied} fixed render={({ pageNumber, totalPages }) => `Lycée Guergné La Renaissance · Page ${pageNumber}/${totalPages}`} />
    </Page>
  </Document>;
}
