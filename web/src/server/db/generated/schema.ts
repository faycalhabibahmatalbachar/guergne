import { pgTable, text, timestamp, check, boolean, numeric, integer, uniqueIndex, unique, uuid, date, index, foreignKey, smallint, inet, char, time, jsonb, bigserial, pgView, bigint, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const canalNotification = pgEnum("canal_notification", ['PUSH', 'SMS', 'EMAIL', 'IN_APP'])
export const cibleDiffusion = pgEnum("cible_diffusion", ['TOUS', 'NIVEAU', 'CLASSE', 'ELEVE', 'ENSEIGNANTS', 'PERSONNEL'])
export const cycleScolaire = pgEnum("cycle_scolaire", ['COLLEGE', 'LYCEE'])
export const decisionFinAnnee = pgEnum("decision_fin_annee", ['ADMIS', 'ADMIS_CONDITION', 'REDOUBLE', 'EXCLU', 'REORIENTE', 'EN_ATTENTE'])
export const graviteIncident = pgEnum("gravite_incident", ['MINEURE', 'MOYENNE', 'GRAVE', 'TRES_GRAVE'])
export const lienParente = pgEnum("lien_parente", ['PERE', 'MERE', 'TUTEUR', 'ONCLE', 'TANTE', 'GRAND_PARENT', 'FRERE_SOEUR', 'AUTRE'])
export const mentionBulletin = pgEnum("mention_bulletin", ['FELICITATIONS', 'ENCOURAGEMENTS', 'TABLEAU_HONNEUR', 'AVERTISSEMENT_TRAVAIL', 'AVERTISSEMENT_CONDUITE', 'BLAME', 'AUCUNE'])
export const modePaiement = pgEnum("mode_paiement", ['ESPECES', 'MOBILE_MONEY', 'VIREMENT', 'CHEQUE', 'AUTRE'])
export const motifExoneration = pgEnum("motif_exoneration", ['BOURSE', 'FRATRIE', 'CAS_SOCIAL', 'ENFANT_PERSONNEL', 'MERITE', 'AUTRE'])
export const natureFrais = pgEnum("nature_frais", ['INSCRIPTION', 'REINSCRIPTION', 'SCOLARITE', 'APE', 'TENUE', 'EXAMEN', 'FOURNITURES', 'TRANSPORT', 'CANTINE', 'AUTRE'])
export const roleUtilisateur = pgEnum("role_utilisateur", ['SUPER_ADMIN', 'DIRECTION', 'CENSEUR', 'SURVEILLANT', 'SECRETARIAT', 'COMPTABLE', 'ENSEIGNANT', 'PARENT', 'ELEVE'])
export const sexeType = pgEnum("sexe_type", ['M', 'F'])
export const statutDossier = pgEnum("statut_dossier", ['BROUILLON', 'A_VALIDER', 'VALIDE', 'INCOMPLET', 'REFUSE'])
export const statutEcheance = pgEnum("statut_echeance", ['A_PAYER', 'PARTIEL', 'PAYE', 'EN_RETARD', 'EXONERE'])
export const statutEleve = pgEnum("statut_eleve", ['CANDIDAT', 'PRE_INSCRIT', 'INSCRIT', 'SUSPENDU_DISCIPLINE', 'SUSPENDU_IMPAYE', 'EXCLU', 'TRANSFERE', 'ABANDON', 'DIPLOME', 'ARCHIVE'])
export const statutEnseignant = pgEnum("statut_enseignant", ['PERMANENT', 'CONTRACTUEL', 'VACATAIRE', 'STAGIAIRE', 'SUSPENDU', 'RETRAITE', 'DEMISSIONNAIRE'])
export const statutEnvoi = pgEnum("statut_envoi", ['EN_ATTENTE', 'ENVOYE', 'ECHOUE', 'LU'])
export const statutJustification = pgEnum("statut_justification", ['NON_JUSTIFIEE', 'JUSTIFIEE', 'EN_ATTENTE'])
export const statutNote = pgEnum("statut_note", ['NOTEE', 'ABSENT', 'ABSENT_ZERO', 'DISPENSE', 'NON_RENDU'])
export const typeAbsence = pgEnum("type_absence", ['COURS', 'JOURNEE', 'DEMI_JOURNEE'])
export const typeDocument = pgEnum("type_document", ['CERTIFICAT_SCOLARITE', 'CERTIFICAT_TRANSFERT', 'ATTESTATION_FREQUENTATION', 'CARTE_SCOLAIRE', 'BULLETIN', 'BULLETIN_ANNUEL', 'RECU_PAIEMENT', 'CONVOCATION', 'NOTIFICATION_SANCTION', 'PV_CONSEIL_CLASSE', 'PV_CONSEIL_DISCIPLINE', 'LISTE_APPEL', 'LISTE_EXAMEN', 'PALMARES', 'AUTRE'])
export const typeEvaluation = pgEnum("type_evaluation", ['INTERROGATION', 'DEVOIR', 'COMPOSITION', 'EXAMEN_BLANC', 'TP', 'ORAL'])
export const typeEvenement = pgEnum("type_evenement", ['VACANCES', 'FERIE', 'COMPOSITION', 'EXAMEN_BLANC', 'REUNION_PARENTS', 'CONSEIL_CLASSE', 'RENTREE', 'AUTRE'])
export const typeInscription = pgEnum("type_inscription", ['INSCRIPTION', 'REINSCRIPTION', 'TRANSFERT_ENTRANT'])
export const typeNotification = pgEnum("type_notification", ['ABSENCE', 'RETARD', 'NOTE_PUBLIEE', 'BULLETIN_PUBLIE', 'INCIDENT', 'SANCTION', 'ECHEANCE_PAIEMENT', 'PAIEMENT_RECU', 'ANNONCE', 'CONVOCATION', 'CHANGEMENT_STATUT', 'DEVOIR', 'AUTRE'])
export const typePeriode = pgEnum("type_periode", ['TRIMESTRE', 'SEMESTRE'])
export const typePiece = pgEnum("type_piece", ['ACTE_NAISSANCE', 'PHOTO', 'BULLETIN_ANTERIEUR', 'CERTIFICAT_TRANSFERT', 'CERTIFICAT_MEDICAL', 'PIECE_IDENTITE_TUTEUR', 'JUSTIFICATIF_ABSENCE', 'AUTRE'])
export const typeSalle = pgEnum("type_salle", ['CLASSE', 'LABORATOIRE', 'INFORMATIQUE', 'AMPHI', 'AUTRE'])
export const typeSanction = pgEnum("type_sanction", ['AVERTISSEMENT_ORAL', 'AVERTISSEMENT_ECRIT', 'RETENUE', 'TRAVAIL_INTERET_GENERAL', 'EXCLUSION_COURS', 'EXCLUSION_TEMPORAIRE', 'CONSEIL_DISCIPLINE', 'EXCLUSION_DEFINITIVE'])


export const migrations = pgTable("_migrations", {
	nom: text().primaryKey().notNull(),
	appliqueLe: timestamp("applique_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const etablissement = pgTable("etablissement", {
	id: boolean().default(true).primaryKey().notNull(),
	nom: text().default('Lycée Guergné La Renaissance').notNull(),
	sigle: text().default('LGR').notNull(),
	adresse: text(),
	ville: text().default('N\'Djamena'),
	pays: text().default('Tchad'),
	telephone: text(),
	email: text(),
	siteWeb: text("site_web"),
	logoUrl: text("logo_url"),
	devise: text().default('FCFA').notNull(),
	ministereTutelle: text("ministere_tutelle").default('Ministère de l\'Éducation Nationale'),
	autorisationNumero: text("autorisation_numero"),
	nomProviseur: text("nom_proviseur"),
	nomCenseur: text("nom_censeur"),
	noteMaximale: numeric("note_maximale", { precision: 5, scale:  2 }).default('20.00').notNull(),
	moyennePassage: numeric("moyenne_passage", { precision: 5, scale:  2 }).default('10.00').notNull(),
	seuilAlerteAbsenceHeures: integer("seuil_alerte_absence_heures").default(12).notNull(),
	bloquerBulletinSiImpaye: boolean("bloquer_bulletin_si_impaye").default(false).notNull(),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	modifieLe: timestamp("modifie_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	check("etablissement_id_check", sql`CHECK (id)`),
]);

export const anneesScolaires = pgTable("annees_scolaires", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	libelle: text().notNull(),
	dateDebut: date("date_debut").notNull(),
	dateFin: date("date_fin").notNull(),
	typePeriode: typePeriode("type_periode").default('TRIMESTRE').notNull(),
	estCourante: boolean("est_courante").default(false).notNull(),
	estCloturee: boolean("est_cloturee").default(false).notNull(),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("uq_annee_courante").using("btree", table.estCourante.asc().nullsLast().op("bool_ops")).where(sql`est_courante`),
	unique("annees_scolaires_libelle_key").on(table.libelle),
	check("chk_annee_dates", sql`date_fin > date_debut`),
]);

export const periodes = pgTable("periodes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	anneeId: uuid("annee_id").notNull(),
	numero: smallint().notNull(),
	libelle: text().notNull(),
	dateDebut: date("date_debut").notNull(),
	dateFin: date("date_fin").notNull(),
	saisieOuverte: boolean("saisie_ouverte").default(true).notNull(),
	dateClotureSaisie: date("date_cloture_saisie"),
	estVerrouillee: boolean("est_verrouillee").default(false).notNull(),
	verrouilleeLe: timestamp("verrouillee_le", { withTimezone: true, mode: 'string' }),
	verrouilleePar: uuid("verrouillee_par"),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_periodes_annee").using("btree", table.anneeId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.anneeId],
			foreignColumns: [anneesScolaires.id],
			name: "periodes_annee_id_fkey"
		}).onDelete("cascade"),
	unique("periodes_annee_id_numero_key").on(table.anneeId, table.numero),
	check("chk_periode_dates", sql`date_fin > date_debut`),
]);

export const niveaux = pgTable("niveaux", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: text().notNull(),
	libelle: text().notNull(),
	cycle: cycleScolaire().notNull(),
	ordre: smallint().notNull(),
	niveauSuivantId: uuid("niveau_suivant_id"),
	seriesApplicables: boolean("series_applicables").default(false).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.niveauSuivantId],
			foreignColumns: [table.id],
			name: "niveaux_niveau_suivant_id_fkey"
		}),
	unique("niveaux_code_key").on(table.code),
	unique("niveaux_ordre_key").on(table.ordre),
]);

export const coefficients = pgTable("coefficients", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	anneeId: uuid("annee_id").notNull(),
	matiereId: uuid("matiere_id").notNull(),
	niveauId: uuid("niveau_id").notNull(),
	serieId: uuid("serie_id"),
	coefficient: numeric({ precision: 4, scale:  2 }).notNull(),
	poidsInterro: numeric("poids_interro", { precision: 4, scale:  2 }).default('1.00').notNull(),
	poidsDevoir: numeric("poids_devoir", { precision: 4, scale:  2 }).default('1.00').notNull(),
	poidsComposition: numeric("poids_composition", { precision: 4, scale:  2 }).default('2.00').notNull(),
	obligatoire: boolean().default(true).notNull(),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	volumeHoraire: numeric("volume_horaire", { precision: 4, scale:  1 }),
}, (table) => [
	index("idx_coefficients_lookup").using("btree", table.anneeId.asc().nullsLast().op("uuid_ops"), table.niveauId.asc().nullsLast().op("uuid_ops"), table.serieId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("uq_coefficient").using("btree", sql`annee_id`, sql`matiere_id`, sql`niveau_id`, sql`COALESCE(serie_id, '00000000-0000-0000-0000-000000000000'::uuid`),
	foreignKey({
			columns: [table.anneeId],
			foreignColumns: [anneesScolaires.id],
			name: "coefficients_annee_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.matiereId],
			foreignColumns: [matieres.id],
			name: "coefficients_matiere_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.niveauId],
			foreignColumns: [niveaux.id],
			name: "coefficients_niveau_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.serieId],
			foreignColumns: [series.id],
			name: "coefficients_serie_id_fkey"
		}).onDelete("cascade"),
	check("coefficients_coefficient_check", sql`coefficient > (0)::numeric`),
]);

export const matieres = pgTable("matieres", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: text().notNull(),
	libelle: text().notNull(),
	libelleCourt: text("libelle_court"),
	couleur: text().default('#64748b'),
	ordreBulletin: smallint("ordre_bulletin").default(0).notNull(),
	active: boolean().default(true).notNull(),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("matieres_code_key").on(table.code),
]);

export const series = pgTable("series", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: text().notNull(),
	libelle: text().notNull(),
	description: text(),
	ordre: smallint().default(0).notNull(),
	active: boolean().default(true).notNull(),
}, (table) => [
	unique("series_code_key").on(table.code),
]);

export const salles = pgTable("salles", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: text().notNull(),
	libelle: text().notNull(),
	type: typeSalle().default('CLASSE').notNull(),
	capacite: smallint(),
	batiment: text(),
	active: boolean().default(true).notNull(),
}, (table) => [
	unique("salles_code_key").on(table.code),
	check("salles_capacite_check", sql`capacite > 0`),
]);

export const evenementsCalendrier = pgTable("evenements_calendrier", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	anneeId: uuid("annee_id").notNull(),
	type: typeEvenement().notNull(),
	titre: text().notNull(),
	description: text(),
	dateDebut: date("date_debut").notNull(),
	dateFin: date("date_fin").notNull(),
	niveauId: uuid("niveau_id"),
	classeId: uuid("classe_id"),
	visibleParents: boolean("visible_parents").default(true).notNull(),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_evenements_annee_dates").using("btree", table.anneeId.asc().nullsLast().op("date_ops"), table.dateDebut.asc().nullsLast().op("uuid_ops"), table.dateFin.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.anneeId],
			foreignColumns: [anneesScolaires.id],
			name: "evenements_calendrier_annee_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.niveauId],
			foreignColumns: [niveaux.id],
			name: "evenements_calendrier_niveau_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.classeId],
			foreignColumns: [classes.id],
			name: "fk_evenement_classe"
		}).onDelete("cascade"),
	check("chk_evt_dates", sql`date_fin >= date_debut`),
]);

export const utilisateurs = pgTable("utilisateurs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	email: text(),
	telephone: text(),
	motDePasseHash: text("mot_de_passe_hash"),
	role: roleUtilisateur().notNull(),
	nom: text().notNull(),
	prenom: text().notNull(),
	photoUrl: text("photo_url"),
	actif: boolean().default(true).notNull(),
	doitChangerMdp: boolean("doit_changer_mdp").default(false).notNull(),
	derniereConnexion: timestamp("derniere_connexion", { withTimezone: true, mode: 'string' }),
	tentativesEchouees: smallint("tentatives_echouees").default(0).notNull(),
	verrouilleJusqua: timestamp("verrouille_jusqua", { withTimezone: true, mode: 'string' }),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	modifieLe: timestamp("modifie_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_utilisateurs_role").using("btree", table.role.asc().nullsLast().op("enum_ops")).where(sql`actif`),
	index("idx_utilisateurs_telephone").using("btree", table.telephone.asc().nullsLast().op("text_ops")).where(sql`(telephone IS NOT NULL)`),
	unique("utilisateurs_email_key").on(table.email),
	unique("utilisateurs_telephone_key").on(table.telephone),
	check("chk_identifiant", sql`(email IS NOT NULL) OR (telephone IS NOT NULL)`),
]);

export const sessions = pgTable("sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	utilisateurId: uuid("utilisateur_id").notNull(),
	jetonHash: text("jeton_hash").notNull(),
	adresseIp: inet("adresse_ip"),
	userAgent: text("user_agent"),
	expireLe: timestamp("expire_le", { withTimezone: true, mode: 'string' }).notNull(),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_sessions_expiration").using("btree", table.expireLe.asc().nullsLast().op("timestamptz_ops")),
	index("idx_sessions_utilisateur").using("btree", table.utilisateurId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.utilisateurId],
			foreignColumns: [utilisateurs.id],
			name: "sessions_utilisateur_id_fkey"
		}).onDelete("cascade"),
	unique("sessions_jeton_hash_key").on(table.jetonHash),
]);

export const jetonsRafraichissement = pgTable("jetons_rafraichissement", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	utilisateurId: uuid("utilisateur_id").notNull(),
	jetonHash: text("jeton_hash").notNull(),
	appareilId: text("appareil_id"),
	revoque: boolean().default(false).notNull(),
	remplacePar: uuid("remplace_par"),
	expireLe: timestamp("expire_le", { withTimezone: true, mode: 'string' }).notNull(),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_jetons_utilisateur").using("btree", table.utilisateurId.asc().nullsLast().op("uuid_ops")).where(sql`(NOT revoque)`),
	foreignKey({
			columns: [table.remplacePar],
			foreignColumns: [table.id],
			name: "jetons_rafraichissement_remplace_par_fkey"
		}),
	foreignKey({
			columns: [table.utilisateurId],
			foreignColumns: [utilisateurs.id],
			name: "jetons_rafraichissement_utilisateur_id_fkey"
		}).onDelete("cascade"),
	unique("jetons_rafraichissement_jeton_hash_key").on(table.jetonHash),
]);

export const codesActivation = pgTable("codes_activation", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	telephone: text().notNull(),
	codeHash: text("code_hash").notNull(),
	tentatives: smallint().default(0).notNull(),
	consomme: boolean().default(false).notNull(),
	expireLe: timestamp("expire_le", { withTimezone: true, mode: 'string' }).notNull(),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_codes_telephone").using("btree", table.telephone.asc().nullsLast().op("text_ops"), table.creeLe.desc().nullsFirst().op("text_ops")),
]);

export const tuteurs = pgTable("tuteurs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	utilisateurId: uuid("utilisateur_id"),
	nom: text().notNull(),
	prenom: text().notNull(),
	sexe: sexeType(),
	telephone: text().notNull(),
	telephoneSecondaire: text("telephone_secondaire"),
	email: text(),
	profession: text(),
	employeur: text(),
	adresse: text(),
	quartier: text(),
	pieceIdentite: text("piece_identite"),
	appActivee: boolean("app_activee").default(false).notNull(),
	appActiveeLe: timestamp("app_activee_le", { withTimezone: true, mode: 'string' }),
	accepteSms: boolean("accepte_sms").default(true).notNull(),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	modifieLe: timestamp("modifie_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_tuteurs_telephone").using("btree", table.telephone.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.utilisateurId],
			foreignColumns: [utilisateurs.id],
			name: "tuteurs_utilisateur_id_fkey"
		}).onDelete("set null"),
	unique("tuteurs_utilisateur_id_key").on(table.utilisateurId),
]);

export const enseignants = pgTable("enseignants", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	utilisateurId: uuid("utilisateur_id"),
	matricule: text().notNull(),
	nom: text().notNull(),
	prenom: text().notNull(),
	sexe: sexeType(),
	dateNaissance: date("date_naissance"),
	telephone: text(),
	email: text(),
	adresse: text(),
	diplome: text(),
	specialite: text(),
	dateEmbauche: date("date_embauche"),
	typeContrat: text("type_contrat"),
	photoUrl: text("photo_url"),
	actif: boolean().default(true).notNull(),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	modifieLe: timestamp("modifie_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	statut: statutEnseignant().default('PERMANENT').notNull(),
	dateFinContrat: date("date_fin_contrat"),
	quartier: text(),
	numeroCnps: text("numero_cnps"),
	heuresContractuelles: numeric("heures_contractuelles", { precision: 4, scale:  1 }),
	observations: text(),
}, (table) => [
	index("idx_enseignants_actif").using("btree", table.actif.asc().nullsLast().op("bool_ops")),
	foreignKey({
			columns: [table.utilisateurId],
			foreignColumns: [utilisateurs.id],
			name: "enseignants_utilisateur_id_fkey"
		}).onDelete("set null"),
	unique("enseignants_utilisateur_id_key").on(table.utilisateurId),
	unique("enseignants_matricule_key").on(table.matricule),
]);

export const piecesDossier = pgTable("pieces_dossier", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	eleveId: uuid("eleve_id").notNull(),
	type: typePiece().notNull(),
	libelle: text().notNull(),
	fichierUrl: text("fichier_url").notNull(),
	tailleOctets: integer("taille_octets"),
	mimeType: text("mime_type"),
	deposePar: uuid("depose_par"),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_pieces_eleve").using("btree", table.eleveId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.deposePar],
			foreignColumns: [utilisateurs.id],
			name: "pieces_dossier_depose_par_fkey"
		}),
	foreignKey({
			columns: [table.eleveId],
			foreignColumns: [eleves.id],
			name: "pieces_dossier_eleve_id_fkey"
		}).onDelete("cascade"),
]);

export const eleveTuteur = pgTable("eleve_tuteur", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	eleveId: uuid("eleve_id").notNull(),
	tuteurId: uuid("tuteur_id").notNull(),
	lien: lienParente().notNull(),
	estPrincipal: boolean("est_principal").default(false).notNull(),
	estResponsableFinancier: boolean("est_responsable_financier").default(false).notNull(),
	autoriseRetrait: boolean("autorise_retrait").default(true).notNull(),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	estTuteurLegal: boolean("est_tuteur_legal").default(false).notNull(),
	estContactUrgence: boolean("est_contact_urgence").default(false).notNull(),
}, (table) => [
	index("idx_eleve_tuteur_eleve").using("btree", table.eleveId.asc().nullsLast().op("uuid_ops")),
	index("idx_eleve_tuteur_tuteur").using("btree", table.tuteurId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("uq_tuteur_principal").using("btree", table.eleveId.asc().nullsLast().op("uuid_ops")).where(sql`est_principal`),
	foreignKey({
			columns: [table.eleveId],
			foreignColumns: [eleves.id],
			name: "eleve_tuteur_eleve_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tuteurId],
			foreignColumns: [tuteurs.id],
			name: "eleve_tuteur_tuteur_id_fkey"
		}).onDelete("cascade"),
	unique("eleve_tuteur_eleve_id_tuteur_id_key").on(table.eleveId, table.tuteurId),
]);

export const classes = pgTable("classes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	anneeId: uuid("annee_id").notNull(),
	niveauId: uuid("niveau_id").notNull(),
	serieId: uuid("serie_id"),
	libelle: text().notNull(),
	code: text().notNull(),
	capaciteMax: smallint("capacite_max").default(60).notNull(),
	salleId: uuid("salle_id"),
	professeurPrincipalId: uuid("professeur_principal_id"),
	active: boolean().default(true).notNull(),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_classes_annee").using("btree", table.anneeId.asc().nullsLast().op("uuid_ops")).where(sql`active`),
	index("idx_classes_niveau").using("btree", table.niveauId.asc().nullsLast().op("uuid_ops"), table.serieId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.anneeId],
			foreignColumns: [anneesScolaires.id],
			name: "classes_annee_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.niveauId],
			foreignColumns: [niveaux.id],
			name: "classes_niveau_id_fkey"
		}),
	foreignKey({
			columns: [table.professeurPrincipalId],
			foreignColumns: [enseignants.id],
			name: "classes_professeur_principal_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.salleId],
			foreignColumns: [salles.id],
			name: "classes_salle_id_fkey"
		}),
	foreignKey({
			columns: [table.serieId],
			foreignColumns: [series.id],
			name: "classes_serie_id_fkey"
		}),
	unique("classes_annee_id_code_key").on(table.anneeId, table.code),
	check("classes_capacite_max_check", sql`capacite_max > 0`),
]);

export const emploiDuTemps = pgTable("emploi_du_temps", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	anneeId: uuid("annee_id").notNull(),
	classeId: uuid("classe_id").notNull(),
	matiereId: uuid("matiere_id").notNull(),
	enseignantId: uuid("enseignant_id"),
	salleId: uuid("salle_id"),
	jourSemaine: smallint("jour_semaine").notNull(),
	creneauId: uuid("creneau_id").notNull(),
	semaineType: char("semaine_type", { length: 1 }),
	publie: boolean().default(false).notNull(),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	nbCreneaux: smallint("nb_creneaux").default(1).notNull(),
}, (table) => [
	index("idx_edt_classe").using("btree", table.classeId.asc().nullsLast().op("int2_ops"), table.jourSemaine.asc().nullsLast().op("int2_ops")),
	index("idx_edt_enseignant").using("btree", table.enseignantId.asc().nullsLast().op("uuid_ops"), table.jourSemaine.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("uq_edt_enseignant_creneau").using("btree", sql`annee_id`, sql`enseignant_id`, sql`jour_semaine`, sql`creneau_id`, sql`COALESCE(semaine_type, '*'::bpchar)`).where(sql`(enseignant_id IS NOT NULL)`),
	uniqueIndex("uq_edt_salle_creneau").using("btree", sql`annee_id`, sql`salle_id`, sql`jour_semaine`, sql`creneau_id`, sql`COALESCE(semaine_type, '*'::bpchar)`).where(sql`(salle_id IS NOT NULL)`),
	foreignKey({
			columns: [table.anneeId],
			foreignColumns: [anneesScolaires.id],
			name: "emploi_du_temps_annee_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.classeId],
			foreignColumns: [classes.id],
			name: "emploi_du_temps_classe_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.creneauId],
			foreignColumns: [creneauxHoraires.id],
			name: "emploi_du_temps_creneau_id_fkey"
		}),
	foreignKey({
			columns: [table.enseignantId],
			foreignColumns: [enseignants.id],
			name: "emploi_du_temps_enseignant_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.matiereId],
			foreignColumns: [matieres.id],
			name: "emploi_du_temps_matiere_id_fkey"
		}),
	foreignKey({
			columns: [table.salleId],
			foreignColumns: [salles.id],
			name: "emploi_du_temps_salle_id_fkey"
		}).onDelete("set null"),
	unique("uq_edt_classe_creneau").on(table.anneeId, table.classeId, table.jourSemaine, table.creneauId, table.semaineType),
	check("emploi_du_temps_jour_semaine_check", sql`(jour_semaine >= 1) AND (jour_semaine <= 7)`),
	check("emploi_du_temps_nb_creneaux_check", sql`(nb_creneaux >= 1) AND (nb_creneaux <= 4)`),
	check("emploi_du_temps_semaine_type_check", sql`semaine_type = ANY (ARRAY['A'::bpchar, 'B'::bpchar])`),
]);

export const changementsClasse = pgTable("changements_classe", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	inscriptionId: uuid("inscription_id").notNull(),
	classeOrigineId: uuid("classe_origine_id").notNull(),
	classeDestinationId: uuid("classe_destination_id").notNull(),
	motif: text().notNull(),
	dateEffet: date("date_effet").default(sql`CURRENT_DATE`).notNull(),
	decidePar: uuid("decide_par"),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.classeDestinationId],
			foreignColumns: [classes.id],
			name: "changements_classe_classe_destination_id_fkey"
		}),
	foreignKey({
			columns: [table.classeOrigineId],
			foreignColumns: [classes.id],
			name: "changements_classe_classe_origine_id_fkey"
		}),
	foreignKey({
			columns: [table.decidePar],
			foreignColumns: [utilisateurs.id],
			name: "changements_classe_decide_par_fkey"
		}),
	foreignKey({
			columns: [table.inscriptionId],
			foreignColumns: [inscriptions.id],
			name: "changements_classe_inscription_id_fkey"
		}).onDelete("cascade"),
	check("chk_classes_differentes", sql`classe_origine_id <> classe_destination_id`),
]);

export const affectations = pgTable("affectations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	anneeId: uuid("annee_id").notNull(),
	enseignantId: uuid("enseignant_id").notNull(),
	classeId: uuid("classe_id").notNull(),
	matiereId: uuid("matiere_id").notNull(),
	heuresSemaine: numeric("heures_semaine", { precision: 4, scale:  2 }),
	active: boolean().default(true).notNull(),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_affectations_classe").using("btree", table.classeId.asc().nullsLast().op("uuid_ops"), table.anneeId.asc().nullsLast().op("uuid_ops")).where(sql`active`),
	index("idx_affectations_enseignant").using("btree", table.enseignantId.asc().nullsLast().op("uuid_ops"), table.anneeId.asc().nullsLast().op("uuid_ops")).where(sql`active`),
	foreignKey({
			columns: [table.anneeId],
			foreignColumns: [anneesScolaires.id],
			name: "affectations_annee_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.classeId],
			foreignColumns: [classes.id],
			name: "affectations_classe_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.enseignantId],
			foreignColumns: [enseignants.id],
			name: "affectations_enseignant_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.matiereId],
			foreignColumns: [matieres.id],
			name: "affectations_matiere_id_fkey"
		}).onDelete("cascade"),
	unique("affectations_annee_id_classe_id_matiere_id_key").on(table.anneeId, table.classeId, table.matiereId),
]);

export const creneauxHoraires = pgTable("creneaux_horaires", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	libelle: text().notNull(),
	heureDebut: time("heure_debut").notNull(),
	heureFin: time("heure_fin").notNull(),
	ordre: smallint().notNull(),
}, (table) => [
	unique("creneaux_horaires_ordre_key").on(table.ordre),
	check("chk_creneau", sql`heure_fin > heure_debut`),
]);

export const inscriptions = pgTable("inscriptions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	eleveId: uuid("eleve_id").notNull(),
	anneeId: uuid("annee_id").notNull(),
	classeId: uuid("classe_id").notNull(),
	type: typeInscription().default('INSCRIPTION').notNull(),
	numeroOrdre: smallint("numero_ordre"),
	dateInscription: date("date_inscription").default(sql`CURRENT_DATE`).notNull(),
	estRedoublant: boolean("est_redoublant").default(false).notNull(),
	estBoursier: boolean("est_boursier").default(false).notNull(),
	dateSortie: date("date_sortie"),
	motifSortie: text("motif_sortie"),
	active: boolean().default(true).notNull(),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	modifieLe: timestamp("modifie_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	numeroInscription: text("numero_inscription"),
	statutDossier: statutDossier("statut_dossier").default('A_VALIDER').notNull(),
	valideePar: uuid("validee_par"),
	valideeLe: timestamp("validee_le", { withTimezone: true, mode: 'string' }),
	observations: text(),
	etablissementDestination: text("etablissement_destination"),
	inscriptionPrecedenteId: uuid("inscription_precedente_id"),
}, (table) => [
	index("idx_inscriptions_annee").using("btree", table.anneeId.asc().nullsLast().op("uuid_ops")),
	index("idx_inscriptions_classe").using("btree", table.classeId.asc().nullsLast().op("uuid_ops")).where(sql`active`),
	index("idx_inscriptions_dossier").using("btree", table.statutDossier.asc().nullsLast().op("enum_ops")).where(sql`(statut_dossier <> 'VALIDE'::statut_dossier)`),
	index("idx_inscriptions_eleve").using("btree", table.eleveId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.anneeId],
			foreignColumns: [anneesScolaires.id],
			name: "inscriptions_annee_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.classeId],
			foreignColumns: [classes.id],
			name: "inscriptions_classe_id_fkey"
		}),
	foreignKey({
			columns: [table.eleveId],
			foreignColumns: [eleves.id],
			name: "inscriptions_eleve_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.inscriptionPrecedenteId],
			foreignColumns: [table.id],
			name: "inscriptions_inscription_precedente_id_fkey"
		}),
	foreignKey({
			columns: [table.valideePar],
			foreignColumns: [utilisateurs.id],
			name: "inscriptions_validee_par_fkey"
		}),
	unique("inscriptions_eleve_id_annee_id_key").on(table.eleveId, table.anneeId),
	unique("inscriptions_numero_inscription_key").on(table.numeroInscription),
]);

export const seances = pgTable("seances", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	emploiDuTempsId: uuid("emploi_du_temps_id"),
	classeId: uuid("classe_id").notNull(),
	matiereId: uuid("matiere_id").notNull(),
	enseignantId: uuid("enseignant_id"),
	dateSeance: date("date_seance").notNull(),
	creneauId: uuid("creneau_id"),
	contenu: text(),
	travailAFaire: text("travail_a_faire"),
	assuree: boolean().default(true).notNull(),
	motifNonAssuree: text("motif_non_assuree"),
	appelEffectue: boolean("appel_effectue").default(false).notNull(),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_seances_classe_date").using("btree", table.classeId.asc().nullsLast().op("date_ops"), table.dateSeance.desc().nullsFirst().op("date_ops")),
	index("idx_seances_enseignant").using("btree", table.enseignantId.asc().nullsLast().op("date_ops"), table.dateSeance.desc().nullsFirst().op("date_ops")),
	foreignKey({
			columns: [table.classeId],
			foreignColumns: [classes.id],
			name: "seances_classe_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.creneauId],
			foreignColumns: [creneauxHoraires.id],
			name: "seances_creneau_id_fkey"
		}),
	foreignKey({
			columns: [table.emploiDuTempsId],
			foreignColumns: [emploiDuTemps.id],
			name: "seances_emploi_du_temps_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.enseignantId],
			foreignColumns: [enseignants.id],
			name: "seances_enseignant_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.matiereId],
			foreignColumns: [matieres.id],
			name: "seances_matiere_id_fkey"
		}),
]);

export const evaluations = pgTable("evaluations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	anneeId: uuid("annee_id").notNull(),
	periodeId: uuid("periode_id").notNull(),
	classeId: uuid("classe_id").notNull(),
	matiereId: uuid("matiere_id").notNull(),
	enseignantId: uuid("enseignant_id"),
	type: typeEvaluation().notNull(),
	titre: text().notNull(),
	dateEvaluation: date("date_evaluation").notNull(),
	bareme: numeric({ precision: 5, scale:  2 }).default('20.00').notNull(),
	poids: numeric({ precision: 4, scale:  2 }).default('1.00').notNull(),
	compteDansMoyenne: boolean("compte_dans_moyenne").default(true).notNull(),
	observations: text(),
	estVerrouillee: boolean("est_verrouillee").default(false).notNull(),
	creePar: uuid("cree_par"),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	modifieLe: timestamp("modifie_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_evaluations_classe_periode").using("btree", table.classeId.asc().nullsLast().op("uuid_ops"), table.periodeId.asc().nullsLast().op("uuid_ops")),
	index("idx_evaluations_enseignant").using("btree", table.enseignantId.asc().nullsLast().op("uuid_ops")),
	index("idx_evaluations_matiere").using("btree", table.matiereId.asc().nullsLast().op("uuid_ops"), table.periodeId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.anneeId],
			foreignColumns: [anneesScolaires.id],
			name: "evaluations_annee_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.classeId],
			foreignColumns: [classes.id],
			name: "evaluations_classe_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.creePar],
			foreignColumns: [utilisateurs.id],
			name: "evaluations_cree_par_fkey"
		}),
	foreignKey({
			columns: [table.enseignantId],
			foreignColumns: [enseignants.id],
			name: "evaluations_enseignant_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.matiereId],
			foreignColumns: [matieres.id],
			name: "evaluations_matiere_id_fkey"
		}),
	foreignKey({
			columns: [table.periodeId],
			foreignColumns: [periodes.id],
			name: "evaluations_periode_id_fkey"
		}).onDelete("cascade"),
	check("evaluations_bareme_check", sql`bareme > (0)::numeric`),
	check("evaluations_poids_check", sql`poids > (0)::numeric`),
]);

export const notes = pgTable("notes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	evaluationId: uuid("evaluation_id").notNull(),
	inscriptionId: uuid("inscription_id").notNull(),
	valeur: numeric({ precision: 5, scale:  2 }),
	statut: statutNote().default('NOTEE').notNull(),
	appreciation: text(),
	saisiePar: uuid("saisie_par"),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	modifieLe: timestamp("modifie_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_notes_evaluation").using("btree", table.evaluationId.asc().nullsLast().op("uuid_ops")),
	index("idx_notes_inscription").using("btree", table.inscriptionId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.evaluationId],
			foreignColumns: [evaluations.id],
			name: "notes_evaluation_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.inscriptionId],
			foreignColumns: [inscriptions.id],
			name: "notes_inscription_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.saisiePar],
			foreignColumns: [utilisateurs.id],
			name: "notes_saisie_par_fkey"
		}),
	unique("notes_evaluation_id_inscription_id_key").on(table.evaluationId, table.inscriptionId),
	check("chk_note_coherente", sql`((statut = 'NOTEE'::statut_note) AND (valeur IS NOT NULL)) OR (statut <> 'NOTEE'::statut_note)`),
	check("notes_valeur_check", sql`valeur >= (0)::numeric`),
]);

export const historiqueNotes = pgTable("historique_notes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	noteId: uuid("note_id").notNull(),
	ancienneValeur: numeric("ancienne_valeur", { precision: 5, scale:  2 }),
	nouvelleValeur: numeric("nouvelle_valeur", { precision: 5, scale:  2 }),
	ancienStatut: statutNote("ancien_statut"),
	nouveauStatut: statutNote("nouveau_statut"),
	motif: text(),
	modifiePar: uuid("modifie_par"),
	modifieLe: timestamp("modifie_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_historique_notes_note").using("btree", table.noteId.asc().nullsLast().op("timestamptz_ops"), table.modifieLe.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.modifiePar],
			foreignColumns: [utilisateurs.id],
			name: "historique_notes_modifie_par_fkey"
		}),
	foreignKey({
			columns: [table.noteId],
			foreignColumns: [notes.id],
			name: "historique_notes_note_id_fkey"
		}).onDelete("cascade"),
]);

export const appreciationsMatiere = pgTable("appreciations_matiere", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	inscriptionId: uuid("inscription_id").notNull(),
	periodeId: uuid("periode_id").notNull(),
	matiereId: uuid("matiere_id").notNull(),
	enseignantId: uuid("enseignant_id"),
	appreciation: text().notNull(),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	modifieLe: timestamp("modifie_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.enseignantId],
			foreignColumns: [enseignants.id],
			name: "appreciations_matiere_enseignant_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.inscriptionId],
			foreignColumns: [inscriptions.id],
			name: "appreciations_matiere_inscription_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.matiereId],
			foreignColumns: [matieres.id],
			name: "appreciations_matiere_matiere_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.periodeId],
			foreignColumns: [periodes.id],
			name: "appreciations_matiere_periode_id_fkey"
		}).onDelete("cascade"),
	unique("appreciations_matiere_inscription_id_periode_id_matiere_id_key").on(table.inscriptionId, table.periodeId, table.matiereId),
]);

export const moyennesMatiere = pgTable("moyennes_matiere", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	inscriptionId: uuid("inscription_id").notNull(),
	periodeId: uuid("periode_id").notNull(),
	matiereId: uuid("matiere_id").notNull(),
	moyenne: numeric({ precision: 5, scale:  2 }),
	coefficient: numeric({ precision: 4, scale:  2 }).notNull(),
	points: numeric({ precision: 7, scale:  2 }),
	rangMatiere: smallint("rang_matiere"),
	moyenneClasse: numeric("moyenne_classe", { precision: 5, scale:  2 }),
	noteMinClasse: numeric("note_min_classe", { precision: 5, scale:  2 }),
	noteMaxClasse: numeric("note_max_classe", { precision: 5, scale:  2 }),
	nbEvaluations: smallint("nb_evaluations").default(0).notNull(),
	calculeLe: timestamp("calcule_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_moy_matiere_periode").using("btree", table.periodeId.asc().nullsLast().op("uuid_ops"), table.matiereId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.inscriptionId],
			foreignColumns: [inscriptions.id],
			name: "moyennes_matiere_inscription_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.matiereId],
			foreignColumns: [matieres.id],
			name: "moyennes_matiere_matiere_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.periodeId],
			foreignColumns: [periodes.id],
			name: "moyennes_matiere_periode_id_fkey"
		}).onDelete("cascade"),
	unique("moyennes_matiere_inscription_id_periode_id_matiere_id_key").on(table.inscriptionId, table.periodeId, table.matiereId),
]);

export const moyennesGenerales = pgTable("moyennes_generales", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	inscriptionId: uuid("inscription_id").notNull(),
	periodeId: uuid("periode_id").notNull(),
	moyenne: numeric({ precision: 5, scale:  2 }),
	totalPoints: numeric("total_points", { precision: 8, scale:  2 }),
	totalCoefficients: numeric("total_coefficients", { precision: 6, scale:  2 }),
	rang: smallint(),
	estExAequo: boolean("est_ex_aequo").default(false).notNull(),
	effectifClasse: smallint("effectif_classe"),
	moyenneClasse: numeric("moyenne_classe", { precision: 5, scale:  2 }),
	moyenneMinClasse: numeric("moyenne_min_classe", { precision: 5, scale:  2 }),
	moyenneMaxClasse: numeric("moyenne_max_classe", { precision: 5, scale:  2 }),
	calculeLe: timestamp("calcule_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_moy_gen_periode").using("btree", table.periodeId.asc().nullsLast().op("int2_ops"), table.rang.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.inscriptionId],
			foreignColumns: [inscriptions.id],
			name: "moyennes_generales_inscription_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.periodeId],
			foreignColumns: [periodes.id],
			name: "moyennes_generales_periode_id_fkey"
		}).onDelete("cascade"),
	unique("moyennes_generales_inscription_id_periode_id_key").on(table.inscriptionId, table.periodeId),
]);

export const conseilsClasse = pgTable("conseils_classe", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	classeId: uuid("classe_id").notNull(),
	periodeId: uuid("periode_id").notNull(),
	dateConseil: date("date_conseil").notNull(),
	president: text(),
	secretaire: text(),
	participants: text(),
	observations: text(),
	estValide: boolean("est_valide").default(false).notNull(),
	validePar: uuid("valide_par"),
	valideLe: timestamp("valide_le", { withTimezone: true, mode: 'string' }),
	procesVerbalUrl: text("proces_verbal_url"),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.classeId],
			foreignColumns: [classes.id],
			name: "conseils_classe_classe_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.periodeId],
			foreignColumns: [periodes.id],
			name: "conseils_classe_periode_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.validePar],
			foreignColumns: [utilisateurs.id],
			name: "conseils_classe_valide_par_fkey"
		}),
	unique("conseils_classe_classe_id_periode_id_key").on(table.classeId, table.periodeId),
]);

export const bulletins = pgTable("bulletins", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	inscriptionId: uuid("inscription_id").notNull(),
	periodeId: uuid("periode_id").notNull(),
	conseilClasseId: uuid("conseil_classe_id"),
	moyenneGenerale: numeric("moyenne_generale", { precision: 5, scale:  2 }),
	rang: smallint(),
	effectifClasse: smallint("effectif_classe"),
	moyenneClasse: numeric("moyenne_classe", { precision: 5, scale:  2 }),
	heuresAbsenceJustifiees: numeric("heures_absence_justifiees", { precision: 6, scale:  2 }).default('0').notNull(),
	heuresAbsenceNonJustifiees: numeric("heures_absence_non_justifiees", { precision: 6, scale:  2 }).default('0').notNull(),
	nbRetards: smallint("nb_retards").default(0).notNull(),
	noteConduite: numeric("note_conduite", { precision: 5, scale:  2 }),
	appreciationGenerale: text("appreciation_generale"),
	mention: mentionBulletin().default('AUCUNE').notNull(),
	decision: decisionFinAnnee(),
	estPublie: boolean("est_publie").default(false).notNull(),
	publieLe: timestamp("publie_le", { withTimezone: true, mode: 'string' }),
	publiePar: uuid("publie_par"),
	pdfUrl: text("pdf_url"),
	genereLe: timestamp("genere_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_bulletins_periode").using("btree", table.periodeId.asc().nullsLast().op("uuid_ops")),
	index("idx_bulletins_publie").using("btree", table.inscriptionId.asc().nullsLast().op("uuid_ops")).where(sql`est_publie`),
	foreignKey({
			columns: [table.conseilClasseId],
			foreignColumns: [conseilsClasse.id],
			name: "bulletins_conseil_classe_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.inscriptionId],
			foreignColumns: [inscriptions.id],
			name: "bulletins_inscription_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.periodeId],
			foreignColumns: [periodes.id],
			name: "bulletins_periode_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.publiePar],
			foreignColumns: [utilisateurs.id],
			name: "bulletins_publie_par_fkey"
		}),
	unique("bulletins_inscription_id_periode_id_key").on(table.inscriptionId, table.periodeId),
]);

export const bulletinsAnnuels = pgTable("bulletins_annuels", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	inscriptionId: uuid("inscription_id").notNull(),
	moyenneT1: numeric("moyenne_t1", { precision: 5, scale:  2 }),
	moyenneT2: numeric("moyenne_t2", { precision: 5, scale:  2 }),
	moyenneT3: numeric("moyenne_t3", { precision: 5, scale:  2 }),
	moyenneAnnuelle: numeric("moyenne_annuelle", { precision: 5, scale:  2 }),
	rangAnnuel: smallint("rang_annuel"),
	effectifClasse: smallint("effectif_classe"),
	decision: decisionFinAnnee().default('EN_ATTENTE').notNull(),
	mention: mentionBulletin().default('AUCUNE').notNull(),
	appreciation: text(),
	niveauSuivantId: uuid("niveau_suivant_id"),
	estPublie: boolean("est_publie").default(false).notNull(),
	pdfUrl: text("pdf_url"),
	genereLe: timestamp("genere_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.inscriptionId],
			foreignColumns: [inscriptions.id],
			name: "bulletins_annuels_inscription_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.niveauSuivantId],
			foreignColumns: [niveaux.id],
			name: "bulletins_annuels_niveau_suivant_id_fkey"
		}),
	unique("bulletins_annuels_inscription_id_key").on(table.inscriptionId),
]);

export const devoirs = pgTable("devoirs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	classeId: uuid("classe_id").notNull(),
	matiereId: uuid("matiere_id").notNull(),
	enseignantId: uuid("enseignant_id"),
	titre: text().notNull(),
	consigne: text(),
	datePublication: date("date_publication").default(sql`CURRENT_DATE`).notNull(),
	dateRemise: date("date_remise").notNull(),
	fichierUrl: text("fichier_url"),
	publie: boolean().default(true).notNull(),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_devoirs_classe_date").using("btree", table.classeId.asc().nullsLast().op("date_ops"), table.dateRemise.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.classeId],
			foreignColumns: [classes.id],
			name: "devoirs_classe_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.enseignantId],
			foreignColumns: [enseignants.id],
			name: "devoirs_enseignant_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.matiereId],
			foreignColumns: [matieres.id],
			name: "devoirs_matiere_id_fkey"
		}),
]);

export const ressourcesPedagogiques = pgTable("ressources_pedagogiques", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	classeId: uuid("classe_id"),
	matiereId: uuid("matiere_id"),
	enseignantId: uuid("enseignant_id"),
	titre: text().notNull(),
	description: text(),
	fichierUrl: text("fichier_url").notNull(),
	tailleOctets: integer("taille_octets"),
	mimeType: text("mime_type"),
	visibleParents: boolean("visible_parents").default(true).notNull(),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.classeId],
			foreignColumns: [classes.id],
			name: "ressources_pedagogiques_classe_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.enseignantId],
			foreignColumns: [enseignants.id],
			name: "ressources_pedagogiques_enseignant_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.matiereId],
			foreignColumns: [matieres.id],
			name: "ressources_pedagogiques_matiere_id_fkey"
		}).onDelete("cascade"),
]);

export const absences = pgTable("absences", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	inscriptionId: uuid("inscription_id").notNull(),
	periodeId: uuid("periode_id").notNull(),
	type: typeAbsence().default('COURS').notNull(),
	dateAbsence: date("date_absence").notNull(),
	seanceId: uuid("seance_id"),
	matiereId: uuid("matiere_id"),
	creneauId: uuid("creneau_id"),
	nbHeures: numeric("nb_heures", { precision: 4, scale:  2 }).default('1.00').notNull(),
	statut: statutJustification().default('NON_JUSTIFIEE').notNull(),
	motif: text(),
	justificatifUrl: text("justificatif_url"),
	justifieePar: uuid("justifiee_par"),
	justifieeLe: timestamp("justifiee_le", { withTimezone: true, mode: 'string' }),
	parentsNotifies: boolean("parents_notifies").default(false).notNull(),
	notifieLe: timestamp("notifie_le", { withTimezone: true, mode: 'string' }),
	saisiePar: uuid("saisie_par"),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	modifieLe: timestamp("modifie_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_absences_a_notifier").using("btree", table.creeLe.asc().nullsLast().op("timestamptz_ops")).where(sql`(NOT parents_notifies)`),
	index("idx_absences_date").using("btree", table.dateAbsence.desc().nullsFirst().op("date_ops")),
	index("idx_absences_inscription").using("btree", table.inscriptionId.asc().nullsLast().op("date_ops"), table.dateAbsence.desc().nullsFirst().op("date_ops")),
	index("idx_absences_periode").using("btree", table.periodeId.asc().nullsLast().op("enum_ops"), table.statut.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.creneauId],
			foreignColumns: [creneauxHoraires.id],
			name: "absences_creneau_id_fkey"
		}),
	foreignKey({
			columns: [table.inscriptionId],
			foreignColumns: [inscriptions.id],
			name: "absences_inscription_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.justifieePar],
			foreignColumns: [utilisateurs.id],
			name: "absences_justifiee_par_fkey"
		}),
	foreignKey({
			columns: [table.matiereId],
			foreignColumns: [matieres.id],
			name: "absences_matiere_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.periodeId],
			foreignColumns: [periodes.id],
			name: "absences_periode_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.saisiePar],
			foreignColumns: [utilisateurs.id],
			name: "absences_saisie_par_fkey"
		}),
	foreignKey({
			columns: [table.seanceId],
			foreignColumns: [seances.id],
			name: "absences_seance_id_fkey"
		}).onDelete("set null"),
	check("absences_nb_heures_check", sql`nb_heures > (0)::numeric`),
]);

export const retards = pgTable("retards", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	inscriptionId: uuid("inscription_id").notNull(),
	periodeId: uuid("periode_id").notNull(),
	dateRetard: date("date_retard").notNull(),
	heureArrivee: time("heure_arrivee"),
	dureeMinutes: smallint("duree_minutes"),
	matiereId: uuid("matiere_id"),
	statut: statutJustification().default('NON_JUSTIFIEE').notNull(),
	motif: text(),
	parentsNotifies: boolean("parents_notifies").default(false).notNull(),
	saisiePar: uuid("saisie_par"),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_retards_inscription").using("btree", table.inscriptionId.asc().nullsLast().op("date_ops"), table.dateRetard.desc().nullsFirst().op("date_ops")),
	foreignKey({
			columns: [table.inscriptionId],
			foreignColumns: [inscriptions.id],
			name: "retards_inscription_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.matiereId],
			foreignColumns: [matieres.id],
			name: "retards_matiere_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.periodeId],
			foreignColumns: [periodes.id],
			name: "retards_periode_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.saisiePar],
			foreignColumns: [utilisateurs.id],
			name: "retards_saisie_par_fkey"
		}),
	check("retards_duree_minutes_check", sql`duree_minutes >= 0`),
]);

export const sortiesAnticipees = pgTable("sorties_anticipees", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	inscriptionId: uuid("inscription_id").notNull(),
	dateSortie: date("date_sortie").notNull(),
	heureSortie: time("heure_sortie").notNull(),
	motif: text().notNull(),
	recupereParTuteurId: uuid("recupere_par_tuteur_id"),
	autorisePar: uuid("autorise_par"),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.autorisePar],
			foreignColumns: [utilisateurs.id],
			name: "sorties_anticipees_autorise_par_fkey"
		}),
	foreignKey({
			columns: [table.inscriptionId],
			foreignColumns: [inscriptions.id],
			name: "sorties_anticipees_inscription_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.recupereParTuteurId],
			foreignColumns: [tuteurs.id],
			name: "sorties_anticipees_recupere_par_tuteur_id_fkey"
		}),
]);

export const incidents = pgTable("incidents", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	inscriptionId: uuid("inscription_id").notNull(),
	periodeId: uuid("periode_id").notNull(),
	dateIncident: date("date_incident").notNull(),
	heureIncident: time("heure_incident"),
	lieu: text(),
	gravite: graviteIncident().default('MINEURE').notNull(),
	description: text().notNull(),
	temoins: text(),
	signalePar: uuid("signale_par"),
	parentsNotifies: boolean("parents_notifies").default(false).notNull(),
	notifieLe: timestamp("notifie_le", { withTimezone: true, mode: 'string' }),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_incidents_gravite").using("btree", table.gravite.asc().nullsLast().op("enum_ops"), table.dateIncident.desc().nullsFirst().op("date_ops")),
	index("idx_incidents_inscription").using("btree", table.inscriptionId.asc().nullsLast().op("date_ops"), table.dateIncident.desc().nullsFirst().op("uuid_ops")),
	foreignKey({
			columns: [table.inscriptionId],
			foreignColumns: [inscriptions.id],
			name: "incidents_inscription_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.periodeId],
			foreignColumns: [periodes.id],
			name: "incidents_periode_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.signalePar],
			foreignColumns: [utilisateurs.id],
			name: "incidents_signale_par_fkey"
		}),
]);

export const sanctions = pgTable("sanctions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	inscriptionId: uuid("inscription_id").notNull(),
	incidentId: uuid("incident_id"),
	periodeId: uuid("periode_id").notNull(),
	type: typeSanction().notNull(),
	motif: text().notNull(),
	dateDebut: date("date_debut").notNull(),
	dateFin: date("date_fin"),
	dureeJours: smallint("duree_jours"),
	executee: boolean().default(false).notNull(),
	executeeLe: date("executee_le"),
	impacteStatut: boolean("impacte_statut").default(false).notNull(),
	prononceePar: uuid("prononcee_par"),
	parentsNotifies: boolean("parents_notifies").default(false).notNull(),
	documentUrl: text("document_url"),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_sanctions_inscription").using("btree", table.inscriptionId.asc().nullsLast().op("date_ops"), table.dateDebut.desc().nullsFirst().op("date_ops")),
	foreignKey({
			columns: [table.incidentId],
			foreignColumns: [incidents.id],
			name: "sanctions_incident_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.inscriptionId],
			foreignColumns: [inscriptions.id],
			name: "sanctions_inscription_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.periodeId],
			foreignColumns: [periodes.id],
			name: "sanctions_periode_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.prononceePar],
			foreignColumns: [utilisateurs.id],
			name: "sanctions_prononcee_par_fkey"
		}),
	check("chk_sanction_dates", sql`(date_fin IS NULL) OR (date_fin >= date_debut)`),
]);

export const conseilsDiscipline = pgTable("conseils_discipline", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	inscriptionId: uuid("inscription_id").notNull(),
	dateConvocation: date("date_convocation").notNull(),
	dateSeance: date("date_seance").notNull(),
	motif: text().notNull(),
	participants: text(),
	tuteurConvoque: boolean("tuteur_convoque").default(true).notNull(),
	tuteurPresent: boolean("tuteur_present"),
	deliberation: text(),
	decision: text(),
	sanctionId: uuid("sanction_id"),
	procesVerbalUrl: text("proces_verbal_url"),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.inscriptionId],
			foreignColumns: [inscriptions.id],
			name: "conseils_discipline_inscription_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.sanctionId],
			foreignColumns: [sanctions.id],
			name: "conseils_discipline_sanction_id_fkey"
		}).onDelete("set null"),
]);

export const grillesTarifaires = pgTable("grilles_tarifaires", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	anneeId: uuid("annee_id").notNull(),
	niveauId: uuid("niveau_id").notNull(),
	serieId: uuid("serie_id"),
	nature: natureFrais().notNull(),
	libelle: text().notNull(),
	montantFcfa: integer("montant_fcfa").notNull(),
	obligatoire: boolean().default(true).notNull(),
	applicableNouveaux: boolean("applicable_nouveaux").default(true).notNull(),
	applicableAnciens: boolean("applicable_anciens").default(true).notNull(),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_grilles_annee_niveau").using("btree", table.anneeId.asc().nullsLast().op("uuid_ops"), table.niveauId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.anneeId],
			foreignColumns: [anneesScolaires.id],
			name: "grilles_tarifaires_annee_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.niveauId],
			foreignColumns: [niveaux.id],
			name: "grilles_tarifaires_niveau_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.serieId],
			foreignColumns: [series.id],
			name: "grilles_tarifaires_serie_id_fkey"
		}).onDelete("cascade"),
	check("grilles_tarifaires_montant_fcfa_check", sql`montant_fcfa >= 0`),
]);

export const notesConduite = pgTable("notes_conduite", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	inscriptionId: uuid("inscription_id").notNull(),
	periodeId: uuid("periode_id").notNull(),
	note: numeric({ precision: 5, scale:  2 }),
	appreciation: text(),
	attribueePar: uuid("attribuee_par"),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	modifieLe: timestamp("modifie_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.attribueePar],
			foreignColumns: [utilisateurs.id],
			name: "notes_conduite_attribuee_par_fkey"
		}),
	foreignKey({
			columns: [table.inscriptionId],
			foreignColumns: [inscriptions.id],
			name: "notes_conduite_inscription_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.periodeId],
			foreignColumns: [periodes.id],
			name: "notes_conduite_periode_id_fkey"
		}).onDelete("cascade"),
	unique("notes_conduite_inscription_id_periode_id_key").on(table.inscriptionId, table.periodeId),
	check("notes_conduite_note_check", sql`(note >= (0)::numeric) AND (note <= (20)::numeric)`),
]);

export const tranches = pgTable("tranches", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	anneeId: uuid("annee_id").notNull(),
	numero: smallint().notNull(),
	libelle: text().notNull(),
	dateLimite: date("date_limite").notNull(),
	pourcentage: numeric({ precision: 5, scale:  2 }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.anneeId],
			foreignColumns: [anneesScolaires.id],
			name: "tranches_annee_id_fkey"
		}).onDelete("cascade"),
	unique("tranches_annee_id_numero_key").on(table.anneeId, table.numero),
	check("tranches_pourcentage_check", sql`(pourcentage > (0)::numeric) AND (pourcentage <= (100)::numeric)`),
]);

export const echeances = pgTable("echeances", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	inscriptionId: uuid("inscription_id").notNull(),
	trancheId: uuid("tranche_id"),
	nature: natureFrais().notNull(),
	libelle: text().notNull(),
	montantDuFcfa: integer("montant_du_fcfa").notNull(),
	montantPayeFcfa: integer("montant_paye_fcfa").default(0).notNull(),
	montantExonereFcfa: integer("montant_exonere_fcfa").default(0).notNull(),
	dateLimite: date("date_limite").notNull(),
	statut: statutEcheance().default('A_PAYER').notNull(),
	nbRelances: smallint("nb_relances").default(0).notNull(),
	derniereRelanceLe: timestamp("derniere_relance_le", { withTimezone: true, mode: 'string' }),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	modifieLe: timestamp("modifie_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_echeances_impayees").using("btree", table.dateLimite.asc().nullsLast().op("date_ops")).where(sql`(statut = ANY (ARRAY['A_PAYER'::statut_echeance, 'PARTIEL'::statut_echeance, 'EN_RETARD'::statut_echeance]))`),
	index("idx_echeances_inscription").using("btree", table.inscriptionId.asc().nullsLast().op("uuid_ops")),
	index("idx_echeances_statut").using("btree", table.statut.asc().nullsLast().op("date_ops"), table.dateLimite.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.inscriptionId],
			foreignColumns: [inscriptions.id],
			name: "echeances_inscription_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.trancheId],
			foreignColumns: [tranches.id],
			name: "echeances_tranche_id_fkey"
		}).onDelete("set null"),
	check("chk_paye_coherent", sql`(montant_paye_fcfa + montant_exonere_fcfa) <= montant_du_fcfa`),
	check("echeances_montant_du_fcfa_check", sql`montant_du_fcfa >= 0`),
	check("echeances_montant_exonere_fcfa_check", sql`montant_exonere_fcfa >= 0`),
	check("echeances_montant_paye_fcfa_check", sql`montant_paye_fcfa >= 0`),
]);

export const messages = pgTable("messages", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	expediteurId: uuid("expediteur_id"),
	destinataireId: uuid("destinataire_id"),
	eleveId: uuid("eleve_id"),
	objet: text().notNull(),
	contenu: text().notNull(),
	pieceJointeUrl: text("piece_jointe_url"),
	messageParentId: uuid("message_parent_id"),
	lu: boolean().default(false).notNull(),
	luLe: timestamp("lu_le", { withTimezone: true, mode: 'string' }),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_messages_destinataire").using("btree", table.destinataireId.asc().nullsLast().op("timestamptz_ops"), table.creeLe.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_messages_non_lus").using("btree", table.destinataireId.asc().nullsLast().op("uuid_ops")).where(sql`(NOT lu)`),
	foreignKey({
			columns: [table.destinataireId],
			foreignColumns: [utilisateurs.id],
			name: "messages_destinataire_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.eleveId],
			foreignColumns: [eleves.id],
			name: "messages_eleve_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.expediteurId],
			foreignColumns: [utilisateurs.id],
			name: "messages_expediteur_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.messageParentId],
			foreignColumns: [table.id],
			name: "messages_message_parent_id_fkey"
		}).onDelete("cascade"),
]);

export const paiements = pgTable("paiements", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	inscriptionId: uuid("inscription_id").notNull(),
	echeanceId: uuid("echeance_id"),
	numeroRecu: text("numero_recu").notNull(),
	montantFcfa: integer("montant_fcfa").notNull(),
	mode: modePaiement().notNull(),
	referenceExterne: text("reference_externe"),
	datePaiement: date("date_paiement").default(sql`CURRENT_DATE`).notNull(),
	payeParTuteurId: uuid("paye_par_tuteur_id"),
	nomPayeur: text("nom_payeur"),
	annule: boolean().default(false).notNull(),
	annulePaiementId: uuid("annule_paiement_id"),
	motifAnnulation: text("motif_annulation"),
	observations: text(),
	encaissePar: uuid("encaisse_par"),
	recuUrl: text("recu_url"),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_paiements_date").using("btree", table.datePaiement.desc().nullsFirst().op("date_ops")),
	index("idx_paiements_inscription").using("btree", table.inscriptionId.asc().nullsLast().op("uuid_ops"), table.datePaiement.desc().nullsFirst().op("uuid_ops")),
	index("idx_paiements_recu").using("btree", table.numeroRecu.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.annulePaiementId],
			foreignColumns: [table.id],
			name: "paiements_annule_paiement_id_fkey"
		}),
	foreignKey({
			columns: [table.echeanceId],
			foreignColumns: [echeances.id],
			name: "paiements_echeance_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.encaissePar],
			foreignColumns: [utilisateurs.id],
			name: "paiements_encaisse_par_fkey"
		}),
	foreignKey({
			columns: [table.inscriptionId],
			foreignColumns: [inscriptions.id],
			name: "paiements_inscription_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.payeParTuteurId],
			foreignColumns: [tuteurs.id],
			name: "paiements_paye_par_tuteur_id_fkey"
		}).onDelete("set null"),
	unique("paiements_numero_recu_key").on(table.numeroRecu),
	check("paiements_montant_fcfa_check", sql`montant_fcfa <> 0`),
]);

export const exonerations = pgTable("exonerations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	inscriptionId: uuid("inscription_id").notNull(),
	nature: natureFrais(),
	motif: motifExoneration().notNull(),
	justification: text().notNull(),
	pourcentage: numeric({ precision: 5, scale:  2 }),
	montantFcfa: integer("montant_fcfa"),
	accordePar: uuid("accorde_par"),
	dateAccord: date("date_accord").default(sql`CURRENT_DATE`).notNull(),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.accordePar],
			foreignColumns: [utilisateurs.id],
			name: "exonerations_accorde_par_fkey"
		}),
	foreignKey({
			columns: [table.inscriptionId],
			foreignColumns: [inscriptions.id],
			name: "exonerations_inscription_id_fkey"
		}).onDelete("cascade"),
	check("chk_exoneration_valeur", sql`((pourcentage IS NOT NULL) AND (montant_fcfa IS NULL)) OR ((pourcentage IS NULL) AND (montant_fcfa IS NOT NULL))`),
	check("exonerations_montant_fcfa_check", sql`montant_fcfa > 0`),
	check("exonerations_pourcentage_check", sql`(pourcentage > (0)::numeric) AND (pourcentage <= (100)::numeric)`),
]);

export const annonces = pgTable("annonces", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	anneeId: uuid("annee_id").notNull(),
	titre: text().notNull(),
	contenu: text().notNull(),
	cible: cibleDiffusion().default('TOUS').notNull(),
	niveauId: uuid("niveau_id"),
	classeId: uuid("classe_id"),
	pieceJointeUrl: text("piece_jointe_url"),
	epinglee: boolean().default(false).notNull(),
	publierLe: timestamp("publier_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	expireLe: timestamp("expire_le", { withTimezone: true, mode: 'string' }),
	publiee: boolean().default(true).notNull(),
	envoyerPush: boolean("envoyer_push").default(true).notNull(),
	publieePar: uuid("publiee_par"),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_annonces_classe").using("btree", table.classeId.asc().nullsLast().op("uuid_ops")).where(sql`(classe_id IS NOT NULL)`),
	index("idx_annonces_publication").using("btree", table.publierLe.desc().nullsFirst().op("timestamptz_ops")).where(sql`publiee`),
	foreignKey({
			columns: [table.anneeId],
			foreignColumns: [anneesScolaires.id],
			name: "annonces_annee_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.classeId],
			foreignColumns: [classes.id],
			name: "annonces_classe_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.niveauId],
			foreignColumns: [niveaux.id],
			name: "annonces_niveau_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.publieePar],
			foreignColumns: [utilisateurs.id],
			name: "annonces_publiee_par_fkey"
		}),
]);

export const appareils = pgTable("appareils", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	utilisateurId: uuid("utilisateur_id").notNull(),
	jetonFcm: text("jeton_fcm").notNull(),
	plateforme: text().notNull(),
	modele: text(),
	versionApp: text("version_app"),
	langue: text().default('fr').notNull(),
	actif: boolean().default(true).notNull(),
	derniereUtilisation: timestamp("derniere_utilisation", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_appareils_utilisateur").using("btree", table.utilisateurId.asc().nullsLast().op("uuid_ops")).where(sql`actif`),
	foreignKey({
			columns: [table.utilisateurId],
			foreignColumns: [utilisateurs.id],
			name: "appareils_utilisateur_id_fkey"
		}).onDelete("cascade"),
	unique("appareils_jeton_fcm_key").on(table.jetonFcm),
]);

export const notifications = pgTable("notifications", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	destinataireId: uuid("destinataire_id"),
	telephone: text(),
	eleveId: uuid("eleve_id"),
	type: typeNotification().notNull(),
	canal: canalNotification().notNull(),
	titre: text().notNull(),
	corps: text().notNull(),
	routeCible: text("route_cible"),
	donnees: jsonb(),
	statut: statutEnvoi().default('EN_ATTENTE').notNull(),
	tentatives: smallint().default(0).notNull(),
	erreur: text(),
	envoyeLe: timestamp("envoye_le", { withTimezone: true, mode: 'string' }),
	luLe: timestamp("lu_le", { withTimezone: true, mode: 'string' }),
	coutFcfa: integer("cout_fcfa"),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_notifications_destinataire").using("btree", table.destinataireId.asc().nullsLast().op("timestamptz_ops"), table.creeLe.desc().nullsFirst().op("uuid_ops")),
	index("idx_notifications_eleve").using("btree", table.eleveId.asc().nullsLast().op("timestamptz_ops"), table.creeLe.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_notifications_file").using("btree", table.creeLe.asc().nullsLast().op("timestamptz_ops")).where(sql`(statut = 'EN_ATTENTE'::statut_envoi)`),
	foreignKey({
			columns: [table.destinataireId],
			foreignColumns: [utilisateurs.id],
			name: "notifications_destinataire_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.eleveId],
			foreignColumns: [eleves.id],
			name: "notifications_eleve_id_fkey"
		}).onDelete("set null"),
	check("chk_destinataire", sql`(destinataire_id IS NOT NULL) OR (telephone IS NOT NULL)`),
]);

export const lecturesAnnonces = pgTable("lectures_annonces", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	annonceId: uuid("annonce_id").notNull(),
	utilisateurId: uuid("utilisateur_id").notNull(),
	luLe: timestamp("lu_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.annonceId],
			foreignColumns: [annonces.id],
			name: "lectures_annonces_annonce_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.utilisateurId],
			foreignColumns: [utilisateurs.id],
			name: "lectures_annonces_utilisateur_id_fkey"
		}).onDelete("cascade"),
	unique("lectures_annonces_annonce_id_utilisateur_id_key").on(table.annonceId, table.utilisateurId),
]);

export const convocations = pgTable("convocations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	eleveId: uuid("eleve_id"),
	tuteurId: uuid("tuteur_id"),
	motif: text().notNull(),
	dateRdv: date("date_rdv").notNull(),
	heureRdv: time("heure_rdv"),
	lieu: text(),
	convoquePar: uuid("convoque_par"),
	documentUrl: text("document_url"),
	honoree: boolean(),
	compteRendu: text("compte_rendu"),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_convocations_date").using("btree", table.dateRdv.desc().nullsFirst().op("date_ops")),
	foreignKey({
			columns: [table.convoquePar],
			foreignColumns: [utilisateurs.id],
			name: "convocations_convoque_par_fkey"
		}),
	foreignKey({
			columns: [table.eleveId],
			foreignColumns: [eleves.id],
			name: "convocations_eleve_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tuteurId],
			foreignColumns: [tuteurs.id],
			name: "convocations_tuteur_id_fkey"
		}).onDelete("cascade"),
]);

export const journalAudit = pgTable("journal_audit", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	utilisateurId: uuid("utilisateur_id"),
	roleActeur: roleUtilisateur("role_acteur"),
	nomActeur: text("nom_acteur"),
	action: text().notNull(),
	entite: text().notNull(),
	entiteId: uuid("entite_id"),
	eleveId: uuid("eleve_id"),
	valeursAvant: jsonb("valeurs_avant"),
	valeursApres: jsonb("valeurs_apres"),
	motif: text(),
	adresseIp: inet("adresse_ip"),
	userAgent: text("user_agent"),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_audit_date").using("btree", table.creeLe.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_audit_eleve").using("btree", table.eleveId.asc().nullsLast().op("timestamptz_ops"), table.creeLe.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_audit_entite").using("btree", table.entite.asc().nullsLast().op("timestamptz_ops"), table.entiteId.asc().nullsLast().op("uuid_ops"), table.creeLe.desc().nullsFirst().op("uuid_ops")),
	index("idx_audit_utilisateur").using("btree", table.utilisateurId.asc().nullsLast().op("timestamptz_ops"), table.creeLe.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.utilisateurId],
			foreignColumns: [utilisateurs.id],
			name: "journal_audit_utilisateur_id_fkey"
		}).onDelete("set null"),
]);

export const documentsEmis = pgTable("documents_emis", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	type: typeDocument().notNull(),
	numero: text().notNull(),
	eleveId: uuid("eleve_id"),
	classeId: uuid("classe_id"),
	anneeId: uuid("annee_id"),
	libelle: text().notNull(),
	fichierUrl: text("fichier_url"),
	donneesFigees: jsonb("donnees_figees"),
	emisPar: uuid("emis_par"),
	emisLe: timestamp("emis_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	codeVerification: text("code_verification"),
}, (table) => [
	index("idx_documents_eleve").using("btree", table.eleveId.asc().nullsLast().op("timestamptz_ops"), table.emisLe.desc().nullsFirst().op("uuid_ops")),
	index("idx_documents_type").using("btree", table.type.asc().nullsLast().op("timestamptz_ops"), table.emisLe.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.anneeId],
			foreignColumns: [anneesScolaires.id],
			name: "documents_emis_annee_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.classeId],
			foreignColumns: [classes.id],
			name: "documents_emis_classe_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.eleveId],
			foreignColumns: [eleves.id],
			name: "documents_emis_eleve_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.emisPar],
			foreignColumns: [utilisateurs.id],
			name: "documents_emis_emis_par_fkey"
		}),
	unique("documents_emis_numero_key").on(table.numero),
	unique("documents_emis_code_verification_key").on(table.codeVerification),
]);

export const permissions = pgTable("permissions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	role: roleUtilisateur().notNull(),
	action: text().notNull(),
	portee: text().default('AUCUNE').notNull(),
}, (table) => [
	index("idx_permissions_role").using("btree", table.role.asc().nullsLast().op("enum_ops")),
	unique("permissions_role_action_key").on(table.role, table.action),
]);

export const historiqueStatuts = pgTable("historique_statuts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	eleveId: uuid("eleve_id").notNull(),
	anneeId: uuid("annee_id"),
	ancienStatut: statutEleve("ancien_statut"),
	nouveauStatut: statutEleve("nouveau_statut").notNull(),
	motif: text().notNull(),
	dateEffet: date("date_effet").default(sql`CURRENT_DATE`).notNull(),
	dateFinPrevue: date("date_fin_prevue"),
	documentUrl: text("document_url"),
	sanctionId: uuid("sanction_id"),
	decidePar: uuid("decide_par"),
	parentsNotifies: boolean("parents_notifies").default(false).notNull(),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_historique_statuts_eleve").using("btree", table.eleveId.asc().nullsLast().op("timestamptz_ops"), table.creeLe.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.anneeId],
			foreignColumns: [anneesScolaires.id],
			name: "historique_statuts_annee_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.decidePar],
			foreignColumns: [utilisateurs.id],
			name: "historique_statuts_decide_par_fkey"
		}),
	foreignKey({
			columns: [table.eleveId],
			foreignColumns: [eleves.id],
			name: "historique_statuts_eleve_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.sanctionId],
			foreignColumns: [sanctions.id],
			name: "historique_statuts_sanction_id_fkey"
		}).onDelete("set null"),
]);

export const sequencesNumerotation = pgTable("sequences_numerotation", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	cle: text().notNull(),
	annee: smallint().notNull(),
	prefixe: text().notNull(),
	dernierNumero: integer("dernier_numero").default(0).notNull(),
	longueur: smallint().default(4).notNull(),
}, (table) => [
	unique("sequences_numerotation_cle_annee_key").on(table.cle, table.annee),
]);

export const parametres = pgTable("parametres", {
	cle: text().primaryKey().notNull(),
	valeur: text().notNull(),
	description: text(),
	modifieLe: timestamp("modifie_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	modifiePar: uuid("modifie_par"),
}, (table) => [
	foreignKey({
			columns: [table.modifiePar],
			foreignColumns: [utilisateurs.id],
			name: "parametres_modifie_par_fkey"
		}),
]);

export const remplacements = pgTable("remplacements", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	seanceId: uuid("seance_id"),
	emploiDuTempsId: uuid("emploi_du_temps_id"),
	enseignantAbsentId: uuid("enseignant_absent_id").notNull(),
	enseignantRemplacantId: uuid("enseignant_remplacant_id"),
	dateCours: date("date_cours").notNull(),
	motif: text().notNull(),
	dateRattrapage: date("date_rattrapage"),
	decidePar: uuid("decide_par"),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_remplacements_absent").using("btree", table.enseignantAbsentId.asc().nullsLast().op("date_ops"), table.dateCours.desc().nullsFirst().op("date_ops")),
	index("idx_remplacements_date").using("btree", table.dateCours.desc().nullsFirst().op("date_ops")),
	foreignKey({
			columns: [table.decidePar],
			foreignColumns: [utilisateurs.id],
			name: "remplacements_decide_par_fkey"
		}),
	foreignKey({
			columns: [table.emploiDuTempsId],
			foreignColumns: [emploiDuTemps.id],
			name: "remplacements_emploi_du_temps_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.enseignantAbsentId],
			foreignColumns: [enseignants.id],
			name: "remplacements_enseignant_absent_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.enseignantRemplacantId],
			foreignColumns: [enseignants.id],
			name: "remplacements_enseignant_remplacant_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.seanceId],
			foreignColumns: [seances.id],
			name: "remplacements_seance_id_fkey"
		}).onDelete("cascade"),
	check("chk_remplacant", sql`enseignant_remplacant_id IS DISTINCT FROM enseignant_absent_id`),
]);

export const eleves = pgTable("eleves", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	matricule: text().notNull(),
	nom: text().notNull(),
	prenom: text().notNull(),
	sexe: sexeType().notNull(),
	dateNaissance: date("date_naissance").notNull(),
	lieuNaissance: text("lieu_naissance"),
	nationalite: text().default('Tchadienne'),
	acteNaissanceNumero: text("acte_naissance_numero"),
	adresse: text(),
	quartier: text(),
	photoUrl: text("photo_url"),
	groupeSanguin: text("groupe_sanguin"),
	allergies: text(),
	observationsMedicales: text("observations_medicales"),
	ecoleOrigine: text("ecole_origine"),
	statut: statutEleve().default('PRE_INSCRIT').notNull(),
	datePremiereInscription: date("date_premiere_inscription"),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	modifieLe: timestamp("modifie_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	telephone: text(),
	email: text(),
	situationParticuliere: text("situation_particuliere"),
	urgenceNom: text("urgence_nom"),
	urgenceTelephone: text("urgence_telephone"),
	urgenceLien: text("urgence_lien"),
}, (table) => [
	index("idx_eleves_nom").using("btree", table.nom.asc().nullsLast().op("text_ops"), table.prenom.asc().nullsLast().op("text_ops")),
	index("idx_eleves_recherche").using("gin", sql`to_tsvector('french'::regconfig, ((((matricule || ' '::text) ||`),
	index("idx_eleves_statut").using("btree", table.statut.asc().nullsLast().op("enum_ops")),
	unique("eleves_matricule_key").on(table.matricule),
	check("chk_naissance", sql`date_naissance < CURRENT_DATE`),
]);

export const enseignantMatieres = pgTable("enseignant_matieres", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	enseignantId: uuid("enseignant_id").notNull(),
	matiereId: uuid("matiere_id").notNull(),
	estPrincipale: boolean("est_principale").default(false).notNull(),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_enseignant_matieres_ens").using("btree", table.enseignantId.asc().nullsLast().op("uuid_ops")),
	index("idx_enseignant_matieres_mat").using("btree", table.matiereId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("uq_matiere_principale").using("btree", table.enseignantId.asc().nullsLast().op("uuid_ops")).where(sql`est_principale`),
	foreignKey({
			columns: [table.enseignantId],
			foreignColumns: [enseignants.id],
			name: "enseignant_matieres_enseignant_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.matiereId],
			foreignColumns: [matieres.id],
			name: "enseignant_matieres_matiere_id_fkey"
		}).onDelete("cascade"),
	unique("enseignant_matieres_enseignant_id_matiere_id_key").on(table.enseignantId, table.matiereId),
]);

export const indisponibilites = pgTable("indisponibilites", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	enseignantId: uuid("enseignant_id").notNull(),
	anneeId: uuid("annee_id").notNull(),
	jourSemaine: smallint("jour_semaine").notNull(),
	creneauId: uuid("creneau_id"),
	motif: text(),
	creeLe: timestamp("cree_le", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("uq_indisponibilite").using("btree", sql`annee_id`, sql`enseignant_id`, sql`jour_semaine`, sql`COALESCE(creneau_id, '00000000-0000-0000-0000-000000000000'::uu`),
	foreignKey({
			columns: [table.anneeId],
			foreignColumns: [anneesScolaires.id],
			name: "indisponibilites_annee_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.creneauId],
			foreignColumns: [creneauxHoraires.id],
			name: "indisponibilites_creneau_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.enseignantId],
			foreignColumns: [enseignants.id],
			name: "indisponibilites_enseignant_id_fkey"
		}).onDelete("cascade"),
	check("indisponibilites_jour_semaine_check", sql`(jour_semaine >= 1) AND (jour_semaine <= 7)`),
]);
export const vAssiduitePeriode = pgView("v_assiduite_periode", {	inscriptionId: uuid("inscription_id"),
	periodeId: uuid("periode_id"),
	heuresJustifiees: numeric("heures_justifiees"),
	heuresNonJustifiees: numeric("heures_non_justifiees"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	nbAbsences: bigint("nb_absences", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	nbRetards: bigint("nb_retards", { mode: "number" }),
}).as(sql`SELECT i.id AS inscription_id, p.id AS periode_id, COALESCE(sum(a.nb_heures) FILTER (WHERE a.statut = 'JUSTIFIEE'::statut_justification), 0::numeric) AS heures_justifiees, COALESCE(sum(a.nb_heures) FILTER (WHERE a.statut <> 'JUSTIFIEE'::statut_justification), 0::numeric) AS heures_non_justifiees, COALESCE(count(DISTINCT a.id), 0::bigint) AS nb_absences, COALESCE(( SELECT count(*) AS count FROM retards r WHERE r.inscription_id = i.id AND r.periode_id = p.id), 0::bigint) AS nb_retards FROM inscriptions i JOIN periodes p ON p.annee_id = i.annee_id LEFT JOIN absences a ON a.inscription_id = i.id AND a.periode_id = p.id WHERE i.active GROUP BY i.id, p.id`);

export const vSituationFinanciere = pgView("v_situation_financiere", {	inscriptionId: uuid("inscription_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalDuFcfa: bigint("total_du_fcfa", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalPayeFcfa: bigint("total_paye_fcfa", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalExonereFcfa: bigint("total_exonere_fcfa", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	resteDuFcfa: bigint("reste_du_fcfa", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	nbEcheancesEnRetard: bigint("nb_echeances_en_retard", { mode: "number" }),
	prochaineEcheance: date("prochaine_echeance"),
}).as(sql`SELECT inscription_id, sum(montant_du_fcfa) AS total_du_fcfa, sum(montant_paye_fcfa) AS total_paye_fcfa, sum(montant_exonere_fcfa) AS total_exonere_fcfa, sum(montant_du_fcfa - montant_paye_fcfa - montant_exonere_fcfa) AS reste_du_fcfa, count(*) FILTER (WHERE statut = 'EN_RETARD'::statut_echeance) AS nb_echeances_en_retard, min(date_limite) FILTER (WHERE statut = ANY (ARRAY['A_PAYER'::statut_echeance, 'PARTIEL'::statut_echeance, 'EN_RETARD'::statut_echeance])) AS prochaine_echeance FROM echeances e GROUP BY inscription_id`);

export const vChargeEnseignant = pgView("v_charge_enseignant", {	enseignantId: uuid("enseignant_id"),
	anneeId: uuid("annee_id"),
	heuresContractuelles: numeric("heures_contractuelles", { precision: 4, scale:  1 }),
	heuresAffectees: numeric("heures_affectees"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	creneauxPlaces: bigint("creneaux_places", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	nbAffectations: bigint("nb_affectations", { mode: "number" }),
}).as(sql`SELECT e.id AS enseignant_id, a.id AS annee_id, e.heures_contractuelles, COALESCE(sum(DISTINCT af.heures_semaine), 0::numeric) AS heures_affectees, ( SELECT COALESCE(sum(edt.nb_creneaux), 0::bigint) AS "coalesce" FROM emploi_du_temps edt WHERE edt.enseignant_id = e.id AND edt.annee_id = a.id) AS creneaux_places, ( SELECT count(*) AS count FROM affectations x WHERE x.enseignant_id = e.id AND x.annee_id = a.id AND x.active) AS nb_affectations FROM enseignants e CROSS JOIN annees_scolaires a LEFT JOIN affectations af ON af.enseignant_id = e.id AND af.annee_id = a.id AND af.active WHERE e.actif GROUP BY e.id, a.id, e.heures_contractuelles`);