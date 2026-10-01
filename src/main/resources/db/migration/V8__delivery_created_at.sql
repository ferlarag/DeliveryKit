ALTER TABLE deliveries ADD COLUMN created_at TIMESTAMP WITH TIME ZONE;

UPDATE deliveries AS delivery
SET created_at = event.created_at
FROM webhook_events AS event
WHERE event.event_id = delivery.event_id;

ALTER TABLE deliveries ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE deliveries ALTER COLUMN created_at SET NOT NULL;

CREATE INDEX deliveries_created_at_id ON deliveries (created_at DESC, id DESC);
