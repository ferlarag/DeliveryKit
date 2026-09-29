package com.ferlara.deliverykit.delivery;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DeliveryAttemptRepository extends JpaRepository<DeliveryAttemptEntity, UUID> {
    List<DeliveryAttemptEntity> findByDeliveryIdOrderByAttemptNumberDesc(UUID deliveryId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(
            value =
                    "UPDATE delivery_attempts SET status = 'SUCCEEDED', completed_at = CURRENT_TIMESTAMP, http_status = :httpStatus WHERE id = :id AND status = 'PROCESSING'",
            nativeQuery = true)
    int markSucceeded(@Param("id") UUID id, @Param("httpStatus") int httpStatus);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(
            value =
                    "UPDATE delivery_attempts SET status = 'FAILED', completed_at = CURRENT_TIMESTAMP, http_status = :httpStatus, error = :error WHERE id = :id AND status = 'PROCESSING'",
            nativeQuery = true)
    int markFailed(@Param("id") UUID id, @Param("httpStatus") Integer httpStatus, @Param("error") String error);
}
