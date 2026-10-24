-- Colonnes additives : ne réécrit ni ne devine les événements historiques.
ALTER TABLE journal_audit
 ADD COLUMN IF NOT EXISTS correlation_id uuid,
 ADD COLUMN IF NOT EXISTS route_origine text,
 ADD COLUMN IF NOT EXISTS methode_http text,
 ADD COLUMN IF NOT EXISTS type_source text,
 ADD COLUMN IF NOT EXISTS version_preuve smallint NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_audit_correlation
 ON journal_audit(correlation_id, cree_le DESC) WHERE correlation_id IS NOT NULL;
