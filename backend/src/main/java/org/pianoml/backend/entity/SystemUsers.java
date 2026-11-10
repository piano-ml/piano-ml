package org.pianoml.backend.entity;

import java.util.UUID;

/** Well-known system accounts created by Liquibase (changelog 021). They cannot log in. */
public final class SystemUsers {

  /** Owner of the scores of deleted accounts. */
  public static final UUID JUNK_ID = UUID.fromString("00000000-0000-4000-8000-000000000001");

  private SystemUsers() {
  }
}
