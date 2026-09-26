# Agent guidance

## Project

- Java 21 / Spring Boot 4, built with Maven Wrapper. Keep application code under `com.ferlara.deliverykit`, grouped by `delivery`, `endpoint`, `event`, and `queue`, with matching tests under `src/test/java`.
- `DeliveryApi` owns HTTP routes and admin-token checks. `DeliveryStore` owns PostgreSQL state and outbox transitions. `QueueWorker` claims outbox rows and sends webhooks.
- Flyway migrations under `src/main/resources/db/migration` own the schema. `compose.yaml` runs PostgreSQL and the app, with optional separate worker replicas.
- Delivery is at least once. Preserve the event ID uniqueness, conditional delivery claim, stable `Idempotency-Key`, and outbox behavior when changing flow logic.

## Working conventions

- Keep changes focused and add dependencies only when required.
- Add or update tests for behavior changes. Tests must cover delivery success and retry behavior without real AWS resources.
- Use synthetic data only. Never add company code, credentials, or customer data. Use only `--profile personal` for any AWS CLI command; never use other profiles.
- Do not commit generated files from `target/` or local IDE settings.

## Commands

- Tests: `./mvnw test`
- Local stack: `cp env.example .env`, set secrets, then `docker compose up --build -d`
- Build package: `./mvnw package`
