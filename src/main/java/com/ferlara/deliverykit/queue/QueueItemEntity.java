package com.ferlara.deliverykit.queue;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "queue")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QueueItemEntity {
    @Id
    private UUID id;

    @Column(name = "delivery_id", nullable = false)
    private UUID deliveryId;

    @Column(name = "sent_at")
    private Instant sentAt;

    @Column(name = "claimed_until")
    private Instant claimedUntil;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;

    public QueueItemEntity(UUID id, UUID deliveryId) {
        this.id = id;
        this.deliveryId = deliveryId;
    }
}
