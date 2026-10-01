package com.ferlara.deliverykit.delivery;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.InvalidDataAccessApiUsageException;
import org.springframework.format.annotation.DateTimeFormat;
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

    public record EndpointRequest(
            @NotBlank @Size(max = 2048) String url) {}

    public record IngressEndpointRequest(@NotBlank String id, List<UUID> destinationIds) {}

    public record RouteRequest(@NotNull List<UUID> destinationIds) {}

    public record EventResponse(String eventId, List<UUID> deliveryIds) {}

    @PostMapping("/webhooks")
    public ResponseEntity<EventResponse> postWebhook(
            @Valid @RequestBody EventRequest request, HttpServletRequest httpRequest) {
        return receiveWebhook(request, httpRequest, optionalSourceId(request.sourceId()), null);
    }

    @PostMapping("/webhooks/{endpointId}")
    public ResponseEntity<EventResponse> postIngressWebhook(
            @PathVariable String endpointId, @Valid @RequestBody EventRequest request, HttpServletRequest httpRequest) {
        var endpoint = store.ingressEndpoint(endpointId);
        if (endpoint == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        if (endpoint.archivedAt() != null) throw new ResponseStatusException(HttpStatus.GONE, "Endpoint is archived");
        return receiveWebhook(request, httpRequest, endpointId, endpointId);
    }

    private ResponseEntity<EventResponse> receiveWebhook(
            EventRequest request, HttpServletRequest httpRequest, String sourceId, String ingressId) {
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
                                    new DeliveryStore.EventOrigin(sourceId, sourceUrl, connectionIp),
                                    ingressId)));
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
            List<UUID> destinationIds = request.destinationIds() == null
                    ? store.endpoints().stream().map(DeliveryStore.Endpoint::id).toList()
                    : request.destinationIds();
            return ResponseEntity.status(HttpStatus.CREATED).body(store.addIngressEndpoint(id, destinationIds));
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Incoming endpoint ID already exists", e);
        } catch (IllegalArgumentException | InvalidDataAccessApiUsageException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage(), e);
        }
    }

    @PutMapping("/ingress-endpoints/{id}/destinations")
    public DeliveryStore.IngressEndpoint updateIngressDestinations(
            @PathVariable String id,
            @Valid @RequestBody RouteRequest request,
            @RequestHeader(value = "X-Admin-Token", required = false) String token) {
        requireAdmin(token);
        try {
            var endpoint = store.updateIngressDestinations(id, request.destinationIds());
            if (endpoint == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
            return endpoint;
        } catch (IllegalArgumentException | InvalidDataAccessApiUsageException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage(), e);
        }
    }

    @PostMapping("/ingress-endpoints/{id}/archive")
    public DeliveryStore.IngressEndpoint archiveIngressEndpoint(
            @PathVariable String id, @RequestHeader(value = "X-Admin-Token", required = false) String token) {
        requireAdmin(token);
        var endpoint = store.archiveIngressEndpoint(id);
        if (endpoint == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return endpoint;
    }

    @PostMapping("/ingress-endpoints/{id}/restore")
    public DeliveryStore.IngressEndpoint restoreIngressEndpoint(
            @PathVariable String id, @RequestHeader(value = "X-Admin-Token", required = false) String token) {
        requireAdmin(token);
        var endpoint = store.restoreIngressEndpoint(id);
        if (endpoint == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return endpoint;
    }

    @DeleteMapping("/ingress-endpoints/{id}")
    public ResponseEntity<Void> deleteIngressEndpoint(
            @PathVariable String id, @RequestHeader(value = "X-Admin-Token", required = false) String token) {
        requireAdmin(token);
        if (store.ingressEndpoint(id) == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        if (!store.deleteUnusedIngressEndpoint(id))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Archive an endpoint that has received events");
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/deliveries/{id}")
    public DeliveryStore.Delivery getDelivery(@PathVariable UUID id) {
        DeliveryStore.Delivery delivery = store.delivery(id);
        if (delivery == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return delivery;
    }

    @GetMapping("/deliveries")
    public DeliveryStore.DeliveryPage listDeliveries(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size,
            @RequestParam(required = false) UUID deliveryId,
            @RequestParam(required = false) String eventId,
            @RequestParam(required = false) String destination,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Integer attemptsMin,
            @RequestParam(required = false) Integer attemptsMax,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant createdFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant createdBefore,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant updatedFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant updatedBefore,
            @RequestHeader(value = "X-Admin-Token", required = false) String token) {
        requireAdmin(token);
        if (page < 0 || size < 1 || size > 100 || page > Integer.MAX_VALUE / size)
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Use a nonnegative page and a size from 1 to 100");
        if (eventId != null && eventId.length() > 200)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "eventId exceeds 200 characters");
        if (destination != null && destination.length() > 2048)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "destination exceeds 2048 characters");
        if (status != null
                && !Set.of("PENDING", "PROCESSING", "SUCCEEDED", "FAILED").contains(status))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown delivery status");
        if ((attemptsMin != null && attemptsMin < 0)
                || (attemptsMax != null && attemptsMax < 0)
                || (attemptsMin != null && attemptsMax != null && attemptsMin > attemptsMax))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid attempts range");
        if ((createdFrom != null && createdBefore != null && !createdFrom.isBefore(createdBefore))
                || (updatedFrom != null && updatedBefore != null && !updatedFrom.isBefore(updatedBefore)))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Time range must end after it starts");
        var filters = new DeliveryStore.DeliveryFilters(
                deliveryId,
                eventId,
                destination,
                status,
                attemptsMin,
                attemptsMax,
                createdFrom,
                createdBefore,
                updatedFrom,
                updatedBefore);
        return store.listDeliveries(filters, page, size);
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
            @RequestParam(defaultValue = "false") boolean includeArchived,
            @RequestHeader(value = "X-Admin-Token", required = false) String token) {
        requireAdmin(token);
        return includeArchived ? store.allEndpoints() : store.endpoints();
    }

    @PostMapping("/endpoints")
    public ResponseEntity<DeliveryStore.Endpoint> addEndpoint(
            @Valid @RequestBody EndpointRequest request,
            @RequestHeader(value = "X-Admin-Token", required = false) String token) {
        requireAdmin(token);
        try {
            return ResponseEntity.status(HttpStatus.CREATED).body(store.addEndpoint(validatedTargetUrl(request.url())));
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Endpoint already exists", e);
        }
    }

    @DeleteMapping("/endpoints/{id}")
    public ResponseEntity<Void> archiveEndpoint(
            @PathVariable UUID id, @RequestHeader(value = "X-Admin-Token", required = false) String token) {
        requireAdmin(token);
        try {
            if (store.archiveEndpoint(id) == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
            return ResponseEntity.noContent().build();
        } catch (DeliveryStore.DestinationConflictException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, e.getMessage(), e);
        }
    }

    @PostMapping("/endpoints/{id}/restore")
    public DeliveryStore.Endpoint restoreEndpoint(
            @PathVariable UUID id, @RequestHeader(value = "X-Admin-Token", required = false) String token) {
        requireAdmin(token);
        var endpoint = store.restoreEndpoint(id);
        if (endpoint == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return endpoint;
    }

    @PutMapping("/endpoints/{id}")
    public DeliveryStore.Endpoint updateEndpoint(
            @PathVariable UUID id,
            @Valid @RequestBody EndpointRequest request,
            @RequestHeader(value = "X-Admin-Token", required = false) String token) {
        requireAdmin(token);
        try {
            var endpoint = store.updateEndpoint(id, validatedTargetUrl(request.url()));
            if (endpoint == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
            return endpoint;
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Endpoint already exists", e);
        } catch (DeliveryStore.DestinationConflictException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, e.getMessage(), e);
        }
    }

    private String validatedTargetUrl(String url) {
        URI uri;
        try {
            uri = URI.create(url);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid URL");
        }
        if (uri.getHost() == null
                || uri.getUserInfo() != null
                || uri.getFragment() != null
                || !("https".equals(uri.getScheme()) || (allowHttp && "http".equals(uri.getScheme())))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Target must be an absolute HTTPS URL");
        }
        return uri.toString();
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
