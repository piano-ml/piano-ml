package org.pianoml.backend.coach.tools;

import org.pianoml.backend.coach.CoachArgs;
import org.pianoml.backend.coach.CoachToolException;
import org.pianoml.backend.coach.CoachToolHandler;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.*;
import org.pianoml.backend.security.GrantPrincipal;
import org.springframework.stereotype.Component;

import java.util.*;

/** Tool 19, list_keys: the keys of the library, in the spelling the key arguments accept. */
@Component
public class ListKeysTool implements CoachToolHandler {

  private final LibraryData library;

  public ListKeysTool(LibraryData library) {
    this.library = library;
  }

  @Override
  public String name() {
    return "list_keys";
  }

  @Override
  public Object execute(GrantPrincipal principal, Map<String, Object> arguments) {
    return Map.of("keys", library.keys().stream().filter(Objects::nonNull).toList());
  }
}
