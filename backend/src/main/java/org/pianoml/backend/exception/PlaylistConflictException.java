package org.pianoml.backend.exception;

/** 409: the request conflicts with the playlist's state (stale reorder list, deleting Favorites). */
public class PlaylistConflictException extends RuntimeException {
  public PlaylistConflictException(String message) {
    super(message);
  }
}
