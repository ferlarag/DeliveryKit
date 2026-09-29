# Local demo data

Run this only against a local development database. The seed adds synthetic data
for a fictional medium-sized commerce company: 5 destination endpoints, 20
events, and 100 deliveries (70 succeeded, 20 failed, 10 pending). No demo queue
item is eligible for automatic delivery.

1. Start the local stack with `docker compose up --build -d` (after creating
   `.env` from `.env.example` and setting its required values).
2. Run `./scripts/seed-demo.sh`.
3. Open the **Deliveries** page and import `target/demo-delivery-ids.json` in
   **Load demo deliveries**. The browser will fetch their current statuses from
   the API. Destinations appear automatically in the **Destinations** page.
4. When finished, run `./scripts/seed-demo.sh --remove`.

The seed is safe to rerun without creating duplicate rows. It does not change
existing rows. The removal command targets the marked demo records and leaves
unrelated data intact. While present, the synthetic destination endpoints are
active for any new event you submit, so remove the seed before normal local
development. The generated JSON file contains delivery IDs only, not payloads
or credentials.
