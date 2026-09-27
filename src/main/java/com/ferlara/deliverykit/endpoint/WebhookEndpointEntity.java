package com.ferlara.deliverykit.endpoint;

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
@Table(name = "webhook_endpoints")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class WebhookEndpointEntity {
    @Id
    private UUID id;

    @Column(nullable = false, length = 2048)
    private String url;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;

    public WebhookEndpointEntity(UUID id, String url) {
        this.id = id;
        this.url = url;
    }
}
