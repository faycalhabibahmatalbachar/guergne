-- Personnel administratif et technique indépendant du corps enseignant.
-- Migration additive, sans changement sur enseignants/affectations/notes.
CREATE TABLE IF NOT EXISTS personnels_non_enseignants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  utilisateur_id UUID UNIQUE REFERENCES utilisateurs(id) ON DELETE SET NULL,
  matricule TEXT NOT NULL UNIQUE,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  categorie TEXT NOT NULL CHECK (categorie IN ('ADMINISTRATIF','TECHNIQUE')),
  fonction TEXT NOT NULL,
  service TEXT,
  telephone TEXT,
  email TEXT,
  adresse TEXT,
  date_embauche DATE,
  type_contrat TEXT,
  actif BOOLEAN NOT NULL DEFAULT TRUE,
  observations TEXT,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT personnel_contact_email CHECK (email IS NULL OR length(trim(email)) > 0)
);
CREATE INDEX IF NOT EXISTS idx_pne_categorie_actif ON personnels_non_enseignants (categorie, actif);
CREATE INDEX IF NOT EXISTS idx_pne_nom ON personnels_non_enseignants (nom, prenom);
