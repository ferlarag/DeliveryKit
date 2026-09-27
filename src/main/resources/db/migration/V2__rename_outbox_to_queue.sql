ALTER TABLE queue_outbox RENAME TO queue;
ALTER INDEX queue_outbox_pending RENAME TO queue_pending;
