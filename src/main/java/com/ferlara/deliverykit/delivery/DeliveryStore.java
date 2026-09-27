package com.ferlara.deliverykit.delivery;

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
    private final WebhookEventRepository events;
    private final DeliveryRepository deliveries;
    private final QueueItemRepository queue;
    private final EntityManager entityManager;

    public DeliveryStore(
            WebhookEndpointRepository endpoints,
            WebhookEventRepository events,
            DeliveryRepository deliveries,
            QueueItemRepository queue,
            EntityManager entityManager) {
        this.endpoints = endpoints;
        this.events = events;
        this.deliveries = deliveries;
        this.queue = queue;
        this.entityManager = entityManager;
    }

    public record Endpoint(UUID id, String url) {}

    public record Delivery(
            UUID id, String eventId, String targetUrl, String payload, String status, int attempts, String lastError) {}

    public record QueueItem(UUID id, UUID deliveryId) {}

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

    public String eventPayload(String eventId) {
        return events.findById(eventId).map(WebhookEventEntity::getPayload).orElse(null);
    }

    public List<UUID> createEvent(String eventId, String payload) {
        // An assigned ID makes repository.save() merge an existing row. Persist must INSERT
        // so a duplicate event ID fails instead of replacing the original payload.
        entityManager.persist(new WebhookEventEntity(eventId, payload));
        entityManager.flush();
        List<Endpoint> targets = endpoints();
        return targets.stream()
                .map(target -> {
                    UUID id = UUID.randomUUID();
                    deliveries.save(new DeliveryEntity(id, eventId, target.id(), target.url(), payload));
                    enqueue(id);
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
                .map(delivery -> new Delivery(
                        delivery.getId(),
                        delivery.getEventId(),
                        delivery.getTargetUrl(),
                        delivery.getPayload(),
                        delivery.getStatus(),
                        delivery.getAttempts(),
                        delivery.getLastError()))
                .orElse(null);
    }

    public boolean claimDelivery(UUID id) {
        return deliveries.claim(id, Instant.now().plusSeconds(90)) == 1;
    }

    public void succeeded(UUID id) {
        deliveries.markSucceeded(id);
    }

    public void failed(UUID id, String error) {
        deliveries.markFailed(id, error);
    }

    public boolean retry(UUID id) {
        boolean updated = deliveries.resetFailed(id) == 1;
        if (updated) enqueue(id);
        return updated;
    }

    private void enqueue(UUID deliveryId) {
        queue.save(new QueueItemEntity(UUID.randomUUID(), deliveryId));
    }

    public List<QueueItem> readyQueueItems() {
        return queue.findReady(PageRequest.of(0, 20)).stream()
                .map(item -> new QueueItem(item.getId(), item.getDeliveryId()))
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
