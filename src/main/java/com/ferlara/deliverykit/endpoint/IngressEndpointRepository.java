package com.ferlara.deliverykit.endpoint;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface IngressEndpointRepository extends JpaRepository<IngressEndpointEntity, String> {
    List<IngressEndpointEntity> findAllByOrderByCreatedAtAscIdAsc();
}
