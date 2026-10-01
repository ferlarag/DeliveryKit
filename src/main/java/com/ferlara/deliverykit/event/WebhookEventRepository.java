package com.ferlara.deliverykit.event;

import org.springframework.data.jpa.repository.JpaRepository;

public interface WebhookEventRepository extends JpaRepository<WebhookEventEntity, String> {
    boolean existsBySourceId(String sourceId);
}
