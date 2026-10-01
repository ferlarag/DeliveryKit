ALTER TABLE ingress_endpoints ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE ingress_endpoint_destinations (
    ingress_id VARCHAR(64) NOT NULL REFERENCES ingress_endpoints (id) ON DELETE CASCADE,
    destination_id UUID NOT NULL REFERENCES webhook_endpoints (id),
    PRIMARY KEY (ingress_id, destination_id)
);

-- Keep every existing named endpoint's forwarding behavior until its settings change.
INSERT INTO ingress_endpoint_destinations (ingress_id, destination_id)
SELECT ingress.id, destination.id
FROM ingress_endpoints AS ingress
CROSS JOIN webhook_endpoints AS destination;
