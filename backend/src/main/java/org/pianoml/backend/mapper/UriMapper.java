package org.pianoml.backend.mapper;

import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URISyntaxException;

@Component
public class UriMapper {

    public String asString(URI uri) {
        return uri != null ? uri.toString() : null;
    }

    public URI asUri(String uri) {
        if (uri == null) {
            return null;
        }
        try {
            return new URI(uri);
        } catch (URISyntaxException e) {
            throw new RuntimeException(e);
        }
    }
}
