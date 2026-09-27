package com.ferlara.deliverykit.queue;

import com.ferlara.deliverykit.delivery.DeliveryStore;
import jakarta.annotation.PreDestroy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Configuration
class WorkerConfiguration {
    @Bean
    HttpClient httpClient() {
        return HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }
}

@Component
public class Worker {
    private static final Logger log = LoggerFactory.getLogger(Worker.class);
    private final DeliveryStore store;
    private final HttpClient http;
    private final boolean enabled;
    private final ExecutorService executor;

    public Worker(
            DeliveryStore store,
            HttpClient http,
            @Value("${app.worker-enabled}") boolean enabled,
            @Value("${app.worker-concurrency:4}") int concurrency) {
        this.store = store;
        this.http = http;
        this.enabled = enabled;
        if (concurrency < 1 || concurrency > 32) throw new IllegalArgumentException("WORKER_CONCURRENCY must be 1-32");
        this.executor =
                Executors.newFixedThreadPool(concurrency, Thread.ofVirtual().factory());
    }

    @Scheduled(fixedDelayString = "${app.worker-poll-interval-ms:1000}")
    public void poll() {
        if (!enabled) return;
        var tasks = store.readyQueueItems().stream()
                .map(item -> CompletableFuture.runAsync(() -> process(item), executor))
                .toArray(CompletableFuture[]::new);
        CompletableFuture.allOf(tasks).join();
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdown();
    }

    private void process(DeliveryStore.QueueItem item) {
        if (!store.claimQueueItem(item.id())) return;
        try {
            if (deliver(item.deliveryId())) {
                store.completeQueueItem(item.id());
            } else {
                var delivery = store.delivery(item.deliveryId());
                store.deferQueueItem(item.id(), delivery == null ? 1 : delivery.attempts());
            }
        } catch (RuntimeException e) {
            store.deferQueueItem(item.id(), 1);
            log.warn("Delivery processing failed for {}: {}", item.deliveryId(), e.toString());
        }
    }

    // A database lease prevents another worker from sending the same delivery concurrently.
    public boolean deliver(UUID id) {
        var current = store.delivery(id);
        if (current == null || current.status().equals("SUCCEEDED")) return true;
        if (!store.claimDelivery(id)) return false;
        var delivery = store.delivery(id);
        try {
            var request = HttpRequest.newBuilder(URI.create(delivery.targetUrl()))
                    .timeout(Duration.ofSeconds(8))
                    .header("Content-Type", "application/json")
                    .header("X-Webhook-Event-Id", delivery.eventId())
                    .header("Idempotency-Key", delivery.id().toString())
                    .POST(HttpRequest.BodyPublishers.ofString(delivery.payload()))
                    .build();
            int status =
                    http.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
            if (status < 200 || status >= 300) throw new IllegalStateException("Recipient returned HTTP " + status);
            store.succeeded(id);
            log.info("Delivery {} succeeded", id);
            return true;
        } catch (Exception e) {
            String error = e.toString();
            store.failed(id, error.length() > 1000 ? error.substring(0, 1000) : error);
            log.warn("Delivery {} failed: {}", id, error);
            return false;
        }
    }
}
