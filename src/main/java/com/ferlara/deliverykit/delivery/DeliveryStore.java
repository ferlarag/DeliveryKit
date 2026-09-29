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
import java.time.Instant;
import java.util.List;
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

    public record Endpoint(UUID id, String url) {}

    public record IngressEndpoint(String id, Instant createdAt) {}

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
            String connectionIp) {}

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
        return endpoints.findAllByOrderByCreatedAtAsc().stream()
                .map(endpoint -> new Endpoint(endpoint.getId(), endpoint.getUrl()))
                .toList();
    }

    public Endpoint addEndpoint(String url) {
        var endpoint = new WebhookEndpointEntity(UUID.randomUUID(), url);
        endpoints.saveAndFlush(endpoint);
        return new Endpoint(endpoint.getId(), endpoint.getUrl());
    }

    public List<IngressEndpoint> ingressEndpoints() {
        return ingressEndpoints.findAllByOrderByCreatedAtAscIdAsc().stream()
                .map(endpoint -> new IngressEndpoint(endpoint.getId(), endpoint.getCreatedAt()))
                .toList();
    }

    public IngressEndpoint addIngressEndpoint(String id) {
        var endpoint = new IngressEndpointEntity(id);
        entityManager.persist(endpoint);
        entityManager.flush();
        entityManager.refresh(endpoint);
        return new IngressEndpoint(endpoint.getId(), endpoint.getCreatedAt());
    }

    public boolean ingressEndpointExists(String id) {
        return ingressEndpoints.existsById(id);
    }

    public String eventPayload(String eventId) {
        return events.findById(eventId).map(WebhookEventEntity::getPayload).orElse(null);
    }

    public List<UUID> createEvent(String eventId, String payload) {
        return createEvent(eventId, payload, new EventOrigin(null, null, null));
    }

    public List<UUID> createEvent(String eventId, String payload, EventOrigin origin) {
        // An assigned ID makes repository.save() merge an existing row. Persist must INSERT
        // so a duplicate event ID fails instead of replacing the original payload.
        entityManager.persist(
                new WebhookEventEntity(eventId, payload, origin.sourceId(), origin.sourceUrl(), origin.connectionIp()));
        entityManager.flush();
        List<Endpoint> targets = endpoints();
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
                            event.getConnectionIp());
                })
                .orElse(null);
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
