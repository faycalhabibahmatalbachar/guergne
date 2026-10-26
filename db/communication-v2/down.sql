-- Destructive only for the NEW V2 extension; export its audit history before rollback.
-- Legacy notifications are never deleted or updated.
BEGIN;
DROP TRIGGER communication_in_app_immediate ON notifications;
DROP FUNCTION communication_in_app();
DROP FUNCTION communication_receipt(text,text,uuid,text,timestamptz);
DROP FUNCTION communication_finish(uuid,uuid,text,text,text,integer,integer);
DROP FUNCTION communication_claim(integer,boolean);
DROP TRIGGER communication_transition ON communication_outbox;
DROP FUNCTION communication_audit_transition();
DROP FUNCTION communication_transition_allowed(text,text);
DROP TABLE communication_events;
DROP TABLE communication_receipts;
DROP TABLE communication_outbox;
DROP TABLE communication_campaigns;
DROP TABLE communication_control;
COMMIT;
