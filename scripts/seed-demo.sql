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

WITH demo_events AS (
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
)
INSERT INTO webhook_events (event_id, payload, created_at)
SELECT event_id, payload, CURRENT_TIMESTAMP - (21 - n) * INTERVAL '3 hours'
FROM demo_events
ON CONFLICT (event_id) DO NOTHING;

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
INSERT INTO deliveries (id, event_id, endpoint_id, target_url, payload, status, attempts, last_error, updated_at)
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
    created_at + INTERVAL '2 minutes'
FROM candidates
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
