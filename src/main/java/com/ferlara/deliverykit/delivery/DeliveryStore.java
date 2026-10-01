package com.ferlara.deliverykit.delivery;

import com.ferlara.deliverykit.endpoint.IngressEndpointEntity;
import com.ferlara.deliverykit.endpoint.IngressEndpointRepository;
import com.ferlara.deliverykit.endpoint.WebhookEndpointEntity;
import com.ferlara.deliverykit.endpoint.WebhookEndpointRepository;
import com.ferlara.deliverykit.event.WebhookEventEntity;
import com.ferlara.deliverykit.event.WebhookEventRepository;
import com.ferlara.deliverykit.queue.QueueItemEntity;
import com.ferlara.deliverykit.queue.QueueItemRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
@Transactional
public class DeliveryStore {
    private final WebhookEndpointRepository endpoints;
    private final IngressEndpointRepository ingressEndpoints;
    private final WebhookEventRepository events;
    private final DeliveryRepository deliveries;
    private final DeliveryAttemptRepository attempts;
    private final QueueItemRepository queue;
    private final EntityManager entityManager;

    public DeliveryStore(
            WebhookEndpointRepository endpoints,
            IngressEndpointRepository ingressEndpoints,
            WebhookEventRepository events,
            DeliveryRepository deliveries,
            DeliveryAttemptRepository attempts,
            QueueItemRepository queue,
            EntityManager entityManager) {
        this.endpoints = endpoints;
        this.ingressEndpoints = ingressEndpoints;
        this.events = events;
        this.deliveries = deliveries;
        this.attempts = attempts;
        this.queue = queue;
        this.entityManager = entityManager;
    }

    public record Endpoint(UUID id, String url, Instant archivedAt) {}

    public static class DestinationConflictException extends RuntimeException {
        public DestinationConflictException(String message) {
            super(message);
        }
    }

    public record IngressEndpoint(String id, Instant createdAt, Instant archivedAt, List<UUID> destinationIds) {}

    public record Delivery(
            UUID id,
            String eventId,
            String targetUrl,
            String payload,
            String status,
            int attempts,
            String lastError,
            String sourceId,
            String sourceUrl,
            String connectionIp,
            Instant createdAt,
            Instant updatedAt) {}

    public record DeliverySummary(
            UUID id,
            String eventId,
            String targetUrl,
            String status,
            int attempts,
            Instant createdAt,
            Instant updatedAt) {}

    public record DeliveryPage(List<DeliverySummary> items, long total, int page, int size) {}

    public record DeliveryFilters(
            UUID deliveryId,
            String eventId,
            String destination,
            String status,
            Integer attemptsMin,
            Integer attemptsMax,
            Instant createdFrom,
            Instant createdBefore,
            Instant updatedFrom,
            Instant updatedBefore) {}

    public record EventOrigin(String sourceId, String sourceUrl, String connectionIp) {}

    public record QueueItem(UUID id, UUID deliveryId, boolean manualRetry) {}

    public record Attempt(
            UUID id,
            int number,
            String initiatedBy,
            String status,
            Instant startedAt,
            Instant completedAt,
            Integer httpStatus,
            String error) {}

    public List<Endpoint> endpoints() {
        return endpoints.findAllByArchivedAtIsNullOrderByCreatedAtAsc().stream()
                .map(this::toEndpoint)
                .toList();
    }

    public List<Endpoint> allEndpoints() {
        return endpoints.findAllByOrderByCreatedAtAsc().stream()
                .map(this::toEndpoint)
                .toList();
    }

    public Endpoint addEndpoint(String url) {
        var endpoint = new WebhookEndpointEntity(UUID.randomUUID(), url);
        endpoints.saveAndFlush(endpoint);
        return toEndpoint(endpoint);
    }

    public Endpoint updateEndpoint(UUID id, String url) {
        var endpoint = endpoints.findById(id).orElse(null);
        if (endpoint == null) return null;
        if (endpoint.getArchivedAt() != null)
            throw new DestinationConflictException("Restore the destination before editing it");
        endpoint.updateUrl(url);
        endpoints.saveAndFlush(endpoint);
        return toEndpoint(endpoint);
    }

    public Endpoint archiveEndpoint(UUID id) {
        var endpoint = endpoints.findById(id).orElse(null);
        if (endpoint == null) return null;
        if (endpoint.getArchivedAt() != null) return toEndpoint(endpoint);
        Number assigned = (Number) entityManager
                .createNativeQuery("SELECT COUNT(*) FROM ingress_endpoint_destinations WHERE destination_id = :id")
                .setParameter("id", id)
                .getSingleResult();
        if (assigned.longValue() > 0)
            throw new DestinationConflictException("Remove this destination from incoming endpoint settings first");
        endpoint.archive();
        endpoints.saveAndFlush(endpoint);
        return toEndpoint(endpoint);
    }

    public Endpoint restoreEndpoint(UUID id) {
        var endpoint = endpoints.findById(id).orElse(null);
        if (endpoint == null) return null;
        if (endpoint.getArchivedAt() == null) return toEndpoint(endpoint);
        endpoint.restore();
        endpoints.saveAndFlush(endpoint);
        return toEndpoint(endpoint);
    }

    private Endpoint toEndpoint(WebhookEndpointEntity endpoint) {
        return new Endpoint(endpoint.getId(), endpoint.getUrl(), endpoint.getArchivedAt());
    }

    public List<IngressEndpoint> ingressEndpoints() {
        return ingressEndpoints.findAllByOrderByCreatedAtAscIdAsc().stream()
                .map(this::toIngressEndpoint)
                .toList();
    }

    public IngressEndpoint ingressEndpoint(String id) {
        return ingressEndpoints.findById(id).map(this::toIngressEndpoint).orElse(null);
    }

    public boolean ingressEndpointExists(String id) {
        return ingressEndpoints.existsById(id);
    }

    public IngressEndpoint addIngressEndpoint(String id, List<UUID> destinationIds) {
        List<UUID> selected = validDestinationIds(destinationIds);
        var endpoint = new IngressEndpointEntity(id);
        entityManager.persist(endpoint);
        entityManager.flush();
        replaceRoutes(id, selected);
        entityManager.refresh(endpoint);
        return toIngressEndpoint(endpoint);
    }

    public IngressEndpoint updateIngressDestinations(String id, List<UUID> destinationIds) {
        if (!ingressEndpoints.existsById(id)) return null;
        replaceRoutes(id, validDestinationIds(destinationIds));
        return ingressEndpoint(id);
    }

    public IngressEndpoint archiveIngressEndpoint(String id) {
        var endpoint = ingressEndpoints.findById(id).orElse(null);
        if (endpoint == null) return null;
        if (endpoint.getArchivedAt() == null) endpoint.archive();
        ingressEndpoints.saveAndFlush(endpoint);
        return toIngressEndpoint(endpoint);
    }

    public IngressEndpoint restoreIngressEndpoint(String id) {
        var endpoint = ingressEndpoints.findById(id).orElse(null);
        if (endpoint == null) return null;
        endpoint.restore();
        ingressEndpoints.saveAndFlush(endpoint);
        return toIngressEndpoint(endpoint);
    }

    public boolean deleteUnusedIngressEndpoint(String id) {
        if (events.existsBySourceId(id)) return false;
        ingressEndpoints.deleteById(id);
        return true;
    }

    private IngressEndpoint toIngressEndpoint(IngressEndpointEntity endpoint) {
        List<UUID> destinationIds = endpoints.findByIngressId(endpoint.getId()).stream()
                .map(WebhookEndpointEntity::getId)
                .toList();
        return new IngressEndpoint(endpoint.getId(), endpoint.getCreatedAt(), endpoint.getArchivedAt(), destinationIds);
    }

    private List<UUID> validDestinationIds(List<UUID> destinationIds) {
        List<UUID> unique = destinationIds.stream().distinct().toList();
        if (unique.isEmpty()) throw new IllegalArgumentException("Select at least one destination");
        if (endpoints.findAllById(unique).stream()
                        .filter(endpoint -> endpoint.getArchivedAt() == null)
                        .count()
                != unique.size()) throw new IllegalArgumentException("Unknown destination ID");
        return unique;
    }

    private void replaceRoutes(String ingressId, List<UUID> destinationIds) {
        entityManager
                .createNativeQuery("DELETE FROM ingress_endpoint_destinations WHERE ingress_id = :id")
                .setParameter("id", ingressId)
                .executeUpdate();
        for (UUID destinationId : destinationIds) {
            entityManager
                    .createNativeQuery(
                            "INSERT INTO ingress_endpoint_destinations (ingress_id, destination_id) VALUES (:ingressId, :destinationId)")
                    .setParameter("ingressId", ingressId)
                    .setParameter("destinationId", destinationId)
                    .executeUpdate();
        }
    }

    public String eventPayload(String eventId) {
        return events.findById(eventId).map(WebhookEventEntity::getPayload).orElse(null);
    }

    public List<UUID> createEvent(String eventId, String payload) {
        return createEvent(eventId, payload, new EventOrigin(null, null, null));
    }

    public List<UUID> createEvent(String eventId, String payload, EventOrigin origin) {
        return createEvent(eventId, payload, origin, null);
    }

    public List<UUID> createEvent(String eventId, String payload, EventOrigin origin, String ingressId) {
        // An assigned ID makes repository.save() merge an existing row. Persist must INSERT
        // so a duplicate event ID fails instead of replacing the original payload.
        entityManager.persist(
                new WebhookEventEntity(eventId, payload, origin.sourceId(), origin.sourceUrl(), origin.connectionIp()));
        entityManager.flush();
        List<Endpoint> targets = (ingressId == null
                        ? endpoints.findAllByArchivedAtIsNullOrderByCreatedAtAsc()
                        : endpoints.findByIngressId(ingressId))
                .stream().map(this::toEndpoint).toList();
        return targets.stream()
                .map(target -> {
                    UUID id = UUID.randomUUID();
                    deliveries.save(new DeliveryEntity(id, eventId, target.id(), target.url(), payload));
                    enqueue(id, false);
                    return id;
                })
                .toList();
    }

    public List<UUID> eventDeliveries(String eventId) {
        return deliveries.findByEventIdOrderByIdAsc(eventId).stream()
                .map(DeliveryEntity::getId)
                .toList();
    }

    public Delivery delivery(UUID id) {
        return deliveries
                .findById(id)
                .map(delivery -> {
                    var event = events.findById(delivery.getEventId()).orElseThrow();
                    return new Delivery(
                            delivery.getId(),
                            delivery.getEventId(),
                            delivery.getTargetUrl(),
                            delivery.getPayload(),
                            delivery.getStatus(),
                            delivery.getAttempts(),
                            delivery.getLastError(),
                            event.getSourceId(),
                            event.getSourceUrl(),
                            event.getConnectionIp(),
                            delivery.getCreatedAt(),
                            delivery.getUpdatedAt());
                })
                .orElse(null);
    }

    @Transactional(readOnly = true)
    public DeliveryPage listDeliveries(DeliveryFilters filters, int page, int size) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        var query = cb.createTupleQuery();
        Root<DeliveryEntity> root = query.from(DeliveryEntity.class);
        query.multiselect(
                        root.get("id").alias("id"),
                        root.get("eventId").alias("eventId"),
                        root.get("targetUrl").alias("targetUrl"),
                        root.get("status").alias("status"),
                        root.get("attempts").alias("attempts"),
                        root.get("createdAt").alias("createdAt"),
                        root.get("updatedAt").alias("updatedAt"))
                .where(deliveryPredicates(cb, root, filters))
                .orderBy(cb.desc(root.get("createdAt")), cb.desc(root.get("id")));
        List<DeliverySummary> items =
                entityManager
                        .createQuery(query)
                        .setFirstResult(page * size)
                        .setMaxResults(size)
                        .getResultList()
                        .stream()
                        .map(row -> new DeliverySummary(
                                row.get("id", UUID.class),
                                row.get("eventId", String.class),
                                row.get("targetUrl", String.class),
                                row.get("status", String.class),
                                row.get("attempts", Integer.class),
                                row.get("createdAt", Instant.class),
                                row.get("updatedAt", Instant.class)))
                        .toList();

        var countQuery = cb.createQuery(Long.class);
        Root<DeliveryEntity> countRoot = countQuery.from(DeliveryEntity.class);
        countQuery.select(cb.count(countRoot)).where(deliveryPredicates(cb, countRoot, filters));
        long total = entityManager.createQuery(countQuery).getSingleResult();
        return new DeliveryPage(items, total, page, size);
    }

    private Predicate[] deliveryPredicates(CriteriaBuilder cb, Root<DeliveryEntity> root, DeliveryFilters filters) {
        List<Predicate> predicates = new ArrayList<>();
        if (filters.deliveryId() != null) predicates.add(cb.equal(root.get("id"), filters.deliveryId()));
        if (filters.eventId() != null && !filters.eventId().isBlank())
            predicates.add(cb.like(cb.lower(root.get("eventId")), containsPattern(filters.eventId()), '\\'));
        if (filters.destination() != null && !filters.destination().isBlank()) {
            UUID destinationId = null;
            try {
                destinationId = UUID.fromString(filters.destination().trim());
            } catch (IllegalArgumentException ignored) {
                // Other values search the URL recorded on the delivery.
            }
            predicates.add(
                    destinationId != null
                            ? cb.equal(root.get("endpointId"), destinationId)
                            : cb.like(cb.lower(root.get("targetUrl")), containsPattern(filters.destination()), '\\'));
        }
        if (filters.status() != null) predicates.add(cb.equal(root.get("status"), filters.status()));
        if (filters.attemptsMin() != null)
            predicates.add(cb.greaterThanOrEqualTo(root.get("attempts"), filters.attemptsMin()));
        if (filters.attemptsMax() != null)
            predicates.add(cb.lessThanOrEqualTo(root.get("attempts"), filters.attemptsMax()));
        if (filters.createdFrom() != null)
            predicates.add(cb.greaterThanOrEqualTo(root.get("createdAt"), filters.createdFrom()));
        if (filters.createdBefore() != null)
            predicates.add(cb.lessThan(root.get("createdAt"), filters.createdBefore()));
        if (filters.updatedFrom() != null)
            predicates.add(cb.greaterThanOrEqualTo(root.get("updatedAt"), filters.updatedFrom()));
        if (filters.updatedBefore() != null)
            predicates.add(cb.lessThan(root.get("updatedAt"), filters.updatedBefore()));
        return predicates.toArray(Predicate[]::new);
    }

    private String containsPattern(String value) {
        return "%"
                + value.trim()
                        .toLowerCase(Locale.ROOT)
                        .replace("\\", "\\\\")
                        .replace("%", "\\%")
                        .replace("_", "\\_") + "%";
    }

    public List<Attempt> attemptHistory(UUID deliveryId) {
        return attempts.findByDeliveryIdOrderByAttemptNumberDesc(deliveryId).stream()
                .map(attempt -> new Attempt(
                        attempt.getId(),
                        attempt.getAttemptNumber(),
                        attempt.getInitiatedBy(),
                        attempt.getStatus(),
                        attempt.getStartedAt(),
                        attempt.getCompletedAt(),
                        attempt.getHttpStatus(),
                        attempt.getError()))
                .toList();
    }

    public UUID claimDelivery(UUID id, boolean manualRetry) {
        if (deliveries.claim(id, Instant.now().plusSeconds(90)) != 1) return null;
        int number = deliveries.findById(id).orElseThrow().getAttempts();
        UUID attemptId = UUID.randomUUID();
        attempts.saveAndFlush(new DeliveryAttemptEntity(attemptId, id, number, manualRetry ? "MANUAL" : "AUTOMATIC"));
        return attemptId;
    }

    public void succeeded(UUID id, UUID attemptId, int httpStatus) {
        deliveries.markSucceeded(id);
        attempts.markSucceeded(attemptId, httpStatus);
    }

    public void failed(UUID id, UUID attemptId, String error, Integer httpStatus) {
        deliveries.markFailed(id, error);
        attempts.markFailed(attemptId, httpStatus, error);
    }

    public boolean retry(UUID id) {
        boolean updated = deliveries.resetFailed(id) == 1;
        if (updated) enqueue(id, true);
        return updated;
    }

    private void enqueue(UUID deliveryId, boolean manualRetry) {
        queue.save(new QueueItemEntity(UUID.randomUUID(), deliveryId, manualRetry));
    }

    public List<QueueItem> readyQueueItems() {
        return queue.findReady(PageRequest.of(0, 20)).stream()
                .map(item -> new QueueItem(item.getId(), item.getDeliveryId(), item.isManualRetry()))
                .toList();
    }

    public boolean claimQueueItem(UUID id) {
        return queue.claim(id, Instant.now().plusSeconds(30)) == 1;
    }

    public void completeQueueItem(UUID id) {
        queue.markSent(id);
    }

    public void deferQueueItem(UUID id, int attempts) {
        long seconds = Math.min(3600, 5L << Math.min(Math.max(attempts - 1, 0), 10));
        queue.defer(id, Instant.now().plusSeconds(seconds));
    }

    public void checkHealth() {
        entityManager.createNativeQuery("SELECT 1").getSingleResult();
    }
}
