package com.ferlara.deliverykit.event;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "webhook_events")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class WebhookEventEntity {
    @Id
    @Column(name = "event_id", length = 200)
    private String eventId;

    @Column(nullable = false, columnDefinition = "text")
    private String payload;

    @Column(name = "source_id", length = 200)
    private String sourceId;

    @Column(name = "source_url", length = 2048)
    private String sourceUrl;

    @Column(name = "connection_ip", length = 64)
    private String connectionIp;

    public WebhookEventEntity(String eventId, String payload, String sourceId, String sourceUrl, String connectionIp) {
        this.eventId = eventId;
        this.payload = payload;
        this.sourceId = sourceId;
        this.sourceUrl = sourceUrl;
        this.connectionIp = connectionIp;
    }
}
