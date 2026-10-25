import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { join } from "node:path";
import type { Etablissement } from "./gabarit";

const LOGO_ETABLISSEMENT = join(process.cwd(), "public", "logo-officiel.png");

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
  page: { paddingTop: 22, paddingBottom: 30, paddingHorizontal: 24, fontSize: 10.5, fontFamily: "Times-Roman", color: "#111111" },
  entete: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  logo: { width: 44, height: 44, objectFit: "contain" },
  enteteCentre: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  enteteReserve: { width: 44 },
  etablissement: { marginTop: 1, fontSize: 12, fontFamily: "Times-Bold", textAlign: "center" },
  annee: { marginTop: 3, fontSize: 10, fontFamily: "Times-Bold", textAlign: "center" },
  titre: { marginTop: 4, fontSize: 11.5, fontFamily: "Times-Bold", textAlign: "center" },
  sousTitre: { marginTop: 4, marginBottom: 0, fontSize: 10.5, fontFamily: "Times-Bold", textAlign: "center" },
  tableau: { borderWidth: 0.7, borderColor: "#111111" },
  enteteTableau: { flexDirection: "row", backgroundColor: "#ffffff", borderBottomWidth: 0.8, borderBottomColor: "#111111" },
  ligne: { flexDirection: "row", borderBottomWidth: 0.45, borderBottomColor: "#111111" },
  cellule: { paddingVertical: 4, paddingHorizontal: 3, borderRightWidth: 0.45, borderRightColor: "#111111", justifyContent: "center" },
  fin: { borderRightWidth: 0 },
  centre: { textAlign: "center" },
  gras: { fontFamily: "Times-Bold" },
  n: { width: "3%" },
  matricule: { width: "4%" },
  nom: { width: "24%" },
  trimestre: { width: "9%" },
  annuelle: { width: "7%" },
  conduite: { width: "11%" },
  observation: { width: "23%" },
});
const moyenne = (v: number | null) => v === null || !Number.isFinite(v) ? "" : v.toFixed(2);

function Cellule({ children, largeur, centre = false, gras = false, fin = false }: {
  children: React.ReactNode; largeur: Style; centre?: boolean; gras?: boolean; fin?: boolean;
}) {
  return (
    <View style={[s.cellule, largeur, ...(fin ? [s.fin] : [])]}>
      <Text style={[...(centre ? [s.centre] : []), ...(gras ? [s.gras] : [])]}>{children}</Text>
    </View>
  );
}
export function ConseilOrientationPDF({ d }: { d: DonneesConseilOrientation }) {
  return <Document title={`Conseil d’orientation — ${d.classe} — ${d.anneeScolaire}`} author={d.etablissement.nom}>
    <Page size="A4" orientation="landscape" style={s.page} wrap>
      <View style={s.entete}>
        <Image src={LOGO_ETABLISSEMENT} style={s.logo} />
        <View style={s.enteteCentre}>
          <Text style={s.etablissement}>{d.etablissement.nom.toLocaleUpperCase("fr").replace(/\s+LA RENAISSANCE$/i, " : LA RENAISSANCE")}</Text>
          <Text style={s.annee}>Année scolaire : {d.anneeScolaire.replace(/(\d{4})\s*-\s*(\d{4})/, "$1 – $2")}</Text>
          <Text style={s.titre}>CONSEIL D'ORIENTATION</Text>
          <Text style={s.sousTitre}>CLASSE DE {d.classe}</Text>
        </View>
        <View style={s.enteteReserve} />
      </View>
      <View style={s.tableau}>
        <View style={s.enteteTableau} fixed>
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
          <Cellule largeur={s.n} centre>{String(l.numero).padStart(2, "0")}</Cellule>
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
    </Page>
  </Document>;
}
