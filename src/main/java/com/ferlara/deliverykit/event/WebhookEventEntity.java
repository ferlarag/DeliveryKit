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

    public WebhookEventEntity(String eventId, String payload) {
        this.eventId = eventId;
        this.payload = payload;
    }
}
