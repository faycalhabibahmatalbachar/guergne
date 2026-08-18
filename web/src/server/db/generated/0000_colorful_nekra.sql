-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TYPE "public"."canal_notification" AS ENUM('PUSH', 'SMS', 'EMAIL', 'IN_APP');--> statement-breakpoint
CREATE TYPE "public"."cible_diffusion" AS ENUM('TOUS', 'NIVEAU', 'CLASSE', 'ELEVE', 'ENSEIGNANTS', 'PERSONNEL');--> statement-breakpoint
CREATE TYPE "public"."cycle_scolaire" AS ENUM('COLLEGE', 'LYCEE');--> statement-breakpoint
CREATE TYPE "public"."decision_fin_annee" AS ENUM('ADMIS', 'ADMIS_CONDITION', 'REDOUBLE', 'EXCLU', 'REORIENTE', 'EN_ATTENTE');--> statement-breakpoint
CREATE TYPE "public"."gravite_incident" AS ENUM('MINEURE', 'MOYENNE', 'GRAVE', 'TRES_GRAVE');--> statement-breakpoint
CREATE TYPE "public"."lien_parente" AS ENUM('PERE', 'MERE', 'TUTEUR', 'ONCLE', 'TANTE', 'GRAND_PARENT', 'FRERE_SOEUR', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."mention_bulletin" AS ENUM('FELICITATIONS', 'ENCOURAGEMENTS', 'TABLEAU_HONNEUR', 'AVERTISSEMENT_TRAVAIL', 'AVERTISSEMENT_CONDUITE', 'BLAME', 'AUCUNE');--> statement-breakpoint
CREATE TYPE "public"."mode_paiement" AS ENUM('ESPECES', 'MOBILE_MONEY', 'VIREMENT', 'CHEQUE', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."motif_exoneration" AS ENUM('BOURSE', 'FRATRIE', 'CAS_SOCIAL', 'ENFANT_PERSONNEL', 'MERITE', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."nature_frais" AS ENUM('INSCRIPTION', 'REINSCRIPTION', 'SCOLARITE', 'APE', 'TENUE', 'EXAMEN', 'FOURNITURES', 'TRANSPORT', 'CANTINE', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."role_utilisateur" AS ENUM('SUPER_ADMIN', 'DIRECTION', 'CENSEUR', 'SURVEILLANT', 'SECRETARIAT', 'COMPTABLE', 'ENSEIGNANT', 'PARENT', 'ELEVE');--> statement-breakpoint
CREATE TYPE "public"."sexe_type" AS ENUM('M', 'F');--> statement-breakpoint
CREATE TYPE "public"."statut_echeance" AS ENUM('A_PAYER', 'PARTIEL', 'PAYE', 'EN_RETARD', 'EXONERE');--> statement-breakpoint
CREATE TYPE "public"."statut_eleve" AS ENUM('PRE_INSCRIT', 'INSCRIT', 'SUSPENDU_DISCIPLINE', 'SUSPENDU_IMPAYE', 'EXCLU', 'TRANSFERE', 'ABANDON', 'DIPLOME');--> statement-breakpoint
CREATE TYPE "public"."statut_envoi" AS ENUM('EN_ATTENTE', 'ENVOYE', 'ECHOUE', 'LU');--> statement-breakpoint
CREATE TYPE "public"."statut_justification" AS ENUM('NON_JUSTIFIEE', 'JUSTIFIEE', 'EN_ATTENTE');--> statement-breakpoint
CREATE TYPE "public"."statut_note" AS ENUM('NOTEE', 'ABSENT', 'ABSENT_ZERO', 'DISPENSE', 'NON_RENDU');--> statement-breakpoint
CREATE TYPE "public"."type_absence" AS ENUM('COURS', 'JOURNEE', 'DEMI_JOURNEE');--> statement-breakpoint
CREATE TYPE "public"."type_document" AS ENUM('CERTIFICAT_SCOLARITE', 'CERTIFICAT_TRANSFERT', 'ATTESTATION_FREQUENTATION', 'CARTE_SCOLAIRE', 'BULLETIN', 'BULLETIN_ANNUEL', 'RECU_PAIEMENT', 'CONVOCATION', 'NOTIFICATION_SANCTION', 'PV_CONSEIL_CLASSE', 'PV_CONSEIL_DISCIPLINE', 'LISTE_APPEL', 'LISTE_EXAMEN', 'PALMARES', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."type_evaluation" AS ENUM('INTERROGATION', 'DEVOIR', 'COMPOSITION', 'EXAMEN_BLANC', 'TP', 'ORAL');--> statement-breakpoint
CREATE TYPE "public"."type_evenement" AS ENUM('VACANCES', 'FERIE', 'COMPOSITION', 'EXAMEN_BLANC', 'REUNION_PARENTS', 'CONSEIL_CLASSE', 'RENTREE', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."type_inscription" AS ENUM('INSCRIPTION', 'REINSCRIPTION', 'TRANSFERT_ENTRANT');--> statement-breakpoint
CREATE TYPE "public"."type_notification" AS ENUM('ABSENCE', 'RETARD', 'NOTE_PUBLIEE', 'BULLETIN_PUBLIE', 'INCIDENT', 'SANCTION', 'ECHEANCE_PAIEMENT', 'PAIEMENT_RECU', 'ANNONCE', 'CONVOCATION', 'CHANGEMENT_STATUT', 'DEVOIR', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."type_periode" AS ENUM('TRIMESTRE', 'SEMESTRE');--> statement-breakpoint
CREATE TYPE "public"."type_piece" AS ENUM('ACTE_NAISSANCE', 'PHOTO', 'BULLETIN_ANTERIEUR', 'CERTIFICAT_TRANSFERT', 'CERTIFICAT_MEDICAL', 'PIECE_IDENTITE_TUTEUR', 'JUSTIFICATIF_ABSENCE', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."type_salle" AS ENUM('CLASSE', 'LABORATOIRE', 'INFORMATIQUE', 'AMPHI', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."type_sanction" AS ENUM('AVERTISSEMENT_ORAL', 'AVERTISSEMENT_ECRIT', 'RETENUE', 'TRAVAIL_INTERET_GENERAL', 'EXCLUSION_COURS', 'EXCLUSION_TEMPORAIRE', 'CONSEIL_DISCIPLINE', 'EXCLUSION_DEFINITIVE');--> statement-breakpoint
CREATE TABLE "_migrations" (
	"nom" text PRIMARY KEY NOT NULL,
	"applique_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "etablissement" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"nom" text DEFAULT 'Lycée Guergné La Renaissance' NOT NULL,
	"sigle" text DEFAULT 'LGR' NOT NULL,
	"adresse" text,
	"ville" text DEFAULT 'N''Djamena',
	"pays" text DEFAULT 'Tchad',
	"telephone" text,
	"email" text,
	"site_web" text,
	"logo_url" text,
	"devise" text DEFAULT 'FCFA' NOT NULL,
	"ministere_tutelle" text DEFAULT 'Ministère de l''Éducation Nationale',
	"autorisation_numero" text,
	"nom_proviseur" text,
	"nom_censeur" text,
	"note_maximale" numeric(5, 2) DEFAULT '20.00' NOT NULL,
	"moyenne_passage" numeric(5, 2) DEFAULT '10.00' NOT NULL,
	"seuil_alerte_absence_heures" integer DEFAULT 12 NOT NULL,
	"bloquer_bulletin_si_impaye" boolean DEFAULT false NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "etablissement_id_check" CHECK (CHECK (id))
);
--> statement-breakpoint
CREATE TABLE "annees_scolaires" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"libelle" text NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date NOT NULL,
	"type_periode" "type_periode" DEFAULT 'TRIMESTRE' NOT NULL,
	"est_courante" boolean DEFAULT false NOT NULL,
	"est_cloturee" boolean DEFAULT false NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "annees_scolaires_libelle_key" UNIQUE("libelle"),
	CONSTRAINT "chk_annee_dates" CHECK (date_fin > date_debut)
);
--> statement-breakpoint
CREATE TABLE "periodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"annee_id" uuid NOT NULL,
	"numero" smallint NOT NULL,
	"libelle" text NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date NOT NULL,
	"saisie_ouverte" boolean DEFAULT true NOT NULL,
	"date_cloture_saisie" date,
	"est_verrouillee" boolean DEFAULT false NOT NULL,
	"verrouillee_le" timestamp with time zone,
	"verrouillee_par" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "periodes_annee_id_numero_key" UNIQUE("annee_id","numero"),
	CONSTRAINT "chk_periode_dates" CHECK (date_fin > date_debut)
);
--> statement-breakpoint
CREATE TABLE "niveaux" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"libelle" text NOT NULL,
	"cycle" "cycle_scolaire" NOT NULL,
	"ordre" smallint NOT NULL,
	"niveau_suivant_id" uuid,
	"series_applicables" boolean DEFAULT false NOT NULL,
	CONSTRAINT "niveaux_code_key" UNIQUE("code"),
	CONSTRAINT "niveaux_ordre_key" UNIQUE("ordre")
);
--> statement-breakpoint
CREATE TABLE "coefficients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"annee_id" uuid NOT NULL,
	"matiere_id" uuid NOT NULL,
	"niveau_id" uuid NOT NULL,
	"serie_id" uuid,
	"coefficient" numeric(4, 2) NOT NULL,
	"poids_interro" numeric(4, 2) DEFAULT '1.00' NOT NULL,
	"poids_devoir" numeric(4, 2) DEFAULT '1.00' NOT NULL,
	"poids_composition" numeric(4, 2) DEFAULT '2.00' NOT NULL,
	"obligatoire" boolean DEFAULT true NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coefficients_coefficient_check" CHECK (coefficient > (0)::numeric)
);
--> statement-breakpoint
CREATE TABLE "matieres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"libelle" text NOT NULL,
	"libelle_court" text,
	"couleur" text DEFAULT '#64748b',
	"ordre_bulletin" smallint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matieres_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"libelle" text NOT NULL,
	"description" text,
	"ordre" smallint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "series_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "salles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"libelle" text NOT NULL,
	"type" "type_salle" DEFAULT 'CLASSE' NOT NULL,
	"capacite" smallint,
	"batiment" text,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "salles_code_key" UNIQUE("code"),
	CONSTRAINT "salles_capacite_check" CHECK (capacite > 0)
);
--> statement-breakpoint
CREATE TABLE "evenements_calendrier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"annee_id" uuid NOT NULL,
	"type" "type_evenement" NOT NULL,
	"titre" text NOT NULL,
	"description" text,
	"date_debut" date NOT NULL,
	"date_fin" date NOT NULL,
	"niveau_id" uuid,
	"classe_id" uuid,
	"visible_parents" boolean DEFAULT true NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_evt_dates" CHECK (date_fin >= date_debut)
);
--> statement-breakpoint
CREATE TABLE "utilisateurs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"telephone" text,
	"mot_de_passe_hash" text,
	"role" "role_utilisateur" NOT NULL,
	"nom" text NOT NULL,
	"prenom" text NOT NULL,
	"photo_url" text,
	"actif" boolean DEFAULT true NOT NULL,
	"doit_changer_mdp" boolean DEFAULT false NOT NULL,
	"derniere_connexion" timestamp with time zone,
	"tentatives_echouees" smallint DEFAULT 0 NOT NULL,
	"verrouille_jusqua" timestamp with time zone,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "utilisateurs_email_key" UNIQUE("email"),
	CONSTRAINT "utilisateurs_telephone_key" UNIQUE("telephone"),
	CONSTRAINT "chk_identifiant" CHECK ((email IS NOT NULL) OR (telephone IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utilisateur_id" uuid NOT NULL,
	"jeton_hash" text NOT NULL,
	"adresse_ip" "inet",
	"user_agent" text,
	"expire_le" timestamp with time zone NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_jeton_hash_key" UNIQUE("jeton_hash")
);
--> statement-breakpoint
CREATE TABLE "jetons_rafraichissement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utilisateur_id" uuid NOT NULL,
	"jeton_hash" text NOT NULL,
	"appareil_id" text,
	"revoque" boolean DEFAULT false NOT NULL,
	"remplace_par" uuid,
	"expire_le" timestamp with time zone NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jetons_rafraichissement_jeton_hash_key" UNIQUE("jeton_hash")
);
--> statement-breakpoint
CREATE TABLE "codes_activation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telephone" text NOT NULL,
	"code_hash" text NOT NULL,
	"tentatives" smallint DEFAULT 0 NOT NULL,
	"consomme" boolean DEFAULT false NOT NULL,
	"expire_le" timestamp with time zone NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enseignants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utilisateur_id" uuid,
	"matricule" text NOT NULL,
	"nom" text NOT NULL,
	"prenom" text NOT NULL,
	"sexe" "sexe_type",
	"date_naissance" date,
	"telephone" text,
	"email" text,
	"adresse" text,
	"diplome" text,
	"specialite" text,
	"date_embauche" date,
	"type_contrat" text,
	"photo_url" text,
	"actif" boolean DEFAULT true NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enseignants_utilisateur_id_key" UNIQUE("utilisateur_id"),
	CONSTRAINT "enseignants_matricule_key" UNIQUE("matricule")
);
--> statement-breakpoint
CREATE TABLE "tuteurs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utilisateur_id" uuid,
	"nom" text NOT NULL,
	"prenom" text NOT NULL,
	"sexe" "sexe_type",
	"telephone" text NOT NULL,
	"telephone_secondaire" text,
	"email" text,
	"profession" text,
	"employeur" text,
	"adresse" text,
	"quartier" text,
	"piece_identite" text,
	"app_activee" boolean DEFAULT false NOT NULL,
	"app_activee_le" timestamp with time zone,
	"accepte_sms" boolean DEFAULT true NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tuteurs_utilisateur_id_key" UNIQUE("utilisateur_id")
);
--> statement-breakpoint
CREATE TABLE "eleves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matricule" text NOT NULL,
	"nom" text NOT NULL,
	"prenom" text NOT NULL,
	"sexe" "sexe_type" NOT NULL,
	"date_naissance" date NOT NULL,
	"lieu_naissance" text,
	"nationalite" text DEFAULT 'Tchadienne',
	"acte_naissance_numero" text,
	"adresse" text,
	"quartier" text,
	"photo_url" text,
	"groupe_sanguin" text,
	"allergies" text,
	"observations_medicales" text,
	"ecole_origine" text,
	"statut" "statut_eleve" DEFAULT 'PRE_INSCRIT' NOT NULL,
	"date_premiere_inscription" date,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eleves_matricule_key" UNIQUE("matricule"),
	CONSTRAINT "chk_naissance" CHECK (date_naissance < CURRENT_DATE)
);
--> statement-breakpoint
CREATE TABLE "eleve_tuteur" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eleve_id" uuid NOT NULL,
	"tuteur_id" uuid NOT NULL,
	"lien" "lien_parente" NOT NULL,
	"est_principal" boolean DEFAULT false NOT NULL,
	"est_responsable_financier" boolean DEFAULT false NOT NULL,
	"autorise_retrait" boolean DEFAULT true NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eleve_tuteur_eleve_id_tuteur_id_key" UNIQUE("eleve_id","tuteur_id")
);
--> statement-breakpoint
CREATE TABLE "pieces_dossier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eleve_id" uuid NOT NULL,
	"type" "type_piece" NOT NULL,
	"libelle" text NOT NULL,
	"fichier_url" text NOT NULL,
	"taille_octets" integer,
	"mime_type" text,
	"depose_par" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"annee_id" uuid NOT NULL,
	"niveau_id" uuid NOT NULL,
	"serie_id" uuid,
	"libelle" text NOT NULL,
	"code" text NOT NULL,
	"capacite_max" smallint DEFAULT 60 NOT NULL,
	"salle_id" uuid,
	"professeur_principal_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_annee_id_code_key" UNIQUE("annee_id","code"),
	CONSTRAINT "classes_capacite_max_check" CHECK (capacite_max > 0)
);
--> statement-breakpoint
CREATE TABLE "inscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eleve_id" uuid NOT NULL,
	"annee_id" uuid NOT NULL,
	"classe_id" uuid NOT NULL,
	"type" "type_inscription" DEFAULT 'INSCRIPTION' NOT NULL,
	"numero_ordre" smallint,
	"date_inscription" date DEFAULT CURRENT_DATE NOT NULL,
	"est_redoublant" boolean DEFAULT false NOT NULL,
	"est_boursier" boolean DEFAULT false NOT NULL,
	"date_sortie" date,
	"motif_sortie" text,
	"active" boolean DEFAULT true NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inscriptions_eleve_id_annee_id_key" UNIQUE("eleve_id","annee_id")
);
--> statement-breakpoint
CREATE TABLE "changements_classe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscription_id" uuid NOT NULL,
	"classe_origine_id" uuid NOT NULL,
	"classe_destination_id" uuid NOT NULL,
	"motif" text NOT NULL,
	"date_effet" date DEFAULT CURRENT_DATE NOT NULL,
	"decide_par" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_classes_differentes" CHECK (classe_origine_id <> classe_destination_id)
);
--> statement-breakpoint
CREATE TABLE "affectations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"annee_id" uuid NOT NULL,
	"enseignant_id" uuid NOT NULL,
	"classe_id" uuid NOT NULL,
	"matiere_id" uuid NOT NULL,
	"heures_semaine" numeric(4, 2),
	"active" boolean DEFAULT true NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affectations_annee_id_classe_id_matiere_id_key" UNIQUE("annee_id","classe_id","matiere_id")
);
--> statement-breakpoint
CREATE TABLE "emploi_du_temps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"annee_id" uuid NOT NULL,
	"classe_id" uuid NOT NULL,
	"matiere_id" uuid NOT NULL,
	"enseignant_id" uuid,
	"salle_id" uuid,
	"jour_semaine" smallint NOT NULL,
	"creneau_id" uuid NOT NULL,
	"semaine_type" char(1),
	"publie" boolean DEFAULT false NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_edt_classe_creneau" UNIQUE("annee_id","classe_id","jour_semaine","creneau_id","semaine_type"),
	CONSTRAINT "emploi_du_temps_jour_semaine_check" CHECK ((jour_semaine >= 1) AND (jour_semaine <= 7)),
	CONSTRAINT "emploi_du_temps_semaine_type_check" CHECK (semaine_type = ANY (ARRAY['A'::bpchar, 'B'::bpchar]))
);
--> statement-breakpoint
CREATE TABLE "creneaux_horaires" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"libelle" text NOT NULL,
	"heure_debut" time NOT NULL,
	"heure_fin" time NOT NULL,
	"ordre" smallint NOT NULL,
	CONSTRAINT "creneaux_horaires_ordre_key" UNIQUE("ordre"),
	CONSTRAINT "chk_creneau" CHECK (heure_fin > heure_debut)
);
--> statement-breakpoint
CREATE TABLE "seances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"emploi_du_temps_id" uuid,
	"classe_id" uuid NOT NULL,
	"matiere_id" uuid NOT NULL,
	"enseignant_id" uuid,
	"date_seance" date NOT NULL,
	"creneau_id" uuid,
	"contenu" text,
	"travail_a_faire" text,
	"assuree" boolean DEFAULT true NOT NULL,
	"motif_non_assuree" text,
	"appel_effectue" boolean DEFAULT false NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"annee_id" uuid NOT NULL,
	"periode_id" uuid NOT NULL,
	"classe_id" uuid NOT NULL,
	"matiere_id" uuid NOT NULL,
	"enseignant_id" uuid,
	"type" "type_evaluation" NOT NULL,
	"titre" text NOT NULL,
	"date_evaluation" date NOT NULL,
	"bareme" numeric(5, 2) DEFAULT '20.00' NOT NULL,
	"poids" numeric(4, 2) DEFAULT '1.00' NOT NULL,
	"compte_dans_moyenne" boolean DEFAULT true NOT NULL,
	"observations" text,
	"est_verrouillee" boolean DEFAULT false NOT NULL,
	"cree_par" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluations_bareme_check" CHECK (bareme > (0)::numeric),
	CONSTRAINT "evaluations_poids_check" CHECK (poids > (0)::numeric)
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"inscription_id" uuid NOT NULL,
	"valeur" numeric(5, 2),
	"statut" "statut_note" DEFAULT 'NOTEE' NOT NULL,
	"appreciation" text,
	"saisie_par" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_evaluation_id_inscription_id_key" UNIQUE("evaluation_id","inscription_id"),
	CONSTRAINT "chk_note_coherente" CHECK (((statut = 'NOTEE'::statut_note) AND (valeur IS NOT NULL)) OR (statut <> 'NOTEE'::statut_note)),
	CONSTRAINT "notes_valeur_check" CHECK (valeur >= (0)::numeric)
);
--> statement-breakpoint
CREATE TABLE "historique_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"ancienne_valeur" numeric(5, 2),
	"nouvelle_valeur" numeric(5, 2),
	"ancien_statut" "statut_note",
	"nouveau_statut" "statut_note",
	"motif" text,
	"modifie_par" uuid,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appreciations_matiere" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscription_id" uuid NOT NULL,
	"periode_id" uuid NOT NULL,
	"matiere_id" uuid NOT NULL,
	"enseignant_id" uuid,
	"appreciation" text NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appreciations_matiere_inscription_id_periode_id_matiere_id_key" UNIQUE("inscription_id","periode_id","matiere_id")
);
--> statement-breakpoint
CREATE TABLE "moyennes_matiere" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscription_id" uuid NOT NULL,
	"periode_id" uuid NOT NULL,
	"matiere_id" uuid NOT NULL,
	"moyenne" numeric(5, 2),
	"coefficient" numeric(4, 2) NOT NULL,
	"points" numeric(7, 2),
	"rang_matiere" smallint,
	"moyenne_classe" numeric(5, 2),
	"note_min_classe" numeric(5, 2),
	"note_max_classe" numeric(5, 2),
	"nb_evaluations" smallint DEFAULT 0 NOT NULL,
	"calcule_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moyennes_matiere_inscription_id_periode_id_matiere_id_key" UNIQUE("inscription_id","periode_id","matiere_id")
);
--> statement-breakpoint
CREATE TABLE "moyennes_generales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscription_id" uuid NOT NULL,
	"periode_id" uuid NOT NULL,
	"moyenne" numeric(5, 2),
	"total_points" numeric(8, 2),
	"total_coefficients" numeric(6, 2),
	"rang" smallint,
	"est_ex_aequo" boolean DEFAULT false NOT NULL,
	"effectif_classe" smallint,
	"moyenne_classe" numeric(5, 2),
	"moyenne_min_classe" numeric(5, 2),
	"moyenne_max_classe" numeric(5, 2),
	"calcule_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moyennes_generales_inscription_id_periode_id_key" UNIQUE("inscription_id","periode_id")
);
--> statement-breakpoint
CREATE TABLE "conseils_classe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"classe_id" uuid NOT NULL,
	"periode_id" uuid NOT NULL,
	"date_conseil" date NOT NULL,
	"president" text,
	"secretaire" text,
	"participants" text,
	"observations" text,
	"est_valide" boolean DEFAULT false NOT NULL,
	"valide_par" uuid,
	"valide_le" timestamp with time zone,
	"proces_verbal_url" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conseils_classe_classe_id_periode_id_key" UNIQUE("classe_id","periode_id")
);
--> statement-breakpoint
CREATE TABLE "bulletins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscription_id" uuid NOT NULL,
	"periode_id" uuid NOT NULL,
	"conseil_classe_id" uuid,
	"moyenne_generale" numeric(5, 2),
	"rang" smallint,
	"effectif_classe" smallint,
	"moyenne_classe" numeric(5, 2),
	"heures_absence_justifiees" numeric(6, 2) DEFAULT '0' NOT NULL,
	"heures_absence_non_justifiees" numeric(6, 2) DEFAULT '0' NOT NULL,
	"nb_retards" smallint DEFAULT 0 NOT NULL,
	"note_conduite" numeric(5, 2),
	"appreciation_generale" text,
	"mention" "mention_bulletin" DEFAULT 'AUCUNE' NOT NULL,
	"decision" "decision_fin_annee",
	"est_publie" boolean DEFAULT false NOT NULL,
	"publie_le" timestamp with time zone,
	"publie_par" uuid,
	"pdf_url" text,
	"genere_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bulletins_inscription_id_periode_id_key" UNIQUE("inscription_id","periode_id")
);
--> statement-breakpoint
CREATE TABLE "bulletins_annuels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscription_id" uuid NOT NULL,
	"moyenne_t1" numeric(5, 2),
	"moyenne_t2" numeric(5, 2),
	"moyenne_t3" numeric(5, 2),
	"moyenne_annuelle" numeric(5, 2),
	"rang_annuel" smallint,
	"effectif_classe" smallint,
	"decision" "decision_fin_annee" DEFAULT 'EN_ATTENTE' NOT NULL,
	"mention" "mention_bulletin" DEFAULT 'AUCUNE' NOT NULL,
	"appreciation" text,
	"niveau_suivant_id" uuid,
	"est_publie" boolean DEFAULT false NOT NULL,
	"pdf_url" text,
	"genere_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bulletins_annuels_inscription_id_key" UNIQUE("inscription_id")
);
--> statement-breakpoint
CREATE TABLE "devoirs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"classe_id" uuid NOT NULL,
	"matiere_id" uuid NOT NULL,
	"enseignant_id" uuid,
	"titre" text NOT NULL,
	"consigne" text,
	"date_publication" date DEFAULT CURRENT_DATE NOT NULL,
	"date_remise" date NOT NULL,
	"fichier_url" text,
	"publie" boolean DEFAULT true NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ressources_pedagogiques" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"classe_id" uuid,
	"matiere_id" uuid,
	"enseignant_id" uuid,
	"titre" text NOT NULL,
	"description" text,
	"fichier_url" text NOT NULL,
	"taille_octets" integer,
	"mime_type" text,
	"visible_parents" boolean DEFAULT true NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "absences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscription_id" uuid NOT NULL,
	"periode_id" uuid NOT NULL,
	"type" "type_absence" DEFAULT 'COURS' NOT NULL,
	"date_absence" date NOT NULL,
	"seance_id" uuid,
	"matiere_id" uuid,
	"creneau_id" uuid,
	"nb_heures" numeric(4, 2) DEFAULT '1.00' NOT NULL,
	"statut" "statut_justification" DEFAULT 'NON_JUSTIFIEE' NOT NULL,
	"motif" text,
	"justificatif_url" text,
	"justifiee_par" uuid,
	"justifiee_le" timestamp with time zone,
	"parents_notifies" boolean DEFAULT false NOT NULL,
	"notifie_le" timestamp with time zone,
	"saisie_par" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "absences_nb_heures_check" CHECK (nb_heures > (0)::numeric)
);
--> statement-breakpoint
CREATE TABLE "retards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscription_id" uuid NOT NULL,
	"periode_id" uuid NOT NULL,
	"date_retard" date NOT NULL,
	"heure_arrivee" time,
	"duree_minutes" smallint,
	"matiere_id" uuid,
	"statut" "statut_justification" DEFAULT 'NON_JUSTIFIEE' NOT NULL,
	"motif" text,
	"parents_notifies" boolean DEFAULT false NOT NULL,
	"saisie_par" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retards_duree_minutes_check" CHECK (duree_minutes >= 0)
);
--> statement-breakpoint
CREATE TABLE "sorties_anticipees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscription_id" uuid NOT NULL,
	"date_sortie" date NOT NULL,
	"heure_sortie" time NOT NULL,
	"motif" text NOT NULL,
	"recupere_par_tuteur_id" uuid,
	"autorise_par" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscription_id" uuid NOT NULL,
	"periode_id" uuid NOT NULL,
	"date_incident" date NOT NULL,
	"heure_incident" time,
	"lieu" text,
	"gravite" "gravite_incident" DEFAULT 'MINEURE' NOT NULL,
	"description" text NOT NULL,
	"temoins" text,
	"signale_par" uuid,
	"parents_notifies" boolean DEFAULT false NOT NULL,
	"notifie_le" timestamp with time zone,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sanctions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscription_id" uuid NOT NULL,
	"incident_id" uuid,
	"periode_id" uuid NOT NULL,
	"type" "type_sanction" NOT NULL,
	"motif" text NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date,
	"duree_jours" smallint,
	"executee" boolean DEFAULT false NOT NULL,
	"executee_le" date,
	"impacte_statut" boolean DEFAULT false NOT NULL,
	"prononcee_par" uuid,
	"parents_notifies" boolean DEFAULT false NOT NULL,
	"document_url" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_sanction_dates" CHECK ((date_fin IS NULL) OR (date_fin >= date_debut))
);
--> statement-breakpoint
CREATE TABLE "conseils_discipline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscription_id" uuid NOT NULL,
	"date_convocation" date NOT NULL,
	"date_seance" date NOT NULL,
	"motif" text NOT NULL,
	"participants" text,
	"tuteur_convoque" boolean DEFAULT true NOT NULL,
	"tuteur_present" boolean,
	"deliberation" text,
	"decision" text,
	"sanction_id" uuid,
	"proces_verbal_url" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grilles_tarifaires" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"annee_id" uuid NOT NULL,
	"niveau_id" uuid NOT NULL,
	"serie_id" uuid,
	"nature" "nature_frais" NOT NULL,
	"libelle" text NOT NULL,
	"montant_fcfa" integer NOT NULL,
	"obligatoire" boolean DEFAULT true NOT NULL,
	"applicable_nouveaux" boolean DEFAULT true NOT NULL,
	"applicable_anciens" boolean DEFAULT true NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grilles_tarifaires_montant_fcfa_check" CHECK (montant_fcfa >= 0)
);
--> statement-breakpoint
CREATE TABLE "notes_conduite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscription_id" uuid NOT NULL,
	"periode_id" uuid NOT NULL,
	"note" numeric(5, 2),
	"appreciation" text,
	"attribuee_par" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_conduite_inscription_id_periode_id_key" UNIQUE("inscription_id","periode_id"),
	CONSTRAINT "notes_conduite_note_check" CHECK ((note >= (0)::numeric) AND (note <= (20)::numeric))
);
--> statement-breakpoint
CREATE TABLE "tranches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"annee_id" uuid NOT NULL,
	"numero" smallint NOT NULL,
	"libelle" text NOT NULL,
	"date_limite" date NOT NULL,
	"pourcentage" numeric(5, 2) NOT NULL,
	CONSTRAINT "tranches_annee_id_numero_key" UNIQUE("annee_id","numero"),
	CONSTRAINT "tranches_pourcentage_check" CHECK ((pourcentage > (0)::numeric) AND (pourcentage <= (100)::numeric))
);
--> statement-breakpoint
CREATE TABLE "echeances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscription_id" uuid NOT NULL,
	"tranche_id" uuid,
	"nature" "nature_frais" NOT NULL,
	"libelle" text NOT NULL,
	"montant_du_fcfa" integer NOT NULL,
	"montant_paye_fcfa" integer DEFAULT 0 NOT NULL,
	"montant_exonere_fcfa" integer DEFAULT 0 NOT NULL,
	"date_limite" date NOT NULL,
	"statut" "statut_echeance" DEFAULT 'A_PAYER' NOT NULL,
	"nb_relances" smallint DEFAULT 0 NOT NULL,
	"derniere_relance_le" timestamp with time zone,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_paye_coherent" CHECK ((montant_paye_fcfa + montant_exonere_fcfa) <= montant_du_fcfa),
	CONSTRAINT "echeances_montant_du_fcfa_check" CHECK (montant_du_fcfa >= 0),
	CONSTRAINT "echeances_montant_exonere_fcfa_check" CHECK (montant_exonere_fcfa >= 0),
	CONSTRAINT "echeances_montant_paye_fcfa_check" CHECK (montant_paye_fcfa >= 0)
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expediteur_id" uuid,
	"destinataire_id" uuid,
	"eleve_id" uuid,
	"objet" text NOT NULL,
	"contenu" text NOT NULL,
	"piece_jointe_url" text,
	"message_parent_id" uuid,
	"lu" boolean DEFAULT false NOT NULL,
	"lu_le" timestamp with time zone,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paiements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscription_id" uuid NOT NULL,
	"echeance_id" uuid,
	"numero_recu" text NOT NULL,
	"montant_fcfa" integer NOT NULL,
	"mode" "mode_paiement" NOT NULL,
	"reference_externe" text,
	"date_paiement" date DEFAULT CURRENT_DATE NOT NULL,
	"paye_par_tuteur_id" uuid,
	"nom_payeur" text,
	"annule" boolean DEFAULT false NOT NULL,
	"annule_paiement_id" uuid,
	"motif_annulation" text,
	"observations" text,
	"encaisse_par" uuid,
	"recu_url" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paiements_numero_recu_key" UNIQUE("numero_recu"),
	CONSTRAINT "paiements_montant_fcfa_check" CHECK (montant_fcfa <> 0)
);
--> statement-breakpoint
CREATE TABLE "exonerations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscription_id" uuid NOT NULL,
	"nature" "nature_frais",
	"motif" "motif_exoneration" NOT NULL,
	"justification" text NOT NULL,
	"pourcentage" numeric(5, 2),
	"montant_fcfa" integer,
	"accorde_par" uuid,
	"date_accord" date DEFAULT CURRENT_DATE NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_exoneration_valeur" CHECK (((pourcentage IS NOT NULL) AND (montant_fcfa IS NULL)) OR ((pourcentage IS NULL) AND (montant_fcfa IS NOT NULL))),
	CONSTRAINT "exonerations_montant_fcfa_check" CHECK (montant_fcfa > 0),
	CONSTRAINT "exonerations_pourcentage_check" CHECK ((pourcentage > (0)::numeric) AND (pourcentage <= (100)::numeric))
);
--> statement-breakpoint
CREATE TABLE "annonces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"annee_id" uuid NOT NULL,
	"titre" text NOT NULL,
	"contenu" text NOT NULL,
	"cible" "cible_diffusion" DEFAULT 'TOUS' NOT NULL,
	"niveau_id" uuid,
	"classe_id" uuid,
	"piece_jointe_url" text,
	"epinglee" boolean DEFAULT false NOT NULL,
	"publier_le" timestamp with time zone DEFAULT now() NOT NULL,
	"expire_le" timestamp with time zone,
	"publiee" boolean DEFAULT true NOT NULL,
	"envoyer_push" boolean DEFAULT true NOT NULL,
	"publiee_par" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appareils" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utilisateur_id" uuid NOT NULL,
	"jeton_fcm" text NOT NULL,
	"plateforme" text NOT NULL,
	"modele" text,
	"version_app" text,
	"langue" text DEFAULT 'fr' NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"derniere_utilisation" timestamp with time zone DEFAULT now() NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appareils_jeton_fcm_key" UNIQUE("jeton_fcm")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"destinataire_id" uuid,
	"telephone" text,
	"eleve_id" uuid,
	"type" "type_notification" NOT NULL,
	"canal" "canal_notification" NOT NULL,
	"titre" text NOT NULL,
	"corps" text NOT NULL,
	"route_cible" text,
	"donnees" jsonb,
	"statut" "statut_envoi" DEFAULT 'EN_ATTENTE' NOT NULL,
	"tentatives" smallint DEFAULT 0 NOT NULL,
	"erreur" text,
	"envoye_le" timestamp with time zone,
	"lu_le" timestamp with time zone,
	"cout_fcfa" integer,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_destinataire" CHECK ((destinataire_id IS NOT NULL) OR (telephone IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "lectures_annonces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"annonce_id" uuid NOT NULL,
	"utilisateur_id" uuid NOT NULL,
	"lu_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lectures_annonces_annonce_id_utilisateur_id_key" UNIQUE("annonce_id","utilisateur_id")
);
--> statement-breakpoint
CREATE TABLE "convocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eleve_id" uuid,
	"tuteur_id" uuid,
	"motif" text NOT NULL,
	"date_rdv" date NOT NULL,
	"heure_rdv" time,
	"lieu" text,
	"convoque_par" uuid,
	"document_url" text,
	"honoree" boolean,
	"compte_rendu" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"utilisateur_id" uuid,
	"role_acteur" "role_utilisateur",
	"nom_acteur" text,
	"action" text NOT NULL,
	"entite" text NOT NULL,
	"entite_id" uuid,
	"eleve_id" uuid,
	"valeurs_avant" jsonb,
	"valeurs_apres" jsonb,
	"motif" text,
	"adresse_ip" "inet",
	"user_agent" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents_emis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "type_document" NOT NULL,
	"numero" text NOT NULL,
	"eleve_id" uuid,
	"classe_id" uuid,
	"annee_id" uuid,
	"libelle" text NOT NULL,
	"fichier_url" text,
	"donnees_figees" jsonb,
	"emis_par" uuid,
	"emis_le" timestamp with time zone DEFAULT now() NOT NULL,
	"code_verification" text,
	CONSTRAINT "documents_emis_numero_key" UNIQUE("numero"),
	CONSTRAINT "documents_emis_code_verification_key" UNIQUE("code_verification")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "role_utilisateur" NOT NULL,
	"action" text NOT NULL,
	"portee" text DEFAULT 'AUCUNE' NOT NULL,
	CONSTRAINT "permissions_role_action_key" UNIQUE("role","action")
);
--> statement-breakpoint
CREATE TABLE "historique_statuts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eleve_id" uuid NOT NULL,
	"annee_id" uuid,
	"ancien_statut" "statut_eleve",
	"nouveau_statut" "statut_eleve" NOT NULL,
	"motif" text NOT NULL,
	"date_effet" date DEFAULT CURRENT_DATE NOT NULL,
	"date_fin_prevue" date,
	"document_url" text,
	"sanction_id" uuid,
	"decide_par" uuid,
	"parents_notifies" boolean DEFAULT false NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequences_numerotation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cle" text NOT NULL,
	"annee" smallint NOT NULL,
	"prefixe" text NOT NULL,
	"dernier_numero" integer DEFAULT 0 NOT NULL,
	"longueur" smallint DEFAULT 4 NOT NULL,
	CONSTRAINT "sequences_numerotation_cle_annee_key" UNIQUE("cle","annee")
);
--> statement-breakpoint
CREATE TABLE "parametres" (
	"cle" text PRIMARY KEY NOT NULL,
	"valeur" text NOT NULL,
	"description" text,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_par" uuid
);
--> statement-breakpoint
ALTER TABLE "periodes" ADD CONSTRAINT "periodes_annee_id_fkey" FOREIGN KEY ("annee_id") REFERENCES "public"."annees_scolaires"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "niveaux" ADD CONSTRAINT "niveaux_niveau_suivant_id_fkey" FOREIGN KEY ("niveau_suivant_id") REFERENCES "public"."niveaux"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coefficients" ADD CONSTRAINT "coefficients_annee_id_fkey" FOREIGN KEY ("annee_id") REFERENCES "public"."annees_scolaires"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coefficients" ADD CONSTRAINT "coefficients_matiere_id_fkey" FOREIGN KEY ("matiere_id") REFERENCES "public"."matieres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coefficients" ADD CONSTRAINT "coefficients_niveau_id_fkey" FOREIGN KEY ("niveau_id") REFERENCES "public"."niveaux"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coefficients" ADD CONSTRAINT "coefficients_serie_id_fkey" FOREIGN KEY ("serie_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evenements_calendrier" ADD CONSTRAINT "evenements_calendrier_annee_id_fkey" FOREIGN KEY ("annee_id") REFERENCES "public"."annees_scolaires"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evenements_calendrier" ADD CONSTRAINT "evenements_calendrier_niveau_id_fkey" FOREIGN KEY ("niveau_id") REFERENCES "public"."niveaux"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evenements_calendrier" ADD CONSTRAINT "fk_evenement_classe" FOREIGN KEY ("classe_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jetons_rafraichissement" ADD CONSTRAINT "jetons_rafraichissement_remplace_par_fkey" FOREIGN KEY ("remplace_par") REFERENCES "public"."jetons_rafraichissement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jetons_rafraichissement" ADD CONSTRAINT "jetons_rafraichissement_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enseignants" ADD CONSTRAINT "enseignants_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuteurs" ADD CONSTRAINT "tuteurs_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eleve_tuteur" ADD CONSTRAINT "eleve_tuteur_eleve_id_fkey" FOREIGN KEY ("eleve_id") REFERENCES "public"."eleves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eleve_tuteur" ADD CONSTRAINT "eleve_tuteur_tuteur_id_fkey" FOREIGN KEY ("tuteur_id") REFERENCES "public"."tuteurs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pieces_dossier" ADD CONSTRAINT "pieces_dossier_depose_par_fkey" FOREIGN KEY ("depose_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pieces_dossier" ADD CONSTRAINT "pieces_dossier_eleve_id_fkey" FOREIGN KEY ("eleve_id") REFERENCES "public"."eleves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_annee_id_fkey" FOREIGN KEY ("annee_id") REFERENCES "public"."annees_scolaires"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_niveau_id_fkey" FOREIGN KEY ("niveau_id") REFERENCES "public"."niveaux"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_professeur_principal_id_fkey" FOREIGN KEY ("professeur_principal_id") REFERENCES "public"."enseignants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_salle_id_fkey" FOREIGN KEY ("salle_id") REFERENCES "public"."salles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_serie_id_fkey" FOREIGN KEY ("serie_id") REFERENCES "public"."series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inscriptions" ADD CONSTRAINT "inscriptions_annee_id_fkey" FOREIGN KEY ("annee_id") REFERENCES "public"."annees_scolaires"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inscriptions" ADD CONSTRAINT "inscriptions_classe_id_fkey" FOREIGN KEY ("classe_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inscriptions" ADD CONSTRAINT "inscriptions_eleve_id_fkey" FOREIGN KEY ("eleve_id") REFERENCES "public"."eleves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changements_classe" ADD CONSTRAINT "changements_classe_classe_destination_id_fkey" FOREIGN KEY ("classe_destination_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changements_classe" ADD CONSTRAINT "changements_classe_classe_origine_id_fkey" FOREIGN KEY ("classe_origine_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changements_classe" ADD CONSTRAINT "changements_classe_decide_par_fkey" FOREIGN KEY ("decide_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changements_classe" ADD CONSTRAINT "changements_classe_inscription_id_fkey" FOREIGN KEY ("inscription_id") REFERENCES "public"."inscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affectations" ADD CONSTRAINT "affectations_annee_id_fkey" FOREIGN KEY ("annee_id") REFERENCES "public"."annees_scolaires"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affectations" ADD CONSTRAINT "affectations_classe_id_fkey" FOREIGN KEY ("classe_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affectations" ADD CONSTRAINT "affectations_enseignant_id_fkey" FOREIGN KEY ("enseignant_id") REFERENCES "public"."enseignants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affectations" ADD CONSTRAINT "affectations_matiere_id_fkey" FOREIGN KEY ("matiere_id") REFERENCES "public"."matieres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emploi_du_temps" ADD CONSTRAINT "emploi_du_temps_annee_id_fkey" FOREIGN KEY ("annee_id") REFERENCES "public"."annees_scolaires"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emploi_du_temps" ADD CONSTRAINT "emploi_du_temps_classe_id_fkey" FOREIGN KEY ("classe_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emploi_du_temps" ADD CONSTRAINT "emploi_du_temps_creneau_id_fkey" FOREIGN KEY ("creneau_id") REFERENCES "public"."creneaux_horaires"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emploi_du_temps" ADD CONSTRAINT "emploi_du_temps_enseignant_id_fkey" FOREIGN KEY ("enseignant_id") REFERENCES "public"."enseignants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emploi_du_temps" ADD CONSTRAINT "emploi_du_temps_matiere_id_fkey" FOREIGN KEY ("matiere_id") REFERENCES "public"."matieres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emploi_du_temps" ADD CONSTRAINT "emploi_du_temps_salle_id_fkey" FOREIGN KEY ("salle_id") REFERENCES "public"."salles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seances" ADD CONSTRAINT "seances_classe_id_fkey" FOREIGN KEY ("classe_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seances" ADD CONSTRAINT "seances_creneau_id_fkey" FOREIGN KEY ("creneau_id") REFERENCES "public"."creneaux_horaires"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seances" ADD CONSTRAINT "seances_emploi_du_temps_id_fkey" FOREIGN KEY ("emploi_du_temps_id") REFERENCES "public"."emploi_du_temps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seances" ADD CONSTRAINT "seances_enseignant_id_fkey" FOREIGN KEY ("enseignant_id") REFERENCES "public"."enseignants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seances" ADD CONSTRAINT "seances_matiere_id_fkey" FOREIGN KEY ("matiere_id") REFERENCES "public"."matieres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_annee_id_fkey" FOREIGN KEY ("annee_id") REFERENCES "public"."annees_scolaires"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_classe_id_fkey" FOREIGN KEY ("classe_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_cree_par_fkey" FOREIGN KEY ("cree_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_enseignant_id_fkey" FOREIGN KEY ("enseignant_id") REFERENCES "public"."enseignants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_matiere_id_fkey" FOREIGN KEY ("matiere_id") REFERENCES "public"."matieres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_periode_id_fkey" FOREIGN KEY ("periode_id") REFERENCES "public"."periodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_inscription_id_fkey" FOREIGN KEY ("inscription_id") REFERENCES "public"."inscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_saisie_par_fkey" FOREIGN KEY ("saisie_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historique_notes" ADD CONSTRAINT "historique_notes_modifie_par_fkey" FOREIGN KEY ("modifie_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historique_notes" ADD CONSTRAINT "historique_notes_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appreciations_matiere" ADD CONSTRAINT "appreciations_matiere_enseignant_id_fkey" FOREIGN KEY ("enseignant_id") REFERENCES "public"."enseignants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appreciations_matiere" ADD CONSTRAINT "appreciations_matiere_inscription_id_fkey" FOREIGN KEY ("inscription_id") REFERENCES "public"."inscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appreciations_matiere" ADD CONSTRAINT "appreciations_matiere_matiere_id_fkey" FOREIGN KEY ("matiere_id") REFERENCES "public"."matieres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appreciations_matiere" ADD CONSTRAINT "appreciations_matiere_periode_id_fkey" FOREIGN KEY ("periode_id") REFERENCES "public"."periodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moyennes_matiere" ADD CONSTRAINT "moyennes_matiere_inscription_id_fkey" FOREIGN KEY ("inscription_id") REFERENCES "public"."inscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moyennes_matiere" ADD CONSTRAINT "moyennes_matiere_matiere_id_fkey" FOREIGN KEY ("matiere_id") REFERENCES "public"."matieres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moyennes_matiere" ADD CONSTRAINT "moyennes_matiere_periode_id_fkey" FOREIGN KEY ("periode_id") REFERENCES "public"."periodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moyennes_generales" ADD CONSTRAINT "moyennes_generales_inscription_id_fkey" FOREIGN KEY ("inscription_id") REFERENCES "public"."inscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moyennes_generales" ADD CONSTRAINT "moyennes_generales_periode_id_fkey" FOREIGN KEY ("periode_id") REFERENCES "public"."periodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conseils_classe" ADD CONSTRAINT "conseils_classe_classe_id_fkey" FOREIGN KEY ("classe_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conseils_classe" ADD CONSTRAINT "conseils_classe_periode_id_fkey" FOREIGN KEY ("periode_id") REFERENCES "public"."periodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conseils_classe" ADD CONSTRAINT "conseils_classe_valide_par_fkey" FOREIGN KEY ("valide_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletins" ADD CONSTRAINT "bulletins_conseil_classe_id_fkey" FOREIGN KEY ("conseil_classe_id") REFERENCES "public"."conseils_classe"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletins" ADD CONSTRAINT "bulletins_inscription_id_fkey" FOREIGN KEY ("inscription_id") REFERENCES "public"."inscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletins" ADD CONSTRAINT "bulletins_periode_id_fkey" FOREIGN KEY ("periode_id") REFERENCES "public"."periodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletins" ADD CONSTRAINT "bulletins_publie_par_fkey" FOREIGN KEY ("publie_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletins_annuels" ADD CONSTRAINT "bulletins_annuels_inscription_id_fkey" FOREIGN KEY ("inscription_id") REFERENCES "public"."inscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletins_annuels" ADD CONSTRAINT "bulletins_annuels_niveau_suivant_id_fkey" FOREIGN KEY ("niveau_suivant_id") REFERENCES "public"."niveaux"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devoirs" ADD CONSTRAINT "devoirs_classe_id_fkey" FOREIGN KEY ("classe_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devoirs" ADD CONSTRAINT "devoirs_enseignant_id_fkey" FOREIGN KEY ("enseignant_id") REFERENCES "public"."enseignants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devoirs" ADD CONSTRAINT "devoirs_matiere_id_fkey" FOREIGN KEY ("matiere_id") REFERENCES "public"."matieres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ressources_pedagogiques" ADD CONSTRAINT "ressources_pedagogiques_classe_id_fkey" FOREIGN KEY ("classe_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ressources_pedagogiques" ADD CONSTRAINT "ressources_pedagogiques_enseignant_id_fkey" FOREIGN KEY ("enseignant_id") REFERENCES "public"."enseignants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ressources_pedagogiques" ADD CONSTRAINT "ressources_pedagogiques_matiere_id_fkey" FOREIGN KEY ("matiere_id") REFERENCES "public"."matieres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_creneau_id_fkey" FOREIGN KEY ("creneau_id") REFERENCES "public"."creneaux_horaires"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_inscription_id_fkey" FOREIGN KEY ("inscription_id") REFERENCES "public"."inscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_justifiee_par_fkey" FOREIGN KEY ("justifiee_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_matiere_id_fkey" FOREIGN KEY ("matiere_id") REFERENCES "public"."matieres"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_periode_id_fkey" FOREIGN KEY ("periode_id") REFERENCES "public"."periodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_saisie_par_fkey" FOREIGN KEY ("saisie_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_seance_id_fkey" FOREIGN KEY ("seance_id") REFERENCES "public"."seances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retards" ADD CONSTRAINT "retards_inscription_id_fkey" FOREIGN KEY ("inscription_id") REFERENCES "public"."inscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retards" ADD CONSTRAINT "retards_matiere_id_fkey" FOREIGN KEY ("matiere_id") REFERENCES "public"."matieres"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retards" ADD CONSTRAINT "retards_periode_id_fkey" FOREIGN KEY ("periode_id") REFERENCES "public"."periodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retards" ADD CONSTRAINT "retards_saisie_par_fkey" FOREIGN KEY ("saisie_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sorties_anticipees" ADD CONSTRAINT "sorties_anticipees_autorise_par_fkey" FOREIGN KEY ("autorise_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sorties_anticipees" ADD CONSTRAINT "sorties_anticipees_inscription_id_fkey" FOREIGN KEY ("inscription_id") REFERENCES "public"."inscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sorties_anticipees" ADD CONSTRAINT "sorties_anticipees_recupere_par_tuteur_id_fkey" FOREIGN KEY ("recupere_par_tuteur_id") REFERENCES "public"."tuteurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_inscription_id_fkey" FOREIGN KEY ("inscription_id") REFERENCES "public"."inscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_periode_id_fkey" FOREIGN KEY ("periode_id") REFERENCES "public"."periodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_signale_par_fkey" FOREIGN KEY ("signale_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_inscription_id_fkey" FOREIGN KEY ("inscription_id") REFERENCES "public"."inscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_periode_id_fkey" FOREIGN KEY ("periode_id") REFERENCES "public"."periodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_prononcee_par_fkey" FOREIGN KEY ("prononcee_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conseils_discipline" ADD CONSTRAINT "conseils_discipline_inscription_id_fkey" FOREIGN KEY ("inscription_id") REFERENCES "public"."inscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conseils_discipline" ADD CONSTRAINT "conseils_discipline_sanction_id_fkey" FOREIGN KEY ("sanction_id") REFERENCES "public"."sanctions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grilles_tarifaires" ADD CONSTRAINT "grilles_tarifaires_annee_id_fkey" FOREIGN KEY ("annee_id") REFERENCES "public"."annees_scolaires"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grilles_tarifaires" ADD CONSTRAINT "grilles_tarifaires_niveau_id_fkey" FOREIGN KEY ("niveau_id") REFERENCES "public"."niveaux"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grilles_tarifaires" ADD CONSTRAINT "grilles_tarifaires_serie_id_fkey" FOREIGN KEY ("serie_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes_conduite" ADD CONSTRAINT "notes_conduite_attribuee_par_fkey" FOREIGN KEY ("attribuee_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes_conduite" ADD CONSTRAINT "notes_conduite_inscription_id_fkey" FOREIGN KEY ("inscription_id") REFERENCES "public"."inscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes_conduite" ADD CONSTRAINT "notes_conduite_periode_id_fkey" FOREIGN KEY ("periode_id") REFERENCES "public"."periodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tranches" ADD CONSTRAINT "tranches_annee_id_fkey" FOREIGN KEY ("annee_id") REFERENCES "public"."annees_scolaires"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "echeances" ADD CONSTRAINT "echeances_inscription_id_fkey" FOREIGN KEY ("inscription_id") REFERENCES "public"."inscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "echeances" ADD CONSTRAINT "echeances_tranche_id_fkey" FOREIGN KEY ("tranche_id") REFERENCES "public"."tranches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_destinataire_id_fkey" FOREIGN KEY ("destinataire_id") REFERENCES "public"."utilisateurs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_eleve_id_fkey" FOREIGN KEY ("eleve_id") REFERENCES "public"."eleves"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_expediteur_id_fkey" FOREIGN KEY ("expediteur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_message_parent_id_fkey" FOREIGN KEY ("message_parent_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_annule_paiement_id_fkey" FOREIGN KEY ("annule_paiement_id") REFERENCES "public"."paiements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_echeance_id_fkey" FOREIGN KEY ("echeance_id") REFERENCES "public"."echeances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_encaisse_par_fkey" FOREIGN KEY ("encaisse_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_inscription_id_fkey" FOREIGN KEY ("inscription_id") REFERENCES "public"."inscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_paye_par_tuteur_id_fkey" FOREIGN KEY ("paye_par_tuteur_id") REFERENCES "public"."tuteurs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exonerations" ADD CONSTRAINT "exonerations_accorde_par_fkey" FOREIGN KEY ("accorde_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exonerations" ADD CONSTRAINT "exonerations_inscription_id_fkey" FOREIGN KEY ("inscription_id") REFERENCES "public"."inscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annonces" ADD CONSTRAINT "annonces_annee_id_fkey" FOREIGN KEY ("annee_id") REFERENCES "public"."annees_scolaires"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annonces" ADD CONSTRAINT "annonces_classe_id_fkey" FOREIGN KEY ("classe_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annonces" ADD CONSTRAINT "annonces_niveau_id_fkey" FOREIGN KEY ("niveau_id") REFERENCES "public"."niveaux"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annonces" ADD CONSTRAINT "annonces_publiee_par_fkey" FOREIGN KEY ("publiee_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appareils" ADD CONSTRAINT "appareils_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_destinataire_id_fkey" FOREIGN KEY ("destinataire_id") REFERENCES "public"."utilisateurs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_eleve_id_fkey" FOREIGN KEY ("eleve_id") REFERENCES "public"."eleves"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lectures_annonces" ADD CONSTRAINT "lectures_annonces_annonce_id_fkey" FOREIGN KEY ("annonce_id") REFERENCES "public"."annonces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lectures_annonces" ADD CONSTRAINT "lectures_annonces_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convocations" ADD CONSTRAINT "convocations_convoque_par_fkey" FOREIGN KEY ("convoque_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convocations" ADD CONSTRAINT "convocations_eleve_id_fkey" FOREIGN KEY ("eleve_id") REFERENCES "public"."eleves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convocations" ADD CONSTRAINT "convocations_tuteur_id_fkey" FOREIGN KEY ("tuteur_id") REFERENCES "public"."tuteurs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_audit" ADD CONSTRAINT "journal_audit_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents_emis" ADD CONSTRAINT "documents_emis_annee_id_fkey" FOREIGN KEY ("annee_id") REFERENCES "public"."annees_scolaires"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents_emis" ADD CONSTRAINT "documents_emis_classe_id_fkey" FOREIGN KEY ("classe_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents_emis" ADD CONSTRAINT "documents_emis_eleve_id_fkey" FOREIGN KEY ("eleve_id") REFERENCES "public"."eleves"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents_emis" ADD CONSTRAINT "documents_emis_emis_par_fkey" FOREIGN KEY ("emis_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historique_statuts" ADD CONSTRAINT "historique_statuts_annee_id_fkey" FOREIGN KEY ("annee_id") REFERENCES "public"."annees_scolaires"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historique_statuts" ADD CONSTRAINT "historique_statuts_decide_par_fkey" FOREIGN KEY ("decide_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historique_statuts" ADD CONSTRAINT "historique_statuts_eleve_id_fkey" FOREIGN KEY ("eleve_id") REFERENCES "public"."eleves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historique_statuts" ADD CONSTRAINT "historique_statuts_sanction_id_fkey" FOREIGN KEY ("sanction_id") REFERENCES "public"."sanctions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parametres" ADD CONSTRAINT "parametres_modifie_par_fkey" FOREIGN KEY ("modifie_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_annee_courante" ON "annees_scolaires" USING btree ("est_courante" bool_ops) WHERE est_courante;--> statement-breakpoint
CREATE INDEX "idx_periodes_annee" ON "periodes" USING btree ("annee_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_coefficients_lookup" ON "coefficients" USING btree ("annee_id" uuid_ops,"niveau_id" uuid_ops,"serie_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_coefficient" ON "coefficients" USING btree (annee_id uuid_ops,matiere_id uuid_ops,niveau_id uuid_ops,COALESCE(serie_id, '00000000-0000-0000-0000-000000000000'::uuid uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_evenements_annee_dates" ON "evenements_calendrier" USING btree ("annee_id" date_ops,"date_debut" uuid_ops,"date_fin" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_utilisateurs_role" ON "utilisateurs" USING btree ("role" enum_ops) WHERE actif;--> statement-breakpoint
CREATE INDEX "idx_utilisateurs_telephone" ON "utilisateurs" USING btree ("telephone" text_ops) WHERE (telephone IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_sessions_expiration" ON "sessions" USING btree ("expire_le" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_sessions_utilisateur" ON "sessions" USING btree ("utilisateur_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_jetons_utilisateur" ON "jetons_rafraichissement" USING btree ("utilisateur_id" uuid_ops) WHERE (NOT revoque);--> statement-breakpoint
CREATE INDEX "idx_codes_telephone" ON "codes_activation" USING btree ("telephone" text_ops,"cree_le" text_ops);--> statement-breakpoint
CREATE INDEX "idx_enseignants_actif" ON "enseignants" USING btree ("actif" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_tuteurs_telephone" ON "tuteurs" USING btree ("telephone" text_ops);--> statement-breakpoint
CREATE INDEX "idx_eleves_nom" ON "eleves" USING btree ("nom" text_ops,"prenom" text_ops);--> statement-breakpoint
CREATE INDEX "idx_eleves_recherche" ON "eleves" USING gin (to_tsvector('french'::regconfig, ((((matricule || ' '::text) || tsvector_ops);--> statement-breakpoint
CREATE INDEX "idx_eleves_statut" ON "eleves" USING btree ("statut" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_eleve_tuteur_eleve" ON "eleve_tuteur" USING btree ("eleve_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_eleve_tuteur_tuteur" ON "eleve_tuteur" USING btree ("tuteur_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tuteur_principal" ON "eleve_tuteur" USING btree ("eleve_id" uuid_ops) WHERE est_principal;--> statement-breakpoint
CREATE INDEX "idx_pieces_eleve" ON "pieces_dossier" USING btree ("eleve_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_classes_annee" ON "classes" USING btree ("annee_id" uuid_ops) WHERE active;--> statement-breakpoint
CREATE INDEX "idx_classes_niveau" ON "classes" USING btree ("niveau_id" uuid_ops,"serie_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_inscriptions_annee" ON "inscriptions" USING btree ("annee_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_inscriptions_classe" ON "inscriptions" USING btree ("classe_id" uuid_ops) WHERE active;--> statement-breakpoint
CREATE INDEX "idx_inscriptions_eleve" ON "inscriptions" USING btree ("eleve_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_affectations_classe" ON "affectations" USING btree ("classe_id" uuid_ops,"annee_id" uuid_ops) WHERE active;--> statement-breakpoint
CREATE INDEX "idx_affectations_enseignant" ON "affectations" USING btree ("enseignant_id" uuid_ops,"annee_id" uuid_ops) WHERE active;--> statement-breakpoint
CREATE INDEX "idx_edt_classe" ON "emploi_du_temps" USING btree ("classe_id" int2_ops,"jour_semaine" int2_ops);--> statement-breakpoint
CREATE INDEX "idx_edt_enseignant" ON "emploi_du_temps" USING btree ("enseignant_id" uuid_ops,"jour_semaine" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_edt_enseignant_creneau" ON "emploi_du_temps" USING btree (annee_id int2_ops,enseignant_id int2_ops,jour_semaine uuid_ops,creneau_id int2_ops,COALESCE(semaine_type, '*'::bpchar) uuid_ops) WHERE (enseignant_id IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_edt_salle_creneau" ON "emploi_du_temps" USING btree (annee_id uuid_ops,salle_id bpchar_ops,jour_semaine bpchar_ops,creneau_id int2_ops,COALESCE(semaine_type, '*'::bpchar) int2_ops) WHERE (salle_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_seances_classe_date" ON "seances" USING btree ("classe_id" date_ops,"date_seance" date_ops);--> statement-breakpoint
CREATE INDEX "idx_seances_enseignant" ON "seances" USING btree ("enseignant_id" date_ops,"date_seance" date_ops);--> statement-breakpoint
CREATE INDEX "idx_evaluations_classe_periode" ON "evaluations" USING btree ("classe_id" uuid_ops,"periode_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_evaluations_enseignant" ON "evaluations" USING btree ("enseignant_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_evaluations_matiere" ON "evaluations" USING btree ("matiere_id" uuid_ops,"periode_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_notes_evaluation" ON "notes" USING btree ("evaluation_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_notes_inscription" ON "notes" USING btree ("inscription_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_historique_notes_note" ON "historique_notes" USING btree ("note_id" timestamptz_ops,"modifie_le" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_moy_matiere_periode" ON "moyennes_matiere" USING btree ("periode_id" uuid_ops,"matiere_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_moy_gen_periode" ON "moyennes_generales" USING btree ("periode_id" int2_ops,"rang" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_bulletins_periode" ON "bulletins" USING btree ("periode_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_bulletins_publie" ON "bulletins" USING btree ("inscription_id" uuid_ops) WHERE est_publie;--> statement-breakpoint
CREATE INDEX "idx_devoirs_classe_date" ON "devoirs" USING btree ("classe_id" date_ops,"date_remise" date_ops);--> statement-breakpoint
CREATE INDEX "idx_absences_a_notifier" ON "absences" USING btree ("cree_le" timestamptz_ops) WHERE (NOT parents_notifies);--> statement-breakpoint
CREATE INDEX "idx_absences_date" ON "absences" USING btree ("date_absence" date_ops);--> statement-breakpoint
CREATE INDEX "idx_absences_inscription" ON "absences" USING btree ("inscription_id" date_ops,"date_absence" date_ops);--> statement-breakpoint
CREATE INDEX "idx_absences_periode" ON "absences" USING btree ("periode_id" enum_ops,"statut" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_retards_inscription" ON "retards" USING btree ("inscription_id" date_ops,"date_retard" date_ops);--> statement-breakpoint
CREATE INDEX "idx_incidents_gravite" ON "incidents" USING btree ("gravite" enum_ops,"date_incident" date_ops);--> statement-breakpoint
CREATE INDEX "idx_incidents_inscription" ON "incidents" USING btree ("inscription_id" date_ops,"date_incident" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_sanctions_inscription" ON "sanctions" USING btree ("inscription_id" date_ops,"date_debut" date_ops);--> statement-breakpoint
CREATE INDEX "idx_grilles_annee_niveau" ON "grilles_tarifaires" USING btree ("annee_id" uuid_ops,"niveau_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_echeances_impayees" ON "echeances" USING btree ("date_limite" date_ops) WHERE (statut = ANY (ARRAY['A_PAYER'::statut_echeance, 'PARTIEL'::statut_echeance, 'EN_RETARD'::statut_echeance]));--> statement-breakpoint
CREATE INDEX "idx_echeances_inscription" ON "echeances" USING btree ("inscription_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_echeances_statut" ON "echeances" USING btree ("statut" date_ops,"date_limite" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_destinataire" ON "messages" USING btree ("destinataire_id" timestamptz_ops,"cree_le" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_non_lus" ON "messages" USING btree ("destinataire_id" uuid_ops) WHERE (NOT lu);--> statement-breakpoint
CREATE INDEX "idx_paiements_date" ON "paiements" USING btree ("date_paiement" date_ops);--> statement-breakpoint
CREATE INDEX "idx_paiements_inscription" ON "paiements" USING btree ("inscription_id" uuid_ops,"date_paiement" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_paiements_recu" ON "paiements" USING btree ("numero_recu" text_ops);--> statement-breakpoint
CREATE INDEX "idx_annonces_classe" ON "annonces" USING btree ("classe_id" uuid_ops) WHERE (classe_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_annonces_publication" ON "annonces" USING btree ("publier_le" timestamptz_ops) WHERE publiee;--> statement-breakpoint
CREATE INDEX "idx_appareils_utilisateur" ON "appareils" USING btree ("utilisateur_id" uuid_ops) WHERE actif;--> statement-breakpoint
CREATE INDEX "idx_notifications_destinataire" ON "notifications" USING btree ("destinataire_id" timestamptz_ops,"cree_le" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_notifications_eleve" ON "notifications" USING btree ("eleve_id" timestamptz_ops,"cree_le" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_notifications_file" ON "notifications" USING btree ("cree_le" timestamptz_ops) WHERE (statut = 'EN_ATTENTE'::statut_envoi);--> statement-breakpoint
CREATE INDEX "idx_convocations_date" ON "convocations" USING btree ("date_rdv" date_ops);--> statement-breakpoint
CREATE INDEX "idx_audit_date" ON "journal_audit" USING btree ("cree_le" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_audit_eleve" ON "journal_audit" USING btree ("eleve_id" timestamptz_ops,"cree_le" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_audit_entite" ON "journal_audit" USING btree ("entite" timestamptz_ops,"entite_id" uuid_ops,"cree_le" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_audit_utilisateur" ON "journal_audit" USING btree ("utilisateur_id" timestamptz_ops,"cree_le" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_documents_eleve" ON "documents_emis" USING btree ("eleve_id" timestamptz_ops,"emis_le" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_documents_type" ON "documents_emis" USING btree ("type" timestamptz_ops,"emis_le" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_permissions_role" ON "permissions" USING btree ("role" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_historique_statuts_eleve" ON "historique_statuts" USING btree ("eleve_id" timestamptz_ops,"cree_le" timestamptz_ops);--> statement-breakpoint
CREATE VIEW "public"."v_assiduite_periode" AS (SELECT i.id AS inscription_id, p.id AS periode_id, COALESCE(sum(a.nb_heures) FILTER (WHERE a.statut = 'JUSTIFIEE'::statut_justification), 0::numeric) AS heures_justifiees, COALESCE(sum(a.nb_heures) FILTER (WHERE a.statut <> 'JUSTIFIEE'::statut_justification), 0::numeric) AS heures_non_justifiees, COALESCE(count(DISTINCT a.id), 0::bigint) AS nb_absences, COALESCE(( SELECT count(*) AS count FROM retards r WHERE r.inscription_id = i.id AND r.periode_id = p.id), 0::bigint) AS nb_retards FROM inscriptions i JOIN periodes p ON p.annee_id = i.annee_id LEFT JOIN absences a ON a.inscription_id = i.id AND a.periode_id = p.id WHERE i.active GROUP BY i.id, p.id);--> statement-breakpoint
CREATE VIEW "public"."v_situation_financiere" AS (SELECT inscription_id, sum(montant_du_fcfa) AS total_du_fcfa, sum(montant_paye_fcfa) AS total_paye_fcfa, sum(montant_exonere_fcfa) AS total_exonere_fcfa, sum(montant_du_fcfa - montant_paye_fcfa - montant_exonere_fcfa) AS reste_du_fcfa, count(*) FILTER (WHERE statut = 'EN_RETARD'::statut_echeance) AS nb_echeances_en_retard, min(date_limite) FILTER (WHERE statut = ANY (ARRAY['A_PAYER'::statut_echeance, 'PARTIEL'::statut_echeance, 'EN_RETARD'::statut_echeance])) AS prochaine_echeance FROM echeances e GROUP BY inscription_id);
*/