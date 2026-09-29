package com.ferlara.deliverykit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.ferlara.deliverykit.delivery.DeliveryApi;
import com.ferlara.deliverykit.delivery.DeliveryAttemptRepository;
import com.ferlara.deliverykit.delivery.DeliveryRepository;
import com.ferlara.deliverykit.delivery.DeliveryStore;
import com.ferlara.deliverykit.endpoint.IngressEndpointRepository;
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
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
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
    DeliveryAttemptRepository attempts;

    @Autowired
    WebhookEventRepository events;

    @Autowired
    WebhookEndpointRepository endpoints;

    @Autowired
    IngressEndpointRepository ingressEndpoints;

    @Autowired
    WebApplicationContext webContext;

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void rootServesBuiltReactApp() throws Exception {
        var mvc = MockMvcBuilders.webAppContextSetup(webContext).build();
        var welcome = mvc.perform(get("/")).andReturn().getResponse();
        assertEquals(200, welcome.getStatus());
        assertEquals("index.html", welcome.getForwardedUrl());

        var index = mvc.perform(get("/index.html")).andReturn().getResponse();
        assertEquals(200, index.getStatus());
        assertTrue(index.getContentAsString().contains("<div id=\"root\"></div>"));
        assertTrue(index.getContentAsString().contains("/assets/index-"));
    }

    @BeforeEach
    void clearDatabase() {
        queue.deleteAll();
        attempts.deleteAll();
        deliveries.deleteAll();
        events.deleteAll();
        endpoints.deleteAll();
        ingressEndpoints.deleteAll();
    }

    @Test
    void createsNamedIncomingEndpointAndReceivesEventsThroughItsUrl() throws Exception {
        store.addEndpoint("https://receiver.example.test/webhook");
        var mvc = MockMvcBuilders.webAppContextSetup(webContext).build();
        String id = "orders-production";
        String eventId = "named-" + UUID.randomUUID();

        assertEquals(
                401,
                mvc.perform(post("/ingress-endpoints")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"id\":\"" + id + "\"}"))
                        .andReturn()
                        .getResponse()
                        .getStatus());
        var created = mvc.perform(post("/ingress-endpoints")
                        .header("X-Admin-Token", "test-secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\":\"" + id + "\"}"))
                .andReturn()
                .getResponse();
        assertEquals(201, created.getStatus());
        assertTrue(created.getContentAsString().contains("\"id\":\"orders-production\""));
        assertTrue(created.getContentAsString().contains("\"createdAt\":"));
        assertEquals(1, store.ingressEndpoints().size());
        assertEquals(
                409,
                mvc.perform(post("/ingress-endpoints")
                                .header("X-Admin-Token", "test-secret")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"id\":\"" + id + "\"}"))
                        .andReturn()
                        .getResponse()
                        .getStatus());
        assertEquals(
                400,
                mvc.perform(post("/ingress-endpoints")
                                .header("X-Admin-Token", "test-secret")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"id\":\"Bad/ID\"}"))
                        .andReturn()
                        .getResponse()
                        .getStatus());

        String body = "{\"eventId\":\"" + eventId + "\",\"payload\":{\"kind\":\"order\"},\"sourceId\":\"spoofed\"}";
        assertEquals(
                404,
                mvc.perform(post("/webhooks/missing")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(body))
                        .andReturn()
                        .getResponse()
                        .getStatus());
        assertEquals(
                202,
                mvc.perform(post("/webhooks/" + id)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(body))
                        .andReturn()
                        .getResponse()
                        .getStatus());
        var delivery = store.delivery(store.eventDeliveries(eventId).getFirst());
        assertEquals(id, delivery.sourceId());
        assertEquals(1, store.ingressEndpoints().size());
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
    void incomingSourceMetadataAppearsOnDeliveryAndIgnoresForwardedIp() throws Exception {
        store.addEndpoint("https://receiver.example.test/webhook");
        String eventId = "source-" + UUID.randomUUID();
        var mvc = MockMvcBuilders.webAppContextSetup(webContext).build();
        String body = "{\"eventId\":\"" + eventId
                + "\",\"payload\":{\"kind\":\"demo\"},\"sourceId\":\"shopfront\",\"sourceUrl\":\"https://shop.example.test/events\"}";

        var accepted = mvc.perform(post("/webhooks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-Forwarded-For", "203.0.113.99")
                        .with(request -> {
                            request.setRemoteAddr("192.0.2.10");
                            return request;
                        }))
                .andReturn()
                .getResponse();
        assertEquals(202, accepted.getStatus());

        UUID deliveryId = store.eventDeliveries(eventId).getFirst();
        var delivery = store.delivery(deliveryId);
        assertEquals("shopfront", delivery.sourceId());
        assertEquals("https://shop.example.test/events", delivery.sourceUrl());
        assertEquals("192.0.2.10", delivery.connectionIp());

        var detail = mvc.perform(get("/deliveries/" + deliveryId)).andReturn().getResponse();
        assertEquals(200, detail.getStatus());
        assertTrue(detail.getContentAsString().contains("\"sourceId\":\"shopfront\""));
        assertTrue(detail.getContentAsString().contains("\"connectionIp\":\"192.0.2.10\""));

        String duplicate = body.replace("shopfront", "different-source");
        assertEquals(
                202,
                mvc.perform(post("/webhooks")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(duplicate))
                        .andReturn()
                        .getResponse()
                        .getStatus());
        assertEquals("shopfront", store.delivery(deliveryId).sourceId());
    }

    @Test
    void webhookWithoutSourceFieldsRemainsValid() throws Exception {
        store.addEndpoint("https://receiver.example.test/webhook");
        String eventId = "legacy-request-" + UUID.randomUUID();
        var mvc = MockMvcBuilders.webAppContextSetup(webContext).build();
        var response = mvc.perform(post("/webhooks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"eventId\":\"" + eventId + "\",\"payload\":{\"kind\":\"demo\"}}"))
                .andReturn()
                .getResponse();

        assertEquals(202, response.getStatus());
        var delivery = store.delivery(store.eventDeliveries(eventId).getFirst());
        assertNull(delivery.sourceId());
        assertNull(delivery.sourceUrl());
        assertNotNull(delivery.connectionIp());
    }

    @Test
    void invalidSourceUrlIsRejected() throws Exception {
        var mvc = MockMvcBuilders.webAppContextSetup(webContext).build();
        var response = mvc.perform(post("/webhooks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"eventId\":\"invalid-source\",\"payload\":{},\"sourceUrl\":\"not-a-url\"}"))
                .andReturn()
                .getResponse();
        assertEquals(400, response.getStatus());
        assertFalse(events.existsById("invalid-source"));
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
            var history = store.attemptHistory(id);
            assertEquals(1, history.size());
            assertEquals("SUCCEEDED", history.getFirst().status());
            assertEquals(204, history.getFirst().httpStatus());
            assertNotNull(history.getFirst().completedAt());
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
        var failedAttempt = store.attemptHistory(id).getFirst();
        assertEquals("FAILED", failedAttempt.status());
        assertNull(failedAttempt.httpStatus());
        assertTrue(failedAttempt.error().contains("CRM timed out"));
        assertTrue(store.readyQueueItems().isEmpty()); // Backoff prevents a hot retry loop.
        assertThrows(ResponseStatusException.class, () -> api.retry(id, "bad-token"));
        assertEquals(202, api.retry(id, "test-secret").getStatusCode().value());

        worker.poll();
        assertEquals("SUCCEEDED", store.delivery(id).status());
        assertEquals(2, store.delivery(id).attempts());
        var history = store.attemptHistory(id);
        assertEquals(2, history.size());
        assertEquals(2, history.getFirst().number());
        assertEquals("MANUAL", history.getFirst().initiatedBy());
        assertEquals("SUCCEEDED", history.getFirst().status());
        assertEquals(204, history.getFirst().httpStatus());
        assertEquals("AUTOMATIC", history.get(1).initiatedBy());
        var mvc = MockMvcBuilders.webAppContextSetup(webContext).build();
        var responseBody = mvc.perform(get("/deliveries/" + id + "/attempts"))
                .andReturn()
                .getResponse()
                .getContentAsString();
        assertTrue(responseBody.contains("\"initiatedBy\":\"MANUAL\""));
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

    @Test
    void httpFailureRecordsStatusAndAutomaticRetryHasSeparateHistory() throws Exception {
        var endpoint = store.addEndpoint("https://crm.example.test/webhook");
        UUID id = deliveryFor("http-failure-" + UUID.randomUUID(), endpoint.id());
        HttpClient client = mock(HttpClient.class);
        @SuppressWarnings("unchecked")
        HttpResponse<Void> unavailable = mock(HttpResponse.class);
        when(unavailable.statusCode()).thenReturn(503);
        @SuppressWarnings("unchecked")
        HttpResponse<Void> accepted = mock(HttpResponse.class);
        when(accepted.statusCode()).thenReturn(202);
        when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(unavailable, accepted);
        Worker worker = new Worker(store, client, true, 1);

        worker.poll();
        assertEquals("FAILED", store.delivery(id).status());
        assertEquals(503, store.attemptHistory(id).getFirst().httpStatus());
        assertTrue(store.attemptHistory(id).getFirst().error().contains("HTTP 503"));

        // The queued item remains deferred; the next send is an automatic retry.
        jdbc.update(
                "UPDATE queue SET claimed_until = CURRENT_TIMESTAMP - INTERVAL '1' SECOND WHERE delivery_id = ?", id);
        worker.poll();
        assertEquals("SUCCEEDED", store.delivery(id).status());
        assertEquals(2, store.attemptHistory(id).size());
        assertEquals("AUTOMATIC", store.attemptHistory(id).getFirst().initiatedBy());
        assertEquals(202, store.attemptHistory(id).getFirst().httpStatus());
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
