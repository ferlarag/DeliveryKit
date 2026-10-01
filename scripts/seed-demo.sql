-- Synthetic, deterministic local demo data. Safe to rerun.
BEGIN;

WITH destinations(position, slug, url) AS (
    VALUES
        (1, 'crm', 'https://crm.example.invalid/hooks/deliverykit'),
        (2, 'billing', 'https://billing.example.invalid/hooks/deliverykit'),
        (3, 'inventory', 'https://inventory.example.invalid/hooks/deliverykit'),
        (4, 'support', 'https://support.example.invalid/hooks/deliverykit'),
        (5, 'analytics', 'https://analytics.example.invalid/hooks/deliverykit')
)
INSERT INTO webhook_endpoints (id, url, created_at)
SELECT md5('deliverykit-medium-v1:endpoint:' || slug)::uuid, url, CURRENT_TIMESTAMP - INTERVAL '30 days'
FROM destinations
ON CONFLICT (id) DO NOTHING;

-- Route only newly seeded incoming endpoints; reruns preserve user changes.
WITH created_ingress AS (
    INSERT INTO ingress_endpoints (id, created_at)
    SELECT 'demo-medium-v1-' || slug, TIMESTAMP WITH TIME ZONE '2025-01-01 00:00:00+00'
    FROM (VALUES ('storefront'), ('billing'), ('crm'), ('inventory'), ('support')) AS sources(slug)
    ON CONFLICT (id) DO NOTHING
    RETURNING id
)
INSERT INTO ingress_endpoint_destinations (ingress_id, destination_id)
SELECT ingress.id, destination.id
FROM created_ingress AS ingress
CROSS JOIN webhook_endpoints AS destination
WHERE destination.id IN (
    SELECT md5('deliverykit-medium-v1:endpoint:' || slug)::uuid
    FROM (VALUES ('crm'), ('billing'), ('inventory'), ('support'), ('analytics')) AS destinations(slug)
)
ON CONFLICT DO NOTHING;

WITH demo_events AS (
    SELECT
        n,
        'demo-medium-' || lpad(n::text, 3, '0') AS event_id,
        'demo-medium-v1-' || (ARRAY['storefront', 'billing', 'crm', 'inventory', 'support'])[((n - 1) % 5) + 1] AS source_id,
        'https://' || (ARRAY['storefront', 'billing', 'crm', 'inventory', 'support'])[((n - 1) % 5) + 1] || '.example.invalid/events' AS source_url,
        '198.51.100.' || (21 + ((n - 1) % 5)) AS connection_ip,
        jsonb_build_object(
            '_demoSeed', 'deliverykit-medium-v1',
            'company', 'Sample Commerce Co.',
            'type', (ARRAY['order.created', 'invoice.paid', 'customer.updated', 'inventory.low', 'ticket.opened'])[((n - 1) % 5) + 1],
            'recordId', 'SAMPLE-' || lpad((1000 + n)::text, 5, '0'),
            'region', (ARRAY['north', 'south', 'central'])[((n - 1) % 3) + 1],
            'sequence', n
        )::text AS payload
    FROM generate_series(1, 20) AS n
)
INSERT INTO webhook_events (event_id, payload, source_id, source_url, connection_ip, created_at)
SELECT event_id, payload, source_id, source_url, connection_ip, CURRENT_TIMESTAMP - (21 - n) * INTERVAL '3 hours'
FROM demo_events
ON CONFLICT (event_id) DO NOTHING;

-- Refresh only marked demo rows so an existing local seed gains source details.
UPDATE webhook_events AS event
SET source_id = demo.source_id,
    source_url = 'https://' || demo.slug || '.example.invalid/events',
    connection_ip = '198.51.100.' || (21 + ((demo.n - 1) % 5))
FROM (
    SELECT n,
        'demo-medium-' || lpad(n::text, 3, '0') AS event_id,
        (ARRAY['storefront', 'billing', 'crm', 'inventory', 'support'])[((n - 1) % 5) + 1] AS slug,
        'demo-medium-v1-' || (ARRAY['storefront', 'billing', 'crm', 'inventory', 'support'])[((n - 1) % 5) + 1] AS source_id
    FROM generate_series(1, 20) AS n
) AS demo
WHERE event.event_id = demo.event_id
  AND event.payload::jsonb ->> '_demoSeed' = 'deliverykit-medium-v1';

WITH destinations(position, slug, url) AS (
    VALUES
        (1, 'crm', 'https://crm.example.invalid/hooks/deliverykit'),
        (2, 'billing', 'https://billing.example.invalid/hooks/deliverykit'),
        (3, 'inventory', 'https://inventory.example.invalid/hooks/deliverykit'),
        (4, 'support', 'https://support.example.invalid/hooks/deliverykit'),
        (5, 'analytics', 'https://analytics.example.invalid/hooks/deliverykit')
), demo_events AS (
    SELECT
        n,
        'demo-medium-' || lpad(n::text, 3, '0') AS event_id,
        jsonb_build_object(
            '_demoSeed', 'deliverykit-medium-v1',
            'company', 'Sample Commerce Co.',
            'type', (ARRAY['order.created', 'invoice.paid', 'customer.updated', 'inventory.low', 'ticket.opened'])[((n - 1) % 5) + 1],
            'recordId', 'SAMPLE-' || lpad((1000 + n)::text, 5, '0'),
            'region', (ARRAY['north', 'south', 'central'])[((n - 1) % 3) + 1],
            'sequence', n
        )::text AS payload
    FROM generate_series(1, 20) AS n
), candidates AS (
    SELECT
        md5('deliverykit-medium-v1:delivery:' || event.event_id || ':' || destination.slug)::uuid AS id,
        event.event_id,
        md5('deliverykit-medium-v1:endpoint:' || destination.slug)::uuid AS endpoint_id,
        destination.url AS target_url,
        event.payload,
        stored.created_at,
        (event.n * 7 + destination.position * 3) % 10 AS outcome
    FROM demo_events AS event
    JOIN webhook_events AS stored ON stored.event_id = event.event_id AND stored.payload = event.payload
    CROSS JOIN destinations AS destination
    JOIN webhook_endpoints AS endpoint ON endpoint.id = md5('deliverykit-medium-v1:endpoint:' || destination.slug)::uuid
        AND endpoint.url = destination.url
)
INSERT INTO deliveries (id, event_id, endpoint_id, target_url, payload, status, attempts, last_error, created_at, updated_at)
SELECT
    id,
    event_id,
    endpoint_id,
    target_url,
    payload,
    CASE WHEN outcome IN (0, 1) THEN 'FAILED' WHEN outcome = 2 THEN 'PENDING' ELSE 'SUCCEEDED' END,
    CASE WHEN outcome = 2 THEN 0 WHEN outcome IN (0, 1) THEN 2 ELSE 1 + (outcome % 3 = 0)::int END,
    CASE WHEN outcome = 0 THEN 'Recipient returned HTTP 503'
         WHEN outcome = 1 THEN 'java.net.http.HttpTimeoutException: recipient timed out'
         ELSE NULL END,
    created_at,
    created_at + INTERVAL '2 minutes'
FROM candidates
ON CONFLICT (id) DO NOTHING;

-- Backfill only untouched demo deliveries. A delivery someone retried may have a
-- different status or attempt count; do not invent history for that state.
WITH demo_delivery_ids AS (
    SELECT n, position,
        md5('deliverykit-medium-v1:delivery:demo-medium-' || lpad(n::text, 3, '0') || ':' || slug)::uuid AS id,
        (n * 7 + position * 3) % 10 AS outcome
    FROM generate_series(1, 20) AS n
    CROSS JOIN (VALUES (1, 'crm'), (2, 'billing'), (3, 'inventory'), (4, 'support'), (5, 'analytics')) AS destinations(position, slug)
), demo_deliveries AS (
    SELECT delivery.*, demo_delivery_ids.n, demo_delivery_ids.position
    FROM deliveries AS delivery
    JOIN demo_delivery_ids ON demo_delivery_ids.id = delivery.id
    JOIN webhook_events AS event ON event.event_id = delivery.event_id
    WHERE event.payload::jsonb ->> '_demoSeed' = 'deliverykit-medium-v1'
      AND delivery.status = CASE WHEN outcome IN (0, 1) THEN 'FAILED'
                                 WHEN outcome = 2 THEN 'PENDING' ELSE 'SUCCEEDED' END
      AND delivery.attempts = CASE WHEN outcome = 2 THEN 0
                                   WHEN outcome IN (0, 1) THEN 2
                                   ELSE 1 + (outcome % 3 = 0)::int END
      AND NOT EXISTS (SELECT 1 FROM delivery_attempts WHERE delivery_id = delivery.id)
)
INSERT INTO delivery_attempts
    (id, delivery_id, attempt_number, initiated_by, status, started_at, completed_at, http_status, error)
SELECT
    md5('deliverykit-medium-v1:attempt:' || delivery.id::text || ':' || attempt.number)::uuid,
    delivery.id,
    attempt.number,
    CASE WHEN attempt.number > 1 AND right(delivery.event_id, 1) IN ('3', '7')
         THEN 'MANUAL' ELSE 'AUTOMATIC' END,
    CASE WHEN attempt.number < delivery.attempts OR delivery.status = 'FAILED'
         THEN 'FAILED' ELSE 'SUCCEEDED' END,
    delivery.updated_at - (delivery.attempts - attempt.number + 1) * INTERVAL '20 seconds',
    delivery.updated_at - (delivery.attempts - attempt.number) * INTERVAL '20 seconds',
    CASE WHEN attempt.number < delivery.attempts THEN
             CASE (delivery.n + delivery.position) % 3
                 WHEN 0 THEN 503 WHEN 1 THEN 429 ELSE NULL END
         WHEN delivery.status = 'SUCCEEDED' THEN 204
         WHEN delivery.last_error LIKE '%503%' THEN 503
         ELSE NULL END,
    CASE WHEN attempt.number < delivery.attempts THEN
             CASE (delivery.n + delivery.position) % 3
                 WHEN 0 THEN 'Recipient returned HTTP 503'
                 WHEN 1 THEN 'Recipient returned HTTP 429'
                 ELSE 'java.net.http.HttpTimeoutException: recipient timed out' END
         WHEN delivery.status = 'FAILED' THEN delivery.last_error
         ELSE NULL END
FROM demo_deliveries AS delivery
CROSS JOIN LATERAL generate_series(1, delivery.attempts) AS attempt(number)
ON CONFLICT (id) DO NOTHING;

-- Completed items cannot be claimed; pending items are deferred far into the future.
-- This keeps the visual snapshot stable until a user explicitly retries a failed delivery.
WITH demo_delivery_ids AS (
    SELECT md5('deliverykit-medium-v1:delivery:demo-medium-' || lpad(n::text, 3, '0') || ':' || slug)::uuid AS id
    FROM generate_series(1, 20) AS n
    CROSS JOIN (VALUES ('crm'), ('billing'), ('inventory'), ('support'), ('analytics')) AS destinations(slug)
)
INSERT INTO queue (id, delivery_id, sent_at, claimed_until, created_at)
SELECT
    md5('deliverykit-medium-v1:queue:' || delivery.id::text)::uuid,
    delivery.id,
    CASE WHEN delivery.status = 'PENDING' THEN NULL ELSE delivery.updated_at END,
    CASE WHEN delivery.status = 'PENDING' THEN CURRENT_TIMESTAMP + INTERVAL '365 days' ELSE NULL END,
    delivery.updated_at
FROM deliveries AS delivery
JOIN demo_delivery_ids ON demo_delivery_ids.id = delivery.id
ON CONFLICT (id) DO NOTHING;

COMMIT;
