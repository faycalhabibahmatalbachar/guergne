import { relations } from "drizzle-orm/relations";
import { anneesScolaires, periodes, niveaux, coefficients, matieres, series, evenementsCalendrier, classes, utilisateurs, sessions, jetonsRafraichissement, tuteurs, enseignants, piecesDossier, eleves, eleveTuteur, salles, emploiDuTemps, creneauxHoraires, changementsClasse, inscriptions, affectations, seances, evaluations, notes, historiqueNotes, appreciationsMatiere, moyennesMatiere, moyennesGenerales, conseilsClasse, bulletins, bulletinsAnnuels, devoirs, ressourcesPedagogiques, absences, retards, sortiesAnticipees, incidents, sanctions, conseilsDiscipline, grillesTarifaires, notesConduite, tranches, echeances, messages, paiements, exonerations, annonces, appareils, notifications, lecturesAnnonces, convocations, journalAudit, documentsEmis, historiqueStatuts, parametres, remplacements, enseignantMatieres, indisponibilites } from "./schema";

export const periodesRelations = relations(periodes, ({one, many}) => ({
	anneesScolaire: one(anneesScolaires, {
		fields: [periodes.anneeId],
		references: [anneesScolaires.id]
	}),
	evaluations: many(evaluations),
	appreciationsMatieres: many(appreciationsMatiere),
	moyennesMatieres: many(moyennesMatiere),
	moyennesGenerales: many(moyennesGenerales),
	conseilsClasses: many(conseilsClasse),
	bulletins: many(bulletins),
	absences: many(absences),
	retards: many(retards),
	incidents: many(incidents),
	sanctions: many(sanctions),
	notesConduites: many(notesConduite),
}));

export const anneesScolairesRelations = relations(anneesScolaires, ({many}) => ({
	periodes: many(periodes),
	coefficients: many(coefficients),
	evenementsCalendriers: many(evenementsCalendrier),
	classes: many(classes),
	emploiDuTemps: many(emploiDuTemps),
	affectations: many(affectations),
	inscriptions: many(inscriptions),
	evaluations: many(evaluations),
	grillesTarifaires: many(grillesTarifaires),
	tranches: many(tranches),
	annonces: many(annonces),
	documentsEmis: many(documentsEmis),
	historiqueStatuts: many(historiqueStatuts),
	indisponibilites: many(indisponibilites),
}));

export const niveauxRelations = relations(niveaux, ({one, many}) => ({
	niveau: one(niveaux, {
		fields: [niveaux.niveauSuivantId],
		references: [niveaux.id],
		relationName: "niveaux_niveauSuivantId_niveaux_id"
	}),
	niveaux: many(niveaux, {
		relationName: "niveaux_niveauSuivantId_niveaux_id"
	}),
	coefficients: many(coefficients),
	evenementsCalendriers: many(evenementsCalendrier),
	classes: many(classes),
	bulletinsAnnuels: many(bulletinsAnnuels),
	grillesTarifaires: many(grillesTarifaires),
	annonces: many(annonces),
}));

export const coefficientsRelations = relations(coefficients, ({one}) => ({
	anneesScolaire: one(anneesScolaires, {
		fields: [coefficients.anneeId],
		references: [anneesScolaires.id]
	}),
	matiere: one(matieres, {
		fields: [coefficients.matiereId],
		references: [matieres.id]
	}),
	niveau: one(niveaux, {
		fields: [coefficients.niveauId],
		references: [niveaux.id]
	}),
	series: one(series, {
		fields: [coefficients.serieId],
		references: [series.id]
	}),
}));

export const matieresRelations = relations(matieres, ({many}) => ({
	coefficients: many(coefficients),
	emploiDuTemps: many(emploiDuTemps),
	affectations: many(affectations),
	seances: many(seances),
	evaluations: many(evaluations),
	appreciationsMatieres: many(appreciationsMatiere),
	moyennesMatieres: many(moyennesMatiere),
	devoirs: many(devoirs),
	ressourcesPedagogiques: many(ressourcesPedagogiques),
	absences: many(absences),
	retards: many(retards),
	enseignantMatieres: many(enseignantMatieres),
}));

export const seriesRelations = relations(series, ({many}) => ({
	coefficients: many(coefficients),
	classes: many(classes),
	grillesTarifaires: many(grillesTarifaires),
}));

export const evenementsCalendrierRelations = relations(evenementsCalendrier, ({one}) => ({
	anneesScolaire: one(anneesScolaires, {
		fields: [evenementsCalendrier.anneeId],
		references: [anneesScolaires.id]
	}),
	niveau: one(niveaux, {
		fields: [evenementsCalendrier.niveauId],
		references: [niveaux.id]
	}),
	class: one(classes, {
		fields: [evenementsCalendrier.classeId],
		references: [classes.id]
	}),
}));

export const classesRelations = relations(classes, ({one, many}) => ({
	evenementsCalendriers: many(evenementsCalendrier),
	anneesScolaire: one(anneesScolaires, {
		fields: [classes.anneeId],
		references: [anneesScolaires.id]
	}),
	niveau: one(niveaux, {
		fields: [classes.niveauId],
		references: [niveaux.id]
	}),
	enseignant: one(enseignants, {
		fields: [classes.professeurPrincipalId],
		references: [enseignants.id]
	}),
	salle: one(salles, {
		fields: [classes.salleId],
		references: [salles.id]
	}),
	series: one(series, {
		fields: [classes.serieId],
		references: [series.id]
	}),
	emploiDuTemps: many(emploiDuTemps),
	changementsClasses_classeDestinationId: many(changementsClasse, {
		relationName: "changementsClasse_classeDestinationId_classes_id"
	}),
	changementsClasses_classeOrigineId: many(changementsClasse, {
		relationName: "changementsClasse_classeOrigineId_classes_id"
	}),
	affectations: many(affectations),
	inscriptions: many(inscriptions),
	seances: many(seances),
	evaluations: many(evaluations),
	conseilsClasses: many(conseilsClasse),
	devoirs: many(devoirs),
	ressourcesPedagogiques: many(ressourcesPedagogiques),
	annonces: many(annonces),
	documentsEmis: many(documentsEmis),
}));

export const sessionsRelations = relations(sessions, ({one}) => ({
	utilisateur: one(utilisateurs, {
		fields: [sessions.utilisateurId],
		references: [utilisateurs.id]
	}),
}));

export const utilisateursRelations = relations(utilisateurs, ({many}) => ({
	sessions: many(sessions),
	jetonsRafraichissements: many(jetonsRafraichissement),
	tuteurs: many(tuteurs),
	enseignants: many(enseignants),
	piecesDossiers: many(piecesDossier),
	changementsClasses: many(changementsClasse),
	inscriptions: many(inscriptions),
	seances: many(seances),
	evaluations: many(evaluations),
	notes: many(notes),
	historiqueNotes: many(historiqueNotes),
	conseilsClasses: many(conseilsClasse),
	bulletins: many(bulletins),
	absences_justifieePar: many(absences, {
		relationName: "absences_justifieePar_utilisateurs_id"
	}),
	absences_saisiePar: many(absences, {
		relationName: "absences_saisiePar_utilisateurs_id"
	}),
	retards: many(retards),
	sortiesAnticipees: many(sortiesAnticipees),
	incidents: many(incidents),
	sanctions: many(sanctions),
	notesConduites: many(notesConduite),
	messages_destinataireId: many(messages, {
		relationName: "messages_destinataireId_utilisateurs_id"
	}),
	messages_expediteurId: many(messages, {
		relationName: "messages_expediteurId_utilisateurs_id"
	}),
	paiements: many(paiements),
	exonerations: many(exonerations),
	annonces: many(annonces),
	appareils: many(appareils),
	notifications: many(notifications),
	lecturesAnnonces: many(lecturesAnnonces),
	convocations: many(convocations),
	journalAudits: many(journalAudit),
	documentsEmis: many(documentsEmis),
	historiqueStatuts: many(historiqueStatuts),
	parametres: many(parametres),
	remplacements: many(remplacements),
}));

export const jetonsRafraichissementRelations = relations(jetonsRafraichissement, ({one, many}) => ({
	jetonsRafraichissement: one(jetonsRafraichissement, {
		fields: [jetonsRafraichissement.remplacePar],
		references: [jetonsRafraichissement.id],
		relationName: "jetonsRafraichissement_remplacePar_jetonsRafraichissement_id"
	}),
	jetonsRafraichissements: many(jetonsRafraichissement, {
		relationName: "jetonsRafraichissement_remplacePar_jetonsRafraichissement_id"
	}),
	utilisateur: one(utilisateurs, {
		fields: [jetonsRafraichissement.utilisateurId],
		references: [utilisateurs.id]
	}),
}));

export const tuteursRelations = relations(tuteurs, ({one, many}) => ({
	utilisateur: one(utilisateurs, {
		fields: [tuteurs.utilisateurId],
		references: [utilisateurs.id]
	}),
	eleveTuteurs: many(eleveTuteur),
	sortiesAnticipees: many(sortiesAnticipees),
	paiements: many(paiements),
	convocations: many(convocations),
}));

export const enseignantsRelations = relations(enseignants, ({one, many}) => ({
	utilisateur: one(utilisateurs, {
		fields: [enseignants.utilisateurId],
		references: [utilisateurs.id]
	}),
	classes: many(classes),
	emploiDuTemps: many(emploiDuTemps),
	affectations: many(affectations),
	seances: many(seances),
	evaluations: many(evaluations),
	appreciationsMatieres: many(appreciationsMatiere),
	devoirs: many(devoirs),
	ressourcesPedagogiques: many(ressourcesPedagogiques),
	remplacements_enseignantAbsentId: many(remplacements, {
		relationName: "remplacements_enseignantAbsentId_enseignants_id"
	}),
	remplacements_enseignantRemplacantId: many(remplacements, {
		relationName: "remplacements_enseignantRemplacantId_enseignants_id"
	}),
	enseignantMatieres: many(enseignantMatieres),
	indisponibilites: many(indisponibilites),
}));

export const piecesDossierRelations = relations(piecesDossier, ({one}) => ({
	utilisateur: one(utilisateurs, {
		fields: [piecesDossier.deposePar],
		references: [utilisateurs.id]
	}),
	eleve: one(eleves, {
		fields: [piecesDossier.eleveId],
		references: [eleves.id]
	}),
}));

export const elevesRelations = relations(eleves, ({many}) => ({
	piecesDossiers: many(piecesDossier),
	eleveTuteurs: many(eleveTuteur),
	inscriptions: many(inscriptions),
	messages: many(messages),
	notifications: many(notifications),
	convocations: many(convocations),
	documentsEmis: many(documentsEmis),
	historiqueStatuts: many(historiqueStatuts),
}));

export const eleveTuteurRelations = relations(eleveTuteur, ({one}) => ({
	eleve: one(eleves, {
		fields: [eleveTuteur.eleveId],
		references: [eleves.id]
	}),
	tuteur: one(tuteurs, {
		fields: [eleveTuteur.tuteurId],
		references: [tuteurs.id]
	}),
}));

export const sallesRelations = relations(salles, ({many}) => ({
	classes: many(classes),
	emploiDuTemps: many(emploiDuTemps),
}));

export const emploiDuTempsRelations = relations(emploiDuTemps, ({one, many}) => ({
	anneesScolaire: one(anneesScolaires, {
		fields: [emploiDuTemps.anneeId],
		references: [anneesScolaires.id]
	}),
	class: one(classes, {
		fields: [emploiDuTemps.classeId],
		references: [classes.id]
	}),
	creneauxHoraire: one(creneauxHoraires, {
		fields: [emploiDuTemps.creneauId],
		references: [creneauxHoraires.id]
	}),
	enseignant: one(enseignants, {
		fields: [emploiDuTemps.enseignantId],
		references: [enseignants.id]
	}),
	matiere: one(matieres, {
		fields: [emploiDuTemps.matiereId],
		references: [matieres.id]
	}),
	salle: one(salles, {
		fields: [emploiDuTemps.salleId],
		references: [salles.id]
	}),
	seances: many(seances),
	remplacements: many(remplacements),
}));

export const creneauxHorairesRelations = relations(creneauxHoraires, ({many}) => ({
	emploiDuTemps: many(emploiDuTemps),
	seances: many(seances),
	absences: many(absences),
	indisponibilites: many(indisponibilites),
}));

export const changementsClasseRelations = relations(changementsClasse, ({one}) => ({
	class_classeDestinationId: one(classes, {
		fields: [changementsClasse.classeDestinationId],
		references: [classes.id],
		relationName: "changementsClasse_classeDestinationId_classes_id"
	}),
	class_classeOrigineId: one(classes, {
		fields: [changementsClasse.classeOrigineId],
		references: [classes.id],
		relationName: "changementsClasse_classeOrigineId_classes_id"
	}),
	utilisateur: one(utilisateurs, {
		fields: [changementsClasse.decidePar],
		references: [utilisateurs.id]
	}),
	inscription: one(inscriptions, {
		fields: [changementsClasse.inscriptionId],
		references: [inscriptions.id]
	}),
}));

export const inscriptionsRelations = relations(inscriptions, ({one, many}) => ({
	changementsClasses: many(changementsClasse),
	anneesScolaire: one(anneesScolaires, {
		fields: [inscriptions.anneeId],
		references: [anneesScolaires.id]
	}),
	class: one(classes, {
		fields: [inscriptions.classeId],
		references: [classes.id]
	}),
	eleve: one(eleves, {
		fields: [inscriptions.eleveId],
		references: [eleves.id]
	}),
	inscription: one(inscriptions, {
		fields: [inscriptions.inscriptionPrecedenteId],
		references: [inscriptions.id],
		relationName: "inscriptions_inscriptionPrecedenteId_inscriptions_id"
	}),
	inscriptions: many(inscriptions, {
		relationName: "inscriptions_inscriptionPrecedenteId_inscriptions_id"
	}),
	utilisateur: one(utilisateurs, {
		fields: [inscriptions.valideePar],
		references: [utilisateurs.id]
	}),
	notes: many(notes),
	appreciationsMatieres: many(appreciationsMatiere),
	moyennesMatieres: many(moyennesMatiere),
	moyennesGenerales: many(moyennesGenerales),
	bulletins: many(bulletins),
	bulletinsAnnuels: many(bulletinsAnnuels),
	absences: many(absences),
	retards: many(retards),
	sortiesAnticipees: many(sortiesAnticipees),
	incidents: many(incidents),
	sanctions: many(sanctions),
	conseilsDisciplines: many(conseilsDiscipline),
	notesConduites: many(notesConduite),
	echeances: many(echeances),
	paiements: many(paiements),
	exonerations: many(exonerations),
}));

export const affectationsRelations = relations(affectations, ({one}) => ({
	anneesScolaire: one(anneesScolaires, {
		fields: [affectations.anneeId],
		references: [anneesScolaires.id]
	}),
	class: one(classes, {
		fields: [affectations.classeId],
		references: [classes.id]
	}),
	enseignant: one(enseignants, {
		fields: [affectations.enseignantId],
		references: [enseignants.id]
	}),
	matiere: one(matieres, {
		fields: [affectations.matiereId],
		references: [matieres.id]
	}),
}));

export const seancesRelations = relations(seances, ({one, many}) => ({
	utilisateur: one(utilisateurs, {
		fields: [seances.appelPar],
		references: [utilisateurs.id]
	}),
	class: one(classes, {
		fields: [seances.classeId],
		references: [classes.id]
	}),
	creneauxHoraire: one(creneauxHoraires, {
		fields: [seances.creneauId],
		references: [creneauxHoraires.id]
	}),
	emploiDuTemp: one(emploiDuTemps, {
		fields: [seances.emploiDuTempsId],
		references: [emploiDuTemps.id]
	}),
	enseignant: one(enseignants, {
		fields: [seances.enseignantId],
		references: [enseignants.id]
	}),
	matiere: one(matieres, {
		fields: [seances.matiereId],
		references: [matieres.id]
	}),
	absences: many(absences),
	remplacements: many(remplacements),
}));

export const evaluationsRelations = relations(evaluations, ({one, many}) => ({
	anneesScolaire: one(anneesScolaires, {
		fields: [evaluations.anneeId],
		references: [anneesScolaires.id]
	}),
	class: one(classes, {
		fields: [evaluations.classeId],
		references: [classes.id]
	}),
	utilisateur: one(utilisateurs, {
		fields: [evaluations.creePar],
		references: [utilisateurs.id]
	}),
	enseignant: one(enseignants, {
		fields: [evaluations.enseignantId],
		references: [enseignants.id]
	}),
	matiere: one(matieres, {
		fields: [evaluations.matiereId],
		references: [matieres.id]
	}),
	periode: one(periodes, {
		fields: [evaluations.periodeId],
		references: [periodes.id]
	}),
	notes: many(notes),
}));

export const notesRelations = relations(notes, ({one, many}) => ({
	evaluation: one(evaluations, {
		fields: [notes.evaluationId],
		references: [evaluations.id]
	}),
	inscription: one(inscriptions, {
		fields: [notes.inscriptionId],
		references: [inscriptions.id]
	}),
	utilisateur: one(utilisateurs, {
		fields: [notes.saisiePar],
		references: [utilisateurs.id]
	}),
	historiqueNotes: many(historiqueNotes),
}));

export const historiqueNotesRelations = relations(historiqueNotes, ({one}) => ({
	utilisateur: one(utilisateurs, {
		fields: [historiqueNotes.modifiePar],
		references: [utilisateurs.id]
	}),
	note: one(notes, {
		fields: [historiqueNotes.noteId],
		references: [notes.id]
	}),
}));

export const appreciationsMatiereRelations = relations(appreciationsMatiere, ({one}) => ({
	enseignant: one(enseignants, {
		fields: [appreciationsMatiere.enseignantId],
		references: [enseignants.id]
	}),
	inscription: one(inscriptions, {
		fields: [appreciationsMatiere.inscriptionId],
		references: [inscriptions.id]
	}),
	matiere: one(matieres, {
		fields: [appreciationsMatiere.matiereId],
		references: [matieres.id]
	}),
	periode: one(periodes, {
		fields: [appreciationsMatiere.periodeId],
		references: [periodes.id]
	}),
}));

export const moyennesMatiereRelations = relations(moyennesMatiere, ({one}) => ({
	inscription: one(inscriptions, {
		fields: [moyennesMatiere.inscriptionId],
		references: [inscriptions.id]
	}),
	matiere: one(matieres, {
		fields: [moyennesMatiere.matiereId],
		references: [matieres.id]
	}),
	periode: one(periodes, {
		fields: [moyennesMatiere.periodeId],
		references: [periodes.id]
	}),
}));

export const moyennesGeneralesRelations = relations(moyennesGenerales, ({one}) => ({
	inscription: one(inscriptions, {
		fields: [moyennesGenerales.inscriptionId],
		references: [inscriptions.id]
	}),
	periode: one(periodes, {
		fields: [moyennesGenerales.periodeId],
		references: [periodes.id]
	}),
}));

export const conseilsClasseRelations = relations(conseilsClasse, ({one, many}) => ({
	class: one(classes, {
		fields: [conseilsClasse.classeId],
		references: [classes.id]
	}),
	periode: one(periodes, {
		fields: [conseilsClasse.periodeId],
		references: [periodes.id]
	}),
	utilisateur: one(utilisateurs, {
		fields: [conseilsClasse.validePar],
		references: [utilisateurs.id]
	}),
	bulletins: many(bulletins),
}));

export const bulletinsRelations = relations(bulletins, ({one}) => ({
	conseilsClasse: one(conseilsClasse, {
		fields: [bulletins.conseilClasseId],
		references: [conseilsClasse.id]
	}),
	inscription: one(inscriptions, {
		fields: [bulletins.inscriptionId],
		references: [inscriptions.id]
	}),
	periode: one(periodes, {
		fields: [bulletins.periodeId],
		references: [periodes.id]
	}),
	utilisateur: one(utilisateurs, {
		fields: [bulletins.publiePar],
		references: [utilisateurs.id]
	}),
}));

export const bulletinsAnnuelsRelations = relations(bulletinsAnnuels, ({one}) => ({
	inscription: one(inscriptions, {
		fields: [bulletinsAnnuels.inscriptionId],
		references: [inscriptions.id]
	}),
	niveau: one(niveaux, {
		fields: [bulletinsAnnuels.niveauSuivantId],
		references: [niveaux.id]
	}),
}));

export const devoirsRelations = relations(devoirs, ({one}) => ({
	class: one(classes, {
		fields: [devoirs.classeId],
		references: [classes.id]
	}),
	enseignant: one(enseignants, {
		fields: [devoirs.enseignantId],
		references: [enseignants.id]
	}),
	matiere: one(matieres, {
		fields: [devoirs.matiereId],
		references: [matieres.id]
	}),
}));

export const ressourcesPedagogiquesRelations = relations(ressourcesPedagogiques, ({one}) => ({
	class: one(classes, {
		fields: [ressourcesPedagogiques.classeId],
		references: [classes.id]
	}),
	enseignant: one(enseignants, {
		fields: [ressourcesPedagogiques.enseignantId],
		references: [enseignants.id]
	}),
	matiere: one(matieres, {
		fields: [ressourcesPedagogiques.matiereId],
		references: [matieres.id]
	}),
}));

export const absencesRelations = relations(absences, ({one}) => ({
	creneauxHoraire: one(creneauxHoraires, {
		fields: [absences.creneauId],
		references: [creneauxHoraires.id]
	}),
	inscription: one(inscriptions, {
		fields: [absences.inscriptionId],
		references: [inscriptions.id]
	}),
	utilisateur_justifieePar: one(utilisateurs, {
		fields: [absences.justifieePar],
		references: [utilisateurs.id],
		relationName: "absences_justifieePar_utilisateurs_id"
	}),
	matiere: one(matieres, {
		fields: [absences.matiereId],
		references: [matieres.id]
	}),
	periode: one(periodes, {
		fields: [absences.periodeId],
		references: [periodes.id]
	}),
	utilisateur_saisiePar: one(utilisateurs, {
		fields: [absences.saisiePar],
		references: [utilisateurs.id],
		relationName: "absences_saisiePar_utilisateurs_id"
	}),
	seance: one(seances, {
		fields: [absences.seanceId],
		references: [seances.id]
	}),
}));

export const retardsRelations = relations(retards, ({one}) => ({
	inscription: one(inscriptions, {
		fields: [retards.inscriptionId],
		references: [inscriptions.id]
	}),
	matiere: one(matieres, {
		fields: [retards.matiereId],
		references: [matieres.id]
	}),
	periode: one(periodes, {
		fields: [retards.periodeId],
		references: [periodes.id]
	}),
	utilisateur: one(utilisateurs, {
		fields: [retards.saisiePar],
		references: [utilisateurs.id]
	}),
}));

export const sortiesAnticipeesRelations = relations(sortiesAnticipees, ({one}) => ({
	utilisateur: one(utilisateurs, {
		fields: [sortiesAnticipees.autorisePar],
		references: [utilisateurs.id]
	}),
	inscription: one(inscriptions, {
		fields: [sortiesAnticipees.inscriptionId],
		references: [inscriptions.id]
	}),
	tuteur: one(tuteurs, {
		fields: [sortiesAnticipees.recupereParTuteurId],
		references: [tuteurs.id]
	}),
}));

export const incidentsRelations = relations(incidents, ({one, many}) => ({
	inscription: one(inscriptions, {
		fields: [incidents.inscriptionId],
		references: [inscriptions.id]
	}),
	periode: one(periodes, {
		fields: [incidents.periodeId],
		references: [periodes.id]
	}),
	utilisateur: one(utilisateurs, {
		fields: [incidents.signalePar],
		references: [utilisateurs.id]
	}),
	sanctions: many(sanctions),
}));

export const sanctionsRelations = relations(sanctions, ({one, many}) => ({
	incident: one(incidents, {
		fields: [sanctions.incidentId],
		references: [incidents.id]
	}),
	inscription: one(inscriptions, {
		fields: [sanctions.inscriptionId],
		references: [inscriptions.id]
	}),
	periode: one(periodes, {
		fields: [sanctions.periodeId],
		references: [periodes.id]
	}),
	utilisateur: one(utilisateurs, {
		fields: [sanctions.prononceePar],
		references: [utilisateurs.id]
	}),
	conseilsDisciplines: many(conseilsDiscipline),
	historiqueStatuts: many(historiqueStatuts),
}));

export const conseilsDisciplineRelations = relations(conseilsDiscipline, ({one}) => ({
	inscription: one(inscriptions, {
		fields: [conseilsDiscipline.inscriptionId],
		references: [inscriptions.id]
	}),
	sanction: one(sanctions, {
		fields: [conseilsDiscipline.sanctionId],
		references: [sanctions.id]
	}),
}));

export const grillesTarifairesRelations = relations(grillesTarifaires, ({one}) => ({
	anneesScolaire: one(anneesScolaires, {
		fields: [grillesTarifaires.anneeId],
		references: [anneesScolaires.id]
	}),
	niveau: one(niveaux, {
		fields: [grillesTarifaires.niveauId],
		references: [niveaux.id]
	}),
	series: one(series, {
		fields: [grillesTarifaires.serieId],
		references: [series.id]
	}),
}));

export const notesConduiteRelations = relations(notesConduite, ({one}) => ({
	utilisateur: one(utilisateurs, {
		fields: [notesConduite.attribueePar],
		references: [utilisateurs.id]
	}),
	inscription: one(inscriptions, {
		fields: [notesConduite.inscriptionId],
		references: [inscriptions.id]
	}),
	periode: one(periodes, {
		fields: [notesConduite.periodeId],
		references: [periodes.id]
	}),
}));

export const tranchesRelations = relations(tranches, ({one, many}) => ({
	anneesScolaire: one(anneesScolaires, {
		fields: [tranches.anneeId],
		references: [anneesScolaires.id]
	}),
	echeances: many(echeances),
}));

export const echeancesRelations = relations(echeances, ({one, many}) => ({
	inscription: one(inscriptions, {
		fields: [echeances.inscriptionId],
		references: [inscriptions.id]
	}),
	tranch: one(tranches, {
		fields: [echeances.trancheId],
		references: [tranches.id]
	}),
	paiements: many(paiements),
}));

export const messagesRelations = relations(messages, ({one, many}) => ({
	utilisateur_destinataireId: one(utilisateurs, {
		fields: [messages.destinataireId],
		references: [utilisateurs.id],
		relationName: "messages_destinataireId_utilisateurs_id"
	}),
	eleve: one(eleves, {
		fields: [messages.eleveId],
		references: [eleves.id]
	}),
	utilisateur_expediteurId: one(utilisateurs, {
		fields: [messages.expediteurId],
		references: [utilisateurs.id],
		relationName: "messages_expediteurId_utilisateurs_id"
	}),
	message: one(messages, {
		fields: [messages.messageParentId],
		references: [messages.id],
		relationName: "messages_messageParentId_messages_id"
	}),
	messages: many(messages, {
		relationName: "messages_messageParentId_messages_id"
	}),
}));

export const paiementsRelations = relations(paiements, ({one, many}) => ({
	paiement: one(paiements, {
		fields: [paiements.annulePaiementId],
		references: [paiements.id],
		relationName: "paiements_annulePaiementId_paiements_id"
	}),
	paiements: many(paiements, {
		relationName: "paiements_annulePaiementId_paiements_id"
	}),
	echeance: one(echeances, {
		fields: [paiements.echeanceId],
		references: [echeances.id]
	}),
	utilisateur: one(utilisateurs, {
		fields: [paiements.encaissePar],
		references: [utilisateurs.id]
	}),
	inscription: one(inscriptions, {
		fields: [paiements.inscriptionId],
		references: [inscriptions.id]
	}),
	tuteur: one(tuteurs, {
		fields: [paiements.payeParTuteurId],
		references: [tuteurs.id]
	}),
}));

export const exonerationsRelations = relations(exonerations, ({one}) => ({
	utilisateur: one(utilisateurs, {
		fields: [exonerations.accordePar],
		references: [utilisateurs.id]
	}),
	inscription: one(inscriptions, {
		fields: [exonerations.inscriptionId],
		references: [inscriptions.id]
	}),
}));

export const annoncesRelations = relations(annonces, ({one, many}) => ({
	anneesScolaire: one(anneesScolaires, {
		fields: [annonces.anneeId],
		references: [anneesScolaires.id]
	}),
	class: one(classes, {
		fields: [annonces.classeId],
		references: [classes.id]
	}),
	niveau: one(niveaux, {
		fields: [annonces.niveauId],
		references: [niveaux.id]
	}),
	utilisateur: one(utilisateurs, {
		fields: [annonces.publieePar],
		references: [utilisateurs.id]
	}),
	lecturesAnnonces: many(lecturesAnnonces),
}));

export const appareilsRelations = relations(appareils, ({one}) => ({
	utilisateur: one(utilisateurs, {
		fields: [appareils.utilisateurId],
		references: [utilisateurs.id]
	}),
}));

export const notificationsRelations = relations(notifications, ({one}) => ({
	utilisateur: one(utilisateurs, {
		fields: [notifications.destinataireId],
		references: [utilisateurs.id]
	}),
	eleve: one(eleves, {
		fields: [notifications.eleveId],
		references: [eleves.id]
	}),
}));

export const lecturesAnnoncesRelations = relations(lecturesAnnonces, ({one}) => ({
	annonce: one(annonces, {
		fields: [lecturesAnnonces.annonceId],
		references: [annonces.id]
	}),
	utilisateur: one(utilisateurs, {
		fields: [lecturesAnnonces.utilisateurId],
		references: [utilisateurs.id]
	}),
}));

export const convocationsRelations = relations(convocations, ({one}) => ({
	utilisateur: one(utilisateurs, {
		fields: [convocations.convoquePar],
		references: [utilisateurs.id]
	}),
	eleve: one(eleves, {
		fields: [convocations.eleveId],
		references: [eleves.id]
	}),
	tuteur: one(tuteurs, {
		fields: [convocations.tuteurId],
		references: [tuteurs.id]
	}),
}));

export const journalAuditRelations = relations(journalAudit, ({one}) => ({
	utilisateur: one(utilisateurs, {
		fields: [journalAudit.utilisateurId],
		references: [utilisateurs.id]
	}),
}));

export const documentsEmisRelations = relations(documentsEmis, ({one}) => ({
	anneesScolaire: one(anneesScolaires, {
		fields: [documentsEmis.anneeId],
		references: [anneesScolaires.id]
	}),
	class: one(classes, {
		fields: [documentsEmis.classeId],
		references: [classes.id]
	}),
	eleve: one(eleves, {
		fields: [documentsEmis.eleveId],
		references: [eleves.id]
	}),
	utilisateur: one(utilisateurs, {
		fields: [documentsEmis.emisPar],
		references: [utilisateurs.id]
	}),
}));

export const historiqueStatutsRelations = relations(historiqueStatuts, ({one}) => ({
	anneesScolaire: one(anneesScolaires, {
		fields: [historiqueStatuts.anneeId],
		references: [anneesScolaires.id]
	}),
	utilisateur: one(utilisateurs, {
		fields: [historiqueStatuts.decidePar],
		references: [utilisateurs.id]
	}),
	eleve: one(eleves, {
		fields: [historiqueStatuts.eleveId],
		references: [eleves.id]
	}),
	sanction: one(sanctions, {
		fields: [historiqueStatuts.sanctionId],
		references: [sanctions.id]
	}),
}));

export const parametresRelations = relations(parametres, ({one}) => ({
	utilisateur: one(utilisateurs, {
		fields: [parametres.modifiePar],
		references: [utilisateurs.id]
	}),
}));

export const remplacementsRelations = relations(remplacements, ({one}) => ({
	utilisateur: one(utilisateurs, {
		fields: [remplacements.decidePar],
		references: [utilisateurs.id]
	}),
	emploiDuTemp: one(emploiDuTemps, {
		fields: [remplacements.emploiDuTempsId],
		references: [emploiDuTemps.id]
	}),
	enseignant_enseignantAbsentId: one(enseignants, {
		fields: [remplacements.enseignantAbsentId],
		references: [enseignants.id],
		relationName: "remplacements_enseignantAbsentId_enseignants_id"
	}),
	enseignant_enseignantRemplacantId: one(enseignants, {
		fields: [remplacements.enseignantRemplacantId],
		references: [enseignants.id],
		relationName: "remplacements_enseignantRemplacantId_enseignants_id"
	}),
	seance: one(seances, {
		fields: [remplacements.seanceId],
		references: [seances.id]
	}),
}));

export const enseignantMatieresRelations = relations(enseignantMatieres, ({one}) => ({
	enseignant: one(enseignants, {
		fields: [enseignantMatieres.enseignantId],
		references: [enseignants.id]
	}),
	matiere: one(matieres, {
		fields: [enseignantMatieres.matiereId],
		references: [matieres.id]
	}),
}));

export const indisponibilitesRelations = relations(indisponibilites, ({one}) => ({
	anneesScolaire: one(anneesScolaires, {
		fields: [indisponibilites.anneeId],
		references: [anneesScolaires.id]
	}),
	creneauxHoraire: one(creneauxHoraires, {
		fields: [indisponibilites.creneauId],
		references: [creneauxHoraires.id]
	}),
	enseignant: one(enseignants, {
		fields: [indisponibilites.enseignantId],
		references: [enseignants.id]
	}),
}));