import { Text, View } from "@react-pdf/renderer";

import {
  Champ,
  dateFr,
  DocumentOfficiel,
  type Etablissement,
  fcfa,
  Signature,
  styles,
} from "./gabarit";

/**
 * Documents officiels de l'établissement.
 *
 * Chacun reprend la formulation administrative attendue au Tchad — un
 * certificat de scolarité rédigé « à la française » se fait refuser au guichet.
 */

export interface DonneesEleve {
  matricule: string;
  nom: string;
  prenom: string;
  sexe: "M" | "F";
  dateNaissance: string;
  lieuNaissance: string | null;
  nationalite: string | null;
  adresse: string | null;
  quartier: string | null;
  telephone: string | null;
  acteNaissanceNumero: string | null;
  ecoleOrigine: string | null;
  groupeSanguin: string | null;
  allergies: string | null;
}

export interface DonneesScolarite {
  anneeLibelle: string;
  classeLibelle: string;
  niveauLibelle: string;
  serieCode: string | null;
  numeroInscription: string | null;
  dateInscription: string;
  estRedoublant: boolean;
}

export interface DonneesTuteur {
  nom: string;
  prenom: string;
  lien: string;
  telephone: string;
  profession: string | null;
  estPrincipal: boolean;
}

const LIENS: Record<string, string> = {
  PERE: "Père",
  MERE: "Mère",
  TUTEUR: "Tuteur légal",
  ONCLE: "Oncle",
  TANTE: "Tante",
  GRAND_PARENT: "Grand-parent",
  FRERE_SOEUR: "Frère / Sœur",
  AUTRE: "Autre",
};

const civilite = (sexe: "M" | "F") => (sexe === "M" ? "l'élève" : "l'élève");
const ne = (sexe: "M" | "F") => (sexe === "M" ? "né" : "née");
const inscrit = (sexe: "M" | "F") => (sexe === "M" ? "inscrit" : "inscrite");

// ===========================================================================
// Certificat de scolarité
// ===========================================================================

export function CertificatScolarite({
  etablissement,
  eleve,
  scolarite,
  numero,
  codeVerification,
}: {
  etablissement: Etablissement;
  eleve: DonneesEleve;
  scolarite: DonneesScolarite;
  numero: string;
  codeVerification: string;
}) {
  return (
    <DocumentOfficiel
      etablissement={etablissement}
      titre="Certificat de scolarité"
      numero={numero}
      codeVerification={codeVerification}
    >
      <View style={{ marginTop: 12 }}>
        <Text style={styles.paragraphe}>
          Je soussigné(e),{" "}
          <Text style={styles.gras}>{etablissement.nomProviseur ?? "le Proviseur"}</Text>, Proviseur
          du <Text style={styles.gras}>{etablissement.nom}</Text>, certifie que{" "}
          {civilite(eleve.sexe)} :
        </Text>

        <View style={[styles.section, { marginLeft: 24, marginTop: 6 }]}>
          <Champ libelle="Nom et prénom" valeur={`${eleve.nom} ${eleve.prenom}`} />
          <Champ libelle="Matricule" valeur={eleve.matricule} />
          <Champ
            libelle={`${ne(eleve.sexe).charAt(0).toUpperCase()}${ne(eleve.sexe).slice(1)} le`}
            valeur={`${dateFr(eleve.dateNaissance)}${eleve.lieuNaissance ? ` à ${eleve.lieuNaissance}` : ""}`}
          />
          <Champ libelle="Nationalité" valeur={eleve.nationalite} />
          {eleve.acteNaissanceNumero ? (
            <Champ libelle="Acte de naissance n°" valeur={eleve.acteNaissanceNumero} />
          ) : null}
        </View>

        <Text style={styles.paragraphe}>
          est régulièrement {inscrit(eleve.sexe)} dans notre établissement en classe de{" "}
          <Text style={styles.gras}>
            {scolarite.classeLibelle}
            {scolarite.serieCode ? ` (série ${scolarite.serieCode})` : ""}
          </Text>{" "}
          au titre de l&apos;année scolaire{" "}
          <Text style={styles.gras}>{scolarite.anneeLibelle}</Text>.
        </Text>

        <Text style={styles.paragraphe}>
          En foi de quoi le présent certificat lui est délivré pour servir et valoir ce que de droit.
        </Text>
      </View>

      <View style={styles.signatures}>
        <View style={{ width: "45%" }} />
        <Signature role="Le Proviseur" nom={etablissement.nomProviseur} />
      </View>
    </DocumentOfficiel>
  );
}

// ===========================================================================
// Fiche d'inscription
// ===========================================================================

export function FicheInscription({
  etablissement,
  eleve,
  scolarite,
  tuteurs,
  numero,
  codeVerification,
}: {
  etablissement: Etablissement;
  eleve: DonneesEleve;
  scolarite: DonneesScolarite;
  tuteurs: DonneesTuteur[];
  numero: string;
  codeVerification: string;
}) {
  return (
    <DocumentOfficiel
      etablissement={etablissement}
      titre="Fiche d'inscription"
      sousTitre={`Année scolaire ${scolarite.anneeLibelle}`}
      numero={numero}
      codeVerification={codeVerification}
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitre}>Identification de l&apos;élève</Text>
        <Champ libelle="Matricule" valeur={eleve.matricule} />
        <Champ libelle="Numéro de dossier" valeur={scolarite.numeroInscription} />
        <Champ libelle="Nom" valeur={eleve.nom} />
        <Champ libelle="Prénom" valeur={eleve.prenom} />
        <Champ libelle="Sexe" valeur={eleve.sexe === "M" ? "Masculin" : "Féminin"} />
        <Champ libelle="Date de naissance" valeur={dateFr(eleve.dateNaissance)} />
        <Champ libelle="Lieu de naissance" valeur={eleve.lieuNaissance} />
        <Champ libelle="Nationalité" valeur={eleve.nationalite} />
        <Champ libelle="Acte de naissance n°" valeur={eleve.acteNaissanceNumero} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitre}>Coordonnées</Text>
        <Champ
          libelle="Adresse"
          valeur={[eleve.adresse, eleve.quartier].filter(Boolean).join(" — ")}
        />
        <Champ libelle="Téléphone" valeur={eleve.telephone} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitre}>Scolarité</Text>
        <Champ libelle="Classe d'affectation" valeur={scolarite.classeLibelle} />
        <Champ libelle="Niveau" valeur={scolarite.niveauLibelle} />
        <Champ libelle="Série" valeur={scolarite.serieCode} />
        <Champ libelle="Date d'inscription" valeur={dateFr(scolarite.dateInscription)} />
        <Champ libelle="Redoublant" valeur={scolarite.estRedoublant ? "Oui" : "Non"} />
        <Champ libelle="Établissement précédent" valeur={eleve.ecoleOrigine} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitre}>Responsables légaux</Text>
        {tuteurs.length === 0 ? (
          <Text style={{ color: "#94a3b8" }}>Aucun tuteur rattaché.</Text>
        ) : (
          <>
            <View style={styles.tableEntete}>
              <Text style={{ width: "34%" }}>Nom et prénom</Text>
              <Text style={{ width: "18%" }}>Lien</Text>
              <Text style={{ width: "24%" }}>Téléphone</Text>
              <Text style={{ width: "24%" }}>Profession</Text>
            </View>
            {tuteurs.map((t, i) => (
              <View
                key={`${t.nom}-${t.telephone}`}
                style={[styles.tableLigne, ...(i % 2 ? [styles.tableLignePaire] : [])]}
              >
                <Text style={{ width: "34%" }}>
                  {t.nom} {t.prenom}
                  {t.estPrincipal ? " (principal)" : ""}
                </Text>
                <Text style={{ width: "18%" }}>{LIENS[t.lien] ?? t.lien}</Text>
                <Text style={{ width: "24%" }}>{t.telephone}</Text>
                <Text style={{ width: "24%" }}>{t.profession ?? "—"}</Text>
              </View>
            ))}
          </>
        )}
      </View>

      {eleve.groupeSanguin || eleve.allergies ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitre}>Informations médicales</Text>
          <Champ libelle="Groupe sanguin" valeur={eleve.groupeSanguin} />
          <Champ libelle="Allergies" valeur={eleve.allergies} />
        </View>
      ) : null}

      <View style={styles.signatures}>
        <Signature role="Le tuteur" />
        <Signature role="Le Secrétariat" />
      </View>
    </DocumentOfficiel>
  );
}

// ===========================================================================
// Reçu de paiement
// ===========================================================================

const MODES: Record<string, string> = {
  ESPECES: "Espèces",
  MOBILE_MONEY: "Mobile Money",
  VIREMENT: "Virement bancaire",
  CHEQUE: "Chèque",
  AUTRE: "Autre",
};

export function RecuPaiement({
  etablissement,
  eleve,
  scolarite,
  paiement,
  situation,
  codeVerification,
}: {
  etablissement: Etablissement;
  eleve: DonneesEleve;
  scolarite: DonneesScolarite;
  paiement: {
    numeroRecu: string;
    montantFcfa: number;
    mode: string;
    referenceExterne: string | null;
    datePaiement: string;
    nomPayeur: string | null;
    libelleEcheance: string | null;
  };
  situation: { totalDu: number; totalPaye: number; resteDu: number };
  codeVerification: string;
}) {
  return (
    <DocumentOfficiel
      etablissement={etablissement}
      titre="Reçu de paiement"
      sousTitre={`Année scolaire ${scolarite.anneeLibelle}`}
      numero={paiement.numeroRecu}
      codeVerification={codeVerification}
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitre}>Élève</Text>
        <Champ libelle="Nom et prénom" valeur={`${eleve.nom} ${eleve.prenom}`} />
        <Champ libelle="Matricule" valeur={eleve.matricule} />
        <Champ libelle="Classe" valeur={scolarite.classeLibelle} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitre}>Versement</Text>
        <Champ libelle="Objet" valeur={paiement.libelleEcheance ?? "Frais de scolarité"} />
        <Champ libelle="Mode de paiement" valeur={MODES[paiement.mode] ?? paiement.mode} />
        {paiement.referenceExterne ? (
          <Champ libelle="Référence" valeur={paiement.referenceExterne} />
        ) : null}
        <Champ libelle="Date" valeur={dateFr(paiement.datePaiement)} />
        <Champ libelle="Versé par" valeur={paiement.nomPayeur} />
      </View>

      {/* Le montant est mis en évidence : c'est la seule information que le
          tuteur vérifiera au guichet. */}
      <View
        style={{
          borderWidth: 1,
          borderColor: "#1e429f",
          borderRadius: 4,
          padding: 12,
          marginVertical: 10,
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: 8.5, color: "#64748b" }}>MONTANT REÇU</Text>
        <Text style={{ fontSize: 20, fontFamily: "Helvetica-Bold", color: "#1e429f", marginTop: 3 }}>
          {fcfa(paiement.montantFcfa)}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitre}>Situation après ce versement</Text>
        <Champ libelle="Total dû pour l'année" valeur={fcfa(situation.totalDu)} />
        <Champ libelle="Total versé à ce jour" valeur={fcfa(situation.totalPaye)} />
        <Champ libelle="Reste à payer" valeur={fcfa(situation.resteDu)} />
      </View>

      <Text style={{ fontSize: 8, color: "#64748b", marginTop: 6, fontStyle: "italic" }}>
        Ce reçu doit être conservé. Il est exigible en cas de contestation et lors du retrait de
        tout document scolaire.
      </Text>

      <View style={styles.signatures}>
        <Signature role="Le tuteur" nom={paiement.nomPayeur} />
        <Signature role="Le Comptable" />
      </View>
    </DocumentOfficiel>
  );
}

// ===========================================================================
// Certificat de transfert (radiation)
// ===========================================================================

export function CertificatTransfert({
  etablissement,
  eleve,
  scolarite,
  motif,
  etablissementDestination,
  dateSortie,
  numero,
  codeVerification,
}: {
  etablissement: Etablissement;
  eleve: DonneesEleve;
  scolarite: DonneesScolarite;
  motif: string | null;
  etablissementDestination: string | null;
  dateSortie: string | null;
  numero: string;
  codeVerification: string;
}) {
  return (
    <DocumentOfficiel
      etablissement={etablissement}
      titre="Certificat de transfert"
      sousTitre="Valant certificat de radiation"
      numero={numero}
      codeVerification={codeVerification}
    >
      <View style={{ marginTop: 12 }}>
        <Text style={styles.paragraphe}>
          Je soussigné(e),{" "}
          <Text style={styles.gras}>{etablissement.nomProviseur ?? "le Proviseur"}</Text>, Proviseur
          du <Text style={styles.gras}>{etablissement.nom}</Text>, certifie que{" "}
          {civilite(eleve.sexe)} <Text style={styles.gras}>{eleve.nom} {eleve.prenom}</Text>,
          matricule <Text style={styles.gras}>{eleve.matricule}</Text>, {ne(eleve.sexe)} le{" "}
          {dateFr(eleve.dateNaissance)}
          {eleve.lieuNaissance ? ` à ${eleve.lieuNaissance}` : ""}, a fréquenté notre établissement.
        </Text>

        <View style={[styles.section, { marginLeft: 24 }]}>
          <Champ libelle="Dernière classe fréquentée" valeur={scolarite.classeLibelle} />
          <Champ libelle="Année scolaire" valeur={scolarite.anneeLibelle} />
          <Champ libelle="Date de sortie" valeur={dateFr(dateSortie)} />
          {motif ? <Champ libelle="Motif" valeur={motif} /> : null}
          {etablissementDestination ? (
            <Champ libelle="Établissement d'accueil" valeur={etablissementDestination} />
          ) : null}
        </View>

        <Text style={styles.paragraphe}>
          {civilite(eleve.sexe).charAt(0).toUpperCase()}
          {civilite(eleve.sexe).slice(1)} est{" "}
          <Text style={styles.gras}>radié(e) des effectifs</Text> de l&apos;établissement à compter
          de la date ci-dessus, et se trouve libre de toute obligation envers celui-ci.
        </Text>

        <Text style={styles.paragraphe}>
          En foi de quoi le présent certificat lui est délivré pour servir et valoir ce que de droit.
        </Text>
      </View>

      <View style={styles.signatures}>
        <View style={{ width: "45%" }} />
        <Signature role="Le Proviseur" nom={etablissement.nomProviseur} />
      </View>
    </DocumentOfficiel>
  );
}
