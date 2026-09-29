# DeliveryKit

DeliveryKit is a webhook delivery system. It can run on a single container that includes an API, a React Frontend,
workers and a Postgres database. The same image can also run as an API-only or worker-only container.

## Architecture

```mermaid
flowchart LR
    Client -->|HTTP| API[App container: page + API]
    API -->|transaction: event + deliveries + queue| Postgres[(PostgreSQL)]
    Worker[App container: worker] -->|claim queue item + delivery| Postgres
    Worker -->|HTTP POST| Recipient
    Worker -->|result + retry time| Postgres
```

## High-level

DeliveryKit uses Postgres as its durable work queue. The API inserts the event, deliveries, and queue items in one
transaction. Workers claim queue items and deliveries with conditional database updates. Multiple worker containers can
share one database efficiently.

Features:

- Persistent queue with Postgres
- Idempotent delivery
- Exponential backoff retry

## Local single-machine mode

Requires Docker Compose. Copy the example environment file and set a strong database password and admin token:

```bash
cp .env.example .env
docker compose up --build -d
docker compose logs -f app
```

Open `http://localhost:8080` (or the port set by `APP_PORT`). The app serves the current browser page and API on the
same port. PostgreSQL is also available on localhost for IDE runs; its data is in the `pgdata` volume. No Nginx is required for
this setup. Put a TLS reverse proxy in front of the app when exposing it on the internet. `docker compose down` stops
the services; `docker compose down -v` also **deletes the database volume**.

The browser page is a React SPA in `frontend/`, built with Vite+, TanStack Router, and shadcn/ui. Maven builds it into
the Spring Boot jar, so `./mvnw package` and the Docker image serve it at `/`. The SPA has incoming event, destination,
delivery list, and delivery detail views. For frontend development, copy `frontend/.env.example` to `frontend/.env`,
then run `npm ci` and `npm run dev` in `frontend/`. Maven downloads its own Node.js for reproducible jar builds.

The application reads these variables from `.env`:

| Variable                                             | Purpose                                                                                                         |
|------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------|
| `DATABASE_URL`, `DATABASE_USER`, `DATABASE_PASSWORD` | PostgreSQL connection. The URL in the example points to the Compose `db` service.                               |
| `DATABASE_NAME`                                      | Database created by the Compose PostgreSQL container. Keep the database name in `DATABASE_URL` aligned with it. |
| `DATABASE_PORT`                                      | Host loopback port for PostgreSQL, for IDE runs. Defaults to 5432.                                             |
| `ADMIN_TOKEN`                                        | Protects endpoint management and manual retry.                                                                  |
| `APP_PORT`                                           | Host port for the API and page.                                                                                 |
| `ALLOW_HTTP_TARGETS`                                 | Permit HTTP webhook targets for local testing; leave `false` for public deployments.                            |
| `WORKER_ENABLED`                                     | Run workers in the API container. `true` makes the smallest two-container install.                              |
| `WORKER_CONCURRENCY`                                 | Concurrent webhook attempts per worker container, from 1 to 32.                                                 |
| `WORKER_POLL_INTERVAL_MS`                            | Delay between database polls.                                                                                   |

For dedicated workers, set `WORKER_ENABLED=false` in `.env` and start the optional worker service:

```bash
docker compose --profile workers up --build -d --scale worker=2
```

This runs one API container, two worker containers, and one database container on the same machine. Increase or decrease
the worker count and concurrency based on webhook latency and database capacity. Each worker has no inbound port. The
API and workers use the same image and environment variables; the worker service sets
`SPRING_MAIN_WEB_APPLICATION_TYPE=none` to avoid starting an HTTP server. Avoid scaling the `db` service; all replicas
need the same PostgreSQL database.

## Containers on AWS

Build and push the Dockerfile image to ECR. Run that image in two ECS services connected to one PostgreSQL database: an
API service with an HTTP listener and `WORKER_ENABLED=false`, and a worker service with `WORKER_ENABLED=true` and
`SPRING_MAIN_WEB_APPLICATION_TYPE=none`. Scale either service independently. For a low-volume deployment, one ECS
service with `WORKER_ENABLED=true` can run both roles. ECS task environment variables correspond to the keys in
`.env.example`; inject the database password and admin token as secrets. The database may be RDS PostgreSQL or PostgreSQL
you manage. ECR stores the image and ECS runs the containers; neither is needed for self-hosting.

This repository does not currently include an AWS infrastructure template or deployment automation. Provision an HTTPS
entry point, database, and network access appropriate to your installation. The app responds at `/health` when its
database is available. The image exposes port 8080.

## API and delivery behavior

`POST /webhooks` accepts `{"eventId":"unique-1","payload":{"kind":"demo"}}` and returns delivery IDs with status 202.
Repeating an event ID with the same payload returns its existing deliveries; a different payload is rejected. Each
endpoint gets its own delivery. `GET /deliveries/{id}` shows status, attempts, and last error.
`GET /deliveries/{id}/attempts` returns each recorded send with timing, outcome, HTTP status,
failure reason, and whether it followed a manual retry. Attempts made before the history migration
retain their count but have no individual records.
`POST /deliveries/{id}/retry` accepts a failed delivery and requires `X-Admin-Token`; endpoint creation and listing
require the same token. The recipient receives `X-Webhook-Event-Id` and a stable `Idempotency-Key`.

`GET /ingress-endpoints` lists reusable incoming endpoints; `POST /ingress-endpoints` creates one with a unique
1–64 character lowercase ID. Both require `X-Admin-Token`. Senders POST events to `/webhooks/{endpointId}`;
DeliveryKit records that endpoint ID as the event source. Create endpoints with `destinationIds` to choose where
new events go, or update them with `PUT /ingress-endpoints/{id}/destinations`. Select at least one existing
destination. Existing endpoints keep their previous all-destination routing until changed. Archive and restore with
the corresponding `/archive` and
`/restore` POST routes. Archived URLs return HTTP 410; already queued deliveries continue.
`DELETE /ingress-endpoints/{id}` is allowed only before the endpoint receives an event. The shared `/webhooks` URL
remains available and forwards to every destination.

Destinations can be edited with `PUT /endpoints/{id}` and `{"url":"https://..."}` using `X-Admin-Token`.
The destination ID and incoming endpoint routing stay the same. New deliveries use the updated URL; existing
deliveries and their retries keep the URL recorded when each delivery was created.
`DELETE /endpoints/{id}` removes a destination from active routing after it has been unassigned from all incoming
endpoints. Delivery history remains intact. `POST /endpoints/{id}/restore` makes it available again, without
reassigning it to incoming endpoints. `GET /endpoints?includeArchived=true` includes removed destinations.

Event submissions may include `sourceId` (up to 200 characters) and `sourceUrl` (an HTTP or HTTPS URL, up to 2048
characters). On named endpoint URLs, the endpoint ID is recorded as `sourceId`; on the shared URL, any caller-provided
`sourceId` is a claim, not an authenticated identity. Delivery detail also records the direct connection IP from
the original request; behind a proxy this is the proxy's IP. Forwarded IP headers are not trusted.
Existing events have empty source fields after migration. Rerun the local demo seed to fill those fields for demo events.

Flyway owns the schema in `src/main/resources/db/migration`. Hibernate validates it at startup. The initial migration is
unchanged, and V2 renames the queue table without dropping its data. If migrating a database originally created with
`schema.sql` and no Flyway history, back it up, confirm it matches V1, and start once with
`FLYWAY_BASELINE_ON_MIGRATE=true`; then remove that setting. Inspect `flyway_schema_history` before normal operation.

Run tests with `./mvnw test`, format Java sources with `./mvnw spotless:apply`, and check formatting with
`./mvnw spotless:check`. The Maven `verify` phase also checks formatting. Build an image with
`docker build -t deliverykit:local .`. Tests use H2 and a local HTTP server or mocked HTTP client; they need no AWS
resources.

## Current limits

- Event submission and delivery lookup are unauthenticated
- HTTPS endpoint validation does not block private destinations after DNS resolution
- There is no retry limit, dead-letter queue, tenant isolation, signed webhook, or payload retention policy. Repeatedly
  failing deliveries remain in the database and retry at most once per hour.
