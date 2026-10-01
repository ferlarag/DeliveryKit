CREATE TABLE delivery_attempts (
    id UUID PRIMARY KEY,
    delivery_id UUID NOT NULL REFERENCES deliveries (id),
    attempt_number INTEGER NOT NULL,
    initiated_by VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    http_status INTEGER,
    error VARCHAR(1000),
    UNIQUE (delivery_id, attempt_number)
);

ALTER TABLE queue ADD COLUMN manual_retry BOOLEAN NOT NULL DEFAULT FALSE;
