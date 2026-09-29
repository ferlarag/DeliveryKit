#!/usr/bin/env bash
set -euo pipefail

# Local development only. Synthetic destinations become active recipients for
# future events until removed with --remove.

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "Create .env from .env.example and start the local Compose stack first." >&2
  exit 1
fi

if [[ -z "$(docker compose ps -q db)" ]]; then
  echo "The Compose database is not running. Start it with: docker compose up -d db app" >&2
  exit 1
fi

if [[ "${1:-seed}" == "--remove" ]]; then
  docker compose exec -T db sh -c 'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < scripts/remove-demo.sql
  mkdir -p target
  printf '{"format":"deliverykit-demo-v1","deliveryIds":[]}\n' > target/demo-delivery-ids.json
  echo "Demo rows removed. Other data was preserved."
  exit 0
fi

if [[ "${1:-seed}" != "seed" ]]; then
  echo "Usage: scripts/seed-demo.sh [seed|--remove]" >&2
  exit 2
fi

docker compose exec -T db sh -c 'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < scripts/seed-demo.sql
mkdir -p target
docker compose exec -T db sh -c 'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > target/demo-delivery-ids.json <<'SQL'
SELECT json_build_object(
    'format', 'deliverykit-demo-v1',
    'deliveryIds', COALESCE(json_agg(delivery.id ORDER BY event.created_at DESC, delivery.id), '[]'::json)
)
FROM deliveries AS delivery
JOIN webhook_events AS event ON event.event_id = delivery.event_id
WHERE event.event_id IN (
    SELECT 'demo-medium-' || lpad(n::text, 3, '0') FROM generate_series(1, 20) AS n
)
  AND event.payload::jsonb ->> '_demoSeed' = 'deliverykit-medium-v1'
  AND delivery.id IN (
      SELECT md5('deliverykit-medium-v1:delivery:demo-medium-' || lpad(n::text, 3, '0') || ':' || slug)::uuid
      FROM generate_series(1, 20) AS n
      CROSS JOIN (VALUES ('crm'), ('billing'), ('inventory'), ('support'), ('analytics')) AS destinations(slug)
  );
SQL

echo "Demo data seeded. Import target/demo-delivery-ids.json on the Deliveries page to populate its table."
echo "These synthetic destinations receive future events; run scripts/seed-demo.sh --remove before normal local use."
