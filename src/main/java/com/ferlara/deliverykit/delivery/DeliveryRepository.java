package com.ferlara.deliverykit.delivery;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface DeliveryRepository extends JpaRepository<DeliveryEntity, UUID> {
    List<DeliveryEntity> findByEventIdOrderByIdAsc(String eventId);

    // Native SQL keeps the claim atomic. Parameters are bound by Hibernate, not concatenated.
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
            UPDATE deliveries SET status = 'PROCESSING', attempts = attempts + 1,
              lease_until = :leaseUntil, updated_at = CURRENT_TIMESTAMP
            WHERE id = :id AND (status IN ('PENDING', 'FAILED')
              OR (status = 'PROCESSING' AND lease_until < CURRENT_TIMESTAMP))
            """, nativeQuery = true)
    int claim(@Param("id") UUID id, @Param("leaseUntil") Instant leaseUntil);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = "UPDATE deliveries SET status = 'SUCCEEDED', lease_until = NULL, last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = :id", nativeQuery = true)
    int markSucceeded(@Param("id") UUID id);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = "UPDATE deliveries SET status = 'FAILED', lease_until = NULL, last_error = :error, updated_at = CURRENT_TIMESTAMP WHERE id = :id", nativeQuery = true)
    int markFailed(@Param("id") UUID id, @Param("error") String error);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = "UPDATE deliveries SET status = 'PENDING', last_error = NULL, lease_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = :id AND status = 'FAILED'", nativeQuery = true)
    int resetFailed(@Param("id") UUID id);
}
