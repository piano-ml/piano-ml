package org.pianoml.backend.controller;

import org.pianoml.backend.api.CoachApi;
import org.pianoml.backend.coach.CoachPromptCatalog;
import org.pianoml.backend.model.CoachPrompt;
import org.pianoml.backend.model.CoachPromptArgument;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.List;

/** The ready-made coach prompts (issue #414): public, no user data. */
@RestController
public class CoachPromptController implements CoachApi {

  private final CoachPromptCatalog catalog;

  public CoachPromptController(CoachPromptCatalog catalog) {
    this.catalog = catalog;
  }

  @Override
  public ResponseEntity<List<CoachPrompt>> coachPromptsGet() {
    List<CoachPrompt> prompts = catalog.all().stream().map(p -> new CoachPrompt()
      .id(p.id())
      .title(p.title())
      .description(p.description())
      .arguments(p.arguments().stream().map(a -> new CoachPromptArgument()
        .name(a.name())
        .description(a.description())
        .required(a.required())
        ._default(a.defaultValue())).toList())
      .text(p.text())).toList();
    return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePublic()).body(prompts);
  }
}
