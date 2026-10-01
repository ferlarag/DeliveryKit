package com.ferlara.deliverykit.endpoint;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "ingress_endpoints")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class IngressEndpointEntity {
    @Id
    @Column(length = 64)
    private String id;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "archived_at")
    private Instant archivedAt;

    public IngressEndpointEntity(String id) {
        this.id = id;
    }

    public void archive() {
        this.archivedAt = Instant.now();
    }

    public void restore() {
        this.archivedAt = null;
    }
}
