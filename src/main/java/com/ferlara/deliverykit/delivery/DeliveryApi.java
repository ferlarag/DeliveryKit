package com.ferlara.deliverykit.delivery;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
public class DeliveryApi {
    private final DeliveryStore store;
    private final String adminToken;
    private final boolean allowHttp;

    public DeliveryApi(
            DeliveryStore store,
            @Value("${app.admin-token}") String adminToken,
            @Value("${app.allow-http-targets}") boolean allowHttp) {
        this.store = store;
        this.adminToken = adminToken;
        this.allowHttp = allowHttp;
    }

    public record EventRequest(
            @NotBlank String eventId, @NotNull JsonNode payload) {}

    public record EndpointRequest(@NotBlank String url) {}

    public record EventResponse(String eventId, List<UUID> deliveryIds) {}

    @PostMapping("/webhooks")
    public ResponseEntity<EventResponse> postWebhook(@Valid @RequestBody EventRequest request) {
        if (request.eventId().length() > 200)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "eventId exceeds 200 characters");
        String payload = request.payload().toString();
        if (payload.length() > 200_000) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "payload too large");
        String existing = store.eventPayload(request.eventId());
        if (existing != null) {
            if (!existing.equals(payload))
                throw new ResponseStatusException(HttpStatus.CONFLICT, "eventId already has a different payload");
            return ResponseEntity.status(HttpStatus.ACCEPTED)
                    .body(new EventResponse(request.eventId(), store.eventDeliveries(request.eventId())));
        }
        try {
            return ResponseEntity.status(HttpStatus.ACCEPTED)
                    .body(new EventResponse(request.eventId(), store.createEvent(request.eventId(), payload)));
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "eventId already exists; retry the request", e);
        }
    }

    @GetMapping("/deliveries/{id}")
    public DeliveryStore.Delivery getDelivery(@PathVariable UUID id) {
        DeliveryStore.Delivery delivery = store.delivery(id);
        if (delivery == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return delivery;
    }

    @PostMapping("/deliveries/{id}/retry")
    public ResponseEntity<?> retry(
            @PathVariable UUID id, @RequestHeader(value = "X-Admin-Token", required = false) String token) {
        requireAdmin(token);
        if (store.delivery(id) == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        if (!store.retry(id))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only failed deliveries can be retried");
        return ResponseEntity.accepted().body(Map.of("id", id, "status", "PENDING"));
    }

    @GetMapping("/endpoints")
    public List<DeliveryStore.Endpoint> endpoints(
            @RequestHeader(value = "X-Admin-Token", required = false) String token) {
        requireAdmin(token);
        return store.endpoints();
    }

    @PostMapping("/endpoints")
    public ResponseEntity<DeliveryStore.Endpoint> addEndpoint(
            @Valid @RequestBody EndpointRequest request,
            @RequestHeader(value = "X-Admin-Token", required = false) String token) {
        requireAdmin(token);
        URI uri;
        try {
            uri = URI.create(request.url());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid URL");
        }
        if (uri.getHost() == null
                || uri.getUserInfo() != null
                || uri.getFragment() != null
                || !(uri.getScheme().equals("https")
                        || (allowHttp && uri.getScheme().equals("http")))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Target must be an absolute HTTPS URL");
        }
        try {
            return ResponseEntity.status(HttpStatus.CREATED).body(store.addEndpoint(uri.toString()));
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Endpoint already exists", e);
        }
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        store.checkHealth();
        return Map.of("status", "ok");
    }

    private void requireAdmin(String supplied) {
        if (supplied == null
                || !MessageDigest.isEqual(
                        supplied.getBytes(StandardCharsets.UTF_8), adminToken.getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Missing or invalid admin token");
        }
    }
}
