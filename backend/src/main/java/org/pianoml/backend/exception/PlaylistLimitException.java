package org.pianoml.backend.exception;

/** 422: too many playlists, or a playlist is full. */
public class PlaylistLimitException extends RuntimeException {
  public PlaylistLimitException(String message) {
    super(message);
  }
}
