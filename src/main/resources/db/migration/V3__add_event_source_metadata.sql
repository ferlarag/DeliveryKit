ALTER TABLE webhook_events ADD COLUMN source_id VARCHAR(200);
ALTER TABLE webhook_events ADD COLUMN source_url VARCHAR(2048);
ALTER TABLE webhook_events ADD COLUMN connection_ip VARCHAR(64);
