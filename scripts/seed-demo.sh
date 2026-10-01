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
  echo "Demo rows removed. Other data was preserved."
  exit 0
fi

if [[ "${1:-seed}" != "seed" ]]; then
  echo "Usage: scripts/seed-demo.sh [seed|--remove]" >&2
  exit 2
fi

docker compose exec -T db sh -c 'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < scripts/seed-demo.sql
echo "Demo data seeded. Open the Deliveries page to browse it."
echo "These synthetic destinations receive future events; run scripts/seed-demo.sh --remove before normal local use."
