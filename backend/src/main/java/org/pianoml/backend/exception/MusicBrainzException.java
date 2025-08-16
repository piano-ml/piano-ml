package org.pianoml.backend.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(HttpStatus.BAD_REQUEST)
public class MusicBrainzException extends RuntimeException {
    public MusicBrainzException(String message) {
        super(message);
    }
}
