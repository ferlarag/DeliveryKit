-- Remove only rows owned by scripts/seed-demo.sql. Preserve any other data.
BEGIN;

WITH demo_delivery_ids AS (
    SELECT md5('deliverykit-medium-v1:delivery:demo-medium-' || lpad(n::text, 3, '0') || ':' || slug)::uuid AS id
    FROM generate_series(1, 20) AS n
    CROSS JOIN (VALUES ('crm'), ('billing'), ('inventory'), ('support'), ('analytics')) AS destinations(slug)
)
DELETE FROM queue
WHERE delivery_id IN (
    SELECT delivery.id
    FROM deliveries AS delivery
    JOIN webhook_events AS event ON event.event_id = delivery.event_id
    JOIN demo_delivery_ids ON demo_delivery_ids.id = delivery.id
    WHERE event.payload::jsonb ->> '_demoSeed' = 'deliverykit-medium-v1'
);

WITH demo_delivery_ids AS (
    SELECT md5('deliverykit-medium-v1:delivery:demo-medium-' || lpad(n::text, 3, '0') || ':' || slug)::uuid AS id
    FROM generate_series(1, 20) AS n
    CROSS JOIN (VALUES ('crm'), ('billing'), ('inventory'), ('support'), ('analytics')) AS destinations(slug)
)
DELETE FROM delivery_attempts
WHERE delivery_id IN (
    SELECT delivery.id
    FROM deliveries AS delivery
    JOIN webhook_events AS event ON event.event_id = delivery.event_id
    JOIN demo_delivery_ids ON demo_delivery_ids.id = delivery.id
    WHERE event.payload::jsonb ->> '_demoSeed' = 'deliverykit-medium-v1'
);

WITH demo_delivery_ids AS (
    SELECT md5('deliverykit-medium-v1:delivery:demo-medium-' || lpad(n::text, 3, '0') || ':' || slug)::uuid AS id
    FROM generate_series(1, 20) AS n
    CROSS JOIN (VALUES ('crm'), ('billing'), ('inventory'), ('support'), ('analytics')) AS destinations(slug)
)
DELETE FROM deliveries AS delivery
USING webhook_events AS event, demo_delivery_ids AS demo
WHERE delivery.id = demo.id
  AND event.event_id = delivery.event_id
  AND event.payload::jsonb ->> '_demoSeed' = 'deliverykit-medium-v1';

DELETE FROM webhook_events
WHERE event_id IN (
    SELECT 'demo-medium-' || lpad(n::text, 3, '0') FROM generate_series(1, 20) AS n
)
  AND payload::jsonb ->> '_demoSeed' = 'deliverykit-medium-v1'
  AND NOT EXISTS (SELECT 1 FROM deliveries WHERE deliveries.event_id = webhook_events.event_id);

DELETE FROM ingress_endpoints AS endpoint
WHERE endpoint.id IN (
    SELECT 'demo-medium-v1-' || slug
    FROM (VALUES ('storefront'), ('billing'), ('crm'), ('inventory'), ('support')) AS sources(slug)
)
  AND endpoint.created_at = TIMESTAMP WITH TIME ZONE '2025-01-01 00:00:00+00'
  AND NOT EXISTS (
      SELECT 1 FROM webhook_events AS event
      WHERE event.source_id = endpoint.id
  );

WITH demo_endpoints AS (
    SELECT
        md5('deliverykit-medium-v1:endpoint:' || slug)::uuid AS id,
        'https://' || slug || '.example.invalid/hooks/deliverykit' AS url
    FROM (VALUES ('crm'), ('billing'), ('inventory'), ('support'), ('analytics')) AS destinations(slug)
)
DELETE FROM webhook_endpoints AS endpoint
USING demo_endpoints AS demo
WHERE endpoint.id = demo.id
  AND endpoint.url = demo.url
  AND NOT EXISTS (SELECT 1 FROM deliveries WHERE deliveries.endpoint_id = endpoint.id);

COMMIT;
