package com.ferlara.deliverykit.delivery;

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
@Table(name = "delivery_attempts")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DeliveryAttemptEntity {
    @Id
    private UUID id;

    @Column(name = "delivery_id", nullable = false)
    private UUID deliveryId;

    @Column(name = "attempt_number", nullable = false)
    private int attemptNumber;

    @Column(name = "initiated_by", nullable = false)
    private String initiatedBy;

    @Column(nullable = false)
    private String status;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "http_status")
    private Integer httpStatus;

    private String error;

    public DeliveryAttemptEntity(UUID id, UUID deliveryId, int attemptNumber, String initiatedBy) {
        this.id = id;
        this.deliveryId = deliveryId;
        this.attemptNumber = attemptNumber;
        this.initiatedBy = initiatedBy;
        this.status = "PROCESSING";
        this.startedAt = Instant.now();
    }
}
