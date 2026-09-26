package com.ferlara.deliverykit.endpoint;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface WebhookEndpointRepository extends JpaRepository<WebhookEndpointEntity, UUID> {
    List<WebhookEndpointEntity> findAllByOrderByCreatedAtAsc();
}
