package org.pianoml.backend.controller;

import org.pianoml.backend.api.CoachApi;
import org.pianoml.backend.coach.CoachPromptCatalog;
import org.pianoml.backend.coach.bridge.BridgeTicketService;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.CoachBridgeTicket;
import org.pianoml.backend.service.AccountService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.pianoml.backend.model.CoachPrompt;
import org.pianoml.backend.model.CoachPromptArgument;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.List;

/** The coach routes of the REST API (issue #414): the public prompt catalog and the Remote coach tickets. */
@RestController
public class CoachController implements CoachApi {

  private final CoachPromptCatalog catalog;
  private final BridgeTicketService tickets;
  private final AccountService accountService;

  public CoachController(CoachPromptCatalog catalog, BridgeTicketService tickets, AccountService accountService) {
    this.catalog = catalog;
    this.tickets = tickets;
    this.accountService = accountService;
  }

  /** A one-time ticket for the Remote coach WebSocket; the cookie session and CSRF header are required. */
  @Override
  public ResponseEntity<CoachBridgeTicket> coachBridgeTicketPost() {
    User user = accountService.getUserFromAuthentication(SecurityContextHolder.getContext().getAuthentication());
    return tickets.issue(user.getId())
      .map(t -> ResponseEntity.ok(new CoachBridgeTicket().ticket(t.value()).expiresInSeconds(t.expiresInSeconds())))
      .orElseGet(() -> ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).build());
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
