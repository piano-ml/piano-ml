# Coach: OAuth 2.1 for hosted chat applications (design)

Phase 10 of `docs/coach-external-harness.md` (issue #414). Design only: no code in this phase. The implementation plan is in section 8.

**Goal.** A user adds `https://api.pianoml.org/mcp` to a hosted chat application (the Claude apps first), is sent to PianoML to log in and approve, and the application gets an access token. The result of the flow is a `coach_grant` row of kind `oauth`: everything after authentication (the `/mcp` chain, `GrantPrincipal`, scopes, dispatcher, audit, limits) stays as it is. Personal access tokens (`pml_…`) keep working beside it.

**Rule.** Follow the MCP authorization specification; special-case no host. Where a host is stricter than the specification, meet the stricter rule if it stays within the specification.

Sources (read 2026-11-17):

- MCP authorization, revision 2025-11-25: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- Claude, Authentication for connectors: https://claude.com/docs/connectors/building/authentication
- OpenAI Apps SDK, authentication: https://developers.openai.com/apps-sdk/build/auth
- Spring Security 7.0 authorization server: https://docs.spring.io/spring-security/reference/7.0/servlet/oauth2/authorization-server/index.html, protocol-endpoints.html, core-model-components.html

---

## 1. What the two hosts require

The second host is ChatGPT (apps and connectors): another vendor, OAuth-capable for remote MCP servers.

| Topic | MCP spec 2025-11-25 | Claude apps (claude.ai, Desktop, mobile; Claude Code) | ChatGPT |
|---|---|---|---|
| Discovery start | 401 with `WWW-Authenticate: Bearer resource_metadata=…`, or well-known probing | A **401 is required**; probing `/.well-known/oauth-protected-resource/<path>` then root is a fallback | 401 header or `/.well-known/oauth-protected-resource` |
| Protected resource metadata | MUST, with `authorization_servers` | `resource` must equal the URL the user enters, path included; only the **first** authorization server is used | `resource` is the canonical HTTPS identifier |
| AS metadata | RFC 8414 or OIDC discovery | Same; must be reachable from Anthropic's egress range `160.79.104.0/21` | Same; `issuer` must match `authorization_servers` |
| Client identification | CIMD SHOULD, DCR MAY, pre-registration | CIMD only if metadata has `client_id_metadata_document_supported: true` **and** `"none"` in `token_endpoint_auth_methods_supported`; otherwise DCR (needs `registration_endpoint`). DCR registers a new client on every fresh connection | **Prefers CIMD**; DCR once per connection otherwise |
| Redirect URI | Registered, exact match; `localhost` or HTTPS | `https://claude.ai/api/mcp/auth_callback` (may move to `https://claude.com/api/mcp/auth_callback`); Claude Code: loopback `http://localhost:<any>/callback` and `http://127.0.0.1:<any>/callback`, port-agnostic | `https://chatgpt.com/connector_platform_oauth_redirect` when the AS supports RFC 9207; `https://chatgpt.com/connector/oauth/{callback_id}` otherwise |
| PKCE | MUST, S256; `code_challenge_methods_supported` required | S256 on every request | S256; servers without `code_challenge_methods_supported` are unsupported |
| `resource` (RFC 8707) | Clients MUST send it; servers MUST check the audience | Sent | Sent on authorization and token requests; copy it into the token audience |
| Issuer in response (RFC 9207) | (not required) | (not mentioned) | `authorization_response_iss_parameter_supported: true` and `iss` in every response, exact match, or the response is rejected |
| Scopes | `scope` in the 401 challenge, else `scopes_supported` | Same; appends `offline_access` when the AS lists it | Requests advertised OIDC scopes by default |
| Refresh | Public clients: rotate refresh tokens | Refreshes on 401 and up to 5 min before expiry; rotate for public clients; `invalid_grant` when dead | Normal expiry and rotation |
| Token endpoint | | `application/x-www-form-urlencoded`; **10 s** limit (30 s for refresh), also for discovery and registration | `none` or `private_key_jwt` for CIMD |
| Where calls come from | | Anthropic servers, `160.79.104.0/21` | OpenAI servers; mTLS client certificate and published egress ranges |

**Origin header.** Neither host's documentation says whether requests to `/mcp` carry an `Origin` header. Calls come from their servers, so most likely not. Section B3 of the coach specification refuses any request with an `Origin` unless it is allow-listed: keep the rule, check it in the host tests (phase O5), and allow-list only what a real host sends.

**Consequence.** One server design serves both hosts: CIMD with public clients, DCR as a fallback, PKCE S256, `resource` binding, RFC 9207 `iss`, refresh rotation, a 401 challenge. No host-specific code path is needed.

---

## 2. What the server implements

### 2.1 Discovery

- **401 challenge on `/mcp`.** The `/mcp` chain answers a missing or invalid token with
  `WWW-Authenticate: Bearer resource_metadata="https://api.pianoml.org/.well-known/oauth-protected-resource/mcp", scope="practice:read scores:read player:control"`.
  An insufficient scope stays a tool result (`FORBIDDEN_SCOPE`), not an HTTP 403: tools are listed to every grant and refused per call, which a step-up flow does not improve.
- **Protected resource metadata (RFC 9728)** at `/.well-known/oauth-protected-resource/mcp` and at `/.well-known/oauth-protected-resource`:
  `resource: "https://api.pianoml.org/mcp"`, `authorization_servers: ["https://api.pianoml.org"]`, `scopes_supported: ["practice:read", "scores:read", "player:control"]`, `bearer_methods_supported: ["header"]`.
- **Authorization server metadata (RFC 8414)** at `/.well-known/oauth-authorization-server`:
  `issuer: "https://api.pianoml.org"`, `authorization_endpoint: …/oauth/authorize`, `token_endpoint: …/oauth/token`, `registration_endpoint: …/oauth/register`, `revocation_endpoint: …/oauth/revoke`, `response_types_supported: ["code"]`, `grant_types_supported: ["authorization_code", "refresh_token"]`, `code_challenge_methods_supported: ["S256"]`, `token_endpoint_auth_methods_supported: ["none"]`, `client_id_metadata_document_supported: true`, `authorization_response_iss_parameter_supported: true`, `scopes_supported: ["practice:read", "scores:read", "player:control", "offline_access"]`.
  No OIDC discovery: PianoML issues no ID tokens.

The canonical resource is `https://api.pianoml.org/mcp` (no trailing slash): the Connect page shows exactly that URL, because Claude compares `resource` with what the user typed.

### 2.2 Clients

Public clients only (`token_endpoint_auth_method: none`, PKCE). No client secrets to store or leak.

**CIMD** (client id is an HTTPS URL):

- Fetch the document when an unknown URL-shaped `client_id` arrives; cache it per `Cache-Control`, at most 24 hours.
- SSRF guard: HTTPS only, port 443, no redirects, a public address only (resolve the host and refuse loopback, private, link-local and metadata ranges, also after resolution), 5 s timeout, 16 KB maximum.
- Check: valid JSON; `client_id` equals the URL exactly; `client_name` and `redirect_uris` present; the requested `redirect_uri` is in `redirect_uris` (loopback rule below).
- Trust policy: open (any HTTPS client id), because the coach is meant for any host. The consent page shows the client id's host prominently; hosts of a short "known" list (`claude.ai`, `chatgpt.com`) get a "known application" label, any other host a neutral one. The list is presentation, never a security boundary.

**DCR** (RFC 7591), the fallback both hosts use when CIMD is missing:

- Open registration (no initial access token: hosts register without user interaction). Spring's endpoint requires one by default (`setOpenRegistrationAllowed(true)` would change that), which is one reason for section 5.
- Accept only `token_endpoint_auth_method: none`, `grant_types` ⊆ {authorization_code, refresh_token}, `response_types: ["code"]`, redirect URIs that are HTTPS or loopback, at most 5 of them, `client_name` at most 80 characters.
- Rate limit per IP (registration is unauthenticated). Delete clients that never completed an authorization within 24 hours, and clients unused for 90 days: Claude registers a new client on every fresh connection.

**Redirect URIs.** Exact match against the registered list, except loopback: `http://localhost` and `http://127.0.0.1` match with the port ignored (RFC 8252 §7.3; Claude Code needs both).

### 2.3 Authorization and consent

The session cookie is `HttpOnly; Secure; SameSite=Strict`, host-only on `api.pianoml.org` (fact 10 of the coach specification). The browser **does not send it** on the top-level navigation that arrives from `claude.ai` or `chatgpt.com`: a cross-site request. An authorization endpoint that looked for the cookie would see every user as logged out. Hence two steps:

1. **`GET /oauth/authorize`** (API host, no session expected). Validates `response_type=code`, `client_id` (CIMD fetch or DCR row), `redirect_uri`, `code_challenge` with `code_challenge_method=S256`, `resource` = the canonical resource, `scope` ⊆ supported (`offline_access` accepted and ignored), `state` present.
   - Until `client_id` and `redirect_uri` are validated, an error is an HTML error page on PianoML, never a redirect (no open redirect).
   - After that, errors redirect to `redirect_uri` with `error`, `state` and `iss`.
   - On success: store the request server side (`coach_oauth_request`, random id, 10 minutes, every validated parameter) and redirect to the SPA: `https://www.pianoml.org/coach/authorize?request=<id>`.
2. **Consent page `/coach/authorize`** (SPA, same site as the API: the cookie travels again on its XHR calls).
   - Not logged in: the normal login, back here through `return-url.ts`.
   - `GET /oauth/requests/{id}` (session) returns what to show: client name, client id host (or "self-declared name, unverified" for a DCR client), the redirect URI's host, the scopes with one line each, and a warning when the only redirect URIs are loopback ones.
   - Approve or refuse: `POST /oauth/requests/{id}/decision` (session + CSRF), body `{ approve, scopes }` where `scopes` may narrow the request. The answer is `{ redirectUrl }`: `redirect_uri?code=…&state=…&iss=https://api.pianoml.org`, or `?error=access_denied&state=…&iss=…`. The SPA navigates there.
   - The request id is single use, bound to the user who decides, and expires.

**Authorization code.** 32 random bytes; stored hashed; 60 seconds; single use; bound to the client, the redirect URI, the PKCE challenge, the resource, the granted scopes and the user. A second use revokes what the first one produced.

**Clickjacking.** The consent page sends `Content-Security-Policy: frame-ancestors 'none'` (the SSR server sets it for this route).

### 2.4 Tokens

- **Token endpoint** `POST /oauth/token`, `application/x-www-form-urlencoded`, public clients (`client_id` in the body, no secret).
  - `authorization_code`: checks `code`, `redirect_uri`, `client_id`, `code_verifier` against the S256 challenge, `resource`. Creates the `coach_grant` row (kind `oauth`, `name` = the client name, scopes = granted, `expires_at` = consent date + 365 days), then an access token and a refresh token.
  - `refresh_token`: rotation. The used refresh token is marked used and a new pair is returned in the same response. A refresh token used twice means theft: the grant is revoked (all its tokens die) and `invalid_grant` is returned.
  - Errors follow RFC 6749 (`invalid_grant`, `invalid_client`, `invalid_request`), JSON body, `Cache-Control: no-store`.
- **Access token.** Opaque, stored hashed, **1 hour**, bound to the grant and the resource. Format `pmo_<tokenId>_<secret>` (same shape as `pml_`, its own prefix so the two kinds are told apart and scanners can recognize both).
- **Refresh token.** Opaque, stored hashed, 60 days, rotated on each use (so an active connection never expires before the grant's 365 days).
- **Revocation** `POST /oauth/revoke` (RFC 7009) for clients; users revoke on the account page as today.
- **On `/mcp`.** `GrantAuthenticationFilter` accepts `pml_` (personal) and `pmo_` (OAuth access) tokens. For `pmo_` it checks expiry, the grant (not revoked, not expired) and the audience (`resource` = canonical), then builds the same `GrantPrincipal`.

### 2.5 Grants

- One live OAuth grant per (user, client id). A new consent for the same client revokes the previous grant: the Claude web, Desktop and mobile apps share one client and would otherwise pile up grants.
- OAuth grants and personal tokens have separate limits (5 each), so connecting an application never requires revoking a personal token.
- The account page lists OAuth grants beside personal tokens: client name, client host, scopes, last use, the same Revoke button. Revoking kills the access and refresh tokens at once.
- Password reset (when it exists) and account deletion revoke or delete them, as for personal tokens.

---

## 3. Data model (Liquibase)

```
coach_oauth_client   client_id varchar(500) pk, kind ('cimd' | 'dcr'), client_name varchar(80),
                     redirect_uris text (JSON), metadata_fetched_at, metadata_expires_at,
                     created_at, last_used_at
coach_oauth_request  id char(64) pk (hash of the request id), client_id, redirect_uri, code_challenge,
                     scopes, resource, state varchar(500), user_id null, created_at, expires_at
coach_oauth_code     code_hash char(64) pk, client_id, redirect_uri, code_challenge, scopes, resource,
                     user_id fk cascade, created_at, expires_at, used_at, grant_id null
coach_oauth_token    token_hash char(64) pk, grant_id fk coach_grant cascade, kind ('access' | 'refresh'),
                     client_id, resource, created_at, expires_at, used_at, replaced_by null
coach_grant          + client_id varchar(500) null (OAuth grants)
```

Every table is cleaned daily (expired requests and codes, used and expired tokens, unused clients), the way the other coach jobs are.

---

## 4. Endpoints and security chains

| Endpoint | Chain | Authentication |
|---|---|---|
| `/.well-known/oauth-protected-resource`, `…/mcp`, `/.well-known/oauth-authorization-server` | main, explicit `permitAll` GET matchers | none; CORS `*` (browser-based MCP tools read them) |
| `GET /oauth/authorize` | new OAuth chain | none |
| `POST /oauth/token`, `POST /oauth/register`, `POST /oauth/revoke` | new OAuth chain | none (public clients); no CSRF (no cookie is read); rate-limited |
| `GET /oauth/requests/{id}`, `POST /oauth/requests/{id}/decision` | main chain | cookie session; CSRF on the POST |
| `/mcp/**` | existing `/mcp` chain | `pml_` or `pmo_` bearer; 401 with the challenge |

The OAuth chain (`/oauth/authorize`, `/oauth/token`, `/oauth/register`, `/oauth/revoke`) reads no cookie at all, like the `/mcp` chain: these endpoints must work without the session and must never be turned into a session.

**Latency.** Claude gives discovery, registration and token endpoints 10 seconds. With `spring.main.lazy-initialization=true` the first request to a new instance builds beans on the way: the OAuth components are created eagerly (`@Lazy(false)`), and the metadata documents are static.

**Network.** The well-known paths and the OAuth endpoints must be reachable from `160.79.104.0/21` (Anthropic) and OpenAI's ranges: check that nothing at the edge (rate limiting, bot protection) blocks server-to-server calls without a browser.

---

## 5. Library: Spring authorization server or purpose-built endpoints

Spring Security 7 now contains the former Spring Authorization Server: authorization code with PKCE, opaque (`OAuth2TokenFormat.REFERENCE`) tokens, RFC 7591 registration (disabled by default; open registration needs `setOpenRegistrationAllowed(true)`), RFC 8414 metadata with a customizer, a custom `consentPage`, JDBC stores (`JdbcRegisteredClientRepository`, `JdbcOAuth2AuthorizationService`).

**Recommendation: purpose-built endpoints**, small and on top of the coach tables, for these reasons:

1. **CIMD is required in practice** (ChatGPT prefers it, Claude uses it when advertised, and avoids a DCR client per connection). The Spring reference does not list it; it would be a custom `RegisteredClientRepository` that fetches documents, which is most of the client work anyway.
2. **The login and consent step does not fit.** Spring's authorization endpoint expects an authenticated principal when the request arrives and redirects to a login page otherwise. The PianoML session never arrives on that request (section 2.3), and the backend is stateless across several instances. The two-step flow (store the request, consent in the SPA, decision by API) would have to be rebuilt around Spring's filters.
3. **Two token stores.** Spring keeps its own `oauth2_authorization` and client tables; the coach keeps `coach_grant`, which the account page, the `/mcp` chain and the audit already use. Bridging them adds a mapping layer for no gain.
4. **Small surface.** Five endpoints, public clients only, one resource, S256 only, opaque tokens: a few hundred lines with thorough tests. RFC 8707 audience binding and RFC 9207 `iss` are explicit in this design; the Spring overview page mentions neither.

To check before deciding (a half-day spike): whether Spring 7.x supports RFC 9207 `iss` and RFC 8707 `resource` out of the box, and whether its authorization request can be persisted without an HTTP session. If both are yes, reconsider Spring for the code and token endpoints only, keeping the custom request and consent flow.

Risks of building it: getting PKCE, code single use or refresh rotation wrong. Mitigations: tests per RFC rule, test vectors (RFC 7636 appendix B), and a run of an OAuth conformance tool against staging before release.

---

## 6. What stays as it is

Scopes, `GrantPrincipal`, the `/mcp` chain rules (no cookie, `Origin` refused unless allow-listed), the dispatcher, the audit, the rate limits, the Remote coach bridge, personal access tokens.

---

## 7. Open questions

1. **Trust policy for CIMD:** open (any HTTPS client id, recommended) or an allowlist of known hosts?
2. **Connector directory:** listing PianoML in Claude's directory could use Anthropic-held client credentials (a confidential client). Out of scope here; the public-client design does not prevent it later.
3. **Consent host:** `www.pianoml.org/coach/authorize`. The SPA must be the same site as the API for the cookie to travel (it is: `*.pianoml.org`).
4. **Grant lifetime:** 365 days with re-consent, or no absolute limit while refresh tokens keep rotating?

---

## 8. Implementation plan

Five phases, each one issue and one pull request, in the format of section 7 of the coach specification (common rules apply).

### Phase O1. Discovery and the 401 challenge

Build: the two metadata documents (2.1) as static JSON from configuration (`coach.oauth.issuer`, `coach.oauth.resource`); the `WWW-Authenticate` challenge on 401 from the `/mcp` chain; CORS `*` on the well-known paths only.
Tests: documents served at the three paths with every field of 2.1; an anonymous `/mcp` call gets 401 with the exact challenge; a `pml_` token still works; the well-known paths need no authentication and answer without a session; `resource` has no trailing slash.

### Phase O2. Clients

Build: `coach_oauth_client`; CIMD fetcher with the SSRF guard and cache; open DCR with its validation and rate limit; daily cleanup.
Tests: CIMD accepted, cached, refreshed; refused for HTTP, redirects, private and loopback addresses (also after DNS resolution), oversize, timeout, `client_id` mismatch, missing fields; DCR accepted, refused for confidential methods, bad redirect URIs, more than 5, rate limit; loopback port-agnostic match for both `localhost` and `127.0.0.1`; unused clients deleted.

### Phase O3. Authorization and consent

Build: `GET /oauth/authorize`, `coach_oauth_request`, the HTML error page, `GET /oauth/requests/{id}`, `POST /oauth/requests/{id}/decision`, `coach_oauth_code`; SPA consent page `/coach/authorize` (lazy, noindex, rendered in the browser, `frame-ancestors 'none'`), login round trip, translations.
Tests: every validation of 2.3 with the right outcome (page before `redirect_uri` is trusted, redirect after), `iss` and `state` on every redirect; request single use, bound to the deciding user, expiry; refusal gives `access_denied`; narrowed scopes; frontend: renders client host, redirect host and scopes, loopback warning, unverified label, login round trip, approve and refuse navigate to the returned URL.

### Phase O4. Tokens

Build: `POST /oauth/token` (code with PKCE and `resource`, refresh with rotation and reuse detection), `pmo_` access tokens, `coach_oauth_token`, `POST /oauth/revoke`; `GrantAuthenticationFilter` accepts `pmo_`; one live grant per (user, client); account page lists OAuth grants.
Tests: RFC 7636 test vectors; wrong verifier, wrong redirect URI, wrong client, wrong resource, expired or reused code (the reuse revokes the grant); form-urlencoded only; refresh returns a new pair and the old token dies; a reused refresh token revokes the grant and answers `invalid_grant`; a `pmo_` token works on `/mcp` with the grant's scopes, is refused when expired, revoked or of another audience; revoking on the account page kills the tokens at once; a new consent for the same client replaces the old grant; the endpoints answer well under 10 s on a cold instance.

### Phase O5. Real hosts (verification)

With a staging deployment: connect the Claude apps (custom connector by URL), Claude Code (CIMD with a loopback redirect), and ChatGPT (developer mode connector), plus the MCP Inspector. For each, record: the client identification it used, the redirect URI, whether `/mcp` requests carry an `Origin` header, the refresh behavior, and the time each endpoint took. Fix what differs from this design without special-casing a host, update the coach specification and `docs/coach-mcp-setup.md` (an "Add PianoML to Claude" and an "Add PianoML to ChatGPT" section), and add the coach prompts check: `coach_start` pasted in each host calls `get_context`.

Done when all four hosts connect, use the tools, survive a token refresh, and lose access when the grant is revoked on the account page.
