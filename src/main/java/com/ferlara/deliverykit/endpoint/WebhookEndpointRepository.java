package com.ferlara.deliverykit.endpoint;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WebhookEndpointRepository extends JpaRepository<WebhookEndpointEntity, UUID> {
    List<WebhookEndpointEntity> findAllByOrderByCreatedAtAsc();
}
