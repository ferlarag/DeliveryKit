package com.ferlara.deliverykit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.ferlara.deliverykit.delivery.DeliveryApi;
import com.ferlara.deliverykit.delivery.DeliveryRepository;
import com.ferlara.deliverykit.delivery.DeliveryStore;
import com.ferlara.deliverykit.endpoint.WebhookEndpointRepository;
import com.ferlara.deliverykit.event.WebhookEventRepository;
import com.ferlara.deliverykit.queue.QueueItemRepository;
import com.ferlara.deliverykit.queue.Worker;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.web.server.ResponseStatusException;

@SpringBootTest(
        properties = {
            "spring.datasource.url=jdbc:h2:mem:delivery;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
            "spring.datasource.username=sa",
            "spring.datasource.password=",
            "app.worker-enabled=false",
            "app.allow-http-targets=true",
            "app.admin-token=test-secret"
        })
class DeliveryKitApplicationTests {
    @Autowired
    DeliveryStore store;

    @Autowired
    DeliveryApi api;

    @Autowired
    QueueItemRepository queue;

    @Autowired
    DeliveryRepository deliveries;

    @Autowired
    WebhookEventRepository events;

    @Autowired
    WebhookEndpointRepository endpoints;

    @BeforeEach
    void clearDatabase() {
        queue.deleteAll();
        deliveries.deleteAll();
        events.deleteAll();
        endpoints.deleteAll();
    }

    @Test
    void duplicateEventIdCannotReplacePayload() {
        String eventId = "duplicate-" + UUID.randomUUID();
        store.createEvent(eventId, "{\"kind\":\"original\"}");

        assertThrows(
                DataIntegrityViolationException.class, () -> store.createEvent(eventId, "{\"kind\":\"replacement\"}"));
        assertEquals("{\"kind\":\"original\"}", store.eventPayload(eventId));
    }

    @Test
    void successfulDeliveryCompletesQueueItemAndDoesNotResend() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/crm", exchange -> {
            calls.incrementAndGet();
            assertEquals("application/json", exchange.getRequestHeaders().getFirst("Content-Type"));
            assertNotNull(exchange.getRequestHeaders().getFirst("Idempotency-Key"));
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
        });
        server.start();
        try {
            var endpoint =
                    store.addEndpoint("http://127.0.0.1:" + server.getAddress().getPort() + "/crm");
            UUID id = deliveryFor("success-" + UUID.randomUUID(), endpoint.id());
            Worker worker = new Worker(store, HttpClient.newHttpClient(), true, 1);
            worker.poll();
            worker.poll();
            assertEquals(1, calls.get());
            assertEquals("SUCCEEDED", store.delivery(id).status());
            assertEquals(1, store.delivery(id).attempts());
            assertTrue(store.readyQueueItems().isEmpty());
        } finally {
            server.stop(0);
        }
    }

    @Test
    void failedDeliveryIsDeferredThenManualReplayUsesSameIdempotencyKey() throws Exception {
        var endpoint = store.addEndpoint("https://crm.example.test/webhook");
        UUID id = deliveryFor("timeout-" + UUID.randomUUID(), endpoint.id());
        HttpClient client = mock(HttpClient.class);
        @SuppressWarnings("unchecked")
        HttpResponse<Void> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(204);
        when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenThrow(new HttpTimeoutException("CRM timed out"))
                .thenReturn(response);
        Worker worker = new Worker(store, client, true, 1);

        worker.poll();
        assertEquals("FAILED", store.delivery(id).status());
        assertEquals(1, store.delivery(id).attempts());
        assertTrue(store.readyQueueItems().isEmpty()); // Backoff prevents a hot retry loop.
        assertThrows(ResponseStatusException.class, () -> api.retry(id, "bad-token"));
        assertEquals(202, api.retry(id, "test-secret").getStatusCode().value());

        worker.poll();
        assertEquals("SUCCEEDED", store.delivery(id).status());
        assertEquals(2, store.delivery(id).attempts());
        var requests = mockingDetails(client).getInvocations().stream()
                .filter(call -> call.getMethod().getName().equals("send"))
                .map(call -> (HttpRequest) call.getArgument(0))
                .toList();
        assertEquals(2, requests.size());
        assertEquals(
                id.toString(),
                requests.get(0).headers().firstValue("Idempotency-Key").orElseThrow());
        assertEquals(
                id.toString(),
                requests.get(1).headers().firstValue("Idempotency-Key").orElseThrow());
    }

    private UUID deliveryFor(String eventId, UUID endpointId) {
        store.createEvent(eventId, "{\"kind\":\"demo\"}");
        String url = store.endpoints().stream()
                .filter(e -> e.id().equals(endpointId))
                .findFirst()
                .orElseThrow()
                .url();
        return store.eventDeliveries(eventId).stream()
                .filter(id -> store.delivery(id).targetUrl().equals(url))
                .findFirst()
                .orElseThrow();
    }
}
