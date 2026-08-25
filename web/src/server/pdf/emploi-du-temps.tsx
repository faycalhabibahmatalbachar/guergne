import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { GrilleImpression } from "@/server/domain/emploi-du-temps";

import { EnTete, Pied } from "./gabarit";

/**
 * Emploi du temps imprimable (E-47).
 *
 * PAYSAGE, ET CE N'EST PAS UN DÉTAIL
 * -----------------------------------
 * Six jours en colonnes et neuf créneaux en lignes ne tiennent pas en portrait :
 * chaque case ferait deux centimètres de large, et « Sciences de la Vie et de
 * la Terre » y serait illisible. En paysage, la matière, le professeur et la
 * salle tiennent sur trois lignes.
 *
 * LE PDF PLUTÔT QUE L'IMPRESSION DU NAVIGATEUR
 * ---------------------------------------------
 * Une grille imprimée depuis l'écran emporte les boutons, les cases vides
 * cliquables et les marges du navigateur, différentes d'un poste à l'autre. Le
 * PDF sort identique partout, porte l'en-tête officiel, et se transmet par
 * WhatsApp à un professeur qui n'a pas de compte.
 *
 * LES CASES VIDES RESTENT VIDES, PAS BARRÉES
 * -------------------------------------------
 * Une case vide sur une feuille affichée au mur veut dire « pas cours ». La
 * barrer laisserait croire à une annulation.
 */

const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

const styles = StyleSheet.create({
  page: {
    paddingTop: 24,
    paddingBottom: 40,
    paddingHorizontal: 28,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#1e293b",
  },
  titre: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 4,
  },
  sousTitre: { fontSize: 9, textAlign: "center", color: "#64748b", marginBottom: 12 },

  ligneEntete: {
    flexDirection: "row",
    backgroundColor: "#1e429f",
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
  },
  ligne: { flexDirection: "row", minHeight: 34 },

  celluleHoraire: {
    width: 62,
    borderWidth: 0.5,
    borderColor: "#cbd5e1",
    padding: 3,
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
    fontSize: 7.5,
  },
  cellule: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: "#cbd5e1",
    padding: 3,
    justifyContent: "center",
  },
  celluleOccupee: { backgroundColor: "#eff6ff" },
  celluleContinuee: { backgroundColor: "#eff6ff" },

  matiere: { fontFamily: "Helvetica-Bold", fontSize: 8 },
  detail: { fontSize: 7, color: "#475569", marginTop: 1 },

  legende: { marginTop: 12, fontSize: 7.5, color: "#64748b", lineHeight: 1.5 },
});

export function DocumentEmploiDuTemps({
  grille,
  portee,
}: {
  grille: GrilleImpression;
  portee: "classe" | "enseignant" | "salle";
}) {
  // Index (jour, ordre) → case, en tenant compte des séances qui couvrent
  // plusieurs créneaux : la deuxième heure d'un cours double ne doit pas
  // apparaître comme une case libre.
  const occupation = new Map<string, { c: (typeof grille.cases)[number]; debut: boolean }>();
  for (const c of grille.cases) {
    for (let i = 0; i < c.nbCreneaux; i += 1) {
      occupation.set(`${c.jour}|${c.ordre + i}`, { c, debut: i === 0 });
    }
  }

  return (
    <Document
      title={`Emploi du temps — ${grille.titre}`}
      author={grille.etablissement.nom}
      language="fr"
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        <EnTete etablissement={grille.etablissement} />

        <Text style={styles.titre}>Emploi du temps — {grille.titre}</Text>
        <Text style={styles.sousTitre}>
          {grille.sousTitre} · Année scolaire {grille.annee}
        </Text>

        <View>
          <View style={styles.ligneEntete}>
            <View style={styles.celluleHoraire}>
              <Text> </Text>
            </View>
            {JOURS.map((j) => (
              <View key={j} style={[styles.cellule, { borderColor: "#1e429f" }]}>
                <Text style={{ textAlign: "center", color: "#ffffff" }}>{j}</Text>
              </View>
            ))}
          </View>

          {grille.creneaux.map((cr) => (
            <View key={cr.id} style={styles.ligne} wrap={false}>
              <View style={styles.celluleHoraire}>
                <Text>{cr.libelle}</Text>
              </View>

              {JOURS.map((_, index) => {
                const jour = index + 1;
                const occupe = occupation.get(`${jour}|${cr.ordre}`);

                if (!occupe) {
                  return <View key={jour} style={styles.cellule} />;
                }

                // La suite d'un cours double : la case reste teintée mais
                // n'est pas réécrite, sinon le lecteur croit à deux cours.
                if (!occupe.debut) {
                  return <View key={jour} style={[styles.cellule, styles.celluleContinuee]} />;
                }

                const c = occupe.c;
                const secondaire =
                  portee === "classe"
                    ? c.enseignant
                    : portee === "enseignant"
                      ? c.classe
                      : `${c.classe} · ${c.matiere}`;

                return (
                  <View key={jour} style={[styles.cellule, styles.celluleOccupee]}>
                    <Text style={styles.matiere}>
                      {portee === "salle" ? c.classe : c.matiere}
                    </Text>
                    {secondaire ? <Text style={styles.detail}>{secondaire}</Text> : null}
                    {c.salle && portee !== "salle" ? (
                      <Text style={styles.detail}>Salle {c.salle}</Text>
                    ) : null}
                    {c.semaineType ? (
                      <Text style={styles.detail}>Semaine {c.semaineType}</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))}
        </View>

        <Text style={styles.legende}>
          Une case vide signifie qu&apos;aucun cours n&apos;est prévu sur ce créneau. Les cours
          couvrant deux heures consécutives ne sont inscrits qu&apos;une fois, sur leur créneau de
          début.
        </Text>

        {/*
          Le numéro sert de référence : une grille affichée au mur doit dire de
          quelle version elle date, sinon deux impressions successives se
          confondent et personne ne sait laquelle fait foi.
        */}
        <Pied
          numero={`EDT ${grille.annee} — ${grille.titre}`}
          ville={grille.etablissement.ville}
        />
      </Page>
    </Document>
  );
}
