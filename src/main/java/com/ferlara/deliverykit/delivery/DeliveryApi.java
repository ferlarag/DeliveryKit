package com.ferlara.deliverykit.delivery;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;

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
            @NotBlank String eventId,
            @NotNull JsonNode payload,
            @Size(max = 200) String sourceId,
            @Size(max = 2048) String sourceUrl) {}

    public record EndpointRequest(@NotBlank String url) {}

    public record IngressEndpointRequest(@NotBlank String id) {}

    public record EventResponse(String eventId, List<UUID> deliveryIds) {}

    @PostMapping("/webhooks")
    public ResponseEntity<EventResponse> postWebhook(
            @Valid @RequestBody EventRequest request, HttpServletRequest httpRequest) {
        return receiveWebhook(request, httpRequest, optionalSourceId(request.sourceId()));
    }

    @PostMapping("/webhooks/{endpointId}")
    public ResponseEntity<EventResponse> postIngressWebhook(
            @PathVariable String endpointId, @Valid @RequestBody EventRequest request, HttpServletRequest httpRequest) {
        if (!store.ingressEndpointExists(endpointId)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return receiveWebhook(request, httpRequest, endpointId);
    }

    private ResponseEntity<EventResponse> receiveWebhook(
            EventRequest request, HttpServletRequest httpRequest, String sourceId) {
        if (request.eventId().length() > 200)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "eventId exceeds 200 characters");
        String sourceUrl = optionalSourceUrl(request.sourceUrl());
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
            String remoteAddress = httpRequest.getRemoteAddr();
            String connectionIp = remoteAddress != null && remoteAddress.length() <= 64 ? remoteAddress : null;
            return ResponseEntity.status(HttpStatus.ACCEPTED)
                    .body(new EventResponse(
                            request.eventId(),
                            store.createEvent(
                                    request.eventId(),
                                    payload,
                                    new DeliveryStore.EventOrigin(sourceId, sourceUrl, connectionIp))));
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "eventId already exists; retry the request", e);
        }
    }

    @GetMapping("/ingress-endpoints")
    public List<DeliveryStore.IngressEndpoint> ingressEndpoints(
            @RequestHeader(value = "X-Admin-Token", required = false) String token) {
        requireAdmin(token);
        return store.ingressEndpoints();
    }

    @PostMapping("/ingress-endpoints")
    public ResponseEntity<DeliveryStore.IngressEndpoint> addIngressEndpoint(
            @Valid @RequestBody IngressEndpointRequest request,
            @RequestHeader(value = "X-Admin-Token", required = false) String token) {
        requireAdmin(token);
        String id = request.id().trim();
        if (id.length() > 64 || !id.matches("[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?")) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "ID must be 1-64 lowercase letters, numbers, hyphens, or underscores");
        }
        if (store.ingressEndpointExists(id))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Incoming endpoint ID already exists");
        try {
            return ResponseEntity.status(HttpStatus.CREATED).body(store.addIngressEndpoint(id));
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Incoming endpoint ID already exists", e);
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

    @GetMapping("/deliveries/{id}/attempts")
    public List<DeliveryStore.Attempt> attemptHistory(@PathVariable UUID id) {
        if (store.delivery(id) == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return store.attemptHistory(id);
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

    private static String optionalSourceId(String value) {
        if (value == null) return null;
        String sourceId = value.trim();
        if (sourceId.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "sourceId cannot be blank");
        return sourceId;
    }

    private static String optionalSourceUrl(String value) {
        if (value == null) return null;
        String sourceUrl = value.trim();
        URI uri;
        try {
            uri = URI.create(sourceUrl);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "sourceUrl must be an absolute HTTP or HTTPS URL");
        }
        if (uri.getHost() == null
                || uri.getUserInfo() != null
                || uri.getFragment() != null
                || !(uri.getScheme().equals("https") || uri.getScheme().equals("http"))) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "sourceUrl must be an absolute HTTP or HTTPS URL");
        }
        return sourceUrl;
    }
}
