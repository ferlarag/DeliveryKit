package com.ferlara.deliverykit.queue;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface QueueOutboxRepository extends JpaRepository<QueueOutboxEntity, UUID> {
    @Query("SELECT o FROM QueueOutboxEntity o WHERE o.sentAt IS NULL AND (o.claimedUntil IS NULL OR o.claimedUntil < CURRENT_TIMESTAMP) ORDER BY o.createdAt")
    List<QueueOutboxEntity> findReady(Pageable page);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = "UPDATE queue_outbox SET claimed_until = :claimedUntil WHERE id = :id AND sent_at IS NULL AND (claimed_until IS NULL OR claimed_until < CURRENT_TIMESTAMP)", nativeQuery = true)
    int claim(@Param("id") UUID id, @Param("claimedUntil") Instant claimedUntil);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = "UPDATE queue_outbox SET sent_at = CURRENT_TIMESTAMP, claimed_until = NULL WHERE id = :id", nativeQuery = true)
    int markSent(@Param("id") UUID id);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = "UPDATE queue_outbox SET claimed_until = :retryAt WHERE id = :id AND sent_at IS NULL", nativeQuery = true)
    int defer(@Param("id") UUID id, @Param("retryAt") Instant retryAt);
}
