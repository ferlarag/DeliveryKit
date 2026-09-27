package com.ferlara.deliverykit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.DriverManager;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

class QueueMigrationTests {
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
            statement.executeUpdate("INSERT INTO webhook_events (event_id, payload) VALUES ('migration-event', '{}')");
            statement.executeUpdate(
                    "INSERT INTO deliveries (id, event_id, endpoint_id, target_url, payload, status) VALUES ('"
                            + deliveryId
                            + "', 'migration-event', '00000000-0000-0000-0000-000000000001', 'https://example.test/hook', '{}', 'PENDING')");
            statement.executeUpdate(
                    "INSERT INTO queue_outbox (id, delivery_id) VALUES ('" + itemId + "', '" + deliveryId + "')");
        }

        Flyway.configure().dataSource(url, "sa", "").load().migrate();

        try (var connection = DriverManager.getConnection(url, "sa", "");
                var statement = connection.createStatement();
                var rows =
                        statement.executeQuery("SELECT delivery_id, sent_at FROM queue WHERE id = '" + itemId + "'")) {
            assertTrue(rows.next());
            assertEquals(deliveryId, rows.getObject("delivery_id", UUID.class));
            assertNull(rows.getTimestamp("sent_at"));
        }
    }
}
