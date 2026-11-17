package org.pianoml.backend.controller;

import org.pianoml.backend.api.OauthApi;
import org.pianoml.backend.coach.oauth.CoachOAuthAuthorizationService;
import org.pianoml.backend.coach.oauth.CoachOAuthSettings;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.CoachGrantScope;
import org.pianoml.backend.model.OAuthDecision;
import org.pianoml.backend.model.OAuthDecisionResult;
import org.pianoml.backend.model.OAuthRequestView;
import org.pianoml.backend.service.AccountService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The consent API of the coach OAuth server (issue #414, docs/coach-oauth-design.md 2.3): what the SPA consent page
 * shows, and the user's decision. Main chain: cookie session, CSRF on the decision. 404 while OAuth is off.
 */
@RestController
public class OAuthConsentController implements OauthApi {

  private final CoachOAuthAuthorizationService authorization;
  private final CoachOAuthSettings settings;
  private final AccountService accountService;

  public OAuthConsentController(CoachOAuthAuthorizationService authorization, CoachOAuthSettings settings,
                                AccountService accountService) {
    this.authorization = authorization;
    this.settings = settings;
    this.accountService = accountService;
  }

  @Override
  public ResponseEntity<OAuthRequestView> oauthRequestsIdGet(String id) {
    if (!settings.enabled()) {
      return ResponseEntity.notFound().build();
    }
    return authorization.view(id, currentUser().getId())
      .map(v -> ResponseEntity.ok().cacheControl(CacheControl.noStore()).<OAuthRequestView>body(new OAuthRequestView()
        .clientName(v.clientName())
        .clientHost(v.clientHost())
        .redirectHost(v.redirectHost())
        .loopbackOnly(v.loopbackOnly())
        .scopes(v.scopes().stream().map(CoachGrantScope::fromValue).toList())
        .expiresAt(v.expiresAt())))
      .orElseGet(() -> ResponseEntity.notFound().build());
  }

  @Override
  public ResponseEntity<OAuthDecisionResult> oauthRequestsIdDecisionPost(String id, OAuthDecision decision) {
    if (!settings.enabled()) {
      return ResponseEntity.notFound().build();
    }
    // The generated model turns an absent list into an empty one: both mean "every requested scope"
    List<String> scopes = decision.getScopes() == null || decision.getScopes().isEmpty()
      ? null : decision.getScopes().stream().map(CoachGrantScope::getValue).toList();
    try {
      return authorization.decide(id, currentUser().getId(), Boolean.TRUE.equals(decision.getApprove()), scopes)
        .map(url -> ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new OAuthDecisionResult().redirectUrl(url)))
        .orElseGet(() -> ResponseEntity.notFound().build());
    } catch (IllegalArgumentException e) {
      return ResponseEntity.badRequest().build();
    }
  }

  private User currentUser() {
    return accountService.getUserFromAuthentication(SecurityContextHolder.getContext().getAuthentication());
  }
}
