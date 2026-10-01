package com.ferlara.deliverykit.endpoint;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WebhookEndpointRepository extends JpaRepository<WebhookEndpointEntity, UUID> {
    List<WebhookEndpointEntity> findAllByOrderByCreatedAtAsc();

    List<WebhookEndpointEntity> findAllByArchivedAtIsNullOrderByCreatedAtAsc();

    @Query(value = """
            SELECT destination.* FROM webhook_endpoints AS destination
            JOIN ingress_endpoint_destinations AS route ON route.destination_id = destination.id
            WHERE route.ingress_id = :ingressId AND destination.archived_at IS NULL
            ORDER BY destination.created_at, destination.id
            """, nativeQuery = true)
    List<WebhookEndpointEntity> findByIngressId(@Param("ingressId") String ingressId);
}
