# Local demo data

Run this only against a local development database. The seed adds synthetic data
for a fictional medium-sized commerce company: 5 incoming endpoints, 5
destinations, 20
events, and 100 deliveries (70 succeeded, 20 failed, 10 pending) with synthetic
attempt histories showing HTTP failures, timeouts, successes, and manual retries.
No demo queue item is eligible for automatic delivery.

1. Start the local stack with `docker compose up --build -d` (after creating
   `.env` from `.env.example` and setting its required values).
2. Run `./scripts/seed-demo.sh`.
3. Open the **Deliveries** page and import `target/demo-delivery-ids.json` in
   **Load demo deliveries**. The browser will fetch their current statuses from
   the API. Incoming endpoints and destinations appear in their respective pages.
4. When finished, run `./scripts/seed-demo.sh --remove`.

The seed is safe to rerun without creating duplicate rows. Rerunning it refreshes
source details on marked demo events, including seeds created before the source
metadata migration. Attempt history is added only to untouched demo deliveries;
deliveries you have retried retain their actual history. The removal command
targets the marked demo records and leaves unrelated data intact. While present,
the synthetic destination endpoints are active for any new event you submit, so
remove the seed before normal local development. The generated JSON file
contains delivery IDs only, not payloads or credentials.
