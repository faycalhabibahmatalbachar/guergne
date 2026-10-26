-- Opt-in extension. NEVER run this file against production during development.
-- Separate migration path: the legacy automatic migrator must not activate V2.
BEGIN;
CREATE TABLE communication_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  paused boolean NOT NULL DEFAULT true,
  simulation boolean NOT NULL DEFAULT true,
  monthly_budget integer NOT NULL DEFAULT 500000 CHECK (monthly_budget >= 0),
  confirmation_threshold integer NOT NULL DEFAULT 1000 CHECK (confirmation_threshold >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO communication_control DEFAULT VALUES;
CREATE TABLE communication_campaigns (
  id uuid PRIMARY KEY,
  author_id uuid NOT NULL,
  school_year_id uuid NOT NULL,
  class_id uuid,
  title text NOT NULL,
  body text NOT NULL,
  language text NOT NULL CHECK(language IN ('fr','ar')),
  scheduled_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE communication_outbox (
  campaign_id uuid REFERENCES communication_campaigns(id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid UNIQUE REFERENCES notifications(id),
  idempotency_key text NOT NULL UNIQUE,
  channel text NOT NULL CHECK (channel IN ('SMS','PUSH','IN_APP')),
  state text NOT NULL CHECK (state IN ('DRAFT','SCHEDULED','QUEUED','PROCESSING','ACCEPTED','DELIVERED','READ','RETRYABLE','FAILED','CANCELLED','EXPIRED')),
  simulated boolean NOT NULL DEFAULT true,
  due_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  estimated_cost integer NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
  actual_cost integer CHECK (actual_cost >= 0),
  provider_ref text,
  failure_category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((state = 'PROCESSING') = (lease_token IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX communication_outbox_due ON communication_outbox(due_at, id) WHERE state IN ('QUEUED','SCHEDULED','RETRYABLE');
CREATE INDEX communication_outbox_health ON communication_outbox(state,created_at);
CREATE TABLE communication_receipts (
  provider text NOT NULL,
  event_id text NOT NULL,
  outbox_id uuid NOT NULL REFERENCES communication_outbox(id),
  state text NOT NULL CHECK (state IN ('ACCEPTED','DELIVERED','READ','FAILED')),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(provider,event_id)
);
CREATE TABLE communication_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  outbox_id uuid NOT NULL REFERENCES communication_outbox(id),
  actor_id uuid,
  action text NOT NULL,
  previous_state text,
  next_state text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Atomic reservation and crash recovery. No lock is held during external I/O.
CREATE FUNCTION communication_claim(p_limit integer, p_simulation boolean)
RETURNS SETOF communication_outbox LANGUAGE plpgsql AS $$
BEGIN
  IF p_limit < 1 OR p_limit > 200 THEN RAISE EXCEPTION 'invalid batch size'; END IF;
  IF NOT EXISTS (SELECT 1 FROM communication_control WHERE NOT paused AND simulation = p_simulation) THEN RETURN; END IF;
  UPDATE communication_outbox SET state='RETRYABLE', lease_token=NULL, lease_until=NULL,
    failure_category='WORKER_INTERRUPTED', due_at=now(), updated_at=now()
    WHERE state='PROCESSING' AND lease_until < now() AND simulated=p_simulation;
  UPDATE communication_outbox SET state='EXPIRED', updated_at=now()
    WHERE state IN ('QUEUED','SCHEDULED','RETRYABLE') AND expires_at <= now() AND simulated=p_simulation;
  RETURN QUERY
    WITH ready AS (
      SELECT id FROM communication_outbox
      WHERE state IN ('QUEUED','SCHEDULED','RETRYABLE') AND due_at <= now()
        AND simulated=p_simulation AND (expires_at IS NULL OR expires_at > now())
      ORDER BY due_at,id FOR UPDATE SKIP LOCKED LIMIT p_limit
    ) UPDATE communication_outbox o SET state='PROCESSING', lease_token=gen_random_uuid(),
        lease_until=now()+interval '2 minutes', attempts=o.attempts+1, updated_at=now()
      FROM ready WHERE o.id=ready.id RETURNING o.*;
END $$;

CREATE FUNCTION communication_finish(p_id uuid, p_lease uuid, p_state text, p_category text, p_ref text, p_cost integer, p_delay_ms integer)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE previous text;
BEGIN
  IF p_state NOT IN ('ACCEPTED','DELIVERED','RETRYABLE','FAILED') OR p_delay_ms < 0 OR p_delay_ms > 3600000 THEN
    RAISE EXCEPTION 'invalid transition';
  END IF;
  UPDATE communication_outbox SET state=p_state, failure_category=p_category,
    provider_ref=p_ref, actual_cost=p_cost,
    due_at=now()+p_delay_ms*interval '1 millisecond', lease_token=NULL, lease_until=NULL, updated_at=now()
  WHERE id=p_id AND state='PROCESSING' AND lease_token=p_lease AND lease_until > now()
  RETURNING 'PROCESSING' INTO previous;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN true;
END $$;

CREATE FUNCTION communication_receipt(p_provider text,p_event text,p_id uuid,p_state text,p_occurred timestamptz)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE current_state text; inserted integer;
BEGIN
  IF p_state NOT IN ('ACCEPTED','DELIVERED','READ','FAILED') THEN RAISE EXCEPTION 'invalid receipt'; END IF;
  SELECT state INTO current_state FROM communication_outbox WHERE id=p_id AND NOT simulated FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO communication_receipts(provider,event_id,outbox_id,state,occurred_at)
    VALUES(p_provider,p_event,p_id,p_state,p_occurred) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  IF inserted=0 THEN RETURN false; END IF;
  -- A delayed accepted/failed event cannot erase an observed delivery/read.
  IF current_state IN ('CANCELLED','EXPIRED','DRAFT','SCHEDULED','QUEUED') OR current_state='READ'
    OR (current_state='DELIVERED' AND p_state<>'READ')
    OR (current_state='FAILED' AND p_state='ACCEPTED') THEN RETURN false; END IF;
  UPDATE communication_outbox SET state=p_state,lease_token=NULL,lease_until=NULL,updated_at=now(),
    failure_category=CASE WHEN p_state='FAILED' THEN 'PROVIDER_REJECTED' ELSE NULL END WHERE id=p_id;
  RETURN true;
END $$;

CREATE FUNCTION communication_transition_allowed(previous text, next text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT previous=next OR CASE previous
  WHEN 'DRAFT' THEN next IN ('SCHEDULED','QUEUED','CANCELLED')
  WHEN 'SCHEDULED' THEN next IN ('PROCESSING','CANCELLED','EXPIRED')
  WHEN 'QUEUED' THEN next IN ('PROCESSING','CANCELLED','EXPIRED')
  WHEN 'PROCESSING' THEN next IN ('ACCEPTED','DELIVERED','READ','RETRYABLE','FAILED')
  WHEN 'ACCEPTED' THEN next IN ('DELIVERED','READ','FAILED')
  WHEN 'DELIVERED' THEN next='READ'
  WHEN 'RETRYABLE' THEN next IN ('PROCESSING','CANCELLED','EXPIRED')
  WHEN 'FAILED' THEN next IN ('QUEUED','DELIVERED','READ')
  ELSE false END $$;
CREATE FUNCTION communication_audit_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND NOT communication_transition_allowed(OLD.state,NEW.state) THEN
    RAISE EXCEPTION 'invalid transition % -> %',OLD.state,NEW.state;
  END IF;
  IF TG_OP='INSERT' THEN
    INSERT INTO communication_events(outbox_id,action,next_state) VALUES(NEW.id,'outbox.created',NEW.state);
  ELSIF OLD.state<>NEW.state THEN
    INSERT INTO communication_events(outbox_id,action,previous_state,next_state)
      VALUES(NEW.id,'outbox.transition',OLD.state,NEW.state);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER communication_transition AFTER INSERT OR UPDATE OF state ON communication_outbox
FOR EACH ROW EXECUTE FUNCTION communication_audit_transition();

-- Only NEW IN_APP rows become immediately available. Historical evidence is untouched.
CREATE FUNCTION communication_in_app() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.canal='IN_APP' AND NEW.statut='EN_ATTENTE' THEN
    NEW.statut='ENVOYE'; NEW.envoye_le=now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER communication_in_app_immediate BEFORE INSERT ON notifications
FOR EACH ROW EXECUTE FUNCTION communication_in_app();
COMMIT;
