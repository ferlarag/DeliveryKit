CREATE TABLE IF NOT EXISTS webhook_endpoints
(
    id         UUID PRIMARY KEY,
    url        VARCHAR(2048)            NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS webhook_events
(
    event_id   VARCHAR(200) PRIMARY KEY,
    payload    TEXT                     NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deliveries
(
    id          UUID PRIMARY KEY,
    event_id    VARCHAR(200)             NOT NULL REFERENCES webhook_events (event_id),
    endpoint_id UUID                     NOT NULL REFERENCES webhook_endpoints (id),
    target_url  VARCHAR(2048)            NOT NULL,
    payload     TEXT                     NOT NULL,
    status      VARCHAR(20)              NOT NULL,
    attempts    INTEGER                  NOT NULL DEFAULT 0,
    last_error  VARCHAR(1000),
    lease_until TIMESTAMP WITH TIME ZONE,
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (event_id, endpoint_id)
);

CREATE TABLE IF NOT EXISTS queue_outbox
(
    id            UUID PRIMARY KEY,
    delivery_id   UUID                     NOT NULL REFERENCES deliveries (id),
    sent_at       TIMESTAMP WITH TIME ZONE,
    claimed_until TIMESTAMP WITH TIME ZONE,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS queue_outbox_pending ON queue_outbox (sent_at, created_at);
