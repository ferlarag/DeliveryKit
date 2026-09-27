package com.ferlara.deliverykit.delivery;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "deliveries")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DeliveryEntity {
    @Id
    private UUID id;

    @Column(name = "event_id", nullable = false, length = 200)
    private String eventId;

    @Column(name = "endpoint_id", nullable = false)
    private UUID endpointId;

    @Column(name = "target_url", nullable = false, length = 2048)
    private String targetUrl;

    @Column(nullable = false, columnDefinition = "text")
    private String payload;

    @Column(nullable = false, length = 20)
    private String status;

    @Column(nullable = false)
    private int attempts;

    @Column(name = "last_error", length = 1000)
    private String lastError;

    public DeliveryEntity(UUID id, String eventId, UUID endpointId, String targetUrl, String payload) {
        this.id = id;
        this.eventId = eventId;
        this.endpointId = endpointId;
        this.targetUrl = targetUrl;
        this.payload = payload;
        this.status = "PENDING";
    }
}
