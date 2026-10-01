package com.ferlara.deliverykit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.DriverManager;
import java.time.Instant;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

class QueueMigrationTests {
    @Test
    void routingMigrationPreservesExistingIncomingForwarding() throws Exception {
        String url = "jdbc:h2:mem:ingress-routing-" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        Flyway.configure().dataSource(url, "sa", "").target("5").load().migrate();

        try (var connection = DriverManager.getConnection(url, "sa", "");
                var statement = connection.createStatement()) {
            statement.executeUpdate(
                    "INSERT INTO webhook_endpoints (id, url) VALUES ('00000000-0000-0000-0000-000000000001', 'https://one.example.test/hook')");
            statement.executeUpdate(
                    "INSERT INTO webhook_endpoints (id, url) VALUES ('00000000-0000-0000-0000-000000000002', 'https://two.example.test/hook')");
            statement.executeUpdate("INSERT INTO ingress_endpoints (id) VALUES ('orders')");
        }

        Flyway.configure().dataSource(url, "sa", "").load().migrate();

        try (var connection = DriverManager.getConnection(url, "sa", "");
                var statement = connection.createStatement();
                var rows = statement.executeQuery(
                        "SELECT COUNT(*) FROM ingress_endpoint_destinations WHERE ingress_id = 'orders'")) {
            assertTrue(rows.next());
            assertEquals(2, rows.getInt(1));
        }
    }

    @Test
    void renameKeepsPendingQueueItems() throws Exception {
        String url = "jdbc:h2:mem:queue-migration-" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        Flyway.configure().dataSource(url, "sa", "").target("1").load().migrate();

        UUID deliveryId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();
        try (var connection = DriverManager.getConnection(url, "sa", "");
                var statement = connection.createStatement()) {
            statement.executeUpdate(
                    "INSERT INTO webhook_endpoints (id, url) VALUES ('00000000-0000-0000-0000-000000000001', 'https://example.test/hook')");
            statement.executeUpdate(
                    "INSERT INTO webhook_events (event_id, payload, created_at) VALUES ('migration-event', '{}', TIMESTAMP WITH TIME ZONE '2025-01-02 03:04:05+00')");
            statement.executeUpdate(
                    "INSERT INTO deliveries (id, event_id, endpoint_id, target_url, payload, status, attempts) VALUES ('"
                            + deliveryId
                            + "', 'migration-event', '00000000-0000-0000-0000-000000000001', 'https://example.test/hook', '{}', 'PENDING', 2)");
            statement.executeUpdate(
                    "INSERT INTO queue_outbox (id, delivery_id) VALUES ('" + itemId + "', '" + deliveryId + "')");
        }

        Flyway.configure().dataSource(url, "sa", "").load().migrate();

        try (var connection = DriverManager.getConnection(url, "sa", "");
                var statement = connection.createStatement();
                var rows = statement.executeQuery(
                        "SELECT delivery_id, sent_at, manual_retry FROM queue WHERE id = '" + itemId + "'")) {
            assertTrue(rows.next());
            assertEquals(deliveryId, rows.getObject("delivery_id", UUID.class));
            assertNull(rows.getTimestamp("sent_at"));
            assertTrue(!rows.getBoolean("manual_retry"));
        }

        try (var connection = DriverManager.getConnection(url, "sa", "");
                var statement = connection.createStatement();
                var rows = statement.executeQuery(
                        "SELECT attempts, created_at FROM deliveries WHERE id = '" + deliveryId + "'")) {
            assertTrue(rows.next());
            assertEquals(2, rows.getInt("attempts"));
            assertEquals(
                    Instant.parse("2025-01-02T03:04:05Z"),
                    rows.getTimestamp("created_at").toInstant());
        }

        try (var connection = DriverManager.getConnection(url, "sa", "");
                var statement = connection.createStatement();
                var rows = statement.executeQuery("SELECT COUNT(*) FROM delivery_attempts")) {
            assertTrue(rows.next());
            assertEquals(0, rows.getInt(1));
        }

        try (var connection = DriverManager.getConnection(url, "sa", "");
                var statement = connection.createStatement();
                var rows = statement.executeQuery(
                        "SELECT source_id, source_url, connection_ip FROM webhook_events WHERE event_id = 'migration-event'")) {
            assertTrue(rows.next());
            assertNull(rows.getString("source_id"));
            assertNull(rows.getString("source_url"));
            assertNull(rows.getString("connection_ip"));
        }
    }
}
